"""Report only hash-verified remote representatives alongside the prior cohort."""
import csv
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from analyze_single_ckt_v51_aux_order import grid,vectors,score_at
from rank_cr_toned_stable_policies import COSTS,policy_key
from audit_f19_v52_robustness import cross_compare,WORK

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-19-lan213-v52-followup'
def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


def main():
    candidates=read(str(PREFIX)+'-candidates.json');audit=read(str(PREFIX)+'-robustness.json')
    ergo=read(str(PREFIX)+'-ergonomics.json');native=read(str(PREFIX)+'-verification.json')
    source=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
    recovered=read(str(PREFIX)+'-recovery.json');remote=read(ROOT/'research/notes/2026-11-19-cr-lan-213-report.json')
    by_policy={r['id']:r for r in source['results']};by_memory={r['id']:r for r in native['memories']}
    by_load={r['id']:r for r in ergo['results']}
    ids={'f19a0ad1dc',*(r['id'] for r in recovered['results'])}
    subset=[]
    for item in audit['results']:
        if item['id'] in ids:
            subset.append({**item,'oracleCaches':{name:str(WORK/(item['id']+'-'+name+'-oracle.npy')) for name in ['main','extreme']}})
    representative_comparison=cross_compare(source,subset,dict(main=grid(0,5,.5),extreme=grid(0,10,1)),4096)
    rows=[];fixed={}
    for item in audit['results']:
        ident=item['id'];selection=item['selected'];policy=by_policy[ident]['policies'][selection['policyIndex']]
        fixed[ident]=policy;m=by_memory[ident];e=by_load[ident]
        rows.append(dict(id=ident,remoteRepresentative=ident in ids,robustPolicy=policy_key(selection['policy']),
            robustDefaultV52=selection['defaultScore'],defaultBestPolicy=policy_key(item['defaultBest']['policy']),
            defaultBestV52=item['defaultBest']['score'],M_lower=m['lower'],M_guard=m['guard'],D=m['D'],
            leftPinkyPeakPct=100*e['leftPinkyQAZPeak4NativeTracks']['value'],
            rightPinkyPeakPct=100*e['rightPinkyPeak4NativeTracks']['value'],
            characterHomePct=100*e['homeS2'],homeFloorPct=100*e['homeFloor4NativeTracks'],
            maxFingerPeakPct=100*e['maxFingerPeak4NativeTracks']['value'],
            characterSameFingerOtherPct=100*e['s2DifferentKeySameFingerRate'],
            ownPolicyWorstRegretPct=100*selection['worstRegret']))
    with Path(str(PREFIX)+'-comparison.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    reference=vectors(source['reference'],COSTS)
    witness_ids=['f19a0ad1dc','391c0afa96','ba0466ee5b','2eb6eb060e','1f9e267cd2']
    a=np.array([vectors(fixed[i],COSTS) for i in witness_ids])
    witnesses=[dict(multiplier=m,scores=dict(zip(witness_ids,score_at(a,reference,np.full(6,m)).tolist()))) for m in [.5,1,2]]
    data=dict(version='lan213-v52-representative-followup-report-v1',sourceCommit='91e3605',
        totalLayouts=len(rows),hashRecoveredRepresentatives=len(recovered['results']),
        unrecoveredParetoKeys=candidates['representativeRecovery']['missingParetoKeys'],
        representativeOnlyComparisons=representative_comparison,combinedComparisons=audit['crossLayoutComparisons'],
        defaultRankingEachOwnBest=audit['defaultRankingEachOwnBest'],rows=rows,witnesses=witnesses,
        productionGatePassed=audit['productionGatePassed'],productionStatus=native['productionStatus'],
        sourceHashes={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in
            [Path(str(PREFIX)+suffix) for suffix in ['-candidates.json','-policies.json.gz','-robustness.json','-verification.json','-recovery.json','-ergonomics.json']]})
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    index={r['id']:r for r in rows};old_by_id={r['id']:r for r in recovered['results']}
    order=sorted(ids,key=lambda i:index[i]['robustDefaultV52'])
    lines=['# 91e3605：固定兰道声母 213 长跑代表方案的 CKT v5.2 复核','',
        '**结论：加入可验证的长跑代表方案后，f19 默认参数下仍为第一，但领先余量缩小到约 0.0049%；宽范围成本扰动下仍不能稳居第一。**','',
        '## 原提交交付与适用范围','',
        '原提交 `91e3605` 只新增结题 Markdown、JSON 汇总和总文档说明，没有提交长跑 search.sqlite、完整 state 或 256 个前沿的完整码表。本轮按用户要求只处理已提交代表方案；从描述恢复十个代表布局，均以完整 SHA-256 方案标识核对，并重放原 v5.1 分数。八个是按所述微调恢复，两个已有完整码表；合计九个此前比较中未包含的物理布局。','',
        f'原报告记录 RTX 3070 运行 {remote["runtimeHours"]} 小时、{remote["round"]:,} 轮、{remote["evaluations"]:,} 次累计评估、{remote["cacheTotal"]:,} 个在存缓存条目。运行器会淘汰缓存条目，因此累计评估次数不能直接认定为全程去重布局数。','',
        '搜索使用 **CKT v5.1、固定 21/213/14 辅序、固定兰道声母**；18 韵根不拆，在十组间重组并调整三调区键位。M≤24、guard≤26、D≤2，另有小指与旧移手门槛。六条目标路线中五条偏重旧移手，仅一条以 CKT 为目标；故充分探索和全空间穷尽不是同一结论。','',
        '原报告声称 256 个前沿已通过 CPU 验分；本轮没有该检查点，不将这一说法作为本机完成验证。原报告 32 个移手/CKT Pareto 点中仍有 23 个只有编号和分数、无足够重建信息，本轮未给它们制造 v5.2 辅序排名。缺失列表保存在 candidates.json。','',
        '## 已恢复代表方案：各自稳健辅序','',
        '各布局完整枚举 144 种辅序，并以两套六参数网格上的最坏相对自身逐点最优损失最小来选固定稳健辅序。下表的 CKT 是该稳健辅序在默认成本下的值。','',
        '| 布局 | 原固定辅序 v5.1 | 稳健辅序 | CKT v5.2↓ | M 下界/保守 | D | 左/右小指峰值 |',
        '|---|---:|---|---:|---:|---:|---:|']
    for ident in order:
        r=index[ident];old=old_by_id.get(ident,{'replayedV51':remote['baseline']['ckt']})['replayedV51']
        lines.append(f'| {ident} | {old:.9f} | {r["robustPolicy"]} | {r["robustDefaultV52"]:.9f} | {r["M_lower"]}/{r["M_guard"]} | {r["D"]} | {r["leftPinkyPeakPct"]:.3f}% / {r["rightPinkyPeakPct"]:.3f}% |')
    lines+=['','| 布局 | 单字终码主行率 | 四轨最低主行率 | 单指峰值 | 单字同指异键衔接 |',
        '|---|---:|---:|---:|---:|']
    for ident in order:
        r=index[ident];lines.append(f'| {ident} | {r["characterHomePct"]:.3f}% | {r["homeFloorPct"]:.3f}% | {r["maxFingerPeakPct"]:.3f}% | {r["characterSameFingerOtherPct"]:.3f}% |')
    lines+=['','人体工学按各自选定辅序的单字、二、三、四字词终码计算，包含形辅；小指/单指峰值取四轨最大。M 按 M-T1 从实际码表与韵组独立推导。完整合并表见 comparison.csv。旧移手分仅用于重放来源一致性，未用于本轮排名或辅序筛选。','',
        '## 默认领先余量','']
    top=audit['defaultRankingEachOwnBest'][:2];gap=top[1]['score']-top[0]['score']
    lines +=[f'每个布局均用自己的默认最优辅序，合并比较 {len(rows)} 个布局后：第一名 {top[0]["id"]}，{top[0]["score"]:.12f}；第二名 {top[1]["id"]}，{top[1]["score"]:.12f}；差 {gap:.12f}，约 {100*gap/top[0]["score"]:.6f}%。','',
        '391c0afa96 相对 f19 只将 a/ia/ua 组的二、三声韵键 S→H，韵根分组与声母均不变；但这仍是需要重学的键位变化，不能称为零迁移成本。ba0466ee5b 在此基础上将一声/轻声的 a 组与 ai/ang 组 X↔Z 交换。','',
        '## 六参数扰动结果','',
        '保持字词频率、路由和 1:3:1:1 词长权重。六项成本为第一/二/三辅认知、选重决策、扫描、翻页，默认 300/300/300/600/50/300 毫秒。主网格每轴 0–5 倍、步长 0.5；极端网格 0–10 倍、步长 1，各 11⁶=1,771,561 点，严格正成本各 1,000,000 点。温和子集为主网格 0.5–2 倍，共 4096 点。每点同步重算 S005 分母。','',
        f'f19 稳健辅序仍为 {policy_key(audit["f19Selected"]["policy"])}；相对其自身逐点最优辅序的最坏损失约 {100*audit["f19Selected"]["worstRegret"]:.6f}%。','',
        '| 对手集合 | 参数范围 | 对手策略 | f19 严格第一占比 | 最差名次 | 最小 CKT 余量 |',
        '|---|---|---|---:|---:|---:|']
    for group,comparison in [('此次已恢复代表',representative_comparison),(f'合并{len(rows)}布局',audit['crossLayoutComparisons'])]:
        for name,part in [('main','moderate'),('main','positive'),('extreme','positive')]:
            for mode in ['fixedPolicies','adaptiveRivals']:
                s=comparison[name][mode][part]
                lines.append(f'| {group} | {name}/{part} | {"各自固定稳健辅序" if mode=="fixedPolicies" else "对手逐点最优辅序"} | {100*s["wins"]:.4f}% | {s["worstRank"]} | {s["minGap"]:+.9f} |')
    lines+=['','这些占比只是所列离散网格的计数，不是现实用户或参数分布下的概率。有限网格不证明连续参数空间中的全局最优；找到反例已经足以否定始终第一。','',
        '| 六成本同时倍率 | f19 | 391c0afa96 | ba0466ee5b | 2eb6eb060e | 1f9e267cd2 |',
        '|---|---:|---:|---:|---:|---:|']
    for w in witnesses:lines.append('| '+str(w['multiplier'])+' | '+' | '.join(f'{w["scores"][i]:.9f}' for i in witness_ids)+' |')
    lines+=['','以上每个布局均固定使用自己的稳健辅序。减半时新增代表即可胜 f19；加倍时既有 1f9 路线胜出。不能把原报告的移手改善折算成速度收益，不能把原 v5.1 表直接当作 v5.2。','',
        '## 决策与验证','',
        '默认参数优先时，f19 依然是本轮候选中的最优选择；若要求在大范围参数下始终第一且有余量，条件仍未成立。本轮不覆盖生产莲道。','',
        f'本轮独立核对发现，生产配置已在后续提交切换为 {native["productionStatus"]["id"]}，1407 音节首尾键逐一匹配候选 {native["productionStatus"]["matchesAuditedLayout"]}。合并表中的 current-production 是上次冻结的旧生产基线，为保持历史对比保留其 ID，不代表今天的生产布局。其 M 与人体工学按冻结旧码表及从既有 M 审计恢复的旧韵组计算，未套用现有 f19 韵组。','',
        '已恢复十个布局通过完整方案哈希、原 v5.1 分数重放、v5.2 原生完整竞赛和独立 M/人体工学核对。全体 72 布局共 10368 个辅序组合；未重做远端 92k 缓存、未假定无法重建的代表布局无竞争力。源哈希和结果随 JSON 保存。','',
        '复现：`just lan213-v52-followup-prepare`、`just lan213-v52-followup`、`just lan213-v52-followup-test`。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print('new report',len(rows),'layouts; gap',gap,flush=True)


if __name__=='__main__':main()
