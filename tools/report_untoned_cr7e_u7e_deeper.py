"""Independent memory audit and comparison of the next fixed-U7E frontier search."""
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-u7e-deeper-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(hashes):
    for p,h in hashes.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p

def main():
    raw=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert raw['completed'] and verified['completed'];check(raw['sourceHashes']);check(verified['sourceHashes'])
    base=ROOT/'research/notes/2026-11-20-untoned-cr7e-u7e-fair'
    previous20_file=Path(str(base)+'-drop20-v52-summary.json');previous21_file=Path(str(base)+'-restored21-v52-summary.json')
    previous20=read(previous20_file);previous21=read(previous21_file)
    x_file=ROOT/'research/notes/2026-11-20-untoned-cr7e-restored21-v52-summary.json';x=read(x_file)
    old20=next(l for l in previous20['lanes'] if l['forbiddenFinalKey']=='Z')
    old_scores={20:{str(m):old20[f'optimal{m}x']['score'] for m in [1,2]},21:previous21['U7E21Baseline']}
    x_scores={str(m):min(r[f'optimal{m}x']['score'] for r in x['results']) for m in [1,2]}
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json'),previous20_file,previous21_file,x_file]
    results=[]
    for row in verified['results']:
        n=row['audit']['actual'][1];memory=memory_r2.audit(verified['auditInput'],row)
        assert n in [20,21] and memory['coverage']==399 and memory['M']<=42 and memory['ordinaryDisplacedCount']<=2 and memory['branchCount']==0
        assert memory['usedFinalKeys']==n and (memory['M'],memory['unique'])==(row['audit']['M'],row['audit']['unique'])
        assert row['initialMap']==raw['initialMap'] and row['maxTrackDifference']<1e-8
        codes=[row['codeList'][p] for p,_ in verified['auditInput']['base']]
        assert len(set(c[0] for c in codes))==21 and len(set(c[1] for c in codes))==n and 'QZ' not in codes and 'ZQ' not in codes
        if n==20:assert all(c[1]!='Z' for c in codes)
        assert row['auxiliarySemantics']['toneDigitsByShapeMeaning']=='42310'
        pfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        if policy.get('retainedVerifierRevision'):
            rev=policy['retainedVerifierRevision'];assert hashlib.sha256(gzip.decompress(Path(rev['archive']).read_bytes())).hexdigest()==rev['uncompressedSha256']
        assert policy['initialMap']==row['initialMap'] and policy['finalMap']==row['finalMap'] and policy['activePhysicalKeys']==[21,n]
        assert policy['auxiliarySemantics']==row['auxiliarySemantics']
        results.append(dict(id=row['id'],domain=n,audit=row['audit'],independentMemory=memory,initialMap=row['initialMap'],finalMap=row['finalMap'],
            optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],maxTrackDifference=row['maxTrackDifference'],
            improvementOverEarlierSameDomain={str(m):old_scores[n][str(m)]-policy[f'optimal{m}x']['score'] for m in [1,2]},
            improvementOverU7E21={str(m):old_scores[21][str(m)]-policy[f'optimal{m}x']['score'] for m in [1,2]},
            differenceFromU7X21={str(m):policy[f'optimal{m}x']['score']-x_scores[str(m)] for m in [1,2]},
            changesFromEarlier1x={f:[raw['baseline']['one']['finalMap'][f],k] for f,k in row['finalMap'].items() if k!=raw['baseline']['one']['finalMap'][f]}))
    lanes=[]
    for domain in [20,21]:
        candidates=[r for r in results if r['domain']==domain];best1=min(candidates,key=lambda r:r['optimal1x']['score']);best2=min(candidates,key=lambda r:r['optimal2x']['score'])
        lanes.append(dict(domain=domain,best1x=best1['id'],best2x=best2['id'],one=best1['optimal1x']['score'],two=best2['optimal2x']['score'],
            improvementOverEarlierSameDomain={'1':best1['improvementOverEarlierSameDomain']['1'],'2':best2['improvementOverEarlierSameDomain']['2']}))
    parent_file=Path(str(base)+'-restored21-v52-policy-UEF-09a340e17c85.json')
    child_file=Path(str(PREFIX)+'-policy-UED-18c004bd1f31.json')
    parent=read(parent_file);child=read(child_file);check(parent['sourceHashes']);check(child['sourceHashes']);sources.extend([parent_file,child_file])
    old=parent['canonicalReplays'][0];new=child['canonicalReplays'][0];assert old['policies']==new['policies']
    assert {f for f,k in parent['finalMap'].items() if child['finalMap'][f]!=k}=={'ia','iang'}
    probe=[]
    for mode in ['keytao','sanpin']:
        for kind in ['character','word2','word3','word4']:
            a=old['modes'][mode][kind];b=new['modes'][mode][kind]
            motor=b['motorUpperMs']-a['motorUpperMs'];cognitive=(b['effectiveMs']-b['motorUpperMs'])-(a['effectiveMs']-a['motorUpperMs'])
            probe.append(dict(mode=mode,kind=kind,motorMs=motor,cognitiveMs=cognitive,effective1xMs=motor+cognitive,effective2xMs=motor+2*cognitive,
                selectionRate=b['selectionRate']-a['selectionRate'],meanKeys=b['meanKeys']-a['meanKeys']))
    out=dict(version='untoned-cr7e-u7e-deeper-summary-1',completed=True,contract=raw['contract'],initialMap=raw['initialMap'],searchAuxiliaryPolicy=raw['policy'],
        newExactStates=len(raw['states']),newByDomain={str(n):sum(r['domain']==n for r in raw['states'].values()) for n in [20,21]},
        uniqueCoveredLayouts=verified['uniqueCoveredLayouts'],coverage=verified['coverage'],closure=verified['closure'],paths=raw['paths'],
        macroStages=[{k:s[k] for k in ['center','componentIds','pairs','disjoint','legalPairs','legalUnique','newExactStates']} for s in raw['stages'] if s['name']=='measured disjoint joint changes'],
        lanes=lanes,results=results,U7E21Baseline=old_scores[21],U7X21Comparison=x_scores,
        iaIangProbe=dict(parent=parent['id'],child=child['id'],policies=old['policies'],changes={'ia':['P','L'],'iang':['L','P']},trackDifferences=probe),
        scope='U7E initials fixed. Finite descent of recorded open centers and Z-empty leaders; all legal recorded restorations and measured disjoint-component unions scored. Component width is bounded; not exhaustive two-step search. One-step closure applies only to recorded fixed-policy leaders and final move/swap/whole-group operators. Auxiliary optimization covers selected finalists only.')
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(dict(newExactStates=out['newExactStates'],newByDomain=out['newByDomain'],coverage=out['uniqueCoveredLayouts'],lanes=lanes),ensure_ascii=False))
    print(json.dumps([dict(id=r['id'],domain=r['domain'],one=r['optimal1x']['score'],two=r['optimal2x']['score'],changes=r['changesFromEarlier1x']) for r in results],ensure_ascii=False))

if __name__=='__main__':main()
