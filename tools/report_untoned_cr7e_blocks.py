"""Summarize exact block coverage and independently optimized CKT frontiers."""
import hashlib
import gzip
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-blocks-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(mapping):
    for p,h in mapping.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p

def main():
    report=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert report['completed'] and verified['completed'] and len(report['stages'])==3
    check(report['sourceHashes']);check(verified['sourceHashes'])
    previous=read(ROOT/'research/notes/2026-11-20-untoned-cr7e-recovery-v52-summary.json')
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json')]
    for ext,field in [('.js.gz','originalScriptSha256'),('.json.gz','checkpointSha256')]:
        archive=Path(str(PREFIX)+'-six-workers'+ext)
        assert hashlib.sha256(gzip.decompress(archive.read_bytes())).hexdigest()==report['sourceRevisions'][0][field]
        sources.append(archive)
    results=[]
    for row in verified['results']:
        independent=memory_r2.audit(verified['auditInput'],row)
        assert independent['coverage']==399 and independent['M']<=42 and independent['ordinaryDisplacedCount']==2 and independent['branchCount']==0
        assert (independent['M'],independent['unique'])==(row['audit']['M'],row['audit']['unique'])
        pfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        assert policy['initialMap']==report['initialMap'] and policy['finalMap']==row['finalMap']
        results.append(dict(id=row['id'],audit=row['audit'],score=row['score'],doubledScore=row['doubledScore'],
            optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],independentMemory=independent,
            optimalMinusTarget={str(m):policy[f'optimal{m}x']['score']-report['target'][f'optimal{m}x']['score'] for m in [1,2]},
            changesFromEarlier1x={f:[report['baseline']['one']['finalMap'][f],v] for f,v in row['finalMap'].items() if report['baseline']['one']['finalMap'][f]!=v}))
    best1=min(results,key=lambda r:r['optimal1x']['score']);best2=min(results,key=lambda r:r['optimal2x']['score'])
    old1=min(r['optimal1x']['score'] for r in previous['results']);old2=min(r['optimal2x']['score'] for r in previous['results'])
    out=dict(version='untoned-cr7e-blocks-v52-summary-1',contract=report['contract'],newExactStates=len(report['states']),
        initialMap=report['initialMap'],coverage=verified['coverage'],uniqueCoveredBlockLayouts=verified['uniqueCoveredBlockLayouts'],sourceRevisions=report['sourceRevisions'],results=results,
        best1x=best1['id'],best2x=best2['id'],improvementFromEarlierOptimizedFrontier={'one':old1-best1['optimal1x']['score'],'two':old2-best2['optimal2x']['score']},
        target={k:report['target'][k] for k in ['id','optimal1x','optimal2x']},
        scope='Exhaustive final assignments only within the named five-final/six-key blocks at recorded backbones and fixed search auxiliary policy. Each finalist fully policy optimized and canonically replayed. No full-layout or arbitrary-key optimality claim.',completed=True)
    out['stageAttributedNewExactStates']=sum(s['newExactStates'] for s in report['stages'])
    out['retainedFromPartialStage']=len(report['states'])-out['stageAttributedNewExactStates']
    assert out['retainedFromPartialStage']==report['sourceRevisions'][0]['retainedStates']
    out['policyEnumerationReuse']='Unchanged physical finalists retain the previous hash-verified complete 144-policy enumeration per member; this round independently replays their fixed search policy and audits complete block coverage.'
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({k:out[k] for k in ['newExactStates','best1x','best2x','improvementFromEarlierOptimizedFrontier']},ensure_ascii=False))
    print(json.dumps([{k:r[k] for k in ['id','optimal1x','optimal2x','optimalMinusTarget']} for r in results],ensure_ascii=False))

if __name__=='__main__':main()
