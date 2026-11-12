"""Compare exact CKT, four-track Q/A/Z load and daily punctuation replay."""
import argparse
import json
from prepare_toned_rhyme_neighbors import ROOT, read
from integrate_snow_jiandao_toned_r11 import macro_replay


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('names', nargs='+')
    args = parser.parse_args()
    rows, layouts = {}, {}
    for name in args.names:
        prefix = 'research/notes/2026-11-13-' + name
        report = read(prefix + '-benchmark.json')
        data = read('research/.cache/' + name + '-macro.json')
        mapping = {x['id']:x for x in data['layouts']}
        for r in report['results']:
            layout = mapping[r['id']]
            codes = dict(zip(layout['tokenKeys'],layout['tonedCodes']))
            fixture = dict(tonedCodes=[[codes.get(py+str(t)) for t in range(1,6)] for py in data['data']['pinyin']])
            r['macro'] = macro_replay(data['data'],fixture)
            m = r['macro']['daily|native-punctuation']
            r['dailyLeftPinky'] = m['finger_load'][0]/m['hits']
            rows[r['id']] = r
        layouts.update({x['id']:x for x in read(prefix + '-finalists.json')['layouts']})
    baseline = rows['SNOW-JIANDAO-TONED']
    for r in rows.values():
        r['improvesAllThree'] = (r['ckt']['v51']['score'] < baseline['ckt']['v51']['score'] - 1e-9
            and r['macro']['daily|native-punctuation']['score'] > baseline['macro']['daily|native-punctuation']['score'] + 1e-9
            and r['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value'] < baseline['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value'] - 1e-9)
        r['improvesDailyPinkyToo'] = r['improvesAllThree'] and r['dailyLeftPinky'] < baseline['dailyLeftPinky'] - 1e-9
    output = 'research/notes/2026-11-13-toned-comfort'
    (ROOT/(output+'.json')).write_text(json.dumps(dict(results=list(rows.values()),layouts=layouts),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    lines = ['# 原M21附近：左小指、含标点移手与CKT联合探索','',
      '已找到三项同时改善且日常左小指也减负的QZ单空方案。CQ0-0181更偏当量，CQ0-0271更偏移手：'
      '两者D2、M_lower/M_guard=23/26，左小指四轨峰值均从10.809%降到8.980%。'
      '相对原D1、M21/23，普通声母位移增加1、M_lower增加2、M_guard增加3。', '',
      '不限QZ的CF1-0892当量更低（9.182622913），但左小指峰值仅降到10.791%、日常左小指占比不变，'
      '不应与上述明显减压方案等量齐观。CF1-0345日常左小指下降而四轨峰值升至12.390%，已排除。', '',
      '停止QZ/ZQ双空搜索。此次允许ZQ占用，比较QZ单空与QZ不受约束两条路线；D≤2、M_lower≤23，F=0，无韵母声调例外。M_guard单列。', '',
      '“三项改善”指CKT v5.1降低、日常含标点移手分提高、四条原生补全终码轨的Q/A/Z左小指负载峰值降低。'
      '另列日常纯双拼左小指占比；负载是频率指标，不是医学疲劳分数。含标点移手沿用README日常八场景2149击键。', '',
      '| ID | D | M下界/guard | QZ空 | CKT v5.1↓ | 含标点移手↑ | 四轨左小指峰值↓ | 日常左小指↓ | 三项改善 |',
      '|---|---:|---:|---|---:|---:|---:|---:|---|']
    for r in rows.values():
        m=r['memory']; e=r['ergonomics']
        lines.append(f"| {r['id']} | {m['ordinaryD']} | {m['memoryLower']}/{m['memoryGuard']} | {'是' if not r['inventory']['qzSyllables'] else '否'} | {r['ckt']['v51']['score']:.9f} | {r['macro']['daily|native-punctuation']['score']:.6f} | {100*e['leftPinkyQAZPeak4NativeTracks']['value']:.3f}% | {100*r['dailyLeftPinky']:.3f}% | {'是' if r['improvesAllThree'] else '否'} |")
    lines += ['', '## 左小指各轨分布', '', '| ID | 单字Q/A/Z | 二字Q/A/Z | 三字Q/A/Z | 四字Q/A/Z |', '|---|---|---|---|---|']
    for r in rows.values():
        values = [' / '.join(f"{100*r['ergonomics']['tracks'][track]['load'][key]:.3f}%" for key in 'QAZ') for track in ['character','word2','word3','word4']]
        lines.append('| '+r['id']+' | '+' | '.join(values)+' |')
    lines += ['', '## 搜索范围与校验', '',
      '从生产M21出发评分1819个单步/联动候选；另从既有QZ单空G2-0002、G2-0012出发生成1584个候选，'
      '先用完整日常语料筛选移手超过原M21者，再评分128个候选和2个基线。'
      '不限QZ后继轮从er并入ang组的CF0-0169出发生成1094个候选，筛后评分482个（含基线）。'
      '日常筛选用于限定本次联合目标，不代表筛掉的方案CKT一定差，也不是全局最优证明。', '',
      '代表方案的CKT由JS从完整四轨语料独立重算，与Rust增量结果误差须小于1e-9；'
      '辅助语义保持shapeKeysByMeaning=AVUIO、toneKeysByTone=IVUAO，词辅12/213/24。生产布局未替换。']
    lines += ['', '[完整搜索审计：候选、评分、日常回放与起点](2026-11-13-comfort-search-audit.json)。'
              '复现配方见research/toned-comfort.just；审计JSON中的seeds可导出供--seed-file使用。']
    for r in rows.values():
        if not r['improvesAllThree']:
            continue
        layout=layouts[r['id']]
        lines += ['', '## '+r['id']+' 声韵布局', '',
          '首键：'+'；'.join(f'{a}→{k}' for a,k in layout['firstKeys'].items())+'。', '',
          '| 韵母（v=ü） | 四声 | 二三声 | 一声/轻声 |','|---|---|---|---|']
        for g in layout['rhymeGroups']:
            k=g['keys']; lines.append(f"| {' / '.join(g['finals'])} | {k['upper']} | {k['home']} | {k['lower']} |")
    (ROOT/(output+'.md')).write_text('\n'.join(lines)+'\n',encoding='utf8')
    print(json.dumps([dict(id=r['id'],allThree=r['improvesAllThree'],dailyToo=r['improvesDailyPinkyToo']) for r in rows.values()]))


if __name__ == '__main__':
    main()
