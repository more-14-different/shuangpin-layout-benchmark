import importlib.util
import json
from pathlib import Path
import random
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('anneal',ROOT/'tools/anneal_2126.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)

class AnnealTests(unittest.TestCase):
    def test_long_mutation_walk_and_rng_resume(self):
        seed=dict(rowCounts=[9,9,7],qEmpty=True)
        state=dict(partition=list(range(10))+[0,1,2,3,4,5,6,7],
                   maps=[list(range(1,10))+[1],list(range(9))+[0],list(range(7))+[0,1,2]],policy=0)
        rng=random.Random(90)
        original=json.dumps(state)
        kinds=set()
        for _ in range(1000):
            new=a.mutate(state,seed,rng)
            self.assertTrue(a.valid(new,seed))
            kinds.update(k for k in state if state[k]!=new[k]);state=new
        self.assertEqual(kinds,{'partition','maps','policy'})
        saved=json.loads(json.dumps(rng.getstate())); other=random.Random();other.setstate(a.tuplify(saved))
        self.assertEqual(a.mutate(state,seed,rng),a.mutate(state,seed,other))
        self.assertNotEqual(original,json.dumps(state))

    def test_reject_constraints_and_atomic_save(self):
        seed=dict(rowCounts=[10,9,7],qEmpty=False)
        s=dict(partition=list(range(10))+[0]*8,maps=[list(range(10)),list(range(9))+[0],list(range(7))+[0,1,2]],policy=0)
        self.assertTrue(a.valid(s,seed))
        s['partition'][9]=0;self.assertFalse(a.valid(s,seed))
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'checkpoint.json';a.atomic(p,{'n':1});a.atomic(p,{'n':2})
            self.assertEqual(json.loads(p.read_text()),{'n':2})
            self.assertFalse(p.with_suffix('.json.tmp').exists())

if __name__=='__main__':unittest.main()
