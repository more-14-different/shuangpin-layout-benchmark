"""Publication contracts for the fixed production-Lan onset candidate."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from integrate_cr_lan_f19_r11 import publication_source,IDENT,LABELS,LAYOUTS
from integrate_cr_frontier_r11 import make_fixture,read
from run_cr_anneal import unpack
from search_cr_667_zero_carriers import CarrierSpace


class LanPublicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        unpack(ROOT/'research/config/cr-anneal-inputs.zip',Path(cls.temp.name))
        cls.space=CarrierSpace(Path(cls.temp.name))
        cls.source,cls.references=publication_source(cls.space)
        cls.decomposition=read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def fixture(self,source=None):
        return make_fixture(source or self.source,self.space.f,self.decomposition,IDENT,labels=LABELS,source_path=LAYOUTS)

    def test_all1407_codes_and_fixed_onsets_survive_the_publication_adapter(self):
        fixture=self.fixture();layout=self.source['layouts'][0]
        expected=dict(zip(self.source['tokenKeys'],layout['tonedCodes'],strict=True))
        actual={py+str(t):code for py,row in zip(fixture['pinyin'],fixture['tonedCodes'],strict=True)
                for t,code in enumerate(row,1) if code}
        self.assertEqual(len(actual),1407);self.assertEqual(actual,expected)
        self.assertEqual(fixture['publication']['wordAuxiliaryPolicy'],dict(word2='21',word3='213',word4='14'))
        self.assertEqual(fixture['publication']['policySelection']['rankedPolicyCount'],72)
        self.assertAlmostEqual(fixture['expected']['score'],9.107001929844568,places=12)
        self.assertEqual({k:layout['firstKeys'][k] for k in ['k','l','zero-A','zero-E','zero-O']},
                         {'k':'P','l':'E','zero-A':'R','zero-E':'C','zero-O':'C'})

    def test_derived_memory_and_auxiliary_meaning_round_trip_from_actual_codes(self):
        fixture=self.fixture()
        payload=dict(fixture=fixture,decomposition=self.decomposition)
        script="""const fs=require('fs'),x=JSON.parse(fs.readFileSync(0,'utf8')),
          a=require('./tools/auxiliary_semantics'),m=require('./tools/toned_memory_audit');
          process.stdout.write(JSON.stringify({memory:m.tonedMemoryAudit(x.fixture,x.fixture.pinyin,x.decomposition),
            tone:a.toneKeysFromShapeKeys(x.fixture.shapeKeysByMeaning),shape:a.shapeKeysFromToneKeys(x.fixture.toneKeysByTone)}));"""
        p=subprocess.run(['node','-e',script],cwd=ROOT,input=json.dumps(payload),text=True,encoding='utf8',capture_output=True,check=True)
        actual=json.loads(p.stdout)
        self.assertEqual(actual['tone'],fixture['toneKeysByTone']);self.assertEqual(actual['shape'],fixture['shapeKeysByMeaning'])
        self.assertEqual([actual['memory'][k] for k in ['lower','guard','D','F']],[24,25,2,0])
        self.assertEqual(actual['memory']['audit']['zeroCarrierRules'],2)
        self.assertEqual(actual['memory']['audit']['sourceRhymeColumnMergeRules'],7)

    def test_a_single_aeo_carrier_ledger_cannot_silently_publish_this_layout(self):
        bad=copy.deepcopy(self.source)
        bad['layouts'][0]['memoryAudit']['zeroCarrierRules']=1
        with self.assertRaisesRegex(ValueError,'memory formula mismatch'):self.fixture(bad)


if __name__=='__main__':unittest.main()
