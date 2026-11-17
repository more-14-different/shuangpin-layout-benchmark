"""Fixed production onset import and whole-root/rhyme-only experiment coverage."""
import gzip
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from explore_cr_lan_fixed import LanSearch,PREFIX,read
from replay_cr_lan_policies import substitute


class LanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.search=LanSearch()

    def test_production_onsets_use_exact_zero_and_ordinary_keys(self):
        s=self.search;mapping={a['name']:s.fixed[i] for i,a in enumerate(s.space.f['atoms'])}
        self.assertEqual({k:mapping[k] for k in ['k','l','zh','ch','sh','zero-A','zero-E','zero-O','zero-W','zero-Y']},
            dict(k='P',l='E',zh='K',ch='S',sh='L',**{'zero-A':'R','zero-E':'C','zero-O':'C','zero-W':'W','zero-Y':'Y'}))
        base=read(ROOT/'research/notes/2026-11-17-cr-m24-portfolio-finalists.json')['layouts'][3]['state']
        base=json.loads(json.dumps(base));base['firstKeys']=s.fixed
        self.assertEqual(s.space.memory(base),dict(d=2,m=23,guard=25))
        unavoidable_merges=sum(10-len(region['keys']) for region in s.space.f['toneRegions'])
        self.assertEqual(3+2+2+1+8+unavoidable_merges,25)

    def test_rhyme_operators_cannot_move_any_onset(self):
        s=self.search;state=s.cache[s.progress['transfers'][0]['key']]['state'];kinds=set()
        for label,candidate in s.rhyme_moves(state):
            self.assertEqual(candidate['firstKeys'],s.fixed);kinds.add(label.split(':')[0])
            self.assertEqual(len(candidate['partition']),18)
        self.assertEqual(kinds,{'root','root-swap','key','key-swap'})

    def test_scored_union_is_complete_and_invariant_word3_load_makes_original_guard_impossible(self):
        path=Path(str(PREFIX)+'-finalists.json')
        if not path.exists():self.skipTest('not exported')
        b=read(path);blob=(path.parent/b['scoreArchive']['file']).read_bytes()
        self.assertEqual(hashlib.sha256(blob).hexdigest(),b['scoreArchive']['sha256'])
        rows=json.loads(gzip.decompress(blob))['lan']
        ids={r['key'] for r in b['transfers']}|{k for stage in b['stages'] for k in stage['candidateKeys']}
        self.assertEqual(set(rows),ids)
        for key,row in rows.items():
            self.assertEqual(key,self.search.space.key(row['state']))
            self.assertEqual(row['state']['firstKeys'],self.search.fixed)
            self.assertAlmostEqual(row['metrics']['pinkyTracks'][2],.09060178865841471,places=12)
            self.assertFalse(self.search.fits(row['metrics'],'speed',peaks=True))
        for layout in b['layouts']:self.assertTrue(layout['metrics']['verified'])

    def test_exact_constant_term_substitution_retains_baseline_and_matches_direct_cpu_replays(self):
        path=Path(str(PREFIX)+'-policy-finalists.json')
        if not path.exists():self.skipTest('policy replay not complete')
        audit=read(str(PREFIX)+'-word3-invariance.json');b=read(path)
        baseline=read(str(PREFIX)+'-finalists.json')
        rows=json.loads(gzip.decompress((PREFIX.parent/baseline['scoreArchive']['file']).read_bytes()))['lan']
        for layout in b['layouts']:
            original=rows[layout['key']]['metrics']
            self.assertAlmostEqual(substitute(original,audit,'231')['ckt'],original['ckt'],places=12)
            replay=substitute(original,audit,layout['wordAuxiliaryPolicy']['word3'])
            for field in ['ckt','pinky','rightPinky']:self.assertAlmostEqual(replay[field],layout['metrics'][field],places=9)
            self.assertEqual(layout['state']['firstKeys'],self.search.fixed)


if __name__=='__main__':unittest.main()
