"""667 is the actual starting center, with complete coupled and adjacent coverage."""
import copy
import gzip
import hashlib
import itertools
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from explore_cr_667_neighbors import PARENT,PREFIX,load_sources
from explore_cr_stable_neighbors import StableNeighbors
from explore_cr_frontier_followup import local_moves,coupled_moves,paired_moves
from run_cr_anneal import atomic_json


class Neighbors667Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.source,cls.anchor,cls.imported,_=load_sources()
        cls.search=StableNeighbors(Path(cls.temp.name),PARENT,anchor=cls.anchor)

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def test_requested_667_is_the_seed_and_reverting_to_f0_is_rejected(self):
        s=self.search
        self.assertTrue(s.seeds[PARENT]['key'].startswith('667610a3fc'))
        self.assertAlmostEqual(s.seeds[PARENT]['metrics']['ckt'],9.12083189392039)
        self.assertAlmostEqual(s.profiles[PARENT]['dailyFloor'],126.23457023071755)
        atomic_json(s.state_path,s.progress)
        resumed=StableNeighbors(Path(self.temp.name),PARENT,anchor=self.anchor)
        self.assertEqual(resumed.seeds[PARENT]['key'],s.seeds[PARENT]['key'])
        with self.assertRaisesRegex(ValueError,'changed experiment'):
            StableNeighbors(Path(self.temp.name),PARENT)

    def test_pinning_cannot_change_the_auxiliary_policy_or_budgets(self):
        bad=copy.deepcopy(self.anchor);bad['constraints']['maxM']=23
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError,'policy or constraints'):
                StableNeighbors(Path(temp),PARENT,anchor=bad)

    def test_recorded_neighborhoods_are_complete_at_the_requested_center(self):
        path=Path(str(PREFIX)+'-finalists.json')
        if not path.exists():self.skipTest('search still running')
        data=json.loads(path.read_text(encoding='utf8'));layout=data['layouts'][0]
        content=(path.parent/data['scoreArchive']['file']).read_bytes()
        self.assertEqual(hashlib.sha256(content).hexdigest(),data['scoreArchive']['sha256'])
        rows=json.loads(gzip.decompress(content))[PARENT]
        self.assertEqual(data['sourceContract']['pinnedCenterKey'],self.anchor['key'])
        self.assertEqual(layout['anchorKey'],self.anchor['key'])
        self.assertEqual(data['newStates'],len(set(rows)-set(self.imported)))
        s=self.search;state=self.anchor['state'];profile=s.profiles[PARENT]
        local=list(s.candidates(state,profile,local_moves(state,s.space)))
        self.assertEqual(len(local),271)
        self.assertTrue({r['key'] for r in local}<=set(rows))
        near=sorted([rows[r['key']] for r in local if r['key']!=self.anchor['key']],key=lambda r:r['metrics']['ckt'])[:20]
        coupled=list(s.candidates(state,profile,itertools.chain(paired_moves(state,near),coupled_moves(state,s.space))))
        stage=next(r for r in layout['rounds'] if r['phase']=='coupled')['profiles'][PARENT]
        self.assertEqual(stage['available'],len(coupled));self.assertEqual(stage['considered'],len(coupled))
        self.assertAlmostEqual(stage['before'],self.anchor['rustScore'])
        self.assertTrue({r['key'] for r in coupled}<=set(rows))
        self.assertEqual(data['coverage'][0]['count'],1099)
        self.assertEqual(set(data['coverage'][0]['candidateKeys']),{r['key'] for r in coupled})
        beam=next(r for r in layout['rounds'] if r['phase']=='beam')
        self.assertEqual(len(beam['branchKeys']),10)
        moves=(('branch:'+key+'/'+label,state) for key in beam['branchKeys'] for label,state in local_moves(rows[key]['state'],s.space))
        adjacent=list(s.candidates(state,profile,moves))
        self.assertEqual(len(adjacent),2914)
        self.assertEqual(beam['profiles'][PARENT]['considered'],len(adjacent))
        self.assertAlmostEqual(beam['profiles'][PARENT]['before'],self.anchor['rustScore'])
        self.assertTrue({r['key'] for r in adjacent}<=set(rows))
        self.assertEqual(set(data['coverage'][1]['candidateKeys']),{r['key'] for r in adjacent})
        self.assertEqual(data['coverage'][1]['initialRhymeJoint'],691)
        self.assertEqual(data['coverage'][1]['maxChangedVariables'],4)
        self.assertEqual(data['importedStates'],3542)
        for key,row in rows.items():
            self.assertEqual(key,s.space.key(row['state']))
            memory=s.space.memory(row['state'])
            self.assertLessEqual(memory['d'],2);self.assertLessEqual(memory['m'],22);self.assertLessEqual(memory['guard'],24)
            self.assertGreaterEqual(row['metrics']['daily']+1e-9,profile['dailyFloor'])

    def test_independent_macro_comparison_uses_667_as_its_baseline(self):
        path=Path(str(PREFIX)+'-verification.json')
        if not path.exists():self.skipTest('verification not complete')
        data=json.loads(path.read_text(encoding='utf8'))
        self.assertEqual(data['centerKey'],self.anchor['key'])
        self.assertAlmostEqual(data['before']['ckt'],9.12083189392039)
        self.assertAlmostEqual(data['macro']['daily|native-punctuation']['score'],data['after']['daily'])
        self.assertTrue(data['publishedHtmlUnchanged'])
        self.assertEqual(data['htmlSha256'],hashlib.sha256((ROOT/'a7_CKT_R11.html').read_bytes()).hexdigest())
        self.assertAlmostEqual(data['afterNative']['score'],data['after']['ckt'])


if __name__=='__main__':unittest.main()
