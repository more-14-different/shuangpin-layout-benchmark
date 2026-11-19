"""Verify the installed page, semantic memory audit, and all policy components."""
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-u7x-02d-r11'
def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def main():
    report=read(str(PREFIX)+'-publication.json')
    for p,h in report['sourceHashes'].items():assert sha(p)==h,p
    assert sha(report['html'])==report['htmlAfterSha256'],'published page changed'
    sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
    import memory_r2
    prior=read(ROOT/'research/notes/2026-11-19-untoned-cr7e-v52-verification.json')
    entry=read(str(PREFIX)+'-policy-U7X-02d505540da0.json')
    for p,h in entry['sourceHashes'].items():assert sha(p)==h,p
    audit=memory_r2.audit(prior['auditInput'],entry)
    assert (audit['M'],audit['ordinaryDisplacedCount'],audit['coverage'],audit['unique'],audit['branchCount'])==(42,2,399,348,0)
    components=Path(str(PREFIX)+'-components-U7X-02d505540da0.json.gz')
    data=json.loads(gzip.decompress(components.read_bytes()))
    for case in data['cases'].values():
        assert len(case['results'])==144
        for row in case['results']:
            for track in row['tracks'].values():
                value=track['motorUpperMs']+sum(track[k]*v for k,v in zip(data['coefficients'],data['baselineCostsMs']))
                assert abs(value-track['effectiveMs'])<1e-9
    files=[Path(__file__),ROOT/'tools/publish_u7x_02d_r11.py',ROOT/'tools/robust_untoned_v52_policy.py',ROOT/'tools/verify_untoned_cr7e_far.js',
        ROOT/'research/config/u7x-02d-r11-candidate.json',ROOT/'research/config/untoned-2121-reviewed-integrator.py.gz',components,
        Path(str(PREFIX)+'-browser.json'),Path(str(PREFIX)+'-publication.json')]
    browser=read(str(PREFIX)+'-browser.json');assert not browser['pageErrors'] and abs(browser['score']-report['score'])<1e-9
    out=dict(id=report['id'],originalPageBeforeAnyWriteSha256=sha(ROOT/'research/.cache/untoned-cr7e-far-v52-20261120/main-before-u7x.html'),
        publishedSha256=report['htmlAfterSha256'],independentMemory={k:audit[k] for k in ['M','ordinaryDisplacedCount','coverage','unique','branchCount']},
        all288PolicyComponentFormulasVerified=True,sourceHashes={str(p):sha(p) for p in files})
    Path(str(PREFIX)+'-validation.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(out['independentMemory']))

if __name__=='__main__':main()
