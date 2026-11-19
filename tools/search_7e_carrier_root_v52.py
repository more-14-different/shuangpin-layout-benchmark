"""Joint onset/carrier, intact-root and rhyme-key search around 7e."""
import concurrent.futures
import argparse
import copy
import gzip
import itertools
import json
from pathlib import Path
import time

from refine_cd3_v52 import ROOT,read,sha,POLICY
from search_cr_667_zero_carriers import CarrierSpace
from prepare_cr_m24_portfolio import make_layout
from refine_9f_v52 import LoadScorer,local_rhymes,paired_region_keys,root_and_region_key

PREFIX=ROOT/'research/notes/2026-11-19-7e-carrier-root'
OLD=ROOT/'research/notes/2026-11-19-7e-refinement'
WORK=ROOT/'research/.cache/7e-carrier-root'
BASE='7e650f7a4c'


from search_cr_lan_aeo_heads import head_moves,compensated_head_moves
from search_cr_lan_f19_combined import single_root_moves,root_exchanges


def with_carrier(state,space,key):
    st=copy.deepcopy(state)
    for i,atom in enumerate(space.f['atoms']):
        if atom['name'] in ['zero-A','zero-E','zero-O']:st['firstKeys'][i]=key
    return st


def carrier_rhyme_moves(state,space):
    """Every legal carrier x one intact-root/group/key endpoint edit."""
    for key in space.allowed_first:
        st=with_carrier(state,space,key)
        yield 'aeo:'+key,st
        for label,moved in local_rhymes(st,space):yield 'aeo:'+key+'/'+label,moved


def head_root_moves(state,space):
    """All single onset unit moves/swaps x one root move or root swap.

    Do not constrain intermediate M; final memory and loads are checked outside.
    Ordinary D and the guard ledger cannot be refunded by root repartition.
    """
    names={a['name']:i for i,a in enumerate(space.f['atoms'])}
    seen=set()
    for label,st in head_moves(state,space):
        signature=tuple(st['firstKeys'])
        if signature in seen:continue
        seen.add(signature);m=space.memory(st)
        if not m or m['d']>2 or m['guard']>24 or any(st['firstKeys'][names[n]]=='P' for n in ['zh','ch','sh']):continue
        for function in [single_root_moves,root_exchanges]:
            for rl,moved in function(st):yield label+'/'+rl,moved


def explicit_examples(state,space):
    """Exact R/N carrier x unchanged/ang/ei er target factorial."""
    er=space.spec['roots'].index('er')
    for carrier in ['R','N']:
        for target in [None,'ang','ei']:
            st=with_carrier(state,space,carrier)
            if target:st['partition'][er]=st['partition'][space.spec['roots'].index(target)]
            yield f'example:aeo={carrier};er={target or "unchanged"}',st


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resume-current',action='store_true',help='reuse completed stages from this experiment checkpoint')
    args=parser.parse_args()
    WORK.mkdir(parents=True,exist_ok=True);space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
    source=read(str(OLD)+'-candidates.json');anchor=next(r for r in source['layouts'] if r['id']==BASE)
    scorer=LoadScorer();baseline=scorer.score(dict(key=anchor['key'],state=anchor['state'],metrics=space.memory(anchor['state']),label=BASE+' baseline'))
    for field,value in [('cktV52',9.132009149242153),('doubledV52',8.861456090616667)]:
        if abs(baseline['metrics'][field]-value)>1e-9:raise ValueError('7e anchor mismatch '+field)
    limits=dict(maxM=21,maxGuard=24,maxD=2,**{k:baseline['metrics'][k] for k in ['pinky','rightPinky','maxFinger','sameFingerOther']})
    names={a['name']:i for i,a in enumerate(space.f['atoms'])}
    archives=[ROOT/('research/notes/2026-11-19-'+name+'-scores.json.gz') for name in ['1f9-remove-p','cd3-refinement','9f-refinement','7e-refinement']]
    cache={}
    for archive in archives:
        summary=read(str(archive).replace('-scores.json.gz','-summary.json'))
        if sha(archive)!=summary['sourceHashes'][archive.relative_to(ROOT).as_posix()]:raise ValueError('historical archive changed')
        cache.update(json.loads(gzip.decompress(archive.read_bytes())))
    imported=set(cache);cache[baseline['key']]=baseline;stages=[];started=time.monotonic()
    if args.resume_current:
        previous=json.loads(gzip.decompress((WORK/'cache.json.gz').read_bytes()))
        if not imported<=set(previous):raise ValueError('checkpoint lost historical cache rows')
        cache=previous;cache[baseline['key']]=baseline;stages=read(WORK/'stages.json')
        started-=stages[-1]['elapsed'] if stages else 0
        print('resuming',len(stages),'completed stages;',len(set(cache)-imported),'new scored states',flush=True)

    def physical_ok(state):
        m=space.memory(state)
        if not m or m['m']>21 or m['guard']>24 or m['d']>2:return None
        if any(state['firstKeys'][names[n]]=='P' for n in ['zh','ch','sh']):return None
        if len({state['firstKeys'][names['zero-'+n]] for n in 'AEO'})!=1:return None
        return m

    def budget_ok(row):
        m=row['metrics']
        return m['m']<=21 and m['guard']<=24 and m['d']<=2 and physical_ok(row['state'])

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
        if any(r['name']==name for r in stages):
            print('reused completed stage',name,flush=True);return
        pending={}
        for label,state in moves:
            m=physical_ok(state)
            if not m:continue
            key=space.key(state)
            if key not in cache and key not in pending:pending[key]=dict(key=key,state=state,metrics=m,label=label,stage=name)
        print(json.dumps(dict(stage=name,queued=len(pending))),flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            for i,row in enumerate(executor.map(scorer.score,pending.values()),1):
                cache[row['key']]=row
                if i%1000==0:print(json.dumps(dict(stage=name,completed=i,total=len(pending))),flush=True)
            warm=[r for r in cache.values() if budget_ok(r) and near(r) and 'maxFinger' not in r['metrics']]
            for row in executor.map(scorer.score,warm):cache[row['key']]=row
        pool=[r for r in cache.values() if admissible(r)]
        strict=[r for r in pool if ergonomic(r)]
        stage=dict(name=name,fresh=len(pending),ergonomicReplays=len(warm),newTotal=len(set(cache)-imported),
            bestDefault=min(pool,key=lambda r:r['metrics']['cktV52'])['key'][:10],
            bestDoubled=min(pool,key=lambda r:r['metrics']['doubledV52'])['key'][:10],
            strictBestDoubled=min(strict,key=lambda r:r['metrics']['doubledV52'])['key'][:10],
            budgetBestDefault=min((r for r in cache.values() if budget_ok(r)),key=lambda r:r['metrics']['cktV52'])['key'][:10],elapsed=time.monotonic()-started)
        stages.append(stage);save();print(json.dumps(stage),flush=True)

    def centers(limit=10):
        pool=[r for r in cache.values() if budget_ok(r) and near(r)]
        chosen={baseline['key']:baseline}
        for mode in ['budget','pinky','strict']:
            subset=[r for r in pool if mode=='budget' or (admissible(r) and (mode!='strict' or ergonomic(r)))]
            for field,other in [('doubledV52','cktV52'),('cktV52','doubledV52')]:
                for slack in [0,.004,.015]:
                    eligible=[r for r in subset if r['metrics'][other]<=baseline['metrics'][other]+slack]
                    if eligible:
                        r=min(eligible,key=lambda r:r['metrics'][field]);chosen[r['key']]=r
        # The N-carrier branch is deliberately retained even before it wins.
        for carrier in ['N','R']:
            subset=[r for r in pool if r['state']['firstKeys'][names['zero-A']]==carrier]
            for field in ['cktV52','doubledV52']:
                if subset:
                    r=min(subset,key=lambda r:r['metrics'][field]);chosen[r['key']]=r
        others=sorted(pool,key=lambda r:r['metrics']['cktV52']+r['metrics']['doubledV52'])
        for r in others[:4]:chosen[r['key']]=r
        return list(chosen.values())[:limit]

    examples=list(explicit_examples(anchor['state'],space))
    if not (args.resume_current and any(r['name']=='final-rhyme-polish-2' for r in stages)):
        batch(examples,'explicit-carrier-er-factorial')
        batch(carrier_rhyme_moves(anchor['state'],space),'all-carriers-local-rhymes')
        batch(head_root_moves(anchor['state'],space),'all-single-onset-root-coupling')
        # Combine er destination, carrier N and a third rhyme-key/group edit in one
        # endpoint, avoiding the bad standalone N-carrier intermediate.
        batch(((label+'/'+rl,moved) for label,st in examples if 'aeo=N' in label
            for rl,moved in local_rhymes(st,space)),'N-er-rhyme-three-way')
        for iteration in range(3):
            batch(((r['key'][:10]+'/'+label,st) for r in centers() for label,st in local_rhymes(r['state'],space)),f'joint-rhyme-descent-{iteration+1}')
        batch(((r['key'][:10]+'/'+label,st) for r in centers(5) for label,st in root_and_region_key(r['state'],space)),'best-centers-root-key-coupling')
        batch(((r['key'][:10]+'/'+label,st) for r in centers(6) for function in [head_moves,compensated_head_moves]
            for label,st in function(r['state'],space)),'best-centers-onset-compensation')
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
    for field in ['cktV52','doubledV52']:
        budget_pool=[r for r in cache.values() if budget_ok(r)]
        for r in sorted(budget_pool,key=lambda r:r['metrics'][field])[:2]:selected[r['key']]=r
        fresh=[r for r in budget_pool if r['key'] not in imported]
        for r in sorted(fresh,key=lambda r:r['metrics'][field])[:2]:selected[r['key']]=r
    example_rows=[]
    for label,st in examples:
        row=cache[space.key(st)];selected[row['key']]=row;example_rows.append(dict(row,label=label))
    layouts=[]
    for row in selected.values():
        layout=make_layout(space,row['state'],dict(ckt=0),source['tokenKeys'],row['key'][:10]);layout.pop('rustScore')
        layout.update(wordAuxiliaryPolicy=POLICY,searchMetrics=row['metrics'],searchLabel=row['label']);layouts.append(layout)
    for ident in ['9f0408d0e5','cd3cc7adfe','f19a0ad1dc','1f9e267cd2','current-production']:
        row=next(r for r in source['layouts'] if r['id']==ident)
        if ident not in {r['id'] for r in layouts}:layouts.append(copy.deepcopy(row))
    new_rows={k:r for k,r in cache.items() if k not in imported}
    paths=[Path(__file__),ROOT/'tools/refine_9f_v52.py',ROOT/'tools/search_cr_lan_aeo_heads.py',
        ROOT/'tools/search_cr_lan_f19_combined.py',ROOT/'tools/search_cr_667_zero_carriers.py',Path(str(OLD)+'-candidates.json')]+archives
    payload=dict(version='7e-carrier-root-joint-v1',tokenKeys=source['tokenKeys'],firstAtomNames=source['firstAtomNames'],
        layouts=layouts,baseline=baseline,constraints=limits,searchPolicy=POLICY,searchStages=stages,
        explicitExamples=example_rows,
        importedStates=len(imported),newStates=len(new_rows),productionBaselineFrozen=True,auditAllLayouts=True,
        elapsedSeconds=time.monotonic()-started,sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in paths},
        scope='Every AEO carrier paired with one local rhyme edit; all single-onset unit moves/swaps paired with an intact-root move/swap; forced N-carrier+er+one local rhyme edit; finite descent, root/key and compensated-head polishing. Final M21/24,D2 endpoints only; loads do not prune budget-only branch. Fixed 21/231/14 during search, own robust policy audited for finalists; no global optimality claim.')
    Path(str(PREFIX)+'-candidates.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    Path(str(PREFIX)+'-scores.json.gz').write_bytes(gzip.compress(json.dumps(new_rows,separators=(',',':')).encode(),mtime=0))
    print('finished',len(new_rows),'new states;',len(layouts),'finalists',flush=True)
    for row in sorted(selected.values(),key=lambda r:r['metrics']['doubledV52']):print(row['key'][:10],row['metrics'],flush=True)


if __name__=='__main__':main()
