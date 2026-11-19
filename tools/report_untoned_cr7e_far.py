"""Audit the fixed-onset distant-final experiment and compare optimized finalists."""
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-far-v52'
REPLAY=ROOT/'research/.cache/R11_integrated_replay'
sys.path.insert(0,str(REPLAY))
import memory_r2

def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))
def check_hashes(mapping):
    for path,digest in mapping.items():assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest,path

def main():
    report=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert report['completed'] and verified['completed']
    assert report['measuredFinalPolish']['completed']
    check_hashes(report['measuredFinalPolish']['sourceHashes'])
    check_hashes(report['sourceHashes']);check_hashes(verified['sourceHashes'])
    assert len(report['chains'])==8 and all(c['newScores']==750 for c in report['chains'])
    prior=read(ROOT/'research/notes/2026-11-19-untoned-cr7e-v52.json')
    coupled=read(ROOT/'research/notes/2026-11-19-untoned-cr7e-coupled-v52.json')
    key=lambda e:''.join(e['initialMap'].values())+'|'+''.join(e['finalMap'].values())
    previous={key(e) for e in list(prior['states'].values())+list(coupled['states'].values())}
    originals=read(ROOT/'research/notes/2026-11-19-untoned-cr7e-v52-verification.json')
    seeds=[r for r in originals['results'] if r['id'] in ['U7E-1f46d74c337f','U7E-3b1557bb9247']]
    target=report['target']
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json'),REPLAY/'memory_r2.py']
    results=[]
    for row in verified['results']:
        independent=memory_r2.audit(verified['auditInput'],row)
        assert independent['coverage']==399
        assert (independent['M'],independent['ordinaryDisplacedCount'],independent['branchCount'],independent['unique'])==(row['audit']['M'],row['audit']['D'],row['audit']['branches'],row['audit']['unique'])
        policyfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json');p=read(policyfile);check_hashes(p['sourceHashes']);sources.append(policyfile)
        assert p['initialMap']==report['initialMap'] and p['finalMap']==row['finalMap']
        results.append(dict(id=row['id'],score=row['score'],doubledScore=row['doubledScore'],audit=row['audit'],
            optimal1x=p['optimal1x'],optimal2x=p['optimal2x'],memory=independent,
            optimizedMinusTarget={str(m):p[f'optimal{m}x']['score']-target[f'optimal{m}x']['score'] for m in [1,2]},
            changedFinalsFromSeeds={seed['id']:{f:[seed['finalMap'][f],k] for f,k in row['finalMap'].items() if seed['finalMap'][f]!=k} for seed in seeds}))
    distances=[min(sum(row['finalMap'][f]!=s['finalMap'][f] for f in row['finalMap']) for s in seeds) for row in report['states'].values()]
    out=dict(version='untoned-cr7e-far-v52-summary-1',contract=report['contract'],initialMap=report['initialMap'],states=len(report['states']),
        newRelativeToEarlierArchives=sum(key(r) not in previous for r in report['states'].values()),
        annealedNewStates=sum(c['newScores'] for c in report['chains']),
        chains=[{k:c[k] for k in ['index','objective','newScores','transitions','accepted','startDistance','farRestarts']} for c in report['chains']],
        maximumChangedFinalsFromNearestOriginal=max(distances),statesAtLeast10FinalsAway=sum(d>=10 for d in distances),
        stages=report['stages'],measuredFinalPolish=report['measuredFinalPolish'],target={k:target[k] for k in ['id','optimal1x','optimal2x']},results=results,
        beatsTarget1x=any(r['optimizedMinusTarget']['1']<0 for r in results),beatsTarget2x=any(r['optimizedMinusTarget']['2']<0 for r in results),
        scope='Eight bounded coarse/fine simulated-annealing chains and complete final neighborhoods of two leaders. Finalists fully policy optimized and canonically replayed. No global lower bound or impossibility proof.',completed=True)
    annealed_ids={t['to'] for t in report['trajectory']}
    annealed=[r for r in report['states'].values() if r['id'] in annealed_ids]
    out['annealingStageOnlyBest']={field:{k:min(annealed,key=lambda r:r[field])[k] for k in ['id','score','doubledScore','mutation']} for field in ['score','doubledScore']}
    out['interpretation']='Distant annealing did not beat the imported centers. The improvements in the final report came from the complete final-neighbor rings and combinations of measured improving final changes. The bounded fine phases do not prove that longer recovery from distant starts cannot succeed.'
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({k:out[k] for k in ['states','newRelativeToEarlierArchives','annealedNewStates','maximumChangedFinalsFromNearestOriginal','statesAtLeast10FinalsAway','beatsTarget1x','beatsTarget2x']},ensure_ascii=False))
    print(json.dumps([{k:r[k] for k in ['id','optimal1x','optimal2x','optimizedMinusTarget']} for r in results],ensure_ascii=False))

if __name__=='__main__':main()
