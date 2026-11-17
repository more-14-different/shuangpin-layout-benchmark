"""Regression checks for the complete f19 policy audit and dual-pinky filtering."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from rank_cr_toned_stable_policies import COSTS,policy_candidates,policy_key,pooled_ranking,read
from analyze_single_ckt_v51_aux_order import score_at,vectors

PREFIX=ROOT/'research/notes/2026-11-17-cr-lan-f19-stability'


class LanStabilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.aux=read(str(PREFIX)+'-auxiliary.json')['results'][0]

    def test_all144_have_equal_cohorts_and_default_normalization(self):
        rows=policy_candidates(self.aux)
        self.assertEqual(len(rows),144)
        reference=read(ROOT/'research/config/cr-toned-stability-reference.json')
        scores=score_at(np.asarray([vectors(r,COSTS) for r in rows]),vectors(reference,COSTS),np.ones(6))
        for row,score in zip(rows,scores,strict=True):
            self.assertAlmostEqual(row['score'],score,places=9)
            for track,values in row['tracks'].items():
                base=self.aux['baseline']['tracks'][track]
                self.assertEqual((values['count'],values['totalWeight']),(base['count'],base['totalWeight']))

    def test_both_pinky_guards_apply_and_missing_metrics_are_rejected(self):
        rows=policy_candidates(self.aux,True)
        self.assertEqual(len(rows),72)
        self.assertEqual({r['policy']['word3'] for r in rows},{'123','132','213'})
        changed=copy.deepcopy(self.aux)
        changed['policies'][0]['rightPinky']=1
        # Unconstrained historical ranking still includes every policy.
        self.assertEqual(len(policy_candidates(changed)),144)
        self.assertNotIn(policy_key(changed['policies'][0]['policy']),
                         {policy_key(r['policy']) for r in policy_candidates(changed,True)})
        del changed['policies'][0]['rightPinky']
        with self.assertRaisesRegex(ValueError,'both pinky'):policy_candidates(changed,True)
        changed['policies'].pop()
        with self.assertRaisesRegex(ValueError,'incomplete'):policy_candidates(changed)

    def test_rankings_margins_and_full_native_replay_are_consistent(self):
        native=read(str(PREFIX)+'-verification.json')
        by_key={p['policyKey']:p for p in native['policies']}
        self.assertEqual([native['memory'][k] for k in ['lower','guard','D','F']],[24,25,2,0])
        for mode in ['robustness','constrained-robustness']:
            report=read(str(PREFIX)+'-'+mode+'.json');r=report['results'][0]
            self.assertEqual(r['selectedPolicy'],dict(word2='21',word3='213',word4='14'))
            self.assertTrue(r['sameWinnerAllGrids'])
            self.assertEqual(pooled_ranking(r['grids']),r['pooledRanking'])
            selected=by_key[policy_key(r['selectedPolicy'])];runner=by_key[policy_key(r['runnerPolicy'])]
            self.assertAlmostEqual(r['defaultScoreGap'],runner['score']-selected['score'],places=12)
            self.assertAlmostEqual(r['defaultRelativeGap'],runner['score']/selected['score']-1,places=12)
            self.assertAlmostEqual(r['meanRankGap'],r['runnerRank']['meanRank']-r['selectedRank']['meanRank'],places=12)
            if mode.startswith('constrained'):
                self.assertTrue(selected['passesPinkyConstraints']);self.assertTrue(runner['passesPinkyConstraints'])
                for name,g in r['grids'].items():
                    if 'Positive' in name:
                        self.assertEqual(g['ranking'][0]['top1Rate'],1)
                        self.assertGreater(g['selectedVsRunner']['minGap'],0)
            else:
                self.assertFalse(runner['passesPinkyConstraints'])
            for name,g in r['grids'].items():
                self.assertEqual(g['points'],report['grids'][name]['points'])
                self.assertEqual(len(g['ranking']),r['rankedPolicyCount'])
                m=g['selectedVsRunner']
                self.assertAlmostEqual(m['selectedWins']+m['runnerWins']+m['tied'],1)
                self.assertLessEqual(m['minGap'],m['p05Gap'])
                self.assertLessEqual(m['p95Gap'],m['maxGap'])
            for file,sha in report['sourceHashes'].items():
                self.assertEqual(hashlib.sha256((ROOT/file).read_bytes()).hexdigest(),sha)


if __name__=='__main__':unittest.main()
