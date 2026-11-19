"""Independent original M-R2 audit and policy-optimized frontier comparison."""
import hashlib
import gzip
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-19-untoned-cr7e-coupled-v52'
REPLAY=ROOT/'research/.cache/R11_integrated_replay'
sys.path.insert(0,str(REPLAY))
import memory_r2

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def check_hashes(mapping):
    for path,digest in mapping.items():
        assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest,path

def main():
    search=read(str(PREFIX)+'.json')
    verified=read(str(PREFIX)+'-verification.json')
    prior=read(ROOT/'research/notes/2026-11-19-untoned-cr7e-v52-verification.json')
    assert search['completed'] and verified['completed']
    check_hashes(search['sourceHashes'])
    assert search['axisCombinationExtension']['completed']
    check_hashes(search['axisCombinationExtension']['sourceHashes'])
    assert search['finalPairExtension']['completed']
    check_hashes(search['finalPairExtension']['sourceHashes'])
    check_hashes(verified['sourceHashes'])
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json'),REPLAY/'memory_r2.py',REPLAY/'audit.py']
    for ext,key in [('.js.gz','oldScriptSha256'),('.json.gz','checkpointSha256')]:
        archive=Path(str(PREFIX)+'-two-workers'+ext)
        assert hashlib.sha256(gzip.decompress(archive.read_bytes())).hexdigest()==search['searchRevisions'][0][key]
        sources.append(archive)
    baseline=next(r for r in prior['results'] if r['id']=='OC21-e1f155973380')
    seeds=[r for r in prior['results'] if r['id'] in search['seeds']]
    results=[]
    for row in verified['results']:
        independent=memory_r2.audit(verified['auditInput'],row)
        a=row['audit']
        assert (independent['M'],independent['ordinaryDisplacedCount'],independent['branchCount'],independent['unique'])==(a['M'],a['D'],a['branches'],a['unique'])
        assert independent['coverage']==399
        pfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json')
        policy=read(pfile)
        check_hashes(policy['sourceHashes'])
        assert policy['initialMap']==row['initialMap'] and policy['finalMap']==row['finalMap']
        sources.append(pfile)
        result={k:row[k] for k in ['id','score','doubledScore','audit','parent','mutation'] if k in row}
        result.update(optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],independentMemory=independent)
        result['optimalMinusE1']={str(m):policy[f'optimal{m}x']['score']-baseline[f'optimal{m}x']['score'] for m in [1,2]}
        result['sharesE1InitialMap']=row['initialMap']==baseline['initialMap']
        result['optimalTrackDeltasVsE1']={}
        for mult,field in [(1,'score'),(2,'doubledScore')]:
            replay=min(policy['canonicalReplays'],key=lambda r:r[field])
            result['optimalTrackDeltasVsE1'][str(mult)]={mode:{kind:{
                'effectiveMs':mult*t['effectiveMs']-(mult-1)*t['motorUpperMs']-(mult*baseline['modes'][mode][kind]['effectiveMs']-(mult-1)*baseline['modes'][mode][kind]['motorUpperMs']),
                'motorMs':t['motorUpperMs']-baseline['modes'][mode][kind]['motorUpperMs']
                } for kind,t in tracks.items()} for mode,tracks in replay['modes'].items()}
        result['changesFromSeeds']={seed['id']:{kind:{k:[seed[kind][k],v] for k,v in row[kind].items() if seed[kind][k]!=v} for kind in ['initialMap','finalMap']} for seed in seeds}
        results.append(result)
    out=dict(version='untoned-cr7e-coupled-comparison-1',states=len(search['states']),knownStateCount=search['knownStateCount'],
        stages=search['stages'],firstRingCoverage=verified['firstRingCoverage'],contract=search['contract'],baseline={k:baseline[k] for k in ['id','optimal1x','optimal2x']},
        seeds=[{k:r[k] for k in ['id','optimal1x','optimal2x']} for r in seeds],results=results,
        best1x=min(results,key=lambda r:r['optimal1x']['score'])['id'],best2x=min(results,key=lambda r:r['optimal2x']['score'])['id'],completed=True)
    out['scope']='All legal single initial/final neighbors of both starting centers covered at the fixed search policy; subsequent coupled, measured-axis and two/three-mutation combinations are finite exploration, not a global optimality proof. Finalists independently replayed and fully policy optimized.'
    out['stageAttributedStates']=sum(s['newStates'] for s in search['stages'])
    out['retainedPartialStageStates']=len(search['states'])-out['stageAttributedStates']
    assert out['retainedPartialStageStates']==149,'149 exact final neighbors were retained from the archived two-worker partial stage'
    ids={'center':'U7X-9e24f7acc639','vanVnSwap':'U7X-89f95f825044','uangToC':'U7X-de33c94238df','pair':'U7X-02d505540da0','triple':'U7X-2deda2bfd8da'}
    out['measuredFixedPolicyInteractions']={label:{k:search['states'][id][k] for k in ['id','score','doubledScore','mutation']} for label,id in ids.items()}
    out['measuredFixedPolicyInteractions']['pairMinusAdditivePrediction']={field:search['states'][ids['pair']][field]-(search['states'][ids['vanVnSwap']][field]+search['states'][ids['uangToC']][field]-search['states'][ids['center']][field]) for field in ['score','doubledScore']}
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({k:out[k] for k in ['states','best1x','best2x']},ensure_ascii=False))
    print(json.dumps([{k:r[k] for k in ['id','optimal1x','optimal2x','optimalMinusE1']} for r in results],ensure_ascii=False))

if __name__=='__main__':
    main()
