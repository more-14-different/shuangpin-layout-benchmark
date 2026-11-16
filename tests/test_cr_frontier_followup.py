"""Search operators retain root atoms, budgets, and recoverable exact states."""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from explore_cr_frontier_followup import Followup, local_moves, coupled_moves, paired_moves
from run_cr_anneal import fits_budget


class CRFollowupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.search = Followup(Path(cls.temp.name))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_profiles_keep_the_three_published_budgets_and_comfort_floors(self):
        s = self.search
        self.assertEqual([s.profiles[k]['maxM'] for k in s.seeds], [22, 22, 21])
        for name in ['balanced', 'daily']:
            self.assertEqual(s.profiles[name]['dailyFloor'], s.seeds[name]['metrics']['daily'])
            self.assertEqual(s.profiles[name]['pinkyCeiling'], s.seeds[name]['metrics']['pinky'])

    def test_filtered_local_moves_keep_complete_roots_and_all_budget_terms(self):
        s = self.search; state = s.seeds['speed']['state']; original = copy.deepcopy(state)
        items = list(s.candidates(state, s.profiles['speed'], local_moves(state, s.space)))
        self.assertGreater(len(items), 500)
        self.assertEqual(state, original)
        self.assertEqual(len(items), len({c['key'] for c in items}))
        for item in items:
            self.assertTrue(fits_budget(item['metrics'], s.profiles['speed']))
            self.assertEqual(set(item['state']['partition']), set(range(10)))
            expanded = s.space.expand(item['state'])
            for row in expanded['rhymeKeys']:
                for root in range(18):
                    self.assertEqual(len({row[i] for i, r in enumerate(s.space.spec['finalRoots']) if r == root}), 1)

    def test_coupled_generator_keeps_combinations_that_repair_an_invalid_intermediate(self):
        s = self.search; state = copy.deepcopy(s.seeds['speed']['state']); found = False
        # A valid boundary state with one missing region key: fund its extra
        # merge by returning the displaced p to P. Restoring that key can then
        # pay for a root repartition that fails as a separate proposal.
        p = next(i for i, atom in enumerate(s.space.f['atoms']) if atom['name'] == 'p')
        state['firstKeys'][p] = 'P'
        row = state['groupKeys'][0]
        unique = next(i for i, key in enumerate(row) if row.count(key) == 1)
        row[unique] = next(key for key in row if key != row[unique])
        self.assertTrue(fits_budget(s.space.memory(state), s.profiles['speed']))
        for label, candidate in coupled_moves(state, s.space):
            final = s.space.memory(candidate)
            if not final or not fits_budget(final, s.profiles['speed']):
                continue
            root_only = copy.deepcopy(state); root_only['partition'] = candidate['partition']
            intermediate = s.space.memory(root_only)
            if intermediate and not fits_budget(intermediate, s.profiles['speed']):
                found = True
                break
        self.assertTrue(found, 'joint moves can fund an otherwise over-budget root move')

    def test_ranked_pairs_merge_disjoint_edits_and_reject_conflicts(self):
        state = self.search.seeds['speed']['state']; a = copy.deepcopy(state); b = copy.deepcopy(state)
        a['firstKeys'][0] = 'C'; b['groupKeys'][0][0] = 'Q'
        items = [dict(key='a', label='a', state=a), dict(key='b', label='b', state=b)]
        pairs = list(paired_moves(state, items))
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0][1]['firstKeys'][0], 'C')
        self.assertEqual(pairs[0][1]['groupKeys'][0][0], 'Q')
        b = copy.deepcopy(state); b['firstKeys'][0] = 'D'; items[1]['state'] = b
        self.assertEqual(list(paired_moves(state, items)), [])

    def test_exported_archive_matches_its_manifest_and_keeps_only_legal_distinct_states(self):
        root = Path(__file__).resolve().parents[1]
        manifest = root / 'research/notes/2026-11-16-cr-frontier-followup-finalists.json'
        if not manifest.exists():
            self.skipTest('no recorded experiment yet')
        report = json.loads(manifest.read_text(encoding='utf8'))
        archive = manifest.parent / report['scoreArchive']['file']
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(),report['scoreArchive']['sha256'])
        rows = json.loads(gzip.decompress(archive.read_bytes()))['layouts']
        self.assertEqual(len(rows),report['uniqueScoredLayouts'])
        keys = set()
        for item in rows:
            self.assertNotIn(item['key'],keys); keys.add(item['key'])
            self.assertEqual(self.search.space.key(item['state']),item['key'])
            memory = self.search.space.memory(item['state'])
            self.assertTrue(fits_budget(memory,{'maxM':22}))
            for field,value in memory.items():
                self.assertEqual(item['metrics'][field],value)
        for layout in report['layouts']:
            self.assertIn(layout['key'],keys)
            self.assertTrue(layout['metrics']['verified'])


if __name__ == '__main__':
    unittest.main()
