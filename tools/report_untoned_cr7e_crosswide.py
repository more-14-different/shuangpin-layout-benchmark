"""Compare expanded-key and cross-block exact experiments under one CKT contract."""
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-crosswide-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(mapping):
    for p,h in mapping.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p

def main():
    report=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert report['completed'] and verified['completed'] and len(report['stages'])==3
    check(report['sourceHashes']);check(verified['sourceHashes'])
    earlier=read(ROOT/'research/notes/2026-11-20-untoned-cr7e-blocks-v52-summary.json')
    imports=[read(ROOT/f'research/notes/2026-11-20-untoned-cr7e-{name}-v52.json') for name in ['far','recovery','blocks']]
    key=lambda e:''.join(e['initialMap'].values())+'|'+''.join(e['finalMap'].values())
    oldkeys={key(e) for r in imports for e in r['states'].values()}
    assert all(key(e) not in oldkeys for e in report['states'].values()),'new score duplications'
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json')]
    rows={r['id']:r for r in verified['results']}
    for field in ['score','doubledScore']:
        candidate=min(report['states'].values(),key=lambda r:r[field])
        if candidate['id'] not in rows:
            replay_file=Path(str(PREFIX)+'-replay-'+candidate['id']+'.json')
            replay=read(replay_file);check(replay['sourceHashes']);sources.append(replay_file)
            assert replay['initialMap']==candidate['initialMap'] and replay['finalMap']==candidate['finalMap']
            assert replay['score']==candidate['score'] and replay['doubledScore']==candidate['doubledScore']
            rows[candidate['id']]=replay
    results=[]
    for row in rows.values():
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
    old1=min(r['optimal1x']['score'] for r in earlier['results']);old2=min(r['optimal2x']['score'] for r in earlier['results'])
    # Only active contract fields are published; inherited earlier-round search budgets do not govern this exact experiment.
    contract={k:report['contract'][k] for k in ['capacity','M','D','V','branches','qzEmpty','zqEmpty','initialsFixed','costMultipliers','search','left','right','candidateKeys','crossRounds']}
    out=dict(version='untoned-cr7e-crosswide-v52-summary-1',contract=contract,searchAuxiliaryPolicy=report['policy'],initialMap=report['initialMap'],newExactStates=len(report['states']),
        coverage=verified['coverage'],uniqueCoveredLayouts=verified['uniqueCoveredLayouts'],stages=[{k:s[k] for k in ['name','groups','totalAssignments','legalUnique','newExactStates']} for s in report['stages']],
        results=results,best1x=best1['id'],best2x=best2['id'],improvementFromEarlierOptimizedFrontier={'one':old1-best1['optimal1x']['score'],'two':old2-best2['optimal2x']['score']},
        target={k:report['target'][k] for k in ['id','optimal1x','optimal2x']},
        scope='Complete eight-key left-block assignments at one fixed backbone, then complete one-final-per-block simultaneous reassignments at the recorded leaders, all under the fixed search auxiliary policy. Not every multi-final change over all 21 keys or every candidate policy optimized. Finalists canonically replayed and policy optimized or retained from hash-verified identical earlier layouts.',completed=True)
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({k:out[k] for k in ['newExactStates','best1x','best2x','improvementFromEarlierOptimizedFrontier']},ensure_ascii=False))
    print(json.dumps([{k:r[k] for k in ['id','optimal1x','optimal2x','optimalMinusTarget']} for r in results],ensure_ascii=False))

if __name__=='__main__':main()
