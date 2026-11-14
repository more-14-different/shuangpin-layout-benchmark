"""Original memory and mapping audit for a bounded three-hop experiment."""
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

def main():
    notes=ROOT/'research/notes'
    file=notes/'2026-11-15-untoned-2121-three-step.json'
    r=json.loads(file.read_text());assert r['completed'] and len(r['results'])==r['screen']['selected']
    two_file=notes/'2026-11-15-untoned-2121-two-step.json'
    assert hashlib.sha256(two_file.read_bytes()).hexdigest()==r['sourceSha256']
    two=json.loads(two_file.read_text())
    c=json.loads((notes/'2026-11-14-untoned-2121-local-closure.json').read_text(encoding='utf-8'))
    for p,h in r['sourceHashes'].items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p
    fingerprint=''.join(hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'tools/probe_untoned_2121_three_step.js',two_file,ROOT/'tools/probe_untoned_2121_two_step.js'])
    assert hashlib.sha256(fingerprint.encode()).hexdigest()==r['fingerprint']
    html=(ROOT/'a7_CKT_R11.html').read_text(encoding='utf-8')
    data=json.loads(gzip.decompress(base64.b64decode(re.search(r'<script id="payload"[^>]*>([^<]+)',html)[1])))
    template=next(e for e in data['entries'] if e['id']=='QZ-e8f37a0998f9')
    byid={e['id']:e for e in c['records'].values()};pairs={e['id']:e for e in two['results']}
    def describe(a,b):
        return ' + '.join(f'{field}:{t}({a[field][t]})→{b[field][t]}' for field in ['initialMap','finalMap'] for t in a[field] if a[field][t]!=b[field][t])
    audits=[]
    for e in r['results']:
        pair=pairs[e['pairId']];first=byid[pair['parent']]
        assert e['path']==[first['id'],pair['id']]
        codes=[None]*len(data['pinyin'])
        for p,_ in data['base']:
            h,f=split(data['pinyin'][p],True);codes[p]=e['initialMap'][h]+e['finalMap']['ve' if f=='ue' else f]
        a=audit(data,dict(template,codeList=codes))
        assert a['M']==e['audit']['M']<=42 and a['ordinaryDisplacedCount']==e['audit']['D']<=2
        assert a['coverage']==399 and a['branchCount']==0 and a['unique']==e['audit']['unique']
        common=[codes[p] for p,_ in data['base']]
        assert 'QZ' not in common and 'ZQ' not in common
        assert all(len({code[i] for code in common})==21 for i in (0,1))
        assert e['tone']=='IVUAO'
        e['actualSteps']=[describe(r['base'],first),describe(first,pair),describe(pair,e)]
        audits.append(dict(id=e['id'],M=a['M'],D=a['ordinaryDisplacedCount'],unique=a['unique'],actualSteps=e['actualSteps']))
    (notes/'2026-11-15-untoned-2121-three-step-memory-audit.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(file.read_bytes()).hexdigest(),results=audits),indent=2))
    ordered=sorted(r['results'],key=lambda e:e['score']);selected=[];seen=set()
    for e in [r['base'],r['twoStepBest']]+[e for e in ordered if e['score']<r['twoStepBest']['score']-1e-10]+ordered[:5]+sorted(ordered,key=lambda e:-e['erg']['mx'])[:2]:
        if e['id'] in seen:continue
        seen.add(e['id']);selected.append(dict(e,toneKeysByTone=e['tone'],mutation=' THEN '.join(e.get('actualSteps',[])) or 'reference'))
    out=dict(sources=dict(htmlSha256=hashlib.sha256((ROOT/'a7_CKT_R11.html').read_bytes()).hexdigest()),contract=r['contract'],families=[dict(id=template['id'],baseline=dict(score=r['base']['score'],audit=r['base']['audit'],erg=r['base']['erg']),results=selected)])
    (notes/'2026-11-15-untoned-2121-three-step-finalists.json').write_text(json.dumps(out,indent=2))
    best=ordered[0];mapping={k:best[k] for k in ['id','capacity','initialMap','finalMap','score','audit','erg','actualSteps']}
    mapping.update(toneKeysByTone='IVUAO',shapeKeysByMeaning='AVUIO',toneDigitsByShapeMeaning='42310',status='bounded three-step research candidate; not locally closed')
    (ROOT/'research/config/untoned-2121-three-step-finalist-20261115.json').write_text(json.dumps(mapping,indent=2))
    print(json.dumps(dict(audited=len(audits),best=best['score'],beatsTwo=sum(e['score']<r['twoStepBest']['score']-1e-10 for e in ordered),replay=len(selected))))

if __name__=='__main__':main()
