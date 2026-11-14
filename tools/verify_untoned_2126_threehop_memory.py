"""Original M-R2 audit for every hard-legal three-hop and multi-center endpoint."""
import base64
import gzip
import json
import re
from pathlib import Path
from verify_untoned_2126_recenter_memory import ROOT, HEADS, FINALS, audit, split, sha

DIRECTORY = ROOT / 'research/.cache/untoned-2126-threehop-20261115'


def main():
    checkpoint = json.loads((DIRECTORY/'checkpoint.json').read_text(encoding='utf-8'))
    for file,digest in checkpoint['sourceHashes'].items():
        assert sha(file) == digest, f'Source changed: {file}'
    html = (ROOT/'a7_CKT_R11.html').read_text(encoding='utf-8')
    data = json.loads(gzip.decompress(base64.b64decode(re.search(r'<script id="payload"[^>]*>([^<]+)',html)[1])))
    production = next(e for e in data['entries'] if e['id']=='SNOW-SHENYUN-21X26-D3V1-BALANCED')
    pairs = []
    for py,code in zip(data['pinyin'],production['codeList']):
        if code is None:
            pairs.append(None)
        else:
            h,f = split(py,True)
            pairs.append((HEADS.index(h),27+FINALS.index('ve' if f=='ue' else f)))
    contract = {'fingerprint':checkpoint['fingerprint'],'memoryScriptSha256':sha(ROOT/'research/.cache/R11_integrated_replay/memory_r2.py'),'auditorSha256':sha(__file__),'helperSha256':sha(ROOT/'tools/verify_untoned_2126_recenter_memory.py')}
    cache_file = DIRECTORY/'memory-verified-keys.json.gz'
    verified = set()
    if cache_file.exists():
        cached = json.loads(gzip.decompress(cache_file.read_bytes()))
        assert cached['contract']==contract
        verified.update(cached['keys'])
    unique = set()
    stages = []
    added = 0
    for stage in checkpoint['stages']:
        assert sha(stage['manifestFile'])==stage['manifestSha256']
        manifest = json.loads(Path(stage['manifestFile']).read_text(encoding='utf-8'))
        assert manifest['fingerprint']==checkpoint['fingerprint']
        for row in manifest['rows']:
            unique.add(row['key'])
            assert row['comfortable']==all(row['erg'][k]>=checkpoint['baseline']['erg'][k]-1e-12 for k in ['mx','homeS2','homeFloor'])
            if row['key'] in verified:
                continue
            state = base64.b64decode(row['key'])
            assert len(state)==62 and all(k<26 for k in state)
            keys = [chr(65+k) for k in state]
            codes = [None if pair is None else keys[pair[0]]+keys[pair[1]] for pair in pairs]
            result = audit(data,{**production,'codeList':codes})
            assert result['M']==row['audit']['M']<=40
            assert result['ordinaryDisplacedCount']==row['audit']['D']<=3
            assert result['branchCount']==row['audit']['branches']==0
            assert result['unique']==result['coverage']==399
            assert sum(keys[27+FINALS.index(v)]!=v.upper() for v in 'aeiou')==row['audit']['V']<=1
            common = [codes[p] for p,_ in data['base']]
            assert 'QZ' not in common and 'ZQ' not in common
            assert set(c[0] for c in common).isdisjoint('AEUIO')
            verified.add(row['key'])
            added += 1
            if added%5000==0:
                print(json.dumps({'newMR2Verified':added,'totalCached':len(verified)}),flush=True)
        stages.append({'index':stage['index'],'manifestSha256':stage['manifestSha256'],'hardLegalVerified':len(manifest['rows']),'comfortableVerified':sum(r['comfortable'] for r in manifest['rows'])})
    cache_file.write_bytes(gzip.compress(json.dumps({'contract':contract,'keys':sorted(verified)}).encode(),compresslevel=9,mtime=0))
    report = {'version':1,'passed':True,**contract,'completedAtSnapshot':checkpoint['completed'],'uniqueHardLegalVerified':len(unique),'newlyAudited':added,'stages':stages}
    (ROOT/'research/notes/2026-11-15-untoned-2126-threehop-memory-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))


if __name__=='__main__':
    main()
