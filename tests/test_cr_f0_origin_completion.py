"""The 921 completion stays at f0 and cannot select a later search center."""
import gzip
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from complete_cr_f0_origin import PARENT,PREFIX,SOURCE,reconstruct
from explore_cr_stable_neighbors import StableNeighbors


class F0OriginCompletionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.search=StableNeighbors(Path(cls.temp.name),PARENT)
        cls.source=json.loads(SOURCE.read_text(encoding='utf8'))
        archive=SOURCE.parent/cls.source['scoreArchive']['file']
        cls.cache=json.loads(gzip.decompress(archive.read_bytes()))[PARENT]

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def test_exact_original_neighborhood_and_sample_are_reproduced(self):
        anchor,candidates,sampled,near=reconstruct(self.search,self.source,self.cache)
        self.assertTrue(anchor['key'].startswith(PARENT))
        self.assertEqual(len(candidates),921);self.assertEqual(len(sampled),240);self.assertEqual(len(near),20)
        ids={r['key'] for r in candidates};sample_ids={r['key'] for r in sampled}
        self.assertEqual(len(ids),921);self.assertEqual(len(ids-sample_ids),681)
        self.assertEqual(len(ids & self.cache.keys()),328)
        self.assertEqual(len(ids-self.cache.keys()),593)
        # 667 belongs to a different center's search and is outside this set.
        self.assertNotIn(self.source['layouts'][0]['key'],ids)

    def test_completed_archive_has_all_and_only_the_pinned_candidates(self):
        path=Path(str(PREFIX)+'-finalists.json')
        if not path.exists():self.skipTest('completion still running')
        result=json.loads(path.read_text(encoding='utf8'));c=result['completion']
        content=(path.parent/result['scoreArchive']['file']).read_bytes()
        self.assertEqual(hashlib.sha256(content).hexdigest(),result['scoreArchive']['sha256'])
        rows=json.loads(gzip.decompress(content))[PARENT]
        self.assertTrue(c['allCandidatesScored']);self.assertEqual(c['coverage'],921)
        self.assertEqual(set(rows),set(c['candidateKeys'])|{c['centerKey']})
        self.assertEqual(len(c['originalSampleKeys']),240)
        self.assertEqual(len(c['remainingAfterOriginalSample']),681)
        self.assertEqual(c['previouslyScored'],328);self.assertEqual(c['newlyRequired'],593)
        self.assertIn(c['bestWithinOrigin']['key'],rows)
        self.assertEqual(result['layouts'][0]['key'],c['bestWithinOrigin']['key'])
        for key,row in rows.items():
            self.assertEqual(self.search.space.key(row['state']),key)
            memory=self.search.space.memory(row['state'])
            self.assertIsNotNone(memory)
            self.assertLessEqual(memory['m'],22);self.assertLessEqual(memory['d'],2)
            self.assertLessEqual(memory['guard'],24)
            self.assertGreaterEqual(row['metrics']['daily']+1e-9,126.23457023071755)


if __name__=='__main__':unittest.main()
