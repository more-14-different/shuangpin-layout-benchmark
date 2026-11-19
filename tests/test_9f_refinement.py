"""Regression evidence for M21 endpoint search and native selected policies."""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from refine_9f_v52 import PREFIX,BASE,LoadScorer,paired_region_keys,root_and_region_key
from search_cr_667_zero_carriers import CarrierSpace
from analyze_single_ckt_v51_aux_order import vectors,score_at
from rank_cr_toned_stable_policies import COSTS

def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


class NineFRefinementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidates=read(str(PREFIX)+'-candidates.json');cls.summary=read(str(PREFIX)+'-summary.json')
        cls.native=read(str(PREFIX)+'-verification.json');cls.ergo=read(str(PREFIX)+'-ergonomics.json')
        cls.policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        cls.new=json.loads(gzip.decompress(Path(str(PREFIX)+'-scores.json.gz').read_bytes()))

    def test_every_new_endpoint_preserves_physical_constraints(self):
        space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs');names={a['name']:i for i,a in enumerate(space.f['atoms'])}
        self.assertEqual(len(self.new),self.candidates['newStates']);self.assertGreater(len(self.new),1000)
        self.assertEqual(sum(r['fresh'] for r in self.candidates['searchStages']),len(self.new))
        for key,row in self.new.items():
            state=row['state'];m=space.memory(state)
            self.assertEqual(space.key(state),key);self.assertEqual({f:row['metrics'][f] for f in ['m','guard','d']},m)
            self.assertLessEqual(m['m'],21);self.assertLessEqual(m['guard'],24);self.assertLessEqual(m['d'],2)
            self.assertEqual(len(state['partition']),18);self.assertEqual(set(state['partition']),set(range(10)))
            self.assertTrue(all(state['firstKeys'][names[n]]!='P' for n in ['zh','ch','sh']))
            self.assertEqual(len({state['firstKeys'][names['zero-'+n]] for n in 'AEO'}),1)

    def test_compound_operators_do_not_mutate_parent_and_change_expected_fields(self):
        state=copy.deepcopy(self.candidates['baseline']['state']);before=copy.deepcopy(state)
        space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
        _,paired=next(paired_region_keys(state,space));_,joint=next(root_and_region_key(state,space))
        self.assertEqual(state,before)
        self.assertEqual(paired['partition'],before['partition']);self.assertEqual(paired['firstKeys'],before['firstKeys'])
        self.assertEqual(sum(a!=b for ra,rb in zip(paired['groupKeys'],before['groupKeys']) for a,b in zip(ra,rb)),2)
        self.assertEqual(sum(a!=b for a,b in zip(joint['partition'],before['partition'])),1)
        self.assertEqual(sum(a!=b for ra,rb in zip(joint['groupKeys'],before['groupKeys']) for a,b in zip(ra,rb)),1)

    def test_new_search_kernel_loads_match_selected_native_ergonomics(self):
        scorer=LoadScorer();space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
        loads={r['id']:r for r in self.ergo['results']};raw={r['id']:r for r in self.policies['results']}
        layouts=[r for r in self.candidates['layouts'] if r['id']==BASE or r.get('key') in self.new][:4]
        self.assertGreaterEqual(len(layouts),2)
        for layout in layouts:
            actual=scorer.score(dict(state=copy.deepcopy(layout['state']),metrics=space.memory(layout['state'])))['metrics']
            selected=loads[layout['id']];fixed=next(r for r in raw[layout['id']]['policies'] if r['policy']==self.candidates['searchPolicy'])
            self.assertAlmostEqual(actual['cktV52'],fixed['score'],places=10)
            if selected['policy']==self.candidates['searchPolicy']:
                self.assertAlmostEqual(actual['maxFinger'],selected['maxFingerPeak4NativeTracks']['value'],places=12)
                self.assertAlmostEqual(actual['sameFingerOther'],selected['s2DifferentKeySameFingerRate'],places=12)

    def test_final_native_replay_and_two_cost_normalization(self):
        source={r['id']:r for r in self.policies['results']};rows={r['id']:r for r in self.summary['rows']}
        reference=vectors(self.policies['reference'],COSTS)
        self.assertEqual(len(self.native['results']),len(rows))
        for native in self.native['results']:
            raw=next(r for r in source[native['id']]['policies'] if r['policy']==native['policy'])
            self.assertEqual(len(source[native['id']]['policies']),144);self.assertAlmostEqual(native['score'],raw['score'],places=9)
            doubled=float(score_at(np.array([vectors(raw,COSTS)]),reference,np.full(6,2.))[0])
            self.assertAlmostEqual(doubled,rows[native['id']]['doubledV52'],places=10)

    def test_strict_labels_respect_all_four_load_metrics_at_own_robust_policy(self):
        baseline=self.summary['baseline']
        for name,row in self.summary['selections'].items():
            self.assertTrue(row['budgetEligible']);self.assertTrue(row['noPinkyGrowth'])
            if name.startswith('strict'):
                self.assertTrue(row['noErgonomicGrowth'])
                for field in ['leftPinkyPeakPct','rightPinkyPeakPct','maxFingerPeakPct','sameFingerOtherPct']:
                    self.assertLessEqual(row[field],baseline[field]+1e-10)
            if name.endswith('TwoCost'):
                self.assertTrue(row['twoCostImprovement'])
                for field in ['cktV52','doubledV52']:self.assertLessEqual(row[field],baseline[field]+1e-10)

    def test_archival_integrity_and_production_control(self):
        self.assertEqual(self.native['productionStatus']['matchesAuditedLayout'],'f19a0ad1dc')
        for doc in [self.candidates,self.summary]:
            for filename,expected in doc['sourceHashes'].items():
                self.assertEqual(hashlib.sha256((ROOT/filename).read_bytes()).hexdigest(),expected)
        self.assertEqual(self.summary['versus9fSensitivity']['mainPositive']['points'],1_000_000)
        self.assertEqual(self.summary['versus9fSensitivity']['extremePositive']['points'],1_000_000)


if __name__=='__main__':unittest.main()
