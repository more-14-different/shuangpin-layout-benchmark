"""Rank all 144 shape-only policies on the established independent six-cost grids."""
import argparse
import hashlib
import json
from pathlib import Path
import time

import numpy as np

from analyze_single_ckt_v51_aux_order import COMPONENTS, TRACKS, WEIGHTS, competition_ranks, grid, vectors, score_at

ROOT = Path(__file__).resolve().parents[1]
COSTS = dict(firstAuxMs=300, secondAuxMs=300, thirdAuxMs=300,
             selectionDecisionMs=600, scanPerCandidateMs=50, pageActionMs=300)
SOURCE = ROOT / 'research/notes/2026-11-16-cr-frontier-followup-auxiliary.json'
REFERENCE = ROOT / 'research/config/cr-toned-stability-reference.json'
OUTPUT = ROOT / 'research/notes/2026-11-16-cr-toned-stable-policies.json'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf8'))


def policy_key(policy):
    return '/'.join(policy[k] for k in ('word2','word3','word4'))


def ranked_rows(keys, totals):
    count = totals['count']
    rows = [dict(policy=key, meanRank=float(totals['ranks'][i]/count),
                 top1Rate=float(totals['top1'][i]/count), top3Rate=float(totals['top3'][i]/count),
                 worstRank=int(totals['worst'][i])) for i,key in enumerate(keys)]
    return sorted(rows, key=lambda r:(r['meanRank'],-r['top3Rate'],-r['top1Rate'],r['worstRank'],r['policy']))


def grid_ranks(rows, reference, multipliers, chunk=4096):
    """Compute both the zero-inclusive grid and its strictly-positive subset once."""
    keys = [policy_key(row['policy']) for row in rows]
    a = np.asarray([vectors(row,COSTS) for row in rows])
    b = vectors(reference,COSTS)
    totals = {name:dict(count=0,ranks=np.zeros(len(rows),dtype=np.int64),
        top1=np.zeros(len(rows),dtype=np.int64),top3=np.zeros(len(rows),dtype=np.int64),
        worst=np.zeros(len(rows),dtype=np.int16)) for name in ['all','positive']}
    for start in range(0,len(multipliers),chunk):
        points = multipliers[start:start+chunk]
        effective = a[:,:,0][None,:,:] + np.einsum('ba,pta->bpt',points,a[:,:,1:],optimize=True)
        denominator = b[:,0][None,:]+points@b[:,1:].T
        fourth = np.sum(WEIGHTS[None,None,:]*(effective/denominator[:,None,:])**4,axis=2)
        ranks = competition_ranks(fourth)
        for name, batch in [('all',ranks),('positive',ranks[np.all(points>0,axis=1)])]:
            if not len(batch):
                continue
            t=totals[name];t['count']+=len(batch);t['ranks']+=batch.sum(axis=0,dtype=np.int64)
            t['top1']+=(batch==1).sum(axis=0);t['top3']+=(batch<=3).sum(axis=0)
            t['worst']=np.maximum(t['worst'],batch.max(axis=0))
    return {name:dict(points=t['count'],ranking=ranked_rows(keys,t)) for name,t in totals.items()}


def pooled_ranking(grids):
    """Give the four named grids equal weight, rather than overweighting their sizes."""
    by_key={}
    for result in grids.values():
        for row in result['ranking']:
            by_key.setdefault(row['policy'],[]).append(row)
    rows=[dict(policy=key,meanRank=sum(r['meanRank'] for r in group)/len(group),
        top1Rate=sum(r['top1Rate'] for r in group)/len(group),
        top3Rate=sum(r['top3Rate'] for r in group)/len(group),worstRank=max(r['worstRank'] for r in group))
        for key,group in by_key.items()]
    return sorted(rows,key=lambda r:(r['meanRank'],-r['top3Rate'],-r['top1Rate'],r['worstRank'],r['policy']))


def pair_margins(selected, runner, reference, points, chunk=16384):
    a=np.asarray([vectors(selected,COSTS),vectors(runner,COSTS)]);b=vectors(reference,COSTS)
    margins=[];positive=[]
    for start in range(0,len(points),chunk):
        batch=points[start:start+chunk]
        effective=a[:,:,0][None,:,:]+np.einsum('ba,pta->bpt',batch,a[:,:,1:],optimize=True)
        denominator=b[:,0][None,:]+batch@b[:,1:].T
        scores=10*(np.sum(WEIGHTS[None,None,:]*(effective/denominator[:,None,:])**4,axis=2)/WEIGHTS.sum())**.25
        delta=scores[:,1]-scores[:,0]
        margins.append(delta);positive.append(delta[np.all(batch>0,axis=1)])
    def summarize(values):
        return dict(minGap=float(values.min()),maxGap=float(values.max()),
            medianGap=float(np.median(values)),p05Gap=float(np.quantile(values,.05)),p95Gap=float(np.quantile(values,.95)),
            selectedWins=float(np.mean(values>1e-9)),runnerWins=float(np.mean(values < -1e-9)),
            tied=float(np.mean(np.abs(values)<=1e-9)))
    return dict(all=summarize(np.concatenate(margins)),positive=summarize(np.concatenate(positive)))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=OUTPUT)
    parser.add_argument('--chunk',type=int,default=4096)
    args=parser.parse_args()
    if args.chunk<1:
        parser.error('chunk must be positive')
    source,reference=read(SOURCE),read(REFERENCE)
    gridspec={'main0To500Step50':(0,5,.5),'mainPositive50To500Step50':(.5,5,.5),
              'extreme0To1000Step100':(0,10,1),'extremePositive100To1000Step100':(1,10,1)}
    report=dict(version='cr-toned-stable-policy-six-cost-v1',baselineCostsMs=COSTS,coefficients=list(COMPONENTS),
        tracks=list(TRACKS),trackWeights=WEIGHTS.astype(int).tolist(),reference=reference,
        selectionRule='equal-weight mean competition rank across four grids; then higher top3, higher top1, lower worst rank, lexical policy',
        candidateSet='all 144 policies; no additional pinky exclusion',
        grids={name:dict(minimum=lo,maximum=hi,step=step,points=round((hi-lo)/step+1)**6) for name,(lo,hi,step) in gridspec.items()},
        sourceHashes={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest()
                      for p in [SOURCE,REFERENCE,Path(__file__),ROOT/'tools/analyze_single_ckt_v51_aux_order.py']},results=[])
    started=time.monotonic()
    for layout in source['results']:
        rows=layout['policies']
        if len(rows)!=144 or len({policy_key(r['policy']) for r in rows})!=144 or not layout['cohortEqualityVerified']:
            raise ValueError('incomplete or incomparable policy enumeration')
        base=np.asarray([vectors(r,COSTS) for r in rows]);ref=vectors(reference,COSTS)
        scores=score_at(base,ref,np.ones(6))
        for row,score in zip(rows,scores,strict=True):
            if abs(row['score']-score)>1e-9:
                raise ValueError('frozen component/default-score mismatch')
        results={}
        for upper,step,all_name,positive_name in [(5,.5,'main0To500Step50','mainPositive50To500Step50'),
                                                (10,1,'extreme0To1000Step100','extremePositive100To1000Step100')]:
            points=grid(0,upper,step)
            print(json.dumps(dict(id=layout['id'],grid=all_name,points=len(points),phase='rank')),flush=True)
            both=grid_ranks(rows,reference,points,args.chunk)
            results[all_name]=both['all'];results[positive_name]=both['positive']
        pooled=pooled_ranking(results);selected_key,runner_key=(row['policy'] for row in pooled[:2])
        by_key={policy_key(r['policy']):r for r in rows}
        selected,runner=by_key[selected_key],by_key[runner_key]
        for upper,step,all_name,positive_name in [(5,.5,'main0To500Step50','mainPositive50To500Step50'),
                                                (10,1,'extreme0To1000Step100','extremePositive100To1000Step100')]:
            gaps=pair_margins(selected,runner,reference,grid(0,upper,step))
            results[all_name]['selectedVsRunner']=gaps['all'];results[positive_name]['selectedVsRunner']=gaps['positive']
        default_order=sorted(rows,key=lambda r:(r['score'],policy_key(r['policy'])))
        item=dict(id=layout['id'],selectedPolicy=selected['policy'],selectedScore=selected['score'],selectedPinky=selected['pinky'],
            runnerPolicy=runner['policy'],runnerScore=runner['score'],defaultScoreGap=runner['score']-selected['score'],
            defaultRelativeGap=(runner['score']/selected['score']-1),meanRankGap=pooled[1]['meanRank']-pooled[0]['meanRank'],
            selectedRank=pooled[0],runnerRank=pooled[1],pooledRanking=pooled,grids=results,
            defaultTop10=[dict(policy=r['policy'],score=r['score']) for r in default_order[:10]],
            sameWinnerAllGrids=all(g['ranking'][0]['policy']==selected_key for g in results.values()))
        report['results'].append(item);report['elapsedSeconds']=time.monotonic()-started
        args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(json.dumps({k:item[k] for k in ['id','selectedPolicy','selectedScore','runnerPolicy','defaultScoreGap','meanRankGap','sameWinnerAllGrids']}),flush=True)


if __name__=='__main__':
    main()
