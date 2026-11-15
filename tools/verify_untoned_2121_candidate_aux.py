"""Verify native policy coverage, score anchors and historical grid reproduction."""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path

KINDS = {'character': 1, 'word2': 3, 'word3': 1, 'word4': 1}
RATES = dict(firstAuxMs='firstAuxRate', secondAuxMs='secondAuxRate', thirdAuxMs='thirdAuxRate',
             selectionDecisionMs='selectionRate', scanPerCandidateMs='meanRejectedCandidates', pageActionMs='meanPageActions')


def effective(row, costs):
    return row['motorUpperMs'] + sum(costs[field]*row[rate] for field, rate in RATES.items())


def check(components, report):
    assert report['completed'] and len(components['schemes']) == len(report['schemes']) == 7
    costs, reference = components['baselineCostsMs'], components['references']
    for source, digest in components['sourceHashes'].items():
        assert hashlib.sha256(Path(source).read_bytes()).hexdigest() == digest, source
    for scheme in components['schemes']:
        ident = scheme['id']
        assert len(set(scheme['initialMap'].values())) == len(set(scheme['finalMap'].values())) == 21
        assert (scheme['audit']['M'], scheme['audit']['D'], scheme['audit']['V'], scheme['audit']['branches']) == (42, 2, 5, 0)
        assert scheme['audit']['valid'] and not scheme['audit']['qz'] and not scheme['audit']['zq']
        result = report['schemes'][ident]
        mode_powers, robust_power = {}, 0
        for mode, case in scheme['cases'].items():
            assert len(case['results']) == len({row['policyKey'] for row in case['results']}) == 144
            mode_powers[mode] = {}
            for row in case['results']:
                p = row['policy']
                assert set(p['word2']) == set('12') and len(p['word2']) == 2
                assert set(p['word3']) == set('123') and len(p['word3']) == 3
                assert len(p['word4']) == 2 and len(set(p['word4'])) == 2 and set(p['word4']) <= set('1234')
                fourth = sum(weight*(effective(row['tracks'][kind], costs)/effective(reference[mode]['tracks'][kind], costs))**4 for kind, weight in KINDS.items())
                mode_powers[mode][row['policyKey']] = fourth
            robust_power += mode_powers[mode][result['mainPositiveRobustPolicies'][mode]]
            for grid_name, grids in result['grids'].items():
                for name, grid in grids[mode].items():
                    assert grid['points'] == (11**6 if name == 'includingZero' else 10**6)
                    assert grid['winner']['meanRank'] <= grid['runnerUp']['meanRank']
                    assert abs(grid['meanRankGap'] - (grid['runnerUp']['meanRank']-grid['winner']['meanRank'])) < 1e-12
        minimum = 10*(sum(min(values.values()) for values in mode_powers.values())/12)**.25
        assert math.isclose(minimum, result['defaultOptimalScore'], rel_tol=0, abs_tol=1e-12)
        assert math.isclose(10*(robust_power/12)**.25, result['mainPositiveRobustDefaultScore'], rel_tol=0, abs_tol=1e-12)
        assert minimum <= scheme['fixedScore'] + 1e-12
    # The new factorized analysis must exactly reproduce all prior production rankings.
    gold = {
        'main0To500': {'keytao': [1.1810668670172801, 1.109], 'sanpin': [2.2261192247966624, 1.43565]},
        'extreme0To1000': {'keytao': [1.1502629601803156, 1.079], 'sanpin': [1.6540632809144027, 1.212486]},
    }
    baseline = report['schemes']['QZ-e8f37a0998f9']
    for grid_name, modes in gold.items():
        for mode, means in modes.items():
            for name, mean in zip(('includingZero', 'positiveOnly'), means):
                assert baseline['grids'][grid_name][mode][name]['winner']['meanRank'] == mean
    return dict(layouts=7, policiesPerMember=144, members=14, historicalGridMeanRanksReproduced=8,
                defaultScoresIndependentlyRecomputed=True, sourceHashesVerified=len(components['sourceHashes']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--components', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    components = json.loads(gzip.decompress(args.components.read_bytes()))
    report = json.loads(args.report.read_text(encoding='utf-8'))
    assert report['componentsSha256'] == hashlib.sha256(args.components.read_bytes()).hexdigest()
    print(json.dumps(check(components, report), ensure_ascii=False))


if __name__ == '__main__':
    main()
