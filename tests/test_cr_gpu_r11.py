"""Check the frozen CUDA archive -> publication mapping and reject stale metadata."""
import copy
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from integrate_cr_gpu_r11 import SOURCE, BUNDLE, LABELS, annealed_source, read
from integrate_cr_frontier_r11 import make_fixture
from run_cr_anneal import SearchSpace, unpack


class GPUArchivePublicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        unpack(BUNDLE, Path(cls.temp.name))
        cls.space = SearchSpace(Path(cls.temp.name))
        cls.archive = read(SOURCE)
        cls.decomposition = read(ROOT / 'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_three_states_round_trip_without_losing_full_final_or_tone_membership(self):
        source, references = annealed_source(self.archive, self.space, self.decomposition)
        self.assertEqual(len(source['tokenKeys']), 1407)
        for layout, lower in zip(source['layouts'], [22, 22, 21], strict=True):
            ident = layout['id']
            fixture = make_fixture(source, self.space.f, self.decomposition, ident,
                                   labels=LABELS, source_path=SOURCE)
            self.assertEqual(fixture['publication']['annealKey'], layout['annealKey'])
            self.assertEqual(fixture['publication']['memoryAudit']['memoryLower'], lower)
            self.assertEqual(fixture['publication']['memoryAudit']['memoryGuard'], 24)
            self.assertEqual(fixture['expected']['score'], references[ident]['ckt']['v51']['score'])
            self.assertEqual(fixture['shapeKeysByMeaning'], 'AVUIO')
            self.assertEqual(fixture['toneKeysByTone'], 'IVUAO')
            actual = {py + str(tone): code for py, codes in zip(fixture['pinyin'], fixture['tonedCodes'])
                      for tone, code in enumerate(codes, 1) if code}
            self.assertEqual(actual, dict(zip(source['tokenKeys'], layout['tonedCodes'])))
            for atom in fixture['rhymeAtoms']:
                for region in fixture['toneRegions']:
                    keys = {fixture['tonedCodes'][py][tone - 1] for py in atom['pinyin']
                            for tone in region['tones']} - {None}
                    self.assertEqual({code[1] for code in keys}, {atom['baselineKeys'][region['name']]})

    def test_stale_expansion_and_metric_anchors_are_rejected(self):
        archive = copy.deepcopy(self.archive)
        # Exclude the Top 10's duplicate so each individual validator is reached.
        archive['top10Ckt'] = []
        item = archive['finalists'][1]['item']
        item['expandedState']['firstKeys'][0] = 'C'
        with self.assertRaisesRegex(ValueError, 'expanded state mismatch'):
            annealed_source(archive, self.space, self.decomposition)
        archive = copy.deepcopy(self.archive)
        archive['top10Ckt'] = []
        archive['finalists'][1]['item']['metrics']['daily'] += 1
        with self.assertRaisesRegex(ValueError, 'daily anchor mismatch'):
            annealed_source(archive, self.space, self.decomposition)

    def test_stale_rhyme_labels_and_unverified_archives_are_rejected(self):
        archive = copy.deepcopy(self.archive)
        archive['top10Ckt'] = []
        archive['finalists'][1]['item']['rhymeGroups'][0]['roots'] = ['er']
        with self.assertRaisesRegex(ValueError, 'rhyme group metadata mismatch'):
            annealed_source(archive, self.space, self.decomposition)
        archive = copy.deepcopy(self.archive)
        archive['top10Ckt'] = []
        archive['finalists'][1]['item']['metrics']['verified'] = False
        with self.assertRaisesRegex(ValueError, 'unverified'):
            annealed_source(archive, self.space, self.decomposition)

    def test_conflicting_duplicate_cannot_mask_a_corrupted_finalist(self):
        archive = copy.deepcopy(self.archive)
        archive['finalists'][1]['item']['metrics']['daily'] += 1
        with self.assertRaisesRegex(ValueError, 'conflicting duplicate'):
            annealed_source(archive, self.space, self.decomposition)


if __name__ == '__main__':
    unittest.main()
