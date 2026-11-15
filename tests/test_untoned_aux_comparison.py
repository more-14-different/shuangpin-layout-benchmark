import unittest
import numpy as np
from tools.analyze_single_ckt_v51_aux_order import competition_ranks,component_vector,grid
from tools.analyze_untoned_aux_comparison import powers,pair_default
class AuxComparisonTests(unittest.TestCase):
 def test_component_formula_and_reference_normalization(self):
  ref=np.array([[100,3,4,0,5,6,7]]*4,dtype=float);v=np.array([ref,ref*1.1]);q=powers(v,ref,np.array([[1]*6,[0]*6,[5]*6],dtype=float));np.testing.assert_allclose(q[:,0],6);np.testing.assert_allclose(10*(q[:,1]/6)**.25,11)
 def test_independent_mode_minima_equal_complete_pair_minimum(self):
  shape=np.array([9.1,9.2,9.05]);tone=np.array([9.0,9.3,9.01]);all_pairs=((shape[:,None]**4+tone[None,:]**4)/2)**.25;self.assertAlmostEqual(float(all_pairs.min()),float(((shape.min()**4+tone.min()**4)/2)**.25))
 def test_competition_rank_ties(self):
  np.testing.assert_array_equal(competition_ranks(np.array([[1.,1.,2.,4.],[2.,1.,1.,4.]])),[[1,1,3,4],[3,1,1,4]])
 def test_auxiliary_time_components_are_independent(self):
  row=dict(motorUpperMs=100,firstAuxRate=.1,secondAuxRate=.2,thirdAuxRate=0,selectionRate=.3,meanRejectedCandidates=.4,meanPageActions=.5);costs=dict(firstAuxMs=300,secondAuxMs=300,thirdAuxMs=300,selectionDecisionMs=600,scanPerCandidateMs=50,pageActionMs=300);self.assertEqual(component_vector(row,costs),[100,30,60,0,180,20,150])
if __name__=='__main__':unittest.main()
