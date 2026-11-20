"""Compare directional initial layouts with an independent explicit memory audit."""
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-transfer-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(hashes):
    for p,h in hashes.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p
def identity(row):return tuple(sorted(row['initialMap'].items())),tuple(sorted(row['finalMap'].items()))
def cost(t,m):return t['motorUpperMs']+m*(t['effectiveMs']-t['motorUpperMs'])
def fourth(tracks,reference,m):return sum(w*(cost(tracks[k],m)/cost(reference[k],m))**4 for k,w in [('character',1),('word2',3),('word3',1),('word4',1)])
def home_share(row,audit):
    base=audit['base'];codes=row['codeList']
    return sum(w for p,w in base if codes[p][0] in 'ASDFGHJKL')/sum(w for _,w in base)

def main():
    raw=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert raw['completed'] and verified['completed'];check(raw['sourceHashes']);check(verified['sourceHashes'])
    old_file=ROOT/'research/notes/2026-11-20-untoned-cr7e-aeo42-v52-summary.json';old=read(old_file)
    x_file=ROOT/'research/notes/2026-11-20-untoned-cr7e-restored21-v52-summary.json';x=read(x_file)
    comparison={str(m):min(r[f'optimal{m}x']['score'] for r in x['results']) for m in [1,2]}
    u7e={str(m):min(r[f'optimal{m}x']['score'] for r in old['results']) for m in [1,2]}
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json'),old_file,x_file];results=[]
    baseline_home={}
    for name,filename in [('U7E','2026-11-20-untoned-cr7e-aeo42-v52-replay-A42-4dd4e76ccb2a.json'),('U7R','2026-11-20-untoned-cr7e-restored21-v52-replay-U7R-143cf16e1fa2.json')]:
        p=ROOT/'research/notes'/filename;r=read(p);sources.append(p)
        baseline_home[name]=dict(id=r['id'],common399InitialHomeShare=home_share(r,verified['auditInput']))
    for row in verified['results']:
        memory=memory_r2.audit(verified['auditInput'],row)
        assert memory['coverage']==399 and memory['M'] in [41,42] and memory['ordinaryDisplacedCount']==2 and memory['branchCount']==0 and memory['usedFinalKeys']==21
        assert (memory['M'],memory['unique'])==(row['audit']['M'],row['audit']['unique'])
        codes=[row['codeList'][p] for p,_ in verified['auditInput']['base']]
        assert len({c[0] for c in codes})==len({c[1] for c in codes})==21 and 'QZ' not in codes and 'ZQ' not in codes
        assert row['maxTrackDifference']<1e-8 and row['auxiliarySemantics']['toneDigitsByShapeMeaning']=='42310'
        pfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        cfile=Path(str(PREFIX)+'-components-'+row['id']+'.json.gz');components=json.loads(gzip.decompress(cfile.read_bytes()));sources.append(cfile)
        assert identity(policy)==identity(row) and policy['activePhysicalKeys']==[21,21] and policy['auxiliarySemantics']==row['auxiliarySemantics'] and components['reference']==raw['reference']
        for m in [1,2]:
            total=0
            for mode in ['keytao','sanpin']:
                cases=components['cases'][mode]['results'];assert len(cases)==144 and len({c['policyKey'] for c in cases})==144
                best=min(fourth(c['tracks'],raw['reference'][mode],m) for c in cases)
                chosen=next(c for c in cases if c['policyKey']==policy[f'optimal{m}x']['policy'][mode])
                assert abs(fourth(chosen['tracks'],raw['reference'][mode],m)-best)<1e-12;total+=best
            assert abs(10*(total/12)**.25-policy[f'optimal{m}x']['score'])<1e-9
        results.append(dict(id=row['id'],family=row['family'],lane=next(f['lane'] for f in raw['families'] if f['id']==row['family']),audit=row['audit'],independentMemory=memory,initialMap=row['initialMap'],finalMap=row['finalMap'],
            common399InitialHomeShare=home_share(row,verified['auditInput']),optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],maxTrackDifference=row['maxTrackDifference'],
            differenceFromU7EM42={str(m):policy[f'optimal{m}x']['score']-u7e[str(m)] for m in [1,2]},differenceFromU7RM42={str(m):policy[f'optimal{m}x']['score']-comparison[str(m)] for m in [1,2]}))
    family_best=raw['familyBest']
    out=dict(version='untoned-cr7e-transfer-summary-1',completed=True,contract=raw['contract'],families=raw['families'],searchAuxiliaryPolicy=raw['policy'],newExactStates=len(raw['states']),
        newByM={str(m):sum(r['audit']['M']==m for r in raw['states'].values()) for m in [41,42]},
        newByFamily={f['id']:sum(r['family']==f['id'] for r in raw['states'].values()) for f in raw['families']},
        chains=[dict(index=c['index'],family=c['family'],objective=c['objective'],newScores=c['newScores'],transitions=c['transitions'],accepted=c['accepted'],restarts=len(c['restarts']),bestId=c['bestId']) for c in raw['chains']],
        uniqueCoveredLayouts=verified['uniqueCoveredLayouts'],coverage=verified['coverage'],closure=verified['closure'],results=results,
        best1x=min(results,key=lambda r:r['optimal1x']['score'])['id'],best2x=min(results,key=lambda r:r['optimal2x']['score'])['id'],U7EM42Baseline=u7e,U7RM42Comparison=comparison,baselineCommon399InitialHomeShares=baseline_home,
        fixedPolicyFamilyBest={k:{axis:dict(id=r['id'],score=r[axis]) for axis,r in v.items()} for k,v in family_best.items()},
        scope='Fixed production-inspired and UM-inspired initial families, actual 21x21, D exactly two, M41/M42. Pin e->E for P8/U8. Seed transplants and deterministic foreign final-group screening, finite alternating coarse/fine anneals and recorded complete final neighborhoods. No global optimality, complete initial perturbation, or robust auxiliary-policy claim. Point-optimal enumeration covers lane leaders; Common399 initial-home share is not full CKT home share.')
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(dict(newExactStates=out['newExactStates'],newByFamily=out['newByFamily'],coverage=out['uniqueCoveredLayouts'],closure=out['closure'],results=[dict(id=r['id'],family=r['family'],lane=r['lane'],M=r['audit']['M'],D=r['audit']['D'],one=r['optimal1x']['score'],two=r['optimal2x']['score'],initialHomeShare=r['common399InitialHomeShare']) for r in results]),ensure_ascii=False))


if __name__=='__main__':main()
