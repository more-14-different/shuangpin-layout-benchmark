"""Verify every scored state with the original independent M-R2 auditor."""
import gzip
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT / 'research/notes/2026-11-20-untoned-m40d3-v52'
REPLAY = ROOT / 'research/.cache/R11_integrated_replay'
sys.path.insert(0, str(REPLAY))
from memory_r2 import audit
from audit import split

HEADS = 'b p m f d t n l g k h j q x zh ch sh r z c s A E O W Y YU'.split()
FINALS = 'a ai an ang ao e ei en eng er i ia ian iang iao ie in ing iong iu o ong ou u ua uai uan uang ui un uo v van ve vn'.split()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    checked = json.loads(Path(str(PREFIX) + '-verification.json').read_text(encoding='utf-8'))
    contract = json.loads((ROOT / 'research/.cache/untoned-t2126-m4-20261120/contract.json').read_text(encoding='utf-8'))
    data = {key: contract['inputs'][key] for key in ['pinyin', 'base']}
    archive = Path(str(PREFIX) + '-scores.jsonl.gz')
    rows = [json.loads(line) for line in gzip.decompress(archive.read_bytes()).splitlines() if line]
    seen = set()
    for row in rows:
        state = row['state']
        assert len(state) == 62 and state not in seen
        seen.add(state)
        initials = dict(zip(HEADS, state[:27]))
        finals = dict(zip(FINALS, state[27:]))
        codes = [None] * len(data['pinyin'])
        for p, _ in data['base']:
            head, final = split(data['pinyin'][p], False)
            if final == 'ue':
                final = 've'
            codes[p] = initials[head] + finals[final]
        value = audit(data, {'id': row['id'], 'codeList': codes})
        memory = row['memory']
        assert value['M'] == memory['M'] <= 40, row['id']
        assert value['ordinaryDisplacedCount'] == memory['D'] <= 3, row['id']
        assert value['firstLinks'] == memory['firstLinks']
        assert value['finalLinks'] == memory['finalLinks']
        assert value['branchCount'] == memory['branches'] == 0
        assert value['unique'] == value['coverage'] == 399
    assert checked['id'] in {row['id'] for row in rows}
    result = dict(passed=True, verifiedStates=len(rows), maximumM=max(r['memory']['M'] for r in rows),
                  maximumD=max(r['memory']['D'] for r in rows), selectedId=checked['id'],
                  archiveSha256=sha(archive), auditorSha256=sha(__file__),
                  originalMR2Sha256=sha(REPLAY / 'memory_r2.py'), splitterSha256=sha(REPLAY / 'audit.py'))
    Path(str(PREFIX) + '-memory-verification.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
