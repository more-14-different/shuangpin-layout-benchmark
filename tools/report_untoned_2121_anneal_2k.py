"""Independent original-memory verification and export for the 2k experiment."""
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
    notes=ROOT/'research/notes';file=notes/'2026-11-15-untoned-2121-anneal-2k.json'
    r=json.loads(file.read_text());assert r['completed'] and r['seedsVerified']
    assert len(r['chains'])==5 and all(c['newScores']==400 for c in r['chains'])
    assert sum(t['newScore'] for t in r['trajectory'])==2000
    assert len({t['to'] for t in r['trajectory'] if t['newScore']})==2000
    assert len([e for e in r['states'].values() if e.get('newScore')])==2000
    for p,h in r['sourceHashes'].items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p
    assert hashlib.sha256(json.dumps(r['sourceHashes'],separators=(',',':'),ensure_ascii=False).encode()).hexdigest()==r['fingerprint']
    html=(ROOT/'a7_CKT_R11.html').read_text(encoding='utf-8')
    data=json.loads(gzip.decompress(base64.b64decode(re.search(r'<script id="payload"[^>]*>([^<]+)',html)[1])))
    template=next(e for e in data['entries'] if e['id']=='QZ-e8f37a0998f9')
    audits=[]
    for e in r['states'].values():
        codes=[None]*len(data['pinyin'])
        for p,_ in data['base']:
            h,f=split(data['pinyin'][p],True);codes[p]=e['initialMap'][h]+e['finalMap']['ve' if f=='ue' else f]
        a=audit(data,dict(template,codeList=codes));common=[codes[p] for p,_ in data['base']]
        assert a['M']==e['audit']['M']<=42 and a['ordinaryDisplacedCount']==e['audit']['D']<=2
        assert a['coverage']==399 and a['branchCount']==0 and a['unique']==e['audit']['unique']
        assert sum(e['finalMap'][f]!=f.upper() for f in 'aeiou')==e['audit']['V']<=5
        assert not any(set(code)&set('IVUAO') for code in common)
        assert 'QZ' not in common and 'ZQ' not in common
        assert all(len({c[i] for c in common})==21 for i in (0,1))
        assert e['tone']=='IVUAO'
        audits.append(dict(id=e['id'],M=a['M'],D=a['ordinaryDisplacedCount'],unique=a['unique']))
    for chain in r['chains']:
        ts=[t for t in r['trajectory'] if t['chain']==chain['index']]
        assert sum(t['newScore'] for t in ts)==400
        for t in ts:
            assert t['from'] in r['states'] and t['to'] in r['states']
            assert r['states'][t['to']]['score']==t['score']
            assert t['phase']==('coarse' if t['step']%100<30 else 'fine')
        assert r['states'][chain['bestId']]['score']<=r['states'][chain['seedId']]['score']+1e-10
    digest=hashlib.sha256(file.read_bytes()).hexdigest()
    (notes/'2026-11-15-untoned-2121-anneal-2k-memory-audit.json').write_text(json.dumps(dict(sourceSha256=digest,results=audits),indent=2))
    selected=[];seen=set()
    def add(e):
        if e['id'] not in seen:seen.add(e['id']);selected.append(dict(e,toneKeysByTone=e['tone']))
    for e in r['seeds']:add(e)
    for chain in r['chains']:add(r['states'][chain['bestId']])
    ordered=sorted(r['states'].values(),key=lambda e:e['score'])
    for e in ordered[:5]:add(e)
    for metric,reverse in [('mx',True),('homeFloor',True),('rpMax',False)]:
        for e in sorted(r['archive'],key=lambda e:e['erg'][metric],reverse=reverse)[:2]:add(e)
    practical = [e for e in r['archive'] if e['score'] <= 9.60 and e['erg']['mx'] >= 135 and e['erg']['rpMax'] <= .06]
    for e in sorted(practical,key=lambda e:e['score'])[:3]:add(e)
    production=r['seeds'][-1]
    for e in r['states'].values():
        if e.get('newScore') and e['score']<production['score'] and e['erg']['mx']>=production['erg']['mx'] and e['erg']['rpMax']<=production['erg']['rpMax']:
            add(e)
    for e in sorted((e for e in r['states'].values() if e.get('newScore')),key=lambda e:e['score'])[:2]:add(e)
    out=dict(sources=dict(htmlSha256=hashlib.sha256((ROOT/'a7_CKT_R11.html').read_bytes()).hexdigest()),contract=r['contract'],families=[dict(id=template['id'],baseline=dict(score=r['seeds'][-1]['score'],audit=r['seeds'][-1]['audit'],erg=r['seeds'][-1]['erg']),results=selected)])
    (notes/'2026-11-15-untoned-2121-anneal-2k-finalists.json').write_text(json.dumps(out,indent=2))
    representatives=[r['states'][c['bestId']] for c in r['chains']]+sorted((e for e in r['states'].values() if e.get('newScore')),key=lambda e:e['score'])[:1]
    representatives += [e for e in r['states'].values() if e.get('newScore') and e['score']<production['score'] and e['erg']['mx']>=production['erg']['mx'] and e['erg']['rpMax']<=production['erg']['rpMax']]
    mapping=dict(layouts=[dict(e,toneKeysByTone=e['tone'],shapeKeysByMeaning='AVUIO',toneDigitsByShapeMeaning='42310',status='heuristic 2k research; not locally closed') for e in {e['id']:e for e in representatives}.values()])
    for e in mapping['layouts']:e.pop('modes',None)
    (ROOT/'research/config/untoned-2121-anneal-2k-finalists-20261115.json').write_text(json.dumps(mapping,indent=2))
    print(json.dumps(dict(newScores=2000,states=len(audits),archive=len(r['archive']),best=ordered[0]['score'],selected=len(selected))))

if __name__=='__main__':main()
