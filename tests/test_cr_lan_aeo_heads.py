"""Movable zero/onset units preserve AEO and do not impose a one-swap limit."""
import copy
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import search_cr_lan_aeo_heads as a


class AeoHeadsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        a.unpack(a.BUNDLE, Path(cls.temp.name))
        cls.space = a.CarrierSpace(Path(cls.temp.name))
        cls.base = next(r for r in a.read(a.SOURCE)['layouts'] if r['key'].startswith('7af91c1a1c'))
        cls.state = copy.deepcopy(cls.base['state'])
        a.assign_unit(cls.state, a.onset_units(cls.space.f)[0], 'R')

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_all_zero_and_ordinary_units_can_move_or_swap_without_splitting_aeo(self):
        state, space = self.state, self.space
        units = a.onset_units(space.f)
        self.assertEqual(len(units), 24)
        self.assertEqual(len(units[0]), 3)
        names = {atom['name']: i for i, atom in enumerate(space.f['atoms'])}
        reached = set()
        for _, candidate in a.head_moves(state, space):
            self.assertEqual(len({candidate['firstKeys'][i] for i in units[0]}), 1)
            self.assertEqual(candidate['partition'], state['partition'])
            self.assertEqual(candidate['groupKeys'], state['groupKeys'])
            reached.update(space.f['atoms'][i]['name'] for i, (x, y) in
                enumerate(zip(state['firstKeys'], candidate['firstKeys'])) if x != y)
        self.assertEqual(reached, set(names))

    def test_many_onset_changes_are_legal_when_D_does_not_increase(self):
        s = a.AeoHeads.__new__(a.AeoHeads)
        s.base, s.aeo = self.base, a.onset_units(self.space.f)[0]
        state = copy.deepcopy(self.state)
        names = {atom['name']: i for i, atom in enumerate(self.space.f['atoms'])}
        for name, key in {'zero-W':'Q', 'zero-Y':'W', 'zh':'J', 'ch':'R', 'k':'K', 'b':'T'}.items():
            state['firstKeys'][names[name]] = key
        self.assertTrue(s.valid_state(state))
        self.assertEqual(self.space.memory(state), dict(d=2, m=24, guard=26))
        self.assertGreater(sum(x != y for x, y in zip(state['firstKeys'], self.base['state']['firstKeys'])), 2)

    def test_compensated_moves_can_restore_one_initial_and_displace_another_at_D2(self):
        names = {atom['name']: i for i, atom in enumerate(self.space.f['atoms'])}
        found = []
        for _, state in a.compensated_head_moves(self.state, self.space):
            if state['firstKeys'][names['k']] == 'K' and state['firstKeys'][names['b']] == 'T':
                found.append(state)
        self.assertTrue(found)
        self.assertTrue(all(self.space.memory(s)['d'] == 2 for s in found))

    def test_aeo_and_tone_key_semantic_round_trip_boundaries(self):
        s = a.AeoHeads.__new__(a.AeoHeads)
        s.base, s.aeo = self.base, a.onset_units(self.space.f)[0]
        state = copy.deepcopy(self.state)
        self.assertTrue(s.valid_state(state))
        state['firstKeys'][s.aeo[0]] = 'C'
        self.assertFalse(s.valid_state(state))
        self.assertEqual([self.space.spec[k] for k in ['shapeKeysByMeaning', 'toneKeysByTone', 'toneDigitsByShapeMeaning']],
            ['AVUIO', 'IVUAO', '42310'])

    def test_primary_selection_does_not_promote_a_faster_D_increase(self):
        s = a.AeoHeads.__new__(a.AeoHeads)
        s.base, s.constraints = self.base, dict(preferredD=2, dailyFloor=128, pinkyCeiling=.1, rightPinkyCeiling=.1)
        def row(key, D, ckt, daily):
            return dict(key=key, metrics=dict(d=D, ckt=ckt, daily=daily, pinky=.08, rightPinky=.06, m=23, guard=25))
        primary, diagnostic = row('primary', 2, 9.16, 133), row('diagnostic', 3, 9.12, 140)
        s.cache = {r['key']: r for r in [primary, diagnostic]}
        s.progress = dict(controlKeys=[])
        reps = dict(s.representatives())
        self.assertEqual(reps['primary_lowest_ckt_daily_current']['key'], 'primary')
        self.assertEqual(reps['diagnostic_D_increase_lowest_ckt_130']['key'], 'diagnostic')


if __name__ == '__main__':
    unittest.main()
