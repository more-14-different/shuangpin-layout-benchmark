"""Report actual 21x20 untoned layouts while retaining traditional candidate pools."""
import hashlib
import gzip
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-dropfinal-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(hashes):
    for p,h in hashes.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p

def main():
    raw=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert raw['completed'] and verified['completed'];check(raw['sourceHashes']);check(verified['sourceHashes'])
    if raw.get('polish'):assert raw['polish']['completed'];check(raw['polish']['sourceHashes'])
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json')]
    previous=read(ROOT/'research/notes/2026-11-20-untoned-cr7e-multiblock-v52-summary.json')
    originals={r['id']:r for r in previous['results']}
    originals[raw['target']['id']]=raw['target']
    family_baselines={family:[originals[s['id']] for s in raw['seeds'] if s['family']==family] for family in raw['families']}
    results=[]
    for row in verified['results']:
        memory=memory_r2.audit(verified['auditInput'],row)
        assert memory['coverage']==399 and memory['M']<=42 and memory['ordinaryDisplacedCount']<=2 and memory['branchCount']==0
        assert memory['usedFinalKeys']==20 and (memory['M'],memory['unique'])==(row['audit']['M'],row['audit']['unique'])
        codes=[row['codeList'][p] for p,_ in verified['auditInput']['base']]
        assert len(set(c[0] for c in codes))==21 and len(set(c[1] for c in codes))==20
        assert all(c[1]!=row['forbiddenFinalKey'] for c in codes) and 'QZ' not in codes and 'ZQ' not in codes
        assert row['initialMap']['q']=='Q' and row['initialMap']['z']=='Z'
        assert row['initialMap']==raw['families'][row['family']] and row['maxTrackDifference']<1e-8
        pfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        if policy.get('retainedVerifierRevision'):
            revision=policy['retainedVerifierRevision']
            assert hashlib.sha256(gzip.decompress(Path(revision['archive']).read_bytes())).hexdigest()==revision['uncompressedSha256']
        assert policy['initialMap']==row['initialMap'] and policy['finalMap']==row['finalMap']
        assert policy['activePhysicalKeys']==[21,20] and policy['auxiliarySemantics']==row['auxiliarySemantics']
        seed=next(s for s in raw['seeds'] if s['family']==row['family'])
        results.append(dict(id=row['id'],family=row['family'],forbiddenFinalKey=row['forbiddenFinalKey'],audit=row['audit'],independentMemory=memory,
            score=row['score'],doubledScore=row['doubledScore'],optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],maxTrackDifference=row['maxTrackDifference'],
            optimalMinusTarget={str(m):policy[f'optimal{m}x']['score']-raw['target'][f'optimal{m}x']['score'] for m in [1,2]},
            optimalMinusFamilyFrontier={str(m):policy[f'optimal{m}x']['score']-min(b[f'optimal{m}x']['score'] for b in family_baselines[row['family']]) for m in [1,2]},
            changesFromFamilySeed={f:[seed['finalMap'][f],v] for f,v in row['finalMap'].items() if seed['finalMap'][f]!=v}))
    lanes=[]
    for lane in raw['lanes']:
        finalists=[r for r in results if r['family']==lane['family'] and r['forbiddenFinalKey']==lane['forbiddenFinalKey']]
        assert finalists
        best1=min(finalists,key=lambda r:r['optimal1x']['score']);best2=min(finalists,key=lambda r:r['optimal2x']['score'])
        direct=[s for s in raw['stages'] if s['name']=='complete direct evacuation' and s['family']==lane['family'] and s['forbiddenFinalKey']==lane['forbiddenFinalKey']]
        lanes.append(dict(family=lane['family'],forbiddenFinalKey=lane['forbiddenFinalKey'],exactStates=lane['count'],
            best1x=best1['id'],best2x=best2['id'],optimal1x=best1['optimal1x'],optimal2x=best2['optimal2x'],
            directFixedPolicy1x=min(s['best1x']['score'] for s in direct),directFixedPolicy2x=min(s['best2x']['doubledScore'] for s in direct),
            fixedPolicyRecovery1x=min(s['best1x']['score'] for s in direct)-lane['best1x']['score'],fixedPolicyRecovery2x=min(s['best2x']['doubledScore'] for s in direct)-lane['best2x']['doubledScore']))
    stages=[dict(name=s['name'],center=s['center'],family=s['family'],forbiddenFinalKey=s['forbiddenFinalKey'],newExactStates=s['newExactStates'],
        total=s.get('total'),legal=s.get('legal',s.get('legalUnique')),best1x=s['best1x']['score'],best2x=s['best2x']['doubledScore']) for s in raw['stages']]
    chains=[dict(index=c['index'],family=c['family'],forbiddenFinalKey=c['forbiddenFinalKey'],objective=c['objective'],seedId=c['seedId'],bestId=c['bestId'],
        newScores=c['newScores'],transitions=c['transitions'],accepted=c['accepted']) for c in raw['chains']]
    out=dict(version='untoned-cr7e-dropfinal-v52-summary-1',completed=True,contract=raw['contract'],searchAuxiliaryPolicy=raw['policy'],families=raw['families'],
        newExactStates=len(raw['states']),stages=stages,coverage=verified['coverage'],chains=chains,lanes=lanes,results=results,polish=raw.get('polish'),
        target={k:raw['target'][k] for k in ['id','optimal1x','optimal2x']},
        scope='Actual 21 initial and 20 final physical keys, scored with unchanged traditional candidate pools through the explicit [21,21] canvas adapter. Complete direct evacuation from specified seeds; eight finite exact-score annealing chains and complete recorded local rings. Any reported one-step closure is only for recorded leaders, fixed search policy, fixed initials, and the defined move/swap/whole-group operators; neither exhaustive all-layout search nor closure across all auxiliary policies. Auxiliary policy optimization covers lane finalists only.')
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(dict(newExactStates=out['newExactStates'],lanes=[dict(family=l['family'],exclude=l['forbiddenFinalKey'],count=l['exactStates'],one=l['optimal1x']['score'],two=l['optimal2x']['score']) for l in lanes]),ensure_ascii=False))

if __name__=='__main__':main()
