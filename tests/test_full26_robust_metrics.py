import sys
from pathlib import Path
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from full26_robust_metrics import scores,compare,single_policy,prepare

class RobustMetricsTests(unittest.TestCase):
    def test_scores_and_single_policy_match_scalar_formula(self):
        rng=np.random.default_rng(12)
        a=rng.uniform(.1,10,(3,5,4,7));ref=rng.uniform(.1,10,(4,7))
        points=np.vstack([np.zeros(6),np.ones(6),rng.uniform(0,10,(5,6))])
        values=scores(a,ref,points)
        for b,p in enumerate(points):
            denominator=ref[:,0]+ref[:,1:]@p
            for m in range(3):
                for k in range(5):
                    eff=a[m,k,:,0]+a[m,k,:,1:]@p
                    expected=10*(sum(np.array([1,3,1,1])*(eff/denominator)**4)/6)**.25
                    self.assertAlmostEqual(values[b,m,k],expected,places=12)
        np.testing.assert_allclose(single_policy(a[1,2],ref,points,2),values[:,1,2])

    def test_gap_sign_ties_quantiles_and_witness(self):
        p=np.arange(24).reshape(4,6);candidate=np.array([1,2,3,4]);other=np.array([2,2,2,6])
        result=compare(candidate,other,p)
        self.assertEqual(result['winRate'],.5);self.assertEqual(result['lossRate'],.25)
        self.assertEqual(result['tieRate'],.25)
        self.assertEqual(result['gapQuantiles']['0'],-1)
        self.assertEqual(result['worst']['multipliers'],p[2].tolist())
        self.assertEqual(result['best']['gap'],2)

    def test_third_aux_changes_reference_even_if_candidates_have_none(self):
        a=np.ones((1,1,4,7));a[:,:,:,3]=0
        ref=np.ones((4,7));points=np.zeros((2,6));points[1,2]=5
        values=scores(a,ref,points)
        self.assertGreater(values[0,0,0],values[1,0,0])

if __name__=='__main__':unittest.main()
