"""Finite M21 refinement of 9f, retaining explicit ergonomic tradeoffs."""
import concurrent.futures
import copy
import gzip
import itertools
import json
from pathlib import Path
import time

import numpy as np
from refine_cd3_v52 import ROOT,FixedScorer,read,sha,POLICY
from enumerate_f19_v52_policies import competition
from f19_v52_ergonomics import FINGER
from search_cr_667_zero_carriers import CarrierSpace
from search_cr_lan_aeo_heads import head_moves,compensated_head_moves
from search_cr_lan_f19_combined import group_exchanges,root_exchanges,single_root_moves
from prepare_cr_m24_portfolio import make_layout

PREFIX=ROOT/'research/notes/2026-11-19-9f-refinement'
OLD=ROOT/'research/notes/2026-11-19-cd3-refinement'
WORK=ROOT/'research/.cache/9f-refinement'
BASE='9f0408d0e5'


class LoadScorer(FixedScorer):
    def score(self,row):
        state=row['state'];keys=state['firstKeys']+[r[g] for r in state['groupKeys'] for g in state['partition']]
        physical=np.array([ord(k)-65 for k in keys],np.int64)
        totals,weights,_,loads,transitions=competition(self.rows,physical,self.orders,15,self.motor,self.errors,True)
        v=totals/weights[:,None];cog=300*v[:,1:4].sum(axis=1)+600*v[:,4]+50*v[:,5]+300*v[:,6]
        scores=[float(10*np.average(((v[:,0]+n*cog)/(self.ref[:,0]+n*self.ref[:,1]))**4,weights=[1,3,1,1])**.25) for n in [1,2]]
        finger=np.zeros((4,10))
        for key,index in FINGER.items():finger[:,index]+=loads[:,ord(key)-65]
        row['metrics'].update(cktV52=scores[0],doubledV52=scores[1],
            pinky=float(max(totals[:,8]/totals[:,7])),rightPinky=float(max(totals[:,9]/totals[:,7])),
            maxFinger=float(np.max(finger/loads.sum(axis=1)[:,None])),
            sameFingerOther=float(transitions[0,1]/transitions[0,0]))
        return row


def local_rhymes(state,space):
    for function in [group_exchanges,root_exchanges,single_root_moves]:yield from function(state)
    for region,spec in enumerate(space.f['toneRegions']):
        for group,old in enumerate(state['groupKeys'][region]):
            for key in spec['keys']:
                if key==old:continue
                st=copy.deepcopy(state);st['groupKeys'][region][group]=key
                yield f'key:{region}/{group}:{old}>{key}',st


def paired_region_keys(state,space):
    """Two distinct groups in one tone region, with endpoint budgets checked later."""
    for region,spec in enumerate(space.f['toneRegions']):
        for a,b in itertools.combinations(range(10),2):
            old_a,old_b=state['groupKeys'][region][a],state['groupKeys'][region][b]
            for ka,kb in itertools.product(spec['keys'],repeat=2):
                if ka==old_a or kb==old_b:continue
                st=copy.deepcopy(state);st['groupKeys'][region][a]=ka;st['groupKeys'][region][b]=kb
                yield f'paired-region:{region}/{a},{b}:{old_a}{old_b}>{ka}{kb}',st


def root_and_region_key(state,space):
    """Move an intact root and one group key, judging only the joint endpoint."""
    for label,moved in single_root_moves(state):
        if not space.memory(moved):continue
        for region,spec in enumerate(space.f['toneRegions']):
            for group,old in enumerate(moved['groupKeys'][region]):
                for key in spec['keys']:
                    if old==key:continue
                    st=copy.deepcopy(moved);st['groupKeys'][region][group]=key
                    yield f'{label}/key:{region}/{group}:{old}>{key}',st


def main():
    WORK.mkdir(parents=True,exist_ok=True);space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
    source=read(str(OLD)+'-candidates.json');anchor=next(r for r in source['layouts'] if r['id']==BASE)
    scorer=LoadScorer();baseline=scorer.score(dict(key=anchor['key'],state=anchor['state'],metrics=space.memory(anchor['state']),label=BASE+' baseline'))
    for field,value in [('cktV52',9.13380694292176),('doubledV52',8.862629028119834)]:
        if abs(baseline['metrics'][field]-value)>1e-9:raise ValueError('9f anchor mismatch '+field)
    limits=dict(maxM=21,maxGuard=24,maxD=2,**{k:baseline['metrics'][k] for k in ['pinky','rightPinky','maxFinger','sameFingerOther']})
    names={a['name']:i for i,a in enumerate(space.f['atoms'])}
    archives=[ROOT/'research/notes/2026-11-19-1f9-remove-p-scores.json.gz',Path(str(OLD)+'-scores.json.gz')]
    cache={}
    for archive in archives:
        summary=read(str(archive).replace('-scores.json.gz','-summary.json'))
        if sha(archive)!=summary['sourceHashes'][archive.relative_to(ROOT).as_posix()]:raise ValueError('historical archive changed')
        cache.update(json.loads(gzip.decompress(archive.read_bytes())))
    imported=set(cache);cache[baseline['key']]=baseline;stages=[];started=time.monotonic()

    def physical_ok(state):
        m=space.memory(state)
        if not m or m['m']>21 or m['guard']>24 or m['d']>2:return None
        if any(state['firstKeys'][names[n]]=='P' for n in ['zh','ch','sh']):return None
        if len({state['firstKeys'][names['zero-'+n]] for n in 'AEO'})!=1:return None
        return m

    def admissible(row):
        m=row['metrics']
        return m['m']<=21 and m['guard']<=24 and m['d']<=2 and physical_ok(row['state']) and m['pinky']<=limits['pinky']+1e-12 and m['rightPinky']<=limits['rightPinky']+1e-12

    def ergonomic(row):
        m=row['metrics']
        return 'maxFinger' in m and m['maxFinger']<=limits['maxFinger']+1e-12 and m['sameFingerOther']<=limits['sameFingerOther']+1e-12

    def near(row):
        return row['metrics']['cktV52']<=baseline['metrics']['cktV52']+.025 or row['metrics']['doubledV52']<=baseline['metrics']['doubledV52']+.015

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
            warm=[r for r in cache.values() if admissible(r) and near(r) and 'maxFinger' not in r['metrics']]
            for row in executor.map(scorer.score,warm):cache[row['key']]=row
        pool=[r for r in cache.values() if admissible(r)]
        strict=[r for r in pool if ergonomic(r)]
        stage=dict(name=name,fresh=len(pending),ergonomicReplays=len(warm),newTotal=len(set(cache)-imported),
            bestDefault=min(pool,key=lambda r:r['metrics']['cktV52'])['key'][:10],
            bestDoubled=min(pool,key=lambda r:r['metrics']['doubledV52'])['key'][:10],
            strictBestDoubled=min(strict,key=lambda r:r['metrics']['doubledV52'])['key'][:10],elapsed=time.monotonic()-started)
        stages.append(stage);save();print(json.dumps(stage),flush=True)

    def centers(limit=8):
        pool=[r for r in cache.values() if admissible(r) and near(r)]
        chosen={baseline['key']:baseline}
        for restricted in [True,False]:
            subset=[r for r in pool if not restricted or ergonomic(r)]
            for field,other in [('doubledV52','cktV52'),('cktV52','doubledV52')]:
                for slack in [0,.003,.015]:
                    eligible=[r for r in subset if r['metrics'][other]<=baseline['metrics'][other]+slack]
                    if eligible:
                        r=min(eligible,key=lambda r:r['metrics'][field]);chosen[r['key']]=r
            # Also expand a few close losers; repeatedly choosing the global
            # winner alone would never cross a shallow two-step barrier.
            others=[r for r in subset if r['key']!=baseline['key']]
            for field in ['cktV52','doubledV52']:
                for r in sorted(others,key=lambda r:r['metrics'][field])[:2]:chosen[r['key']]=r
        return list(chosen.values())[:limit]

    batch(local_rhymes(anchor['state'],space),'9f-rhyme-neighborhood')
    for iteration in range(2):
        batch(((r['key'][:10]+'/'+label,st) for r in centers() for label,st in local_rhymes(r['state'],space)),f'rhyme-descent-{iteration+1}')
    batch(((r['key'][:10]+'/'+label,st) for r in centers(6) for f in [head_moves,compensated_head_moves] for label,st in f(r['state'],space)),'onset-compensation')
    batch(root_and_region_key(anchor['state'],space),'joint-root-region-key')
    # Paired endpoint edits can pass through a temporarily over-budget intermediate.
    batch(((r['key'][:10]+'/'+label,st) for r in centers(3) for label,st in paired_region_keys(r['state'],space)),'paired-region-keys')
    for iteration in range(2):
        batch(((r['key'][:10]+'/'+label,st) for r in centers() for label,st in local_rhymes(r['state'],space)),f'final-rhyme-polish-{iteration+1}')

    selected={r['key']:r for r in centers(12)}
    pool=[r for r in cache.values() if admissible(r)]
    for restricted in [True,False]:
        subset=[r for r in pool if not restricted or ergonomic(r)]
        both=[r for r in subset if all(r['metrics'][f]<=baseline['metrics'][f]+1e-12 for f in ['cktV52','doubledV52'])]
        for field in ['cktV52','doubledV52']:
            for sub in [subset,both]:
                if sub:
                    r=min(sub,key=lambda r:r['metrics'][field]);selected[r['key']]=r
            fresh=[r for r in subset if r['key'] not in imported]
            for r in sorted(fresh,key=lambda r:r['metrics'][field])[:2]:selected[r['key']]=r
    layouts=[]
    for row in selected.values():
        layout=make_layout(space,row['state'],dict(ckt=0),source['tokenKeys'],row['key'][:10]);layout.pop('rustScore')
        layout.update(wordAuxiliaryPolicy=POLICY,searchMetrics=row['metrics'],searchLabel=row['label']);layouts.append(layout)
    for ident in ['cd3cc7adfe','f19a0ad1dc','1f9e267cd2','7af2f757e3','current-production']:
        row=next(r for r in source['layouts'] if r['id']==ident)
        if ident not in {r['id'] for r in layouts}:layouts.append(copy.deepcopy(row))
    new_rows={k:r for k,r in cache.items() if k not in imported}
    paths=[Path(__file__),ROOT/'tools/refine_cd3_v52.py',Path(str(OLD)+'-candidates.json')]+archives
    payload=dict(version='9f-bounded-refinement-v1',tokenKeys=source['tokenKeys'],firstAtomNames=source['firstAtomNames'],
        layouts=layouts,baseline=baseline,constraints=limits,searchPolicy=POLICY,searchStages=stages,
        importedStates=len(imported),newStates=len(new_rows),productionBaselineFrozen=True,auditAllLayouts=True,
        elapsedSeconds=time.monotonic()-started,sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in paths},
        scope='M21 endpoint-valid finite rhyme/root/key neighborhoods, compensated onsets, and paired tone-region key edits. Strict ergonomic and score-only branches are retained separately; no annealing or global optimum claim.')
    Path(str(PREFIX)+'-candidates.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    Path(str(PREFIX)+'-scores.json.gz').write_bytes(gzip.compress(json.dumps(new_rows,separators=(',',':')).encode(),mtime=0))
    print('finished',len(new_rows),'new states;',len(layouts),'finalists',flush=True)
    for row in sorted(selected.values(),key=lambda r:r['metrics']['doubledV52']):print(row['key'][:10],row['metrics'],flush=True)


if __name__=='__main__':main()
