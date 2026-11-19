import importlib.util
import itertools
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('restore399',ROOT/'tools/restore_untoned_r2_399_v52.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class CapacityCertificateTests(unittest.TestCase):
    def test_forced_clique_requires_all_26_final_keys(self):
        certificate=m.capacity_certificate(write=False)
        self.assertEqual(certificate['minimumFinalKeys'],26)
        self.assertEqual(len(set(certificate['U12'])|set(certificate['T14'])),26)
        self.assertEqual(certificate['pairsChecked'],325)
        self.assertEqual(set(certificate['U12'])&set(certificate['T14']),set())

    def test_all_325_conflicts_have_independent_syllable_bucket_witnesses(self):
        certificate=m.capacity_certificate(write=False)
        clique=[m.FINALS.index(f) for f in certificate['clique26']]
        # j/q/x have identical canonical-final inventories; relabel their
        # forced roles as f+j, W+q, A/E+x. O can join x or n, which exhausts
        # the remaining abstract possibilities at a hypothetical 25-key cap.
        for o_bucket in ['x','n']:
            bucket={h:h for h in m.HEADS}
            bucket.update({'f':'j','W':'q','A':'x','E':'x','O':o_bucket,'YU':'Y'})
            finals_by_bucket={}
            for row in m.INPUT['common']:
                h,f=row['pair'];finals_by_bucket.setdefault(bucket[m.HEADS[h]],set()).add(f)
            conflicts=set()
            for fs in finals_by_bucket.values():conflicts.update(itertools.combinations(sorted(fs),2))
            for a,b in itertools.combinations(sorted(clique),2):self.assertIn((a,b),conflicts)

    def test_certificate_requires_the_exact_399_syllable_inventory(self):
        with patch.object(m,'PAIRS',m.PAIRS[:-1]):
            with self.assertRaises(AssertionError):m.capacity_certificate(write=False)

    def test_source_and_grouped_zero_initial_change_counts_are_distinct(self):
        self.assertEqual(m.counts(m.SOURCE)['families'],0)
        self.assertEqual(m.counts(m.SOURCE)['entries'],0)
        changed=m.SOURCE.copy()
        for h in [21,22,23]:changed[h]=9
        self.assertEqual(m.counts(changed)['families'],1)
        self.assertEqual(m.counts(changed)['entries'],3)

if __name__=='__main__':unittest.main()
