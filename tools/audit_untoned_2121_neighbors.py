"""Replay improving v5.1 neighbors through the existing 20-contract engines."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'research/.cache/untoned-2121-v51'
REPLAY = ROOT / 'research/.cache/R11_integrated_replay'
report_path = ROOT / 'research/notes/2026-11-14-untoned-2121-v51-neighbors.json'
report = json.loads(report_path.read_text())
base = next(r for r in report['results'] if r['mutation'] == 'baseline')
ids = {r['id'] for r in report['results'] if r['score'] <= base['score']}
entries = [e for e in json.loads((CACHE / 'candidates.json').read_text()) if e['id'] in ids]
for e in entries:
    e.pop('nf5Provenance', None)
(CACHE / 'entries.json').write_text(json.dumps(entries))
source = (REPLAY / 'eval_full.js').read_text()
source = source.replace("const R=__dirname;", 'const R=' + json.dumps(str(REPLAY)) + ';')
source = source.replace("require('./script1.js')", "require(path.join(R,'script1.js'))")
source = source.replace("require('./script2.js')", "require(path.join(R,'script2.js'))")
source = source.replace("path.join(R,'entries_to_score.json')", json.dumps(str(CACHE / 'entries.json')))
source = source.replace("path.join(R,'exact')", json.dumps(str(CACHE / 'exact')))
(CACHE / 'audit.js').write_text(source)
subprocess.run(['node', str(CACHE / 'audit.js')], check=True)
output = []
for e in entries:
    r = json.loads((CACHE / 'exact' / (e['id'] + '.json')).read_text())
    output.append({'id': e['id'], 'mutation': e['mutation'], 'movingHand': e['movingHand'],
                   'scores': r['scores'], 'tracks': {k: {x: v.get(x) for x in ['home', 'sfb', 'upperMs']} for k, v in r['tracks'].items()},
                   'verification': r['verification']})
(ROOT / 'research/notes/2026-11-14-untoned-2121-v51-ergonomics.json').write_text(json.dumps(output, indent=2))
