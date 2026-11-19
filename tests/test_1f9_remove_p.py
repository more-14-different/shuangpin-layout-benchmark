"""Memory/onset invariants and independent native checks for P removal."""
import gzip
import hashlib
import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from search_1f9_remove_p import PREFIX
from search_cr_667_zero_carriers import CarrierSpace
from analyze_single_ckt_v51_aux_order import vectors,score_at
from rank_cr_toned_stable_policies import COSTS

def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


class RemovePRetroflexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle=read(str(PREFIX)+'-candidates.json')
        cls.native=read(str(PREFIX)+'-verification.json')
        cls.summary=read(str(PREFIX)+'-summary.json')
        cls.audit=read(str(PREFIX)+'-robustness.json')
        cls.policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        cls.cache=json.loads(gzip.decompress(Path(str(PREFIX)+'-scores.json.gz').read_bytes()))

    def test_entire_searched_archive_preserves_memory_domain_and_no_retroflex_p(self):
        space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
        names={a['name']:i for i,a in enumerate(space.f['atoms'])}
        self.assertGreaterEqual(len(self.cache),16000)
        for key,row in self.cache.items():
            state=row['state'];m=space.memory(state)
            self.assertEqual(space.key(state),key)
            self.assertLessEqual(m['m'],22);self.assertLessEqual(m['guard'],24);self.assertLessEqual(m['d'],2)
            self.assertTrue(all(state['firstKeys'][names[n]]!='P' for n in ['zh','ch','sh']))
            self.assertEqual(len({state['firstKeys'][names['zero-'+n]] for n in 'AEO'}),1)

    def test_all_final_policies_have_independent_native_replays_and_consistent_doubled_scores(self):
        by_id={r['id']:r for r in self.policies['results']}
        native={r['id']:r for r in self.native['results']}
        reference=vectors(self.policies['reference'],COSTS)
        for selection in self.audit['results']:
            ident=selection['id'];row=by_id[ident]['policies'][selection['selected']['policyIndex']]
            self.assertEqual(len(by_id[ident]['policies']),144)
            self.assertIn(ident,native)
            self.assertAlmostEqual(native[ident]['score'],row['score'],places=9)
            actual=float(score_at(np.array([vectors(row,COSTS)]),reference,np.full(6,2.))[0])
            recorded=next(r for r in self.summary['rows'] if r['id']==ident)
            self.assertAlmostEqual(recorded['doubledV52'],actual,places=11)

    def test_baseline_calibration_and_guarded_recommendations(self):
        base=self.summary['baseline']
        self.assertEqual((base['M_lower'],base['M_guard'],base['D']),(22,24,2))
        self.assertAlmostEqual(base['cktV52'],9.11746719363091,places=9)
        self.assertAlmostEqual(base['doubledV52'],8.861987917902422,places=9)
        self.assertEqual(self.summary['selections']['noLeftGrowth_cktV52']['id'],'17983edeb8')
        self.assertEqual(self.summary['selections']['noLeftGrowth_doubledV52']['id'],'cd3cc7adfe')
        for label,row in self.summary['selections'].items():
            self.assertTrue(row['eligible'])
            self.assertLess(row['rightPinkyPeakPct'],base['rightPinkyPeakPct'])
            self.assertLessEqual(row['M_lower'],22);self.assertLessEqual(row['M_guard'],24);self.assertLessEqual(row['D'],2)
            if label.startswith('noLeftGrowth'):
                self.assertLessEqual(row['leftPinkyPeakPct'],base['leftPinkyPeakPct']+1e-10)

    def test_report_inputs_are_bound_by_hash_and_production_stays_a_control(self):
        for filename,expected in self.summary['sourceHashes'].items():
            self.assertEqual(hashlib.sha256((ROOT/filename).read_bytes()).hexdigest(),expected)
        self.assertEqual(self.native['productionStatus']['matchesAuditedLayout'],'f19a0ad1dc')
        self.assertTrue(self.bundle['productionBaselineFrozen'])

    def test_wide_sensitivity_encloses_the_default_and_doubled_witnesses(self):
        rows={r['id']:r for r in self.summary['rows']}
        for result in self.summary['versus1f9Sensitivity'].values():
            self.assertEqual(result['points'],1000000)
            for row in result['rows']:
                self.assertLessEqual(row['minRelativePct'],row['medianRelativePct'])
                self.assertLessEqual(row['medianRelativePct'],row['maxRelativePct'])
                self.assertTrue(0<=row['improvesShare']<=1)
                for field in ['defaultIncreasePct','doubledIncreasePct']:
                    self.assertGreaterEqual(rows[row['id']][field]+1e-10,row['minRelativePct'])
                    self.assertLessEqual(rows[row['id']][field]-1e-10,row['maxRelativePct'])


if __name__=='__main__':unittest.main()
