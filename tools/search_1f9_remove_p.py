"""Deterministic onset/retroflex enumeration around 1f9, with no M/D growth."""
import concurrent.futures
import copy
import gzip
import itertools
import json
from pathlib import Path
import time

import numpy as np
from enumerate_f19_v52_policies import competition,load_tables,ROOT,KINDS,FIELDS
from search_cr_667_zero_carriers import CarrierSpace
from search_cr_lan_aeo_heads import head_moves,compensated_head_moves
from search_cr_lan_f19_combined import group_exchanges,root_exchanges,single_root_moves
from prepare_cr_m24_portfolio import make_layout

PREFIX=ROOT/'research/notes/2026-11-19-1f9-remove-p'
WORK=ROOT/'research/.cache/1f9-remove-p'
POLICY=dict(word2='21',word3='231',word4='14')


def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


def main():
    WORK.mkdir(parents=True,exist_ok=True)
    space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
    source=read(ROOT/'research/notes/2026-11-19-lan213-v52-followup-candidates.json')
    original=next(r for r in source['layouts'] if r['id']=='1f9e267cd2')
    base=original['state'];memory=space.memory(base)
    names={a['name']:i for i,a in enumerate(space.f['atoms'])}
    retro=[names[n] for n in ['zh','ch','sh']]
    rows=np.fromfile(ROOT/'research/.cache/f19-v52-audit/policy-templates.bin',np.int32).reshape(-1,11)
    motor=load_tables(ROOT/'tools/ckt_v4_upstream_role_tables.json','tables')
    errors=load_tables(ROOT/'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json','errorTables')
    publication=read(ROOT/'research/notes/2026-11-18-ckt-v52-all-schemes.json')
    reference=publication['references']['v52']['keytao']
    def vector(t):return np.array([t['motorUpperMs'],300*t['firstAuxRate'],300*t['secondAuxRate'],300*t['thirdAuxRate'],600*t['selectionRate'],50*t['meanRejectedCandidates'],300*t['meanPageActions']])
    ref=np.array([vector(reference[k]) for k in KINDS]);ref1=ref.sum(axis=1);ref2=ref[:,0]+2*ref[:,1:].sum(axis=1)
    orders=np.array([[0,1,0],[1,0,0],[1,2,0],[0,3,0]],np.int64)
    def score(row):
        st=row['state'];physical=np.array([ord(k)-65 for k in st['firstKeys']+[r[g] for r in st['groupKeys'] for g in st['partition']]],np.int64)
        totals,weights,counts,*_=competition(rows,physical,orders,15,motor,errors)
        v=totals/weights[:,None]
        cognitive=300*v[:,1:4].sum(axis=1)+600*v[:,4]+50*v[:,5]+300*v[:,6]
        row['metrics'].update(cktV52=float(10*np.average(((v[:,0]+cognitive)/ref1)**4,weights=[1,3,1,1])**.25),
            doubledV52=float(10*np.average(((v[:,0]+2*cognitive)/ref2)**4,weights=[1,3,1,1])**.25),
            pinky=float(max(totals[:,8]/totals[:,7])),rightPinky=float(max(totals[:,9]/totals[:,7])))
        return row
    baseline=score(dict(key=original['key'],state=base,metrics=memory.copy(),label='baseline'))
    if abs(baseline['metrics']['cktV52']-9.11746719363091)>1e-9:raise ValueError('baseline calibration changed')
    left_limit=baseline['metrics']['pinky'];cache={};stages=[];started=time.monotonic()
    def batch(moves,name):
        pending={}
        for label,state in moves:
            m=space.memory(state)
            if not m or m['d']>memory['d'] or m['m']>memory['m'] or m['guard']>memory['guard']:continue
            if any(state['firstKeys'][i]=='P' for i in retro):continue
            if len({state['firstKeys'][names['zero-'+n]] for n in 'AEO'})!=1:continue
            key=space.key(state)
            if key not in cache and key not in pending:pending[key]=dict(key=key,state=state,metrics=m,label=label,stage=name)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            for row in executor.map(score,pending.values()):cache[row['key']]=row
        stage=dict(name=name,fresh=len(pending),total=len(cache),elapsed=time.monotonic()-started)
        stages.append(stage);(WORK/'progress.json').write_text(json.dumps(stage),encoding='utf-8')
        print(json.dumps(stage),flush=True)
    def direct():
        for key in space.allowed_first:
            if key=='P':continue
            state=copy.deepcopy(base);state['firstKeys'][names['sh']]=key
            yield 'sh>'+key,state
        # Include simple swaps even before broader enumeration.
        for unit in range(len(base['firstKeys'])):
            if unit in retro or base['firstKeys'][unit]=='P':continue
            state=copy.deepcopy(base);state['firstKeys'][names['sh']],state['firstKeys'][unit]=state['firstKeys'][unit],'P'
            yield 'swap:sh/'+space.f['atoms'][unit]['name'],state
        for label,state in compensated_head_moves(base,space):
            if state['firstKeys'][names['sh']]!='P':yield label,state
    batch(direct(),'direct-and-compensated-controls')
    def triples():
        for recipient in ['p','s']:
            for keys in itertools.product([k for k in space.allowed_first if k!='P'],repeat=3):
                state=copy.deepcopy(base);state['firstKeys'][names[recipient]]='P'
                for index,key in zip(retro,keys):state['firstKeys'][index]=key
                yield 'P>'+recipient+'/retro:'+','.join(keys),state
    batch(triples(),'retroflex-triples-p-or-s-on-P')
    def centers(limit=8):
        selected={}
        for right in [.04,.05,.055,.06,.065]:
            for guard in [True,False]:
                pool=[r for r in cache.values() if r['metrics']['rightPinky']<=right and (not guard or r['metrics']['pinky']<=left_limit+1e-12)]
                if not pool:continue
                for field in ['doubledV52','cktV52']:
                    row=min(pool,key=lambda r:r['metrics'][field]);selected[row['key']]=row
        return sorted(selected.values(),key=lambda r:min(r['metrics']['doubledV52']/baseline['metrics']['doubledV52'],r['metrics']['cktV52']/baseline['metrics']['cktV52']))[:limit]
    def onset_neighbors():
        for row in centers():
            for function in [head_moves,compensated_head_moves]:
                for label,state in function(row['state'],space):yield row['key'][:10]+'/'+label,state
    batch(onset_neighbors(),'onset-refinement')
    def rhyme_neighbors():
        for row in centers(6):
            for function in [group_exchanges,root_exchanges,single_root_moves]:
                for label,state in function(row['state']):yield row['key'][:10]+'/'+label,state
            for region,spec in enumerate(space.f['toneRegions']):
                for group in range(10):
                    for key in spec['keys']:
                        state=copy.deepcopy(row['state']);state['groupKeys'][region][group]=key
                        yield row['key'][:10]+f'/region{region}/{group}>{key}',state
    batch(rhyme_neighbors(),'bounded-rhyme-compensation')
    batch(onset_neighbors(),'final-onset-refinement')
    selected={r['key']:r for r in centers(20)}
    for right in [.055,.06]:
        pool=[r for r in cache.values() if r['metrics']['rightPinky']<=right and r['metrics']['pinky']<=left_limit+1e-12]
        for field in ['cktV52','doubledV52']:
            for row in sorted(pool,key=lambda r:r['metrics'][field])[:3]:selected[row['key']]=row
    direct_rows=[r for r in cache.values() if r['stage']=='direct-and-compensated-controls' and r['label'].startswith('sh>')]
    direct_best=min(direct_rows,key=lambda r:r['metrics']['doubledV52']);selected[direct_best['key']]=direct_best
    layouts=[copy.deepcopy(original),copy.deepcopy(next(r for r in source['layouts'] if r['id']=='f19a0ad1dc'))]
    for row in selected.values():
        layout=make_layout(space,row['state'],dict(ckt=0),source['tokenKeys'],row['key'][:10]);layout.pop('rustScore')
        layout.update(wordAuxiliaryPolicy=POLICY,searchMetrics=row['metrics'],searchLabel=row['label'])
        layouts.append(layout)
    # Shared independent verifier also checks the frozen historical production
    # baseline; keep it as a control, not as a production deployment target.
    layouts.append(copy.deepcopy(next(r for r in source['layouts'] if r['id']=='current-production')))
    payload=dict(version='1f9-remove-p-candidates-v1',tokenKeys=source['tokenKeys'],firstAtomNames=source['firstAtomNames'],
        layouts=layouts,baseline=baseline,searchStages=stages,constraints=dict(maxM=22,maxGuard=24,maxD=2,
            noRetroflexOnP=True,unifiedAEO=True,preferredLeftPinkyCeiling=left_limit),
        productionBaselineFrozen=True,auditAllLayouts=True,searchPolicy=POLICY,
        scope='Deterministic direct/compensated controls, all 20^3 retroflex assignments with p or s on P, then bounded onset/rhyme refinement. No old moving-hand objective.',
        elapsedSeconds=time.monotonic()-started,scored=len(cache))
    Path(str(PREFIX)+'-candidates.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    Path(str(PREFIX)+'-scores.json.gz').write_bytes(gzip.compress(json.dumps(cache,separators=(',',':')).encode(),mtime=0))
    print('finished',len(cache),'selected',len(layouts),flush=True)
    for row in sorted(selected.values(),key=lambda r:r['metrics']['doubledV52']):print(row['key'][:10],row['metrics'],flush=True)


if __name__=='__main__':main()
