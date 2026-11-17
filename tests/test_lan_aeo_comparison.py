"""Full carrier enumeration uses the actual production layouts and equal cohorts."""
import csv
import hashlib
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
FILE=ROOT/'research/notes/2026-11-18-lan-aeo-comparison.json'


class AeoEnumerationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.report=json.loads(FILE.read_text(encoding='utf8'))

    def test_complete_domains_actual_production_policy_and_equal_cohorts(self):
        r=self.report
        self.assertEqual(set(r['soundKeys']),set('BCDEFGHJKLMNPQRSTWXYZ'))
        self.assertTrue(r['htmlUnchanged']);self.assertFalse(r['auxiliaryPolicyReoptimized'])
        for f in r['families']:
            self.assertEqual(len(f['rows']),22)
            self.assertEqual({x['target'] for x in f['rows']},{'original',*r['soundKeys']})
            base=f['rows'][0]
            if f['family']=='toned':
                self.assertAlmostEqual(base['score'],9.107001929844568,places=9)
                for row in f['rows']:
                    self.assertEqual(row['memory']['D'],2)
                    if row['target']!='original':
                        self.assertEqual([row['memory'][k] for k in ['lower','guard']],[23,24])
                        self.assertEqual(row['memory']['audit']['zeroCarrierRules'],1)
                    for track,value in row['tracks'].items():
                        for k in ['count','totalWeight']:self.assertEqual(value[k],base['tracks'][track][k])
            else:
                self.assertEqual(f['baselineId'],'OC21-e1f155973380')
                self.assertEqual(f['policy']['keytao'],dict(word2='12',word3='213',word4='24'))
                self.assertEqual(f['policy']['sanpin'],dict(word2='12',word3='213',word4='21'))
                self.assertAlmostEqual(base['score'],9.53899646295756,places=9)
                for row in f['rows']:
                    self.assertEqual(row['audit']['D'],2)
                    self.assertEqual(row['audit']['M'],42 if row['target']=='original' else 41)
                    self.assertEqual(row['memoryAudit']['M'],row['audit']['M'])
                    for mode,tracks in row['modes'].items():
                        for track,value in tracks.items():
                            for k in ['count','totalWeight']:self.assertEqual(value[k],base['modes'][mode][track][k])

    def test_endpoint_winners_constraints_csv_and_provenance(self):
        families={f['family']:f for f in self.report['families']}
        toned=families['toned'];untoned=families['untoned']
        for f,best,best_other in [(toned,'C','N'),(untoned,'R','F')]:
            variants=[r for r in f['rows'] if r['target']!='original']
            self.assertEqual(min(variants,key=lambda r:r['score'])['target'],best)
            self.assertEqual(min((r for r in variants if r['target'] not in ['C','R']),key=lambda r:r['score'])['target'],best_other)
            self.assertTrue(all(r['score']>f['rows'][0]['score'] for r in variants))
        for key in ['Q','Z']:
            row=next(r for r in toned['rows'] if r['target']==key);self.assertFalse(row['passesLeft'])
        q=next(r for r in untoned['rows'] if r['target']=='Q');self.assertTrue(q['audit']['qz'])
        with FILE.with_suffix('.csv').open(encoding='utf-8-sig',newline='') as stream:
            rows=list(csv.DictReader(stream))
        self.assertEqual(len(rows),44)
        for row in rows:
            f=families[row['family']];score=next(r['score'] for r in f['rows'] if r['target']==row['target'])
            self.assertEqual(float(row['cktV51']),score)
            self.assertAlmostEqual(float(row['deltaCKT']),score-f['rows'][0]['score'],places=12)
        for file,sha in self.report['sourceHashes'].items():
            self.assertEqual(hashlib.sha256((ROOT/file).read_bytes()).hexdigest(),sha)

    def test_selected_full_replays_match_enumeration_and_recorded_coverage(self):
        r=self.report;f=next(f for f in r['families'] if f['family']=='toned')
        covered={'original'}
        for data,ending in [(r['tonedSelectedColumns'],'name'),(r['tonedCRColumns'],'name')]:
            for v in data['variants']:
                key=v[ending][-1];covered.add(key)
                row=next(row for row in f['rows'] if row['target']==key)
                self.assertAlmostEqual(v['metrics']['cktV51'],row['score'],places=9)
                self.assertAlmostEqual(v['metrics']['daily'],row['daily'],places=9)
                for track,values in v['benchmark']['ckt']['v51']['tracks'].items():
                    for field,value in values.items():
                        if isinstance(value,(float,int)):self.assertAlmostEqual(value,row['tracks'][track][field],places=9)
        self.assertEqual(covered,set(r['columnCoverage']['toned']))
        self.assertEqual({v['target'] for v in r['untonedSelectedColumns']['results']},set(r['columnCoverage']['untoned']))
        for data in [r['tonedSelectedColumns'],r['tonedCRColumns']]:
            n=data['baselineBenchmark'];self.assertEqual(n['memory']['lower'],24);self.assertEqual(n['memory']['guard'],25)
        for source in ['2026-11-18-lan-aeo-toned.json','2026-11-18-lan-aeo-untoned.json']:
            enumeration=json.loads((ROOT/'research/notes'/source).read_text(encoding='utf8'))
            self.assertTrue(enumeration['completed'])
            for path,sha in enumeration['sourceHashes'].items():
                self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),sha)


if __name__=='__main__':unittest.main()
