"""M4 coupled endpoint coverage, exact local closure and independent scoring."""
import dataclasses
import gzip
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from refine_toned_2126_v52_m4 import Context,State,PREFIX,ARCHIVES,M19,root_key_pairs

def read(p):return json.loads(Path(p).read_text(encoding='utf8'))


class M4Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx=Context(ROOT.parent/'shuangpin-layout-benchmark')
        cls.report=read(str(PREFIX)+'.json');cls.seed=State.load(cls.report['baseline']['state'])
        cls.cache={}
        for archive in ARCHIVES+[Path(str(PREFIX)+'-scores.jsonl.gz')]:
            with gzip.open(archive,'rt',encoding='utf8') as stream:
                for line in stream:
                    row=json.loads(line);row['eligible']=True;cls.cache[State.load(row['state'])]=row
        for result in json.loads(gzip.decompress(Path(str(M19)+'-policies.json.gz').read_bytes()))['results']:
            for row in result['policies']:
                row['eligible']=True;cls.cache[State.load(row['state'])]=row

    def test_tighter_budget_and_actual_coverage(self):
        c=self.ctx;s=self.seed;self.assertTrue(c.legal(s));self.assertEqual(c.memory(s)['lower'],18)
        # Splitting unified A/E/O increases the real carrier rule count.
        first=list(s.first);first[c.names.index('zero-E')]='F'
        self.assertFalse(c.valid(dataclasses.replace(s,first=tuple(first))))
        # The historical M19 double champion is outside this stricter lower cap.
        old=next(l for l in read(str(M19)+'-finalists.json')['layouts'] if l['id']=='T2126-V52-M19-eaf89093e11f')
        self.assertFalse(c.valid(c.state(old)))

    def test_coupled_moves_have_full_scores_and_allow_coverage_repair(self):
        c=self.ctx;s=self.seed;found=root_key_pairs(c,s)
        stage=next(r for r in self.report['stages'] if r['name']=='M4-complete-root-key-couplings')
        self.assertEqual(len(found),stage['states']);repaired=0
        for t in found:
            self.assertTrue(c.legal(t));self.assertIn(t,self.cache)
            self.assertNotEqual(t.partition,s.partition);self.assertNotEqual(t.maps,s.maps)
            if not c.legal(dataclasses.replace(t,maps=s.maps)):repaired+=1
        self.assertGreater(repaired,0,'must cover paths blocked by a single-step occupied-key guard')
        # Independently enumerate a specific two-root swap crossed with every
        # touched-group row swap, to guard against missing an entire operator.
        a,b=c.roots.index('ai'),c.roots.index('o')
        partition=list(s.partition);partition[a],partition[b]=partition[b],partition[a]
        for row in range(3):
            for group in {s.partition[a],s.partition[b]}:
                for other in range(10):
                    maps=[list(r) for r in s.maps];maps[row][group],maps[row][other]=maps[row][other],maps[row][group]
                    t=dataclasses.replace(s,partition=tuple(partition),maps=tuple(tuple(r) for r in maps))
                    if t.maps!=s.maps and c.legal(t):self.assertIn(t,found)

    def test_each_route_closes_and_is_best_in_shared_records(self):
        self.assertTrue(self.report['complete']);self.assertEqual(len(self.report['routes']),2)
        self.assertEqual(self.report['contract']['pinkyConstraint'],'none')
        for route in self.report['routes']:
            c=self.ctx;field=route['objective'];value=route['result'];s=State.load(value['state']);self.assertTrue(c.legal(s))
            neighbors=c.joint_neighbors(s,2);self.assertEqual(len(neighbors),route['passes'][-1]['neighbors'])
            for t in neighbors:self.assertIn(t,self.cache)
            for t,r in self.cache.items():
                if r['eligible'] and c.valid(t) and max(v['rightPinky'] for v in r['ergonomics'].values())<=route['rightPinkyMaximum']+1e-12:
                    self.assertGreaterEqual(r[field]+1e-10,value[field])

    def test_all_policies_and_independent_js_match(self):
        finals=read(str(PREFIX)+'-finalists.json');verify=read(str(PREFIX)+'-verification.json')
        audit=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        self.assertEqual(len(audit['results']),len(finals['layouts']))
        for p in audit['results']:
            self.assertEqual(len({tuple(v['state']['policy']) for v in p['policies']}),144)
            eligible=[v for v in p['policies'] if v['eligible'] and max(t['rightPinky'] for t in v['ergonomics'].values())<=p['rightPinkyMaximum']+1e-12]
            self.assertAlmostEqual(p['bestDefault']['score'],min(v['score'] for v in eligible),places=10)
            self.assertAlmostEqual(p['bestDouble']['score'],min(v['doubleScore'] for v in eligible),places=10)
        for v in verify['results']:
            self.assertLessEqual(v['memory']['lower'],18);self.assertLessEqual(v['memory']['guard'],21)
            self.assertLessEqual(v['memory']['D'],2);self.assertEqual(v['memory']['F'],0)
            self.assertLessEqual(v['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value'],1.+1e-12)
            p=next(p for p in audit['results'] if p['id']==v['id'])
            r=next(r for r in p['policies'] if r['state']['policy']==list(v['policy'].values()))
            self.assertAlmostEqual(v['score'],r['score'],places=9);self.assertAlmostEqual(v['doubleScore'],r['doubleScore'],places=9)
            for kind,t in v['ergonomics']['tracks'].items():
                for key,value in t['load'].items():self.assertAlmostEqual(value,r['ergonomics'][kind]['load'][key],places=12)


if __name__=='__main__':unittest.main()
