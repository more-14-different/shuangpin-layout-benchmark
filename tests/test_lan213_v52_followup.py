"""Published representatives must have real states and preserve comparison contracts."""
import gzip
import hashlib
import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from analyze_single_ckt_v51_aux_order import score_at,vectors
from rank_cr_toned_stable_policies import COSTS
from search_cr_667_zero_carriers import CarrierSpace

PREFIX=ROOT/'research/notes/2026-11-19-lan213-v52-followup'
OLD=ROOT/'research/notes/2026-11-19-f19-v52-production-audit'
def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


class Lan213V52FollowupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidates=read(str(PREFIX)+'-candidates.json')
        cls.recovery=read(str(PREFIX)+'-recovery.json')
        cls.source=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        cls.audit=read(str(PREFIX)+'-robustness.json')
        cls.native=read(str(PREFIX)+'-verification.json')

    def test_recovered_codes_and_old_score_evidence(self):
        space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
        first=next(x for x in self.candidates['layouts'] if x['id']=='f19a0ad1dc')['state']['firstKeys']
        self.assertEqual(len(self.recovery['results']),10)
        for row in self.recovery['results']:
            layout=next(x for x in self.candidates['layouts'] if x['id']==row['id'])
            self.assertEqual(space.key(layout['state']),row['canonicalKey'])
            self.assertEqual(layout['state']['firstKeys'],first)
            self.assertLessEqual(abs(row['difference']),5.1e-7 if row['id']=='0ca4838ebd' else 1e-9)
            self.assertEqual(space.memory(layout['state']),row['memory'])
        layout=next(x for x in self.candidates['layouts'] if x['id']=='391c0afa96')
        anchor=next(x for x in self.candidates['layouts'] if x['id']=='f19a0ad1dc')
        self.assertEqual(layout['state']['partition'],anchor['state']['partition'])
        changed=[(i,j,x,y) for i,(a,b) in enumerate(zip(anchor['state']['groupKeys'],layout['state']['groupKeys'])) for j,(x,y) in enumerate(zip(a,b)) if x!=y]
        self.assertEqual(changed,[(1,0,'S','H')])

    def test_prior_policies_are_unchanged_and_new_default_runner_is_391(self):
        old=json.loads(gzip.decompress(Path(str(OLD)+'-policies.json.gz').read_bytes()))
        actual={r['id']:r for r in self.source['results']}
        for r in old['results']:self.assertEqual(actual[r['id']]['policies'],r['policies'])
        self.assertEqual(len(actual),72)
        self.assertTrue(all(len(r['policies'])==144 for r in actual.values()))
        self.assertEqual([r['id'] for r in self.audit['defaultRankingEachOwnBest'][:2]],['f19a0ad1dc','391c0afa96'])
        gap=self.audit['defaultRankingEachOwnBest'][1]['score']-self.audit['defaultRankingEachOwnBest'][0]['score']
        self.assertAlmostEqual(gap,.000449635690103,places=11)

    def test_new_representatives_reverse_under_half_costs(self):
        source={r['id']:r for r in self.source['results']}
        selections={r['id']:r['selected'] for r in self.audit['results']}
        ids=['f19a0ad1dc','391c0afa96','ba0466ee5b']
        rows=[source[i]['policies'][selections[i]['policyIndex']] for i in ids]
        a=np.array([vectors(r,COSTS) for r in rows]);b=vectors(self.source['reference'],COSTS)
        normal=score_at(a,b,np.ones(6));half=score_at(a,b,np.full(6,.5))
        self.assertLess(normal[0],min(normal[1:]))
        self.assertGreater(half[0],max(half[1:]))
        self.assertFalse(self.audit['productionGatePassed'])

    def test_native_replay_checks_every_recovered_representative(self):
        checked={r['id'] for r in self.native['results']}
        for row in self.recovery['results']:self.assertIn(row['id'],checked)
        source={r['id']:r for r in self.source['results']}
        for native in self.native['results']:
            row=next(x for x in source[native['id']]['policies'] if x['policy']==native['policy'])
            self.assertAlmostEqual(row['score'],native['score'],places=9)
        summary=read(str(PREFIX)+'-summary.json')
        self.assertEqual(summary['hashRecoveredRepresentatives'],10)
        self.assertEqual(len(summary['unrecoveredParetoKeys']),23)
        for filename,want in summary['sourceHashes'].items():
            self.assertEqual(hashlib.sha256((ROOT/filename).read_bytes()).hexdigest(),want)


if __name__=='__main__':unittest.main()
