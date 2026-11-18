"""Checks for native policy enumeration and the production decision evidence."""
import gzip
import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from analyze_single_ckt_v51_aux_order import vectors,score_at
from rank_cr_toned_stable_policies import COSTS,policy_key
from audit_f19_v52_robustness import nondominated,fourth_scores
from enumerate_f19_v52_policies import competition,load_tables

PREFIX=ROOT/'research/notes/2026-11-19-f19-v52-production-audit'
def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


class F19V52AuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        cls.audit=read(str(PREFIX)+'-robustness.json')
        cls.ergo=read(str(PREFIX)+'-ergonomics.json')
        cls.native=read(str(PREFIX)+'-verification.json')

    def test_default_ranking_uses_each_own_full_policy_space(self):
        values=[];reference=vectors(self.policies['reference'],COSTS)
        for layout in self.policies['results']:
            self.assertEqual(len({policy_key(r['policy']) for r in layout['policies']}),144)
            a=np.asarray([vectors(r,COSTS) for r in layout['policies']])
            scores=score_at(a,reference,np.ones(6))
            for row,score in zip(layout['policies'],scores,strict=True):self.assertAlmostEqual(row['score'],score,places=10)
            values.append((float(scores.min()),layout['id']))
        self.assertEqual([x[1] for x in sorted(values)[:2]],['f19a0ad1dc','2eb6eb060e'])

    def test_nonnegative_cost_dominance_and_batch_normalization(self):
        a=np.ones((3,4,7));a[1]*=2;a[2,0,0]=.5;a[2,1,0]=2
        self.assertEqual(nondominated(a).tolist(),[0,2])
        points=np.array([[0,0,0,0,0,0],[.5]*6,[1]*6,[10]*6],float)
        for i,p in enumerate(points):
            expected=score_at(a,a[0],p)
            actual=10*fourth_scores(a,a[0],points[i:i+1])[0]**.25
            np.testing.assert_allclose(actual,expected,rtol=1e-13)

    def test_fixed_half_cost_counterexample_is_real(self):
        fixed=[]
        source={r['id']:r for r in self.policies['results']}
        for selection in self.audit['results']:
            fixed.append(source[selection['id']]['policies'][selection['selected']['policyIndex']])
        scores=score_at(np.array([vectors(r,COSTS) for r in fixed]),vectors(self.policies['reference'],COSTS),np.full(6,.5))
        idx=next(i for i,r in enumerate(self.audit['results']) if r['id']=='f19a0ad1dc')
        self.assertGreater(scores[idx],scores.min()+1e-9)
        self.assertFalse(self.audit['productionGatePassed'])
        self.assertEqual(policy_key(self.audit['f19Selected']['policy']),'21/213/14')

    def test_native_competition_keeps_shared_word2_word4_pool(self):
        # Two equal main codes compete across word lengths; only the lower-
        # frequency phrase appends an auxiliary key. This exercises real routing.
        rows=np.array([[1,300,4,0,1,2,3,8,21,-1,-1],[3,200,4,0,1,2,3,0,4,8,14]],np.int32)
        physical=np.arange(80,dtype=np.int64)%26
        orders=np.array([[0,1,0],[0,1,0],[0,1,2],[0,3,0]],np.int64)
        tables=load_tables(ROOT/'tools/ckt_v4_upstream_role_tables.json','tables')
        # Four/five-key errors are not needed for the asserted key-length facts.
        zeros=tuple(np.zeros_like(x) for x in tables)
        totals,weights,counts,loads,transitions=competition(rows,physical,orders,10,tables,zeros,True)
        self.assertEqual(totals[1,7]/weights[1],4)
        self.assertEqual(totals[3,7]/weights[3],5)
        self.assertEqual(totals[3,1]/weights[3],1)
        self.assertEqual(int(counts.sum()),2)
        self.assertEqual(loads.sum(),300*4+200*5)

    def test_selected_loads_and_independent_native_components(self):
        by_id={r['id']:r for r in self.ergo['results']}
        for row in self.ergo['results']:
            for track in row['tracks'].values():
                self.assertAlmostEqual(sum(track['load'].values()),1,places=12)
                self.assertAlmostEqual(sum(track['finger']),1,places=12)
        for check in self.native['results']:
            source=next(r for r in self.policies['results'] if r['id']==check['id'])
            row=next(r for r in source['policies'] if r['policy']==check['policy'])
            self.assertAlmostEqual(check['score'],row['score'],places=9)
            if check['policy']==by_id[check['id']]['policy']:
                for kind in ['character','word2','word3','word4']:
                    for key,value in by_id[check['id']]['tracks'][kind]['load'].items():
                        self.assertAlmostEqual(check['ergonomics']['tracks'][kind]['load'][key],value,places=12)
        memories={r['id']:r for r in self.native['memories']}
        self.assertEqual([memories['f19a0ad1dc'][k] for k in ['lower','guard','D']],[24,25,2])
        self.assertEqual([memories['current-production'][k] for k in ['lower','guard','D']],[21,23,1])


if __name__=='__main__':unittest.main()
