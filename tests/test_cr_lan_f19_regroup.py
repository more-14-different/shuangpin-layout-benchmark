"""The search changes intact-root membership, with all physical groups frozen."""
import copy
import sys
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import regroup_cr_lan_f19_roots as a


class RegroupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = a.read(a.SOURCE)['layouts'][0]
        with zipfile.ZipFile(a.BUNDLE) as z:
            import json
            cls.spec = json.loads(z.read('seeds.json'))
            cls.fixture = json.loads(z.read('fixture.json'))

    def test_policy_and_auxiliary_semantics_are_frozen(self):
        self.assertEqual(a.POLICY, self.base['wordAuxiliaryPolicy'])
        self.assertEqual(self.spec['wordAuxiliaryPolicy'], a.POLICY)
        self.assertEqual([self.spec[k] for k in ['shapeKeysByMeaning', 'toneKeysByTone', 'toneDigitsByShapeMeaning']],
            ['AVUIO', 'IVUAO', '42310'])

    def test_one_and_two_root_neighborhoods_are_complete_and_preserve_keys(self):
        state = self.base['state']
        original = copy.deepcopy(state)
        singles = list(a.single_root_moves(state))
        self.assertEqual(len(singles), 18*9)
        self.assertEqual(len({tuple(s['partition']) for _, s in singles}), 18*9)
        two, three = set(), set()
        for _, s in a.joint_root_moves(state):
            self.assertEqual(s['firstKeys'], state['firstKeys'])
            self.assertEqual(s['groupKeys'], state['groupKeys'])
            distance = sum(x != y for x, y in zip(s['partition'], state['partition']))
            self.assertIn(distance, [2, 3])
            (two if distance == 2 else three).add(tuple(s['partition']))
        self.assertEqual(len(two), 153*81)
        self.assertGreater(len(three), 0)
        self.assertEqual(state, original)

    def test_whole_roots_expand_uniformly_in_every_tone_region(self):
        space = a.CarrierSpace.__new__(a.CarrierSpace)
        space.spec = self.spec
        state = copy.deepcopy(self.base['state'])
        state['partition'][0] = (state['partition'][0]+1) % 10
        expanded = space.expand(state)
        for root in range(18):
            finals = [i for i, r in enumerate(self.spec['finalRoots']) if r == root]
            for region, row in enumerate(expanded['rhymeKeys']):
                self.assertEqual({row[i] for i in finals}, {state['groupKeys'][region][state['partition'][root]]})

    def test_candidate_boundary_rejects_group_key_swaps(self):
        search = a.RootRegroup.__new__(a.RootRegroup)
        search.base = self.base
        state = copy.deepcopy(self.base['state'])
        state['groupKeys'][0][0], state['groupKeys'][0][2] = state['groupKeys'][0][2], state['groupKeys'][0][0]
        with self.assertRaisesRegex(ValueError, 'group keys changed'):
            list(search.candidates([('illegal group-key swap', state)]))


if __name__ == '__main__':
    unittest.main()
