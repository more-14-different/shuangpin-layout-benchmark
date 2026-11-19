"""Regression evidence for M21 endpoint search and native selected policies."""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from search_7e_carrier_root_v52 import PREFIX,BASE,LoadScorer,with_carrier,carrier_rhyme_moves,head_root_moves,explicit_examples
from search_cr_667_zero_carriers import CarrierSpace
from analyze_single_ckt_v51_aux_order import vectors,score_at
from rank_cr_toned_stable_policies import COSTS

def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


class SevenECarrierRootTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidates=read(str(PREFIX)+'-candidates.json');cls.summary=read(str(PREFIX)+'-summary.json')
        cls.native=read(str(PREFIX)+'-verification.json');cls.ergo=read(str(PREFIX)+'-ergonomics.json')
        cls.policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        cls.new=json.loads(gzip.decompress(Path(str(PREFIX)+'-scores.json.gz').read_bytes()))

    def test_every_new_endpoint_preserves_physical_constraints(self):
        space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs');names={a['name']:i for i,a in enumerate(space.f['atoms'])}
        self.assertEqual(len(self.new),self.candidates['newStates']);self.assertGreater(len(self.new),1000)
        self.assertEqual(sum(r['fresh'] for r in self.candidates['searchStages']),len(self.new))
        for key,row in self.new.items():
            state=row['state'];m=space.memory(state)
            self.assertEqual(space.key(state),key);self.assertEqual({f:row['metrics'][f] for f in ['m','guard','d']},m)
            self.assertLessEqual(m['m'],21);self.assertLessEqual(m['guard'],24);self.assertLessEqual(m['d'],2)
            self.assertEqual(len(state['partition']),18);self.assertEqual(set(state['partition']),set(range(10)))
            self.assertTrue(all(state['firstKeys'][names[n]]!='P' for n in ['zh','ch','sh']))
            self.assertEqual(len({state['firstKeys'][names['zero-'+n]] for n in 'AEO'}),1)

    def test_carrier_and_root_operators_preserve_parent_and_unified_aeo(self):
        space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
        state=copy.deepcopy(self.candidates['baseline']['state']);before=copy.deepcopy(state)
        names={a['name']:i for i,a in enumerate(space.f['atoms'])};aeo=[names['zero-'+n] for n in 'AEO']
        n=with_carrier(state,space,'N')
        self.assertEqual(sum(a!=b for a,b in zip(n['firstKeys'],before['firstKeys'])),3)
        self.assertEqual({n['firstKeys'][i] for i in aeo},{'N'});self.assertEqual(n['partition'],before['partition']);self.assertEqual(n['groupKeys'],before['groupKeys'])
        _,joint=next(head_root_moves(state,space))
        self.assertNotEqual(joint['firstKeys'],before['firstKeys']);self.assertNotEqual(joint['partition'],before['partition'])
        self.assertEqual(joint['groupKeys'],before['groupKeys']);self.assertEqual(state,before)
        examples=list(explicit_examples(state,space));self.assertEqual(len(examples),6)
        self.assertEqual(len({label for label,_ in examples}),6)
        for label,st in examples:
            carrier='N' if 'aeo=N' in label else 'R'
            self.assertEqual({st['firstKeys'][i] for i in aeo},{carrier})
            self.assertEqual(st['groupKeys'],before['groupKeys'])
            self.assertLessEqual(sum(a!=b for a,b in zip(st['partition'],before['partition'])),1)

    def test_new_search_kernel_loads_match_selected_native_ergonomics(self):
        scorer=LoadScorer();space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
        loads={r['id']:r for r in self.ergo['results']};raw={r['id']:r for r in self.policies['results']}
        layouts=[r for r in self.candidates['layouts'] if r['id']==BASE or r.get('key') in self.new][:4]
        self.assertGreaterEqual(len(layouts),2)
        for layout in layouts:
            actual=scorer.score(dict(state=copy.deepcopy(layout['state']),metrics=space.memory(layout['state'])))['metrics']
            selected=loads[layout['id']];fixed=next(r for r in raw[layout['id']]['policies'] if r['policy']==self.candidates['searchPolicy'])
            self.assertAlmostEqual(actual['cktV52'],fixed['score'],places=10)
            if selected['policy']==self.candidates['searchPolicy']:
                self.assertAlmostEqual(actual['maxFinger'],selected['maxFingerPeak4NativeTracks']['value'],places=12)
                self.assertAlmostEqual(actual['sameFingerOther'],selected['s2DifferentKeySameFingerRate'],places=12)

    def test_final_native_replay_and_two_cost_normalization(self):
        source={r['id']:r for r in self.policies['results']};rows={r['id']:r for r in self.summary['rows']}
        reference=vectors(self.policies['reference'],COSTS)
        self.assertEqual(len(self.native['results']),len(rows))
        for native in self.native['results']:
            raw=next(r for r in source[native['id']]['policies'] if r['policy']==native['policy'])
            self.assertEqual(len(source[native['id']]['policies']),144);self.assertAlmostEqual(native['score'],raw['score'],places=9)
            doubled=float(score_at(np.array([vectors(raw,COSTS)]),reference,np.full(6,2.))[0])
            self.assertAlmostEqual(doubled,rows[native['id']]['doubledV52'],places=10)
            for field,metric in [('word2FirstAuxPct','firstAuxRate'),('word2SecondAuxPct','secondAuxRate'),('word2SelectionPct','selectionRate')]:
                self.assertAlmostEqual(rows[native['id']][field],100*native['tracks']['word2'][metric],places=10)

    def test_strict_labels_respect_all_four_load_metrics_at_own_robust_policy(self):
        baseline=self.summary['baseline']
        for name,row in self.summary['selections'].items():
            self.assertTrue(row['budgetEligible'])
            if not name.startswith('budgetOnly'):self.assertTrue(row['noPinkyGrowth'])
            if name.startswith('strict'):
                self.assertTrue(row['noErgonomicGrowth'])
                for field in ['leftPinkyPeakPct','rightPinkyPeakPct','maxFingerPeakPct','sameFingerOtherPct']:
                    self.assertLessEqual(row[field],baseline[field]+1e-10)
            if name.endswith('TwoCost'):
                self.assertTrue(row['twoCostImprovement'])
                for field in ['cktV52','doubledV52']:self.assertLessEqual(row[field],baseline[field]+1e-10)

    def test_archival_integrity_and_production_control(self):
        status=self.native['productionStatus']
        self.assertIn(status['matchesAuditedLayout'],{r['id'] for r in self.candidates['layouts']})
        self.assertTrue(status['historicalBaselineFrozen'])
        self.assertTrue(status['id'].endswith(status['matchesAuditedLayout']))
        for doc in [self.candidates,self.summary]:
            for filename,expected in doc['sourceHashes'].items():
                self.assertEqual(hashlib.sha256((ROOT/filename).read_bytes()).hexdigest(),expected)
        self.assertEqual(self.summary['versus7eSensitivity']['mainPositive']['points'],1_000_000)
        self.assertEqual(self.summary['versus7eSensitivity']['extremePositive']['points'],1_000_000)

    def test_explicit_factorial_replays_and_documents_nonadditivity(self):
        examples={r['label']:r for r in self.summary['explicitExamples']}
        self.assertEqual(len(examples),6)
        a=examples['example:aeo=R;er=unchanged'];b=examples['example:aeo=R;er=ei']
        c=examples['example:aeo=N;er=unchanged'];d=examples['example:aeo=N;er=ei']
        self.assertGreater(c['fixedPolicyDefault'],a['fixedPolicyDefault'])
        self.assertGreater(d['fixedPolicyDefault'],a['fixedPolicyDefault'])
        self.assertLess(d['fixedPolicyDefault'],c['fixedPolicyDefault'])
        for field in ['fixedPolicyDefault','fixedPolicyDoubled']:
            interaction=d[field]-c[field]-b[field]+a[field]
            self.assertLess(interaction,0);self.assertAlmostEqual(interaction,self.summary['factorialInteraction']['ei'][field],places=12)
        scorer=LoadScorer();space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
        layouts={r['id']:r for r in self.candidates['layouts']}
        for row in examples.values():
            st=layouts[row['id']]['state'];actual=scorer.score(dict(state=st,metrics=space.memory(st)))['metrics']
            self.assertAlmostEqual(actual['cktV52'],row['fixedPolicyDefault'],places=10)
            self.assertAlmostEqual(actual['doubledV52'],row['fixedPolicyDoubled'],places=10)
            self.assertEqual(actual['m'],21);self.assertEqual(actual['guard'],24)

    def test_budget_minima_include_states_rejected_by_load_filters(self):
        pool=list(self.new.values())+[self.candidates['baseline']]
        for field in ['cktV52','doubledV52']:
            actual=min(pool,key=lambda r:r['metrics'][field])
            recorded=self.summary['fixedPolicyBudgetBestIgnoringLoads'][field]
            self.assertEqual(recorded['id'],actual['key'][:10])
            self.assertAlmostEqual(recorded['value'],actual['metrics'][field],places=12)


if __name__=='__main__':unittest.main()
