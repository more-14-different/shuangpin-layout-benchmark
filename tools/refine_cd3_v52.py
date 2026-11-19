"""Bounded, deterministic refinement of cd3 under its original load/M/D caps."""
import concurrent.futures
import copy
import gzip
import hashlib
import json
from pathlib import Path
import time

import numpy as np
from enumerate_f19_v52_policies import competition,load_tables,ROOT,KINDS
from search_cr_667_zero_carriers import CarrierSpace
from search_cr_lan_aeo_heads import head_moves,compensated_head_moves
from search_cr_lan_f19_combined import group_exchanges,root_exchanges,single_root_moves
from prepare_cr_m24_portfolio import make_layout

PREFIX=ROOT/'research/notes/2026-11-19-cd3-refinement'
WORK=ROOT/'research/.cache/cd3-refinement'
OLD=ROOT/'research/notes/2026-11-19-1f9-remove-p'
POLICY=dict(word2='21',word3='231',word4='14')


def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class FixedScorer:
    def __init__(self):
        self.rows=np.fromfile(ROOT/'research/.cache/f19-v52-audit/policy-templates.bin',np.int32).reshape(-1,11)
        self.motor=load_tables(ROOT/'tools/ckt_v4_upstream_role_tables.json','tables')
        self.errors=load_tables(ROOT/'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json','errorTables')
        reference=read(ROOT/'research/notes/2026-11-18-ckt-v52-all-schemes.json')['references']['v52']['keytao']
        self.ref=np.array([[reference[k]['motorUpperMs'],
            300*sum(reference[k][f] for f in ['firstAuxRate','secondAuxRate','thirdAuxRate'])+
            600*reference[k]['selectionRate']+50*reference[k]['meanRejectedCandidates']+300*reference[k]['meanPageActions']] for k in KINDS])
        self.orders=np.array([[0,1,0],[1,0,0],[1,2,0],[0,3,0]],np.int64)

    def score(self,row):
        state=row['state'];keys=state['firstKeys']+[r[g] for r in state['groupKeys'] for g in state['partition']]
        physical=np.array([ord(k)-65 for k in keys],np.int64)
        totals,weights,*_=competition(self.rows,physical,self.orders,15,self.motor,self.errors)
        v=totals/weights[:,None];cog=300*v[:,1:4].sum(axis=1)+600*v[:,4]+50*v[:,5]+300*v[:,6]
        scores=[float(10*np.average(((v[:,0]+n*cog)/(self.ref[:,0]+n*self.ref[:,1]))**4,weights=[1,3,1,1])**.25) for n in [1,2]]
        row['metrics'].update(cktV52=scores[0],doubledV52=scores[1],
            pinky=float(max(totals[:,8]/totals[:,7])),rightPinky=float(max(totals[:,9]/totals[:,7])))
        return row


def main():
    WORK.mkdir(parents=True,exist_ok=True);space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
    source=read(str(OLD)+'-candidates.json');anchor=next(r for r in source['layouts'] if r['id']=='cd3cc7adfe')
    baseline_state=anchor['state'];scorer=FixedScorer()
    baseline=scorer.score(dict(key=anchor['key'],state=baseline_state,metrics=space.memory(baseline_state),label='cd3 baseline'))
    for field,expected in [('cktV52',9.134662504761415),('doubledV52',8.862890058446062)]:
        if abs(baseline['metrics'][field]-expected)>1e-9:raise ValueError('cd3 anchor mismatch '+field)
    limits=dict(maxM=22,maxGuard=24,maxD=2,leftPinky=baseline['metrics']['pinky'],rightPinky=baseline['metrics']['rightPinky'])
    names={a['name']:i for i,a in enumerate(space.f['atoms'])};retro=[names[x] for x in ['zh','ch','sh']]
    archive_path=Path(str(OLD)+'-scores.json.gz')
    previous_summary=read(str(OLD)+'-summary.json')
    if sha(archive_path)!=previous_summary['sourceHashes'][archive_path.relative_to(ROOT).as_posix()]:raise ValueError('old search archive changed')
    cache=json.loads(gzip.decompress(archive_path.read_bytes()));imported=set(cache)
    cache[baseline['key']]=baseline
    stages=[];started=time.monotonic()

    def physical_ok(state):
        m=space.memory(state)
        if not m or m['m']>22 or m['guard']>24 or m['d']>2:return None
        if any(state['firstKeys'][i]=='P' for i in retro):return None
        if len({state['firstKeys'][names['zero-'+n]] for n in 'AEO'})!=1:return None
        return m

    def loads_ok(row):
        return row['metrics']['pinky']<=limits['leftPinky']+1e-12 and row['metrics']['rightPinky']<=limits['rightPinky']+1e-12

    def save():
        (WORK/'cache.json.gz').write_bytes(gzip.compress(json.dumps(cache,separators=(',',':')).encode(),mtime=0))
        (WORK/'stages.json').write_text(json.dumps(stages,indent=2)+'\n',encoding='utf-8')

    def batch(moves,name):
        pending={}
        for label,state in moves:
            m=physical_ok(state)
            if not m:continue
            key=space.key(state)
            if key not in cache and key not in pending:pending[key]=dict(key=key,state=state,metrics=m,label=label,stage=name)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            for row in executor.map(scorer.score,pending.values()):cache[row['key']]=row
        pool=[r for r in cache.values() if loads_ok(r)]
        stage=dict(name=name,fresh=len(pending),newTotal=len(set(cache)-imported),
            bestDefault=min(pool,key=lambda r:r['metrics']['cktV52'])['key'][:10],
            bestDoubled=min(pool,key=lambda r:r['metrics']['doubledV52'])['key'][:10],elapsed=time.monotonic()-started)
        stages.append(stage);save();print(json.dumps(stage),flush=True)

    def local_rhymes(state):
        for function in [group_exchanges,root_exchanges,single_root_moves]:yield from function(state)
        for region,spec in enumerate(space.f['toneRegions']):
            for group,old in enumerate(state['groupKeys'][region]):
                for key in spec['keys']:
                    if key==old:continue
                    st=copy.deepcopy(state);st['groupKeys'][region][group]=key
                    yield f'key:{region}/{group}:{old}>{key}',st

    for ident in ['84a5beb5b1','f89a91f7a5']:
        row=next(r for r in source['layouts'] if r['id']==ident)
        if row['key'] not in cache:cache[row['key']]=scorer.score(dict(key=row['key'],state=row['state'],metrics=space.memory(row['state']),label='previous control '+ident))
    seeds=[anchor,next(r for r in source['layouts'] if r['id']=='84a5beb5b1')]
    batch(((r['id']+'/'+label,state) for r in seeds for label,state in local_rhymes(r['state'])),'two-seed-rhyme-neighborhood')

    def centers(limit=5):
        pool=[r for r in cache.values() if loads_ok(r)]
        selected={baseline['key']:baseline}
        for field,other in [('doubledV52','cktV52'),('cktV52','doubledV52')]:
            for allowance in [0,.002,.01]:
                subset=[r for r in pool if r['metrics'][other]<=baseline['metrics'][other]+allowance]
                if subset:
                    r=min(subset,key=lambda r:r['metrics'][field]);selected[r['key']]=r
        for field in ['cktV52','doubledV52']:
            low=[r for r in pool if r['metrics']['m']<=21]
            if low:
                r=min(low,key=lambda r:r['metrics'][field]);selected[r['key']]=r
        chosen=sorted(selected.values(),key=lambda r:r['metrics']['doubledV52'])[:limit]
        return chosen

    for iteration in range(2):
        selected=centers()
        batch(((r['key'][:10]+'/'+label,state) for r in selected for label,state in local_rhymes(r['state'])),f'rhyme-descent-{iteration+1}')
    batch(((r['key'][:10]+'/'+label,state) for r in centers(4) for f in [head_moves,compensated_head_moves]
        for label,state in f(r['state'],space)),'onset-compensation')
    batch(((r['key'][:10]+'/'+label,state) for r in centers(4) for label,state in local_rhymes(r['state'])),'final-rhyme-polish')

    pool=[r for r in cache.values() if loads_ok(r)]
    selected={baseline['key']:baseline}
    # Preserve the actual tradeoff surface close to cd3, without selecting on
    # the retired geometric score or hiding default-cost regressions.
    for ceiling in [baseline['metrics']['cktV52'],baseline['metrics']['cktV52']+.002,
                    baseline['metrics']['cktV52']+.01,baseline['metrics']['cktV52']+.03]:
        eligible=[r for r in pool if r['metrics']['cktV52']<=ceiling+1e-12]
        for row in sorted(eligible,key=lambda r:r['metrics']['doubledV52'])[:2]:selected[row['key']]=row
    for field in ['cktV52','doubledV52']:
        for row in sorted(pool,key=lambda r:r['metrics'][field])[:2]:selected[row['key']]=row
        low=[r for r in pool if r['metrics']['m']<=21]
        if low:
            row=min(low,key=lambda r:r['metrics'][field]);selected[row['key']]=row
    selected.update({r['key']:r for r in centers(8)})
    layouts=[]
    for row in selected.values():
        layout=make_layout(space,row['state'],dict(ckt=0),source['tokenKeys'],row['key'][:10]);layout.pop('rustScore')
        layout.update(wordAuxiliaryPolicy=POLICY,searchMetrics=row['metrics'],searchLabel=row['label'])
        layouts.append(layout)
    for ident in ['1f9e267cd2','f19a0ad1dc','17983edeb8','current-production']:
        row=next(r for r in source['layouts'] if r['id']==ident)
        if row['id'] not in {r['id'] for r in layouts}:layouts.append(copy.deepcopy(row))
    new_rows={k:r for k,r in cache.items() if k not in imported}
    payload=dict(version='cd3-bounded-refinement-v1',tokenKeys=source['tokenKeys'],firstAtomNames=source['firstAtomNames'],
        layouts=layouts,baseline=baseline,constraints=limits,searchPolicy=POLICY,searchStages=stages,
        importedArchiveSha256=sha(archive_path),importedStates=len(imported),newStates=len(new_rows),
        productionBaselineFrozen=True,auditAllLayouts=True,elapsedSeconds=time.monotonic()-started,
        sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in [Path(__file__),Path(str(OLD)+'-candidates.json'),archive_path]},
        scope='Finite exact local rhyme-key/group/root neighborhoods from cd3 and its retroflex-swap neighbour, then endpoint-valid compensated onsets and rhyme polish; reuse prior fixed-policy scores. Not a global optimum claim.')
    Path(str(PREFIX)+'-candidates.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    Path(str(PREFIX)+'-scores.json.gz').write_bytes(gzip.compress(json.dumps(new_rows,separators=(',',':')).encode(),mtime=0))
    print('finished',len(new_rows),'new states;',len(layouts),'finalists',flush=True)
    for row in sorted(selected.values(),key=lambda r:r['metrics']['doubledV52']):print(row['key'][:10],row['metrics'],flush=True)


if __name__=='__main__':main()
