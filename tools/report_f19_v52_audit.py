"""Publish the decision evidence and a compact memory/ergonomics comparison."""
import csv
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from analyze_single_ckt_v51_aux_order import grid,vectors,score_at
from rank_cr_toned_stable_policies import COSTS,policy_key
from audit_f19_v52_robustness import fourth_scores

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-19-f19-v52-production-audit'
def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


def main():
    audit=read(str(PREFIX)+'-robustness.json');native=read(str(PREFIX)+'-verification.json')
    candidates=read(str(PREFIX)+'-candidates.json');ergos=read(str(PREFIX)+'-ergonomics.json')
    raw=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
    policies={r['id']:r for r in raw['results']};memories={r['id']:r for r in native['memories']};loads={r['id']:r for r in ergos['results']}
    rows=[]
    for r in audit['results']:
        ident=r['id'];m,e=memories[ident],loads[ident]
        rows.append(dict(id=ident,defaultBestCktV52=r['defaultBest']['score'],defaultBestPolicy=policy_key(r['defaultBest']['policy']),
            robustPolicyCktV52=r['selected']['defaultScore'],robustPolicy=policy_key(r['selected']['policy']),
            M_lower=m['lower'],M_guard=m['guard'],D=m['D'],F=m['F'],
            leftPinkyPeakPct=100*e['leftPinkyQAZPeak4NativeTracks']['value'],rightPinkyPeakPct=100*e['rightPinkyPeak4NativeTracks']['value'],
            characterTerminalHomePct=100*e['homeS2'],homeFloorPct=100*e['homeFloor4NativeTracks'],
            maxFingerPeakPct=100*e['maxFingerPeak4NativeTracks']['value'],
            characterSameFingerOtherKeyPct=100*e['s2DifferentKeySameFingerRate'],
            ownPolicyWorstRegretPct=100*r['selected']['worstRegret']))
    with Path(str(PREFIX)+'-comparison.csv').open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    fixed={r['id']:policies[r['id']]['policies'][r['selected']['policyIndex']] for r in audit['results']}
    reference=vectors(raw['reference'],COSTS)
    pair=np.asarray([vectors(fixed[x],COSTS) for x in ['f19a0ad1dc','current-production']])
    production_comparison={}
    for name,maximum,step in [('main',5,.5),('extreme',10,1)]:
        points=grid(0,maximum,step);gaps=np.empty(len(points))
        for start in range(0,len(points),16384):
            p=points[start:start+16384];s=10*fourth_scores(pair,reference,p)**.25
            gaps[start:start+len(p)]=s[:,1]-s[:,0]
        production_comparison[name]={}
        for part,mask in [('all',np.ones(len(points),bool)),('positive',np.all(points>0,axis=1))]:
            values=gaps[mask];production_comparison[name][part]=dict(points=len(values),f19Wins=float(np.mean(values>1e-9)),
                minGap=float(values.min()),medianGap=float(np.median(values)),maxGap=float(values.max()))
    witness_ids=['f19a0ad1dc','2eb6eb060e','1f9e267cd2','current-production']
    a=np.asarray([vectors(fixed[x],COSTS) for x in witness_ids]);witnesses=[]
    for multiplier in [.5,1,2]:
        values=score_at(a,reference,np.full(6,multiplier));witnesses.append(dict(multiplier=multiplier,scores=dict(zip(witness_ids,values.tolist()))))
    summary=dict(version='f19-v52-production-comparison-v1',rows=rows,witnesses=witnesses,
        f19VsProductionEachOwnRobustPolicy=production_comparison,productionGatePassed=audit['productionGatePassed'],
        sourceHashes={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in
            [Path(str(PREFIX)+suffix) for suffix in ['-policies.json.gz','-robustness.json','-verification.json','-ergonomics.json','-candidates.json']]})
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    by_id={r['id']:r for r in rows};selected_ids=['f19a0ad1dc','2eb6eb060e','92d87a31e4','29ce221cfe','1f9e267cd2','76f30871bf','c2e49137b9','5bd306d6ca','current-production']
    lines=['# f19：CKT v5.2 最优辅序、参数稳健性与生产比较','',
        '结论：f19 在已发布的同口径方案和本轮重点候选中，默认参数下仍为第一；但宽范围扰动下稳居第一且有正余量的前提不成立。本轮不覆盖生产莲道。','',
        f'扫读压缩档案中的 {sum(a["states"] for a in candidates["archiveInventory"])} 条记录，按各原始搜索分支挑前列与近邻，并加入 GPU 前沿、已发布老 CR 和当前生产方案，共 {len(rows)} 个布局。每个布局枚举 144 种辅序，共 {len(rows)*144} 个布局/辅序组合。旧移手分不作筛选条件。','',
        '这不是所有档案布局逐一重做 144 辅序，更不是全局最优证明。已发布 21×26 带调方案属于不同键域，未混入本次 21×21 排名。','',
        '## 同口径概览','',
        '下列 CKT 均为各自固定稳健辅序在默认参数下的值。M 下界/保守值使用统一 M-T1 推导；D 为普通声母偏移。','',
        '| 布局 | 稳健辅序 | CKT v5.2↓ | M 下界/保守 | D | 左小指峰值 | 右小指峰值 |',
        '|---|---|---:|---:|---:|---:|---:|']
    for ident in selected_ids:
        r=by_id[ident];lines.append(f'| {ident} | {r["robustPolicy"]} | {r["robustPolicyCktV52"]:.9f} | {r["M_lower"]}/{r["M_guard"]} | {r["D"]} | {r["leftPinkyPeakPct"]:.3f}% | {r["rightPinkyPeakPct"]:.3f}% |')
    lines+=['','| 布局 | 单字终码主行率 | 四轨最低主行率 | 单指峰值 | 单字同指异键衔接 |',
        '|---|---:|---:|---:|---:|']
    for ident in selected_ids:
        r=by_id[ident];lines.append(f'| {ident} | {r["characterTerminalHomePct"]:.3f}% | {r["homeFloorPct"]:.3f}% | {r["maxFingerPeakPct"]:.3f}% | {r["characterSameFingerOtherKeyPct"]:.3f}% |')
    lines+=['',f'人体工学按各自稳健辅序的原生单字、二、三、四字词终码计算，包含形辅；峰值是在四条轨中取最大，不能与 5500 字连续声韵键流占比混用。“单字终码主行率”包含单字消歧辅码。完整 {len(rows)} 行及各自默认最优辅序另见 comparison.csv，逐键/逐指负荷见 ergonomics.json。','',
        '## 参数范围与辅序选择','',
        '固定词长权重 1:3:1:1、原生候选路由和字词频率。独立变化六项成本：第一/二/三辅认知成本、选重决策、逐候选扫描、翻页动作。基准分别为 300、300、300、600、50、300 毫秒。每个参数点同步重算固定 S005 参考分母。','',
        '- 主网格：各成本取默认的 0–5 倍，步长 0.5，11⁶=1,771,561 点；严格正成本子集 1,000,000 点。',
        '- 极端网格：0–10 倍，步长 1，同样 1,771,561 点；严格正成本子集 1,000,000 点。',
        '- 温和子集：主网格内各成本 0.5–2 倍，共 4096 点。',
        '- 各布局以全网格最小化相对自身逐点最优辅序的最大损失；并列时依次比较四个全/正子网格等权平均损失、默认分、辅序字典序。仅剔除在所有非负成本下均被系数支配的辅序。',
        '- 跨布局分别比较：每个布局固定自己的稳健辅序；竞争布局允许在每个点重新挑最优辅序的更强对手。','',
        f'f19 选中 {policy_key(audit["f19Selected"]["policy"])}，相对自身 144 辅序逐点最优的最大损失 {100*audit["f19Selected"]["worstRegret"]:.6f}%。辅序稳定，不等于布局排名稳定。','',
        '## f19 的跨布局名次','',
        '| 参数范围 | 比较方式 | 严格第一点占比 | 最差名次 | 对最强对手的最小 CKT 余量 |',
        '|---|---|---:|---:|---:|']
    for name in ['main','extreme']:
        for mode in ['fixedPolicies','adaptiveRivals']:
            for part in ['positive','moderate']:
                if name=='extreme' and part=='moderate':continue
                s=audit['crossLayoutComparisons'][name][mode][part]
                lines.append(f'| {name}/{part} | {mode} | {100*s["wins"]:.4f}% | {s["worstRank"]} | {s["minGap"]:+.9f} |')
    lines+=['','网格占比不是现实用户胜率；独立均匀网格不表示真实成本分布。负余量表示存在对手更好，正子集已排除零成本退化点。','',
        '| 六项成本同时倍率 | f19 | 2eb6eb060e | 1f9e267cd2 | 生产莲道亦优化辅序 |','|---|---:|---:|---:|---:|']
    for w in witnesses:lines.append('| '+str(w['multiplier'])+' | '+' | '.join(f'{w["scores"][i]:.9f}' for i in witness_ids)+' |')
    gap=audit['defaultRankingEachOwnBest'][1]['score']-audit['defaultRankingEachOwnBest'][0]['score']
    lines+=['',f'默认参数下对第二名的余量为 {gap:.9f}，约 {100*gap/audit["defaultRankingEachOwnBest"][0]["score"]:.5f}%。这不足以支持“在宽参数范围内仍稳居第一且有余量”的判断。',
        '', '不同参数行使用各自重算的 S005 分母，因此分数变小不等于绝对耗时减少。反转原因见分轨数据：f19 与竞争方案在击键当量、加辅率、选重率上存在取舍，提高认知成本会改变布局的相对排名。','',
        '## 与当前生产方案的区别','',
        '生产行也公平优化了辅序，未用其原辅序故意衬托 f19。当前实际辅序仍是 12/213/24，发布的 v5.2 为 9.205692936；其稳健辅序与数值见上表，本轮并未应用。独立验证逐个核对了生产配置中的 1407 个带调音节与基线码表。','']
    for name,s in production_comparison.items():
        p=s['positive'];lines.append(f'- {name} 正成本网格：f19 对生产方案稳健辅序的严格胜出点占比 {100*p["f19Wins"]:.4f}%，最小余量 {p["minGap"]:+.9f}。')
    lines+=['','## 验证与复现','',
        '原生完整 JavaScript 竞赛与加速枚举独立核对了三个布局的全部 432 个辅序；另对 f19、默认第二名、生产方案及各类最差反例的辅序重建完整竞赛，逐轨核对耗时、辅码率、选重、扫描、翻页和人体工学负荷。M 由码表及韵组重新推导，不抄历史字段。','',
        '运行 `just f19-v52-audit-prepare` 导出原生模板并枚举；`just f19-v52-audit` 重跑完整网格和独立验证；`just f19-v52-audit-test` 做回归。原生模板与原始 R11 数据沿用本仓库研究缓存合同。','',
        '生产替换的前提未满足，因此本轮只提交 benchmark 研究与比较结果，不修改 rime-snow-pinyin。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print('published comparison rows',len(rows),'production pair',production_comparison)


if __name__=='__main__':main()
