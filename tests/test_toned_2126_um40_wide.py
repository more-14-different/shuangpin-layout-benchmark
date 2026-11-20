"""Search invariants for wide UM40 rhyme perturbations."""
import dataclasses
import gzip
import json
from pathlib import Path
import random
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import search_toned_2126_um40_wide as wide
from search_toned_2126_um40 import Context


class WideSearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx=Context(ROOT.parent/'shuangpin-layout-benchmark')
        cls.state=cls.ctx.state(cls.ctx.source['A'])

    def test_canonical_group_labels_preserve_every_toned_code(self):
        s=self.state;c=self.ctx
        permutation=list(reversed(range(10)))
        maps=tuple(tuple(row[permutation.index(i)] for i in range(10)) for row in s.maps)
        renamed=dataclasses.replace(s,partition=tuple(permutation[g] for g in s.partition),maps=maps)
        a=wide.canonical(s);b=wide.canonical(renamed)
        self.assertEqual(a,b);self.assertEqual(a.maps[0],tuple(range(10)))
        np.testing.assert_array_equal(c.expand(s),c.expand(a))
        self.assertEqual(wide.canonical(a),a)

    def test_each_mutation_kind_retains_onsets_and_real_row_coverage(self):
        s=wide.canonical(self.state);rng=random.Random(20261120)
        for kind in wide.MUTATIONS:
            seen=set()
            for _ in range(35):
                t=wide.propose(self.ctx,s,rng,kind=kind)
                self.assertNotEqual(t,s);self.assertTrue(self.ctx.legal(t),kind)
                self.assertEqual(t.first,s.first);seen.add(t);s=t
            self.assertGreater(len(seen),15,kind)

    def test_checkpoint_rng_roundtrip_reproduces_future_proposals(self):
        a=random.Random(123);s=wide.canonical(self.state)
        wide.propose(self.ctx,s,a)
        saved=json.loads(json.dumps(a.getstate()));b=random.Random();b.setstate(wide.nested_tuple(saved))
        for _ in range(20):
            self.assertEqual(wide.propose(self.ctx,s,a),wide.propose(self.ctx,s,b))

    def test_metropolis_and_temperature_exchange_sign(self):
        self.assertTrue(wide.accept(-.1,.01,.99))
        self.assertFalse(wide.accept(.1,.01,.5))
        self.assertTrue(wide.accept(.001,.1,.5))
        # Ordered cold/hot energies rarely exchange; inversion always does.
        self.assertFalse(wide.exchange(8.,9.,.01,.1,.5))
        self.assertTrue(wide.exchange(9.,8.,.01,.1,.99))

    def test_compact_record_keeps_scores_and_canonical_state(self):
        v=dict(state=dataclasses.asdict(self.state),score=8.9,doubleScore=8.6,memoryLower=20,memoryGuard=22,D=3,ergonomics={'large':'discard'})
        r=wide.compact(v)
        self.assertNotIn('ergonomics',r)
        self.assertEqual(r['score'],8.9);self.assertEqual(r['doubleScore'],8.6)
        self.assertEqual(wide.State.load(r['state']),wide.canonical(self.state))

    def test_crossover_really_inherits_from_two_distinct_parents(self):
        s=wide.canonical(self.state);rng=random.Random(72)
        donor=wide.propose(self.ctx,s,rng,kind='root-cycle')
        donor=dataclasses.replace(donor,maps=(donor.maps[0],tuple(reversed(donor.maps[1])),tuple(reversed(donor.maps[2]))))
        self.assertTrue(self.ctx.legal(donor))
        for _ in range(20):
            t=wide.propose(self.ctx,s,rng,kind='crossover',donor=donor)
            self.assertIn(t.partition,(s.partition,donor.partition))
            for row in (1,2):self.assertIn(t.maps[row],(s.maps[row],donor.maps[row]))
            self.assertTrue(self.ctx.legal(t))

    def test_failed_atomic_checkpoint_does_not_damage_previous_checkpoint(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'checkpoint.json';wide.atomic_checkpoint(p,{'sweep':20})
            with patch.object(Path,'replace',side_effect=OSError('interrupted replace')):
                with self.assertRaises(OSError):wide.atomic_checkpoint(p,{'sweep':40})
            self.assertEqual(json.loads(p.read_text(encoding='utf8')),{'sweep':20})

    def test_score_log_recovers_tail_and_rewinds_to_committed_boundary(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'scores.jsonl';a=b'{"score":8.8}\n';b=b'{"score":8.7}\n'
            p.write_bytes(a+b+b'{"score":')
            self.assertEqual(wide.recover_log(p),[{'score':8.8},{'score':8.7}])
            self.assertEqual(p.read_bytes(),a+b)
            self.assertEqual(wide.recover_log(p,len(a)),[{'score':8.8}])
            self.assertEqual(p.read_bytes(),a)
            self.assertTrue(list(Path(d).glob('*.uncommitted-*')))
            p.write_bytes(b'invalid\n'+a)
            with self.assertRaises(json.JSONDecodeError):wide.recover_log(p)

    def test_resume_keeps_elites_until_the_next_scheduled_refresh(self):
        s=wide.canonical(self.state);t=wide.propose(self.ctx,s,random.Random(3),kind='root-swap')
        cache={s:{'score':8.8,'doubleScore':8.5},t:{'score':8.7,'doubleScore':8.4}}
        r={'eliteStates':{f:[dataclasses.asdict(s)] for f in ('score','doubleScore')}}
        resumed=json.loads(json.dumps(r));before=wide.elite_states(resumed,cache,20)
        self.assertEqual(before['score'],[s])
        refreshed=wide.elite_states(resumed,cache,40)
        self.assertEqual(refreshed['score'][0],t)


class WideResultTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from toned_2126_v52_score_archives import score_archives
        p=Path(str(wide.PREFIX)+'.json')
        if not p.exists() or not json.loads(p.read_text(encoding='utf8'))['complete']:
            raise unittest.SkipTest('wide experiment still running')
        cls.report=json.loads(p.read_text(encoding='utf8'));cls.ctx=Context(ROOT.parent/'shuangpin-layout-benchmark');cls.cache={};cls.new=[]
        for prefix in (wide.PREVIOUS,wide.PREFIX):
            for path in score_archives(prefix):
                with gzip.open(path,'rt',encoding='utf8') as stream:
                    for line in stream:
                        v=wide.compact(json.loads(line));s=wide.State.load(v['state']);cls.cache[s]=v
                        if prefix==wide.PREFIX:cls.new.append(v)

    def test_new_archive_is_unique_and_every_layout_obeys_frozen_contract(self):
        self.assertEqual(len(self.new),self.report['newFullEvaluations'])
        self.assertEqual(len({wide.State.load(v['state']) for v in self.new}),len(self.new))
        for v in self.new:
            s=wide.State.load(v['state']);self.assertEqual(s,wide.canonical(s));self.assertTrue(self.ctx.legal(s))
            self.assertEqual(s.first,self.ctx.fixed_first);m=self.ctx.memory(s)
            self.assertEqual((v['memoryLower'],v['memoryGuard'],v['D']),(m['lower'],m['guard'],m['D']))

    def test_best_final_endpoints_close_complete_single_neighborhood(self):
        self.assertTrue(self.report['annealComplete']);self.assertTrue(self.report['polishComplete'])
        self.assertEqual(self.report['sweep'],self.report['settings']['sweeps'])
        for field in ('score','doubleScore'):
            v=self.report['best'][field];s=wide.State.load(v['state'])
            self.assertAlmostEqual(v[field],min(x[field] for x in self.cache.values()),places=9)
            for t in self.ctx.joint_neighbors(s):
                t=wide.canonical(t);self.assertIn(t,self.cache)
                self.assertGreaterEqual(self.cache[t][field]+1e-10,v[field])

    def test_supplemental_seeds_are_new_root_groupings_and_finished(self):
        from extend_toned_2126_um40_wide_basins import grouping
        from toned_2126_v52_score_archives import score_archives
        from check_toned_2126_v52_seed_neighbors import sha
        old=set()
        for path in score_archives(wide.PREVIOUS):
            with gzip.open(path,'rt',encoding='utf8') as stream:
                for line in stream:old.add(grouping(wide.State.load(json.loads(line)['state'])))
        n=self.report['novelGroupPolish'];self.assertEqual(n['sourceSha256'],sha(ROOT/'tools/extend_toned_2126_um40_wide_basins.py'))
        for field in ('score','doubleScore'):
            signatures=[grouping(wide.State.load(s['state'])) for s in n['seeds'] if s['objective']==field]
            self.assertEqual(len(signatures),4);self.assertEqual(len(set(signatures)),4)
            self.assertTrue(set(signatures).isdisjoint(old))
        for i,seed in enumerate(self.report['polishSeeds']):
            route=next(r for r in self.report['routes'] if r['name']=='basin-'+str(i));self.assertTrue(route['complete'])

    def test_independent_native_scores_and_all_144_policies(self):
        read=lambda suffix:json.loads(Path(str(wide.PREFIX)+suffix).read_text(encoding='utf8'))
        verified=read('-verification.json');audit=json.loads(gzip.decompress(Path(str(wide.PREFIX)+'-policies.json.gz').read_bytes()))
        self.assertEqual(len(audit['results']),len(read('-finalists.json')['layouts']))
        for field,anchor in [('score','bestDefault'),('doubleScore','bestDouble')]:
            self.assertAlmostEqual(min(a[anchor]['score'] for a in audit['results']),self.report['best'][field][field],places=9)
        for a in audit['results']:
            self.assertEqual(len({tuple(v['state']['policy']) for v in a['policies']}),144)
        for v in verified['results']:
            a=next(a for a in audit['results'] if a['id']==v['id'])
            row=next(r for r in a['policies'] if r['state']['policy']==list(v['policy'].values()))
            self.assertAlmostEqual(row['score'],v['score'],places=9);self.assertAlmostEqual(row['doubleScore'],v['doubleScore'],places=9)
            for kind,t in v['ergonomics']['tracks'].items():
                for key,load in t['load'].items():self.assertAlmostEqual(load,row['ergonomics'][kind]['load'][key],places=12)


if __name__=='__main__':unittest.main()
