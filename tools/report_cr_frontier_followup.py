"""Render verified follow-up results, keeping fixed and changed auxiliary contracts explicit."""
import json
from pathlib import Path

from integrate_snow_jiandao_toned_r11 import ROOT, macro_replay
from run_cr_anneal import atomic_json

PREFIX = ROOT / 'research/notes/2026-11-16-cr-frontier-followup'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf8'))


def policy(value):
    return '/'.join(value[key] for key in ['word2','word3','word4'])


def main():
    bundle = read(str(PREFIX)+'-finalists.json')
    aux = read(str(PREFIX)+'-auxiliary.json')
    verify = read(str(PREFIX)+'-verification.json')
    macro_data = read(ROOT / 'research/.cache/cr-frontier-followup-20261116/macro-input.json')
    by_aux = {row['id']:row for row in aux['results']}
    by_verify = {row['id']:row for row in verify['results']}
    if set(by_aux) != set(by_verify) or len(bundle['layouts']) != len(by_verify):
        raise ValueError('incomplete verification or auxiliary report')
    for layout in bundle['layouts']:
        codes = dict(zip(bundle['tokenKeys'],layout['tonedCodes'],strict=True))
        fixture = dict(tonedCodes=[[codes.get(py+str(tone)) for tone in range(1,6)] for py in macro_data['pinyin']])
        values = macro_replay(macro_data,fixture)
        v = by_verify[layout['id']]
        if abs(values['daily|native-punctuation']['score']-v['daily'])>1e-9:
            raise ValueError('frozen-sequence/R11 moving-hand mismatch '+layout['id'])
        v['macro'] = values
    atomic_json(Path(str(PREFIX)+'-verification.json'),verify)
    rounds = bundle['rounds']
    lines = ['# CR 21×21 带调前沿：有限后续探索（2026-11-16）','',
        '结论：固定原辅序 12/213/24 时，最低 CKT 纪录未被打破，但均衡、高日常移动手两条路线都找到小幅改进。'
        '额外枚举纯形辅顺序后，原冠军可以继续降低 CKT。所有结果均为模型预测，未修改生产布局或 R11 发布页。','',
        f"本次按规范约束 D≤2、M_lower≤22、M_guard≤24，M21 路线继续要求 M_lower≤21。"
        '固定 18 个韵根、10 个非空韵组、四声上排/二三声中排/一声轻声下排，不增加声调专属韵母例外。'
        'shapeKeysByMeaning=AVUIO、toneKeysByTone=IVUAO，配对 42310；普通声母 F=0。','',
        '## 保留原辅序的结果','',
        '| 路线 / 新方案 | M 下限/守门 | 原 CKT | 新 CKT↓ | CKT 减少 | 原日常分 | 新日常分↑ | 原生四轨左小指峰值 |',
        '|---|---:|---:|---:|---:|---:|---:|---:|']
    for layout in bundle['layouts']:
        before, after = layout['before'], layout['metrics']
        lines.append(f"| {layout['id']} | {after['m']}/{after['guard']} | {before['ckt']:.9f} | {after['ckt']:.9f} | "
            f"{before['ckt']-after['ckt']:.9f} | {before['daily']:.6f} | {after['daily']:.6f} | {after['pinky']*100:.4f}% |")
    lines += ['', '日常移动手分为同一冻结含标点文章主码回放（不含形辅、选重），越高越好；'
        '四轨小指峰值包含各自选定终码的纯形辅。M-T1 是指定语法的规则账，不是人体学习时间的实测界限。','',
        '## 具体修改','']
    for layout in bundle['layouts']:
        changes = by_verify[layout['id']]['changes']
        text = [f"{item['atom']} 首键 {item['from']}→{item['to']}" for item in changes['first']]
        text += [f"{'/'.join(item['roots'])} 在 {item['region']} 调区 {item['from']}→{item['to']}" for item in changes['rhyme']]
        lines.append(f"- `{layout['id']}`："+('；'.join(text) if text else '声韵布局不变。'))
    lines += ['', '上表两种新日常方案互有取舍：`3d3dcbafc0` 的 CKT 更低，`0a4ee7fb52` 的日常分更高，均保留。',
        '', '## 纯形辅顺序枚举','',
        '每个保留布局枚举 2（二字）×6（三字）×12（四字）=144 个合法位置顺序。'
        '主码声韵和五辅物理含义不变；仍用固定 S005 12/213/24 参考与四轨 1:3:1:1，参考不会随候选辅序变动。'
        '全部 144 项逐词长验证条目数、权重总量相同。辅序自身的记忆负担未计入 M-T1，不能将 M 不变等同于学习零成本。','',
        '| 布局 | 固定12/213/24 CKT | 最低分辅序 | 最低 CKT↓ | 左小指峰值 | 小指不增辅序 | 小指不增 CKT↓ |',
        '|---|---:|---|---:|---:|---|---:|']
    for layout in bundle['layouts']:
        row = by_aux[layout['id']]; best = row['bestStandard']; keep = row['bestPinkyPreserving']
        lines.append(f"| {layout['id']} | {row['baseline']['score']:.9f} | {policy(best['policy'])} | {best['score']:.9f} | "
                     f"{best['pinky']*100:.4f}% | {policy(keep['policy'])} | {keep['score']:.9f} |")
    lines += ['', '敏感性采用首/次/三辅同一罚时 200/300/400 ms，与选重 300/600/900 ms 的 9 种组合；'
        '扫描 50 ms、翻页 300 ms 不变，每个参数点对 S005 同步重算归一分。'
        '按九点内逐点最佳分计算最大相对后悔值，选 minimax 辅序。'
        '这是冻结模型参数扰动，不能替代真实用户语料与长期打字实验。','',
        '| 布局 | minimax 辅序 | 默认参数 CKT | 最坏相对后悔值 |',
        '|---|---|---:|---:|']
    for row in aux['results']:
        robust=row['bestRobust']
        lines.append(f"| {row['id']} | {policy(robust['policy'])} | {robust['score']:.9f} | {robust['worstRegret']*100:.6f}% |")
    lines += ['', '## 原生人体工学与补码指标','',
        '以下表格保留原 12/213/24 辅序，以便单独评估声韵布局变化。负载峰值是四轨分别统计后的最大值，'
        '基准排下限是四轨最小值；异键同指率以单字码内相邻键对为分母，不含同键重复。','',
        '| ID | 右小指峰值%↓ | 最大单指峰值%↓ | 基准排下限%↑ | 单字异键同指%↓ | 平均码长↓ | 加权选重率%↓ |',
        '|---|---:|---:|---:|---:|---:|---:|']
    for row in verify['results']:
        fixed=row['fixed']; e=fixed['ergonomics']; a=fixed['aggregate']
        lines.append(f"| {row['id']} | {e['rightPinkyPeak4NativeTracks']['value']*100:.3f} | "
            f"{e['maxFingerPeak4NativeTracks']['value']*100:.3f} | {e['homeFloor4NativeTracks']*100:.3f} | "
            f"{e['s2DifferentKeySameFingerRate']*100:.3f} | {a['meanKeys']:.6f} | {a['selectionRate']*100:.4f} |")
    lines += ['', '这些改进保留了各路线事先约定的日常分、小指和 M 门槛，但不是全部人体工学属性的支配改进。'
        '例如均衡方案最大单指峰值从约 28.225% 升至 28.477%；最低 CKT 的新日常方案基准排下限从约 '
        '35.141% 降至 34.017%，单字异键同指率从约 5.834% 升至 6.128%。因此生产选型仍要权衡。']
    lines += ['', '## 搜索覆盖与边界','',
        f"共 **{bundle['uniqueScoredLayouts']} 个去重后实际布局**（含 3 个起点），"
        f"其中 {bundle['fullyRecomputedLayouts']} 个用完整 CPU 评分器复算。其余用 Rust 增量竞争评分，"
        '每个分片先复算起点并核验锚点，所有入选结果必须完整复算。','',
        '| 轮次 | 覆盖 | 本轮新增去重状态 |', '|---|---|---:|']
    for record in rounds:
        if record['phase']=='anneal':
            count=sum(chain['fresh'] for p in record['profiles'].values() for chain in p['chains'])
            description=f"三路线各两条随机链，每条 {record['stepsPerRepetition']} 步，温度 0.0007→0.00002"
        else:
            count=sum(p['fresh'] for p in record['profiles'].values())
            description='；'.join(f"{name}: {p['considered']}/{p['available']} 个合规候选" for name,p in record['profiles'].items())
        lines.append(f"| {record['phase']} | {description} | {count} |")
    chains=[chain for r in rounds if r['phase']=='anneal' for p in r['profiles'].values() for chain in p['chains']]
    lines += ['', f"短退火合计接受 {sum(c['accepted'] for c in chains)} 步，六条链中五条未接受新状态。"
        '这只能算非常保守的局部试探，不能据此声称独立盆地充分探索或总体收敛。'
        '最低分方案仅在列出的有限一步邻域和 120 个抽样组合中未被超过；远处仍可能有更优解。','',
        '算子包括根迁移/互换、组键迁移/互换、整个声母组件迁移/互换、根与组键联动、er/ü 联合归组，'
        '以及已评分近优单步的非冲突配对。组合只检查最终预算，允许跨过超预算的中间状态。'
        '均衡路线始终保持日常分≥126.216556768、左小指≤8.952096440%；'
        '日常路线保持日常分≥128.898433072、M≤21/24、左小指≤8.978672171%。','',
        '## 复核与复现','',
        '- 最终四个代表均由 JS 全语料评分独立复算，CKT 和原生小指与 Rust 的差异均小于 1e-9。',
        '- 实际码表重新推导 M-T1，并核对 1,407 个合法带调码；R11 日常文章回放与搜索冻结序列分数相符（1e-9）。',
        '- 最佳、minimax 与小指不增辅序由 JS 重新联合竞争，逐词长核对分数、码长和选重率。',
        '- `just cr-frontier-followup research/.cache/cr-frontier-followup-replay` 在新目录复现有限声韵搜索；'
        '`just cr-frontier-followup-auxiliary` 枚举辅序。对已有目录运行搜索阶段会追加一轮，export 阶段只读出结果。',
        '- `node --max-old-space-size=6144 tools/verify_cr_frontier_followup.js`，然后 '
        '`python -X utf8 tools/report_cr_frontier_followup.py` 生成独立核验与报告。',
        '- 同目录 `-finalists.json` 保存状态、全码表、来源哈希和各轮计数；`-scores.json.gz` 保存所有去重状态和分数。',
        '- 同目录 `-auxiliary.json` 保存全部辅序与九参数点，`-verification.json` 保存四轨全指标、人体工学及文章回放。',
        '', '生产页面与生产字典均保持原样；本轮结果作为可审阅、可复算的研究候选保存。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print('Wrote',str(PREFIX)+'.md')


if __name__ == '__main__':
    main()
