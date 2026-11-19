"""Audit recovery-guided annealing without giving the proposal model score authority."""
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-recovery-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(mapping):
    for p,h in mapping.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p

def main():
    report=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert report['completed'] and verified['completed'] and report['exactPolish']['completed']
    assert len(report['rounds'])==30 and len(report['chains'])==6
    for mapping in [report['sourceHashes'],verified['sourceHashes'],report['exactPolish']['sourceHashes']]:check(mapping)
    previous=read(ROOT/'research/notes/2026-11-20-untoned-cr7e-far-v52-summary.json')
    rings=read(str(PREFIX)+'-ring-audit.json');check(rings['sourceHashes'])
    source=read(ROOT/'research/notes/2026-11-20-untoned-cr7e-far-v52.json')
    known=lambda e:''.join(e['initialMap'].values())+'|'+''.join(e['finalMap'].values())
    oldkeys={known(e) for e in source['states'].values()}
    assert all(known(e) not in oldkeys for e in report['states'].values()),'new exact states must be novel'
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json'),Path(str(PREFIX)+'-ring-audit.json')]
    results=[]
    original=read(ROOT/'research/notes/2026-11-19-untoned-cr7e-v52-verification.json')
    center=next(r for r in original['results'] if r['id']=='U7E-1f46d74c337f')
    for row in verified['results']:
        memory=memory_r2.audit(verified['auditInput'],row)
        assert memory['coverage']==399 and memory['M']==41 and memory['ordinaryDisplacedCount']==2 and memory['branchCount']==0
        assert memory['unique']==row['audit']['unique']
        pfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        assert policy['initialMap']==report['initialMap'] and policy['finalMap']==row['finalMap']
        results.append(dict(id=row['id'],score=row['score'],doubledScore=row['doubledScore'],audit=row['audit'],
            optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],independentMemory=memory,
            optimizedMinusTarget={str(m):policy[f'optimal{m}x']['score']-report['target'][f'optimal{m}x']['score'] for m in [1,2]},
            changedFinalsFromU7E={f:[center['finalMap'][f],v] for f,v in row['finalMap'].items() if center['finalMap'][f]!=v}))
    best1=min(results,key=lambda r:r['optimal1x']['score']);best2=min(results,key=lambda r:r['optimal2x']['score'])
    old1=min(r['optimal1x']['score'] for r in previous['results']);old2=min(r['optimal2x']['score'] for r in previous['results'])
    rows=report['rounds']
    errors=[c['predictionMAE'] for r in rows for c in r['chains']]
    out=dict(version='untoned-cr7e-recovery-v52-summary-1',contract=report['contract'],initialMap=report['initialMap'],
        newExactStates=len(report['states']),rounds=len(rows),chains=report['chains'],rankerFits=report['rankerFits'],
        annealingNewStates=len(report['states'])-sum(s['newStates'] for s in report['exactPolish']['stages']),
        proposalModel=dict(role='ordering candidates only; every reported score is a full exact CKT v5.2 score',
            uncertainty='disagreement between three weighted ridge models; not a calibrated confidence interval',
            meanAbsolutePredictionErrorOnSelectedProposals=sum(errors)/len(errors)),
        exactPolish=report['exactPolish'],completeFinalRingAudit=rings,target={k:report['target'][k] for k in ['id','optimal1x','optimal2x']},
        results=results,best1x=best1['id'],best2x=best2['id'],improvementOverPreviousOptimizedFrontier={
            'one':old1-best1['optimal1x']['score'],'two':old2-best2['optimal2x']['score']},
        beatsTarget1x=best1['optimizedMinusTarget']['1']<0,beatsTarget2x=best2['optimizedMinusTarget']['2']<0,
        scope='Bounded multiple-try annealing, ridge-guided candidate ordering, exact local rings and measured combinations. No global optimality or statistical performance claim.',completed=True)
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({k:out[k] for k in ['newExactStates','best1x','best2x','improvementOverPreviousOptimizedFrontier','beatsTarget1x','beatsTarget2x']},ensure_ascii=False))
    print(json.dumps([{k:r[k] for k in ['id','optimal1x','optimal2x','optimizedMinusTarget']} for r in results],ensure_ascii=False))

if __name__=='__main__':main()
