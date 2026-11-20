"""Fixed UM40 onset import and complete toned rhyme endpoint guards."""
import dataclasses
import gzip
import json
from pathlib import Path
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from search_toned_2126_um40 import Context,State,ROOT as SEARCH_ROOT,PREFIX,select_final_route

class UM40ResumeTests(unittest.TestCase):
    def test_incomplete_final_route_is_resumed_even_if_best_score_is_equal(self):
        value=dict(score=8.8,doubleScore=8.5)
        routes=[dict(name='final-score-1',objective='score',final=True,complete=False,result=value)]
        self.assertEqual(select_final_route(routes,'score',value),('final-score-1',value))
    def test_better_recenter_gets_fresh_name_instead_of_completed_route_collision(self):
        routes=[dict(name='final-score-1',objective='score',final=True,complete=True,result=dict(score=8.9))]
        new=dict(score=8.8);name,value=select_final_route(routes,'score',new)
        self.assertNotEqual(name,'final-score-1');self.assertIs(value,new)
        self.assertIsNone(select_final_route(routes,'score',dict(score=9.0)))

class UM40BoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.ctx=Context(ROOT.parent/'shuangpin-layout-benchmark')
    def test_three_originals_have_one_exact_initial_layout(self):
        c=self.ctx;self.assertEqual(len(c.onset_source['sourceIds']),3)
        self.assertEqual(c.onset_source['initialMap']['Y'],c.onset_source['initialMap']['YU'])
        s=c.state(c.source['A']);self.assertEqual(c.memory(s)['D'],3)
        self.assertEqual(s.first[c.names.index('zh')],'W');self.assertEqual(s.first[c.names.index('zero-Y')],'S')
    def test_onset_mutation_is_rejected_and_neighbors_keep_all_first_keys(self):
        c=self.ctx;s=c.state(c.source['A']);self.assertTrue(c.valid(s))
        first=list(s.first);first[c.names.index('zero-Y')]='W'
        self.assertFalse(c.valid(dataclasses.replace(s,first=tuple(first))))
        neighbors=c.joint_neighbors(s)
        self.assertGreater(len(neighbors),200)
        for t in neighbors:
            self.assertEqual(t.first,s.first);self.assertTrue(c.legal(t))
            self.assertLessEqual(c.memory(t)['lower'],22);self.assertLessEqual(c.memory(t)['guard'],22)
    def test_every_token_keeps_the_frozen_initial_assignment(self):
        c=self.ctx;s=c.state(c.source['A']);codes=c.expand(s)
        self.assertEqual(len(codes),1407)
        for row,atom in zip(codes,c.token_atoms):self.assertEqual(chr(int(row[0])+65),c.fixed_first[atom])
    def test_no_unrequested_cap_on_multiroot_group_count(self):
        c=self.ctx;s=c.state(c.source['A']);found=[]
        for root in range(18):
            for group in range(10):
                p=list(s.partition);p[root]=group;t=dataclasses.replace(s,partition=tuple(p))
                if set(p)==set(range(10)) and c.memory(t)['lower']>20 and c.legal(t):found.append(t)
        self.assertTrue(found,'legal seven-multiroot states must remain searchable')


class UM40ResultTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from toned_2126_v52_score_archives import score_archives
        cls.ctx=Context(ROOT.parent/'shuangpin-layout-benchmark')
        cls.report=json.loads(Path(str(PREFIX)+'.json').read_text(encoding='utf8'));cls.cache={}
        for path in score_archives(PREFIX):
            with gzip.open(path,'rt',encoding='utf8') as stream:
                for line in stream:
                    row=json.loads(line);cls.cache[State.load(row['state'])]=row
    def test_every_score_retains_all_initial_atoms_and_actual_memory(self):
        self.assertTrue(self.report['complete']);self.assertEqual(len(self.cache),self.report['newFullEvaluations'])
        for state,value in self.cache.items():
            self.assertEqual(state.first,self.ctx.fixed_first);self.assertTrue(self.ctx.valid(state))
            actual=self.ctx.memory(state)
            self.assertEqual(actual['D'],3);self.assertEqual(value['memoryLower'],actual['lower']);self.assertEqual(value['memoryGuard'],22)
    def test_final_objectives_are_closed_in_complete_single_neighborhood(self):
        finals=[r for r in self.report['routes'] if r.get('final')]
        for field in ['score','doubleScore']:
            route=min((r for r in finals if r['objective']==field),key=lambda r:r['result'][field]);value=route['result']
            options=self.ctx.joint_neighbors(State.load(value['state']))
            self.assertEqual(len(options),route['passes'][-1]['neighbors'])
            for s in options:
                self.assertIn(s,self.cache);self.assertGreaterEqual(self.cache[s][field]+1e-10,value[field])
            self.assertAlmostEqual(value[field],min(r[field] for r in self.cache.values()),places=9)
    def test_independent_native_js_and_144_policy_anchors(self):
        read=lambda suffix:json.loads(Path(str(PREFIX)+suffix).read_text(encoding='utf8'))
        verified=read('-verification.json');bundle=read('-finalists.json')
        audit=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        for a in audit['results']:self.assertEqual(len({tuple(r['state']['policy']) for r in a['policies']}),144)
        for v in verified['results']:
            layout=next(l for l in bundle['layouts'] if l['id']==v['id']);self.assertEqual(layout['firstKeys'],dict(zip(self.ctx.names,self.ctx.fixed_first)))
            self.assertEqual(v['memory']['D'],3);self.assertLessEqual(v['memory']['lower'],22);self.assertEqual(v['memory']['guard'],22)
            values=next(a for a in audit['results'] if a['id']==v['id'])['policies']
            row=next(r for r in values if r['state']['policy']==list(v['policy'].values()))
            self.assertAlmostEqual(row['score'],v['score'],places=9);self.assertAlmostEqual(row['doubleScore'],v['doubleScore'],places=9)
            for kind,t in v['ergonomics']['tracks'].items():
                for k,load in t['load'].items():self.assertAlmostEqual(load,row['ergonomics'][kind]['load'][k],places=12)

if __name__=='__main__':unittest.main()
