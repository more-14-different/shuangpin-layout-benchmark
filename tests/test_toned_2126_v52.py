"""Shared native routing, full-grid counterexamples and publication evidence."""
import gzip
import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from enumerate_toned_2126_v52 import competition,balanced
from analyze_single_ckt_v51_aux_order import vectors,score_at
from rank_cr_toned_stable_policies import COSTS,policy_key

PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52'
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))


class Native2126Tests(unittest.TestCase):
    def test_soft_page_preserves_frequency_order_after_length_fill(self):
        rows=np.zeros((9,10),np.int32);rows[:,0]=1;rows[7,0]=2;rows[8,0]=3
        result=balanced(np.arange(9,dtype=np.int64),9,rows)
        self.assertEqual(result.tolist(),[0,1,2,3,7,8,4,5,6])

    def test_three_word_residual_competes_with_two_and_four_word(self):
        # ABC wins at three keys; the other ABC -> ABCD shares the native word
        # pool with two/four-word ABCD. Equal first shapes force a sixth key.
        codes=np.array([[0,1],[2,3],[0,4],[1,4],[3,4]],np.int64)
        rows=np.array([[2,600,2,3,1,-1,0,1,2,-1],
                       [3,500,2,3,1,4,0,1,2,3],
                       [1,400,0,1,-1,-1,0,1,-1,-1],
                       [2,300,2,3,1,-1,0,1,2,-1]],np.int32)
        orders=np.array([[0,1]]*4,np.int64)
        tables=(np.zeros(900),np.zeros(27000),np.zeros(27000),np.zeros(27000),np.zeros(810000),np.zeros(27000))
        totals,weights,counts=competition(rows,codes,orders,tables,tables)
        self.assertEqual(totals[3,7]/weights[3],4)
        self.assertEqual(totals[1,7]/weights[1],5)
        self.assertEqual(totals[2,7],600*3+300*6)
        self.assertEqual(counts.tolist(),[0,1,2,1])

    def test_all_policies_reprice_and_native_anchors_match(self):
        s=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        self.assertTrue(s['complete']);self.assertEqual(len(s['results']),25)
        reference=vectors(s['reference'],COSTS)
        publication=read(ROOT/'research/notes/2026-11-18-ckt-v52-all-schemes.json')['schemes']
        ids=['T2126-POLISHED-8832091','T2126-ANNEAL-8842639','T2126-FULL26-8871530','T2126-QEMPTY-8890382','T2126-QEMPTY-ANNEAL-8879093','T2126-QEMPTY-SWAP-8918781']
        for layout in s['results']:
            self.assertEqual(len({policy_key(p['policy']) for p in layout['policies']}),144)
            a=np.array([vectors(p,COSTS) for p in layout['policies']])
            actual=score_at(a,reference,np.ones(6))
            np.testing.assert_allclose(actual,[p['score'] for p in layout['policies']],atol=1e-10,rtol=0)
            if layout['id'] in 'ABCDEF':
                anchor=publication[ids[ord(layout['id'])-65]]
                policy=anchor['contract']['wordAuxiliaryPolicy']
                value=next(p for p in layout['policies'] if p['policy']==policy)
                self.assertAlmostEqual(value['score'],anchor['v52']['score'],places=9)

    def test_worst_cases_recompute_with_all_rival_policies(self):
        s=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
        report=read(str(PREFIX)+'-robustness.json');source={r['id']:r for r in s['results']}
        reference=vectors(s['reference'],COSTS)
        for comparison,rows in [('crossLayoutComparisons',report['results']),('averageRegretCrossLayoutComparisons',report['averageRegretSelections'])]:
            anchor=next(r for r in rows if r['id']=='A')['selected']
            a=source['A']['policies'][anchor['policyIndex']]
            cases=[(mode,stats) for grids in report[comparison].values() for modes in grids.values() for mode,subsets in modes.items() for stats in subsets.values()]
            for mode,stats in cases:
                w=stats['worstCase'];x=np.array(w['multipliers'])
                if w['rivalId'] not in source:continue
                scores=score_at(np.array([vectors(p,COSTS) for p in source[w['rivalId']]['policies']]),reference,x)
                rival=next(i for i,p in enumerate(source[w['rivalId']]['policies']) if p['policy']==w['rivalPolicy'])
                own=score_at(vectors(a,COSTS)[None,:,:],reference,x)[0]
                self.assertAlmostEqual(w['anchorScore'],own,places=9)
                self.assertAlmostEqual(w['rivalScore'],scores[rival],places=9)
                self.assertAlmostEqual(stats['minGap'],scores[rival]-own,places=9)
                if mode=='adaptiveRivals':self.assertAlmostEqual(scores[rival],scores.min(),places=9)

    def test_semantic_roundtrip_memory_and_native_loads(self):
        report=read(str(PREFIX)+'-verification.json');self.assertLess(report['maximumScoreDifference'],1e-9)
        memories={r['id']:r for r in report['memories']}
        self.assertEqual([memories['A'][k] for k in ['lower','guard','D','F']],[20,22,3,0])
        for layout in report['results']:
            for t in layout['ergonomics']['tracks'].values():
                self.assertAlmostEqual(sum(t['load'].values()),1,places=12)
                self.assertAlmostEqual(t['bothIndex'],t['leftIndex']+t['rightIndex'],places=12)
                self.assertAlmostEqual(t['leftHand']+t['rightHand'],1,places=12)
        comparison=read(str(PREFIX)+'-comparison.json')
        for row in comparison['results']:
            self.assertEqual(row['V'],5)
            for size in ['5000','5500']:
                stream=row['continuous'][size]
                self.assertEqual(stream['han'],int(size))
                self.assertEqual(stream['intervals'],stream['soundKeys']-stream['runs'])


if __name__=='__main__':unittest.main()
