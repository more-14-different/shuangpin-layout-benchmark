"""Independent memory/policy audit and frontier feature report for joint changes."""
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-joint-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(hashes):
    for p,h in hashes.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p
def identity(row):return tuple(sorted(row['initialMap'].items())),tuple(sorted(row['finalMap'].items()))
def cost(t,m):return t['motorUpperMs']+m*(t['effectiveMs']-t['motorUpperMs'])
def fourth(tracks,reference,m):return sum(w*(cost(tracks[k],m)/cost(reference[k],m))**4 for k,w in [('character',1),('word2',3),('word3',1),('word4',1)])
def retain_original_policy(prefix,row,reference):
    target=Path(str(prefix)+'-policy-'+row['id']+'.json')
    if target.exists():return
    source=ROOT/('research/notes/2026-11-20-untoned-cr7e-restored21-v52-policy-'+row['id']+'.json')
    policy=read(source);check(policy['sourceHashes']);assert identity(policy)==identity(row)
    components_path=Path(str(source).replace('-policy-','-components-').replace('.json','.json.gz'))
    components=json.loads(gzip.decompress(components_path.read_bytes()));assert components['reference']==reference and components['id']==row['id']
    policy['retainedPolicyEnumeration']=dict(source=str(source),components=str(components_path),originalId=row['id'],reason='Identical physical maps, reference and semantic pairing; complete 144-policy member arrays independently re-evaluated by this report; fixed-policy canonical replay performed separately.')
    for p in [source,components_path]:policy['sourceHashes'][str(p)]=hashlib.sha256(p.read_bytes()).hexdigest()
    target.write_text(json.dumps(policy,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    Path(str(prefix)+'-components-'+row['id']+'.json.gz').write_bytes(components_path.read_bytes())

def audit_results(prefix,verified,reference,sources):
    results=[]
    for row in verified['results']:
        memory=memory_r2.audit(verified['auditInput'],row)
        assert memory['coverage']==399 and memory['M'] in [41,42] and memory['ordinaryDisplacedCount']==2 and memory['branchCount']==0 and memory['usedFinalKeys']==21
        assert (memory['M'],memory['unique'])==(row['audit']['M'],row['audit']['unique'])
        codes=[row['codeList'][p] for p,_ in verified['auditInput']['base']]
        assert len({c[0] for c in codes})==len({c[1] for c in codes})==21
        assert ('QZ' in codes)==row['audit']['qz'] and ('ZQ' in codes)==row['audit']['zq']
        assert row['maxTrackDifference']<1e-8 and row['auxiliarySemantics']['toneDigitsByShapeMeaning']=='42310'
        if row['id'].startswith('U7R-'):retain_original_policy(prefix,row,reference)
        pfile=Path(str(prefix)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        cfile=Path(str(prefix)+'-components-'+row['id']+'.json.gz');components=json.loads(gzip.decompress(cfile.read_bytes()));sources.append(cfile)
        assert components['id']==row['id'] and components['reference']==reference
        assert identity(policy)==identity(row) and policy['activePhysicalKeys']==[21,21] and policy['auxiliarySemantics']==row['auxiliarySemantics']
        for m in [1,2]:
            total=0
            for mode in ['keytao','sanpin']:
                cases=components['cases'][mode]['results'];assert len(cases)==144 and len({c['policyKey'] for c in cases})==144
                best=min(fourth(c['tracks'],reference[mode],m) for c in cases)
                chosen=next(c for c in cases if c['policyKey']==policy[f'optimal{m}x']['policy'][mode])
                assert abs(fourth(chosen['tracks'],reference[mode],m)-best)<1e-12;total+=best
            assert abs(10*(total/12)**.25-policy[f'optimal{m}x']['score'])<1e-9
        results.append(dict(id=row['id'],audit=row['audit'],independentMemory=memory,initialMap=row['initialMap'],finalMap=row['finalMap'],optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],maxTrackDifference=row['maxTrackDifference'],fixedPolicyScore=row['score'],fixedPolicyDoubledScore=row['doubledScore']))
    return results

def main():
    rawfile=Path(str(PREFIX)+'.json');vfile=Path(str(PREFIX)+'-verification.json');rfile=Path(str(PREFIX)+'-relabel.json');rvfile=Path(str(PREFIX)+'-relabel-verification.json');ffile=Path(str(PREFIX)+'-features.json')
    raw,verified,relabel,rv,features=map(read,[rawfile,vfile,rfile,rvfile,ffile])
    for d in [raw,verified,relabel,rv,features]:assert d['completed'];check(d['sourceHashes'])
    assert raw['reference']==relabel['reference'];sources=[Path(__file__),rawfile,vfile,rfile,rvfile,ffile]
    trials=audit_results(PREFIX,verified,raw['reference'],sources);cycles=audit_results(Path(str(PREFIX)+'-relabel'),rv,raw['reference'],sources)
    old_file=ROOT/'research/notes/2026-11-20-untoned-cr7e-restored21-v52-summary.json';old=read(old_file);sources.append(old_file)
    baseline={str(m):min(r[f'optimal{m}x']['score'] for r in old['results']) for m in [1,2]}
    for r in cycles:r['improvementOverPreviousFrontier']={str(m):baseline[str(m)]-r[f'optimal{m}x']['score'] for m in [1,2]}
    initialKeys=lambda r:tuple(sorted(r['initialMap'].items()))
    jointMap=lambda r:(initialKeys(r),tuple(sorted(r['finalMap'].items())))
    newUnion={jointMap(r) for d in [raw,relabel] for r in d['states'].values()}
    out=dict(version='untoned-cr7e-joint-summary-1',completed=True,contract=raw['contract'],searchAuxiliaryPolicy=raw['policy'],jointNewStates=len(raw['states']),jointCoverage=verified['uniqueCoveredLayouts'],jointDistinctInitials=verified['distinctInitials'],
        jointBatchesHistogram={str(n):sum(len(t['batches'])==n for t in raw['trials']) for n in [1,2,3]},
        relabelGenerated=sum(s['generated'] for s in relabel['stages']),relabelExactStates=len(relabel['states']),newPhysicalUnion=len(newUnion),
        jointResults=trials,relabelResults=cycles,best1x=min(cycles+trials,key=lambda r:r['optimal1x']['score'])['id'],best2x=min(cycles+trials,key=lambda r:r['optimal2x']['score'])['id'],previousFrontier=baseline,
        featureSummary=dict(u7rVariableFinals=features['u7rVariableFinals'],u7rCommonFinals=features['u7rCommonFinals'],allCommonFinals=features['allCommonFinals'],comparison=features['comparison'],jointInteractions=features['trialInteractions'],relabelInteractions=features['relabelInteractions']),
        scope='Fixed-policy limited atomic joint trials around two U7R frontiers and the last switch leader, then complete simultaneous physical two/three-key relabelings within that finite family. Preserve actual21x21,D2,M41/M42. QZ/ZQ allowed during exploration, explicit final flags. Shared frontier features are associations with shared ancestry, not globally optimal rules. No complete arbitrary initial/final neighborhood or local/global optimality claim. New leaders have full point-optimal auxiliary enumeration and independent replays; production/HTML not changed.')
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(dict(jointNew=out['jointNewStates'],relabelExact=out['relabelExactStates'],physicalUnion=out['newPhysicalUnion'],best1x=out['best1x'],best2x=out['best2x'],results=[dict(id=r['id'],one=r['optimal1x']['score'],two=r['optimal2x']['score'],M=r['audit']['M'],D=r['audit']['D'],qz=r['audit']['qz'],zq=r['audit']['zq'],improvement=r['improvementOverPreviousFrontier']) for r in cycles]),ensure_ascii=False))

if __name__=='__main__':main()
