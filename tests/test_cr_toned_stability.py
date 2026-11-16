"""Broad-grid ranks preserve the existing competition convention and expose signed gaps."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from rank_cr_toned_stable_policies import grid_ranks,pooled_ranking,pair_margins,COSTS
from analyze_single_ckt_v51_aux_order import grid,rank_grid
from integrate_cr_stable_r11 import stable_source,LAYOUTS,ROBUST,COMPONENTS
from run_cr_anneal import unpack,SearchSpace


class BroadGridTests(unittest.TestCase):
    def sample(self):
        metric=dict(motorUpperMs=100,firstAuxRate=.2,secondAuxRate=.1,thirdAuxRate=.03,
            selectionRate=.01,meanRejectedCandidates=.02,meanPageActions=.001)
        tracks={name:dict(metric) for name in ['character','word2','word3','word4']}
        a=dict(policy=dict(word2='12',word3='213',word4='24'),tracks=copy.deepcopy(tracks))
        b=dict(policy=dict(word2='21',word3='231',word4='14'),tracks=copy.deepcopy(tracks))
        b['tracks']['word2']['motorUpperMs']-=1
        b['tracks']['word2']['firstAuxRate']+=.01
        return [a,b],dict(tracks=tracks)

    def test_positive_subset_and_full_grid_match_established_ranker(self):
        rows,reference=self.sample();points=grid(0,2,1)
        result=grid_ranks(rows,reference,points,chunk=19)
        case=dict(results=[dict(row,policyKey='/'.join(row['policy'].values())) for row in rows])
        for name,selected in [('all',points),('positive',points[np.all(points>0,axis=1)])]:
            expected=rank_grid(case,reference,COSTS,selected,chunk_size=17)
            self.assertEqual(result[name]['points'],expected['points'])
            self.assertEqual(result[name]['ranking'],expected['top10'])

    def test_pair_margin_reports_possible_reversals(self):
        rows,reference=self.sample()
        result=pair_margins(rows[0],rows[1],reference,grid(0,2,1),chunk=23)
        self.assertLess(result['all']['minGap'],0)
        self.assertGreater(result['all']['maxGap'],0)
        self.assertAlmostEqual(sum(result['all'][k] for k in ['selectedWins','runnerWins','tied']),1)

    def test_pooled_rank_uses_equal_grid_weight(self):
        row=lambda policy,rank:dict(policy=policy,meanRank=rank,top1Rate=0,top3Rate=1,worstRank=2)
        pooled=pooled_ranking(dict(a=dict(points=100,ranking=[row('A',1),row('B',2)]),
                                  b=dict(points=1,ranking=[row('A',3),row('B',1)])))
        self.assertEqual(pooled[0]['policy'],'B')


@unittest.skipUnless(ROBUST.exists(),'no recorded stability audit')
class StablePublicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();folder=Path(cls.temp.name)
        unpack(ROOT/'research/config/cr-anneal-inputs.zip',folder)
        cls.space=SearchSpace(folder)
        cls.bundle=json.loads(LAYOUTS.read_text(encoding='utf8'))
        cls.robust=json.loads(ROBUST.read_text(encoding='utf8'))
        cls.components=json.loads(COMPONENTS.read_text(encoding='utf8'))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_keeps_champion_id_and_three_new_ids_with_actual_policy_anchors(self):
        if len(self.robust['results'])!=4:
            self.skipTest('audit still running')
        source,references=stable_source(self.bundle,self.robust,self.components,self.space)
        self.assertEqual(len(source['layouts']),4)
        self.assertIn('CR-GPU-29ce221cfe',[r['id'] for r in source['layouts']])
        for layout in source['layouts']:
            self.assertEqual(len(layout['tonedCodes']),1407)
            self.assertEqual(layout['nativeScore'],references[layout['id']]['ckt']['v51']['score'])
            self.assertEqual(layout['wordAuxiliaryPolicy'],layout['policySelection']['selectedPolicy'])
            self.assertEqual(layout['nativeScore'],layout['policySelection']['selectedScore'])
            self.assertEqual(layout['memoryAudit']['memoryGuard'],24)

    def test_stale_codes_or_selected_scores_are_rejected(self):
        if len(self.robust['results'])!=4:
            self.skipTest('audit still running')
        bundle=copy.deepcopy(self.bundle);bundle['layouts'][0]['tonedCodes'][0]='BB'
        with self.assertRaisesRegex(ValueError,'expanded state/code mismatch'):
            stable_source(bundle,self.robust,self.components,self.space)
        robust=copy.deepcopy(self.robust);robust['results'][0]['selectedScore']+=1
        with self.assertRaisesRegex(ValueError,'selected policy/score mismatch'):
            stable_source(self.bundle,robust,self.components,self.space)


if __name__=='__main__':
    unittest.main()
