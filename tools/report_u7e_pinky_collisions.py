"""Read canonical replays; audit Common399 and cumulative residual collision rates."""
import hashlib
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTES = ROOT/'research/notes'
PREFIX = NOTES/'2026-11-21-u7e-pinky-collisions'
IDS = ['UED-3158ce08b5bc', 'UPD-f1c2bb5b0657', 'UPD-6a731d7b831b', 'UPD-f254581a6f2d']
LABELS = ['3158', 'f1', '6a', 'f254']
KINDS = ['character', 'word2', 'word3', 'word4']
KIND_LABELS = ['单字', '二字词', '三字词', '四字词']


def read(p):
    return json.loads(Path(p).read_text(encoding='utf8'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def near(a, b):
    assert abs(a-b) < 1e-10, (a, b)


def main():
    sources = {}
    prior_path = NOTES/'2026-11-19-untoned-cr7e-v52-verification.json'
    prior = read(prior_path)['auditInput']
    assert len(prior['base']) == len({p for p, _ in prior['base']}) == 399
    records, rows = [], []
    for ident, label in zip(IDS, LABELS):
        family = 'low-pinky' if ident.startswith('UED') else 'pinky-descent'
        source_path = NOTES/f'2026-11-21-u7e-{family}-score-{ident}.json'
        r = read(source_path)
        assert r['completed'] and r['audit']['M'] == 41 and r['audit']['D'] == 2
        assert not r['audit']['qz'] and not r['audit']['zq']
        assert r['initialMap'] == (records[0]['initialMap'] if records else r['initialMap'])
        buckets = defaultdict(list)
        for p, weight in prior['base']:
            code = r['codeList'][p]
            assert len(code) == 2
            buckets[code].append(dict(pinyin=prior['pinyin'][p], weight=weight))
        total = sum(item['weight'] for group in buckets.values() for item in group)
        miss = sum(sum(item['weight'] for item in group)-max(item['weight'] for item in group)
                   for group in buckets.values())
        affected = sum(len(group) for group in buckets.values() if len(group) > 1)
        singleton = sum(len(group) == 1 for group in buckets.values())
        common = dict(coverage=399, occupiedBuckets=len(buckets), bucketOccupancy21x21=len(buckets)/441,
                      singletonSyllables=singleton, singletonSyllableRate=singleton/399,
                      affectedSyllables=affected, affectedSyllableRate=affected/399,
                      collisionBuckets=sum(len(group) > 1 for group in buckets.values()),
                      collisionExcess=399-len(buckets), excessRate=(399-len(buckets))/399,
                      frequencyWeightedNonFirstRate=miss/total,
                      frequencyWeightedAffectedRate=sum(item['weight'] for group in buckets.values()
                                                        if len(group) > 1 for item in group)/total,
                      maximumBucket=max(map(len, buckets.values())), totalFrequency=total,
                      collisions={code: group for code, group in buckets.items() if len(group) > 1})
        assert singleton+affected == 399
        assert common['occupiedBuckets'] == r['audit']['unique']
        tracks = {}
        for mode in ['keytao', 'sanpin']:
            tracks[mode] = {}
            for kind in KINDS:
                t = r['modes'][mode][kind]
                terminal = r['terminalCodes'][mode][kind]
                near(sum(terminal['rankMass'].values()), 1)
                near(sum(v for rank, v in terminal['rankMass'].items() if int(rank) > 1), t['selectionRate'])
                assert terminal['count'] == t['count'] and terminal['totalWeight'] == t['totalWeight']
                base = {'character': 2, 'word2': 4, 'word3': 3, 'word4': 4}[kind]
                auxiliaries = [t['firstAuxRate'], t['secondAuxRate']]
                if kind == 'word3':
                    auxiliaries.append(t['thirdAuxRate'])
                else:
                    near(t.get('thirdAuxRate', 0), 0)
                near(base+sum(auxiliaries), t['meanKeys'])
                residual = auxiliaries+[t['selectionRate']]
                assert all(0 <= b <= a <= 1 for a, b in zip(residual, residual[1:]))
                tracks[mode][kind] = dict(entries=t['count'], totalFrequency=t['totalWeight'],
                                          residualNonFirstByAuxCount=residual,
                                          terminalSelectionRate=t['selectionRate'],
                                          terminalNonFirstEntries=terminal['residualEntries'],
                                          terminalNonFirstEntryRate=terminal['residualEntries']/t['count'])
        average = {kind: [sum(tracks[mode][kind]['residualNonFirstByAuxCount'][i]/2
                              for mode in ['keytao', 'sanpin'])
                          for i in range(len(tracks['keytao'][kind]['residualNonFirstByAuxCount']))]
                   for kind in KINDS}
        partition = sorted(sorted(item['pinyin'] for item in group) for group in buckets.values())
        rows.append(dict(id=ident, label=label, common399=common, policies=r['policies'],
                         tracks=tracks, equalMemberMean=average,
                         common399PartitionSha256=hashlib.sha256(json.dumps(partition).encode()).hexdigest()))
        sources[str(source_path)] = sha(source_path)
        records.append(r)
    assert rows[1]['common399PartitionSha256'] == rows[2]['common399PartitionSha256']
    for r in records[1:]:
        for mode in ['keytao', 'sanpin']:
            assert r['modes'][mode]['word3'] == records[0]['modes'][mode]['word3']
    for p in [Path(__file__), prior_path, ROOT/'tools/ckt_v4_model.js', ROOT/'tools/score_ckt_v52.js',
              Path('D:/C2D/Documents/rime-snow-pinyin/scripts/research/evaluate_ckt51_aux_order.js')]:
        sources[str(p)] = sha(p)
    result = dict(completed=True, rows=rows,
                  definition=dict(common399='399 syllable types, before auxiliary code. Singleton/affected '
                                  'rates use 399 denominator; frequency-weighted non-first leaves only each '
                                  'bucket highest-frequency syllable first. Not a Hanzi collision rate.',
                                  tracks='Canonical early-exit routing, each own fixed robust policy. '
                                  'Frequency-weighted residual non-first after 0,1,2 auxiliaries; word3 '
                                  'also after 3. Denominator always original track total frequency, '
                                  'not the surviving subset. word2 and word4 share a candidate pool. '
                                  'Final level equals selectionRate, earlier levels equal next auxiliary '
                                  'reach rates. Not all members of a colliding bucket.',
                                  modes='keytao: shape auxiliaries; sanpin: tone auxiliaries for words, '
                                  'tone then shape for single characters. Both retain toneKeysByTone '
                                  'IVUAO / shapeKeysByMeaning AVUIO / paired invariant 42310.'),
                  verification=dict(all399Covered=True, independentBucketEnumeration=True,
                                    cumulativeAuxRatesMonotone=True, meanKeysIdentity=True,
                                    terminalRankMassEqualsSelectionRate=True,
                                    f1And6aCommon399CollisionPartitionIdentical=True,
                                    allWord3TracksExactlyIdentical=True,
                                    input='Previously fully replayed frozen JSON; no new layout or scorer changes.'),
                  sourceHashes=sources)
    Path(str(PREFIX)+'.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n',
                                       encoding='utf8', newline='\n')
    lines = ['# 原3158及三套韵母候选：399音节和分级字词重码（2026-11-21）', '',
             '简称：'+'；'.join(f'{label}={ident}' for label, ident in zip(LABELS, IDS))+'。', '',
             '沿用各自已完整回放的稳健辅序。本次独立枚举399音节码桶，并检查逐轨辅助率、终码名次频率及平均码长恒等式。没有重新退火或更换辅序。', '',
             '## 399音节主码', '',
             '独占音节：所在桶只有自身。涉重音节：同桶的所有音节均计入，分母为399。频率加权非首选率：每桶仅保留最高频音节为首选，其余频率占比。音节重码与同音字重码分开。', '',
             '| 方案 | 主码桶数 | 独占音节 | 涉重音节 | 重码余量/399 | 频率加权非首选率 |',
             '|---|---:|---:|---:|---:|---:|']
    for row in rows:
        c = row['common399']
        lines.append(f'| {row["label"]} | {c["occupiedBuckets"]} | '
                     f'{c["singletonSyllables"]}/399={100*c["singletonSyllableRate"]:.4f}% | '
                     f'{c["affectedSyllables"]}/399={100*c["affectedSyllableRate"]:.4f}% | '
                     f'{c["collisionExcess"]}/399={100*c["excessRate"]:.4f}% | '
                     f'{100*c["frequencyWeightedNonFirstRate"]:.6f}% |')
    lines += ['', '四套的399覆盖均为100%，最大音节桶均为2。21×21的441桶占用率为：3158=79.5918%；其余=79.8186%。', '',
              '## 按词长、补辅级数分解', '',
              '表中全部是词频加权的“剩余非首选率”，不是同桶所有字词的涉重率。分母始终为该轨全部字/词的频率；逐级首选会提前退出，二/四字词共池。'
              '例如“1辅后”表示补一辅仍未首选、需要第二辅的总频率占比。“2辅后”在单字及二/四字词中即最终选重率。三字词还能补第三辅。', '',
              '每格为 **键道 / 三拼**，单位%。键道为形辅；三拼词码用调辅，单字用调+形。', '',
              '| 词长 | 方案 | 主码后（0辅） | 1辅后 | 2辅后 | 3辅后 |',
              '|---|---|---:|---:|---:|---:|']
    for kind, label in zip(KINDS, KIND_LABELS):
        selected = rows[:1] if kind == 'word3' else rows
        for row in selected:
            a = row['tracks']['keytao'][kind]['residualNonFirstByAuxCount']
            b = row['tracks']['sanpin'][kind]['residualNonFirstByAuxCount']
            pair = [f'{100*x:.4f} / {100*y:.4f}' for x, y in zip(a, b)]
            if len(pair) == 3:
                pair.append('—')
            lines.append('| '+label+' | '+('四套相同' if kind == 'word3' else row['label'])+' | '+' | '.join(pair)+' |')
    lines += ['', '三字词逐轨数据完全一致：声母固定，三字词主码只取声母，且各自三字词辅序一致。'
              'f1/6a的399音节重码划分也完全一样；字词表现仍会因二/四字词共池以及辅序而不同。', '',
              '## 两成员等权平均', '',
              '| 词长 | 方案 | 0辅后 | 1辅后 | 2辅后 | 3辅后 |',
              '|---|---|---:|---:|---:|---:|']
    for kind, label in zip(KINDS, KIND_LABELS):
        for row in (rows[:1] if kind == 'word3' else rows):
            values = [f'{100*v:.6f}%' for v in row['equalMemberMean'][kind]]
            if len(values) == 3:
                values.append('—')
            lines.append('| '+label+' | '+('四套相同' if kind == 'word3' else row['label'])+' | '+' | '.join(values)+' |')
    lines += ['', '数据源和SHA-256见同名JSON；分母、辅码语义及条件详见其definition。', '']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines), encoding='utf8', newline='\n')
    for row in rows:
        print(row['label'], row['common399']['frequencyWeightedNonFirstRate'], row['equalMemberMean'])


if __name__ == '__main__':
    main()
