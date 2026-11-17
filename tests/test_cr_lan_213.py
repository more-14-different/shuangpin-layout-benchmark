"""Fixed-onset root operators, capped production output and exact recovery."""
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
import run_cr_lan_213 as a
from prepare_cr_lan_213 import BUNDLE


class FakeEngine:
    fail_at=None
    def __init__(self,exe,folder,backend,threads,timeout):
        s=a.LanSpace(folder);self.expected={a.digest(s.expand(r['state'])):r['expected'] for r in s.spec['seeds']};self.calls=0
    def score(self,states,verify=False):
        self.calls+=1
        if self.calls==self.fail_at:raise RuntimeError('simulated score failure')
        result=[]
        for state in states:
            m=self.expected.get(a.digest(state),dict(ckt=9.09+(int(a.digest(state)[:6],16)%1000)/10000,pinky=.08,rightPinky=.06))
            result.append(dict({k:m[k] for k in ['ckt','pinky','rightPinky']},verified=True))
        return result
    def close(self):pass


class LanAnnealTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        a.unpack(BUNDLE,self.root/'inputs');self.space=a.LanSpace(self.root/'inputs')
    def tearDown(self):self.tmp.cleanup()
    def launch(self,name,rounds,extra=()):
        argv=['runner','--backend','cpu','--output',str(self.root/name),'--rounds',str(rounds),'--duty','1',
            '--cycle','1','--exchange-every','1',*extra]
        with patch.object(sys,'argv',argv),patch.object(a,'Engine',FakeEngine),contextlib.redirect_stdout(io.StringIO()):a.main()
    def checkpoint(self,name):
        with contextlib.closing(sqlite3.connect(self.root/name/'search.sqlite')) as db:
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            return json.loads(db.execute('SELECT data FROM checkpoint WHERE id=1').fetchone()[0])

    def test_seed_semantics_fixed_onsets_and_diverse_groups(self):
        s=self.space
        self.assertEqual(s.spec['wordAuxiliaryPolicy'],dict(word2='21',word3='213',word4='14'))
        self.assertEqual([s.spec[k] for k in ['shapeKeysByMeaning','toneKeysByTone','toneDigitsByShapeMeaning']],['AVUIO','IVUAO','42310'])
        self.assertEqual(len(s.spec['seeds']),12)
        self.assertEqual(len({r['key'] for r in s.spec['seeds']}),8)
        self.assertGreater(len({tuple(r['state']['partition']) for r in s.spec['seeds']}),1)
        for seed in s.spec['seeds']:
            self.assertEqual(seed['state']['firstKeys'],s.fixed)
            self.assertEqual(s.key(seed['state']),seed['key'])
            self.assertTrue(a.admissible(seed['expected'],s.constraints,s.spec['routes'][seed['route']]))

    def test_all_root_and_region_operators_are_reachable_without_splitting_roots(self):
        s=self.space;rng=random.Random(21318);state=s.spec['seeds'][0]['state']
        changed=set();partitions=set();keymaps=set()
        for op in range(len(a.OPERATORS)):
            for _ in range(100):
                candidate,name=s.mutate(state,rng,op)
                self.assertEqual(candidate['firstKeys'],s.fixed);self.assertEqual(len(candidate['partition']),18)
                if candidate!=state:changed.add(name)
                if s.memory(candidate):
                    self.assertEqual(set(candidate['partition']),set(range(10)))
                    expanded=s.expand(candidate)
                    for root in range(18):
                        indices=[i for i,r in enumerate(s.spec['finalRoots']) if r==root]
                        for row in expanded['rhymeKeys']:
                            self.assertLessEqual(len({row[i] for i in indices}),1)
                    partitions.add(tuple(candidate['partition']));keymaps.add(a.canonical(candidate['groupKeys']))
        self.assertEqual(changed,set(a.OPERATORS));self.assertGreater(len(partitions),20);self.assertGreater(len(keymaps),20)
        illegal=json.loads(json.dumps(state));illegal['firstKeys'][0]='C';self.assertIsNone(s.memory(illegal))

    def test_capped_solution_and_daily_objective_do_not_accept_a_tradeoff_as_improvement(self):
        s=self.space;p=s.constraints;m=s.spec['seeds'][0]['expected'];route=s.spec['routes']['moderate']
        self.assertTrue(a.production(m,p))
        self.assertFalse(a.production(dict(m,ckt=m['ckt']+.001,daily=m['daily']+5),p))
        self.assertFalse(a.production(dict(m,ckt=m['ckt']-.001,daily=m['daily']-.01),p))
        self.assertLess(a.energy(dict(m,daily=m['daily']+1),p,route),a.energy(m,p,route))
        for changes in [dict(m=25),dict(guard=27),dict(d=3),dict(pinky=p['pinkyCeiling']+.001),dict(rightPinky=p['rightPinkyCeiling']+.001)]:
            self.assertFalse(a.production(dict(m,**changes),p))

    def test_resume_replays_identical_rng_swaps_restarts_and_layout_keys(self):
        self.launch('full',16);self.launch('split',7);self.launch('split',9)
        self.assertEqual(self.checkpoint('full'),self.checkpoint('split'))
        cp=self.checkpoint('full');self.assertGreater(sum(c['restarts'] for c in cp['chains']),0)
        self.assertGreater(cp['exchanges']['attempted'],0)
        for c in cp['chains']:self.assertEqual(c['key'],self.space.key(c['state']))
        solutions=json.loads((self.root/'full/solutions.json').read_text(encoding='utf8'))
        self.assertTrue(all(a.production(r['metrics'],self.space.constraints) for r in solutions['layouts']))

    def test_failed_batch_rolls_back_and_resumes_without_rng_drift(self):
        self.launch('full',8)
        with patch.object(FakeEngine,'fail_at',9):
            with self.assertRaisesRegex(RuntimeError,'simulated'):self.launch('failed',8)
        count=self.checkpoint('failed')['round'];self.assertLess(count,8)
        self.launch('failed',8-count);self.assertEqual(self.checkpoint('failed'),self.checkpoint('full'))

    def test_changed_contract_and_stop_preserve_checkpoint(self):
        self.launch('change',2)
        with self.assertRaisesRegex(ValueError,'contract changed'):self.launch('change',1,['--temp','3'])
        before=self.checkpoint('change');(self.root/'change/STOP').touch();self.launch('change',1)
        self.assertEqual(self.checkpoint('change'),before)

    def test_crowding_cannot_drop_the_best_daily_result_inside_the_ckt_cap(self):
        seed=self.space.spec['seeds'][0]
        row=dict(key=seed['key'],state=seed['state'],metrics=seed['expected'])
        with patch.object(a,'update_frontier',return_value=[]):
            kept=a.retain_frontier([row],dict(row,key='other',metrics=dict(row['metrics'],ckt=row['metrics']['ckt']+.01)),self.space.constraints)
        self.assertEqual(kept,[row])


if __name__=='__main__':unittest.main()
