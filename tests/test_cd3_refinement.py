"""Hard budgets, true two-cost improvement, and full native replay evidence."""
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
from refine_cd3_v52 import PREFIX,OLD,FixedScorer
from search_cr_667_zero_carriers import CarrierSpace
from analyze_single_ckt_v51_aux_order import vectors,score_at
from rank_cr_toned_stable_policies import COSTS

def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


class Cd3RefinementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidates=read(str(PREFIX)+'-candidates.json')
        cls.summary=read(str(PREFIX)+'-summary.json')
        cls.native=read(str(PREFIX)+'-verification.json')
        cls.policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        cls.new=json.loads(gzip.decompress(Path(str(PREFIX)+'-scores.json.gz').read_bytes()))

    def test_every_new_state_preserves_m_d_intact_roots_and_no_p_retroflex(self):
        space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
        names={a['name']:i for i,a in enumerate(space.f['atoms'])}
        self.assertEqual(len(self.new),self.candidates['newStates'])
        self.assertGreater(len(self.new),1000)
        for key,row in self.new.items():
            state=row['state'];m=space.memory(state)
            self.assertEqual(space.key(state),key)
            self.assertLessEqual(m['m'],22);self.assertLessEqual(m['guard'],24);self.assertLessEqual(m['d'],2)
            self.assertEqual(len(state['partition']),18);self.assertEqual(set(state['partition']),set(range(10)))
            self.assertTrue(all(state['firstKeys'][names[n]]!='P' for n in ['zh','ch','sh']))
            self.assertEqual(len({state['firstKeys'][names['zero-'+n]] for n in 'AEO'}),1)

    def test_recommended_candidate_improves_both_ckts_and_reduces_m(self):
        baseline=self.summary['baseline'];winner=self.summary['selections']['simultaneousImprovement']
        self.assertTrue(winner['dominatesCd3']);self.assertTrue(winner['budgetEligible']);self.assertTrue(winner['noLoadGrowth'])
        self.assertLess(winner['cktV52'],baseline['cktV52'])
        self.assertLess(winner['doubledV52'],baseline['doubledV52'])
        self.assertLess(winner['M_lower'],baseline['M_lower'])
        self.assertLessEqual(winner['M_guard'],baseline['M_guard'])
        self.assertLessEqual(winner['leftPinkyPeakPct'],baseline['leftPinkyPeakPct']+1e-10)
        self.assertLessEqual(winner['rightPinkyPeakPct'],baseline['rightPinkyPeakPct']+1e-10)

    def test_actual_search_kernel_replays_baseline_and_selected_fixed_policy(self):
        space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs');scorer=FixedScorer()
        ids={'cd3cc7adfe',self.summary['selections']['simultaneousImprovement']['id']}
        for layout in self.candidates['layouts']:
            if layout['id'] not in ids:continue
            recorded=self.candidates['baseline']['metrics'] if layout['id']=='cd3cc7adfe' else layout['searchMetrics']
            actual=scorer.score(dict(state=copy.deepcopy(layout['state']),metrics=space.memory(layout['state'])))['metrics']
            for field in ['cktV52','doubledV52','pinky','rightPinky']:self.assertAlmostEqual(actual[field],recorded[field],places=10)

    def test_final_native_replay_and_doubled_normalization(self):
        source={r['id']:r for r in self.policies['results']};rows={r['id']:r for r in self.summary['rows']}
        reference=vectors(self.policies['reference'],COSTS)
        self.assertEqual(len(self.native['results']),len(rows))
        for native in self.native['results']:
            raw=next(r for r in source[native['id']]['policies'] if r['policy']==native['policy'])
            self.assertEqual(len(source[native['id']]['policies']),144)
            self.assertAlmostEqual(native['score'],raw['score'],places=9)
            doubled=float(score_at(np.array([vectors(raw,COSTS)]),reference,np.full(6,2.))[0])
            self.assertAlmostEqual(doubled,rows[native['id']]['doubledV52'],places=10)

    def test_imported_archive_and_final_report_hashes(self):
        self.assertEqual(hashlib.sha256(Path(str(OLD)+'-scores.json.gz').read_bytes()).hexdigest(),self.candidates['importedArchiveSha256'])
        self.assertEqual(self.native['productionStatus']['matchesAuditedLayout'],'f19a0ad1dc')
        for filename,expected in self.summary['sourceHashes'].items():
            self.assertEqual(hashlib.sha256((ROOT/filename).read_bytes()).hexdigest(),expected)

    def test_tradeoff_front_is_not_reported_as_universal_dominance(self):
        default=self.summary['selections']['new_cktV52'];baseline=self.summary['baseline']
        self.assertLess(default['cktV52'],baseline['cktV52'])
        self.assertGreater(default['doubledV52'],baseline['doubledV52'])
        best=self.summary['selections']['simultaneousImprovement']['id']
        for result in self.summary['versusCd3Sensitivity'].values():
            row=next(r for r in result['rows'] if r['id']==best)
            self.assertLess(row['minChangePct'],0)
            self.assertGreater(row['maxChangePct'],0)
            self.assertTrue(0<row['improvesShare']<1)


if __name__=='__main__':unittest.main()
