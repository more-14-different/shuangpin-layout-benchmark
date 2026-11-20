"""Audit constrained final perturbations and their independently replayed policies."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT / 'research/notes/2026-11-21-u7e-pinky-descent'
REPLAY = ROOT / 'research/.cache/R11_integrated_replay'
WORK = ROOT / 'research/.cache/u7e-pinky-descent-20261121'
sys.path.insert(0, str(REPLAY))
import memory_r2
from summarize_u7e_low_pinky import normalized, FINGERS, KINDS, WEIGHTS

MULTIPLIERS = [1, 2, 3, 5]


def read(p):
    return json.loads(raw(p))


def raw(p):
    p = Path(p)
    return p.read_bytes() if p.exists() else gzip.decompress(Path(str(p)+'.gz').read_bytes())


def sha(p):
    return hashlib.sha256(raw(p)).hexdigest()


def near(a, b):
    assert abs(a-b) < 1e-10, (a, b)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+')
    parser.add_argument('--audit-search-only', action='store_true')
    args = parser.parse_args()
    assert args.ids or args.audit_search_only
    sources = {}

    def load(p):
        r = read(p)
        sources[str(p)] = sha(p)
        for source, digest in r.get('sourceHashes', {}).items():
            assert sha(source) == digest, source
        return r

    report = load(str(PREFIX)+'.json')
    assert report['completed']
    for suffix in ['linked', 'rescue', 'composed']:
        fragment_path = Path(str(PREFIX)+'-'+suffix+'.json')
        if fragment_path.exists() or Path(str(fragment_path)+'.gz').exists():
            fragment = load(fragment_path)
            assert fragment['completed']
            assert len(fragment['states']) == fragment['statesCount']
            assert sum(r['feasible'] for r in fragment['states'].values()) == fragment['feasibleCount']
            for ident in set(report['states']) & set(fragment['states']):
                first, second = report['states'][ident], fragment['states'][ident]
                assert first['finalMap'] == second['finalMap']
                assert first['modes'] == second['modes']
            report['states'].update(fragment['states'])
    report['statesCount'] = len(report['states'])
    report['feasibleCount'] = sum(r['feasible'] for r in report['states'].values())
    baseline_path = ROOT / 'research/notes/2026-11-21-u7e-low-pinky-score-UED-3158ce08b5bc.json'
    baseline = load(baseline_path)
    prior_path = ROOT / 'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'
    prior = load(prior_path)['auditInput']
    preparation = load(WORK/'contract.json')
    assert preparation['reference'] == report['reference']
    fixture_archive = Path(str(PREFIX)+'-contract.json.gz')
    fixture_archive.write_bytes(gzip.compress(raw(WORK/'contract.json'), mtime=0))
    sources[str(fixture_archive)] = sha(fixture_archive)
    meta = load(REPLAY/'model_meta.json')
    masses = load(REPLAY/'r4_token_loads.json')
    initial_map = baseline['initialMap']
    assert initial_map == report['initialMap']
    finals = meta['finals']
    base_row = dict(id=baseline['id'], ckt=[normalized(baseline['modes'], report['reference'], m)
                                          for m in MULTIPLIERS],
                    rightPinkyMixed=baseline['ergonomics']['rightPinky'],
                    rightPinkyPeak8=baseline['ergonomics']['peaks']['rightPinky']['value'],
                    rightPinky20=baseline['legacyRightPinky']['max20'],
                    ergonomics=baseline['ergonomics'], aggregate=baseline['aggregate'],
                    policies=baseline['policies'], feasible=True, finalMap=baseline['finalMap'])
    rows = [base_row]
    all_state_count = feasible_count = 0
    for row in report['states'].values():
        fm = row['finalMap']
        assert set(fm) == set(finals)
        assert len(set(fm.values())) == 21
        assert all(k in 'BCDEFGHJKLMNPQRSTWXYZ' and k != f.upper() for f, k in fm.items())
        assert row['audit']['M'] == 41 and row['audit']['D'] == 2
        assert not row['audit']['qz'] and not row['audit']['zq']
        for i, m in enumerate(MULTIPLIERS):
            near(normalized(row['modes'], report['reference'], m), row['scores'][i])
        mapped = [initial_map[h] for h in meta['heads']]+[fm[f] for f in finals]
        peak, numerator, denominator = 0, 0, 0
        for mi, mode in enumerate(['keytao', 'sanpin']):
            for ki, (kind, weight) in enumerate(zip(KINDS, WEIGHTS)):
                n = sum(v for key, v in zip(mapped, preparation['tokenMass'][mi][ki]) if key == 'P')
                d = row['modes'][mode][kind]['meanKeys']
                near(n/d, row['rightPinky']['byTrack'][mode+'/'+kind])
                peak = max(peak, n/d)
                numerator += weight*n
                denominator += weight*d
        mixed = numerator/denominator
        near(mixed, row['rightPinky']['mixed'])
        near(peak, row['rightPinky']['peak'])
        legacy_mapped = mapped+list('IVUAO')
        legacy = max(sum(v for key, v in zip(legacy_mapped, masses[t]['mass']) if key == 'P')/
                     sum(masses[t]['mass']) for t in meta['tracks'])
        near(legacy, row['rightPinky20'])
        feasible = (mixed <= base_row['rightPinkyMixed']+1e-12 and
                    peak <= base_row['rightPinkyPeak8']+1e-12 and
                    legacy <= base_row['rightPinky20']+1e-12)
        assert feasible == row['feasible']
        all_state_count += 1
        feasible_count += feasible
    assert all_state_count == report['statesCount']
    assert feasible_count == report['feasibleCount']
    if args.audit_search_only:
        sources[str(Path(__file__))] = sha(__file__)
        verification = dict(completed=True, uniqueStates=all_state_count,
                            feasibleStates=feasible_count, allCktColumnsIndependentlyRepriced=True,
                            allThreePinkyCapsIndependentlyRecomputed=True, sourceHashes=sources)
        Path(str(PREFIX)+'-search-verification.json').write_text(
            json.dumps(verification, ensure_ascii=False, indent=2)+'\n', encoding='utf8', newline='\n')
        print('Independent search audit passed:', all_state_count, 'unique,', feasible_count, 'feasible')
        return
    audits = []
    for ident in args.ids:
        r = load(str(PREFIX)+'-score-'+ident+'.json')
        policy = load(str(PREFIX)+'-policy-'+ident+'.json')
        robust = load(str(PREFIX)+'-robustness-'+ident+'.json')
        component_path = Path(str(PREFIX)+'-components-'+ident+'.json.gz')
        assert robust['inputSha256'] == sha(component_path)
        sources[str(component_path)] = sha(component_path)
        component = json.loads(gzip.decompress(component_path.read_bytes()))
        assert component['reference'] == report['reference']
        assert r['completed'] and policy['completed'] and robust['completed']
        assert r['initialMap'] == initial_map
        assert r['costMultipliers'] == MULTIPLIERS
        audit = memory_r2.audit(prior, {**r, 'capacity': [21, 21]})
        assert audit['M'] == 41 and audit['ordinaryDisplacedCount'] == 2
        assert audit['coverage'] == 399 and audit['branchCount'] == 0
        assert audit['usedFinalKeys'] == 21
        used = {r['codeList'][i] for i, _ in prior['base']}
        assert 'QZ' not in used and 'ZQ' not in used
        for j, m in enumerate(MULTIPLIERS):
            near(normalized(r['modes'], report['reference'], m), r['ckt'][j])
        keys, mean, peak = {}, 0, 0
        for mode in ['keytao', 'sanpin']:
            assert robust['selectedPolicies'][mode] == '/'.join(
                r['policies'][mode][k] for k in KINDS[1:])
            for kind, weight in zip(KINDS, WEIGHTS):
                t = r['terminalCodes'][mode][kind]
                mean += weight*t['meanKeys']/12
                for k, v in t['expectedKeys'].items():
                    keys[k] = keys.get(k, 0)+weight*v/12
                peak = max(peak, sum(t['expectedKeys'].get(k, 0) for k in FINGERS[-1])/t['meanKeys'])
                near(sum(v for rank, v in t['rankMass'].items() if int(rank) > 1),
                     r['modes'][mode][kind]['selectionRate'])
        e = r['ergonomics']
        mixed = sum(keys.get(k, 0) for k in FINGERS[-1])/mean
        near(mixed, e['rightPinky'])
        near(peak, e['peaks']['rightPinky']['value'])
        for k, observed in zip(FINGERS, e['fingers']):
            near(sum(keys.get(c, 0) for c in k)/mean, observed)
        feasible = (mixed <= base_row['rightPinkyMixed']+1e-12 and
                    peak <= base_row['rightPinkyPeak8']+1e-12 and
                    r['rightPinky20'] <= base_row['rightPinky20']+1e-12)
        assert feasible == r['feasible']
        sem = r['auxiliarySemantics']
        assert (sem['toneKeysByTone'], sem['shapeKeysByMeaning'], sem['toneDigitsByShapeMeaning']) == (
            'IVUAO', 'AVUIO', '42310')
        for replay in policy['replays']:
            assert replay['maxTrackDifference'] < 1e-8
        changes = {f: {'from': baseline['finalMap'][f], 'to': key}
                   for f, key in r['finalMap'].items() if key != baseline['finalMap'][f]}
        rows.append(dict(id=ident, ckt=r['ckt'], rightPinkyMixed=mixed,
                         rightPinkyPeak8=peak, rightPinky20=r['rightPinky20'], feasible=feasible,
                         changes=changes, policies=r['policies'], finalMap=r['finalMap'],
                         ergonomics={k: v for k, v in e.items() if k not in
                                     ['sufficientStatistics', 'byTrack', 'keyShares']},
                         aggregate=r['aggregate'], pointOptima=policy['optima'],
                         deltaFromBaseline=[a-b for a, b in zip(r['ckt'], base_row['ckt'])]))
        audits.append(dict(id=ident, M=41, D=2, coverage=399, branches=0,
                           qzEmpty=True, zqEmpty=True, robustPolicyFeasible=feasible))
    base_row['ergonomics'] = {k: v for k, v in base_row['ergonomics'].items() if k not in
                             ['sufficientStatistics', 'byTrack', 'keyShares']}
    for p in [Path(__file__), ROOT/'tools/summarize_u7e_low_pinky.py', REPLAY/'memory_r2.py',
              REPLAY/'audit.py', ROOT/'tools/robust_untoned_v52_policy.py',
              ROOT/'tools/u7e_pinky_descent_io.js',
              ROOT/'tools/analyze_single_ckt_v51_aux_order.py']:
        sources[str(p)] = sha(p)
    for suffix in ['', '-linked', '-rescue']:
        p = Path(str(PREFIX)+suffix+'.json.gz')
        if p.exists():
            sources[str(p)] = sha(p)
    best_by_multiplier = {str(m): min((r for r in rows if r['feasible']), key=lambda r: r['ckt'][i])['id']
                          for i, m in enumerate(MULTIPLIERS)}
    output = dict(completed=True, costMultipliers=MULTIPLIERS, rows=rows,
                  bestVerifiedByMultiplier=best_by_multiplier,
                  exploredStates=all_state_count, fixedPolicyFeasibleStates=feasible_count,
                  scope='Fixed original U7E initials, M41 D2 V5 actual21x21, QZ/ZQ empty. '
                  'Mixed actual terminal right-pinky, eight-track peak, historical20 peak all capped at seed. '
                  'Finite final-only perturbation, no global/local closure claim. Final rows use each own '
                  'robust policy under 1e6 independent six-cost scenarios 0.5..5x; 1..10x retained separately. '
                  '1,2,3,5x columns uniformly scale six cognitive costs, reference also repriced. '
                  'Letter loads include auxiliaries; exclude selection/page/space/errors.',
                  verification=dict(allSearchScoresIndependentlyRepriced=True,
                                    allSearchPinkyConstraintsIndependentlyRecomputed=True,
                                    finalistIndependentMemory=audits,
                                    finalistExpectedKeysAggregation=True,
                                    finalistCanonicalReplayMaxDifferenceBelow1eMinus8=True,
                                    allSourceHashesMatch=True), sourceHashes=sources)
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n',
                                               encoding='utf8', newline='\n')
    lines = ['# UED-3158：右小指不升的韵母下潜（2026-11-21）', '',
             '固定原 U7E 声母、A/E/O=R、M41、D2、V5、实际21×21、399音节、无分支、QZ/ZQ均空。', '',
             f'共计算 {all_state_count:,} 个新实验状态（含基线），其中 {feasible_count:,} 个在固定基线辅序下通过全部小指上限。'
             '搜索包含基线完整单步邻域、8条各250步粗细交替链、前沿中心邻域、提速改动与 P 键减负的交叉组合、不合约快速中心的完整修复邻域，以及24组显式因子组合。具体实际阶段见原始 JSON。', '',
             '右小指硬上限为：实际终码混合占比 '+f'{100*base_row["rightPinkyMixed"]:.9f}%，'
             +f'八轨峰值 {100*base_row["rightPinkyPeak8"]:.9f}%，历史20合同峰值 {100*base_row["rightPinky20"]:.9f}%。'
             '均容许至多 1e-12 浮点误差。物理负荷先按事件权重1:3:1:1、两成员等权累加期望击键，再取占比；包含补码，不含选重/翻页/空格/误键。', '',
             '表内每套使用各自重选的稳健辅序：每模式144种、六项认知成本独立0.5–5倍、百万场景平均竞争名次；另测1–10倍。'
             '倍率列将六项认知延时一同缩放，参照同步重算。点最优另存，不能替代固定稳健辅序成绩。', '',
             '| 方案 | 复核后合约 | CKT 1倍 | CKT 2倍 | CKT 3倍 | CKT 5倍 | 右小指混合 | 八轨峰值 | 历史20峰值 |',
             '|---|:---:|---:|---:|---:|---:|---:|---:|---:|']
    for row in rows:
        lines.append('| '+row['id']+' | '+('通过' if row['feasible'] else '未通过')+' | '+
                     ' | '.join(f'{v:.9f}' for v in row['ckt'])+' | '+
                     ' | '.join(f'{100*row[k]:.9f}%' for k in
                                ['rightPinkyMixed', 'rightPinkyPeak8', 'rightPinky20'])+' |')
    lines += ['', '## 复核后结论', '',
              '以下仅在已完整复核的候选中比较，均固定各自稳健辅序：', '']
    by_id = {row['id']: row for row in rows}
    for i, multiplier in enumerate(MULTIPLIERS):
        winner = by_id[best_by_multiplier[str(multiplier)]]
        improvement = base_row['ckt'][i]-winner['ckt'][i]
        lines.append(f'- {multiplier} 倍：{winner["id"]}，CKT={winner["ckt"][i]:.9f}，'
                     f'较基线改善 {improvement:.9f}。')
    lines += ['', '低倍率没有改善时应保留原基线；高倍率新低点只代表该成本偏好的前沿扩展。'
              '尤其是约 1e-5 量级的优势，属于当前模型/语料下的小余量，不能当作体感速度结论。', '',
              '## 其他人体工学取舍', '',
              '| 方案 | 主行 | 左食指 | 右食指 | 右无名指 | 码内异键同指 | 码内异手 | 选重率 |',
              '|---|---:|---:|---:|---:|---:|---:|---:|']
    for row in rows:
        e = row['ergonomics']
        values = [e['home'], e['fingers'][3], e['fingers'][4], e['fingers'][6],
                  e['differentKeySameFinger'], e['alternation'], row['aggregate']['selectionRate']]
        lines.append('| '+row['id']+' | '+' | '.join(f'{100*v:.6f}%' for v in values)+' |')
    lines += ['', '## 布局与辅序', '',
              'toneKeysByTone=IVUAO；shapeKeysByMeaning=AVUIO；配对 invariant=42310。辅序数字表示取词中字位，按二/三/四字词排列。', '']
    for row in rows[1:]:
        policy = {m: '/'.join(p[k] for k in KINDS[1:]) for m, p in row['policies'].items()}
        groups = {k: [f for f, key in row['finalMap'].items() if key == k]
                  for k in sorted(set(row['finalMap'].values()))}
        lines += ['### '+row['id'], '', '稳健辅序：键道 '+policy['keytao']+'；三拼 '+policy['sanpin']+'。', '',
                  '相对基线换键：'+'；'.join(f'{f} {v["from"]}→{v["to"]}' for f, v in row['changes'].items())+'。', '',
                  '韵组：'+'；'.join(k+'='+'/'.join(fs) for k, fs in groups.items())+'。', '']
    lines += ['## 验证与边界', '',
              '独立 Python 重算所有搜索状态的 CKT 和三项小指上限；复核候选再次通过独立 M-R2、399覆盖、无分支、空桶、语义映射、实际终码击键统计。'
              '144辅序枚举与完整规范回放逐轨最大误差小于1e-8。文件和脚本记录SHA-256。', '',
              '只探索有限邻域与退火轨迹，不声称局部或全局最优。HTML 和生产配置未修改。', '']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines), encoding='utf8', newline='\n')
    for row in rows:
        print(row['id'], row['feasible'], row['ckt'], 'right', row['rightPinkyMixed'], row['rightPinkyPeak8'],
              'changes', row.get('changes', {}))


if __name__ == '__main__':
    main()
