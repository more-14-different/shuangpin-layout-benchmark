"""Publish exactly the requested five layouts at their first broad-grid policy."""
import copy
import tempfile
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from integrate_cr_production5_r11 import SOURCE,LABELS,production_source
from integrate_cr_frontier_r11 import make_fixture,read
from run_cr_anneal import unpack,SearchSpace


class ProductionFiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();folder=Path(cls.temp.name)
        unpack(ROOT/'research/config/cr-anneal-inputs.zip',folder);cls.space=SearchSpace(folder)
        cls.manifest=read(SOURCE)
        cls.source,cls.references=production_source(cls.manifest,cls.space)
        cls.decomposition=read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def test_all_five_use_first_policy_and_preserve_their_1407_actual_codes(self):
        self.assertEqual([r['id'] for r in self.source['layouts']],list(LABELS))
        for layout in self.source['layouts']:
            ident=layout['id'];e=self.manifest['expected'][ident]
            self.assertEqual(layout['wordAuxiliaryPolicy'],dict(word2='21',word3='231',word4='14'))
            self.assertAlmostEqual(layout['nativeScore'],e['cktV51'])
            fixture=make_fixture(self.source,self.space.f,self.decomposition,ident,labels=LABELS,source_path=SOURCE)
            self.assertEqual(fixture['publication']['annealKey'],layout['key'])
            self.assertEqual(fixture['publication']['policySelection']['selectedScore'],e['cktV51'])
            self.assertEqual(fixture['shapeKeysByMeaning'],'AVUIO');self.assertEqual(fixture['toneKeysByTone'],'IVUAO')
            self.assertEqual(fixture['expected']['score'],e['cktV51'])
            self.assertEqual(fixture['publication']['memoryAudit']['memoryLower'],e['memoryLower'])
            self.assertEqual(fixture['publication']['memoryAudit']['memoryGuard'],24)
            codes={py+str(t):c for py,row in zip(fixture['pinyin'],fixture['tonedCodes']) for t,c in enumerate(row,1) if c}
            self.assertEqual(len(codes),1407)
            self.assertEqual(codes,dict(zip(self.source['tokenKeys'],layout['tonedCodes'],strict=True)))
            self.assertEqual(layout['policySelection']['selected']['policy'],'21/231/14')

    def test_795_uses_robust_14_score_instead_of_its_old_fixed_24_score(self):
        row=next(r for r in self.source['layouts'] if r['id']=='CR-GPU-795c0eee49')
        self.assertAlmostEqual(row['rustScore'],9.159766006276563)
        self.assertAlmostEqual(row['nativeScore'],9.159565261550586)
        self.assertLess(row['nativeScore'],row['rustScore'])

    def test_corrupt_sources_expected_scores_and_duplicate_ids_fail(self):
        bad=copy.deepcopy(self.manifest);bad['groups'][0]['sha256'][bad['groups'][0]['layouts']]='0'*64
        with self.assertRaisesRegex(ValueError,'input hash mismatch'):production_source(bad,self.space)
        bad=copy.deepcopy(self.manifest);bad['expected']['CR-GPU-87de6cc69c']['cktV51']+=1
        with self.assertRaisesRegex(ValueError,'stable CKT mismatch'):production_source(bad,self.space)
        bad=copy.deepcopy(self.manifest);bad['groups'].append(copy.deepcopy(bad['groups'][0]))
        with self.assertRaisesRegex(ValueError,'duplicate requested ID'):production_source(bad,self.space)


if __name__=='__main__':unittest.main()
