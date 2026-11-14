"""Audit every hard-legal two-hop endpoint with the original M-R2 implementation."""
import base64
import gzip
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'research/.cache/R11_integrated_replay'))
from memory_r2 import audit
from audit import split

HEADS = 'b p m f d t n l g k h j q x zh ch sh r z c s A E O W Y YU'.split()
FINALS = 'a ai an ang ao e ei en eng er i ia ian iang iao ie in ing iong iu o ong ou u ua uai uan uang ui un uo v van ve vn'.split()


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def main():
    directory = ROOT / 'research/.cache/untoned-2126-twohop-exhaustive'
    manifest_file = directory / 'manifest.json'
    saved = json.loads(manifest_file.read_text(encoding='utf-8'))
    for file, expected in saved['sourceHashes'].items():
        assert sha(file) == expected, f'Source changed: {file}'
    html = (ROOT / 'a7_CKT_R11.html').read_text(encoding='utf-8')
    data = json.loads(gzip.decompress(base64.b64decode(re.search(r'<script id="payload"[^>]*>([^<]+)', html)[1])))
    production = next(e for e in data['entries'] if e['id'] == 'SNOW-SHENYUN-21X26-D3V1-BALANCED')
    pairs = []
    for py, code in zip(data['pinyin'], production['codeList']):
        if code is None:
            pairs.append(None)
        else:
            h, f = split(py, True)
            pairs.append((HEADS.index(h), 27 + FINALS.index('ve' if f == 'ue' else f)))
    count = 0
    for row in saved['rows']:
        state = base64.b64decode(row['key'])
        assert len(state) == 62 and all(k < 26 for k in state)
        keys = [chr(65+k) for k in state]
        code_list = [None if pair is None else keys[pair[0]] + keys[pair[1]] for pair in pairs]
        result = audit(data, {**production, 'codeList': code_list})
        assert result['M'] == row['audit']['M'] <= 40
        assert result['ordinaryDisplacedCount'] == row['audit']['D'] <= 3
        assert result['branchCount'] == row['audit']['branches'] == 0
        assert result['unique'] == result['coverage'] == 399
        assert sum(keys[27 + FINALS.index(v)] != v.upper() for v in 'aeiou') == row['audit']['V'] <= 1
        codes = [code_list[p] for p, _ in data['base']]
        assert 'QZ' not in codes and 'ZQ' not in codes
        assert set(c[0] for c in codes).isdisjoint('AEUIO')
        assert row['comfortable'] == all(row['erg'][k] >= saved['baseline']['erg'][k] - 1e-12 for k in ['mx','homeS2','homeFloor'])
        count += 1
        if count % 5000 == 0:
            print(json.dumps({'memoryAudited':count,'total':len(saved['rows'])}), flush=True)
    report = {'version':1,'passed':True,'manifestSha256':sha(manifest_file),'fingerprint':saved['fingerprint'],'originalMR2Verified':count,'comfortableVerified':sum(r['comfortable'] for r in saved['rows']),'memoryScriptSha256':sha(ROOT/'research/.cache/R11_integrated_replay/memory_r2.py'),'auditorSha256':sha(__file__)}
    (ROOT / 'research/notes/2026-11-14-untoned-2126-twohop-memory-verification.json').write_text(json.dumps(report,indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
