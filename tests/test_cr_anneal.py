"""Fast transition/resume tests with a deterministic fake scorer, not GPU tests."""
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

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import run_cr_anneal as a

class FakeEngine:
    fail_at=None
    def __init__(self,exe,folder,backend,threads,timeout):
        self.calls=0
        s=a.SearchSpace(folder)
        self.expected={a.digest(s.expand(x['state'])):x['expected'] for x in s.spec['seeds']}
    def score(self,states,verify=False):
        self.calls+=1
        if self.calls==self.fail_at: raise RuntimeError('simulated scorer failure')
        results=[]
        for s in states:
            key=a.digest(s)
            expected=self.expected.get(key,dict(ckt=9.17+(int(key[:6],16)%1000)/10000,pinky=.107))
            results.append(dict(ckt=expected['ckt'],pinky=expected['pinky'],pinkyTracks=[expected['pinky']]*4,verified=True))
        return results
    def close(self): pass

class CRAnnealTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.root=Path(self.tmp.name)
        a.unpack(a.ROOT/'research/config/cr-anneal-inputs.zip',self.root/'inputs')
        self.space=a.SearchSpace(self.root/'inputs')
    def tearDown(self): self.tmp.cleanup()
    def launch(self,name,rounds,extra=()):
        argv=['run','--backend','cpu','--output',str(self.root/name),'--rounds',str(rounds),'--duty','1','--cycle','2',*extra]
        with patch.object(sys,'argv',argv),patch.object(a,'Engine',FakeEngine),contextlib.redirect_stdout(io.StringIO()): a.main()
    def checkpoint(self,name):
        with contextlib.closing(sqlite3.connect(self.root/name/'search.sqlite')) as db:
            return json.loads(db.execute('SELECT data FROM checkpoint WHERE id=1').fetchone()[0])

    def test_seed_memory_and_daily_replay(self):
        for seed,expected_m in zip(self.space.spec['seeds'],[22,21,21,22]):
            m=self.space.memory(seed['state'])
            self.assertEqual(m,dict(d=2,m=expected_m,guard=24))
            self.assertAlmostEqual(self.space.daily(seed['state'])['daily'],seed['expected']['daily'],places=9)

    def test_proposals_keep_roots_whole_and_budgets(self):
        rng=random.Random(33); state=self.space.spec['seeds'][0]['state']
        profile=dict(maxM=22,dailyFloor=0,pinkyCeiling=1)
        for _ in range(150):
            state,m=self.space.propose(state,rng,profile)
            self.assertTrue(a.fits_budget(m,profile))
            self.assertEqual(set(state['partition']),set(range(10)))
            expanded=self.space.expand(state)
            for i,root in enumerate(self.space.spec['finalRoots']):
                for j,other in enumerate(self.space.spec['finalRoots']):
                    if root==other:
                        self.assertTrue(all(row[i]==row[j] for row in expanded['rhymeKeys']))

    def test_resume_matches_uninterrupted_including_reheat(self):
        self.launch('full',12)
        self.launch('split',5); self.launch('split',7)
        self.assertEqual(self.checkpoint('full'),self.checkpoint('split'))

    def test_failed_batch_rolls_back_rng_and_state(self):
        self.launch('full',4)
        with patch.object(FakeEngine,'fail_at',4):
            with self.assertRaisesRegex(RuntimeError,'simulated'): self.launch('broken',4)
        cp=self.checkpoint('broken')
        self.assertEqual(cp['round'],1)
        self.launch('broken',3)
        self.assertEqual(self.checkpoint('full'),self.checkpoint('broken'))

    def test_changed_contract_refused_and_stop_file_respected(self):
        self.launch('run',1)
        with self.assertRaisesRegex(ValueError,'contract changed'): self.launch('run',1,['--temp','.03'])
        (self.root/'run/STOP').touch()
        self.launch('run',1)
        self.assertEqual(self.checkpoint('run')['round'],1)

    def test_pareto_keeps_tradeoffs(self):
        def item(key,ckt,daily,m):
            return dict(key=key,metrics=dict(ckt=ckt,daily=daily,m=m,guard=24,d=2,pinky=.107))
        f=a.update_frontier([],item('a',9.17,120,22))
        f=a.update_frontier(f,item('b',9.18,123,21))
        self.assertEqual(len(f),2)
        self.assertEqual(a.update_frontier(f,item('c',9.19,119,22)),f)
        self.assertEqual(len(a.update_frontier(f,item('d',9.16,124,21))),1)

if __name__=='__main__': unittest.main()
