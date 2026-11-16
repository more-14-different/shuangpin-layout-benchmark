"""The extra two rules and right-pinky guard cannot silently weaken the contract."""
import copy
import gzip
import hashlib
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from search_cr_667_m24_joint import JointSearch,PREFIX,PARENT,read,local_moves,families


class M24Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.search=JointSearch()

    def test_extra_budget_admits_uncompensated_wy_and_aeo_splits_but_never_more_than_two_ordinary_moves(self):
        s=self.search;state=copy.deepcopy(s.anchor['state']);indices={a['name']:i for i,a in enumerate(s.space.f['atoms'])}
        state['firstKeys'][indices['zero-W']]='G';state['firstKeys'][indices['zero-Y']]='H'
        self.assertEqual(s.space.memory(state),dict(d=2,m=24,guard=26));self.assertTrue(s.fits(s.space.memory(state)))
        state=copy.deepcopy(s.anchor['state'])
        state['firstKeys'][indices['b']]='F';state['firstKeys'][indices['g']]='H'
        self.assertEqual(s.space.memory(state),dict(d=4,m=24,guard=26));self.assertFalse(s.fits(s.space.memory(state)))
        state['firstKeys'][indices['d']]='J';self.assertFalse(s.fits(s.space.memory(state)))
        state=copy.deepcopy(s.anchor['state']);state['firstKeys'][indices['zero-A']]='G';state['firstKeys'][indices['zero-E']]='H'
        self.assertEqual(s.space.memory(state),dict(d=2,m=24,guard=26));self.assertTrue(s.fits(s.space.memory(state)))
        self.assertFalse(s.fits(dict(d=3,m=23,guard=25)))
        state=copy.deepcopy(s.anchor['state']);state['firstKeys'][indices['ch']]='X';state['firstKeys'][indices['x']]='S'
        self.assertEqual(s.space.memory(state),dict(d=3,m=23,guard=25));self.assertFalse(s.fits(s.space.memory(state)))

    def test_peak_guards_are_independent_and_keep_the_original_daily_floor(self):
        s=self.search;m=dict(s.anchor['metrics'],rightPinky=s.profiles[PARENT]['rightPinkyCeiling'])
        self.assertTrue(s.fits(m,peaks=True))
        for field in ['pinky','rightPinky']:
            bad=dict(m);bad[field]+=1e-5;self.assertFalse(s.fits(bad,peaks=True))
        self.assertFalse(s.fits(dict(m,daily=126),peaks=True))
        self.assertEqual(s.profiles[PARENT]['maxM'],24)
        self.assertEqual(s.progress['contract']['maxD'],2);self.assertEqual(s.score_max_d,2)

    def test_generators_preserve_full_roots_and_group_key_multisets(self):
        s=self.search;old=s.anchor['state'];counts={};p_retro=False
        for label,state in local_moves(old,s.space,full_zero=True):
            self.assertEqual(state['partition'],old['partition'])
            self.assertEqual([sorted(r) for r in state['groupKeys']],[sorted(r) for r in old['groupKeys']])
            key=tuple(sorted(families(state,old,s.space)));counts[key]=counts.get(key,0)+1
            p_retro|=label=='first:zh>P'
        self.assertTrue(p_retro)  # A frequency constraint, not an arbitrary key ban.
        self.assertGreater(counts[('zero',)],9000);self.assertGreater(counts[('rhyme',)],100)

    def test_scored_archive_is_exactly_the_declared_candidate_union_and_all_guards_are_recomputed(self):
        path=Path(str(PREFIX)+'-finalists.json')
        if not path.exists():self.skipTest('experiment not exported')
        b=read(path);blob=(path.parent/b['scoreArchive']['file']).read_bytes()
        self.assertEqual(hashlib.sha256(blob).hexdigest(),b['scoreArchive']['sha256'])
        import json
        rows=json.loads(gzip.decompress(blob))[PARENT];s=self.search
        ids={k for stage in b['stages'] for k in stage['candidateKeys']}
        self.assertEqual(set(rows),ids|{s.anchor['key']});self.assertLessEqual(len(rows),10001)
        self.assertEqual(sum(stage['fresh']+stage.get('compatibleReuse',{}).get('count',0) for stage in b['stages']),len(rows)-1)
        for key,row in rows.items():
            self.assertEqual(key,s.space.key(row['state']));self.assertTrue(s.fits(row['metrics']))
            self.assertEqual({field:row['metrics'][field] for field in ['d','m','guard']},s.space.memory(row['state']))
            self.assertLessEqual(row['metrics']['d'],2)
            self.assertEqual(row['state']['partition'],s.anchor['state']['partition'])
            self.assertEqual([sorted(r) for r in row['state']['groupKeys']],[sorted(r) for r in s.anchor['state']['groupKeys']])
            for field in ['pinky','rightPinky']:
                self.assertTrue(0<=row['metrics'][field]<=1)
        for item in b['layouts']:
            self.assertEqual(item['constraintsSatisfied'],s.fits(item['metrics'],peaks=True))
            self.assertTrue(item['metrics']['verified'])
        qualified=[r for r in rows.values() if s.fits(r['metrics'],peaks=True)]
        winner=next(r for r in b['layouts'] if 'best_qualified' in r['roles'])
        self.assertAlmostEqual(winner['metrics']['ckt'],min(r['metrics']['ckt'] for r in qualified),places=9)
        self.assertEqual(len(qualified),b['coverage']['qualified'])
        self.assertTrue(b['knownReference87']['constraintsSatisfied'])


if __name__=='__main__':unittest.main()
