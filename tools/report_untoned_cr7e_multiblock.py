"""Independent memory checks and a bounded, reproducible multi-block search report."""
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-multiblock-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(hashes):
    for p,h in hashes.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p

def main():
    raw=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert raw['completed'] and verified['completed']
    check(raw['sourceHashes']);check(verified['sourceHashes'])
    imports=[read(ROOT/f'research/notes/2026-11-20-untoned-cr7e-{n}-v52.json') for n in ['far','recovery','blocks','crosswide']]
    all_rows={r['id']:r for report in [*imports,raw] for r in report['states'].values()}
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json')]
    results=[]
    for row in verified['results']:
        memory=memory_r2.audit(verified['auditInput'],row)
        assert memory['coverage']==399 and memory['M']<=42 and memory['ordinaryDisplacedCount']<=2 and memory['branchCount']==0
        assert (memory['M'],memory['unique'])==(row['audit']['M'],row['audit']['unique'])
        pfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        assert policy['initialMap']==raw['initialMap'] and policy['finalMap']==row['finalMap']
        results.append(dict(id=row['id'],audit=row['audit'],independentMemory=memory,score=row['score'],doubledScore=row['doubledScore'],
            optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],
            optimalMinusTarget={str(m):policy[f'optimal{m}x']['score']-raw['target'][f'optimal{m}x']['score'] for m in [1,2]},
            changesFromEarlier1x={f:[raw['baseline']['one']['finalMap'][f],v] for f,v in row['finalMap'].items() if raw['baseline']['one']['finalMap'][f]!=v}))
    earlier=read(ROOT/'research/notes/2026-11-20-untoned-cr7e-crosswide-v52-summary.json')
    best1=min(results,key=lambda r:r['optimal1x']['score']);best2=min(results,key=lambda r:r['optimal2x']['score'])
    old1=min(r['optimal1x']['score'] for r in earlier['results']);old2=min(r['optimal2x']['score'] for r in earlier['results'])
    chains=[]
    for chain in raw['chains']:
        seed=all_rows[chain['seedId']];axis=chain['objective']
        fixed=[step for rnd in raw['rounds'] if rnd['round']<8 for step in rnd['chains'] if step['index']==chain['index']]
        fixed_rows=[seed,*[all_rows[s['to']] for s in fixed],*[all_rows[p['id']] for s in fixed for p in s['selected']]]
        fixed_best=min(fixed_rows,key=lambda r:r[axis])
        all_steps=[step for rnd in raw['rounds'] for step in rnd['chains'] if step['index']==chain['index']]
        scored=[seed,*[all_rows[s['to']] for s in all_steps],*[all_rows[p['id']] for s in all_steps for p in s['selected']]]
        best=min(scored,key=lambda r:r[axis])
        chains.append(dict(index=chain['index'],seed=seed['id'],objective=axis,seedScore=seed[axis],fixedBackboneBest=fixed_best['id'],fixedBackboneBestScore=fixed_best[axis],
            fixedBackboneImprovement=seed[axis]-fixed_best[axis],best=best['id'],bestScore=best[axis],totalImprovement=seed[axis]-best[axis],
            seedChangesFromEarlier1x={f:[raw['baseline']['one']['finalMap'][f],v] for f,v in seed['finalMap'].items() if raw['baseline']['one']['finalMap'][f]!=v}))
    measured=[]
    for stage in raw['stages']:
        errors={}
        for axis,field in enumerate(['score','doubledScore']):
            errors[field]=max(abs(all_rows[p['id']][field]-p['additive'][axis]) for p in stage['selected'])
        measured.append(dict(center=stage['center'],leftComponents=len(stage['leftIds']),rightComponents=len(stage['rightIds']),pairs=stage['pairs'],legalPairs=stage['legalCount'],
            novelCandidates=stage['novelCandidates'],exactSelected=len(stage['selected']),newExactStates=stage['newExactStates'],best1x=stage['best1x']['score'],best2x=stage['best2x']['doubledScore'],
            maximumMeasuredComponentNonadditivity=errors))
    # The same cross-block swap has different signs at different measured centers.
    by_finals={tuple(sorted(r['finalMap'].items())):r for r in all_rows.values()}
    probes=[]
    for center_id in ['U7H-ba54b6e08e04','U7H-15738b341461','U7H-b7c21920f4cf','U7H-84f64d080836','U7H-e4732bf55fb2']:
        center=all_rows[center_id];fm=dict(center['finalMap']);fm['van'],fm['ve']=fm['ve'],fm['van']
        row=by_finals[tuple(sorted(fm.items()))]
        probes.append(dict(center=center_id,result=row['id'],mutation='swap van/ve',score=row['score'],doubledScore=row['doubledScore'],
            delta1x=row['score']-center['score'],delta2x=row['doubledScore']-center['doubledScore'],policy='fixed search auxiliary policy'))
    out=dict(version='untoned-cr7e-multiblock-v52-summary-1',completed=True,contract=raw['contract'],searchAuxiliaryPolicy=raw['policy'],initialMap=raw['initialMap'],
        newExactStates=len(raw['states']),measuredComponentStages=measured,chains=chains,interactionProbes=probes,rankerFits=raw['rankerFits'],
        multiSelections=verified['multiSelections'],fixedSelections=verified['fixedSelections'],releasedSelections=verified['releasedSelections'],results=results,
        best1x=best1['id'],best2x=best2['id'],improvementFromEarlierOptimizedFrontier={'one':old1-best1['optimal1x']['score'],'two':old2-best2['optimal2x']['score']},
        target={k:raw['target'][k] for k in ['id','optimal1x','optimal2x']},
        scope='Finite heuristic: exact scoring of selected measured-component recombinations and six fixed/released-backbone multiple-try chains. Surrogate predictions and additive component estimates only rank proposals. Neither every multi-block candidate nor every auxiliary policy of every candidate is exhaustively evaluated. Finalists have full auxiliary-policy enumeration or hash-verified retained enumeration and fresh canonical replay.')
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({k:out[k] for k in ['newExactStates','multiSelections','best1x','best2x','improvementFromEarlierOptimizedFrontier']},ensure_ascii=False))
    print(json.dumps([dict(id=r['id'],one=r['optimal1x']['score'],two=r['optimal2x']['score']) for r in results],ensure_ascii=False))
    print(json.dumps(chains,ensure_ascii=False))

if __name__=='__main__':main()
