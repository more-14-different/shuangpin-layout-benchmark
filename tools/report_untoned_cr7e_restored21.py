"""Verify the restored 21-key candidates and compare their optimized CKT contract."""
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-restored21-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(hashes):
    for p,h in hashes.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p

def main():
    raw=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert raw['completed'] and verified['completed'];check(raw['sourceHashes']);check(verified['sourceHashes']);check(raw['target']['sourceHashes'])
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json')]
    history_names=['2026-11-19-untoned-cr7e-v52','2026-11-19-untoned-cr7e-zero-n-v52','2026-11-19-untoned-cr7e-coupled-v52',
        *[f'2026-11-20-untoned-cr7e-{name}-v52' for name in ['far','recovery','blocks','crosswide','multiblock']]]
    identity=lambda r:(tuple(sorted(r['initialMap'].items())),tuple(sorted(r['finalMap'].items())))
    historical=set()
    for name in history_names:
        history_file=ROOT/f'research/notes/{name}.json';sources.append(history_file)
        historical.update(identity(r) for r in read(history_file)['states'].values())
    results=[]
    for row in verified['results']:
        memory=memory_r2.audit(verified['auditInput'],row)
        assert memory['coverage']==399 and memory['M']<=42 and memory['ordinaryDisplacedCount']<=2 and memory['branchCount']==0
        assert memory['usedFinalKeys']==21 and (memory['M'],memory['unique'])==(row['audit']['M'],row['audit']['unique'])
        codes=[row['codeList'][p] for p,_ in verified['auditInput']['base']]
        assert len(set(c[0] for c in codes))==len(set(c[1] for c in codes))==21 and 'QZ' not in codes and 'ZQ' not in codes
        assert row['initialMap']==raw['families'][row['family']] and row['maxTrackDifference']<1e-8
        pfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        assert policy['initialMap']==row['initialMap'] and policy['finalMap']==row['finalMap'] and policy['activePhysicalKeys']==[21,21]
        results.append(dict(id=row['id'],family=row['family'],audit=row['audit'],independentMemory=memory,initialMap=row['initialMap'],finalMap=row['finalMap'],novelRelativeToRecordedHistory=identity(row) not in historical,
            optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],maxTrackDifference=row['maxTrackDifference'],
            improvementOverTarget={str(m):raw['target'][f'optimal{m}x']['score']-policy[f'optimal{m}x']['score'] for m in [1,2]},
            changesFromTarget={f:[raw['target']['finalMap'][f],v] for f,v in row['finalMap'].items() if raw['target']['finalMap'][f]!=v}))
    best1=min(results,key=lambda r:r['optimal1x']['score']);best2=min(results,key=lambda r:r['optimal2x']['score'])
    discovery_policy=read(str(PREFIX)+'-policy-'+raw['discoveryId']+'.json')
    discovery_replay=discovery_policy['canonicalReplays'][0];target_replay=raw['target']['canonicalReplays'][0]
    assert discovery_replay['policies']==target_replay['policies']
    deltas=[]
    for mode in ['keytao','sanpin']:
        for kind in ['character','word2','word3','word4']:
            old=target_replay['modes'][mode][kind];new=discovery_replay['modes'][mode][kind]
            deltas.append(dict(mode=mode,kind=kind,motorMs=new['motorUpperMs']-old['motorUpperMs'],
                cognitiveMs=(new['effectiveMs']-new['motorUpperMs'])-(old['effectiveMs']-old['motorUpperMs']),
                effectiveMs=new['effectiveMs']-old['effectiveMs'],selectionRate=new['selectionRate']-old['selectionRate']))
    out=dict(version='untoned-cr7e-restored21-v52-summary-1',completed=True,contract=raw['contract'],searchAuxiliaryPolicy=raw['policy'],newExactStates=len(raw['states']),
        novelLayoutsRelativeToRecordedHistory=sum(identity(r) not in historical for r in raw['states'].values()),historicalUniqueLayouts=len(historical),
        coverage=verified['coverage'],closure=verified['closure'],results=results,best1x=best1['id'],best2x=best2['id'],
        discoveryAnalysis=dict(id=raw['discoveryId'],policies=discovery_replay['policies'],samePolicyAsTarget=True,trackDeltas=deltas),
        target={k:raw['target'][k] for k in ['id','optimal1x','optimal2x']},
        scope='Full original 21x21 physical domain and unchanged candidate pools. All legal recorded bridge-restoration variants and local leader rings receive exact fixed-policy scores. One-step closure, if reported, only concerns the recorded fixed-policy leaders and defined final move/swap/whole-group operators; final auxiliary optimization is restricted to finalists.')
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(dict(newExactStates=out['newExactStates'],best1x=out['best1x'],best2x=out['best2x'],results=[dict(id=r['id'],one=r['optimal1x']['score'],two=r['optimal2x']['score'],improvement=r['improvementOverTarget'],changes=r['changesFromTarget']) for r in results]),ensure_ascii=False))

if __name__=='__main__':main()
