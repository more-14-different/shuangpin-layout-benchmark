"""Original M-R2 audit and replay export for the bounded two-hop probe."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT / 'research/.cache/R11_integrated_replay'))
from memory_r2 import audit
from audit import split

def main():
    notes = ROOT / 'research/notes'
    p = notes / '2026-11-15-untoned-2121-two-step.json'
    r = json.loads(p.read_text())
    assert r['completed'] and len(r['results']) == r['screen']['selected']
    for file,digest in r['sourceHashes'].items():
        assert hashlib.sha256(Path(file).read_bytes()).hexdigest()==digest,file
    cpath = notes / '2026-11-14-untoned-2121-local-closure.json'
    assert hashlib.sha256(cpath.read_bytes()).hexdigest()==r['sourceSha256']
    script_hash = hashlib.sha256((ROOT / 'tools/probe_untoned_2121_two_step.js').read_bytes()).hexdigest()
    assert hashlib.sha256((script_hash+r['sourceSha256']).encode()).hexdigest()==r['fingerprint']
    c = json.loads(cpath.read_text(encoding='utf-8'))
    html = (ROOT / 'a7_CKT_R11.html').read_text(encoding='utf-8')
    data = json.loads(gzip.decompress(base64.b64decode(re.search(r'<script id="payload"[^>]*>([^<]+)',html)[1])))
    template = next(e for e in data['entries'] if e['id']=='QZ-e8f37a0998f9')
    audits = []
    byid = {e['id']:e for e in c['records'].values()}
    def describe(a,b):
        return ' + '.join(f"{field}:{t}({a[field][t]})→{b[field][t]}" for field in ['initialMap','finalMap'] for t in a[field] if a[field][t]!=b[field][t])
    for row in r['results']:
        for leg in row['legs']:
            assert byid[leg['id']]['score']==leg['score']
        codes = [None]*len(data['pinyin'])
        for pinyin,_ in data['base']:
            h,f = split(data['pinyin'][pinyin],True)
            codes[pinyin]=row['initialMap'][h]+row['finalMap']['ve' if f=='ue' else f]
        a = audit(data,dict(template,codeList=codes))
        assert a['M']==row['audit']['M']<=42
        assert a['ordinaryDisplacedCount']==row['audit']['D']<=2
        assert a['branchCount']==0 and a['coverage']==399
        assert a['unique']==row['audit']['unique']
        common = [codes[i] for i,_ in data['base']]
        assert 'QZ' not in common and 'ZQ' not in common
        assert all(len({code[i] for code in common})==21 for i in (0,1))
        mid=byid[row['parent']]
        row['actualSteps']=[describe(r['base'],mid),describe(mid,row)]
        audits.append(dict(id=row['id'],M=a['M'],D=a['ordinaryDisplacedCount'],unique=a['unique'],coverage=a['coverage'],actualSteps=row['actualSteps']))
    (notes / '2026-11-15-untoned-2121-two-step-memory-audit.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(p.read_bytes()).hexdigest(),results=audits),indent=2))
    base = r['base']
    ids = set()
    selected = []
    ordered = sorted(r['results'],key=lambda e:e['score'])
    best = ordered[0]
    mapping = {k:best[k] for k in ['id','capacity','initialMap','finalMap','score','audit','erg']}
    mapping.update(status='research; bounded two-step speed candidate; not locally closed',
                   toneKeysByTone='IVUAO',shapeKeysByMeaning='AVUIO',toneDigitsByShapeMeaning='42310',
                   actualSteps=best['actualSteps'],sourceSha256=hashlib.sha256(p.read_bytes()).hexdigest())
    (ROOT / 'research/config/untoned-2121-two-step-finalist-20261115.json').write_text(json.dumps(mapping,indent=2))
    # Replay all improvements, the closest six failures, and useful comfort cases.
    for e in [base]+[e for e in ordered if e['score']<base['score']-1e-10]+ordered[:6]+sorted(r['results'],key=lambda e:-e['erg']['mx'])[:2]:
        if e['id'] in ids:continue
        ids.add(e['id']);selected.append(dict(e,toneKeysByTone=e['tone'],mutation=' THEN '.join(e.get('actualSteps',[])) or 'base'))
    out = dict(version='bounded-two-step-replay-selection-1',sources=dict(htmlSha256=hashlib.sha256((ROOT/'a7_CKT_R11.html').read_bytes()).hexdigest()),contract=r['contract'],
               families=[dict(id=template['id'],baseline=dict(score=base['score'],audit=base['audit'],erg=base['erg']),results=selected)])
    (notes / '2026-11-15-untoned-2121-two-step-finalists.json').write_text(json.dumps(out,indent=2))
    print(json.dumps(dict(verified=len(audits),improvements=sum(e['score']<base['score']-1e-10 for e in r['results']),best=ordered[0]['score'],replay=len(selected))))

if __name__=='__main__':
    main()
