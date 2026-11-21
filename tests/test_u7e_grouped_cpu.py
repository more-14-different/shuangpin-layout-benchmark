"""Memory/empty-bucket semantics, pair preservation, balancing and timed strategy reviews."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import run_u7e_grouped_cpu as run


class GroupedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg=json.loads(run.CONFIG.read_text(encoding='utf8'))

    def test_construct_surjective_all_pairs_and_e_preference(self):
        for lane in run.LANES:
            for seed in range(80):
                anchor=seed%2==0
                finals=run.construct_grouped(self.cfg,lane,run.Rng(seed+1),anchor_e=anchor)
                self.assertTrue(run.legal(finals,self.cfg,lane,0))
                self.assertEqual(run.broken_pairs(finals,self.cfg),[])
                self.assertEqual(len(set(finals)),21)
                if anchor:
                    ei,er=run.pair_indices(self.cfg)[-1]
                    self.assertEqual((finals[ei],finals[er]),(4,4))
                self.assertLessEqual(run.memory(finals,self.cfg),41)

    def test_mutation_respects_full_pairs_before_relaxation(self):
        rng=run.Rng(4321)
        for lane in run.LANES:
            center=run.construct_grouped(self.cfg,lane,rng)
            accepted=0
            for _ in range(2000):
                candidate=run.mutate_once(center,self.cfg,rng,0)
                if run.legal(candidate,self.cfg,lane,0):
                    center=candidate
                    accepted+=1
                    self.assertFalse(run.broken_pairs(center,self.cfg))
            self.assertGreater(accepted,300)

    def test_empty_buckets_are_independent_of_pair_cap(self):
        cfg=self.cfg
        self.assertTrue(run.empty_buckets(cfg['seedFinalKeys'],cfg))
        f=list(cfg['seedFinalKeys'])
        # ian can follow q; mapping ian to Z fills QZ.
        f[cfg['finalNames'].index('ian')]=25
        self.assertFalse(run.empty_buckets(f,cfg))
        self.assertFalse(run.legal(f,cfg,'strict',7))

    def test_equal_native_time_scheduler(self):
        seconds={lane:0. for lane in run.LANES}
        durations={'strict':.35,'open':.61}
        for _ in range(200):
            lane=run.choose_lane(seconds)
            seconds[lane]+=durations[lane]
        self.assertLess(abs(seconds['strict']-seconds['open']),max(durations.values())+.001)

    def test_own_seed_canonical_scores(self):
        for a,b in zip(run.scores(self.cfg['seedModes'],self.cfg),self.cfg['expectedSeedScores']):
            self.assertAlmostEqual(a,b,places=12)

    def test_hourly_review_never_early_splits_and_transfers(self):
        cfg=self.cfg
        with tempfile.TemporaryDirectory() as tmp:
            work=Path(tmp)
            (work/'reviews').mkdir()
            campaign=run.Campaign(work,cfg)
            start=campaign.state['startedUtc']
            finals=run.construct_grouped(cfg,'strict',run.Rng(117),anchor_e=True)
            row=dict(id='test-center',key=''.join(chr(k+65) for k in finals),finals=finals,
                     scores=[9.8,9.8,9.8,9.8],broken=[],M=run.memory(finals,cfg),emptyBuckets=True,
                     eiErAtE=True,rightPinkyMixed=.02,rightPinkyPeak8=.03,modes=cfg['seedModes'])
            campaign.store(row)
            campaign.state['evaluations']={'strict':500,'open':500}
            campaign.save()
            one=campaign.review(start+3600)
            self.assertEqual(campaign.state['maxBroken'],{'strict':0,'open':0})
            self.assertTrue(one['transfers'])
            two=campaign.review(start+7201)
            self.assertEqual(campaign.state['maxBroken'],{'strict':1,'open':1})
            self.assertTrue(two['lanes']['strict']['changedStrategy'])
            self.assertTrue(any(p['kind']=='evidence-guided pair split probe' for p in campaign.state['queues']['strict']))
            campaign.review(start+7202,forced=True)
            self.assertEqual(campaign.state['maxBroken'],{'strict':1,'open':1})
            campaign.close()
            resumed=run.Campaign(work,cfg)
            self.assertEqual(resumed.state['maxBroken'],{'strict':1,'open':1})
            self.assertEqual(resumed.cached(finals)['id'],'test-center')
            resumed.close()


if __name__=='__main__':
    unittest.main()
