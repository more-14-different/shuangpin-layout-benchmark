"""Re-audit saved candidates with the original M-R2 implementation."""
import base64
import gzip
import hashlib
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPLAY = ROOT / 'research/.cache/R11_integrated_replay'
sys.path.insert(0, str(REPLAY))
from audit import split
from memory_r2 import audit


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    html = ROOT / 'a7_CKT_R11.html'
    data = json.loads(gzip.decompress(base64.b64decode(
        re.search(r'<script id="payload"[^>]*>([^<]+)', html.read_text(encoding='utf-8'))[1])))
    snow = Path('D:/C2D/Documents/rime-snow-pinyin')
    deployment = json.loads((snow / 'config/shenyun-21x26-mapping.json').read_text(encoding='utf-8'))
    deployed_entry = next(e for e in data['entries'] if e['id'] == deployment['id'])
    assert deployed_entry['initialMap'] == deployment['initialMap']
    assert deployed_entry['finalMap'] == deployment['finalMap']
    assert deployed_entry['tone'] == deployment['toneKeysByTone']
    files = [
        '2026-11-14-untoned-2126-v51-descent.json',
        '2026-11-14-untoned-2126-v51-combinations.json',
        '2026-11-14-untoned-2121-v51-partial.json',
    ]
    results = []
    for name in files:
        source = ROOT / 'research/notes' / name
        report = json.loads(source.read_text(encoding='utf-8'))
        assert report['sources']['htmlSha256'] == sha(html), 'HTML changed since search'
        for family in report['families']:
            template = next(e for e in data['entries'] if e['id'] == family['id'])
            baseline = family['baseline']['audit']
            for row in family['results']:
                entry = {**template, **row, 'tone': row['toneKeysByTone']}
                codes = []
                for py, code in zip(data['pinyin'], template['codeList']):
                    if not code:
                        codes.append(None)
                        continue
                    h, r = split(py, True)
                    r = 've' if r == 'ue' else r
                    codes.append(row['initialMap'][h] + row['finalMap'][r])
                entry['codeList'] = codes
                original = audit(data, entry)
                v = sum(row['finalMap'][f] != f.upper() for f in 'aeiou')
                actual = [original['M'], original['ordinaryDisplacedCount'], v,
                          original['branchCount'], original['unique']]
                expected = [row['audit'][k] for k in ['M', 'D', 'V', 'branches', 'unique']]
                assert actual == expected, (row['id'], actual, expected)
                common = [codes[p] for p, _ in data['base']]
                assert original['coverage'] == 399
                assert 'QZ' not in common and 'ZQ' not in common
                assert row['audit']['M'] <= baseline['M']
                assert row['audit']['D'] <= baseline['D']
                assert row['audit']['V'] <= baseline['V']
                assert row['audit']['unique'] >= baseline['unique']
                assert row['toneKeysByTone'] == template['tone']
                assert math.isfinite(row['score']) and row['score'] > 0
                passes = all(row['erg'][k] >= family['baseline']['erg'][k] - 1e-12
                             for k in ['mx', 'homeS2', 'homeFloor'])
                assert row['strictComfort'] == passes
                results.append({'source': name, 'id': row['id'], 'originalMR2': actual,
                                'common399CodeSha256': hashlib.sha256(json.dumps(common).encode()).hexdigest()})
    sources = [html, ROOT / 'tools/ckt_v4_upstream_role_tables.json',
               ROOT / 'research/.cache/ckt-v4-ergonomics.json', REPLAY / 'memory_r2.py',
               snow / 'snow_pinyin.base.dict.yaml', snow / 'rime-stroke/stroke.dict.yaml',
               snow / 'scripts/research/evaluate_ckt_v4_word_aux_order.js',
               snow / 'scripts/research/evaluate_ckt51_aux_order.js',
               snow / 'config/shenyun-21x26-mapping.json']
    output = {'version': 'untoned-v51-original-memory-and-deployment-verification-1',
              'passed': True, 'recordsVerified': len(results),
              'inputReports': {name: sha(ROOT / 'research/notes' / name) for name in files},
              'sourceHashes': {str(p): sha(p) for p in sources}, 'results': results}
    target = ROOT / 'research/notes/2026-11-14-untoned-v51-original-memory-verification.json'
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'recordsVerified': len(results)}))


if __name__ == '__main__':
    main()
