import json
from pathlib import Path
import sqlite3
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from prune_u7e_grouped_cpu import pareto,select,prune_transaction


class PruningTests(unittest.TestCase):
    def test_pareto_preserves_cost_and_memory_tradeoffs(self):
        rows=[dict(key='a',scores=[1,3,3,3],M=41),dict(key='b',scores=[3,1,1,1],M=41),
              dict(key='c',scores=[2,4,4,4],M=41),dict(key='d',scores=[2,4,4,4],M=40)]
        self.assertEqual({r['key'] for r in pareto(rows)},{'a','b','d'})

    def test_checkpoint_baseline_and_reported_rows_survive_ranking(self):
        rows=[]
        for i in range(8):
            rows.append(dict(id=str(i),key=chr(65+i),scores=[i+1]*4,M=41,broken=[],emptyBuckets=i%2==0,
                             eiErAtE=i%2==0,rightPinkyMixed=.02,rightPinkyPeak8=.03))
        cfg=dict(seedFinalKeys=[0],rightPinkyCaps=dict(mixed=.04,peak8=.05))
        state=dict(chains=dict(strict=[dict(index=0,current=dict(key='H'),best=dict(key='G'))],open=[]),
                   queues=dict(strict=[],open=[]))
        reasons,_=select(rows,state,cfg,reported_ids=['5'],top_n=1,tier_n=1,preference_n=1)
        self.assertTrue({'A','F','G','H'}<=set(reasons))
        self.assertIn('previously reported frontier',reasons['F'])

    def test_transaction_preserves_metadata_and_rolls_back_on_missing_anchor(self):
        db=sqlite3.connect(':memory:')
        db.execute('CREATE TABLE states(k TEXT PRIMARY KEY,data BLOB)')
        db.execute('CREATE TABLE meta(k TEXT PRIMARY KEY,v TEXT)')
        db.executemany('INSERT INTO states VALUES (?,?)',[('a',b'original-a'),('b',b'original-b')])
        db.execute('INSERT INTO meta VALUES (?,?)',('state','unchanged-state'))
        db.commit()
        db.execute('BEGIN EXCLUSIVE')
        with self.assertRaises(AssertionError):
            prune_transaction(db,{'missing'},dict(retainedRows=1))
        db.rollback()
        self.assertEqual(db.execute('SELECT COUNT(*) FROM states').fetchone()[0],2)
        db.execute('BEGIN EXCLUSIVE')
        self.assertEqual(prune_transaction(db,{'a'},dict(retainedRows=1)),1)
        db.commit()
        self.assertEqual(db.execute('SELECT * FROM states').fetchall(),[('a',b'original-a')])
        self.assertEqual(db.execute("SELECT v FROM meta WHERE k='state'").fetchone()[0],'unchanged-state')
        self.assertEqual(json.loads(db.execute("SELECT v FROM meta WHERE k='compaction'").fetchone()[0]),dict(retainedRows=1))
        db.close()


if __name__=='__main__':
    unittest.main()
