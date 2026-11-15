import itertools
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from analyze_untoned_2121_candidate_aux import batches, competition_ranks, factored_powers, factorize, joined_score, powers


class CandidateAuxAnalysisTest(unittest.TestCase):
    def test_fixed_reference_normalization_under_independent_costs(self):
        reference = np.arange(1, 29, dtype=float).reshape(4, 7)
        costs = np.asarray([[0]*6, [1]*6, [0, .5, 2, 4, 7, 10]])
        fourth = powers(np.stack([reference, 2*reference]), reference, costs)
        np.testing.assert_allclose(joined_score(2*fourth[:, 0]), 10)
        np.testing.assert_allclose(joined_score(2*fourth[:, 1]), 20)

    def test_factorization_preserves_joint_word2_word4_competition(self):
        baseline = dict(zip(('firstAuxMs', 'secondAuxMs', 'thirdAuxMs', 'selectionDecisionMs', 'scanPerCandidateMs', 'pageActionMs'), [300, 300, 300, 600, 50, 300]))
        rates = ('firstAuxRate', 'secondAuxRate', 'thirdAuxRate', 'selectionRate', 'meanRejectedCandidates', 'meanPageActions')
        def track(motor):
            row = dict(motorUpperMs=motor, **dict(zip(rates, [.4, .2, .1, .02, .03, .001])))
            row['effectiveMs'] = motor + sum(v*row[r] for v, r in zip(baseline.values(), rates))
            return row
        rows = []
        for w2, w3, w4 in itertools.product(['12','21'], ['123','213','231'], ['12','24']):
            pair = int(w2) + int(w4)
            rows.append(dict(policy=dict(word2=w2, word3=w3, word4=w4), tracks=dict(
                character=track(100), word2=track(200+pair), word3=track(200+int(w3)), word4=track(400-pair))))
        factors = factorize(dict(results=rows), baseline)
        reference = factors[0][0]
        grid = np.random.default_rng(171).uniform(0, 10, (59, 6))
        np.testing.assert_allclose(factored_powers(factors, reference, grid), powers(factors[0], reference, grid), rtol=1e-14)

    def test_tied_policies_do_not_get_arbitrary_strict_ranks(self):
        np.testing.assert_array_equal(competition_ranks(np.asarray([[2., 1., 1., 3.]])), [[3,1,1,4]])

    def test_grid_boundaries_and_positive_subset(self):
        start, grid, positive = next(batches(.5, 12))
        self.assertEqual(start, 0)
        np.testing.assert_array_equal(grid[0], [0]*6)
        np.testing.assert_array_equal(grid[10], [0,0,0,0,0,5])
        np.testing.assert_array_equal(grid[11], [0,0,0,0,.5,0])
        self.assertFalse(positive.any())


if __name__ == '__main__':
    unittest.main()
