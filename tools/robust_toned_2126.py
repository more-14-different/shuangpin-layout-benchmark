"""Full six-cost robustness audit of shape-only 21x26 policy results."""
import argparse
import json
from pathlib import Path

import numpy as np
from analyze_single_ckt_v51_aux_order import grid, rank_grid, vectors, WEIGHTS


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source = json.loads(args.input.read_text(encoding='utf-8'))
    if not source['complete'] or source['mode'] != 'policies' or len(source['evaluations']) != 144:
        raise ValueError('requires complete full-corpus 144-policy audit')
    costs = dict(firstAuxMs=300, secondAuxMs=300, thirdAuxMs=300,
                 selectionDecisionMs=600, scanPerCandidateMs=50, pageActionMs=300)
    policies = [dict(row, policyKey='/'.join(row['policy'][kind] for kind in ('word2', 'word3', 'word4')))
                for row in source['evaluations']]
    multipliers = grid(0, 5, 0.5)
    print(f'Ranking 144 policies across {len(multipliers):,} coefficient combinations', flush=True)
    ranks = rank_grid({'results': policies}, {'tracks': source['reference']}, costs, multipliers, 2048)
    selected = next(row for row in policies if row['policyKey'] == ranks['winner']['policy'])
    candidate = vectors(selected, costs)
    baseline = vectors(source['baseline'], costs)
    reference = vectors({'tracks': source['reference']}, costs)
    wins = 0
    worst_delta = -float('inf')
    best_delta = float('inf')
    for start in range(0, len(multipliers), 4096):
        points = multipliers[start:start + 4096]
        denominator = reference[:, 0] + points @ reference[:, 1:].T
        def score(value):
            effective = value[:, 0] + points @ value[:, 1:].T
            return 10 * (np.sum(WEIGHTS * (effective / denominator) ** 4, axis=1) / WEIGHTS.sum()) ** 0.25
        delta = score(candidate) - score(baseline)
        wins += int(np.sum(delta < -1e-9))
        worst_delta = max(worst_delta, float(delta.max()))
        best_delta = min(best_delta, float(delta.min()))
    result = dict(version='toned-2126-shape-only-robustness-1', input=str(args.input),
                  layoutId=source['results'][0]['layout']['id'], costs=costs,
                  grid=dict(minimum=0, maximum=5, step=0.5, combinations=len(multipliers)),
                  policies=ranks, selectedPolicy=selected,
                  comparison=dict(reference='D3/V1 fixed deployed shape policy 12/12/24',
                                  winRate=wins / len(multipliers), bestDelta=best_delta, worstDelta=worst_delta,
                                  caveat='fixed layouts and baseline policy; no baseline reoptimization per grid point'))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'winner': ranks['winner'], 'comparison': result['comparison']}, indent=2), flush=True)


if __name__ == '__main__':
    main()
