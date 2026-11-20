"""Original M-R2 audit plus explicit QZ/ZQ absence for all scored layouts."""
import gzip
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT / 'research/notes/2026-11-20-um40-double-empty-v52'
REPLAY = ROOT / 'research/.cache/R11_integrated_replay'
sys.path.insert(0, str(REPLAY))
from memory_r2 import audit
from audit import split

HEADS = 'b p m f d t n l g k h j q x zh ch sh r z c s A E O W Y YU'.split()
FINALS = 'a ai an ang ao e ei en eng er i ia ian iang iao ie in ing iong iu o ong ou u ua uai uan uang ui un uo v van ve vn'.split()
FAMILIES = [[h] for h in HEADS[:21]] + [['A', 'E', 'O'], ['W'], ['Y', 'YU']]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    report = json.loads(Path(str(PREFIX) + '.json').read_text(encoding='utf-8'))
    checked = json.loads(Path(str(PREFIX) + '-verification.json').read_text(encoding='utf-8'))
    contract = json.loads((ROOT / 'research/.cache/untoned-t2126-m4-20261120/contract.json').read_text(encoding='utf-8'))
    data = {key: contract['inputs'][key] for key in ['pinyin', 'base']}
    archive = Path(str(PREFIX) + '-scores.jsonl.gz')
    rows = [json.loads(line) for line in gzip.decompress(archive.read_bytes()).splitlines() if line]
    seen = set()
    max_distance = 0
    for row in rows:
        state = row['state']
        assert len(state) == 62 and state not in seen
        seen.add(state)
        initials = dict(zip(HEADS, state[:27]))
        finals = dict(zip(FINALS, state[27:]))
        codes = [None] * len(data['pinyin'])
        for p, _ in data['base']:
            head, final = split(data['pinyin'][p], False)
            codes[p] = initials[head] + finals['ve' if final == 'ue' else final]
        value = audit(data, {'id': row['id'], 'codeList': codes})
        assert value['M'] == row['memory']['M'] <= 40, row['id']
        assert value['ordinaryDisplacedCount'] == row['memory']['D'] <= 3, row['id']
        assert value['branchCount'] == row['memory']['branches'] == 0
        assert value['unique'] == value['coverage'] == 399
        assert initials['Y'] == initials['YU'] and len({initials[h] for h in 'AEO'}) == 1
        assert len(set(initials.values())) <= 21 and not set(initials.values()) & set('AEIOU')
        common = [codes[p] for p, _ in data['base']]
        assert 'QZ' not in common and 'ZQ' not in common, row['id']
        distance = sum(initials[g[0]] != report['anchors'][0]['initialMap'][g[0]] for g in FAMILIES)
        assert distance <= 2, row['id']
        max_distance = max(max_distance, distance)
    selected_ids = {e['id'] for e in report['selected']}
    assert selected_ids <= {r['id'] for r in rows}
    assert selected_ids == {r['id'] for r in checked['checked']}
    result = dict(passed=True, verifiedStates=len(rows), maximumM=max(r['memory']['M'] for r in rows),
                  maximumD=max(r['memory']['D'] for r in rows), maximumInitialFamilyDistance=max_distance,
                  allCommon399Unique=True, allQZEmpty=True, allZQEmpty=True,
                  selectedIds=sorted(selected_ids), archiveSha256=sha(archive), auditorSha256=sha(__file__),
                  originalMR2Sha256=sha(REPLAY / 'memory_r2.py'), splitterSha256=sha(REPLAY / 'audit.py'))
    Path(str(PREFIX) + '-memory-verification.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
