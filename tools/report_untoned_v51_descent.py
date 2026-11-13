"""Report the bounded 21x26 descent and the stopped 21x21 observations."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTES = ROOT / 'research/notes'
PREFIX = '2026-11-14-untoned-2126-v51-'


def read(name):
    return json.loads((NOTES / name).read_text(encoding='utf-8'))


def main():
    search = read(PREFIX + 'descent.json')
    combined = read(PREFIX + 'combinations.json')
    audit = read(PREFIX + 'descent-independent-audit.json')
    caudit = read(PREFIX + 'combinations-independent-audit.json')
    historical = read('2026-11-14-untoned-2126-historical-speed.json')
    partial = read('2026-11-14-untoned-2121-v51-partial.json')
    paudit = read('2026-11-14-untoned-2121-v51-partial-independent-audit.json')
    verification = read('2026-11-14-untoned-v51-original-memory-verification.json')
    family = search['families'][0]
    rows = {r['id']: r for f in [family, combined['families'][0]] for r in f['results']}
    audited = {r['id']: r for r in audit['results'] + caudit['results']}
    baseline = rows[family['id']]
    b = audited[baseline['id']]
    strict = sorted((r for r in rows.values() if r['strictComfort']), key=lambda r: r['score'])

    def eq_pass(r):
        a = audited.get(r['id'])
        return a is not None and a['tracks']['S2']['e34'] <= b['tracks']['S2']['e34'] + 1e-12 and a['a7eV4'] <= b['a7eV4'] + 1e-12

    balanced = next(r for r in strict if r['score'] < baseline['score'] and eq_pass(r))
    fastest = min(rows.values(), key=lambda r: r['score'])
    gain = (1-balanced['score']/baseline['score'])*100
    nsearch = len(family['results'])-1
    ncombined = len(combined['families'][0]['results'])-2
    exported = {
        'version': 'untoned-2126-v51-research-finalist-1',
        'status': 'research candidate; production deployment unchanged',
        'id': balanced['id'], 'baselineId': baseline['id'],
        'capacity': balanced['capacity'],
        'shapeKeysByMeaning': 'AEUIO', 'toneKeysByTone': balanced['toneKeysByTone'],
        'toneDigitsByShapeMeaning': '42310',
        'policies': search['contract']['policy26'],
        'lengthBalance': search['contract']['lengthBalance26'],
        'initialMap': balanced['initialMap'], 'finalMap': balanced['finalMap'],
        'audit': balanced['audit'], 'ergonomics': balanced['erg'],
        'cktV51': balanced['score'],
        'fullAuditSource': PREFIX+'combinations-independent-audit.json',
        'sourceHashes': verification['sourceHashes'],
    }
    export_path = ROOT / 'research/config/untoned-2126-v51-research-finalist-20261114.json'
    export_path.write_text(json.dumps(exported, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    text = [
        '# 无调 21×26：相同记忆预算下的 CKT v5.1 下潜', '',
        f"已找到满足本轮硬约束、移手和主行均不下降、传统当量也改善的研究候选 **`{balanced['id']}`**：CKT v5.1 **{baseline['score']:.9f} → {balanced['score']:.9f}（降低 {gain:.4f}%）**。M-R2/D/V 仍为 40/3/1，Common399 保持 399 个不同双拼码，QZ/ZQ 均为空。", '',
        '没有更改 Rime 部署或 R11 生产布局。本次结论是冻结模型中的有限邻域改进；尚未完成候选专属 144 辅序 × 11⁶ 认知扰动审计，也没有真人实验。', '',
        '## 冻结合同', '',
        '- 生产基线：`SNOW-SHENYUN-21X26-D3V1-BALANCED`；部署配置为 `rime-snow-pinyin/config/shenyun-21x26-mapping.json`。',
        '- 记忆严格沿用 M-R2-explicit，M≤40、D≤3、V≤1；不引入额外声韵条件分支；固定辅键集合和语义映射。',
        '- `shapeKeysByMeaning=AEUIO`，`toneKeysByTone=IEUAO`，`toneDigitsByShapeMeaning=42310`。',
        '- Common399 全覆盖、不同二键码≥399；实际即无重码，QZ/ZQ 双空。21×21 的 U=345 不移植到这条线。',
        '- 原生四码封顶、跨词长联合池、六项候选页、`soft-page-fill-v2`；形辅 `12/12/24`，调辅 `12/21/13`。',
        '- S005 参考固定为形辅 `12/213/24`、调辅 `12/213/23`。两成员等权，各成员四轨权重 1:3:1:1。',
        '- 完整词语料 mass=0.99，无词语料抽样；候选以原生产辅序固定比较，避免把重新挑辅序的收益记作声韵交换收益。',
        '- “工效不下降”在搜索中指：日常八场景含标点移手分、S2 主行率、全20合同最小主行率均≥生产基线。W/Y 和右小指峰值另列；不把三项门禁称为所有工效指标不退化。',
        '- 全20合同最小主行率与旧报告 `home_floor=min(C4-Snow,WX-Snow-12)` 定义不同，本文统一使用前者。', '',
        '## 完整复算代表', '',
        '| 方案 | CKT v5.1↓ | 移手↑ | S2主行↑ | 20合同主行下界↑ | S2当量↓ | A7E-v4↓ | A7E-v5↓ | W峰值↓ |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ]
    selected = list({r['id']: r for r in [baseline, balanced, fastest, *strict[1:3]]}.values())
    for r in selected:
        a = audited.get(r['id'])
        if not a:
            continue
        g = r['erg']
        text.append(f"| `{r['id']}` | {r['score']:.9f} | {g['mx']:.6f} | {g['homeS2']:.4%} | {g['homeFloor']:.4%} | {a['tracks']['S2']['e34']:.9f} | {a['a7eV4']:.9f} | {a['a7eV5']:.9f} | {g['wMax']:.4%} |")
    text += ['', f"推荐继续验证 `{balanced['id']}`。它的完整改动（相对生产基线）为：", '']
    for field, label in [('initialMap', '声母'), ('finalMap', '韵母')]:
        changes = [f"`{k}: {baseline[field][k]}→{v}`" for k, v in balanced[field].items() if baseline[field][k] != v]
        text.append(f"- {label}：" + ('、'.join(changes) if changes else '不变。'))
    delta_w = (balanced['erg']['wMax']-baseline['erg']['wMax'])*100
    text += ['', f"该候选的 W 峰值相对生产变化 **{delta_w:+.4f} 个百分点**；右小指峰值 {balanced['erg']['rpMax']:.4%}、Y 峰值 {balanced['erg']['yMax']:.4%}。这些值须与生产门禁一起审阅，不能仅凭 CKT 宣称所有负载都更好。", '',
             '## 哪些交换性价比高', '',
             '下表只列直接从生产基线出发的单步，避免把组合后的最后一步误当成全部收益。`vn` 表示 ün，`ve` 表示 üe。', '',
             '| 直接交换 | ΔCKT v5.1↓ | Δ移手↑ | ΔS2主行（百分点）↑ | 三项工效门禁 |',
             '|---|---:|---:|---:|---|']
    direct = sorted((r for r in family['results'][1:] if r.get('parent') == baseline['id'] and not r['mutation'].startswith('historical')), key=lambda r: r['score'])
    chosen = [*direct[:6], *[r for r in direct if r['mutation'].startswith('initialMap:')][:2]]
    for r in chosen:
        text.append(f"| {r['mutation']} | {r['score']-baseline['score']:+.9f} | {r['erg']['mx']-baseline['erg']['mx']:+.6f} | {(r['erg']['homeS2']-baseline['erg']['homeS2'])*100:+.4f} | {'通过' if r['strictComfort'] else '不通过'} |")
    text += ['', '观察：本轮高收益方向集中在少量韵母重排；没有观察到更划算的声母交换。`iu↔vn` 的原生 CKT 收益最大，但其单步传统当量略升；叠加 `iang↔ie` 可补回当量。这是相同合同下的对照结果，不是对未评分声母邻域的排除证明。', '',
             '## 历史更快方案为何没有成为生产替代', '',
             '两个历史速度点在本次固定生产辅序下也确实更快；下表 v5.1 是重新计算值，未拿历史 v4 与当前 v5.1 混排。', '',
             '| 历史速度点 | M/D/V | 历史v4↓ | 本次原生v5.1↓ | 移手↑ | S2主行↑ | 20合同主行下界↑ | 右小指峰值↓ | QZ音节 |',
             '|---|---:|---:|---:|---:|---:|---:|---:|---|']
    for h in historical['results']:
        a, g = h['audit'], h['erg']
        text.append(f"| {Path(h['source']).parent.name} rank1 | {a['M']}/{a['D']}/{a['V']} | {h['cktV4']:.9f} | {h['nativeV51']['score']:.9f} | {g['mx']:.6f} | {g['homeS2']:.4%} | {g['homeFloor']:.4%} | {g['rpMax']:.4%} | {','.join(h['qz'])} |")
    text += ['', '两者均违反 QZ 空桶；移手、主行与右小指负载也明显弱于生产基线。它们证明存在更低的速度分，不证明在当前生产约束内更好。', '',
             '## 搜索覆盖与验证边界', '',
             f"两轮分别通过硬约束 {family['rounds'][0]['legal']}、{family['rounds'][1]['legal']} 个新状态，共完整原生评分 {nsearch} 个新候选；随后定向组合再评 {ncombined} 个。候选包括声韵 token 交换、同键组整体互换、零声母/翘舌整组迁移及现有发布兄弟方案；历史生产前沿的 top50/V0 切片也经过硬约束过滤。", '',
             '筛选优先比较 Common399 的频率加权双键运动耗时，分别保留三项工效全通过、仅移手通过、无工效筛选的前列，再做完整原生 v5.1 复算。未评分的候选不能据此宣称 CKT 更差；这不是邻域穷举或全局最优证明。', '',
             '所有已发现 CKT 改善代表再经独立冻结 Engine7/CKTEngine 复算完整20合同，核对 S2 主行与主行下界；当量结果不来自双键运动代理。生产 v5.1 重算必须与 9.10299979136027 相符（误差≤1e-9），M-R2 与移手也对照已发布审计值。语义/状态往返测试另行执行。', '',
             f"额外使用原版 `memory_r2.py` 重新审计 {verification['recordsVerified']} 条已存记录（含重复基线与21×21停止快照），逐条核对记忆、位移、覆盖、重码和双空；同时核验当前部署配置与生产基线声韵映射一致。该验证记录词典、笔画字典、原生路由脚本、人体工学fixture与M-R2原实现的SHA256。", '',
             '## 已计算的21×21结果（按用户要求停止该线）', '',
             '只汇总停止前已有结果，不追加搜索。下表四个代表的M-R2/D/V均为42/2/5，Common399不同码345，QZ/ZQ双空；其余已存候选允许M更低、不同码更多。21×21采用自身原生合同，数值只与21×21生产基线比较。', '',
             '| 已计算交换 | CKT v5.1↓ | 移手↑ | S2主行↑ | 20合同主行下界↑ | 说明 |',
             '|---|---:|---:|---:|---:|---|']
    pf = partial['families'][0]
    ordered = sorted(pf['results'][1:], key=lambda r: r['score'])
    pbest = next(r for r in ordered if r['strictComfort'])
    for r in [pf['results'][0], pbest, ordered[0], next(r for r in ordered if r['mutation'] == 'finalMap:en(D)↔uan(E)')]:
        g = r['erg']
        text.append(f"| {r['mutation']} | {r['score']:.9f} | {g['mx']:.6f} | {g['homeS2']:.4%} | {g['homeFloor']:.4%} | {'三项工效通过' if r['strictComfort'] else '主行/移手存在取舍'} |")
    pa = next(r for r in paudit['results'] if r['id'] == pbest['id'])
    text += ['', f"其中 `{pbest['mutation']}` 的独立20合同结果：S2当量 {pa['tracks']['S2']['e34']:.9f}、A7E-v4 {pa['a7eV4']:.9f}，均低于21×21生产基线；属于已算出的更均衡邻居。停止前原生完整评分 {len(pf['results'])-1} 个新状态，另有1个预选候选未算完；不写成完成两轮搜索。", '',
             '## 复现与数据', '',
             '```powershell',
             'just untoned-production-v51-test',
             'just untoned-production-v51-search 26 2 32',
             'just untoned-production-v51-combine',
             'just untoned-production-v51-audit',
             'just untoned-production-v51-report',
             '```', '',
             '需要本地忽略的R11 HTML、冻结 replay 和 ergonomics fixture，以及部署仓库的词典。原始结果保存完整声韵映射、八轨分项、父节点、门禁与源文件哈希：', '',
             '- [两轮原生结果](2026-11-14-untoned-2126-v51-descent.json)',
             '- [定向组合](2026-11-14-untoned-2126-v51-combinations.json)',
             '- [两轮独立20合同审计](2026-11-14-untoned-2126-v51-descent-independent-audit.json)',
             '- [组合独立20合同审计](2026-11-14-untoned-2126-v51-combinations-independent-audit.json)',
             '- [历史速度点重算](2026-11-14-untoned-2126-historical-speed.json)',
             '- [21×21停止时快照](2026-11-14-untoned-2121-v51-partial.json)',
             '- [原版M-R2和部署基线核验](2026-11-14-untoned-v51-original-memory-verification.json)',
             '- [研究候选完整映射配置](../config/untoned-2126-v51-research-finalist-20261114.json)', '']
    target = NOTES / '2026-11-14-untoned-production-v51-descent.md'
    target.write_text('\n'.join(text), encoding='utf-8')
    print(target)


if __name__ == '__main__':
    main()
