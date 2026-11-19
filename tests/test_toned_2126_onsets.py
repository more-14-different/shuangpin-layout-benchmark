"""Onset budget, compensated endpoints, exact closure and native verification."""
import dataclasses
import gzip
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from search_toned_2126_v52_onsets import Context,State,SPEC

PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52-onsets'
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))


class OnsetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.ctx=Context(ROOT.parent/'shuangpin-layout-benchmark',.085)

    def test_atoms_and_budget_are_derived_not_inherited(self):
        c=self.ctx;s=c.state(c.source['A']);self.assertTrue(c.valid(s));self.assertEqual(c.memory(s)['lower'],20)
        for name in ['q','x']:
            first=list(s.first);first[c.names.index(name)]=name.upper();t=dataclasses.replace(s,first=tuple(first))
            self.assertEqual(c.memory(t)['D'],2);self.assertEqual(c.memory(t)['guard'],21)
        first=list(s.first);first[c.names.index('zero-W')]='W';t=dataclasses.replace(s,first=tuple(first))
        self.assertEqual(c.memory(t)['D'],3);self.assertEqual(c.memory(t)['guard'],21)
        first=list(s.first);first[c.names.index('zero-A')]='N';t=dataclasses.replace(s,first=tuple(first))
        self.assertEqual(c.memory(t)['guard'],23);self.assertFalse(c.valid(t))

    def test_all_legal_single_onset_moves_and_atomic_compensation(self):
        c=self.ctx;s=c.state(c.source['A']);found=c.onset_neighbors(s)
        self.assertEqual(len(found),581)
        for unit in c.units:
            for key in c.keys:
                first=list(s.first)
                for i in unit:first[i]=key
                t=dataclasses.replace(s,first=tuple(first))
                if t!=s and c.valid(t):self.assertIn(t,found)
        for i in c.ordinary+c.wy:
            home=c.names[i].upper() if i in c.ordinary else c.names[i][-1]
            if s.first[i]==home:continue
            for unit in c.units:
                if i in unit:continue
                for key in c.keys:
                    first=list(s.first);first[i]=home
                    for j in unit:first[j]=key
                    t=dataclasses.replace(s,first=tuple(first))
                    if t!=s and c.valid(t):self.assertIn(t,found)
        self.assertTrue(any(c.memory(t)['D']==2 for t in found))
        self.assertTrue(any(m['kind']=='onset-swap' for m in found.values()))

    def test_every_final_neighborhood_is_closed_for_its_own_objective(self):
        report=read(str(PREFIX)+'.json');self.assertTrue(report['complete'])
        raw=gzip.decompress(Path(str(PREFIX)+'-scores.jsonl.gz').read_bytes()).decode()
        cache={State.load(r['state']):r for r in map(json.loads,raw.splitlines())}
        self.assertEqual(len(cache),report['uniqueFullEvaluations'])
        for route in report['routes']:
            s=State.load(route['result']['state']);options=self.ctx.joint_neighbors(s,route['Dmaximum'])
            self.assertEqual(len(options),route['passes'][-1]['neighbors'])
            field='score' if route['objective']=='default' else 'doubleScore'
            for state in options:
                self.assertIn(state,cache)
                if cache[state]['eligible']:self.assertGreaterEqual(cache[state][field]+1e-10,route['result'][field])

    def test_independent_js_scores_memory_and_key_loads(self):
        verify=read(str(PREFIX)+'-verification.json');finals=read(str(PREFIX)+'-finalists.json')
        policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        controls=read(str(PREFIX)+'-controls.json');controlled={r['id'] for r in controls['results']}
        for row in verify['results']:
            self.assertLessEqual(row['memory']['lower'],20);self.assertLessEqual(row['memory']['guard'],22)
            self.assertLessEqual(row['memory']['D'],3);self.assertEqual(row['memory']['F'],0)
            self.assertLessEqual(row['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value'],.085+1e-12)
            if row['id'] in controlled:self.assertLessEqual(row['ergonomics']['rightPinkyPeak4NativeTracks']['value'],controls['rightPinkyCeiling']+1e-12)
            original=next(l for l in finals['layouts'] if l['id']==row['id'])
            if original['policy']!=list(row['policy'].values()):original=next(p for r in policies['results'] if r['id']==row['id'] for p in r['policies'] if p['state']['policy']==list(row['policy'].values()))
            self.assertAlmostEqual(row['score'],original['score'],places=9)
            self.assertAlmostEqual(row['doubleScore'],original['doubleScore'],places=9)
            for k,t in row['ergonomics']['tracks'].items():
                self.assertAlmostEqual(sum(t['load'].values()),1,places=12)
                for key,v in t['load'].items():self.assertAlmostEqual(v,original['ergonomics'][k]['load'][key],places=12)

    def test_complete_final_policy_enumeration(self):
        policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        self.assertTrue(policies['complete']);self.assertEqual(len(policies['results']),6)
        for row in policies['results']:
            self.assertEqual(len({tuple(v['state']['policy']) for v in row['policies']}),144)
            eligible=[v for v in row['policies'] if v['eligible']]
            self.assertGreaterEqual(row['bestDefault']['score']+1e-9,min(v['score'] for v in eligible))
            self.assertGreaterEqual(row['bestDouble']['score']+1e-9,min(v['doubleScore'] for v in eligible))
            if row['id'] in ['T2126-V52-ONSET-f3fa0ab109c5','T2126-V52-ONSET-892a04a4fb54','T2126-V52-ONSET-3f67a45a43ab']:
                self.assertAlmostEqual(row['defaultRegret'],0,places=9)
                self.assertAlmostEqual(row['doubleRegret'],0,places=9)


if __name__=='__main__':unittest.main()
