"""Joint moves preserve tone regions, key counts, intact roots and fixed onsets."""
import copy
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
import search_cr_lan_f19_combined as a
from explore_cr_lan_f19_two_swap import repair_row_multiset


class CombinedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = a.read(a.SOURCE)['layouts'][0]

    def test_group_exchanges_cover_every_region_subset_and_are_reversible(self):
        state = self.base['state']
        original = copy.deepcopy(state)
        seen_masks = set()
        seen_states = set()
        for label, candidate in a.group_exchanges(state):
            self.assertTrue(a.same_key_multisets(candidate, state))
            self.assertEqual(candidate['partition'], state['partition'])
            seen_masks.add(int(label.split(':')[-1]))
            seen_states.add(a.digest(candidate))
            pair = label.split(':')[1]
            x, y = map(int, pair.split('/'))
            mask = int(label.split(':')[-1])
            restored = copy.deepcopy(candidate)
            for r in range(3):
                if mask & (1 << r):
                    row = restored['groupKeys'][r]
                    row[x], row[y] = row[y], row[x]
            self.assertEqual(restored, state)
        self.assertEqual(seen_masks, set(range(1, 8)))
        self.assertGreater(len(seen_states), 200)
        self.assertEqual(state, original)

    def test_root_swaps_preserve_group_sizes_and_physical_key_assignments(self):
        state = self.base['state']
        for _, candidate in a.root_exchanges(state):
            self.assertEqual(candidate['firstKeys'], state['firstKeys'])
            self.assertEqual(candidate['groupKeys'], state['groupKeys'])
            self.assertEqual(sorted(candidate['partition']), sorted(state['partition']))
            self.assertEqual(sum(x != y for x, y in zip(candidate['partition'], state['partition'])), 2)

    def test_boundary_rejects_new_keys_or_new_onsets(self):
        state = self.base['state']
        for mutate in [lambda s: s['firstKeys'].__setitem__(0, 'C'),
                lambda s: s['groupKeys'][0].__setitem__(0, 'W')]:
            s = copy.deepcopy(state)
            mutate(s)
            self.assertFalse(a.same_key_multisets(s, state))

    def test_historical_projection_preserves_counts_with_only_required_replacements(self):
        original = list('HHGSD')
        target = list('HSGSD')
        repairs = list(repair_row_multiset(original, target))
        self.assertEqual(len(repairs), 2)
        for row in repairs:
            self.assertEqual(sorted(row), sorted(target))
            self.assertEqual(sum(x != y for x, y in zip(row, original)), 1)
        self.assertEqual(list(repair_row_multiset(target, target)), [target])
        self.assertEqual(original, list('HHGSD'))

    def test_target_representative_minimizes_ckt_after_both_load_guards(self):
        s = a.CombinedSearch.__new__(a.CombinedSearch)
        s.base, s.constraints = self.base, self.base['constraints']
        def row(key, ckt, daily, **changes):
            return dict(key=key, metrics=dict(self.base['metrics'], ckt=ckt, daily=daily, **changes))
        baseline = row(self.base['key'], self.base['rustScore'], self.base['metrics']['daily'])
        low = row('low', 9.15, 130.01)
        fast = row('fast', 9.18, 132)
        invalid = row('invalid', 9.13, 133, pinky=1)
        s.cache = {r['key']: r for r in [baseline, low, fast, invalid]}
        selected = dict(s.representatives())
        self.assertEqual(selected['lowest_ckt_daily_130']['key'], 'low')
        self.assertEqual(selected['lowest_ckt_daily_132']['key'], 'fast')


if __name__ == '__main__':
    unittest.main()
