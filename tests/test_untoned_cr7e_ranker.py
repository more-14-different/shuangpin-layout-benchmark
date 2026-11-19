import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec=importlib.util.spec_from_file_location('ranker',Path(__file__).resolve().parents[1]/'tools/learn_untoned_cr7e_ranker.py')
ranker=importlib.util.module_from_spec(spec);spec.loader.exec_module(ranker)

class RankerFeatures(unittest.TestCase):
    def test_key_assignment_and_partition_are_separate_features(self):
        keys=('BCDEFGHJKLMNPQRSTWXYZ'*2)[:35]
        swapped=keys.translate(str.maketrans('BC','CB'))
        rows=[dict(keys=k,proxy=99.,miss=.02) for k in [keys,swapped]]
        x=ranker.features(rows)
        self.assertEqual(x.shape,(2,1332))
        np.testing.assert_array_equal(x[:,:735].reshape(2,35,21).sum(axis=-1),np.ones((2,35)))
        self.assertFalse(np.array_equal(x[0,:735],x[1,:735]))
        np.testing.assert_array_equal(x[0,735:1330],x[1,735:1330])
        np.testing.assert_allclose(x[:,-2:],[[99.,.02],[99.,.02]])

if __name__=='__main__':unittest.main()
