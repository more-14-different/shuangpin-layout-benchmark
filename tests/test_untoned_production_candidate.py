import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from integrate_a7_qz_empty_six import decode_state, patch_production_ui, validate_expected


class ProductionCandidateTest(unittest.TestCase):
    def test_document_end_is_distinct_from_exported_html_literals(self):
        boundary = "if(typeof snowJiandaoTableRows==='function')({headers,rows,ids,raws}=snowJiandaoTableRows(headers,rows,ids,key,raws));"
        html = '<html><body><script>const exported="</body></html>";' + boundary + '</script></body></html>\n'
        patched = patch_production_ui(html)
        self.assertIn('const exported="</body></html>";', patched)
        self.assertEqual(patched.count('<script id="untoned-production-benchmark-ui">'), 1)
        self.assertEqual(patch_production_ui(patched), patched)
        self.assertTrue(patched.endswith('</script>\n</body></html>\n'))

    def test_candidate_state_round_trips_to_verified_mapping(self):
        config = json.loads((ROOT / 'research/config/untoned-2121-oc21-production-candidate.json').read_text(encoding='utf-8'))
        candidate = config['candidates'][0]
        decoded = decode_state(candidate)
        self.assertEqual(decoded['initialMap'], candidate['initialMap'])
        self.assertEqual(decoded['finalMap'], candidate['finalMap'])
        self.assertEqual(decoded['toneKeys'], config['auxiliarySemantics']['toneKeysByTone'])
        self.assertEqual(hashlib.sha256((ROOT / config['source']['report']).read_bytes()).hexdigest(), config['source']['reportSha256'])

    def test_score_contract_mismatch_blocks_publication(self):
        with self.assertRaisesRegex(ValueError, 'benchmark anchor mismatch'):
            validate_expected({'cktV51': 9.53}, {'cktV51': 9.541757919664565})


if __name__ == '__main__':
    unittest.main()
