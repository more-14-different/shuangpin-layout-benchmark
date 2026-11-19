"""Independent scalar costs, own-policy ordering and published gap witnesses."""
import gzip
import json
from pathlib import Path
import sys
import unittest

import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from audit_toned_2126_r1_r2_c1_robustness import SOURCES,REFERENCE,PREFIX,SPECS,COSTS,read,key,coefficients,score_batch,analyze_grid
from analyze_single_ckt_v51_aux_order import vectors,grid

FIELDS=['firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions']
KINDS=['character','word2','word3','word4']

def scalar(row,reference,multipliers):
    costs=[c*x for c,x in zip(COSTS.values(),multipliers)]
    def effective(t):return t['motorUpperMs']+sum(c*t[f] for c,f in zip(costs,FIELDS))
    return 10*(sum(w*(effective(row['tracks'][k])/effective(reference[k]))**4 for k,w in zip(KINDS,[1,3,1,1]))/6)**.25


class WidePolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw={r['id']:r for p in SOURCES for r in json.loads(gzip.decompress(p.read_bytes()))['results']}
        cls.reference=read(REFERENCE)['references']['v52']['keytao'];cls.ref=vectors(dict(tracks=cls.reference),COSTS)

    def test_vector_costs_match_scalar_at_all_corners_and_random_points(self):
        corners=np.array([[10. if bits>>i&1 else 0. for i in range(6)] for bits in range(64)])
        points=np.vstack([corners,np.ones((1,6)),np.full((1,6),2.),np.random.default_rng(526).uniform(0,10,(10,6))])
        for label,ident,_ in SPECS:
            rows=self.raw[ident]['policies'];scores=score_batch(coefficients(rows),self.ref,points)
            for p,x in enumerate(points):
                expected=np.array([scalar(r,self.reference,x) for r in rows])
                np.testing.assert_allclose(scores[p],expected,atol=1e-11,rtol=0)
                if p==64:np.testing.assert_allclose(scores[p],[r['score'] for r in rows],atol=1e-9,rtol=0)
                if p==65:np.testing.assert_allclose(scores[p],[r['doubleScore'] for r in rows],atol=1e-9,rtol=0)

    def test_chunked_ranking_matches_direct_scalar_ranks_on_small_grid(self):
        rows=self.raw[SPECS[2][1]]['policies'];points=grid(0,2,1)
        actual=analyze_grid(rows,self.ref,points,101)
        scores=np.array([[scalar(r,self.reference,x) for r in rows] for x in points])
        for part,mask in [('all',np.ones(len(points),bool)),('positive',np.all(points>0,axis=1))]:
            vals=scores[mask]
            for i,row in enumerate(rows):
                ranks=1+(vals<vals[:,i,None]-1e-9).sum(axis=1)
                item=next(r for r in actual[part]['ranking'] if r['policy']==key(row))
                self.assertAlmostEqual(item['meanRank'],ranks.mean(),places=10)
                self.assertAlmostEqual(item['top1Rate'],np.mean(ranks==1),places=10)

    def test_complete_report_selects_top_two_and_gap_witness_reproduces(self):
        report=read(str(PREFIX)+'.json');self.assertTrue(report['complete']);self.assertEqual(len(report['results']),3)
        for result in report['results']:
            rows=self.raw[result['id']]['policies'];by={key(r):r for r in rows}
            self.assertEqual(len(by),144)
            first=by[result['selectedPolicy']];second=by[result['runnerPolicy']]
            ranking=result['grids']['main']['positive']['ranking']
            self.assertEqual(result['selectedPolicy'],ranking[0]['policy']);self.assertEqual(result['runnerPolicy'],ranking[1]['policy'])
            self.assertEqual(result['grids']['main']['positive']['points'],1000000)
            self.assertAlmostEqual(result['meanRankGap'],ranking[1]['meanRank']-ranking[0]['meanRank'],places=12)
            for name,grid_result in result['selectedVsRunner'].items():
                for part,pair in grid_result.items():
                    w=pair['worstCase'];a=scalar(first,self.reference,w['multipliers']);b=scalar(second,self.reference,w['multipliers'])
                    self.assertAlmostEqual(w['firstScore'],a,places=10);self.assertAlmostEqual(w['secondScore'],b,places=10)
                    self.assertAlmostEqual(pair['minGap'],b-a,places=10)
                    self.assertAlmostEqual(pair['firstWins']+pair['secondWins']+pair['ties'],1,places=12)
                    self.assertLessEqual(pair['minGap'],pair['medianGap']);self.assertLessEqual(pair['medianGap'],pair['maxGap'])

    def test_wide_winners_retain_independent_native_js_anchors(self):
        report=read(str(PREFIX)+'.json')
        anchors=[v for stem in ['m4-refine','r1-coupled'] for v in read(ROOT/('research/notes/2026-11-19-toned-2126-v52-'+stem+'-verification.json'))['results']]
        for r in report['results']:
            suffix=r['id'].split('-')[-1]
            matches=[v for v in anchors if v['id'].endswith(suffix) and '/'.join(v['policy'].values())==r['selectedPolicy']]
            self.assertTrue(matches,'winner needs independent full native JS replay')
            self.assertAlmostEqual(matches[0]['score'],r['selectedDefaultScore'],places=9)

    def test_range_specific_top_two_margins_match_scalar_witnesses(self):
        findings=read(str(PREFIX)+'-findings.json');report=read(str(PREFIX)+'.json')
        self.assertFalse(findings['htmlChanged'])
        c=next(r for r in report['results'] if r['label']=='C1');by={key(r):r for r in self.raw[c['id']]['policies']}
        for name,pair in findings['C1RangeComparisons'].items():
            first=by[pair['first']['policy']];second=by[pair['second']['policy']];p=pair['gaps'];w=p['worstCase']
            actual=scalar(second,self.reference,w['multipliers'])-scalar(first,self.reference,w['multipliers'])
            self.assertAlmostEqual(actual,p['minGap'],places=10)
            self.assertAlmostEqual(p['firstWins']+p['secondWins']+p['ties'],1,places=12)


if __name__=='__main__':unittest.main()
