"""Finite cross-region, two-root and onset/rhyme refinement of 7e."""
import concurrent.futures
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

PREFIX=ROOT/'research/notes/2026-11-19-7e-refinement'
OLD=ROOT/'research/notes/2026-11-19-9f-refinement'
WORK=ROOT/'research/.cache/7e-refinement'
BASE='7e650f7a4c'


def cross_region_keys(state,space):
    """Change one group key in each of two different tone regions."""
    for ra,rb in itertools.combinations(range(3),2):
        for a,b in itertools.product(range(10),repeat=2):
            old_a,old_b=state['groupKeys'][ra][a],state['groupKeys'][rb][b]
            for ka,kb in itertools.product(space.f['toneRegions'][ra]['keys'],space.f['toneRegions'][rb]['keys']):
                if ka==old_a or kb==old_b:continue
                st=copy.deepcopy(state);st['groupKeys'][ra][a]=ka;st['groupKeys'][rb][b]=kb
                yield f'cross-region:{ra}/{a}:{old_a}>{ka};{rb}/{b}:{old_b}>{kb}',st


def cross_region_swaps(state):
    """Two independent group swaps in different regions; preserve key multisets."""
    pairs=list(itertools.combinations(range(10),2))
    for ra,rb in itertools.combinations(range(3),2):
        for (a,b),(c,d) in itertools.product(pairs,repeat=2):
            if state['groupKeys'][ra][a]==state['groupKeys'][ra][b] or state['groupKeys'][rb][c]==state['groupKeys'][rb][d]:continue
            st=copy.deepcopy(state)
            st['groupKeys'][ra][a],st['groupKeys'][ra][b]=st['groupKeys'][ra][b],st['groupKeys'][ra][a]
            st['groupKeys'][rb][c],st['groupKeys'][rb][d]=st['groupKeys'][rb][d],st['groupKeys'][rb][c]
            yield f'cross-swaps:{ra}/{a},{b};{rb}/{c},{d}',st


def two_root_moves(state):
    """Reassign two distinct intact roots, without validating the intermediate."""
    for a,b in itertools.combinations(range(18),2):
        for ga,gb in itertools.product(range(10),repeat=2):
            if ga==state['partition'][a] or gb==state['partition'][b]:continue
            st=copy.deepcopy(state);st['partition'][a]=ga;st['partition'][b]=gb
            yield f'two-roots:{a}>{ga},{b}>{gb}',st


def main():
    WORK.mkdir(parents=True,exist_ok=True);space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
    source=read(str(OLD)+'-candidates.json');anchor=next(r for r in source['layouts'] if r['id']==BASE)
    scorer=LoadScorer();baseline=scorer.score(dict(key=anchor['key'],state=anchor['state'],metrics=space.memory(anchor['state']),label=BASE+' baseline'))
    for field,value in [('cktV52',9.132009149242153),('doubledV52',8.861456090616667)]:
        if abs(baseline['metrics'][field]-value)>1e-9:raise ValueError('7e anchor mismatch '+field)
    limits=dict(maxM=21,maxGuard=24,maxD=2,**{k:baseline['metrics'][k] for k in ['pinky','rightPinky','maxFinger','sameFingerOther']})
    names={a['name']:i for i,a in enumerate(space.f['atoms'])}
    archives=[ROOT/('research/notes/2026-11-19-'+name+'-scores.json.gz') for name in ['1f9-remove-p','cd3-refinement','9f-refinement']]
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
        print(json.dumps(dict(stage=name,queued=len(pending))),flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            for i,row in enumerate(executor.map(scorer.score,pending.values()),1):
                cache[row['key']]=row
                if i%1000==0:print(json.dumps(dict(stage=name,completed=i,total=len(pending))),flush=True)
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

    # Rank distinct historical onset maps by their best two-cost result. The
    # shortlist bounds the joint search; this is not an exhaustive onset x rhyme product.
    onset_maps={}
    for row in cache.values():
        if not admissible(row):continue
        signature=tuple(row['state']['firstKeys'])
        if signature not in onset_maps or sum(row['metrics'][f] for f in ['cktV52','doubledV52'])<sum(onset_maps[signature]['metrics'][f] for f in ['cktV52','doubledV52']):onset_maps[signature]=row
    onset_seeds=sorted(onset_maps.values(),key=lambda r:r['metrics']['cktV52']+r['metrics']['doubledV52'])[:12]
    batch(local_rhymes(anchor['state'],space),'7e-rhyme-neighborhood')
    batch(cross_region_keys(anchor['state'],space),'cross-region-keys')
    batch(two_root_moves(anchor['state']),'two-intact-root-moves')
    def coupled_onsets():
        for row in onset_seeds:
            st=copy.deepcopy(anchor['state']);st['firstKeys']=list(row['state']['firstKeys'])
            yield 'onset-shortlist:'+row['key'][:10],st
            for label,moved in local_rhymes(st,space):yield 'onset-shortlist:'+row['key'][:10]+'/'+label,moved
    batch(coupled_onsets(),'shortlisted-onset-rhyme-coupling')
    for iteration in range(2):
        batch(((r['key'][:10]+'/'+label,st) for r in centers() for label,st in local_rhymes(r['state'],space)),f'rhyme-descent-{iteration+1}')
    batch(((r['key'][:10]+'/'+label,st) for r in centers(2) for label,st in cross_region_swaps(r['state'])),'cross-region-double-swaps')
    batch(root_and_region_key(anchor['state'],space),'7e-joint-root-region-key')
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
    for ident in ['9f0408d0e5','cd3cc7adfe','f19a0ad1dc','1f9e267cd2','current-production']:
        row=next(r for r in source['layouts'] if r['id']==ident)
        if ident not in {r['id'] for r in layouts}:layouts.append(copy.deepcopy(row))
    new_rows={k:r for k,r in cache.items() if k not in imported}
    paths=[Path(__file__),ROOT/'tools/refine_9f_v52.py',Path(str(OLD)+'-candidates.json')]+archives
    payload=dict(version='7e-bounded-refinement-v1',tokenKeys=source['tokenKeys'],firstAtomNames=source['firstAtomNames'],
        layouts=layouts,baseline=baseline,constraints=limits,searchPolicy=POLICY,searchStages=stages,
        onsetShortlist=[dict(id=r['key'][:10],firstKeys=r['state']['firstKeys'],metrics=r['metrics']) for r in onset_seeds],
        importedStates=len(imported),newStates=len(new_rows),productionBaselineFrozen=True,auditAllLayouts=True,
        elapsedSeconds=time.monotonic()-started,sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in paths},
        scope='M21 endpoint-valid two-key changes across tone regions, independent two-root reassignments, two swaps across regions, and 12 historical onset maps coupled with a local rhyme edit; root/key coupling and bounded local descent. Strict and pinky-only branches are separate. No annealing or global optimum claim.')
    Path(str(PREFIX)+'-candidates.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    Path(str(PREFIX)+'-scores.json.gz').write_bytes(gzip.compress(json.dumps(new_rows,separators=(',',':')).encode(),mtime=0))
    print('finished',len(new_rows),'new states;',len(layouts),'finalists',flush=True)
    for row in sorted(selected.values(),key=lambda r:r['metrics']['doubledV52']):print(row['key'][:10],row['metrics'],flush=True)


if __name__=='__main__':main()
