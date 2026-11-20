"""Audit the e->E memory repair and compare point-optimal CKT frontiers."""
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-aeo3-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(hashes):
    for p,h in hashes.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p
def identity(row):return tuple(sorted(row['initialMap'].items())),tuple(sorted(row['finalMap'].items()))
def cost(track,m):return track['motorUpperMs']+m*(track['effectiveMs']-track['motorUpperMs'])
def fourth(tracks,reference,m):return sum(w*(cost(tracks[k],m)/cost(reference[k],m))**4 for k,w in [('character',1),('word2',3),('word3',1),('word4',1)])

def main():
    raw=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert raw['completed'] and verified['completed'];check(raw['sourceHashes']);check(verified['sourceHashes'])
    prior_file=ROOT/'research/notes/2026-11-20-untoned-cr7e-aeo42-v52-summary.json';prior=read(prior_file);check(prior['sourceHashes'])
    x_file=ROOT/'research/notes/2026-11-20-untoned-cr7e-restored21-v52-summary.json';x=read(x_file)
    baseline={str(m):min(r[f'optimal{m}x']['score'] for r in prior['results']) for m in [1,2]}
    comparison={str(m):min(r[f'optimal{m}x']['score'] for r in x['results']) for m in [1,2]}
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json'),prior_file,x_file];results=[]
    for row in verified['results']:
        memory=memory_r2.audit(verified['auditInput'],row)
        assert memory['coverage']==399 and memory['M']<=42 and memory['ordinaryDisplacedCount']<=2 and memory['branchCount']==0 and memory['usedFinalKeys']==21
        assert (memory['M'],memory['unique'])==(row['audit']['M'],row['audit']['unique'])
        assert all(row['initialMap'][h]==k for h,k in raw['baseInitialMap'].items() if h not in ['A','E','O'])
        carriers={row['initialMap'][h] for h in ['A','E','O']}
        assert set(memory['AEOKeys'])==carriers and memory['firstCategoryCounts']['AOE-carrier']==len(carriers)
        if len(carriers)==3:assert row['finalMap']['e']=='E' and memory['finalLinks']==34
        codes=[row['codeList'][p] for p,_ in verified['auditInput']['base']]
        assert len({c[0] for c in codes})==len({c[1] for c in codes})==21 and 'QZ' not in codes and 'ZQ' not in codes
        assert row['maxTrackDifference']<1e-8 and row['auxiliarySemantics']['toneDigitsByShapeMeaning']=='42310'
        pfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        cfile=Path(str(PREFIX)+'-components-'+row['id']+'.json.gz');components=json.loads(gzip.decompress(cfile.read_bytes()));sources.append(cfile)
        assert components['id']==row['id'] and components['reference']==raw['reference']
        assert identity(policy)==identity(row) and policy['activePhysicalKeys']==[21,21] and policy['auxiliarySemantics']==row['auxiliarySemantics']
        for m in [1,2]:
            total=0
            for mode in ['keytao','sanpin']:
                cases=components['cases'][mode]['results'];assert len(cases)==144 and len({c['policyKey'] for c in cases})==144
                ranked=sorted((fourth(c['tracks'],raw['reference'][mode],m),c['policyKey']) for c in cases)
                chosen=next(c for c in cases if c['policyKey']==policy[f'optimal{m}x']['policy'][mode])
                assert abs(fourth(chosen['tracks'],raw['reference'][mode],m)-ranked[0][0])<1e-12;total+=ranked[0][0]
            assert abs(10*(total/12)**.25-policy[f'optimal{m}x']['score'])<1e-9
        results.append(dict(id=row['id'],audit=row['audit'],independentMemory=memory,initialMap=row['initialMap'],finalMap=row['finalMap'],
            carriersByHead={h:row['initialMap'][h] for h in ['A','E','O']},carrierCount=len(carriers),optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],maxTrackDifference=row['maxTrackDifference'],
            differenceFromU7EM42={str(m):policy[f'optimal{m}x']['score']-baseline[str(m)] for m in [1,2]},
            differenceFromU7RM42={str(m):policy[f'optimal{m}x']['score']-comparison[str(m)] for m in [1,2]}))
    triples=[r for r in results if r['carrierCount']==3]
    repairs=[dict(center=s['center'],repair=s['repair']['mutation'],totalAssignments=s['totalAssignments'],legalAssignments=s['legalAssignments'],selectedCount=len(s['selectedIds']),controlCount=len(s['controlIds']),best1x=dict(id=s['best1x']['id'],score=s['best1x']['score']),best2x=dict(id=s['best2x']['id'],score=s['best2x']['doubledScore'])) for s in raw['stages'] if s['name']=='screened three-carrier repair']
    # An exact, fixed-policy three-way probe separates the memory repair from the extra carrier.
    stage=next(s for s in raw['stages'] if s['center']==raw['seeds'][0]['id'] and s.get('repair',{}).get('mutation')=='e->E; fill S with group en/iu')
    probe_files=[ROOT/'research/notes/2026-11-20-untoned-cr7e-aeo42-v52-replay-A42-4dd4e76ccb2a.json',Path(str(PREFIX)+'-replay-'+stage['controlIds'][1]+'.json'),Path(str(PREFIX)+'-replay-A3E-58c951c7204e.json')]
    probes=[read(p) for p in probe_files]
    for p,r in zip(probe_files,probes):check(r['sourceHashes']);assert r['maxTrackDifference']<1e-8;sources.append(p)
    base,repair,split=probes
    assert base['initialMap']==repair['initialMap'] and repair['finalMap']==split['finalMap']
    assert {f for f in base['finalMap'] if base['finalMap'][f]!=repair['finalMap'][f]}=={'e','en','iu'}
    assert [split['initialMap'][h] for h in ['A','E','O']]==['R','F','Q']
    assert all(split['initialMap'][h]==repair['initialMap'][h] for h in repair['initialMap'] if h!='O')
    isolated=dict(policy=raw['policy'],layouts=[dict(id=r['id'],M=r['audit']['M'],carriers={h:r['initialMap'][h] for h in ['A','E','O']},score=r['score'],doubledScore=r['doubledScore']) for r in probes],
        memoryRepairDelta={str(m):repair['score' if m==1 else 'doubledScore']-base['score' if m==1 else 'doubledScore'] for m in [1,2]},
        thirdCarrierDelta={str(m):split['score' if m==1 else 'doubledScore']-repair['score' if m==1 else 'doubledScore'] for m in [1,2]})
    out=dict(version='untoned-cr7e-aeo3-summary-1',completed=True,contract=raw['contract'],searchAuxiliaryPolicy=raw['policy'],newExactStates=len(raw['states']),
        newByM={str(m):sum(r['audit']['M']==m for r in raw['states'].values()) for m in sorted({r['audit']['M'] for r in raw['states'].values()})},
        newByCarrierCount={str(c):sum(len({r['initialMap'][h] for h in ['A','E','O']})==c for r in raw['states'].values()) for c in [1,2,3]},
        generatedCarrierAssignments=verified['generatedCarrierAssignments'],legalGeneratedCarrierAssignments=verified['legalGeneratedCarrierAssignments'],uniqueCoveredLayouts=verified['uniqueCoveredLayouts'],coverage=verified['coverage'],closure=verified['closure'],
        results=results,bestTriple1x=min(triples,key=lambda r:r['optimal1x']['score'])['id'],bestTriple2x=min(triples,key=lambda r:r['optimal2x']['score'])['id'],
        bestMeasured1x=min(results,key=lambda r:r['optimal1x']['score'])['id'],bestMeasured2x=min(results,key=lambda r:r['optimal2x']['score'])['id'],
        fixedPolicyRepairProbes=repairs,isolatedCarrierProbe=isolated,U7EM42Baseline=baseline,U7RM42Comparison=comparison,
        scope='All 81 recorded repaired final maps generated all distinct-carrier assignments and screened them; only selected 64 plus two controls per repair were exactly scored. Complete carrier/final leader rings are separate. Closures distinguish three-carrier neighbors from all legal carrier counts. Point-optimal auxiliary enumeration is limited to finalists; no robust-policy or global-optimality claim.')
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(dict(newExactStates=out['newExactStates'],newByM=out['newByM'],newByCarrierCount=out['newByCarrierCount'],coverage=out['uniqueCoveredLayouts'],closure=out['closure'],results=[dict(id=r['id'],M=r['audit']['M'],carriers=r['carriersByHead'],one=r['optimal1x']['score'],two=r['optimal2x']['score'],deltaToU7EM42=r['differenceFromU7EM42']) for r in results]),ensure_ascii=False))

if __name__=='__main__':main()
