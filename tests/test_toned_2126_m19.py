"""Tighter memory definitions, native constraints and exact neighborhood closure."""
import dataclasses
import gzip
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from search_toned_2126_v52_m19 import Context,State,PREFIX,ARCHIVE

def read(p):return json.loads(Path(p).read_text(encoding='utf8'))


class M19Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.ctx=Context(ROOT.parent/'shuangpin-layout-benchmark')

    def test_lower_rule_cap_and_guard_cap_are_independent(self):
        c=self.ctx;c.max_guard=22;s=c.state(c.source['A']);self.assertFalse(c.valid(s))
        p=list(s.partition)
        # Move er from a four-root group into the existing ang/ei group: this
        # keeps six multiroot rules and is insufficient to reduce the lower.
        p[c.roots.index('er')]=s.partition[c.roots.index('ang')]
        self.assertEqual(c.memory(dataclasses.replace(s,partition=tuple(p)))['lower'],20)
        # Split o/ong by transferring o into the already multiroot ai group:
        # five multiroot groups, same eight association links.
        p=list(s.partition);p[c.roots.index('o')]=s.partition[c.roots.index('ai')]
        t=dataclasses.replace(s,partition=tuple(p));self.assertEqual(c.memory(t)['lower'],19)
        self.assertEqual(c.memory(t)['guard'],22);self.assertTrue(c.valid(t))
        c.max_guard=21;self.assertFalse(c.valid(t))
        # Restore ordinary q to Q, reducing both D and the association ledger.
        first=list(s.first);first[c.names.index('q')]='Q';u=dataclasses.replace(s,first=tuple(first))
        self.assertEqual(c.memory(u)['D'],2);self.assertEqual(c.memory(u)['lower'],19)
        self.assertEqual(c.memory(u)['guard'],21)
        c.max_guard=22

    def test_all_eight_routes_close_under_their_own_budget(self):
        report=read(str(PREFIX)+'.json');self.assertTrue(report['complete']);self.assertEqual(len(report['routes']),8)
        cache={}
        for archive in [ARCHIVE,Path(str(PREFIX)+'-scores.jsonl.gz')]:
            for r in map(json.loads,gzip.decompress(archive.read_bytes()).decode().splitlines()):cache[State.load(r['state'])]=r
        for route in report['routes']:
            self.ctx.max_guard=route['MguardMaximum'];state=State.load(route['result']['state'])
            self.assertTrue(self.ctx.valid(state,route['Dmaximum']))
            options=self.ctx.joint_neighbors(state,route['Dmaximum'])
            self.assertEqual(len(options),route['passes'][-1]['neighbors'])
            field='score' if route['objective']=='default' else 'doubleScore'
            for s in options:
                self.assertIn(s,cache)
                if cache[s]['eligible']:self.assertGreaterEqual(cache[s][field]+1e-10,route['result'][field])
            for s,v in cache.items():
                if v['eligible'] and self.ctx.valid(s,route['Dmaximum']):self.assertGreaterEqual(v[field]+1e-10,route['result'][field])

    def test_independent_memory_loads_and_all_policies(self):
        verify=read(str(PREFIX)+'-verification.json');finals=read(str(PREFIX)+'-finalists.json')
        policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        for p in policies['results']:self.assertEqual(len({tuple(v['state']['policy']) for v in p['policies']}),144)
        self.assertGreaterEqual(len(verify['results']),len(finals['layouts']))
        for v in verify['results']:
            m=v['memory'];self.assertLessEqual(m['lower'],19);self.assertLessEqual(m['guard'],22)
            self.assertLessEqual(m['D'],3);self.assertEqual(m['F'],0)
            self.assertLessEqual(v['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value'],.085+1e-12)
            original=next(l for l in finals['layouts'] if l['id']==v['id'])
            if original['policy']!=list(v['policy'].values()):original=next(p for r in policies['results'] if r['id']==v['id'] for p in r['policies'] if p['state']['policy']==list(v['policy'].values()))
            self.assertAlmostEqual(v['score'],original['score'],places=9);self.assertAlmostEqual(v['doubleScore'],original['doubleScore'],places=9)
            for k,t in v['ergonomics']['tracks'].items():
                self.assertAlmostEqual(sum(t['load'].values()),1,places=12)
                for key,value in t['load'].items():self.assertAlmostEqual(value,original['ergonomics'][k]['load'][key],places=12)


if __name__=='__main__':unittest.main()
