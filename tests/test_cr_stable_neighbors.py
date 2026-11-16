"""A policy adapter changes shape positions only and keeps scoring caches isolated."""
import json
import copy
import gzip
import hashlib
import math
import subprocess
from pathlib import Path
import struct
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from explore_cr_stable_neighbors import adapt_shape_corpus,shape_permutation,StableNeighbors,PREFIX


def tiny_corpus():
    counts=dict(character=1,word2=1,word3=1,word4=1)
    h=json.dumps(dict(counts=counts)).encode()
    body=bytearray(struct.pack('<IIII',1,1,1,1))
    body+=struct.pack('<H',1)+b'c'+struct.pack('<HBdBBB',1,4,123.5,0,2,1)
    for n in [2,3,4]:
        body+=struct.pack('<'+'H'*n,*range(n))+bytes(range(1,n+1))+struct.pack('<d',987.5)+bytes(range(n))
    body+=struct.pack('<I',0xc4c0ca5e)
    return b'CKTV4COR'+struct.pack('<HHI',2,0,len(h))+h+body


class ShapePolicyAdapterTests(unittest.TestCase):
    def test_relative_ranking_inputs_keep_resolved_source_provenance(self):
        from rank_cr_toned_stable_policies import source_hashes
        path=Path('research/config/cr-toned-stability-reference.json')
        self.assertEqual(source_hashes([path]),{path.as_posix():hashlib.sha256(path.read_bytes()).hexdigest()})

    def test_recorded_states_reproduce_layout_keys_and_all_memory_budgets(self):
        self.check_recorded_states(PREFIX)

    def test_balanced_recorded_states_reproduce_layout_keys_and_all_memory_budgets(self):
        self.check_recorded_states(ROOT/'research/notes/2026-11-16-cr-balanced-followup')

    def check_recorded_states(self,prefix):
        path=Path(str(prefix)+'-finalists.json')
        if not path.exists():self.skipTest('no recorded experiment')
        bundle=json.loads(path.read_text(encoding='utf8'))
        archive=path.parent/bundle['scoreArchive']['file'];content=archive.read_bytes()
        self.assertEqual(hashlib.sha256(content).hexdigest(),bundle['scoreArchive']['sha256'])
        caches=json.loads(gzip.decompress(content))
        with tempfile.TemporaryDirectory() as temp:
            for layout in bundle['layouts']:
                s=StableNeighbors(Path(temp),layout['parent']);rows=caches[layout['parent']]
                self.assertEqual(len(rows),layout['uniqueScoredLayouts'])
                self.assertEqual(sum(r['metrics'].get('verified',False) for r in rows.values()),layout['fullyVerified'])
                for key,row in rows.items():
                    self.assertEqual(key,row['key']);self.assertEqual(key,s.space.key(row['state']))
                    m=s.space.memory(row['state']);self.assertIsNotNone(m)
                    self.assertLessEqual(m['d'],2);self.assertLessEqual(m['m'],layout['constraints']['maxM'])
                    self.assertLessEqual(m['guard'],24)
                    for field,value in m.items():self.assertEqual(row['metrics'][field],value)
                    self.assertTrue(math.isfinite(row['metrics']['ckt']))
                    self.assertGreaterEqual(row['metrics']['daily']+1e-9,layout['constraints']['dailyFloor'])

    def test_permutation_round_trip_and_slot_semantics(self):
        for order,n,baseline in [('21',2,[0,1]),('231',3,[1,0,2]),('14',4,[1,3]),('24',4,[1,3])]:
            perm=shape_permutation(order,n,baseline)
            self.assertEqual(sorted(perm),list(range(n)))
            self.assertEqual([perm[i] for i in baseline],[int(c)-1 for c in order])
            inverse=[perm.index(i) for i in range(n)]
            self.assertEqual([perm[inverse[i]] for i in range(n)],list(range(n)))

    def test_adapter_only_touches_word_shape_slots_and_rejects_double_adaptation(self):
        source=tiny_corpus();policy=dict(word2='21',word3='231',word4='14')
        target,audit=adapt_shape_corpus(source,policy)
        start=lambda b:16+struct.unpack_from('<I',b,12)[0]
        a,b=source[start(source):],target[start(target):]
        offset=16+2+1+2+1+8+2+1
        shape_indices=set()
        for n in [2,3,4]:
            shape=offset+3*n+8;shape_indices.update(range(shape,shape+n));offset=shape+n
        self.assertEqual(len(a),len(b));self.assertGreater(audit['changedWordShapes'],0)
        self.assertTrue(all(i in shape_indices for i,(x,y) in enumerate(zip(a,b)) if x!=y))
        with self.assertRaisesRegex(ValueError,'already adapted'):
            adapt_shape_corpus(target,policy)

    def test_historical_policy_reproduces_original_body_bytes(self):
        source=tiny_corpus();target,_=adapt_shape_corpus(source,dict(word2='12',word3='213',word4='24'))
        start=lambda b:16+struct.unpack_from('<I',b,12)[0]
        self.assertEqual(source[start(source):],target[start(target):])

    def test_bad_policy_or_truncated_data_is_rejected(self):
        for order in ['11','31','1','AA']:
            with self.assertRaises(ValueError):shape_permutation(order,2,[0,1])
        with self.assertRaises((ValueError,struct.error,IndexError)):
            adapt_shape_corpus(tiny_corpus()[:-3],dict(word2='21',word3='231',word4='14'))

    def test_profiles_use_current_stable_policy_and_current_comfort_anchors(self):
        with tempfile.TemporaryDirectory() as temp:
            a=StableNeighbors(Path(temp),'0a4ee7fb52');b=StableNeighbors(Path(temp),'29ce221cfe')
            self.assertEqual(a.policy,dict(word2='21',word3='231',word4='24'))
            self.assertEqual(b.policy,dict(word2='21',word3='231',word4='14'))
            self.assertEqual(a.profiles['0a4ee7fb52']['maxM'],21)
            self.assertAlmostEqual(a.profiles['0a4ee7fb52']['dailyFloor'],130.78623334482162)
            self.assertAlmostEqual(a.profiles['0a4ee7fb52']['pinkyCeiling'],.09051832782567477)
            self.assertNotEqual(a.progress['contract']['corpusSha256'],b.progress['contract']['corpusSha256'])
            self.assertNotEqual(a.cache_path,b.cache_path)
            from run_cr_anneal import atomic_json
            atomic_json(a.state_path,a.progress)
            resumed=StableNeighbors(Path(temp),'0a4ee7fb52')
            self.assertEqual(resumed.progress['contract'],a.progress['contract'])

    def test_balanced_route_protects_its_own_current_floor_and_pinky_budget(self):
        with tempfile.TemporaryDirectory() as temp:
            s=StableNeighbors(Path(temp),'f0ae939a38')
            profile=s.profiles['f0ae939a38']
            self.assertEqual(s.policy,dict(word2='21',word3='231',word4='14'))
            self.assertEqual(profile['maxM'],22)
            self.assertAlmostEqual(profile['dailyFloor'],126.23457023071755)
            self.assertAlmostEqual(profile['pinkyCeiling'],.09032422256372921)
            self.assertAlmostEqual(s.seeds['f0ae939a38']['metrics']['ckt'],9.122664475500086)

    def test_beam_requires_scored_local_alternatives_before_branch_ranking(self):
        with tempfile.TemporaryDirectory() as temp:
            s=StableNeighbors(Path(temp),'f0ae939a38')
            s.audit_seeds=lambda:None
            s.full_score=lambda item:item
            with self.assertRaisesRegex(ValueError,'run local or polish'):
                s.beam(3)

    def test_balanced_subset_export_cannot_overwrite_the_three_route_archive(self):
        result=subprocess.run([sys.executable,str(ROOT/'tools/explore_cr_stable_neighbors.py'),
            '--parents','f0ae939a38','--phase','export'],capture_output=True,text=True)
        self.assertEqual(result.returncode,2)
        self.assertIn('use --prefix',result.stderr)

    def test_daily_floor_can_be_repaired_by_a_two_step_sound_key_path(self):
        with tempfile.TemporaryDirectory() as temp:
            s=StableNeighbors(Path(temp),'f0ae939a38');seed=s.seeds['f0ae939a38']['state']
            floor=s.profiles['f0ae939a38']['dailyFloor']
            upper_only=copy.deepcopy(seed);upper_only['groupKeys'][0][2]='E'
            self.assertLess(s.space.daily(upper_only)['daily'],floor)
            lower_first=copy.deepcopy(seed);lower_first['groupKeys'][2][6]='C'
            self.assertGreaterEqual(s.space.daily(lower_first)['daily'],floor)
            combined=copy.deepcopy(lower_first);combined['groupKeys'][0][2]='E'
            self.assertGreaterEqual(s.space.daily(combined)['daily'],floor)
            self.assertEqual(s.space.memory(combined),dict(d=2,m=22,guard=24))
            self.assertTrue(s.space.key(combined).startswith('fab751bbbe'))


if __name__=='__main__':unittest.main()
