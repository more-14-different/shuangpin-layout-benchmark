"""Independent publication audit: memory, complete maps, ordinary columns and CKT."""
import base64
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT/'research/notes/2026-11-21-u7e-pinky-r11'
WORK = ROOT/'research/.cache/u7e-pinky-r11-20261121'
REPLAY = ROOT/'research/.cache/R11_integrated_replay'
sys.path.insert(0, str(REPLAY))
import memory_r2
from macroxue.engine import evaluate
from integrate_shenyun_21x26_production import missing_by_map
from summarize_u7e_low_pinky import normalized


def read(p):
    return json.loads(Path(p).read_text(encoding='utf8'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def payload(p):
    text = Path(p).read_text(encoding='utf8')
    start = text.index('>', text.index('<script id="payload"'))+1
    end = text.index('</script>', start)
    return json.loads(gzip.decompress(base64.b64decode(text[start:end])))


def near(a, b):
    assert math.isclose(a, b, rel_tol=0, abs_tol=1e-10), (a, b)


def main():
    publication, config = read(str(PREFIX)+'-publication.json'), read(str(PREFIX)+'-candidates.json')
    browser = read(str(PREFIX)+'-browser.json')
    assert publication['completed'] and browser['completed']
    assert sha(publication['html']) == publication['htmlAfterSha256'] == browser['htmlSha256']
    checked = {}

    def check(report):
        for p, digest in report['sourceHashes'].items():
            if p not in checked:
                checked[p] = sha(p)
            assert checked[p] == digest, p

    for r in [publication, config, browser]:
        check(r)
    data, before = payload(publication['html']), payload(WORK/'main-before.html')
    assert len(data['entries']) == len(before['entries'])+2 == publication['catalogue'] == 868
    assert data['finalSelection']['currentCatalogueCount'] == 868
    ids = set(publication['ids'])
    entries, old_entries = {e['id']: e for e in data['entries']}, {e['id']: e for e in before['entries']}
    assert len(entries) == len(data['entries'])
    assert all(entries[k] == v for k, v in old_entries.items())
    paths = [('ckt', 'tracks'), ('fairCKT', 'values'), ('r11PairMetrics', 'values'),
             ('macroxue', 'values'), ('completionB', 'schemes'), ('completionBFixed', 'schemes'),
             ('completionBV2', 'schemes'), ('completionBV3', 'schemes'), ('completionBV4', 'schemes'),
             ('cktV52', 'schemes')]+[(f'ensemble{v}', 'values') for v in ['', 'V2', 'V3', 'V4', 'V5', 'V6']]
    for outer, inner in paths:
        assert all(data[outer][inner][k] == v for k, v in before[outer][inner].items()), outer
    assert data['untonedFrontierPublication']['rows'][:-2] == before['untonedFrontierPublication']['rows']
    missing = missing_by_map(data, ids)
    assert not any(missing.values()), missing
    patch = json.loads(gzip.decompress(Path(str(PREFIX)+'-patch.json.gz').read_bytes()))
    assert not any(missing_by_map(patch, ids).values())
    assert patch['entries'] == [entries[i] for i in publication['ids']]
    columns = read(str(PREFIX)+'-columns.json')['schemes']
    corpus = read(REPLAY/'R9_corpora.json')['daily']
    pindex = {p: i for i, p in enumerate(data['pinyin'])}
    rows = []
    for candidate in config['candidates']:
        ident = candidate['id']
        r, e = read(str(PREFIX)+'-scores-'+ident+'.json'), entries[ident]
        check(r)
        audit = memory_r2.audit(data, e)
        assert audit['M'] == e['memoryAuditR2']['M'] == 41
        assert audit['ordinaryDisplacedCount'] == 2 and audit['branchCount'] == 0 and audit['coverage'] == 399
        codes = {e['codeList'][p] for p, _ in data['base']}
        assert 'QZ' not in codes and 'ZQ' not in codes
        assert len({c[0] for c in codes}) == len({c[1] for c in codes}) == 21
        assert not set(''.join(codes)).intersection('AVUIO')
        assert e['codeList'] == r['codeList'] and e['initialMap'] == r['initialMap'] and e['finalMap'] == r['finalMap']
        assert e['tone'] == 'IVUAO' and r['auxiliarySemantics']['shapeKeysByMeaning'] == 'AVUIO'
        assert r['auxiliarySemantics']['toneDigitsByShapeMeaning'] == '42310'
        p, m = e['productionCandidateMetrics'], e['readmeBenchmarkMetrics']
        assert p['memory'] == 41 and p['productionMetricVersion'] == 'v52'
        assert p['cktV52Policies']['candidate'] == p['cktV51Policies']['candidate'] == r['policies']
        assert p['cktV52AuxOrderSelection']['selectedPolicies'] == r['selectedPolicies']
        assert data['cktV52']['schemes'][ident]['v52'] == r['v52']
        assert data['cktV52']['schemes'][ident]['v51'] == r['v51']
        for field, value in r['v52']['aggregate'].items():
            near(p['cktV52Aggregate'][field], value)
            near(m['aggregate'+field[0].upper()+field[1:]], value)
        for field, value in columns[ident]['readmeBenchmarkMetrics'].items():
            if field.startswith('aggregate'):
                continue
            if field == 'cktV51':
                near(m[field], r['v51']['score'])
            else:
                assert m[field] == value, field
        for j, multiplier in enumerate([1, 2, 3, 5]):
            near(normalized(r['v52']['modes'], r['referenceModes'], multiplier), r['costs'][j])
        near(p['replayedCktV52'], r['costs'][0])
        for field, j in [('cktV52CostDoubled', 1), ('cktV52CostTripled', 2), ('cktV52CostQuintupled', 3)]:
            near(p[field], r['costs'][j])
            near(m[field], r['costs'][j])
        c399 = r['collisions']['common399']
        assert m['common399UniqueCodes'] == c399['occupiedBuckets']
        near(m['s2FrequencyWeightedMiss'], c399['frequencyWeightedNonFirstRate'])
        previous = read(candidate['scoreSource'])
        legacy = previous.get('rightPinky20', previous.get('legacyRightPinky', {}).get('max20'))
        near(m['rightPinkyPeak20Contracts']['value'], legacy)
        near(p['cktV52TerminalLoad']['rightPinky'], previous['ergonomics']['rightPinky'])
        near(p['cktV52TerminalLoad']['rightPinkyPeak'], previous['ergonomics']['peaks']['rightPinky']['value'])
        strokes = ''.join(t.get('key') or e['codeList'][pindex[t['pinyin']]].lower() for t in corpus['tokens'])
        daily = evaluate(strokes, len(corpus['tokens']))
        near(m['dailyEightScenarioMovingHand'], daily['score'])
        near(m['dailyMeanEffectiveDistance'], daily['avg_effective_distance'])
        rows.append(dict(id=ident, name=e['name'], M=41, D=2, coverage=399, branches=0,
                         qzEmpty=True, zqEmpty=True, costs=r['costs'], selectedPolicies=r['selectedPolicies'],
                         terminalRightPinky=r['terminalLoad']['rightPinky'],
                         terminalRightPinkyPeak=r['terminalLoad']['rightPinkyPeak'],
                         metrics=m, independentDailyMovingHand=daily['score']))
    result = dict(completed=True, html=publication['html'], htmlSha256=publication['htmlAfterSha256'],
                  catalogue=868, preservedExistingSchemes=len(before['entries']), rows=rows,
                  missingByBenchmarkMap={k: sorted(v) for k, v in missing.items()},
                  checks=dict(oldEntriesAndMapsUnchanged=True, completeCandidatePacket=True,
                              independentMemory=True, common399AndHistoricalPinkyMatch=True,
                              allOrdinaryColumnsAndProductionFieldsMatch=True,
                              independentCktCostRepricing=True, independentDailyReplay=True,
                              browserPageErrors=browser['pageErrors']),
                  sourceHashes={str(p): sha(p) for p in [Path(__file__), Path(str(PREFIX)+'-publication.json'),
                                Path(str(PREFIX)+'-browser.json'), REPLAY/'memory_r2.py', REPLAY/'audit.py',
                                REPLAY/'macroxue/engine.py', REPLAY/'R9_corpora.json',
                                ROOT/'tools/integrate_shenyun_21x26_production.py']})
    Path(str(PREFIX)+'-validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n',
                                                  encoding='utf8', newline='\n')
    lines = ['# UED-3158 与 f254 写入 R11（2026-11-21）', '', f'目标：{publication["html"]}', '',
             f'目录 {len(before["entries"])}→868；原方案条目和已有 benchmark 映射保持不变。新两套完整普通列复算，并按各自稳健辅序重新回放生产 CKT v5.1/v5.2 和终码负荷。', '',
             '| HTML 名称 | CKT 1倍 | 2倍 | 3倍 | 5倍 | 终码右小指 | 八轨峰值 |',
             '|---|---:|---:|---:|---:|---:|---:|']
    for row in rows:
        lines.append('| '+row['name']+' | '+' | '.join(f'{n:.9f}' for n in row['costs'])+
                     f' | {100*row["terminalRightPinky"]:.6f}% | {100*row["terminalRightPinkyPeak"]:.6f}% |')
    lines += ['', '两套键道辅序均为12/231/23，三拼均为12/213/23。toneKeysByTone=IVUAO，shapeKeysByMeaning=AVUIO，配对42310。', '',
              '前沿表增加固定辅序3/5倍列；点最优1/2倍独立保留。生产属性为各自稳健辅序的八轨混合；历史R11列仍使用原生历史合同和语料，日常移手是原始双拼含标点回放，不能与终码负荷混比。', '',
              '## 普通 benchmark 摘要', '',
              '| 指标 | UED-3158 | f254 |', '|---|---:|---:|']
    for field in ['M-R2', 'common399UniqueCodes', 's2FrequencyWeightedMiss', 's2CompletionMeanKeys',
                  'dailyEightScenarioMovingHand', 'homeShareS2', 'homeFloor20Contracts',
                  'rightPinkyPeak20Contracts', 'ensembleV3', 'ensembleV4', 'ensembleV5', 'cktV3',
                  'cktV4', 'cktV5', 'cktV51', 'cktV52']:
        lines.append('| '+field+' | '+' | '.join(json.dumps(row['metrics'][field], ensure_ascii=False)
                                                for row in rows)+' |')
    lines += ['', '完整指标见 columns/scores/validation JSON；补丁包为精确条目与全部候选 benchmark 映射。浏览器验证主表生产属性、前沿四倍率、详情12轨、键位图及CSV导出，页面无错误。', '',
              'HTML SHA-256：'+publication['htmlAfterSha256'], '']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines), encoding='utf8', newline='\n')
    print(json.dumps(dict(completed=True, catalogue=868, rows=[dict(id=r['id'], name=r['name'],
                     costs=r['costs'], dailyMovingHand=r['independentDailyMovingHand']) for r in rows]), ensure_ascii=False))


if __name__ == '__main__':
    main()
