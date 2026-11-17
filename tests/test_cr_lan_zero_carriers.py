"""Audit isolated onset edits, equal cohorts, and independent comparison anchors."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from run_cr_anneal import unpack
from search_cr_667_zero_carriers import CarrierSpace
from integrate_cr_lan_f19_r11 import LAYOUTS
from compare_cr_lan_zero_carriers import OUTPUT,VARIANTS


class LanZeroCarrierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report=json.loads(OUTPUT.read_text(encoding='utf8'))
        cls.original=json.loads(LAYOUTS.read_text(encoding='utf8'))['layouts'][0]
        cls.temp=tempfile.TemporaryDirectory()
        unpack(ROOT/'research/config/cr-anneal-inputs.zip',Path(cls.temp.name))
        cls.space=CarrierSpace(Path(cls.temp.name))

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def test_only_requested_first_atoms_change_and_m_drops_by_one(self):
        baseline=self.original['state']
        for row in self.report['variants']:
            self.assertEqual(row['state']['partition'],baseline['partition'])
            self.assertEqual(row['state']['groupKeys'],baseline['groupKeys'])
            changes={atom['name']:after for atom,before,after in
                zip(self.space.f['atoms'],baseline['firstKeys'],row['state']['firstKeys'],strict=True) if before!=after}
            self.assertEqual(changes,VARIANTS[row['name']]);self.assertEqual(changes,row['changes'])
            self.assertEqual(self.space.key(row['state']),row['key'])
            self.assertEqual(self.space.memory(row['state']),dict(d=2,m=23,guard=24))
            self.assertAlmostEqual(self.space.daily(row['state'])['daily'],row['metrics']['daily'],places=9)

    def test_same_cohorts_correct_deltas_and_full_column_provenance(self):
        r=self.report;baseline=r['baselineBenchmark']
        self.assertFalse(r['auxiliaryPolicyReoptimized']);self.assertTrue(r['htmlUnchanged'])
        self.assertEqual(r['fixedPolicy'],dict(word2='21',word3='213',word4='14'))
        for row in r['variants']:
            n=row['benchmark'];m=row['metrics']
            for key,value in m.items():self.assertAlmostEqual(row['delta'][key],value-r['baseline'][key],places=12)
            self.assertEqual(n['columns']['nativeId'],row['id'])
            self.assertEqual(n['columns']['version'],'tone-in-main-column-contracts-v3')
            self.assertEqual(n['contract']['wordAuxiliaryPolicy'],r['fixedPolicy'])
            self.assertEqual(n['contract']['toneDigitsByShapeMeaning'],'42310')
            self.assertEqual(n['memory']['audit']['zeroCarrierRules'],1)
            for track,values in n['ckt']['v51']['tracks'].items():
                expected=baseline['ckt']['v51']['tracks'][track]
                for k in ['count','totalWeight']:self.assertEqual(values[k],expected[k])
            self.assertEqual(row['passesLeft'],m['leftPinky']<=row['constraints']['pinkyCeiling']+1e-12)
            self.assertEqual(row['passesRight'],m['rightPinky']<=row['constraints']['rightPinkyCeiling']+1e-12)
        for file,sha in r['sourceHashes'].items():self.assertEqual(hashlib.sha256((ROOT/file).read_bytes()).hexdigest(),sha)


if __name__=='__main__':unittest.main()
