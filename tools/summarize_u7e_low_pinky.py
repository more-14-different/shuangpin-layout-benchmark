"""Independently verify archived U7E low-pinky tradeoffs and write comparison."""
import gzip
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT / 'research/notes/2026-11-21-u7e-low-pinky'
REPLAY = ROOT / 'research/.cache/R11_integrated_replay'
sys.path.insert(0, str(REPLAY))
from macroxue.engine import LAYOUT
import memory_r2

IDS = ['UQO-4639603cff40', 'UQO-aac21019ffc7', 'UQO-daf6cb6be0bd',
       'U7H-f37fb77c222d', 'UED-3158ce08b5bc', 'UED-4e51c4bb4130']
KINDS = ['character', 'word2', 'word3', 'word4']
WEIGHTS = [1, 3, 1, 1]
FINGERS = ['QAZ', 'WSX', 'EDC', 'RFVTGB', 'YHNUJM', 'IK,', 'OL.', "P;/[]\\'"]
COEFFICIENTS = ['firstAuxRate', 'secondAuxRate', 'thirdAuxRate', 'selectionRate',
                'meanRejectedCandidates', 'meanPageActions']
COSTS = [300, 300, 300, 600, 50, 300]


def read(p):
    return json.loads(Path(p).read_text(encoding='utf8'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def near(a, b):
    assert abs(a - b) < 1e-10, (a, b)


def normalized(modes, reference, multiplier):
    def effective(track):
        return track['motorUpperMs'] + multiplier * sum(
            track.get(field, 0) * cost for field, cost in zip(COEFFICIENTS, COSTS))
    value = sum(w * (effective(modes[m][k]) / effective(reference[m][k])) ** 4
                for m in ['keytao', 'sanpin'] for k, w in zip(KINDS, WEIGHTS))
    return 10 * (value / 12) ** .25


def main():
    sources = {}

    def load(p):
        sources[str(p)] = sha(p)
        r = read(p)
        for source, digest in r.get('sourceHashes', {}).items():
            assert sha(source) == digest, source
        return r

    screen = load(str(PREFIX) + '-screen.json')
    baselines = load(str(PREFIX) + '-baselines.json')
    assert sha(baselines['sourceHtml']) == baselines['sourceHtmlSha256']
    prior_path = ROOT / 'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'
    prior = load(prior_path)['auditInput']
    meta_path = REPLAY / 'model_meta.json'
    mass_path = REPLAY / 'r4_token_loads.json'
    meta, loads = load(meta_path), load(mass_path)
    original = {}
    for ident in ['U7R-ba54b6e08e04', 'UED-18c004bd1f31']:
        p = ROOT / f'research/notes/2026-11-21-u7e-competing-{ident}.json'
        original[ident] = load(p)
    data = [load(str(PREFIX) + '-score-OC21-e1f155973380.json'), *original.values()]
    data += [load(str(PREFIX) + '-score-' + ident + '.json') for ident in IDS]
    reference = None
    policies = {}
    for ident in IDS:
        component_path = Path(str(PREFIX) + '-components-' + ident + '.json.gz')
        component = json.loads(gzip.decompress(component_path.read_bytes()))
        policy = load(str(PREFIX) + '-policy-' + ident + '.json')
        robust = load(str(PREFIX) + '-robustness-' + ident + '.json')
        assert policy['completed'] and robust['completed']
        assert robust['inputSha256'] == sha(component_path)
        assert component['coefficients'] == COEFFICIENTS
        assert component['baselineCostsMs'] == COSTS
        if reference is None:
            reference = component['reference']
        else:
            assert reference == component['reference']
        for replay in policy['replays']:
            assert replay['maxTrackDifference'] < 1e-8
        policies[ident] = policy
    baseline_by_id = {r['id']: r for r in baselines['rows']}
    rows, audits = [], []
    ued = original['UED-18c004bd1f31']
    for r in data:
        ident = r['id']
        same_initials = r['initialMap'] == screen['initialMap']
        assert same_initials == (ident != 'OC21-e1f155973380')
        a = memory_r2.audit(prior, {**r, 'capacity': [21, 21]})
        assert a['M'] == (41 if same_initials else 42)
        assert a['ordinaryDisplacedCount'] == 2 and a['coverage'] == 399
        assert a['branchCount'] == 0 and a['usedFinalKeys'] == 21
        codes = {r['codeList'][p] for p, _ in prior['base']}
        qz_empty, zq_empty = 'QZ' not in codes, 'ZQ' not in codes
        assert qz_empty == (not r['audit']['qz'])
        assert zq_empty == (not r['audit']['zq'])
        sem = r['auxiliarySemantics']
        assert (sem['toneKeysByTone'], sem['shapeKeysByMeaning'],
                sem['toneDigitsByShapeMeaning']) == ('IVUAO', 'AVUIO', '42310')
        for index, multiplier in enumerate([1, 2, 3]):
            near(normalized(r['modes'], reference, multiplier), r['ckt'][index])
        combined_keys, combined_pairs, total_keys, total_pairs = {}, {}, 0, 0
        peak8 = 0
        for mode in ['keytao', 'sanpin']:
            for kind, weight in zip(KINDS, WEIGHTS):
                t = r['terminalCodes'][mode][kind]
                total_keys += weight * t['meanKeys'] / 12
                total_pairs += weight * t['meanPairs'] / 12
                for key, value in t['expectedKeys'].items():
                    combined_keys[key] = combined_keys.get(key, 0) + weight * value / 12
                for key, value in t['expectedPairs'].items():
                    combined_pairs[key] = combined_pairs.get(key, 0) + weight * value / 12
                near(sum(v for rank, v in t['rankMass'].items() if int(rank) > 1),
                     r['modes'][mode][kind]['selectionRate'])
                peak8 = max(peak8, sum(t['expectedKeys'].get(k, 0)
                                      for k in FINGERS[-1]) / t['meanKeys'])
        e = r['ergonomics']
        near(sum(combined_keys.values()), total_keys)
        near(sum(combined_pairs.values()), total_pairs)
        fingers = [sum(combined_keys.get(k, 0) for k in keys) / total_keys
                   for keys in FINGERS]
        for observed, stored in zip(fingers, e['fingers']):
            near(observed, stored)
        near(fingers[-1], e['rightPinky'])
        near(peak8, e['peaks']['rightPinky']['value'])
        near(max(fingers), e['maxFinger'])
        near(sum(combined_keys.get(k, 0) for k in "ASDFGHJKL;'") / total_keys, e['home'])
        pair_values = dict(sameHand=0., sameFinger=0., differentKeySameFinger=0.)
        for pair, value in combined_pairs.items():
            first, second = [LAYOUT[k.lower()] for k in pair]
            if (first[0] < 5) == (second[0] < 5):
                pair_values['sameHand'] += value
            if first[2] == second[2]:
                pair_values['sameFinger'] += value
                if pair[0] != pair[1]:
                    pair_values['differentKeySameFinger'] += value
        for field, value in pair_values.items():
            near(value / total_pairs, e[field])
        mapped = ([r['initialMap'][h] for h in meta['heads']] +
                  [r['finalMap'][f] for f in meta['finals']] + list(sem['toneKeysByTone']))
        assert all(key not in ";/[]\\'" for key in mapped)
        historical = {track: sum(value for key, value in zip(mapped, loads[track]['mass'])
                                  if key == 'P') / sum(loads[track]['mass']) for track in meta['tracks']}
        max20 = max(historical.values())
        if 'legacyRightPinky' in r:
            near(max20, r['legacyRightPinky']['max20'])
        else:
            near(max20, baseline_by_id[ident]['legacy']['rightPinkyMax20'])
        p = policies.get(ident)
        if p:
            robust = read(str(PREFIX) + '-robustness-' + ident + '.json')
            for mode, key in robust['selectedPolicies'].items():
                assert key == '/'.join(r['policies'][mode][k] for k in ['word2', 'word3', 'word4'])
            point = [item['score'] for item in p['optima']]
            for current, optimal in zip(r['ckt'], point):
                assert current >= optimal - 1e-10
        else:
            point = None
        groups = {key: [f for f, assigned in r['finalMap'].items() if assigned == key]
                  for key in sorted(set(r['finalMap'].values()))}
        changes = {f: {'from': ued['finalMap'][f], 'to': key}
                   for f, key in r['finalMap'].items() if ued['finalMap'][f] != key}
        rows.append(dict(id=ident, sameOriginalU7EInitials=same_initials, M=a['M'], D=2,
                         qzEmpty=qz_empty, zqEmpty=zq_empty, rightPinky20=max20,
                         rightPinky20Track=max(historical, key=historical.get),
                         ckt=r['ckt'], pointOptima=point, policies=r['policies'],
                         ergonomics={k: v for k, v in e.items()
                                     if k not in ['sufficientStatistics', 'byTrack', 'keyShares']},
                         aggregate=r['aggregate'], finalGroups=groups, finalChangesFromUED=changes,
                         initialMap=r['initialMap'], finalMap=r['finalMap']))
        audits.append(dict(id=ident, M=a['M'], D=2, coverage=399, branches=0,
                           actual=[21, 21], unique=a['unique']))
    for p in [Path(__file__), REPLAY / 'memory_r2.py', REPLAY / 'audit.py',
              REPLAY / 'macroxue/engine.py', ROOT / 'tools/robust_untoned_v52_policy.py',
              ROOT / 'tools/analyze_single_ckt_v51_aux_order.py']:
        sources[str(p)] = sha(p)
    result = dict(completed=True, rows=rows, screenedUniqueStates=screen['uniqueStates'],
                  scope='Archived same-initial U7E M41 tradeoffs, not a new global search. Historical '
                  'R11 20-contract peak and actual CKT terminal-code 8-track loads are separate. '
                  'Each new candidate uses its own robust policy: six independent 0.5..5x costs, '
                  'one million scenarios per member; 1..10x stress grid also retained. Current '
                  'terminal-letter loads include auxiliaries, exclude selection/page/space/errors; '
                  'members equal and character:word2:word3:word4 event weights 1:3:1:1, '
                  'expected keystrokes aggregated before taking shares. Pair rates are within-code.',
                  verification=dict(independentMemory=audits, independentCktRepricing=True,
                                    independentExpectedKeyPairAggregation=True,
                                    independentFingerGeometry=True, independentHistoricalLoad=True,
                                    canonicalReplayMaxDifferenceBelow1eMinus8=True,
                                    allSourceHashesMatch=True), sourceHashes=sources)
    Path(str(PREFIX) + '-summary.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')
    lines = ['# 原 U7E 声母：低右小指候选复核（2026-11-21）', '',
             f'统一固定辅序筛查 {screen["uniqueStates"]:,} 个既有韵布局，挑出 6 套，逐套枚举每模式 144 种辅序、做两组百万成本场景，并以各自稳健辅序完整回放。没有新开退火。', '',
             '## 比较口径', '',
             '除 OC21 参考行外，全部沿用原 U7E 声母、A/E/O=R，D=2、M=41、V=5、实际 21×21、399 音节、无分支。', '',
             '“20 合同峰值”复现 HTML 历史列；“8 轨混合/峰值”来自本次实际终码（包含补码）。两者语料和分母不同，不能混比。混合先按事件权重累加期望击键，再计算指占比；选重、翻页、空格、误键未计入物理负荷。CKT 另计这些认知/选择成本。', '',
             '1/2/3 倍 CKT 将六项认知延时一起等比变化，并对参照同步重算；表内每套固定自己的稳健辅序，未在每个倍率换成点最优。稳健标准为六项成本各自独立 0.5–5 倍的百万场景平均竞争排名；另存 1–10 倍压力网格。', '',
             '| 方案 | M | QZ/ZQ 均空 | 20 合同右小指峰值 | 8 轨混合右小指 | 8 轨右小指峰值 | CKT 1 倍 | CKT 2 倍 | CKT 3 倍 |',
             '|---|---:|:---:|---:|---:|---:|---:|---:|---:|']
    for r in rows:
        e = r['ergonomics']
        lines.append(f'| {r["id"]} | {r["M"]} | {"是" if r["qzEmpty"] and r["zqEmpty"] else "否"} | '
                     f'{100*r["rightPinky20"]:.6f}% | {100*e["rightPinky"]:.6f}% | '
                     f'{100*e["peaks"]["rightPinky"]["value"]:.6f}% | ' +
                     ' | '.join(f'{v:.9f}' for v in r['ckt']) + ' |')
    by_id = {r['id']: r for r in rows}
    base = by_id['UED-18c004bd1f31']
    balanced = by_id['UQO-aac21019ffc7']
    strict = by_id['UED-3158ce08b5bc']
    lines += ['', '## 结论', '',
              '优先关注 UQO-aac21019ffc7：与 UED 相同声母和 M41，实际终码混合右小指 '
              f'{100*base["ergonomics"]["rightPinky"]:.6f}%→{100*balanced["ergonomics"]["rightPinky"]:.6f}%，'
              f'八轨峰值 {100*base["ergonomics"]["peaks"]["rightPinky"]["value"]:.6f}%→'
              f'{100*balanced["ergonomics"]["peaks"]["rightPinky"]["value"]:.6f}%。'
              f'1 倍 CKT 改善 {base["ckt"][0]-balanced["ckt"][0]:.9f}；'
              f'2 倍改善 {base["ckt"][1]-balanced["ckt"][1]:.9f}，近乎持平；'
              f'3 倍增加 {balanced["ckt"][2]-base["ckt"][2]:.9f}。QZ/ZQ 不空。', '',
              '若要保留 QZ/ZQ 空桶，UED-3158ce08b5bc 保留相同的低小指韵组，'
              f'1/2 倍 CKT 为 {strict["ckt"][0]:.9f}/{strict["ckt"][1]:.9f}。', '',
              '主要机制是 P 上 iang/o/ong 与 J 上 er/ian/uang 整组互换。'
              '小指减负会转给右食指：'
              f'{100*base["ergonomics"]["fingers"][4]:.6f}%→{100*balanced["ergonomics"]["fingers"][4]:.6f}%；'
              '码内异键同指也由 '
              f'{100*base["ergonomics"]["differentKeySameFinger"]:.6f}%→'
              f'{100*balanced["ergonomics"]["differentKeySameFinger"]:.6f}%。'
              '因此这是更适合重视小指负荷的取舍点，并非所有维度同时占优。', '',
              '历史峰值恰好等于 OC21 的 UQO-4639603cff40，以及历史峰值更低的 '
              'UQO-daf6cb6be0bd，实际八轨峰值都高于 UED；若关心最坏词长轨的小指压力，'
              '不应只按 HTML 历史一列选它们。', '',
              '## 负荷转移与其他人体工学指标', '',
              '| 方案 | 主行 | 左食指 | 右食指 | 右无名指 | 最大单指 | 码内异键同指 | 码内异手 | 首辅率 | 终码选重率 |',
              '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for r in rows:
        e = r['ergonomics']
        values = [e['home'], e['fingers'][3], e['fingers'][4], e['fingers'][6],
                  e['maxFinger'], e['differentKeySameFinger'], e['alternation'],
                  r['aggregate']['firstAuxRate'], r['aggregate']['selectionRate']]
        lines.append('| ' + r['id'] + ' | ' + ' | '.join(f'{100*v:.6f}%' for v in values) + ' |')
    lines += ['', '## 辅序与韵组', '',
              'toneKeysByTone=IVUAO；shapeKeysByMeaning=AVUIO；配对 invariant=42310。下列辅序数字表示所取词中字位，按二字词/三字词/四字词排列，与上述五辅的字义顺序无关。', '']
    for r in rows[3:]:
        policy = {m: '/'.join(p[k] for k in ['word2', 'word3', 'word4'])
                  for m, p in r['policies'].items()}
        lines += [f'### {r["id"]}', '', f'稳健辅序：键道 {policy["keytao"]}；三拼 {policy["sanpin"]}。', '',
                  '韵组：' + '；'.join(k + '=' + '/'.join(v) for k, v in r['finalGroups'].items()) + '。', '',
                  '相对 UED 的换键：' + '；'.join(f'{f} {v["from"]}→{v["to"]}'
                                                for f, v in r['finalChangesFromUED'].items()) + '。', '']
    lines += ['## 验证与边界', '',
              '所有输入和计算脚本均记录 SHA-256；独立 Python 审计确认 M/D、399 覆盖、无分支、空桶标记、CKT 重定价、击键/相邻对累加及指法几何。144 辅序枚举的点最优已与完整规范回放逐轨比较，差异小于 1e-8。', '',
              '这是从已探索样本找出的实用取舍点，不构成全局最优证明；低小指不等于所有人体工学指标都更好。原 HTML 与生产配置未修改。', '']
    Path(str(PREFIX) + '.md').write_text('\n'.join(lines), encoding='utf8', newline='\n')
    for r in rows:
        e = r['ergonomics']
        print(r['id'], 'M', r['M'], 'empty', r['qzEmpty'] and r['zqEmpty'],
              'legacy20', round(100*r['rightPinky20'], 6),
              'mix/peak8', round(100*e['rightPinky'], 6), round(100*e['peaks']['rightPinky']['value'], 6),
              'rightIndex', round(100*e['fingers'][4], 6), 'ckt', r['ckt'])


if __name__ == '__main__':
    main()
