"""Exact six-cost grids: fixed robust policies versus fixed and adaptive rivals."""
import argparse
import concurrent.futures
import gzip
import hashlib
import json
from pathlib import Path
import time

import numpy as np
from analyze_single_ckt_v51_aux_order import grid, score_at, vectors
from rank_cr_toned_stable_policies import COSTS, policy_key

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-19-f19-v52-production-audit'
WORK=ROOT/'research/.cache/f19-v52-audit'
WEIGHTS=np.array([1.,3.,1.,1.])


def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


def fourth_scores(a,b,points):
    effective=a[:,:,0][None,:,:]+np.einsum('ba,pta->bpt',points,a[:,:,1:],optimize=False)
    denominator=b[:,0][None,:]+points@b[:,1:].T
    return np.sum(WEIGHTS[None,None,:]*(effective/denominator[:,None,:])**4,axis=2)/6


def nondominated(a):
    # Exact coefficient dominance is valid for every nonnegative cost vector.
    keep=[]
    for i,x in enumerate(a):
        dominates=np.all(a<=x,axis=(1,2))&np.any(a<x,axis=(1,2))
        if not dominates.any():keep.append(i)
    return np.asarray(keep,dtype=int)


def masks(points):
    return dict(all=np.ones(len(points),bool),positive=np.all(points>0,axis=1),
                moderate=np.all((points>=.5)&(points<=2),axis=1))


def optimize(layout,reference,grids,chunk):
    rows=layout['policies'];all_a=np.asarray([vectors(r,COSTS) for r in rows]);keep=nondominated(all_a);a=all_a[keep]
    summaries={};caches={}
    for name,points in grids.items():
        cache=WORK/(layout['id']+'-'+name+'-oracle.npy')
        oracle=np.lib.format.open_memmap(cache,mode='w+',dtype=np.float64,shape=(len(points),))
        totals={part:dict(count=0,max=np.zeros(len(keep)),sum=np.zeros(len(keep)),wins=np.zeros(len(keep),np.int64)) for part in ['all','positive']}
        for start in range(0,len(points),chunk):
            batch=points[start:start+chunk];scores=10*fourth_scores(a,reference,batch)**.25
            best=scores.min(axis=1);oracle[start:start+len(batch)]=best
            regrets=scores/best[:,None]-1
            for part,mask in [('all',np.ones(len(batch),bool)),('positive',np.all(batch>0,axis=1))]:
                values=regrets[mask]
                if not len(values):continue
                t=totals[part];t['count']+=len(values);t['max']=np.maximum(t['max'],values.max(axis=0))
                t['sum']+=values.sum(axis=0);t['wins']+=(scores[mask]<=best[mask,None]+1e-9).sum(axis=0)
        oracle.flush();del oracle;caches[name]=str(cache)
        summaries[name]={part:dict(points=t['count'],worstRegret=t['max'].tolist(),
            meanRegret=(t['sum']/t['count']).tolist(),top1Rate=(t['wins']/t['count']).tolist()) for part,t in totals.items()}
    ranked=[]
    for j,i in enumerate(keep):
        worst=max(summaries[g][p]['worstRegret'][j] for g in summaries for p in ['all','positive'])
        mean=np.mean([summaries[g][p]['meanRegret'][j] for g in summaries for p in ['all','positive']])
        ranked.append(dict(policy=rows[i]['policy'],policyIndex=int(i),worstRegret=float(worst),meanRegret=float(mean),
                           defaultScore=rows[i]['score'],grids={g:{p:{'points':summaries[g][p]['points'],
                            **{k:summaries[g][p][k][j] for k in ['worstRegret','meanRegret','top1Rate']}} for p in ['all','positive']} for g in summaries}))
    ranked.sort(key=lambda r:(r['worstRegret'],r['meanRegret'],r['defaultScore'],policy_key(r['policy'])))
    return dict(id=layout['id'],enumeratedPolicies=144,coefficientNondominatedPolicies=len(keep),
        selected=ranked[0],defaultBest=dict(policy=layout['defaultBest']['policy'],score=layout['defaultBest']['score']),
        policyRanking=ranked,oracleCaches=caches)


def summarize_gaps(gaps,ranks,points,selected_scores,selected_ids,source,oracle=False):
    result={}
    for part,mask in masks(points).items():
        values=gaps[mask];rs=ranks[mask]
        idxs=np.flatnonzero(mask);worst=int(idxs[np.argmin(values)]);multipliers=points[worst]
        f19_index=selected_ids.index('f19a0ad1dc')
        scores=score_at(selected_scores,source['referenceVectors'],multipliers)
        rival_indices=[i for i,x in enumerate(selected_ids) if x!='f19a0ad1dc']
        if oracle:
            candidates=[]
            for i in rival_indices:
                raw=source['results'][i]
                a=np.asarray([vectors(r,COSTS) for r in raw['policies']])
                s=score_at(a,source['referenceVectors'],multipliers);j=int(np.argmin(s))
                candidates.append((float(s[j]),raw['id'],raw['policies'][j]['policy']))
            best,ident,policy=min(candidates,key=lambda x:x[0])
        else:
            i=min(rival_indices,key=lambda i:scores[i]);best=float(scores[i]);ident=selected_ids[i]
            policy=source['fixedPolicies'][i]
        result[part]=dict(points=len(values),wins=float(np.mean(values>1e-9)),ties=float(np.mean(np.abs(values)<=1e-9)),
            losses=float(np.mean(values < -1e-9)),worstRank=int(rs.max()),minGap=float(values.min()),
            p05Gap=float(np.quantile(values,.05)),medianGap=float(np.median(values)),p95Gap=float(np.quantile(values,.95)),
            maxGap=float(values.max()),worstCase=dict(multipliers=multipliers.tolist(),
                costsMs={k:float(multipliers[j]*COSTS[k]) for j,k in enumerate(COSTS)},
                f19Score=float(scores[f19_index]),rivalScore=best,rivalId=ident,rivalPolicy=policy))
    return result


def cross_compare(source,optimized,grids,chunk):
    raw={r['id']:r for r in source['results']}
    fixed=[raw[r['id']]['policies'][r['selected']['policyIndex']] for r in optimized]
    a=np.asarray([vectors(r,COSTS) for r in fixed]);reference=vectors(source['reference'],COSTS)
    ids=[r['id'] for r in optimized];f19=ids.index('f19a0ad1dc');others=[i for i in range(len(ids)) if i!=f19]
    context=dict(results=[raw[i] for i in ids],referenceVectors=reference,fixedPolicies=[r['policy'] for r in fixed])
    out={}
    for name,points in grids.items():
        caches=[np.load(r['oracleCaches'][name],mmap_mode='r') for r in optimized]
        fixed_gaps=np.empty(len(points));oracle_gaps=np.empty(len(points));fixed_ranks=np.empty(len(points),np.int16);oracle_ranks=np.empty(len(points),np.int16)
        for start in range(0,len(points),chunk):
            stop=min(start+chunk,len(points));batch=points[start:stop]
            scores=10*fourth_scores(a,reference,batch)**.25;anchor=scores[:,f19]
            rivals=scores[:,others];oracle=np.column_stack([caches[i][start:stop] for i in others])
            fixed_gaps[start:stop]=rivals.min(axis=1)-anchor;oracle_gaps[start:stop]=oracle.min(axis=1)-anchor
            fixed_ranks[start:stop]=1+(rivals<anchor[:,None]-1e-9).sum(axis=1)
            oracle_ranks[start:stop]=1+(oracle<anchor[:,None]-1e-9).sum(axis=1)
        out[name]=dict(fixedPolicies=summarize_gaps(fixed_gaps,fixed_ranks,points,a,ids,context),
                       adaptiveRivals=summarize_gaps(oracle_gaps,oracle_ranks,points,a,ids,context,True))
        print('cross comparison',name,{part:out[name]['fixedPolicies'][part]['wins'] for part in ['all','positive','moderate']},flush=True)
    return out


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--workers',type=int,default=3)
    parser.add_argument('--chunk',type=int,default=4096)
    parser.add_argument('--resume-report',type=Path);parser.add_argument('--resume-policies',type=Path)
    args=parser.parse_args()
    path=Path(str(PREFIX)+'-policies.json.gz');source_bytes=path.read_bytes();source=json.loads(gzip.decompress(source_bytes))
    reference=vectors(source['reference'],COSTS)
    grids=dict(main=grid(0,5,.5),extreme=grid(0,10,1))
    started=time.monotonic();results=[];resume={}
    if args.resume_report:
        previous=read(args.resume_report);old_bytes=args.resume_policies.read_bytes()
        if hashlib.sha256(old_bytes).hexdigest()!=previous['sourceSha256']:raise ValueError('resume source changed')
        old_source=json.loads(gzip.decompress(old_bytes));old_rows={r['id']:r for r in old_source['results']}
        new_rows={r['id']:r for r in source['results']}
        for r in previous['results']:
            if old_rows[r['id']]['policies']!=new_rows[r['id']]['policies']:raise ValueError('resume policy changed')
            cached={**r,'oracleCaches':{name:str(WORK/(r['id']+'-'+name+'-oracle.npy')) for name in grids}}
            if all(Path(p).exists() for p in cached['oracleCaches'].values()):resume[r['id']]=cached
        results.extend(resume.values());print('reused verified layout grids',len(resume),flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures={executor.submit(optimize,r,reference,grids,args.chunk):r['id'] for r in source['results'] if r['id'] not in resume}
        for future in concurrent.futures.as_completed(futures):
            result=future.result();results.append(result)
            print('robust',result['id'],policy_key(result['selected']['policy']),result['selected']['worstRegret'],flush=True)
    results.sort(key=lambda r:r['selected']['defaultScore'])
    comparisons=cross_compare(source,results,grids,args.chunk)
    default=sorted([dict(id=r['id'],score=r['defaultBest']['score'],policy=r['defaultBest']['policy']) for r in results],key=lambda r:r['score'])
    f19=next(r for r in results if r['id']=='f19a0ad1dc')
    # This is the user's strong production gate, rather than a post-hoc threshold.
    gate=default[0]['id']=='f19a0ad1dc' and all(
        c['fixedPolicies']['positive']['minGap']>1e-9 and c['adaptiveRivals']['positive']['minGap']>1e-9
        for c in comparisons.values())
    report=dict(version='f19-v52-six-cost-production-audit-v1',baselineCostsMs=COSTS,
        candidateLayouts=len(results),policiesPerLayout=144,parameterAxes=list(COSTS),
        grids={k:dict(points=len(p),multipliers=[0,5,.5] if k=='main' else [0,10,1],positivePoints=int(np.all(p>0,axis=1).sum())) for k,p in grids.items()},
        robustSelection='Minimize worst relative regret against own 144-policy oracle over both complete grids; tie-break equal-weight mean regret of all/positive subsets, then default score and lexical policy. Exact nonnegative coefficient dominance prunes provably inferior policies.',
        sourceSha256=hashlib.sha256(source_bytes).hexdigest(),defaultRankingEachOwnBest=default,
        f19Selected=f19['selected'],crossLayoutComparisons=comparisons,
        productionGatePassed=gate,productionGate='f19 first at default under each own best policy, and strictly positive gap at every positive point in both grids against fixed robust rivals and pointwise best-policy rivals.',
        elapsedSeconds=time.monotonic()-started,results=[{k:v for k,v in r.items() if k!='oracleCaches'} for r in results])
    Path(str(PREFIX)+'-robustness.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('production gate',gate,'seconds',report['elapsedSeconds'],flush=True)


if __name__=='__main__':main()
