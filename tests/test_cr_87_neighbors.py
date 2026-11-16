"""87 exploration keeps the correct center, state budget, and daily recovery objective."""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from explore_cr_87_neighbors import PARENT,PREFIX,BUDGET,BudgetSearch,load_source,tradeoffs
from explore_cr_667_neighbors import audit_coverage
from run_cr_anneal import atomic_json


class Neighbors87Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.source,cls.anchor,cls.imported,_=load_source()
        cls.search=BudgetSearch(Path(cls.temp.name),PARENT,anchor=cls.anchor)
        cls.search.imported_keys=set(cls.imported)

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def test_seed_is_87_with_the_same_policy_and_constraints(self):
        s=self.search
        self.assertTrue(s.seeds[PARENT]['key'].startswith('87de6cc69c'))
        self.assertAlmostEqual(s.seeds[PARENT]['metrics']['ckt'],9.119955263161566)
        self.assertEqual(s.policy,dict(word2='21',word3='231',word4='14'))
        self.assertEqual(s.profiles[PARENT],dict(maxM=22,dailyFloor=126.23457023071755,pinkyCeiling=.09032422256372921))
        atomic_json(s.state_path,s.progress)
        resumed=BudgetSearch(Path(self.temp.name),PARENT,anchor=self.anchor)
        self.assertEqual(resumed.seeds[PARENT]['key'],self.anchor['key'])

    def test_state_budget_rejects_work_before_starting_scorers(self):
        with tempfile.TemporaryDirectory() as temp:
            s=BudgetSearch(Path(temp),PARENT,anchor=self.anchor);s.imported_keys=set(self.imported)
            s.cache=copy.deepcopy(self.imported)
            with self.assertRaisesRegex(ValueError,'budget exceeded'):
                s.score_batch('never-score',[dict(key='unscored'+str(i)) for i in range(BUDGET+1)],s.seeds[PARENT])
            self.assertIsNone(s.engine)

    def test_daily_recovery_never_pays_a_worse_ckt_or_pinky_than_allowed(self):
        with tempfile.TemporaryDirectory() as temp:
            s=BudgetSearch(Path(temp),PARENT,anchor=self.anchor)
            s.full_score=lambda r:r
            valid=copy.deepcopy(s.seeds[PARENT]);valid['key']='valid';valid['metrics']['daily']+=.1
            slower=copy.deepcopy(valid);slower['key']='slower';slower['metrics']['ckt']+=.001;slower['metrics']['daily']+=1
            overloaded=copy.deepcopy(valid);overloaded['key']='overloaded';overloaded['metrics']['pinky']+=.01;overloaded['metrics']['daily']+=2
            s.cache={r['key']:r for r in [valid,slower,overloaded]}
            self.assertEqual(tradeoffs(s,self.anchor)['key'],'valid')

    def test_exporting_a_tradeoff_keeps_the_lowest_ckt_center(self):
        with tempfile.TemporaryDirectory() as temp:
            s=BudgetSearch(Path(temp),PARENT,anchor=self.anchor)
            representative=next(r for r in self.imported.values() if r['key'].startswith('667610a3fc'))
            s.cache=copy.deepcopy(self.imported);s.full_score=lambda row:row;s.audit_seeds=lambda:None
            def reject(_):raise AssertionError('explicit representative must not trigger minimum selection')
            s.cross_profile=reject
            exported=s.export_layout(self.source,representative=representative)
            self.assertEqual(exported['key'],representative['key'])
            self.assertEqual(s.progress['centers'][PARENT]['key'],self.anchor['key'])

    def test_archived_states_and_stage_coverage_obey_the_budget(self):
        path=Path(str(PREFIX)+'-finalists.json')
        if not path.exists():self.skipTest('search still running')
        data=json.loads(path.read_text(encoding='utf8'))
        content=(path.parent/data['scoreArchive']['file']).read_bytes()
        self.assertEqual(hashlib.sha256(content).hexdigest(),data['scoreArchive']['sha256'])
        rows=json.loads(gzip.decompress(content))[PARENT]
        self.assertEqual(data['newStates'],len(set(rows)-set(self.imported)))
        self.assertLessEqual(data['newStates'],BUDGET)
        self.assertEqual(data['importedStates'],len(self.imported))
        self.assertEqual(data['sourceContract']['pinnedCenterKey'],self.anchor['key'])
        s=self.search;s.cache=rows;s.progress['rounds']=data['layouts'][0]['rounds']
        self.assertEqual(audit_coverage(s,self.anchor),data['coverage'])
        for key,row in rows.items():
            self.assertEqual(key,s.space.key(row['state']))
            m=s.space.memory(row['state']);self.assertLessEqual(m['m'],22);self.assertLessEqual(m['d'],2)
            self.assertLessEqual(m['guard'],24)
        for layout in data['layouts']:
            self.assertEqual(layout['anchorKey'],self.anchor['key'])
            self.assertTrue(layout['metrics']['verified'])
            if layout['role']=='daily_recovery_under_anchor_ckt':
                self.assertLessEqual(layout['rustScore'],self.anchor['rustScore']+1e-10)
                self.assertGreaterEqual(layout['metrics']['daily']+1e-9,self.anchor['metrics']['daily'])


if __name__=='__main__':unittest.main()
