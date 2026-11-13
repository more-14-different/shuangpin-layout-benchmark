"""Verify CR publication converts the audited inventory without losing semantics."""
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from integrate_cr_frontier_r11 import make_fixture, LABELS, SOURCE, BASELINE, read


class CRPublicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = read(SOURCE)
        cls.baseline = read(BASELINE)
        cls.decomposition = read(ROOT / 'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']

    def test_each_fixture_preserves_all_1407_codes_and_memory_audit(self):
        for ident in LABELS:
            with self.subTest(ident=ident):
                fixture = make_fixture(self.source, self.baseline, self.decomposition, ident)
                original = next(row for row in self.source['layouts'] if row['id'] == ident)
                actual = {py + str(tone): code for py, codes in zip(fixture['pinyin'], fixture['tonedCodes'])
                          for tone, code in enumerate(codes, 1) if code}
                self.assertEqual(actual, dict(zip(self.source['tokenKeys'], original['tonedCodes'])))
                self.assertEqual(len(actual), 1407)
                self.assertEqual(fixture['publication']['memoryAudit']['ordinaryD'], 2)
                self.assertEqual(fixture['publication']['memoryAudit']['memoryGuard'], 24)
                self.assertEqual(fixture['shapeKeysByMeaning'], 'AVUIO')
                self.assertEqual(fixture['toneKeysByTone'], 'IVUAO')
                # All rhyme labels must describe actual final membership;
                # grouping roots alone misses the regrouped in/vn syllables.
                finals = {row['pinyin']: row['fullFinal'] for row in self.decomposition}
                for group, atom in zip(original['rhymeGroups'], fixture['rhymeAtoms']):
                    self.assertTrue(all(finals[fixture['pinyin'][py]] in group['finals'] for py in atom['pinyin']))

    def test_stale_onset_metadata_and_missing_legal_tone_are_rejected(self):
        source = copy.deepcopy(self.source)
        row = next(row for row in source['layouts'] if row['id'] == 'CR0-0374')
        row['firstKeys']['p'] = 'P'
        with self.assertRaisesRegex(ValueError, 'onset metadata/code mismatch'):
            make_fixture(source, self.baseline, self.decomposition, 'CR0-0374')
        source = copy.deepcopy(self.source)
        source['layouts'][0]['tonedCodes'][0] = None
        with self.assertRaisesRegex(ValueError, 'legal-tone mask changed'):
            make_fixture(source, self.baseline, self.decomposition, source['layouts'][0]['id'])


if __name__ == '__main__':
    unittest.main()
