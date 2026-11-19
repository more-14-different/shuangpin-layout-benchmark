"""R2 unified-carrier coverage, endpoint closure and native verification."""
import dataclasses
import gzip
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from refine_toned_2126_v52_r2 import Context,State,PREFIX,load_cache,carrier_state,carrier_policy_moves,carrier_root_moves
from toned_2126_v52_score_archives import score_archives
from refine_toned_2126_v52_r1_coupled import root_changes

def read(p):return json.loads(Path(p).read_text(encoding='utf8'))


class R2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx=Context(ROOT.parent/'shuangpin-layout-benchmark');cls.report=read(str(PREFIX)+'.json')
        cls.cache=load_cache()
        for p in score_archives(PREFIX):
            with gzip.open(p,'rt',encoding='utf8') as stream:
                for line in stream:
                    row=json.loads(line);cls.cache[State.load(row['state'])]=row

    def test_all_21_carriers_times_144_policies_and_explicit_n_are_scored(self):
        c=self.ctx;s=State.load(self.report['baseline']['state']);moves=carrier_policy_moves(c,s)
        self.assertEqual(len(moves),21*144)
        for t in moves:self.assertIn(t,self.cache)
        for key in c.keys:
            states=[t for t in moves if all(t.first[i]==key for i in c.aeo)]
            self.assertEqual(len(states),144)
            summary=self.report['carrierScreen'][key]
            self.assertAlmostEqual(summary['bestDouble']['doubleScore'],min(self.cache[t]['doubleScore'] for t in states),places=10)
        direct=carrier_state(c,s,'N');self.assertIn(direct,moves)
        self.assertEqual(c.memory(direct),c.memory(s));self.assertTrue(c.legal(direct))
        self.assertEqual(direct.partition,s.partition);self.assertEqual(direct.maps,s.maps)

    def test_n_carrier_crosses_every_legal_intact_root_move(self):
        c=self.ctx;s=State.load(self.report['baseline']['state']);n=carrier_state(c,s,'N');found=carrier_root_moves(c,s)
        for partition in root_changes(s):
            t=dataclasses.replace(n,partition=partition)
            if c.legal(t):self.assertIn(t,found);self.assertIn(t,self.cache)
        stage=next(r for r in self.report['stages'] if r['name']=='R2-carrier-plus-one-root-change')
        self.assertEqual(stage['states'],len(found))

    def test_both_objectives_close_and_keep_actual_memory_budget(self):
        self.assertTrue(self.report['complete']);self.assertEqual(len(self.report['routes']),2)
        for route in self.report['routes']:
            value=route['result'];s=State.load(value['state']);self.assertTrue(self.ctx.legal(s));self.assertTrue(route['complete'])
            self.assertLessEqual(value['memoryLower'],18);self.assertLessEqual(value['memoryGuard'],21);self.assertLessEqual(value['D'],2)
            moves=self.ctx.joint_neighbors(s,2);self.assertEqual(len(moves),route['passes'][-1]['neighbors'])
            for t in moves:self.assertIn(t,self.cache)
            for t,r in self.cache.items():
                if self.ctx.valid(t) and (route['name']!='double-N-carrier' or all(t.first[i]=='N' for i in self.ctx.aeo)):
                    self.assertGreaterEqual(r['doubleScore']+1e-10,value['doubleScore'])

    def test_full_policies_and_independent_js(self):
        audit=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        verified=read(str(PREFIX)+'-verification.json');finals=read(str(PREFIX)+'-finalists.json')
        self.assertEqual(len(audit['results']),len(finals['layouts']))
        for p in audit['results']:
            self.assertEqual(len({tuple(v['state']['policy']) for v in p['policies']}),144)
            self.assertAlmostEqual(p['bestDouble']['score'],min(v['doubleScore'] for v in p['policies']),places=10)
        for v in verified['results']:
            self.assertLessEqual(v['memory']['lower'],18);self.assertLessEqual(v['memory']['guard'],21)
            self.assertLessEqual(v['memory']['D'],2);self.assertEqual(v['memory']['F'],0)
            p=next(p for p in audit['results'] if p['id']==v['id'])
            row=next(r for r in p['policies'] if r['state']['policy']==list(v['policy'].values()))
            self.assertAlmostEqual(v['score'],row['score'],places=9);self.assertAlmostEqual(v['doubleScore'],row['doubleScore'],places=9)
            for k,t in v['ergonomics']['tracks'].items():
                for key,load in t['load'].items():self.assertAlmostEqual(load,row['ergonomics'][k]['load'][key],places=12)


if __name__=='__main__':unittest.main()
