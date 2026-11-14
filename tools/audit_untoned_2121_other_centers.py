"""Original memory audit of all other-center baselines and candidates."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
from memory_r2 import audit
from audit import split
file=ROOT/'research/notes/2026-11-15-untoned-2121-other-centers.json'
r=json.loads(file.read_text());assert r['completed']
for p,h in r['sourceHashes'].items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h
inputs=[ROOT/'tools/probe_untoned_2121_other_centers.js',ROOT/'research/notes/2026-11-14-untoned-2121-cross.json',ROOT/'research/notes/2026-11-14-untoned-2121-v51-partial.json']
assert hashlib.sha256(''.join(hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs).encode()).hexdigest()==r['fingerprint']
html=(ROOT/'a7_CKT_R11.html').read_text(encoding='utf-8')
data=json.loads(gzip.decompress(base64.b64decode(re.search(r'<script id="payload"[^>]*>([^<]+)',html)[1])))
template=next(e for e in data['entries'] if e['id']=='QZ-e8f37a0998f9')
results=[]
for family in r['families']:
    assert family['baselineVerified'] and len(family['results'])==family['screen']['selected']
    for row in [family['baseline']]+family['results']:
        codes=[None]*len(data['pinyin'])
        for p,_ in data['base']:
            h,f=split(data['pinyin'][p],True);codes[p]=row['initialMap'][h]+row['finalMap']['ve' if f=='ue' else f]
        a=audit(data,dict(template,codeList=codes));common=[codes[p] for p,_ in data['base']]
        assert a['M']==row['audit']['M']<=42 and a['ordinaryDisplacedCount']==row['audit']['D']<=2
        assert a['branchCount']==0 and a['coverage']==399 and a['unique']==row['audit']['unique']
        assert 'QZ' not in common and 'ZQ' not in common
        assert all(len({c[i] for c in common})==21 for i in (0,1))
        results.append(dict(center=family['id'],id=row['id'],M=a['M'],D=a['ordinaryDisplacedCount'],unique=a['unique']))
(ROOT/'research/notes/2026-11-15-untoned-2121-other-centers-memory-audit.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(file.read_bytes()).hexdigest(),results=results),indent=2))
print(json.dumps(dict(originalMemoryAudited=len(results))))
