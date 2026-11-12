import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from search_toned_rhyme_regroup import make_job, ROOT, read


@unittest.skipUnless((ROOT / 'research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json').exists(), 'local fixture required')
class RegroupContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.job = make_job()

    def test_no_tone_exceptions_and_independent_memory_accounting(self):
        f = self.job['fixture']
        anchors = {x['id']: x for x in read('research/config/ckt-v51-toned-2121-mars10-qz-empty-p3-finalist.json')['layouts']}
        for c in self.job['candidates']:
            self.assertEqual(len(c['rhymeGroups']), 10)
            self.assertEqual(sorted(root for g in c['rhymeGroups'] for root in g['roots']), self.job['rootNames'])
            first_cost = sum(a['moveMemoryDelta'] for i, a in enumerate(f['atoms']) if c['state']['firstKeys'][i] != a['baselineKey'])
            rules = sum(len(g['roots']) > 1 for g in c['rhymeGroups'])
            links = sum(len(g['roots']) - 1 for g in c['rhymeGroups'])
            merge = sum(10 - len({g['keys'][r['name']] for g in c['rhymeGroups']}) for r in f['toneRegions'])
            self.assertEqual(c['memory'], 5 + first_cost + rules + merge)
            self.assertEqual(c['memoryGuard'], 5 + first_cost + links + merge)
            self.assertLessEqual(c['memory'], anchors[c['anchor']]['memoryAudit']['memoryLower'])
            self.assertLessEqual(c['memoryGuard'], anchors[c['anchor']]['memoryAudit']['memoryGuard'])
            self.assertEqual(c['splits'], 0)
            for ri, region in enumerate(f['toneRegions']):
                for fi, final in enumerate(f['rhymeAtoms']):
                    group = next(g for g in c['rhymeGroups'] if final['name'] in g['finals'])
                    self.assertEqual(c['state']['rhymeKeys'][ri][fi], group['keys'][region['name']])

    def test_anchor_encoding_and_auxiliary_semantics_roundtrip(self):
        f = self.job['fixture']
        source = read('research/config/ckt-v51-toned-2121-mars10-qz-empty-p3-finalist.json')
        self.assertEqual(f['toneKeysByTone'], source['contract']['toneKeysByTone'])
        self.assertEqual(source['contract']['shapeKeysByMeaning'], 'AVUIO')
        for c in self.job['candidates']:
            if c['kind'] != 'baseline':
                continue
            codes = {}
            for ri, region in enumerate(f['toneRegions']):
                for fi, final in enumerate(f['rhymeAtoms']):
                    for py in final['pinyin']:
                        ai = next(i for i, a in enumerate(f['atoms']) if py in a['pinyin'])
                        for t in region['tones']:
                            if f['tonedCodes'][py][t - 1]:
                                codes[f['pinyin'][py] + str(t)] = c['state']['firstKeys'][ai] + c['state']['rhymeKeys'][ri][fi]
            anchor = next(x for x in source['layouts'] if x['id'] == c['anchor'])
            self.assertEqual([codes[t] for t in source['tokenKeys']], anchor['tonedCodes'])

    def test_ong_iong_remain_one_unit_and_every_candidate_keeps_qz_empty(self):
        f = self.job['fixture']
        for c in self.job['candidates']:
            group = next(g for g in c['rhymeGroups'] if 'ong' in g['finals'])
            self.assertIn('iong', group['finals'])
            for ri, region in enumerate(f['toneRegions']):
                for fi, final in enumerate(f['rhymeAtoms']):
                    if c['state']['rhymeKeys'][ri][fi] != 'Z':
                        continue
                    for py in final['pinyin']:
                        ai = next(i for i, a in enumerate(f['atoms']) if py in a['pinyin'])
                        if any(f['tonedCodes'][py][t - 1] for t in region['tones']):
                            self.assertNotEqual(c['state']['firstKeys'][ai], 'Q')


if __name__ == '__main__':
    unittest.main()
