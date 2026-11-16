"""Root regrouping stays uniform across tones and has no internal split cost."""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from regroup_cr_667_roots import PARENT,PREFIX,joint_root_moves,source_data
from explore_cr_stable_neighbors import StableNeighbors


class RootRegroupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.source,cls.anchor,cls.imported,_=source_data()
        cls.search=StableNeighbors(Path(cls.temp.name),PARENT,anchor=cls.anchor)

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def test_uniform_moves_preserve_onsets_region_keys_and_whole_root_atoms(self):
        s=self.search;state=self.anchor['state'];old=copy.deepcopy(state);moves=joint_root_moves(state)
        counts={2:0,3:0}
        for label,candidate in moves:
            self.assertEqual(candidate['firstKeys'],state['firstKeys'])
            self.assertEqual(candidate['groupKeys'],state['groupKeys'])
            changed=sum(a!=b for a,b in zip(candidate['partition'],state['partition']))
            self.assertIn(changed,[2,3]);counts[changed]+=1
            if label.startswith('three-root-cycle'):
                self.assertEqual(sorted(candidate['partition']),sorted(state['partition']))
        self.assertEqual(state,old);self.assertGreater(counts[2],10000);self.assertGreater(counts[3],0)

    def test_complete_generation_has_2443_legal_states_without_increasing_memory(self):
        s=self.search;state=self.anchor['state']
        rows=list(s.candidates(state,s.profiles[PARENT],joint_root_moves(state)))
        self.assertEqual(len(rows),2443)
        self.assertEqual(len({r['key'] for r in rows}),2443)
        self.assertEqual(len({r['key'] for r in rows}-self.imported.keys()),2226)
        self.assertEqual({m:sum(r['metrics']['m']==m for r in rows) for m in [20,21,22]},
            {20:204,21:865,22:1374})
        for row in rows:
            self.assertEqual(set(row['state']['partition']),set(range(10)))
            self.assertLessEqual(row['metrics']['m'],22);self.assertLessEqual(row['metrics']['guard'],24)
            self.assertGreaterEqual(row['metrics']['daily']+1e-9,126.23457023071755)

    def test_archived_endpoints_and_best_choices_are_within_the_declared_search(self):
        path=Path(str(PREFIX)+'-finalists.json')
        if not path.exists():self.skipTest('search not complete')
        data=json.loads(path.read_text(encoding='utf8'));blob=(path.parent/data['scoreArchive']['file']).read_bytes()
        self.assertEqual(hashlib.sha256(blob).hexdigest(),data['scoreArchive']['sha256'])
        rows=json.loads(gzip.decompress(blob))[PARENT]
        ids={k for stage in data['stages'] for k in stage['candidateKeys']}
        self.assertEqual(set(rows),ids|{self.anchor['key']})
        self.assertEqual(data['rootInternalSplits'],0);self.assertLessEqual(data['newStates'],5000)
        first=data['stages'][0]
        expected=list(self.search.candidates(self.anchor['state'],self.search.profiles[PARENT],joint_root_moves(self.anchor['state'])))
        self.assertEqual(set(first['candidateKeys']),{r['key'] for r in expected})
        self.assertEqual(first['available'],2443);self.assertEqual(first['considered'],2443)
        for key,row in rows.items():
            self.assertEqual(key,self.search.space.key(row['state']))
            self.assertEqual(row['state']['firstKeys'],self.anchor['state']['firstKeys'])
            m=self.search.space.memory(row['state'])
            self.assertLessEqual(m['m'],22);self.assertLessEqual(m['guard'],24)
            expanded=self.search.space.expand(row['state'])
            for region in expanded['rhymeKeys']:
                for root in range(18):
                    members={region[i] for i,r in enumerate(self.search.space.spec['finalRoots']) if r==root}
                    self.assertEqual(len(members),1)
        for layout in data['layouts']:
            self.assertEqual(layout['anchorKey'],self.anchor['key'])
            self.assertIn(layout['key'],rows);self.assertTrue(layout['metrics']['verified'])
            self.assertEqual(layout['firstKeys'],self.anchor['firstKeys'])


if __name__=='__main__':unittest.main()
