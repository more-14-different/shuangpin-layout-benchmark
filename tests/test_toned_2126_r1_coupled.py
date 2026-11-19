"""R1 compound closure, intermediate budget repair and portable score rows."""
import dataclasses
import gzip
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from refine_toned_2126_v52_r1_coupled import Context,State,PREFIX,load_cache,neighborhoods
from toned_2126_v52_score_archives import score_archives

def read(p):return json.loads(Path(p).read_text(encoding='utf8'))


class R1CoupledTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx=Context(ROOT.parent/'shuangpin-layout-benchmark')
        cls.report=read(str(PREFIX)+'.json');cls.cache=load_cache()
        for archive in score_archives(PREFIX):
            with gzip.open(archive,'rt',encoding='utf8') as stream:
                for line in stream:
                    r=json.loads(line);cls.cache[State.load(r['state'])]=r

    def test_onset_can_compensate_a_root_move_over_the_lower_budget(self):
        c=self.ctx;s=State.load(self.report['baseline']['state'])
        part=list(s.partition);part[c.roots.index('er')]=part[c.roots.index('e')]
        root_only=dataclasses.replace(s,partition=tuple(part))
        self.assertEqual(c.memory(root_only)['lower'],19);self.assertFalse(c.valid(root_only))
        first=list(s.first);first[c.names.index('l')]='L';first[c.names.index('zero-Y')]='W'
        endpoint=dataclasses.replace(root_only,first=tuple(first))
        self.assertEqual(c.memory(endpoint)['lower'],18);self.assertEqual(c.memory(endpoint)['guard'],20)
        self.assertTrue(c.legal(endpoint));self.assertIn(endpoint,self.cache)

    def test_published_default_is_closed_under_the_complete_defined_union(self):
        self.assertTrue(self.report['complete']);self.assertEqual(self.report['contract']['pinkyConstraint'],'none')
        route=self.report['routes'][0];self.assertTrue(route['complete']);value=route['result'];s=State.load(value['state'])
        moves,counts=neighborhoods(self.ctx,s)
        self.assertEqual(counts,route['passes'][-1]['counts'])
        for t in moves:
            self.assertIn(t,self.cache);self.assertGreaterEqual(self.cache[t]['score']+1e-10,value['score'])
        for t,r in self.cache.items():
            if self.ctx.valid(t):self.assertGreaterEqual(r['score']+1e-10,value['score'])

    def test_score_parts_round_trip_to_the_original_aggregate(self):
        metadata=read(str(PREFIX)+'-scores-index.json');raw=[]
        for part in metadata['parts']:
            p=ROOT/part['file'];self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),part['sha256'])
            data=gzip.decompress(p.read_bytes());self.assertEqual(len(data.splitlines()),part['rows']);raw.append(data)
            self.assertLessEqual(part['rows'],20000)
        self.assertEqual(metadata['rows'],self.report['newFullEvaluations'])
        digest=hashlib.sha256(b''.join(raw)).hexdigest()
        self.assertEqual(digest,metadata['uncompressedSha256']);self.assertEqual(metadata['aggregateSha256'],self.report['scoresSha256'])

    def test_all_policies_and_independent_native_checks(self):
        bundle=read(str(PREFIX)+'-finalists.json');verified=read(str(PREFIX)+'-verification.json')
        audit=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        self.assertEqual(len(audit['results']),len(bundle['layouts']))
        for a in audit['results']:
            self.assertEqual(len({tuple(r['state']['policy']) for r in a['policies']}),144)
            self.assertEqual(a['eligiblePolicies'],144)
            self.assertAlmostEqual(a['bestDefault']['score'],min(r['score'] for r in a['policies']),places=10)
            self.assertAlmostEqual(a['bestDouble']['score'],min(r['doubleScore'] for r in a['policies']),places=10)
        for v in verified['results']:
            m=v['memory'];self.assertLessEqual(m['lower'],18);self.assertLessEqual(m['guard'],21)
            self.assertLessEqual(m['D'],2);self.assertEqual(m['F'],0)
            a=next(a for a in audit['results'] if a['id']==v['id'])
            r=next(r for r in a['policies'] if r['state']['policy']==list(v['policy'].values()))
            self.assertAlmostEqual(v['score'],r['score'],places=9);self.assertAlmostEqual(v['doubleScore'],r['doubleScore'],places=9)
            for kind,t in v['ergonomics']['tracks'].items():
                for key,value in t['load'].items():self.assertAlmostEqual(value,r['ergonomics'][kind]['load'][key],places=12)


if __name__=='__main__':unittest.main()
