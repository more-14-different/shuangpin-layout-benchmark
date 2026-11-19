"""Rank R1/R2/C1's exact 144 policies on independent six-cost CKT5.2 grids.

Use the previous 21x26 publication rule: best mean competition rank on the
positive 0.5..5 grid, then top3/top1 coverage and lexical policy. Report all
zero-inclusive, extreme and moderate grids, plus explicit first/second gaps.
"""
import argparse
import concurrent.futures
import gzip
import hashlib
import json
from pathlib import Path
import time

import numpy as np
from analyze_single_ckt_v51_aux_order import grid,vectors,score_at,competition_ranks,WEIGHTS
from rank_cr_toned_stable_policies import COSTS

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-r1-r2-c1-robustness'
SOURCES=[ROOT/'research/notes/2026-11-19-toned-2126-v52-m4-refine-policies.json.gz',
         ROOT/'research/notes/2026-11-19-toned-2126-v52-r1-coupled-policies.json.gz']
REFERENCE=ROOT/'research/notes/2026-11-18-ckt-v52-all-schemes.json'
SPECS=[('R1','T2126-V52-M4-a38a5f3fb250','12/12/24'),('R2','T2126-V52-M4-ec60a3637a99','21/12/23'),('C1','T2126-V52-R1-bf064ef92931','12/12/23')]

def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def key(row):return '/'.join(row['state']['policy'])
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def coefficients(rows):return np.asarray([vectors(r,COSTS) for r in rows])


def score_batch(a,b,points):
    effective=a[:,:,0][None,:,:]+np.einsum('ba,pta->bpt',points,a[:,:,1:],optimize=False)
    denominator=b[:,0][None,:]+points@b[:,1:].T
    return 10*(np.sum(WEIGHTS[None,None,:]*(effective/denominator[:,None,:])**4,axis=2)/WEIGHTS.sum())**.25


def masks(points):
    return dict(all=np.ones(len(points),bool),positive=np.all(points>0,axis=1),moderate=np.all((points>=.5)&(points<=2),axis=1))


def analyze_grid(rows,ref,points,chunk):
    a=coefficients(rows);keys=[key(r) for r in rows];n=len(rows)
    totals={part:dict(count=0,ranks=np.zeros(n,np.int64),top1=np.zeros(n,np.int64),top3=np.zeros(n,np.int64),
        worst=np.zeros(n,np.int16),regret=np.zeros(n),relative=np.zeros(n),maxRegret=np.zeros(n),maxRelative=np.zeros(n)) for part in masks(points)}
    for start in range(0,len(points),chunk):
        batch=points[start:start+chunk];scores=score_batch(a,ref,batch);rank=competition_ranks(scores)
        oracle=scores.min(axis=1);regret=scores-oracle[:,None];relative=scores/oracle[:,None]-1
        for part,mask in masks(batch).items():
            if not mask.any():continue
            t=totals[part];t['count']+=int(mask.sum());rs=rank[mask]
            t['ranks']+=rs.sum(axis=0,dtype=np.int64);t['top1']+=(rs==1).sum(axis=0);t['top3']+=(rs<=3).sum(axis=0)
            t['worst']=np.maximum(t['worst'],rs.max(axis=0));t['regret']+=regret[mask].sum(axis=0);t['relative']+=relative[mask].sum(axis=0)
            t['maxRegret']=np.maximum(t['maxRegret'],regret[mask].max(axis=0));t['maxRelative']=np.maximum(t['maxRelative'],relative[mask].max(axis=0))
    result={}
    for part,t in totals.items():
        if not t['count']:continue
        result[part]=dict(points=t['count'],ranking=sorted([dict(policy=k,meanRank=float(t['ranks'][i]/t['count']),
            top1Rate=float(t['top1'][i]/t['count']),top3Rate=float(t['top3'][i]/t['count']),worstRank=int(t['worst'][i]),
            meanRegret=float(t['regret'][i]/t['count']),meanRelativeRegret=float(t['relative'][i]/t['count']),
            worstRegret=float(t['maxRegret'][i]),worstRelativeRegret=float(t['maxRelative'][i])) for i,k in enumerate(keys)],
            key=lambda r:(r['meanRank'],-r['top3Rate'],-r['top1Rate'],r['policy'])))
    return result


def pair_gaps(first,second,ref,points,chunk):
    a=coefficients([first,second]);parts={k:[] for k in masks(points)};locations={k:[] for k in parts}
    for start in range(0,len(points),chunk):
        batch=points[start:start+chunk];scores=score_batch(a,ref,batch);delta=scores[:,1]-scores[:,0]
        for part,mask in masks(batch).items():
            if mask.any():parts[part].append(delta[mask]);locations[part].append(np.flatnonzero(mask)+start)
    result={}
    for part,blocks in parts.items():
        if not blocks:continue
        values=np.concatenate(blocks);indices=np.concatenate(locations[part]);at=int(indices[int(np.argmin(values))]);x=points[at]
        scores=score_at(a,ref,x)
        result[part]=dict(points=len(values),minGap=float(values.min()),p05Gap=float(np.quantile(values,.05)),
            medianGap=float(np.median(values)),p95Gap=float(np.quantile(values,.95)),maxGap=float(values.max()),meanGap=float(values.mean()),
            firstWins=float(np.mean(values>1e-9)),secondWins=float(np.mean(values < -1e-9)),ties=float(np.mean(np.abs(values)<=1e-9)),
            worstCase=dict(multipliers=x.tolist(),costsMs={k:float(x[i]*COSTS[k]) for i,k in enumerate(COSTS)},firstScore=float(scores[0]),secondScore=float(scores[1])))
    return result


def audit(label,item,published,reference,grids,chunk):
    rows=item['policies'];assert len(rows)==len({key(r) for r in rows})==144
    a=coefficients(rows);default=score_at(a,reference,np.ones(6));double=score_at(a,reference,np.full(6,2.))
    np.testing.assert_allclose(default,[r['score'] for r in rows],atol=1e-9,rtol=0)
    np.testing.assert_allclose(double,[r['doubleScore'] for r in rows],atol=1e-9,rtol=0)
    outcomes={}
    for name,points in grids.items():
        outcomes[name]=analyze_grid(rows,reference,points,chunk)
        print(label,name,'winner',outcomes[name]['positive']['ranking'][0],flush=True)
    positive=outcomes['main']['positive']['ranking'];first,runner=positive[:2]
    by={key(r):r for r in rows};selected=by[first['policy']];second=by[runner['policy']]
    pair={name:pair_gaps(selected,second,reference,points,chunk) for name,points in grids.items()}
    current_pair={name:pair_gaps(selected,by[published],reference,points,chunk) for name,points in grids.items()}
    pooled={k:[] for k in by}
    for outcome in outcomes.values():
        for part in ['all','positive']:
            for r in outcome[part]['ranking']:pooled[r['policy']].append(r)
    pooled_rank=sorted([dict(policy=k,meanRank=float(np.mean([r['meanRank'] for r in v]))) for k,v in pooled.items()],key=lambda r:(r['meanRank'],r['policy']))
    positive_regret=sorted([dict(policy=k,meanRelativeRegret=float(np.mean([next(r for r in outcomes[g]['positive']['ranking'] if r['policy']==k)['meanRelativeRegret'] for g in grids]))) for k in by],key=lambda r:(r['meanRelativeRegret'],r['policy']))
    return dict(label=label,id=item['id'],enumeratedPolicies=144,publishedPolicy=published,
        selectedPolicy=first['policy'],runnerPolicy=runner['policy'],selected=first,runner=runner,meanRankGap=runner['meanRank']-first['meanRank'],
        selectedDefaultScore=selected['score'],selectedDoubleScore=selected['doubleScore'],runnerDefaultScore=second['score'],
        defaultGap=second['score']-selected['score'],publishedDefaultScore=by[published]['score'],publishedDoubleScore=by[published]['doubleScore'],
        publishedMainRank=next(r for r in positive if r['policy']==published),selectedVsRunner=pair,selectedVsPublished=current_pair,
        sameWinnerEachWideSubset=all(outcomes[g][p]['ranking'][0]['policy']==first['policy'] for g in grids for p in ['all','positive']),
        pooledFourGridRanking=pooled_rank,positiveRelativeRegretRanking=positive_regret,grids=outcomes)


def report_markdown(report):
    lines=['# R1 / R2 / C1：CKT5.2 宽扰动辅序审计','',
        '固定布局，各自144辅序；首/次/三辅300/300/300ms，选重600ms、扫描50ms、翻页300ms。六项独立扰动，S005同点重算；字/二/三/四轨权重1:3:1:1，不筛选小指。',
        '沿用既有21×26发布口径，以0.5–5倍、步长0.5、1,000,000点的平均竞争名次最低者为稳健第一；同分依次看Top3、Top1覆盖及辅序字典序。不是宣称处处第一。另查含零0–5倍、1–10倍及含零0–10倍；温和0.5–2倍单列。',
        '','|方案|HTML当前辅序|当前在主网格平均名次|稳健第一|平均名次|稳健第二|平均名次|平均名次差|稳健第一默认CKT|',
        '|---|---|---:|---|---:|---|---:|---:|---:|']
    for r in report['results']:lines.append(f"|{r['label']}|{r['publishedPolicy']}|{r['publishedMainRank']['meanRank']:.6f}|{r['selectedPolicy']}|{r['selected']['meanRank']:.6f}|{r['runnerPolicy']}|{r['runner']['meanRank']:.6f}|{r['meanRankGap']:.6f}|{r['selectedDefaultScore']:.9f}|")
    lines+=['','差值定义：第二名分数−第一名分数，正值为第一名胜；“第二”是固定平均排名第二的辅序，不是每个点当场的第二名。逐点最优覆盖及最坏损失均相对全部144辅序。','']
    for r in report['results']:
        lines += [f"## {r['label']}：{r['selectedPolicy']} 对 {r['runnerPolicy']}",'',
            f"默认CKT差{r['defaultGap']:+.9f}；第一辅序加倍点CKT={r['selectedDoubleScore']:.9f}。四个宽网格是否同一赢家：{r['sameWinnerEachWideSubset']}。",'',
            '|网格|子集|第一覆盖全部144最优|第一平均名次|第一/二两者胜率|最小gap|中位gap|最大gap|','|---|---|---:|---:|---|---:|---:|---:|']
        for g,outcome in r['grids'].items():
            for part,rank in outcome.items():
                first=next(v for v in rank['ranking'] if v['policy']==r['selectedPolicy']);pair=r['selectedVsRunner'][g][part]
                lines.append(f"|{g}|{part}|{100*first['top1Rate']:.4f}%|{first['meanRank']:.6f}|{100*pair['firstWins']:.4f}%/{100*pair['secondWins']:.4f}%|{pair['minGap']:+.9f}|{pair['medianGap']:+.9f}|{pair['maxGap']:+.9f}|")
        lines+=['','反超最严重的正成本主网格点：'+json.dumps(r['selectedVsRunner']['main']['positive']['worstCase'],ensure_ascii=False),'',
            '四宽网格等权平均名次前二：'+json.dumps(r['pooledFourGridRanking'][:2],ensure_ascii=False),'',
            '两正成本网格等权平均相对损失前二：'+json.dumps(r['positiveRelativeRegretRanking'][:2],ensure_ascii=False),'']
    lines+=['HTML当前仍保留原发布辅序；本次为审计，没有替换页面辅序或布局。完整各144辅序排名及gap统计见同名JSON。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf8')


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--workers',type=int,default=2);p.add_argument('--chunk',type=int,default=2048)
    args=p.parse_args();start=time.monotonic()
    source={r['id']:r for file in SOURCES for r in json.loads(gzip.decompress(file.read_bytes()))['results']}
    reference=vectors(dict(tracks=read(REFERENCE)['references']['v52']['keytao']),COSTS)
    grids=dict(main=grid(0,5,.5),extreme=grid(0,10,1))
    out=Path(str(PREFIX)+'.json');hashes={str(p.relative_to(ROOT)):sha(p) for p in SOURCES+[REFERENCE,Path(__file__),ROOT/'tools/analyze_single_ckt_v51_aux_order.py']}
    report=dict(version='toned-2126-r1-r2-c1-wide-policy-audit-v1',complete=False,baselineCostsMs=COSTS,
        selectionRule='lowest mean competition rank on main positive 0.5..5 step0.5; tie-break top3/top1 then lexical policy',
        grids=dict(main=dict(minimum=0,maximum=5,step=.5,allPoints=1771561,positivePoints=1000000),extreme=dict(minimum=0,maximum=10,step=1,allPoints=1771561,positivePoints=1000000)),
        sourceHashes=hashes,results=[])
    if out.exists():
        old=read(out)
        if old['sourceHashes']!=hashes:raise ValueError('source changed')
        report=old
    done={r['label'] for r in report['results']}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures=[pool.submit(audit,label,source[ident],published,reference,grids,args.chunk) for label,ident,published in SPECS if label not in done]
        for future in concurrent.futures.as_completed(futures):
            item=future.result();report['results'].append(item);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
            print('DONE',item['label'],item['selectedPolicy'],item['runnerPolicy'],item['meanRankGap'],flush=True)
    report['results'].sort(key=lambda r:[s[0] for s in SPECS].index(r['label']));report.update(complete=True,elapsedLastInvocationSeconds=time.monotonic()-start)
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');report_markdown(report)
    print('COMPLETE',report['elapsedLastInvocationSeconds'],flush=True)


if __name__=='__main__':main()
