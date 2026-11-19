"""Own robust policies, two cost settings, and explicit ergonomics versus 7e."""
import csv
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from refine_7e_v52 import ROOT,PREFIX,BASE,read
from analyze_single_ckt_v51_aux_order import vectors,score_at,grid
from audit_f19_v52_robustness import fourth_scores
from rank_cr_toned_stable_policies import COSTS,policy_key


def main():
    candidates=read(str(PREFIX)+'-candidates.json');audit=read(str(PREFIX)+'-robustness.json')
    raw=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
    native=read(str(PREFIX)+'-verification.json');ergo=read(str(PREFIX)+'-ergonomics.json')
    source={r['id']:r for r in raw['results']};layouts={r['id']:r for r in candidates['layouts']}
    new=json.loads(gzip.decompress(Path(str(PREFIX)+'-scores.json.gz').read_bytes()))
    fixed_pool=list(new.values())+[candidates['baseline']]
    budget_best={}
    for field in ['cktV52','doubledV52']:
        best=min(fixed_pool,key=lambda r:r['metrics'][field])
        budget_best[field]=dict(id=best['key'][:10],value=best['metrics'][field],
            changePct=100*(best['metrics'][field]/candidates['baseline']['metrics'][field]-1))
    memories={r['id']:r for r in native['memories']};loads={r['id']:r for r in ergo['results']}
    reference=vectors(raw['reference'],COSTS);rows=[];fixed={}
    for result in audit['results']:
        ident=result['id'];policy=source[ident]['policies'][result['selected']['policyIndex']];fixed[ident]=policy
        m,e=memories[ident],loads[ident]
        doubled=float(score_at(np.array([vectors(policy,COSTS)]),reference,np.full(6,2.))[0])
        first=layouts[ident].get('firstKeys',{})
        budget=m['lower']<=21 and m['guard']<=24 and m['D']<=2
        budget=budget and all(n in first and first[n]!='P' for n in ['zh','ch','sh']) and len({first.get('zero-'+n) for n in 'AEO'})==1
        rows.append(dict(id=ident,isNewState=layouts[ident].get('key') in new,policy=policy_key(policy['policy']),
            cktV52=policy['score'],doubledV52=doubled,M_lower=m['lower'],M_guard=m['guard'],D=m['D'],budgetEligible=budget,
            leftPinkyPeakPct=100*e['leftPinkyQAZPeak4NativeTracks']['value'],rightPinkyPeakPct=100*e['rightPinkyPeak4NativeTracks']['value'],
            maxFingerPeakPct=100*e['maxFingerPeak4NativeTracks']['value'],sameFingerOtherPct=100*e['s2DifferentKeySameFingerRate'],
            characterHomePct=100*e['homeS2'],homeFloorPct=100*e['homeFloor4NativeTracks'],ownPolicyWorstRegretPct=100*result['selected']['worstRegret'],
            word2FirstAuxPct=100*policy['tracks']['word2']['firstAuxRate'],word2SecondAuxPct=100*policy['tracks']['word2']['secondAuxRate'],
            word2SelectionPct=100*policy['tracks']['word2']['selectionRate'],word2MotorMs=policy['tracks']['word2']['motorUpperMs'],word2EffectiveMs=policy['tracks']['word2']['effectiveMs']))
    baseline=next(r for r in rows if r['id']==BASE)
    for row in rows:
        row['noPinkyGrowth']=all(row[f]<=baseline[f]+1e-10 for f in ['leftPinkyPeakPct','rightPinkyPeakPct'])
        row['noErgonomicGrowth']=row['noPinkyGrowth'] and all(row[f]<=baseline[f]+1e-10 for f in ['maxFingerPeakPct','sameFingerOtherPct'])
        row['defaultChangePct']=100*(row['cktV52']/baseline['cktV52']-1)
        row['doubledChangePct']=100*(row['doubledV52']/baseline['doubledV52']-1)
        row['twoCostImprovement']=row['id']!=BASE and all(row[f]<=baseline[f]+1e-10 for f in ['cktV52','doubledV52']) and any(row[f]<baseline[f]-1e-10 for f in ['cktV52','doubledV52'])
    selections={}
    for strict in [True,False]:
        tag='strict' if strict else 'pinkyOnly'
        eligible=[r for r in rows if r['budgetEligible'] and r['id']!=BASE and (r['noErgonomicGrowth'] if strict else r['noPinkyGrowth'])]
        both=[r for r in eligible if r['twoCostImprovement']]
        if both:selections[tag+'TwoCost']=min(both,key=lambda r:(r['doubledV52'],r['cktV52']))
        for field in ['cktV52','doubledV52']:
            new_rows=[r for r in eligible if r['isNewState']]
            if new_rows:selections[tag+'New_'+field]=min(new_rows,key=lambda r:r[field])
    with Path(str(PREFIX)+'-comparison.csv').open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    compare_ids=[BASE]+list(dict.fromkeys(r['id'] for r in selections.values()))
    a=np.array([vectors(fixed[ident],COSTS) for ident in compare_ids]);sensitivity={}
    for name,lo,hi,step in [('mainPositive',.5,5,.5),('extremePositive',1,10,1)]:
        points=grid(lo,hi,step);delta=np.empty((len(points),len(compare_ids)))
        for start in range(0,len(points),16384):
            batch=points[start:start+16384];scores=10*fourth_scores(a,reference,batch)**.25
            delta[start:start+len(batch)]=100*(scores/scores[:,0,None]-1)
        sensitivity[name]=dict(points=len(points),rows=[dict(id=ident,minChangePct=float(delta[:,i].min()),
            medianChangePct=float(np.median(delta[:,i])),maxChangePct=float(delta[:,i].max()),
            improvesShare=float(np.mean(delta[:,i]<-1e-9))) for i,ident in enumerate(compare_ids) if i])
    inputs=[Path(str(PREFIX)+s) for s in ['-candidates.json','-scores.json.gz','-policies.json.gz','-robustness.json','-verification.json','-ergonomics.json']]+[Path(__file__)]
    summary=dict(version='7e-refinement-report-v1',baseline=baseline,selections=selections,rows=rows,
        versus7eSensitivity=sensitivity,newStates=candidates['newStates'],importedStates=candidates['importedStates'],
        fixedPolicyBudgetBestIgnoringLoads=budget_best,
        productionStatus=native['productionStatus'],sourceHashes={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs})
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    show={BASE:baseline}
    for row in selections.values():show[row['id']]=row
    for ident in ['cd3cc7adfe','f19a0ad1dc']:
        row=next(r for r in rows if r['id']==ident);show[ident]=row
    lines=['# 7e 的 M21 有界优化与稳健辅序复核','',
        f'新增精算 {candidates["newStates"]:,} 个布局状态，复用前三轮 {candidates["importedStates"]:,} 个固定辅序评分。新状态 M 下界≤21、保守值≤24、D≤2，A/E/O 共键、翘舌不占 P。最终筛选在各自稳健辅序下再检查左右小指；严格分支额外要求四轨最大单指负荷和单字同指异键率均不增加。','',
        '不使用退火。本轮新增跨调区双键改动、两个完整韵根独立移动、跨调区各一次韵组交换、7e 的韵根与键位联合调整；将历史上按两种成本 CKT 之和靠前的 12 种不同声母映射，分别配合一次韵侧邻域改动，并保留少量近邻作有限轮下降。只约束联合改动的最终布局，允许中间暂时超预算。声母短名单与各阶段新增数量见 candidates.json。','',
        '搜索阶段固定辅序为 21/231/14，只有代表布局再枚举全部辅序；四条词长轨按 1:3:1:1 归一化四次方聚合。因此本轮不构成所有布局与所有辅序的联合穷举。','',
        f'{len(rows)} 个代表布局分别枚举 144 种辅序，再在六项认知成本 0–5 倍（步长0.5）及 0–10 倍（步长1）的完整网格上，以相对自身逐点最优辅序的最大损失选稳健辅序。默认与加倍列均固定各自稳健辅序，每个参数点同步重算 S005 参考。','',
        '| 方案 | 稳健辅序 | 默认 CKT↓ | 六成本加倍 CKT↓ | M 下界/保守 | D | 左/右小指峰值 | 单指峰值 | 单字同指异键 |','|---|---|---:|---:|---:|---:|---:|---:|---:|']
    for row in sorted(show.values(),key=lambda r:r['doubledV52']):
        lines.append(f'| {row["id"]} | {row["policy"]} | {row["cktV52"]:.9f} | {row["doubledV52"]:.9f} | {row["M_lower"]}/{row["M_guard"]} | {row["D"]} | {row["leftPinkyPeakPct"]:.4f}% / {row["rightPinkyPeakPct"]:.4f}% | {row["maxFingerPeakPct"]:.4f}% | {row["sameFingerOtherPct"]:.4f}% |')
    lines+=['','## 结论','']
    if 'strictTwoCost' in selections:
        r=selections['strictTwoCost'];lines.append(f'严格分支找到 {r["id"]}，默认 CKT {r["defaultChangePct"]:+.6f}%，加倍 CKT {r["doubledChangePct"]:+.6f}%；两种成本和四项手指指标均守住 7e，M={r["M_lower"]}/{r["M_guard"]}、D={r["D"]}。这不是所有成本点都更优的证明。')
    else:lines.append('本轮没有发现同时降低两种成本 CKT、且守住 M21 和四项手指约束的严格升级项。')
    lines+=['',f'将本轮所有新增状态与 7e 合并比较，移除小指、单指峰值及同指异键率筛选，仅保留搜索时的 M/D/共键/无 P 翘舌预算，固定辅序下默认最低仍为 {budget_best["cktV52"]["id"]}（{budget_best["cktV52"]["value"]:.9f}），加倍最低为 {budget_best["doubledV52"]["id"]}（{budget_best["doubledV52"]["value"]:.9f}）。这里仅比较固定搜索辅序，未对全部新增状态枚举 144 种辅序。']
    if 'pinkyOnlyTwoCost' in selections:
        r=selections['pinkyOnlyTwoCost'];lines+=['',f'仅约束左右小指的双口径改善项为 {r["id"]}：默认 {r["defaultChangePct"]:+.6f}%，加倍 {r["doubledChangePct"]:+.6f}%；额外人体工学约束是否通过：{r["noErgonomicGrowth"]}。']
    lines+=['','人体工学统计使用四条原生词长轨的最终选定码串，包含形辅；各“峰值”取四轨最大。同指异键统计是单字轨终码内相邻击键，不代表跨词连续文本。详表同时提供主行率及逐键负荷，不使用旧移手分。','',
        '## 二字词消歧与成本','',
        '均为各自稳健辅序下的原生二字词轨，二／四字词共享候选池，按词频加权。补辅需求和最终选重率不是不加权的词典同码词比例。','',
        '| 方案 | 需至少一形辅 | 需第二形辅 | 最终仍需选重 | 运动模型 ms | 默认总成本 ms |','|---|---:|---:|---:|---:|---:|']
    for row in sorted(show.values(),key=lambda r:r['doubledV52']):
        lines.append(f'| {row["id"]} | {row["word2FirstAuxPct"]:.5f}% | {row["word2SecondAuxPct"]:.5f}% | {row["word2SelectionPct"]:.6f}% | {row["word2MotorMs"]:.6f} | {row["word2EffectiveMs"]:.6f} |')
    lines+=['','## 相对 7e 的实际变化','']
    base_layout=layouts[BASE];roots=read(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs/seeds.json')['roots'];seen=set()
    for row in selections.values():
        if row['id'] in seen:continue
        seen.add(row['id']);layout=layouts[row['id']]
        changes=[f'{name}:{old}→{layout["firstKeys"][name]}' for name,old in base_layout['firstKeys'].items() if old!=layout['firstKeys'][name]]
        lines +=[f'- {row["id"]}：默认 {row["defaultChangePct"]:+.6f}%，加倍 {row["doubledChangePct"]:+.6f}%；四项手指约束通过={row["noErgonomicGrowth"]}。',
            '  声母：'+('；'.join(changes) if changes else '不变')+'。']
        for i,(old,new_group) in enumerate(zip(base_layout['state']['partition'],layout['state']['partition'])):
            if old!=new_group:lines.append(f'  整韵根 {roots[i]}：组{old}→组{new_group}。')
        for region,(old,new_keys) in enumerate(zip(base_layout['state']['groupKeys'],layout['state']['groupKeys'])):
            for group,(ka,kb) in enumerate(zip(old,new_keys)):
                if ka!=kb:lines.append(f'  {["四声上区","二三声中区","一声/轻声下区"][region]}组{group}（'+ '/'.join(layout['rhymeGroups'][group]['finals'])+f'）：{ka}→{kb}。')
    lines+=['','## 宽参数敏感性','',
        '每个方案固定各自稳健辅序。正数为劣于 7e；网格占比是离散计数，不是现实用户概率。','',
        '| 网格 | 方案 | 最小变化 | 中位变化 | 最大变化 | 优于 7e 占比 |','|---|---|---:|---:|---:|---:|']
    for name,g in sensitivity.items():
        for r in g['rows']:lines.append(f'| {name} | {r["id"]} | {r["minChangePct"]:+.6f}% | {r["medianChangePct"]:+.6f}% | {r["maxChangePct"]:+.6f}% | {100*r["improvesShare"]:.3f}% |')
    lines+=['','## 验证与复现','',
        '每个入选方案的稳健辅序均由完整 JavaScript 原生竞赛独立复核，核对逐轨性能、辅码率、选重及键频。M 由实际码表独立推导。生产目录只读对照，本轮不修改生产配置。',
        '这是有限中心及有限轮数的局部搜索，不是全空间最优证明；极微小改善的实际打字收益尚无真人实验支持。',
        '复现：`just cr-7e-refine-search`、`just cr-7e-refine-audit`、`just cr-7e-refine-test`。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps(selections,ensure_ascii=False),flush=True)


if __name__=='__main__':main()
