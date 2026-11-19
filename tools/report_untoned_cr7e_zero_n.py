"""Independent M-R2 audit and comparison of the A/E/O=N experiment."""
import hashlib
import gzip
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-19-untoned-cr7e-zero-n-v52'
REPLAY=ROOT/'research/.cache/R11_integrated_replay'
sys.path.insert(0,str(REPLAY))
import memory_r2

def main():
    search=json.loads(Path(str(PREFIX)+'.json').read_text(encoding='utf-8'))
    verified=json.loads(Path(str(PREFIX)+'-verification.json').read_text(encoding='utf-8'))
    assert search['completed'] and verified['completed']
    assert search['exactSwapPolish']['completed']
    for mapping in [search['sourceHashes'],search['exactSwapPolish']['sourceHashes'],verified['sourceHashes']]:
        for path,digest in mapping.items():
            assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest,path
    prior=json.loads((ROOT/'research/notes/2026-11-19-untoned-cr7e-v52-verification.json').read_text(encoding='utf-8'))
    out=dict(version='untoned-cr7e-zero-n-comparison-1',states=len(search['states']),
        screenedCenters=sum(s['name']=='screened final neighborhood' for s in search['stages']),
        exactSwapCenters=[s for s in search['stages'] if s['name']=='complete single-final and whole-group swaps'],
        initialMap=search['initialMap'],policy=search['policy'],contract=search['contract'],
        controls=search['controls'],results=[],completed=False)
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json'),REPLAY/'memory_r2.py',REPLAY/'audit.py']
    for row in verified['results']:
        independent=memory_r2.audit(verified['auditInput'],row)
        a=row['audit'];assert (independent['M'],independent['ordinaryDisplacedCount'],independent['branchCount'],independent['unique'])==(a['M'],a['D'],a['branches'],a['unique'])
        assert independent['coverage']==399
        result={k:row[k] for k in ['id','score','doubledScore','audit','parent','mutation','carrierOnlyDelta'] if k in row}
        result['pairedR']={k:row['pairedR'][k] for k in ['score','doubledScore','audit']}
        result['independentMemory']=independent
        policyfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json')
        if policyfile.exists():
            p=json.loads(policyfile.read_text(encoding='utf-8'));assert p['initialMap']==row['initialMap'] and p['finalMap']==row['finalMap']
            for path,digest in p['sourceHashes'].items():
                assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest,path
            result.update(optimal1x=p['optimal1x'],optimal2x=p['optimal2x']);sources.append(policyfile)
            result['optimalComparedToOriginalBaselines']={r['id']:{'one':p['optimal1x']['score']-r['optimal1x']['score'],
                'two':p['optimal2x']['score']-r['optimal2x']['score']} for r in prior['results'] if r['id'].startswith('OC21-')}
        result['trackDeltasNMinusR']={mode:{kind:{
            'effectiveMs':t['effectiveMs']-row['pairedR']['modes'][mode][kind]['effectiveMs'],
            'motorMs':t['motorUpperMs']-row['pairedR']['modes'][mode][kind]['motorUpperMs'],
            'selectionRate':t['selectionRate']-row['pairedR']['modes'][mode][kind]['selectionRate']
            } for kind,t in tracks.items()} for mode,tracks in row['modes'].items()}
        out['results'].append(result)
    leader_ids={search['bestDefault'][0]['id'],search['bestDoubled'][0]['id']}
    assert all('optimal1x' in r for r in out['results'] if r['id'] in leader_ids),'finish all leader policy enumerations'
    out['completed']=True
    checkpoint=ROOT/'research/.cache/untoned-cr7e-v52-20261119/zero-n-before-exact-swaps.json'
    checkpoint_archive=Path(str(PREFIX)+'-before-exact-swaps.json.gz')
    checkpoint_archive.write_bytes(gzip.compress(checkpoint.read_bytes(),mtime=0))
    sources.append(checkpoint_archive)
    out['beforeExactSwapCheckpointSha256']=hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'states':out['states'],'screenedCenters':out['screenedCenters'],'rows':[{
        k:r[k] for k in ['id','score','doubledScore','carrierOnlyDelta','optimal1x','optimal2x'] if k in r} for r in out['results']]},ensure_ascii=False))

if __name__=='__main__':main()
