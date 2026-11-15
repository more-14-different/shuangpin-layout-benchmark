import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from integrate_a7_qz_empty_six import apply_robust_production_display, decode_state, patch_production_ui, score_v5_v51_21x21, validate_expected


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

    def test_robust_cohort_round_trip_and_report_anchors(self):
        config = json.loads((ROOT / 'research/config/untoned-2121-oc21-robust-candidates.json').read_text(encoding='utf-8'))
        report = json.loads((ROOT / config['auxOrderSelection']['report']).read_text(encoding='utf-8'))
        self.assertEqual(len(config['candidates']), 2)
        for candidate in config['candidates']:
            decoded = decode_state(candidate)
            self.assertEqual(decoded['initialMap'], candidate['initialMap'])
            self.assertEqual(decoded['finalMap'], candidate['finalMap'])
            self.assertEqual(decoded['toneKeys'], 'IVUAO')
            row = report['schemes'][candidate['id']]
            self.assertEqual(candidate['expected']['cktV51'], row['mainPositiveRobustDefaultScore'])
            self.assertNotIn('cktV51DefaultPointOptimal', candidate['expected'])
        self.assertEqual(config['productionDisplay'], 'robust-v51')

    def test_production_attributes_use_robust_replay_and_remove_point_metrics(self):
        aggregate = dict(firstAuxRate=.2, secondAuxRate=.1, thirdAuxRate=.02, selectionRate=.003,
                         motorUpperMs=300, cognitiveMs=100, effectiveMs=400, meanKeys=3.8,
                         meanRejectedCandidates=.004, meanPageActions=.00001)
        entry = dict(readmeBenchmarkMetrics={'aggregateSelectionRate': .9, 'cktV51DefaultPointOptimal': 1},
                     productionCandidateMetrics=dict(cktV51Policies={'candidate': {
                         'keytao': {'word2':'12','word3':'213','word4':'24'},
                         'sanpin': {'word2':'12','word3':'213','word4':'21'}}}, cktV51Aggregate=aggregate,
                         cktV51DefaultPointOptimal=1, cktV51DefaultPointPolicies={}, cktV51DefaultPointAggregate={}))
        apply_robust_production_display(entry, {'criterion':'test'})
        for field,value in aggregate.items():
            self.assertEqual(entry['readmeBenchmarkMetrics']['aggregate'+field[0].upper()+field[1:]], value)
        self.assertNotIn('cktV51DefaultPointOptimal', entry['readmeBenchmarkMetrics'])
        self.assertFalse(any(field.startswith('cktV51DefaultPoint') for field in entry['productionCandidateMetrics']))

    def test_candidate_aux_order_does_not_change_s005_reference(self):
        with tempfile.TemporaryDirectory() as location:
            temp = Path(location)
            output = temp / 'score.json'
            def inspect_generated(*args, **kwargs):
                source = Path(args[1]).read_text(encoding='utf-8')
                policies = source.split('const V51_POLICIES = Object.freeze({', 1)[1].split('function parseArgs', 1)[0]
                candidate, reference = policies.split('reference:', 1)
                self.assertIn('sanpin: { word2: "12", word3: "213", word4: "21" }', candidate)
                self.assertIn('sanpin: { word2: "12", word3: "213", word4: "23" }', reference)
                self.assertIn('keytao: { word2: "12", word3: "213", word4: "24" }', reference)
                output.write_text('{}', encoding='utf-8')
            with patch('integrate_a7_qz_empty_six.run', side_effect=inspect_generated):
                score_v5_v51_21x21(ROOT / 'tools/score_ckt_v5_v51_scheme.js', temp/'page.html', output, 'bf', temp,
                                  keytao_word3='213', sanpin_word4='21')


if __name__ == '__main__':
    unittest.main()
