"""Report physical P-load reduction and CKT tradeoffs after own robust policies."""
import csv
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from analyze_single_ckt_v51_aux_order import vectors,score_at,grid
from audit_f19_v52_robustness import fourth_scores
from rank_cr_toned_stable_policies import COSTS,policy_key
from search_1f9_remove_p import ROOT,PREFIX,read


def main():
    candidates=read(str(PREFIX)+'-candidates.json');audit=read(str(PREFIX)+'-robustness.json')
    source=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
    native=read(str(PREFIX)+'-verification.json');ergonomics=read(str(PREFIX)+'-ergonomics.json')
    by_layout={r['id']:r for r in candidates['layouts']};by_source={r['id']:r for r in source['results']}
    by_memory={r['id']:r for r in native['memories']};by_ergo={r['id']:r for r in ergonomics['results']}
    reference=vectors(source['reference'],COSTS);rows=[]
    for selection in audit['results']:
        ident=selection['id'];policy=by_source[ident]['policies'][selection['selected']['policyIndex']]
        score2=float(score_at(np.array([vectors(policy,COSTS)]),reference,np.full(6,2.))[0])
        m,e=by_memory[ident],by_ergo[ident];layout=by_layout[ident]
        eligible=ident not in ['1f9e267cd2','f19a0ad1dc','current-production'] and m['lower']<=22 and m['guard']<=24 and m['D']<=2
        if 'firstKeys'in layout:eligible=eligible and all(layout['firstKeys'][name]!='P' for name in ['zh','ch','sh'])
        rows.append(dict(id=ident,policy=policy_key(policy['policy']),cktV52=policy['score'],doubledV52=score2,
            M_lower=m['lower'],M_guard=m['guard'],D=m['D'],eligible=eligible,
            leftPinkyPeakPct=100*e['leftPinkyQAZPeak4NativeTracks']['value'],
            rightPinkyPeakPct=100*e['rightPinkyPeak4NativeTracks']['value'],
            homeS2Pct=100*e['homeS2'],homeFloorPct=100*e['homeFloor4NativeTracks'],
            maxFingerPeakPct=100*e['maxFingerPeak4NativeTracks']['value'],
            s2SameFingerOtherPct=100*e['s2DifferentKeySameFingerRate'],
            ownPolicyWorstRegretPct=100*selection['selected']['worstRegret']))
    baseline=next(r for r in rows if r['id']=='1f9e267cd2')
    for row in rows:
        row['defaultIncreasePct']=100*(row['cktV52']/baseline['cktV52']-1)
        row['doubledIncreasePct']=100*(row['doubledV52']/baseline['doubledV52']-1)
    choices=[r for r in rows if r['eligible'] and r['rightPinkyPeakPct']<baseline['rightPinkyPeakPct']]
    guarded=[r for r in choices if r['leftPinkyPeakPct']<=baseline['leftPinkyPeakPct']+1e-10]
    selected={}
    for name,pool in [('lowerRight',choices),('noLeftGrowth',guarded)]:
        for field in ['cktV52','doubledV52']:
            if pool:selected[name+'_'+field]=min(pool,key=lambda r:r[field])
    for ceiling in [5.,4.]:
        pool=[r for r in guarded if r['rightPinkyPeakPct']<=ceiling]
        if pool:selected[f'rightAtMost{ceiling:g}_doubledV52']=min(pool,key=lambda r:r['doubledV52'])
    compare_ids=[baseline['id']]+list(dict.fromkeys(r['id'] for r in selected.values()))
    comparison_rows=[]
    for ident in compare_ids:
        choice=next(r for r in audit['results'] if r['id']==ident)
        comparison_rows.append(by_source[ident]['policies'][choice['selected']['policyIndex']])
    comparison_vectors=np.array([vectors(r,COSTS) for r in comparison_rows]);sensitivity={}
    for name,lo,hi,step in [('mainPositive',.5,5,.5),('extremePositive',1,10,1)]:
        points=grid(lo,hi,step);relative=np.empty((len(points),len(compare_ids)))
        for start in range(0,len(points),16384):
            batch=points[start:start+16384];scores=10*fourth_scores(comparison_vectors,reference,batch)**.25
            relative[start:start+len(batch)]=100*(scores/scores[:,0,None]-1)
        sensitivity[name]=dict(points=len(points),comparison='Each fixed robust policy against fixed robust 1f9, same S005 denominator at every point.',
            rows=[dict(id=ident,minRelativePct=float(relative[:,i].min()),p05RelativePct=float(np.quantile(relative[:,i],.05)),
                medianRelativePct=float(np.median(relative[:,i])),p95RelativePct=float(np.quantile(relative[:,i],.95)),
                maxRelativePct=float(relative[:,i].max()),improvesShare=float(np.mean(relative[:,i]<-1e-9))) for i,ident in enumerate(compare_ids) if i])
    with Path(str(PREFIX)+'-comparison.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(sorted(rows,key=lambda r:r['doubledV52']))
    summary=dict(version='1f9-remove-p-report-v1',scored=candidates['scored'],constraints=candidates['constraints'],
        baseline=baseline,selections=selected,rows=rows,versus1f9Sensitivity=sensitivity,productionStatus=native.get('productionStatus'),
        sourceHashes={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in
            [*[Path(str(PREFIX)+s) for s in ['-candidates.json','-policies.json.gz','-robustness.json','-ergonomics.json','-verification.json','-scores.json.gz']],
             Path(__file__),ROOT/'tools/search_1f9_remove_p.py',ROOT/'tools/prepare_1f9_remove_p_controls.py']})
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    show={baseline['id']:baseline}
    for row in selected.values():show[row['id']]=row
    f19=next(r for r in rows if r['id']=='f19a0ad1dc');show[f19['id']]=f19
    lines=['# 1f9：移走 P 上的 sh，保持 M/D 预算的搜索','',
        f'基线为 1f9e267cd2，M={baseline["M_lower"]}/{baseline["M_guard"]}、D={baseline["D"]}，右小指四轨峰值 {baseline["rightPinkyPeakPct"]:.4f}%。','',
        '## 搜索口径','',
        '- 保持 21 键声韵域、A/E/O 共用一个首键；M 下界≤22、保守值≤24、D≤2。所有候选的 zh/ch/sh 均不得占 P。',
        '- 先做直接移动和恢复普通声母的补偿控制，再完整枚举 p 或 s 接手 P 时的 20³ 种翘舌配置；随后有限展开声母、韵组换位、整韵根归组和调区键微调。额外核对六个 k/l 偏移、AEO 统一的主行翘舌对照，以及此前 v5.2 档案中符合本轮预算的三个默认成本前列方案；后者是已知方案，不计为本轮搜索新发现。',
        f'- 固定 21/231/14 筛选共 {candidates["scored"]:,} 个不同状态，保留 {len(rows)} 个布局（含基线和对照）完整枚举 144 辅序。旧移手分不参与。',
        '- 最终每个布局选择自己的固定稳健辅序：沿用六项认知成本 0–5 倍、步长0.5，以及0–10倍、步长1的完整网格，最小化相对自身逐点最优辅序的最大损失。默认与加倍分均使用这同一个辅序。',
        '- 左小指不增加是额外推荐筛选条件；同时保留不施加该条件的性能前列供判断。不是完整布局空间穷举。','',
        '## 最终对比','',
        '| 方案 | 稳健辅序 | 默认 CKT↓ | 成本加倍 CKT↓ | M 下界/保守 | D | 左/右小指峰值 | 单指峰值 |',
        '|---|---|---:|---:|---:|---:|---:|---:|']
    for row in sorted(show.values(),key=lambda r:r['doubledV52']):
        lines.append(f'| {row["id"]} | {row["policy"]} | {row["cktV52"]:.9f} | {row["doubledV52"]:.9f} | {row["M_lower"]}/{row["M_guard"]} | {row["D"]} | {row["leftPinkyPeakPct"]:.3f}% / {row["rightPinkyPeakPct"]:.3f}% | {row["maxFingerPeakPct"]:.3f}% |')
    lines+=['','人体工学按含形辅的单字、二、三、四字词终码计算，峰值取四轨最大；这些占比不是5500字连续声韵键流。主行率、同指异键率与全部候选见 comparison.csv；逐键/逐指负荷见 ergonomics.json。f19 是性能对照，M=24 不符合本次候选预算。','',
        '## 最有希望的候选变化','']
    for label,row in selected.items():
        layout=by_layout[row['id']];base=by_layout['1f9e267cd2']
        changes=[f'{name}: {old}→{layout["firstKeys"][name]}' for name,old in base['firstKeys'].items() if old!=layout['firstKeys'][name]]
        lines +=[f'- {label}：{row["id"]}，默认 CKT 相对变化 {row["defaultIncreasePct"]:+.5f}%，加倍成本下 {row["doubledIncreasePct"]:+.5f}%。首键变化：'+ '；'.join(changes)+'。']
        lines +=[f'  韵根分组相同：{layout["state"]["partition"]==base["state"]["partition"]}；三调区组键相同：{layout["state"]["groupKeys"]==base["state"]["groupKeys"]}。']
        for region,(old,new) in enumerate(zip(base['state']['groupKeys'],layout['state']['groupKeys'])):
            for group,(a,b) in enumerate(zip(old,new)):
                if a!=b:
                    finals='/'.join(layout['rhymeGroups'][group]['finals'])
                    lines.append(f'  { ["四声上区","二三声中区","一声/轻声下区"][region]}，组{group}（{finals}）：{a}→{b}。')
    lines+=['','## 宽参数下相对 1f9 的取舍','',
        '以下每个布局固定自己的稳健辅序，逐点与 1f9 固定稳健辅序比较；正百分数表示候选 CKT 更高，负值表示更低。各正成本网格均为一百万点，改善占比是网格计数，不是现实用户概率。','',
        '| 网格 | 候选 | 最小相对变化 | 中位变化 | 最大相对变化 | 优于 1f9 的网格占比 |',
        '|---|---|---:|---:|---:|---:|']
    for name,grid_result in sensitivity.items():
        for row in grid_result['rows']:
            lines.append(f'| {name} | {row["id"]} | {row["minRelativePct"]:+.4f}% | {row["medianRelativePct"]:+.4f}% | {row["maxRelativePct"]:+.4f}% | {100*row["improvesShare"]:.2f}% |')
    lines+=['','## 验证','',
        '原生完整 JavaScript 竞赛独立复核每个最终布局选定的稳健辅序，逐轨核对 v5.2、辅码/选重率及全部键频。M 从码表、韵组重新推导。生产配置只读取，不修改；历史旧生产基线继续冻结，当前生产映射与 f19 对照核对。','',
        '运行 `just cr-1f9-remove-p-search`、`just cr-1f9-remove-p-audit`、`just cr-1f9-remove-p-test` 复现。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print('selections',json.dumps(selected,ensure_ascii=False),flush=True)


if __name__=='__main__':main()
