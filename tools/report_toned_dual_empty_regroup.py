"""Collect search frontiers, then render verified CKT/bucket/moving-hand comparisons."""
import argparse
import json
import subprocess
from pathlib import Path
from integrate_snow_jiandao_toned_r11 import macro_replay
from prepare_toned_rhyme_neighbors import read, ROOT

PREFIX = 'research/notes/2026-11-12-toned-dual-regroup'


def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def collect(rounds):
    all_layouts, champions, history = [], [], []
    unique_states = set()
    for name in rounds:
        cache = 'research/.cache/' + name
        output = 'research/notes/2026-11-12-' + name
        subprocess.run(['python', 'tools/export_toned_rhyme_neighbors.py', '--job', cache + '-job.json',
                        '--results', cache + '-scores.json', '--prefix', output], cwd=ROOT, check=True)
        layouts = read(output + '-finalists.json')
        results = read(output + '-results.json')
        job = read(cache + '-job.json')
        unique_states.update(json.dumps(c['state'], sort_keys=True) for c in job['candidates'])
        best = min(layouts['layouts'], key=lambda x: x['rustScore'])
        champions.append(best)
        all_layouts.extend(layouts['layouts'])
        history.append(dict(name=name, candidates=results['completed'], bestId=best['id'], bestScore=best['rustScore'],
                            memory=best['memoryAudit'], maxD=results['maxD'], maxM=results['maxM'],
                            operators=results['searchArguments']['operators'],
                            seedScores=results['seedScores'], elapsedSeconds=results['elapsedSeconds']))
    original = read('research/config/ckt-v51-toned-2121-mars10-qzzq-empty-p3-finalist.json')
    selected = [next(x for x in original['layouts'] if x['id'] == 'MARS10-QZZQEMPTY-P3-D2-M23-04')]
    selected.extend(champions)
    for d in [1, 2, 3]:
        for m in [21, 22, 23, 24]:
            eligible = [x for x in all_layouts if x['memoryAudit']['ordinaryD'] <= d and x['memoryAudit']['memoryLower'] <= m]
            if eligible:
                selected.append(min(eligible, key=lambda x: x['rustScore']))
    # Identical codes from several rounds are one representative.
    unique = {}
    for x in selected:
        unique.setdefault(tuple(x['tonedCodes']), x)
    output = dict(version='dual-empty-regroup-frontier-1', contract=layouts['contract'],
                  tokenKeys=layouts['tokenKeys'], layouts=list(unique.values()))
    output['contract']['searchMaxD'] = max(x['maxD'] for x in history)
    output['contract']['searchMaxMemoryLower'] = max(x['maxM'] for x in history)
    write(PREFIX + '-finalists.json', output)
    write(PREFIX + '-history.json', history)
    write(PREFIX + '-coverage.json', dict(uniqueScoredLayouts=len(unique_states),
          evaluationsIncludingRepeatedBaselines=sum(h['candidates'] for h in history),
          maxD=max(h['maxD'] for h in history), maxMemoryLower=max(h['maxM'] for h in history),
          rounds=rounds, globalOptimalityClaim=False))
    print('Representatives:', [(x['id'], x['rustScore']) for x in output['layouts']])


def render():
    report = read(PREFIX + '-benchmark.json')
    history = read(PREFIX + '-history.json')
    finalists = read(PREFIX + '-finalists.json')
    coverage = read(PREFIX + '-coverage.json')
    macro_input = read('research/.cache/dual-regroup-macro-input.json')
    layouts = {x['id']: x for x in macro_input['layouts']}
    for row in report['results']:
        layout = layouts[row['id']]
        codes = dict(zip(layout['tokenKeys'], layout['tonedCodes']))
        fixture = dict(tonedCodes=[[codes.get(py + str(t)) for t in range(1, 6)] for py in macro_input['data']['pinyin']])
        row['macro'] = macro_replay(macro_input['data'], fixture)
        if row['id'] != 'SNOW-JIANDAO-TONED':
            assert not row['inventory']['qzSyllables'] and not row['inventory']['zqSyllables']
    write(PREFIX + '-benchmark.json', report)
    research = [r for r in report['results'] if r['id'] != 'SNOW-JIANDAO-TONED']
    best = min(research, key=lambda r: r['ckt']['v51']['score'])
    old = next(r for r in research if r['id'] == 'MARS10-QZZQEMPTY-P3-D2-M23-04')
    production = report['results'][0]
    gain = 100 * (1 - best['ckt']['v51']['score'] / old['ckt']['v51']['score'])
    production_gap = 100 * (best['ckt']['v51']['score'] / production['ckt']['v51']['score'] - 1)
    lines = ['# 新韵组重分配＋QZ/ZQ双空：低D/M搜索', '',
        f"本轮最佳 `{best['id']}`：CKT v5.1 **{best['ckt']['v51']['score']:.9f}**，"
        f"D={best['memory']['ordinaryD']}、M_lower/M_guard={best['memory']['memoryLower']}/{best['memory']['memoryGuard']}。"
        f"相对原双空D2/M23的{old['ckt']['v51']['score']:.9f}降低**{gain:.3f}%**；"
        f"仍比非双空生产M21的{production['ckt']['v51']['score']:.9f}高{production_gap:.3f}%。", '',
        f"共评分{coverage['evaluationsIncludingRepeatedBaselines']}次，去重后{coverage['uniqueScoredLayouts']}个布局。"
        + ('本轮始终保持D≤2、M_lower≤23，未放宽预算。' if coverage['maxD'] <= 2 and coverage['maxMemoryLower'] <= 23 else '各轮预算见下表。'), '',
        '主预算为普通声母D≤2、M_lower≤23，F=0，不设韵母声调例外。'
        '保持18个韵根、10个非空组；各根的全部韵母一起迁移，组成员不随声调变化。'
        '例如ong/iong始终属于同一个韵根。此搜索不是任意分组空间的全局最优证明。', '',
        'M_lower=5＋首键位移成本＋多韵根组数＋各声调区(10−使用键数)之和；'
        'M_guard将多韵根组数替换为组内合并链接数（18−10=8）。M_guard另列，不假设恒等于M_lower＋2。', '',
        '评分沿用CKT v5.1、12/213/24、1:3:1:1、AVUIO形辅（shapeKeysByMeaning）、IVUAO声调映射（toneKeysByTone）。'
        'Python生成时和Rust评分时均检查1407合法音节的QZ/ZQ；代表方案再由JS独立重算。', '',
        '## 搜索轮次', '', '| 轮次 | 算子 | D/M上限 | 评分数 | 最优ID | CKT v5.1 | M下界/guard |',
        '|---|---|---:|---:|---|---:|---:|']
    for h in history:
        m = h['memory']
        lines.append(f"| {h['name']} | {h['operators']} | {h['maxD']}/{h['maxM']} | {h['candidates']} | {h['bestId']} | {h['bestScore']:.9f} | {m['memoryLower']}/{m['memoryGuard']} |")
    lines += ['', '轮次评分数包括每轮保留的基线，不能直接当作全程独立布局数。'
              'root为根迁移/互换，key为组键迁移/互换，first为整个声母组件迁移，'
              'coupled为根迁移/互换与两受影响组的换键联动。', '',
        '## 统一benchmark', '',
        '移手分采用rime-snow-pinyin README中的“日常纯双拼移动手分数（含标点）”：'
        '同一日常八场景文稿2149击键，不含形辅、空格和选重，越高越好。', '',
        '| ID | D/F | M下界/guard | CKT v5.1↓ | CKT v5↓ | 占桶/441 | 占比 | 日常含标点移手分↑ | 最大单指峰值 |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for r in report['results']:
        m, b = r['memory'], r['inventory']
        lines.append(f"| {r['id']} | {m['ordinaryD']}/{m['ordinaryF']} | {m['memoryLower']}/{m['memoryGuard']} | {r['ckt']['v51']['score']:.9f} | {r['ckt']['v5']['score']:.9f} | {b['occupied']}/441 | {b['occupancyPercent']:.2f}% | {r['macro']['daily|native-punctuation']['score']:.6f} | {100*r['ergonomics']['maxFingerPeak4NativeTracks']['value']:.3f}% |")
    lines += ['', '生产M21仍为QZ含qia1/qiu1、ZQ含zan4/zuan4的对照；其他本报告代表方案均双空。'
              '搜索结果未替换生产布局。', '', '## CKT v5.1四轨有效耗时', '',
              '| ID | 单字ms | 二字ms | 三字ms | 四字ms | 加权选重率 | 平均码长 |',
              '|---|---:|---:|---:|---:|---:|---:|']
    for r in report['results']:
        c = r['ckt']
        times = ' | '.join(f"{c['v51']['tracks'][k]['effectiveMs']:.3f}" for k in ['character', 'word2', 'word3', 'word4'])
        lines.append(f"| {r['id']} | {times} | {100*c['aggregateV51']['selectionRate']:.4f}% | {c['aggregateV51']['meanKeys']:.6f} |")
    for layout in finalists['layouts']:
        if 'rhymeGroups' not in layout:
            continue
        lines += ['', '## ' + layout['id'] + ' 声韵布局', '',
                  '首键：' + '；'.join(f'{a}→{k}' for a, k in layout['firstKeys'].items()) + '。', '',
                  '| 组 | 全部韵母（v表示ü） | 四声/上排 | 二三声/中排 | 一声轻声/下排 |',
                  '|---|---|---|---|---|']
        for group in layout['rhymeGroups']:
            keys = group['keys']
            lines.append(f"| {group['slot']} | {' / '.join(group['finals'])} | {keys['upper']} | {keys['home']} | {keys['lower']} |")
    lines += ['', '## 复现与数据', '',
        '每轮完整算子、起点与预算存于对应results.json的searchArguments；先按其参数生成job，'
        '再用tools/run_toned_neighbor_shards.py评分。justfile提供初始轮与后继轮配方。', '',
        '- [代表布局与全部1407编码](2026-11-12-toned-dual-regroup-finalists.json)',
        '- [完整benchmark](2026-11-12-toned-dual-regroup-benchmark.json)',
        '- [轮次摘要](2026-11-12-toned-dual-regroup-history.json)']
    (ROOT / (PREFIX + '.md')).write_text('\n'.join(lines) + '\n', encoding='utf8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--collect', nargs='+')
    args = parser.parse_args()
    if args.collect:
        collect(args.collect)
    else:
        render()
