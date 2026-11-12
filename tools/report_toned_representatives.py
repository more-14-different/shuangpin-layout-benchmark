"""Replay the same frozen moving-hand corpora and render representative tables."""
import json
from pathlib import Path
from integrate_snow_jiandao_toned_r11 import macro_replay

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT / 'research/notes/2026-11-12-toned-representative-benchmark'
LABELS = {
    'G2-0000': '旧完整火星分组严格QZ冠军',
    'G2-0004': '无例外重分组：er并入an组、ü并入o/ong组（D2/M24）',
    'G2-0002': '无例外重分组：er并入a/ou组、ü并入o/ong组（D2/M23）',
    'G2-0013': '无例外重分组：er并入an组、ü并入o/ong组（D1/M22）',
    'G2-0012': '无例外重分组：er并入a/ou组、ü并入o/ong组（D1/M21）',
    'G0-0153': '仅er整体并入an组', 'G0-0235': '仅ü整体并入o/ong组',
    'G0-0149': '仅er整体并入a/ou组',
    'R0463': '两条声调例外：üe二三声→L、ua四声→R',
    'R0008': '一条声调例外ou四声→T，并联动上排组键位',
    'R0445': '一条声调例外üe二三声→L',
    'MARS10-QZZQEMPTY-P3-D2-M23-04': '此前Phase III的QZ与ZQ双空对照，普通声母p→S、z→C',
}


def main():
    report = json.loads(PREFIX.with_suffix('.json').read_text(encoding='utf8'))
    macro_input = json.loads((ROOT / 'research/.cache/toned-representative-macro-input.json').read_text(encoding='utf8'))
    pinyin = macro_input['data']['pinyin']
    layouts = {x['id']: x for x in macro_input['layouts']}
    for row in report['results']:
        row['label'] = LABELS.get(row['id'], row['label'])
        layout = layouts[row['id']]
        codes = dict(zip(layout['tokenKeys'], layout['tonedCodes']))
        fixture = {'tonedCodes': [[codes.get(py + str(t)) for t in range(1, 6)] for py in pinyin]}
        row['macro'] = macro_replay(macro_input['data'], fixture)
        row.pop('macroTotal', None)
    PREFIX.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    rows = report['results']
    lines = ['# 带调代表方案与 HTML 生产候选 M21：统一 benchmark', '',
        '直接读取 `a7_CKT_R11.html` 的 `tonedContractBenchmark.schemes.snowJiandao`，定位生产候选为 '
        '`SNOW-JIANDAO-TONED` / `MARS10-AVUIO786-D1-final-9.203609845305`。相关提交：'
        '`fd59085` 集成原生带调 benchmark，`0e8478d` 加入筛选，`744c21a` 加入表格和键盘图。', '',
        '**本轮重分组代表方案均不是 ZQ 空桶。** 原 HTML M21 甚至 QZ 也不为空；另列此前已搜索的 '
        '`MARS10-QZZQEMPTY-P3-D2-M23-04` 为双空对照，该方案不是本轮重分组结果。', '',
        '共同评分合同：Shape-only CKT v5.1，字/二/三/四字词权重1:3:1:1；'
        '`shapeKeysByMeaning=AVUIO`、`toneKeysByTone=IVUAO`、`toneDigitsByShapeMeaning=42310`；'
        'v5词辅12/21/24，v5.1词辅12/213/24，分别使用对应S005参考。全部由同一当前语料重算。', '',
        'M沿用各方案声明的规则口径（M_lower/M_guard），D/F则从实际音节首键统一重算普通声母位移/分裂。'
        '**HTML生产候选已修正为普通D=1/F=0**；评分脚本从实际音节编码推导D/F，避免再次使用旧fixture中的F=1标签。'
        'fixture.expected.tracks为历史附带数据，本报告未将其当作当前分项结果；以本次重算及HTML嵌入分数校验为准。', '',
        '## 方案与桶占用', '',
        '| ID | D/F | M下界/guard | 1407占桶/441 | 占比 | 空桶 | Common1237占桶 | QZ音节 | ZQ音节 | CKT v5 | CKT v5.1 |',
        '|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|']
    for r in rows:
        m, b, c = r['memory'], r['inventory'], r['ckt']
        lines.append(f"| {r['id']} | {m['ordinaryD']}/{m['ordinaryF']} | {m['memoryLower']}/{m['memoryGuard']} | {b['occupied']}/441 | {b['occupancyPercent']:.2f}% | {b['emptyCount']} | {b['occupiedCommon1237']} | {', '.join(b['qzSyllables']) or '空'} | {', '.join(b['zqSyllables']) or '空'} | {c['v5']['score']:.9f} | {c['v51']['score']:.9f} |")
    lines += ['', '桶占用按不同合法音节编码去重，未加词频权重；1407与Common1237不可混算。'
              '高占桶率表示较少空桶，不直接等于较低当量或较低高频重码。', '', '## 方案说明', '']
    for r in rows:
        lines.append(f"- `{r['id']}`：{r['label']}。源文件：`{r['source']}`。")
    lines += ['', '## CKT v5.1 有效耗时与补全', '',
        '耗时单位ms，每轨按该轨词频加权；汇总使用1:3:1:1。汇总耗时是加权算术均值，CKT是归一化四次方聚合，二者排序不必完全一致。', '',
        '| ID | 单字ms | 二字ms | 三字ms | 四字ms | 加权ms | 平均按键数 | 加权选重率 |',
        '|---|---:|---:|---:|---:|---:|---:|---:|']
    for r in rows:
        c = r['ckt']; tracks = c['v51']['tracks']; a = c['aggregateV51']
        values = ' | '.join(f"{tracks[k]['effectiveMs']:.3f}" for k in ['character','word2','word3','word4'])
        lines.append(f"| {r['id']} | {values} | {a['effectiveMs']:.3f} | {a['meanKeys']:.6f} | {100*a['selectionRate']:.4f}% |")
    lines += ['', '完整JSON还包含各轨运动耗时、第一/第二/第三辅助码触发率、选重率、候选拒绝数及平均码长。'
              '本次语料轨数为6233个单字条目、132814个二字词、72923个三字词、77674个四字词。', '',
        '## 人体工学与移动手', '',
        '本表负载根据4条原生带调轨的最终补全码计算，不是旧20合同峰值。左小指为QAZ，右小指为P；'
        '同指异键率是单字轨码内相邻键比例。移动手为相同冻结daily汉字语料的纯前两码回放，不含形辅和选重，速度是相对模型分数，不是真实字/分钟。', '',
        '| ID | 单字主排 | 四轨主排下限 | 左小指峰值 | 右小指峰值 | 最大单指峰值 | 单字同指异键 | daily移动手分数↑ | daily平均相对时间↓ |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for r in rows:
        e = r['ergonomics']; macro = r['macro']['daily|hanzi-only']
        values = [e['homeS2'], e['homeFloor4NativeTracks'], e['leftPinkyQAZPeak4NativeTracks']['value'],
                  e['rightPinkyPeak4NativeTracks']['value'], e['maxFingerPeak4NativeTracks']['value'],e['s2DifferentKeySameFingerRate']]
        lines.append(f"| {r['id']} | " + ' | '.join(f'{100*v:.3f}%' for v in values) + f" | {macro['score']:.6f} | {macro['avg_time']:.6f} |")
    lines += ['', '## 日常纯双拼移动手分数（含标点）', '',
        '沿用 `D:/C2D/Documents/rime-snow-pinyin/README.md` 的同名指标：'
        '日常八场景冻结文稿，2149击键，`daily|native-punctuation.score`，越高越好。'
        '只含纯双拼与文稿标点，不含形辅、空格和选重；不合并default语料。'
        '分数为200×字符数/模型时间，不是真实打字速度。', '',
        '| ID | 日常纯双拼移动手分数（含标点）↑ |',
        '|---|---:|']
    for r in rows:
        lines.append(f"| {r['id']} | {r['macro']['daily|native-punctuation']['score']:.6f} |")
    lines += ['', '## 新分组与QZ/ZQ双空探索状态', '',
        '本表对应的早期新分组765个候选只禁止QZ；表内双空对照沿用原火星分组。'
        '随后开展的新韵组＋双空联合搜索见[独立报告](2026-11-12-toned-dual-regroup.md)，'
        '其主预算为D≤2、M_lower≤23。本表双空对照不能代表后续新分组的最佳结果。', '',
        '## 复现', '', '```powershell', 'node tools/benchmark_toned_representatives.js',
              'python tools/report_toned_representatives.py', '```', '',
              '[机器可读完整数据](2026-11-12-toned-representative-benchmark.json)含空桶清单、ZQ/QZ具体音节、完整四轨负担、源文件SHA256和全部冻结移动手语料结果。']
    lines += ['', '## 解读与校验', '',
        '- 原HTML M21与本轮G2-0012虽然都写M_lower=21，但guard分别是23和24，不应称为完全相同的记忆预算。',
        '- 无例外最优G2-0004相对原HTML M21，CKT下降约0.247%，四轨有效耗时均略降；'
        '但最大单指峰值升至30.021%，daily纯主码移动手分数从116.812降至115.589。',
        '- 两条例外R0463综合CKT最低、单字更快且最大单指峰值较低，但二字/四字词并非都优于原HTML M21。',
        '- 本次所列双空对照分数9.267573，是既有双空搜索结果。它与单空方案同时有声母和韵组变化，'
        '差值不能解释为单独清空ZQ的因果代价。',
        '- HTML生产候选的v5/v5.1分数、v5.1逐轨数据、完整人体工学数据、全部冻结语料的移动手结果均逐字段核对完全相同。'
        '各研究候选的重算CKT与已存Rust/JS分数差异均小于1e-9。',
        '- 本次已更正生产HTML的普通声母F元数据，未改变布局或CKT。复用近期集成提交中的原生带调负载与移动手实现，避免套用无调20合同指标。']
    PREFIX.with_suffix('.md').write_text('\n'.join(lines) + '\n', encoding='utf8')
    print('Rendered', len(rows), 'representatives')


if __name__ == '__main__':
    main()
