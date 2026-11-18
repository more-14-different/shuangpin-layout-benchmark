import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('continuous', ROOT/'tools/continuous_shuangpin.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class ContinuousShuangpinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpus = c.read(c.CORPUS)
        cls.timing = c.Timing()
        cls.layout = next(r for r in c.default_layouts() if r['id'] == 'f19a0ad1dc')

    def test_one_two_three_word_example_counts_each_interval_once(self):
        code = 'ABCDEFGHIJKL'
        contexts = list(c.interval_contexts(code))
        self.assertEqual([x[0] for x in contexts], list(range(11)))
        self.assertEqual([x[2] for x in contexts if x[1] == 'L4i2'],
                         ['ABCD','BCDE','CDEF','DEFG','EFGH','FGHI','GHIJ','HIJK','IJKL'])
        owners = [(i, 0 if i == 0 else 1 if i < 3 else 2) for i in range(6) for _ in range(2)]
        counts = {key: 0 for key in c.EDGE_TYPES}
        for a, b in zip(owners, owners[1:]):
            counts[c.edge_type(a, b)] += 1
        self.assertEqual(list(counts.values()), [6,3,2])

    def test_native_short_roles_and_no_fake_first_key(self):
        self.assertEqual(list(c.interval_contexts('A')), [])
        self.assertEqual(list(c.interval_contexts('AB')), [(0,'L2i1','AB')])
        self.assertEqual(list(c.interval_contexts('ABC')), [(0,'L3i1','ABC'),(1,'L3i2','ABC')])
        roles = list(c.interval_contexts('ABCD'))
        self.assertEqual([r for _,r,_ in roles], ['L4i1','L4i2','L4i3'])

    def test_5500_and_5000_replay_counts_and_punctuation_boundaries(self):
        full = c.evaluate(self.corpus, self.layout['state'], self.timing, self.corpus['sceneOrder5500'])
        base = c.evaluate(self.corpus, self.layout['state'], self.timing, self.corpus['sceneOrder5000'])
        extra = c.evaluate(self.corpus, self.layout['state'], self.timing, [10])
        self.assertEqual((full['han'], full['soundKeys']), (5500,11000))
        self.assertEqual(base['han'], 5000)
        self.assertAlmostEqual(full['timingMs'], base['timingMs']+extra['timingMs'], places=6)
        self.assertEqual(full['intervals'], 11000-full['runs'])
        self.assertEqual(full['edges']['withinSyllable']['intervals'], 5500)
        self.assertEqual(sum(x['intervals'] for x in full['edges'].values()), full['intervals'])
        self.assertAlmostEqual(sum(x['timingMs'] for x in full['edges'].values()), full['timingMs'])
        stats = c.corpus_statistics(self.corpus, self.corpus['sceneOrder5500'])
        self.assertEqual([stats['wordCounts'][str(i)] for i in range(1,6)], [333,1014,325,350,145])

    def test_word_labels_cannot_change_motor_time(self):
        # Same phonetic stream, different segmentation: only attribution changes.
        import copy
        other = copy.deepcopy(self.corpus)
        for scene in other['scenes']:
            for sentence in scene['sentences']:
                changed = []
                for token in sentence:
                    if token['syllables'] is None:
                        changed.append(token)
                    else:
                        changed.extend(dict(text=char, syllables=[syllable]) for char, syllable in zip(token['text'], token['syllables']))
                sentence[:] = changed
        a = c.evaluate(self.corpus, self.layout['state'], self.timing, [1])
        b = c.evaluate(other, self.layout['state'], self.timing, [1])
        self.assertAlmostEqual(a['timingMs'], b['timingMs'], places=8)
        self.assertGreater(a['edges']['withinWordAcrossSyllables']['intervals'], 0)
        self.assertEqual(b['edges']['withinWordAcrossSyllables']['intervals'], 0)

    def test_encoding_matches_existing_toned_layout_all_five_tones(self):
        # Independent existing published toned-code list protects tone semantics.
        bundle = c.read(ROOT/'research/notes/2026-11-17-cr-lan-fixed-finalists.json')
        row = next(r for r in bundle['layouts'] if r['key'].startswith('f19'))
        encoded = dict(zip(bundle['tokenKeys'], row['tonedCodes']))
        for py in self.corpus['encoding']['pinyinAtoms']:
            for tone in range(1,6):
                if py+str(tone) in encoded:
                    self.assertEqual(c.encode_syllable(row['state'], self.corpus['encoding'], py, tone), encoded[py+str(tone)])


if __name__ == '__main__':
    unittest.main()
