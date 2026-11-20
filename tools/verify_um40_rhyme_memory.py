"""Independently verify fixed initials, original M-R2, and Common399 uniqueness."""
import gzip
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT / 'research/notes/2026-11-20-um40-fixed-initial-rhymes'
REPLAY = ROOT / 'research/.cache/R11_integrated_replay'
sys.path.insert(0, str(REPLAY))
from memory_r2 import audit
from audit import split

HEADS = 'b p m f d t n l g k h j q x zh ch sh r z c s A E O W Y YU'.split()
FINALS = 'a ai an ang ao e ei en eng er i ia ian iang iao ie in ing iong iu o ong ou u ua uai uan uang ui un uo v van ve vn'.split()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    report = json.loads(Path(str(PREFIX) + '.json').read_text(encoding='utf-8'))
    contract = json.loads((ROOT / 'research/.cache/untoned-t2126-m4-20261120/contract.json').read_text(encoding='utf-8'))
    data = {key: contract['inputs'][key] for key in ['pinyin', 'base']}
    fixed = ''.join(report['anchor']['initialMap'][h] for h in HEADS)
    archive = Path(str(PREFIX) + '-scores.jsonl.gz')
    rows = [json.loads(line) for line in gzip.decompress(archive.read_bytes()).splitlines() if line]
    seen = set()
    for row in rows:
        state = row['state']
        assert len(state) == 62 and state not in seen
        seen.add(state)
        assert state[:27] == fixed, row['id']
        initials = dict(zip(HEADS, state[:27]))
        finals = dict(zip(FINALS, state[27:]))
        codes = [None] * len(data['pinyin'])
        for p, _ in data['base']:
            head, final = split(data['pinyin'][p], False)
            codes[p] = initials[head] + finals['ve' if final == 'ue' else final]
        value = audit(data, {'id': row['id'], 'codeList': codes})
        assert value['M'] == row['memory']['M'] <= 40, row['id']
        assert value['ordinaryDisplacedCount'] == row['memory']['D'] == 3, row['id']
        assert value['branchCount'] == 0
        assert value['unique'] == value['coverage'] == 399
    result = dict(passed=True, verifiedStates=len(rows), fixedInitials=fixed,
                  maximumM=max(r['memory']['M'] for r in rows), maximumD=3,
                  archiveSha256=sha(archive), auditorSha256=sha(__file__),
                  originalMR2Sha256=sha(REPLAY / 'memory_r2.py'), splitterSha256=sha(REPLAY / 'audit.py'))
    Path(str(PREFIX) + '-memory-verification.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
