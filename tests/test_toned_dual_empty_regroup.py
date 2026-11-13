import sys
import unittest
from argparse import Namespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from search_toned_dual_empty_regroup import build, ROOT, read, SOURCE


@unittest.skipUnless((ROOT / 'research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json').exists(), 'local fixture required')
class DualEmptyRegroup(unittest.TestCase):
    def test_swapping_outer_tone_rows_preserves_keys_memory_and_inventory(self):
        base = dict(max_d=2,max_m=23,tag='SWAP',previous=None,production=True,
                    q_empty_rhyme=True,require_empty=[],operators='key',anchors='')
        keep = build(Namespace(**base))
        swap = build(Namespace(**base,swap_tone_rows=True))
        self.assertEqual(keep['candidates'],swap['candidates'])
        regions = {r['name']:r['tones'] for r in swap['fixture']['toneRegions']}
        self.assertEqual(regions,dict(upper=[1,5],home=[3,2],lower=[4]))
        self.assertEqual(keep['fixture']['tonedCodes'],swap['fixture']['tonedCodes'])
        self.assertEqual(swap['fixture']['toneKeysByTone'],'IVUAO')

    def test_guard_budget_is_independent_of_lower_budget(self):
        job = build(Namespace(max_d=2,max_m=23,max_guard=23,tag='GUARD',previous=None,production=True,
                             require_empty=[],operators='root,erv,key',anchors=''))
        self.assertTrue(job['candidates'])
        self.assertTrue(all(c['memoryGuard']<=23 for c in job['candidates']))
        self.assertTrue(any(c['kind']=='er-v-combination' for c in job['candidates']))

    def test_q_empty_rhyme_preserves_q_initial_and_charges_merge(self):
        job = build(Namespace(max_d=2,max_m=23,tag='QR',previous=None,production=True,
                             q_empty_rhyme=True,require_empty=[],operators='key,first',anchors=''))
        self.assertEqual(len(job['candidates']),6)
        for c in job['candidates']:
            self.assertTrue(all('Q' not in row for row in c['state']['rhymeKeys']))
            for i,a in enumerate(job['fixture']['atoms']):
                if a['initial']=='q':
                    self.assertEqual(c['state']['firstKeys'][i],'Q')
            self.assertEqual(c['memory'],22)
            self.assertEqual(c['memoryGuard'],24)

    def test_production_seed_can_leave_qz_unconstrained(self):
        job = build(Namespace(max_d=2,max_m=23,tag='FREE',previous=None,production=True,
                              require_empty=[],operators='root',anchors=''))
        c = job['candidates'][0]
        self.assertEqual(c['kind'],'baseline')
        self.assertEqual(c['memory'],21)
        self.assertEqual(c['memoryGuard'],23)
        self.assertEqual(job['requireEmpty'],[])
        self.assertEqual(c['ordinaryD'],1)
        self.assertEqual(c['state']['firstKeys'][13],'Q')

    @classmethod
    def setUpClass(cls):
        cls.job = build(Namespace(max_d=2, max_m=23, tag='TEST', previous=None,
            anchors='MARS10-QZZQEMPTY-P3-D2-M23-04', operators='root,key,first,coupled'))

    def test_every_actual_legal_code_obeys_both_empty_constraints(self):
        job, source = self.job, read(SOURCE)
        f = job['fixture']
        self.assertEqual(f['toneKeysByTone'], 'IVUAO')
        self.assertEqual(source['contract']['shapeKeysByMeaning'], 'AVUIO')
        for c in job['candidates']:
            codes = {}
            for ri, region in enumerate(f['toneRegions']):
                for fi, final in enumerate(f['rhymeAtoms']):
                    group = next(g for g in c['rhymeGroups'] if final['name'] in g['finals'])
                    self.assertEqual(c['state']['rhymeKeys'][ri][fi], group['keys'][region['name']])
                    for py in final['pinyin']:
                        ai = next(i for i, a in enumerate(f['atoms']) if py in a['pinyin'])
                        for t in region['tones']:
                            if f['tonedCodes'][py][t - 1]:
                                codes[f['pinyin'][py] + str(t)] = c['state']['firstKeys'][ai] + c['state']['rhymeKeys'][ri][fi]
            self.assertEqual(len(codes), 1407)
            self.assertTrue(set(codes.values()).isdisjoint({'QZ', 'ZQ'}))
            if c['kind'] == 'baseline':
                anchor = next(x for x in source['layouts'] if x['id'] == c['anchor'])
                self.assertEqual([codes[t] for t in source['tokenKeys']], anchor['tonedCodes'])
        self.assertGreater(job['rejected']['QZ'], 0)
        self.assertGreater(job['rejected']['ZQ'], 0)

    def test_memory_and_d_are_recomputed_after_partition_changes(self):
        f = self.job['fixture']
        for c in self.job['candidates']:
            groups = c['rhymeGroups']
            self.assertEqual(sorted(root for g in groups for root in g['roots']), self.job['rootNames'])
            self.assertTrue(all(g['roots'] for g in groups))
            self.assertEqual(len(groups), 10)
            self.assertIn('iong', next(g for g in groups if 'ong' in g['finals'])['finals'])
            first_cost = sum(a['moveMemoryDelta'] for i, a in enumerate(f['atoms']) if c['state']['firstKeys'][i] != a['baselineKey'])
            merge = sum(10 - len({g['keys'][r['name']] for g in groups}) for r in f['toneRegions'])
            self.assertEqual(c['memory'], 5 + first_cost + sum(len(g['roots']) > 1 for g in groups) + merge)
            self.assertEqual(c['memoryGuard'], 5 + first_cost + sum(len(g['roots']) - 1 for g in groups) + merge)
            d = sum(c['state']['firstKeys'][i] != a['initial'].upper() for i, a in enumerate(f['atoms']) if len(a['initial']) == 1 and a['initial'] != '_')
            self.assertLessEqual(d, 2)
            self.assertLessEqual(c['memory'], 23)
            self.assertEqual(c['splits'], 0)


if __name__ == '__main__':
    unittest.main()
