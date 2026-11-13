import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from shenyun_collision_benchmark import read_word_corpus, evaluate_toned_layout, normalize_toned_pinyin


class TonedCollisionColumns(unittest.TestCase):
    def test_tones_preserved_without_changing_default_untoned_reader(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'dict.yaml'
            file.write_text('---\nname: test\n...\n甲乙\ta1 b2\t10\n甲乙\ta4 b2\t8\n丙丁\tc d\t7\n', encoding='utf-8')
            ordinary = read_word_corpus([file])
            toned = read_word_corpus([file], preserve_tones=True)
        self.assertEqual(ordinary[2][0]['readings'], [('a', 'b')])
        self.assertEqual(toned[2][0]['readings'], [('a1', 'b2'), ('a4', 'b2')])
        self.assertEqual(toned[2][1]['readings'], [('c5', 'd5')])
        self.assertEqual(normalize_toned_pinyin('lü0'), 'lv5')

    def test_real_tone_keys_change_cross_family_collision_without_changing_family_definitions(self):
        corpus = {
            2: [{'word': '甲乙', 'weight': 10, 'readings': [('a1', 'b2')]}],
            3: [{'word': '甲乙丙', 'weight': 9, 'readings': [('a1', 'b2', 'c3')]}],
            4: [{'word': '甲乙丙丁', 'weight': 8, 'readings': [('a1', 'b2', 'c3', 'd4')]}],
        }
        fixture = {'pinyin': ['a', 'b', 'c', 'd'], 'tonedCodes': [
            ['AB', None, None, None, None], [None, 'CD', None, None, None],
            [None, None, 'EF', None, None], [None, None, None, 'GH', None],
        ]}
        result = evaluate_toned_layout(fixture, corpus, cuts=(1,))
        self.assertEqual(result['cuts']['1']['covered'], {'double': 1, 'triple': 1, 'quadruple': 1})
        self.assertEqual(result['cuts']['1']['crossBuckets'], 0)
        self.assertEqual(result['cuts']['1']['maxBucket'], 1)
        fixture['tonedCodes'][1][1] = 'BC'
        fixture['tonedCodes'][2][2] = 'CD'
        result = evaluate_toned_layout(fixture, corpus, cuts=(1,))
        # AUAU=ABBC, AAAU=ABCD, AAAA=ABCG: still separate.
        self.assertEqual(result['cuts']['1']['crossBuckets'], 0)
        fixture['tonedCodes'][0][0] = 'AB'
        fixture['tonedCodes'][1][1] = 'AB'
        fixture['tonedCodes'][2][2] = 'BB'
        fixture['tonedCodes'][3][3] = 'BZ'
        result = evaluate_toned_layout(fixture, corpus, cuts=(1,))
        self.assertGreater(result['cuts']['1']['crossAffectedRate'], 0)
        self.assertGreater(result['cuts']['1']['crossFirstChoiceLossRate'], 0)


if __name__ == '__main__':
    unittest.main()
