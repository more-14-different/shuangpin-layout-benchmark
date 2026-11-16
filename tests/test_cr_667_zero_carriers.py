"""Derived zero-carrier association costs and exhaustive compensated first tier."""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from search_cr_667_zero_carriers import CarrierSpace,PARENT,PREFIX,SOURCE,carrier_moves,carrier_category,read
from explore_cr_stable_neighbors import StableNeighbors
from explore_cr_frontier_followup import local_moves
from run_cr_anneal import SearchSpace


class ZeroCarrierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.anchor=read(SOURCE)['layouts'][0]
        cls.search=StableNeighbors(Path(cls.temp.name),PARENT,anchor=cls.anchor,space_class=CarrierSpace)
        cls.indices={a['name']:i for i,a in enumerate(cls.search.space.f['atoms'])}

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def changed(self,changes):
        state=copy.deepcopy(self.anchor['state'])
        for name,key in changes.items():state['firstKeys'][self.indices[name]]=key
        return state

    def test_shared_carrier_is_one_rule_independent_of_physical_key(self):
        space=self.search.space;legacy=SearchSpace(self.search.output/'inputs')
        baseline=dict(d=2,m=22,guard=24)
        self.assertEqual(space.memory(self.anchor['state']),baseline)
        for key in space.allowed_first:
            self.assertEqual(space.memory(self.changed({'zero-'+x:key for x in 'AEO'})),baseline)
        self.assertEqual(legacy.memory(self.changed({'zero-'+x:'G' for x in 'AEO'})),dict(d=2,m=25,guard=27))
        for changes in [{'zero-A':'G'},{'zero-A':'G','zero-E':'G'}]:
            self.assertEqual(space.memory(self.changed(changes)),dict(d=2,m=23,guard=25))
        self.assertEqual(space.memory(self.changed({'zero-A':'G','zero-E':'H'})),dict(d=2,m=24,guard=26))
        self.assertEqual(space.memory(self.changed({'zero-W':'G','p':'P'})),dict(d=1,m=22,guard=24))
        self.assertEqual(space.memory(self.changed({'zero-W':'G','zero-Y':'H','p':'P','s':'S'})),dict(d=0,m=22,guard=24))
        self.assertEqual(space.key(self.anchor['state']),self.anchor['key'])
        self.assertIn('memoryModel',self.search.progress['contract'])

    def test_python_ledger_matches_independent_js_codes_for_carrier_and_merge_cases(self):
        space=self.search.space;f=space.f;states=[self.anchor['state']]
        states.extend(self.changed({'zero-'+x:key for x in 'AEO'}) for key in space.allowed_first)
        states.extend(self.changed(changes) for changes in [
            {'zero-A':'G'},{'zero-A':'G','zero-E':'G'},{'zero-A':'G','zero-E':'H'},
            {'zero-W':'G'},{'zero-W':'G','p':'P'},
            {'zero-W':'G','zero-Y':'H','p':'P','s':'S'}])
        merge=copy.deepcopy(self.anchor['state']);merge['groupKeys'][0][0]=merge['groupKeys'][0][1];states.append(merge)
        first={py:i for i,a in enumerate(f['atoms']) for py in a['pinyin']}
        final={py:i for i,a in enumerate(f['rhymeAtoms']) for py in a['pinyin']}
        region={t:i for i,r in enumerate(f['toneRegions']) for t in r['tones']}
        decomposition=read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']
        finals={r['pinyin']:r['fullFinal'] for r in decomposition};cases=[]
        for state in states:
            expanded=space.expand(state)
            groups=[dict(finals=sorted({finals[f['pinyin'][py]] for i,a in enumerate(f['rhymeAtoms'])
                if state['partition'][space.spec['finalRoots'][i]]==g for py in a['pinyin']})) for g in range(10)]
            codes=[[expanded['firstKeys'][first[py]]+expanded['rhymeKeys'][region[t]][final[py]] if code else None
                for t,code in enumerate(row,1)] for py,row in enumerate(f['tonedCodes'])]
            cases.append(dict(native=dict(publication=dict(rhymeGroups=groups),tonedCodes=codes),expected=space.memory(state)))
        script="""const fs=require('fs'),assert=require('assert/strict');
const {tonedMemoryAudit}=require('./tools/toned_memory_audit');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
for(const c of input.cases){const m=tonedMemoryAudit(c.native,input.pinyin,input.decomposition);
assert.deepEqual({d:m.D,m:m.lower,guard:m.guard},c.expected);}console.log(input.cases.length);"""
        result=subprocess.run(['node','-e',script],input=json.dumps(dict(cases=cases,pinyin=f['pinyin'],decomposition=decomposition)),
            text=True,encoding='utf8',capture_output=True,cwd=ROOT,check=True)
        self.assertEqual(int(result.stdout),len(cases))

    def test_first_tier_enumerates_all_compensations_without_splitting_aeo(self):
        space=self.search.space;old=copy.deepcopy(self.anchor['state']);raw=list(carrier_moves(old,space))
        self.assertEqual(len(raw),10100)
        for label,state in raw:
            self.assertEqual(len({state['firstKeys'][self.indices['zero-'+x]] for x in 'AEO'}),1)
            self.assertEqual(state['partition'],old['partition']);self.assertEqual(state['groupKeys'],old['groupKeys'])
            self.assertLessEqual(space.memory(state)['guard'],24)
        rows=list(self.search.candidates(old,self.search.profiles[PARENT],iter(raw)))
        self.assertEqual(len(rows),1344);self.assertEqual(old,self.anchor['state'])

    def test_archive_contains_only_scored_declared_candidates(self):
        path=Path(str(PREFIX)+'-finalists.json')
        if not path.exists():self.skipTest('experiment not exported')
        data=read(path);blob=(path.parent/data['scoreArchive']['file']).read_bytes()
        self.assertEqual(hashlib.sha256(blob).hexdigest(),data['scoreArchive']['sha256'])
        rows=json.loads(gzip.decompress(blob))[PARENT]
        ids={key for stage in data['stages'] for key in stage['candidateKeys']}
        self.assertEqual(set(rows),ids|{self.anchor['key']});self.assertLessEqual(len(rows),5001)
        first=data['stages'][0]
        expected=list(self.search.candidates(self.anchor['state'],self.search.profiles[PARENT],
            carrier_moves(self.anchor['state'],self.search.space)))
        self.assertEqual(set(first['candidateKeys']),{r['key'] for r in expected})
        ordered=sorted((rows[k] for k in first['candidateKeys']),key=lambda r:(r['metrics']['ckt'],r['key']))
        for stage in data['stages'][1:]:
            near=ordered[:5] if stage['phase']=='carrier-refine' else [next(r for r in ordered
                if carrier_category(r['state'],self.anchor['state'],self.search.space)==category)
                for category in ['W','Y','WY']]
            self.assertEqual(stage['branchKeys'],[r['key'] for r in near])
            expected=list(self.search.candidates(self.anchor['state'],self.search.profiles[PARENT],
                ((label,state) for row in near for label,state in local_moves(row['state'],self.search.space)
                 if state['partition']==self.anchor['state']['partition'])))
            self.assertEqual(set(stage['candidateKeys']),{r['key'] for r in expected})
        for key,row in rows.items():
            self.assertEqual(key,self.search.space.key(row['state']))
            self.assertLessEqual(row['metrics']['m'],22);self.assertLessEqual(row['metrics']['guard'],24)
            self.assertEqual(row['state']['partition'],self.anchor['state']['partition'])
            self.assertGreaterEqual(row['metrics']['daily']+1e-9,self.search.profiles[PARENT]['dailyFloor'])


if __name__=='__main__':unittest.main()
