"""Constrained exact-neighborhood coverage and independent native load checks."""
import dataclasses
import gzip
import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from check_toned_2126_v52_seed_neighbors import State,neighbors,valid
from enumerate_toned_2126_v52 import competition
from toned_2126_v52_load_kernel import competition_with_loads

PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52-seed-neighbors'
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))


class SeedNeighborTests(unittest.TestCase):
    def test_intact_root_and_group_moves_cover_every_legal_single_change(self):
        report=read(str(PREFIX)+'.json')
        s=State.load(report['routes'][0]['history'][0]['state']);found=neighbors(s)
        for a in range(18):
            for g in range(10):
                p=list(s.partition);p[a]=g;t=dataclasses.replace(s,partition=tuple(p))
                if t!=s and valid(t):self.assertIn(t,found)
            for b in range(a+1,18):
                p=list(s.partition);p[a],p[b]=p[b],p[a];t=dataclasses.replace(s,partition=tuple(p))
                if t!=s and valid(t):self.assertIn(t,found)
        self.assertEqual(sum(m['kind']=='policy' for m in found.values()),143)
        self.assertTrue(all(valid(t) for t in found))
        for r,row in enumerate(s.maps):
            for a in range(10):
                for b in range(a+1,10):
                    maps=[list(x) for x in s.maps];maps[r][a],maps[r][b]=maps[r][b],maps[r][a]
                    t=dataclasses.replace(s,maps=tuple(tuple(x) for x in maps))
                    if t!=s and valid(t):self.assertIn(t,found)

    def test_load_counters_do_not_change_native_routing(self):
        codes=np.array([[0,1],[2,3],[0,4],[1,4],[3,4]],np.int64)
        rows=np.array([[2,600,2,3,1,-1,0,1,2,-1],[3,500,2,3,1,4,0,1,2,3],
                       [1,400,0,1,-1,-1,0,1,-1,-1],[2,300,2,3,1,-1,0,1,2,-1]],np.int32)
        orders=np.array([[0,1]]*4,np.int64)
        tables=(np.zeros(900),np.zeros(27000),np.zeros(27000),np.zeros(27000),np.zeros(810000),np.zeros(27000))
        original=competition(rows,codes,orders,tables,tables);actual=competition_with_loads(rows,codes,orders,tables,tables)
        for a,b in zip(original,actual[:3],strict=True):np.testing.assert_array_equal(a,b)
        self.assertEqual(actual[3].sum(),600*3+500*4+400*5+300*6)
        self.assertEqual(actual[4][:,0].sum(),600*2+500*3+400*4+300*5)

    def test_every_final_neighborhood_has_no_eligible_improvement(self):
        report=read(str(PREFIX)+'.json');self.assertTrue(report['complete'])
        rows=[json.loads(line) for line in gzip.decompress(Path(str(PREFIX)+'-scores.jsonl.gz').read_bytes()).decode().splitlines()]
        by_state={State.load(r['state']):r for r in rows}
        for route in report['routes']:
            self.assertTrue(route['complete']);anchor=State.load(route['result']['state']);field='score' if route['objective']=='default' else 'halfScore'
            covered=[by_state[s] for s in neighbors(anchor) if s in by_state]
            self.assertEqual(len(covered),route['passes'][-1]['neighbors'])
            for r in covered:
                if r['eligible']:self.assertGreaterEqual(r[field]+1e-10,route['result'][field])

    def test_all_finalist_constraints_and_original_js_semantics(self):
        report=read(str(PREFIX)+'.json');verify=read(str(PREFIX)+'-verification.json');finals=read(str(PREFIX)+'-finalists.json')
        self.assertEqual(len(verify['results']),len(finals['layouts']))
        for row in verify['results']:
            self.assertLessEqual(row['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value'],report['contract']['leftPinkyMaximum']+1e-12)
            self.assertLessEqual(row['memory']['lower'],20);self.assertLessEqual(row['memory']['guard'],22)
            self.assertEqual(row['memory']['D'],3);self.assertEqual(row['memory']['F'],0)
            source=next(r for r in finals['layouts'] if r['id']==row['id'])
            self.assertAlmostEqual(row['score'],source['score'],places=9)
            self.assertAlmostEqual(row['halfScore'],source['halfScore'],places=9)
            for k,t in row['ergonomics']['tracks'].items():
                self.assertAlmostEqual(sum(t['load'].values()),1,places=12)
                for key,value in t['load'].items():self.assertAlmostEqual(value,source['ergonomics'][k]['load'][key],places=12)


if __name__=='__main__':unittest.main()
