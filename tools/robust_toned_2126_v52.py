"""Exact six-cost robustness: own minimax policies, fixed and adaptive rivals.

Uses the previously verified generic coefficient/grid engine. Layouts and routes
are frozen; only six cognitive costs vary, with S005 repriced at every point.
"""
import argparse
import concurrent.futures
import gzip
import hashlib
import json
from pathlib import Path
import time

import numpy as np
import audit_f19_v52_robustness as engine
from analyze_single_ckt_v51_aux_order import grid, vectors, score_at
from rank_cr_toned_stable_policies import COSTS, policy_key

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52'
WORK=ROOT/'research/.cache/toned-2126-v52'
engine.WORK=WORK


def read(path):return json.loads(Path(path).read_text(encoding='utf8'))


def summarize(gaps,ranks,points,anchor,a,ids,raw,policies,adaptive):
    result={}
    for part,mask in engine.masks(points).items():
        vals=gaps[mask];rs=ranks[mask];indices=np.flatnonzero(mask)
        where=int(indices[np.argmin(vals)]);x=points[where]
        scores=score_at(a,anchor,x)
        rivals=[]
        for i,ident in enumerate(ids):
            if ident=='A':continue
            if adaptive:
                candidate=raw[ident]
                v=np.asarray([vectors(p,COSTS) for p in candidate['policies']])
                s=score_at(v,anchor,x);j=int(np.argmin(s))
                rivals.append((float(s[j]),ident,candidate['policies'][j]['policy']))
            else:rivals.append((float(scores[i]),ident,policies[i]))
        best,ident,policy=min(rivals,key=lambda r:r[0])
        result[part]=dict(points=len(vals),wins=float(np.mean(vals>1e-9)),ties=float(np.mean(np.abs(vals)<=1e-9)),
            losses=float(np.mean(vals < -1e-9)),worstRank=int(rs.max()),minGap=float(vals.min()),
            p05Gap=float(np.quantile(vals,.05)),medianGap=float(np.median(vals)),p95Gap=float(np.quantile(vals,.95)),maxGap=float(vals.max()),
            worstCase=dict(multipliers=x.tolist(),costsMs={k:float(x[j]*COSTS[k]) for j,k in enumerate(COSTS)},
                anchorScore=float(scores[ids.index('A')]),rivalScore=best,rivalId=ident,rivalPolicy=policy))
    return result


def compare(raw,optimized,reference,grids,chunk,scopes):
    ids=[r['id'] for r in optimized]
    fixed=[raw[r['id']]['policies'][r['selected']['policyIndex']] for r in optimized]
    a=np.asarray([vectors(r,COSTS) for r in fixed]);policies=[r['policy'] for r in fixed]
    ai=ids.index('A');out={k:{} for k in scopes}
    for name,points in grids.items():
        caches=[np.load(r['oracleCaches'][name],mmap_mode='r') for r in optimized]
        arrays={scope:{mode:(np.empty(len(points)),np.empty(len(points),np.int16)) for mode in ['fixedPolicies','adaptiveRivals']} for scope in scopes}
        for start in range(0,len(points),chunk):
            stop=min(start+chunk,len(points));batch=points[start:stop]
            scores=10*engine.fourth_scores(a,reference,batch)**.25;anchor=scores[:,ai]
            for scope,include in scopes.items():
                others=[i for i,x in enumerate(ids) if x!='A' and x in include]
                for mode,rivals in [('fixedPolicies',scores[:,others]),('adaptiveRivals',np.column_stack([caches[i][start:stop] for i in others]))]:
                    gaps,ranks=arrays[scope][mode]
                    gaps[start:stop]=rivals.min(axis=1)-anchor
                    ranks[start:stop]=1+(rivals<anchor[:,None]-1e-9).sum(axis=1)
        for scope,include in scopes.items():
            keep=[i for i,x in enumerate(ids) if x in include]
            for mode,(gaps,ranks) in arrays[scope].items():
                out[scope].setdefault(name,{})[mode]=summarize(gaps,ranks,points,reference,a[keep],[ids[i] for i in keep],raw,[policies[i] for i in keep],mode=='adaptiveRivals')
            print('cross',scope,name,out[scope][name]['adaptiveRivals']['positive'],flush=True)
    return out


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--workers',type=int,default=2)
    p.add_argument('--main',type=Path,default=ROOT.parent/'shuangpin-layout-benchmark')
    p.add_argument('--smoke',action='store_true');args=p.parse_args()
    WORK.mkdir(parents=True,exist_ok=True)
    source_file=Path(str(PREFIX)+'-policies.json.gz');source_bytes=source_file.read_bytes();source=json.loads(gzip.decompress(source_bytes))
    if not source['complete']:raise ValueError('incomplete enumeration')
    reference=vectors(source['reference'],COSTS)
    grids=dict(main=grid(0,5,.5),extreme=grid(0,10,1)) if not args.smoke else dict(main=grid(0,2,1),extreme=grid(0,3,1))
    started=time.monotonic();results=[]
    cache_report=WORK/'partial-results.json'
    previous=read(cache_report) if cache_report.exists() and not args.smoke else {}
    source_sha=hashlib.sha256(source_bytes).hexdigest()
    if previous and previous['sourceSha256']!=source_sha:raise ValueError('partial source changed')
    done={r['id']:r for r in previous.get('results',[]) if all(Path(f).exists() for f in r['oracleCaches'].values())}
    results.extend(done.values())
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures={pool.submit(engine.optimize,r,reference,grids,4096):r['id'] for r in source['results'] if r['id'] not in done}
        for future in concurrent.futures.as_completed(futures):
            r=future.result();results.append(r)
            print('robust',r['id'],policy_key(r['selected']['policy']),r['selected']['worstRegret'],flush=True)
            if not args.smoke:cache_report.write_text(json.dumps(dict(sourceSha256=source_sha,results=results)),encoding='utf8')
    raw={r['id']:r for r in source['results']}
    own_ids=set(raw);representatives=set('ABCDEF');imports={}
    if not args.smoke:
        old_prefix=args.main/'research/notes/2026-11-19-f19-v52-production-audit'
        old_source_file=Path(str(old_prefix)+'-policies.json.gz');old_bytes=old_source_file.read_bytes();old_source=json.loads(gzip.decompress(old_bytes))
        old_report=read(str(old_prefix)+'-robustness.json')
        if old_report['sourceSha256']!=hashlib.sha256(old_bytes).hexdigest():raise ValueError('old audit source changed')
        np.testing.assert_allclose(vectors(old_source['reference'],COSTS),reference,atol=1e-12,rtol=0)
        for r in old_report['results']:
            r={**r,'oracleCaches':{name:str(args.main/'research/.cache/f19-v52-audit'/(r['id']+'-'+name+'-oracle.npy')) for name in grids}}
            if not all(Path(f).exists() for f in r['oracleCaches'].values()):raise ValueError('missing independently audited 21x21 oracle '+r['id'])
            results.append(r)
        raw.update({r['id']:r for r in old_source['results']})
        imports={str(old_source_file):hashlib.sha256(old_bytes).hexdigest(),str(old_prefix)+'-robustness.json':hashlib.sha256(Path(str(old_prefix)+'-robustness.json').read_bytes()).hexdigest()}
    results.sort(key=lambda r:r['selected']['defaultScore'])
    scopes=dict(sixRepresentatives=representatives,all2126=own_ids,including2121=set(raw))
    cross=compare(raw,results,reference,grids,4096,scopes)
    # Also expose average positive-cost regret. Pure minimax can prefer a policy
    # that is almost never optimal, to shave a tiny loss at a zero-cost corner.
    # Report that tradeoff rather than presenting one definition as universal.
    average=[]
    for r in results:
        def average_key(p):
            mean=np.mean([p['grids'][g]['positive']['meanRegret'] for g in grids])
            return (mean,p['worstRegret'],p['defaultScore'],policy_key(p['policy']))
        selection=min(r['policyRanking'],key=average_key)
        average.append({**r,'selected':selection})
    average_cross=compare(raw,average,reference,grids,4096,scopes)
    default=sorted([dict(id=r['id'],policy=r['defaultBest']['policy'],score=r['defaultBest']['score']) for r in results],key=lambda r:r['score'])
    uniform=[]
    for scale in [0,.5,1,2,3,5,10]:
        x=np.full(6,scale);rows=[]
        for r in results:
            fixed=raw[r['id']]['policies'][r['selected']['policyIndex']]
            rows.append(dict(id=r['id'],score=float(score_at(vectors(fixed,COSTS)[None,:,:],reference,x)[0]),policy=fixed['policy']))
        rows.sort(key=lambda r:r['score']);uniform.append(dict(multiplier=scale,ranking=rows))
    report=dict(version='toned-2126-v52-six-cost-robustness-v1',complete=True,baselineCostsMs=COSTS,
        sourceSha256=source_sha,importedSources=imports,layoutCounts=dict(toned2126=len(own_ids),toned2121=len(raw)-len(own_ids)),
        grids={k:dict(points=len(p),multipliers=[0,5,.5] if k=='main' else [0,10,1],positivePoints=int(np.all(p>0,axis=1).sum())) for k,p in grids.items()},
        robustSelection='Minimize maximum relative regret against own 144-policy oracle over both full grids; ties by equal-weight mean regrets across full/positive grids, then default score, then lexical policy. Only exact nonnegative-coefficient dominated policies pruned.',
        averageRegretSelection='Minimize equal-weight mean relative regret against own pointwise best policy on the positive subsets of both grids; ties by worst regret, default score, lexical policy.',
        averageRegretSelections=[dict(id=r['id'],selected=r['selected']) for r in average],
        defaultRankingEachOwnBest=default,uniformCostScenarios=uniform,crossLayoutComparisons=cross,averageRegretCrossLayoutComparisons=average_cross,
        elapsedSeconds=time.monotonic()-started,results=[{k:v for k,v in r.items() if k!='oracleCaches'} for r in results])
    out=WORK/'smoke.json' if args.smoke else Path(str(PREFIX)+'-robustness.json')
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('complete seconds',report['elapsedSeconds'],flush=True)


if __name__=='__main__':main()
