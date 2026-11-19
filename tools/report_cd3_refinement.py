"""Compare cd3 refinements under their own robust policies and load budgets."""
import csv
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from refine_cd3_v52 import ROOT,PREFIX,OLD,read
from analyze_single_ckt_v51_aux_order import vectors,score_at,grid
from audit_f19_v52_robustness import fourth_scores
from rank_cr_toned_stable_policies import COSTS,policy_key


def main():
    candidates=read(str(PREFIX)+'-candidates.json');audit=read(str(PREFIX)+'-robustness.json')
    raw=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
    native=read(str(PREFIX)+'-verification.json');ergo=read(str(PREFIX)+'-ergonomics.json')
    source={r['id']:r for r in raw['results']};layouts={r['id']:r for r in candidates['layouts']}
    new_states=json.loads(gzip.decompress(Path(str(PREFIX)+'-scores.json.gz').read_bytes()))
    memories={r['id']:r for r in native['memories']};loads={r['id']:r for r in ergo['results']}
    reference=vectors(raw['reference'],COSTS);rows=[];fixed={}
    for result in audit['results']:
        ident=result['id'];policy=source[ident]['policies'][result['selected']['policyIndex']];fixed[ident]=policy
        m,e=memories[ident],loads[ident]
        doubled=float(score_at(np.array([vectors(policy,COSTS)]),reference,np.full(6,2.))[0])
        budget=m['lower']<=22 and m['guard']<=24 and m['D']<=2 and all(layouts[ident]['firstKeys'][n]!='P' for n in ['zh','ch','sh']) if 'firstKeys'in layouts[ident] else False
        rows.append(dict(id=ident,isNewState=layouts[ident].get('key') in new_states,policy=policy_key(policy['policy']),cktV52=policy['score'],doubledV52=doubled,
            M_lower=m['lower'],M_guard=m['guard'],D=m['D'],budgetEligible=budget,
            leftPinkyPeakPct=100*e['leftPinkyQAZPeak4NativeTracks']['value'],rightPinkyPeakPct=100*e['rightPinkyPeak4NativeTracks']['value'],
            characterHomePct=100*e['homeS2'],homeFloorPct=100*e['homeFloor4NativeTracks'],
            maxFingerPeakPct=100*e['maxFingerPeak4NativeTracks']['value'],sameFingerOtherPct=100*e['s2DifferentKeySameFingerRate'],
            ownPolicyWorstRegretPct=100*result['selected']['worstRegret']))
    baseline=next(r for r in rows if r['id']=='cd3cc7adfe')
    for row in rows:
        row['noLoadGrowth']=row['leftPinkyPeakPct']<=baseline['leftPinkyPeakPct']+1e-10 and row['rightPinkyPeakPct']<=baseline['rightPinkyPeakPct']+1e-10
        row['defaultChangePct']=100*(row['cktV52']/baseline['cktV52']-1)
        row['doubledChangePct']=100*(row['doubledV52']/baseline['doubledV52']-1)
        row['dominatesCd3']=row['id']!='cd3cc7adfe' and row['budgetEligible'] and row['noLoadGrowth'] and row['cktV52']<=baseline['cktV52']+1e-10 and row['doubledV52']<=baseline['doubledV52']+1e-10
    eligible=[r for r in rows if r['budgetEligible'] and r['noLoadGrowth'] and r['id']!='cd3cc7adfe']
    dominant=[r for r in eligible if r['dominatesCd3']]
    selections={}
    if dominant:selections['simultaneousImprovement']=min(dominant,key=lambda r:(r['doubledV52'],r['cktV52']))
    for field in ['cktV52','doubledV52']:
        if eligible:selections['best_'+field]=min(eligible,key=lambda r:r[field])
        new=[r for r in eligible if r['isNewState']]
        if new:selections['new_'+field]=min(new,key=lambda r:r[field])
        low=[r for r in eligible if r['M_lower']<=21]
        if low:selections['M21_'+field]=min(low,key=lambda r:r[field])
    with Path(str(PREFIX)+'-comparison.csv').open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    compare_ids=['cd3cc7adfe']+list(dict.fromkeys(r['id'] for r in selections.values()))
    a=np.array([vectors(fixed[ident],COSTS) for ident in compare_ids]);sensitivity={}
    for name,lo,hi,step in [('mainPositive',.5,5,.5),('extremePositive',1,10,1)]:
        points=grid(lo,hi,step);delta=np.empty((len(points),len(compare_ids)))
        for start in range(0,len(points),16384):
            batch=points[start:start+16384];scores=10*fourth_scores(a,reference,batch)**.25
            delta[start:start+len(batch)]=100*(scores/scores[:,0,None]-1)
        sensitivity[name]=dict(points=len(points),rows=[dict(id=ident,minChangePct=float(delta[:,i].min()),
            medianChangePct=float(np.median(delta[:,i])),maxChangePct=float(delta[:,i].max()),
            improvesShare=float(np.mean(delta[:,i]<-1e-9))) for i,ident in enumerate(compare_ids) if i])
    inputs=[Path(str(PREFIX)+suffix) for suffix in ['-candidates.json','-scores.json.gz','-policies.json.gz','-robustness.json','-verification.json','-ergonomics.json']]+[Path(__file__)]
    summary=dict(version='cd3-refinement-report-v1',baseline=baseline,selections=selections,rows=rows,
        versusCd3Sensitivity=sensitivity,newStates=candidates['newStates'],importedStates=candidates['importedStates'],
        productionStatus=native['productionStatus'],sourceHashes={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs})
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    show={baseline['id']:baseline}
    for row in selections.values():show[row['id']]=row
    lines=['# cd3 的有界邻域优化与稳健辅序复核','',
        f'新增评估 {candidates["newStates"]:,} 个状态，复用上轮 {candidates["importedStates"]:,} 个固定辅序评分。M 下界≤22、保守值≤24、D≤2，A/E/O 保持共键，翘舌均不占 P；推荐项最终左右小指峰值均不高于 cd3。','',
        '搜索包含两种相近翘舌配置的声调区键微调、韵组换位、整韵根重组，两轮有限下降，随后补偿声母联合移动与韵侧复查。不使用退火或旧移手目标，不是全空间穷举。','',
        f'最终 {len(rows)} 个布局逐个枚举 144 种辅序，以六项认知成本的 0–5 倍及 0–10 倍完整离散网格，最小化相对自身逐点最优辅序的最大损失。下表默认与加倍值都固定使用各自的稳健辅序。','',
        '| 方案 | 稳健辅序 | 默认 CKT↓ | 加倍成本 CKT↓ | M 下界/保守 | D | 左/右小指峰值 | 单指峰值 |',
        '|---|---|---:|---:|---:|---:|---:|---:|']
    for row in sorted(show.values(),key=lambda r:r['doubledV52']):
        lines.append(f'| {row["id"]} | {row["policy"]} | {row["cktV52"]:.9f} | {row["doubledV52"]:.9f} | {row["M_lower"]}/{row["M_guard"]} | {row["D"]} | {row["leftPinkyPeakPct"]:.4f}% / {row["rightPinkyPeakPct"]:.4f}% | {row["maxFingerPeakPct"]:.4f}% |')
    if 'simultaneousImprovement'in selections:
        best=selections['simultaneousImprovement']
        lines+=['',f'双口径改善项为 {best["id"]}：默认 CKT {best["defaultChangePct"]:+.6f}%、加倍 CKT {best["doubledChangePct"]:+.6f}%，M 下界 {baseline["M_lower"]}→{best["M_lower"]}、保守值保持 {best["M_guard"]}。改善幅度很小，主要新增价值是 M21 分支；同指异键率及宽参数下的取舍见后表，不应把它称为全面替代原 cd3 的方案。']
    lines+=['','人体工学按四条原生词长轨的选定终码计算，包含形辅；峰值取四轨最大。单字终码主行率、四轨最低主行率、同指异键率及所有入选项见 comparison.csv，逐键负荷见 ergonomics.json。17983edeb8 是既有对照，未作为本轮新发现。','',
        '| 方案 | 单字终码主行率 | 四轨最低主行率 | 单字同指异键衔接 |',
        '|---|---:|---:|---:|']
    for row in sorted(show.values(),key=lambda r:r['doubledV52']):
        lines.append(f'| {row["id"]} | {row["characterHomePct"]:.4f}% | {row["homeFloorPct"]:.4f}% | {row["sameFingerOtherPct"]:.4f}% |')
    lines+=['','默认与加倍 CKT、M 和小指约束下的改善，不代表所有人体工学维度均改善；特别需要检查同指异键率，也不代表所有参数点都优于原 cd3。','',
        '## 相对 cd3 的具体变化','']
    base_layout=layouts['cd3cc7adfe'];roots=read(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs/seeds.json')['roots']
    seen=set()
    for label,row in selections.items():
        if row['id'] in seen:continue
        seen.add(row['id']);layout=layouts[row['id']]
        changes=[f'{name}:{old}→{layout["firstKeys"][name]}' for name,old in base_layout['firstKeys'].items() if old!=layout['firstKeys'][name]]
        lines +=[f'- {row["id"]}：默认 CKT {row["defaultChangePct"]:+.6f}%，加倍 CKT {row["doubledChangePct"]:+.6f}%，M={row["M_lower"]}/{row["M_guard"]}。',
            '  声母变化：'+('；'.join(changes) if changes else '无')+'。']
        for i,(old,new) in enumerate(zip(base_layout['state']['partition'],layout['state']['partition'])):
            if old!=new:lines.append(f'  整韵根 {roots[i]}：组{old}→组{new}。')
        for region,(old,new) in enumerate(zip(base_layout['state']['groupKeys'],layout['state']['groupKeys'])):
            for group,(a_,b_) in enumerate(zip(old,new)):
                if a_!=b_:lines.append(f'  {["四声上区","二三声中区","一声/轻声下区"][region]}组{group}（'+ '/'.join(layout['rhymeGroups'][group]['finals'])+f'）：{a_}→{b_}。')
    lines+=['','## 宽参数下相对原 cd3','',
        '每个方案固定各自稳健辅序，每点同步重算 S005 参考；正数代表 CKT 较原 cd3 高。网格占比是计数，不是现实用户概率。','',
        '| 网格 | 方案 | 最小变化 | 中位变化 | 最大变化 | 优于 cd3 占比 |','|---|---|---:|---:|---:|---:|']
    for name,g in sensitivity.items():
        for r in g['rows']:lines.append(f'| {name} | {r["id"]} | {r["minChangePct"]:+.5f}% | {r["medianChangePct"]:+.5f}% | {r["maxChangePct"]:+.5f}% | {100*r["improvesShare"]:.3f}% |')
    lines+=['','## 验证与范围','',
        '每个入选布局的稳健辅序均由完整原生 JavaScript 竞赛独立复核，逐轨核对 CKT、辅码率、选重与所有键频；M 由实际码表及韵组独立推导。所有新搜索状态检查预算、整韵根与无 P 翘舌约束。没有修改生产配置。','',
        '本轮声母与调区微调的完整合法邻域是有限集合；只从少量前列展开有限轮数，不据此声称全局最优。复现命令：`just cd3-refine-search`、`just cd3-refine-audit`、`just cd3-refine-test`。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps(selections,ensure_ascii=False),flush=True)


if __name__=='__main__':main()
