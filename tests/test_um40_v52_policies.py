import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from audit_um40_v52_policies import scores_at_batch, summarize_pair
from analyze_single_ckt_v51_aux_order import competition_ranks, score_at, grid


class WideGridTests(unittest.TestCase):
    def test_vectorized_scores_match_scalar_with_independent_costs(self):
        rng = np.random.default_rng(42)
        a = rng.uniform(1, 100, (7, 4, 7)); b = rng.uniform(1, 100, (4, 7))
        points = rng.uniform(0, 10, (11, 6))
        actual = scores_at_batch(a, b, points)
        for i, point in enumerate(points):
            np.testing.assert_allclose(actual[i], score_at(a, b, point), rtol=1e-14)

    def test_rank_ties_are_shared_first(self):
        actual = competition_ranks(np.array([[1., 1., 2.], [3., 1., 2.]]))
        np.testing.assert_array_equal(actual, [[1, 1, 3], [3, 1, 2]])

    def test_grids_cover_independent_axes_and_positive_subset(self):
        for maximum, step in [(5., .5), (10., 1.)]:
            points = grid(0., maximum, step)
            self.assertEqual(len(points), 11**6)
            self.assertEqual(np.all(points > 0, axis=1).sum(), 10**6)
            np.testing.assert_array_equal(points[1], [0, 0, 0, 0, 0, step])
            np.testing.assert_array_equal(points[-1], np.full(6, maximum))

    def test_gap_direction_and_zero_cost_crossing(self):
        a = np.zeros((2, 4, 7)); b = np.zeros((4, 7)); b[:, 0] = 100
        a[0, :, 0] = 100; a[1, :, 0] = 110; a[0, :, 1] = 20
        points = np.array([[0., 0, 0, 0, 0, 0], [1., 1, 1, 1, 1, 1]])
        gap = summarize_pair(a, b, points, 0, 1)
        self.assertEqual(gap['winnerBeatsRunnerRate'], .5)
        self.assertEqual(gap['runnerBeatsWinnerRate'], .5)
        self.assertAlmostEqual(gap['minGap'], -1.)
        self.assertAlmostEqual(gap['maxGap'], 1.)


if __name__ == '__main__':
    unittest.main()
