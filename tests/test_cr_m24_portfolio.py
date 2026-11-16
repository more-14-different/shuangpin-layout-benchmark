"""Portable seed validity, whole-group mutations and transactional multi-chain recovery."""
import contextlib
import io
import json
from pathlib import Path
import random
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
import run_cr_m24_portfolio as a
from prepare_cr_m24_portfolio import BUNDLE,distances


class FakeEngine:
    fail_at=None
    def __init__(self,exe,folder,backend,threads,timeout):
        space=a.PortfolioSpace(folder);self.expected={a.digest(space.expand(s['state'])):s['expected'] for s in space.spec['seeds']};self.calls=0
    def score(self,states,verify=False):
        self.calls+=1
        if self.calls==self.fail_at:raise RuntimeError('simulated score failure')
        results=[]
        for state in states:
            metrics=self.expected.get(a.digest(state),dict(ckt=9+(int(a.digest(state)[:6],16)%2000)/10000,pinky=.08,rightPinky=.06))
            results.append(dict({k:metrics[k] for k in ['ckt','pinky','rightPinky']},verified=True))
        return results
    def close(self):pass


class PortfolioTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        a.unpack(BUNDLE,self.root/'inputs');self.space=a.PortfolioSpace(self.root/'inputs')
    def tearDown(self):self.tmp.cleanup()
    def launch(self,name,rounds,extra=()):
        argv=['runner','--backend','cpu','--output',str(self.root/name),'--rounds',str(rounds),'--duty','1','--cycle','1',*extra]
        with patch.object(sys,'argv',argv),patch.object(a,'Engine',FakeEngine),contextlib.redirect_stdout(io.StringIO()):a.main()
    def checkpoint(self,name):
        with contextlib.closing(sqlite3.connect(self.root/name/'search.sqlite')) as db:
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            return json.loads(db.execute('SELECT data FROM checkpoint WHERE id=1').fetchone()[0])

    def test_seed_contracts_and_label_invariant_distance(self):
        s=self.space;self.assertEqual(len(s.spec['seeds']),8)
        self.assertEqual(s.spec['wordAuxiliaryPolicy'],dict(word2='21',word3='231',word4='14'))
        self.assertEqual(s.spec['shapeKeysByMeaning'],'AVUIO');self.assertEqual(s.spec['toneKeysByTone'],'IVUAO')
        self.assertEqual(s.spec['toneDigitsByShapeMeaning'],'42310')
        for seed in s.spec['seeds']:
            self.assertEqual(s.key(seed['state']),seed['key'])
            self.assertTrue(a.eligible(seed['expected'],s.spec['profiles'][seed['route']]))
            self.assertEqual(s.memory(seed['state']),{k:seed['expected'][k] for k in ['d','m','guard']})
        state=s.spec['seeds'][0]['state'];other=json.loads(json.dumps(state))
        other['partition']=[9-g for g in other['partition']];other['groupKeys']=[list(reversed(row)) for row in other['groupKeys']]
        self.assertEqual(distances(s,state,other)['normalized'],0)
        matrix=s.spec['distanceMatrix'];self.assertEqual(matrix[0][0]['normalized'],0)
        self.assertGreater(matrix[1][3]['rhymeFinalRegionCells'],50)

    def test_proposals_preserve_groups_and_reject_over_budget_or_either_pinky(self):
        s=self.space;rng=random.Random(24026)
        for seed in s.spec['seeds']:
            state=seed['state'];profile=s.spec['profiles'][seed['route']];signature=s.signature(state)
            for _ in range(24):
                candidate,m=s.propose(state,rng,profile)
                self.assertEqual(s.signature(candidate),signature);self.assertTrue(a.fits_budget(m,profile))
                self.assertGreaterEqual(m['daily']+1e-9,profile['dailyFloor']);state=candidate
            m=seed['expected']
            self.assertFalse(a.eligible(dict(m,d=3),profile))
            self.assertFalse(a.eligible(dict(m,guard=27),profile))
            self.assertFalse(a.eligible(dict(m,pinky=profile['pinkyCeiling']+.001),profile))
            self.assertFalse(a.eligible(dict(m,rightPinky=profile['rightPinkyCeiling']+.001),profile))

    def test_resume_preserves_each_chain_rng_and_restarts(self):
        self.launch('full',8);self.launch('split',3);self.launch('split',5)
        self.assertEqual(self.checkpoint('full'),self.checkpoint('split'))
        self.assertTrue(any(c['restarts'] for c in self.checkpoint('full')['chains']))
        self.assertEqual(len(self.checkpoint('full')['chains']),8)
        for chain in self.checkpoint('full')['chains']:
            self.assertEqual(chain['key'],self.space.key(chain['state']))

    def test_failed_batch_rolls_back_and_replays_identically(self):
        self.launch('full',5)
        with patch.object(FakeEngine,'fail_at',6):
            with self.assertRaisesRegex(RuntimeError,'simulated'):self.launch('failed',5)
        cp=self.checkpoint('failed');self.assertLess(cp['round'],5)
        self.launch('failed',5-cp['round']);self.assertEqual(self.checkpoint('failed'),self.checkpoint('full'))

    def test_changed_contract_and_stop(self):
        self.launch('change',1)
        with self.assertRaisesRegex(ValueError,'contract changed'):self.launch('change',1,['--temp','.04'])
        (self.root/'change/STOP').touch();self.launch('change',1);self.assertEqual(self.checkpoint('change')['round'],1)

    def test_right_pinky_is_a_pareto_dimension(self):
        def row(key,right,ckt):return dict(key=key,metrics=dict(d=2,m=22,guard=24,daily=126,pinky=.09,rightPinky=right,ckt=ckt))
        frontier=a.update_frontier([],row('a',.07,9.1));frontier=a.update_frontier(frontier,row('b',.06,9.11))
        self.assertEqual(len(frontier),2)


if __name__=='__main__':unittest.main()
