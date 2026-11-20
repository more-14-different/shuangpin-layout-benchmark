"""Compare A/E/O carrier changes at the same explicit memory budget."""
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-cr7e-aeo42-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(hashes):
    for p,h in hashes.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p
def identity(row):return tuple(sorted(row['initialMap'].items())),tuple(sorted(row['finalMap'].items()))

def main():
    raw=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert raw['completed'] and verified['completed'];check(raw['sourceHashes']);check(verified['sourceHashes'])
    previous_file=ROOT/'research/notes/2026-11-20-untoned-cr7e-u7e-deeper-v52-summary.json';previous=read(previous_file)
    prior_scores={str(m):min(r[f'optimal{m}x']['score'] for r in previous['results'] if r['domain']==21) for m in [1,2]}
    x_file=ROOT/'research/notes/2026-11-20-untoned-cr7e-restored21-v52-summary.json';x=read(x_file)
    x_scores={str(m):min(r[f'optimal{m}x']['score'] for r in x['results']) for m in [1,2]}
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json'),previous_file,x_file]
    results=[]
    for row in verified['results']:
        memory=memory_r2.audit(verified['auditInput'],row)
        assert memory['coverage']==399 and memory['M']<=42 and memory['ordinaryDisplacedCount']<=2 and memory['branchCount']==0 and memory['usedFinalKeys']==21
        assert (memory['M'],memory['unique'])==(row['audit']['M'],row['audit']['unique'])
        assert all(row['initialMap'][h]==k for h,k in raw['baseInitialMap'].items() if h not in ['A','E','O'])
        carrier_keys={row['initialMap'][h] for h in ['A','E','O']}
        assert set(memory['AEOKeys'])==carrier_keys and memory['firstCategoryCounts']['AOE-carrier']==len(carrier_keys)
        codes=[row['codeList'][p] for p,_ in verified['auditInput']['base']]
        assert len({c[0] for c in codes})==len({c[1] for c in codes})==21 and 'QZ' not in codes and 'ZQ' not in codes
        assert row['maxTrackDifference']<1e-8 and row['auxiliarySemantics']['toneDigitsByShapeMeaning']=='42310'
        pfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        if policy.get('retainedVerifierRevision'):
            rev=policy['retainedVerifierRevision'];assert hashlib.sha256(gzip.decompress(Path(rev['archive']).read_bytes())).hexdigest()==rev['uncompressedSha256']
        assert identity(policy)==identity(row) and policy['activePhysicalKeys']==[21,21] and policy['auxiliarySemantics']==row['auxiliarySemantics']
        results.append(dict(id=row['id'],audit=row['audit'],independentMemory=memory,initialMap=row['initialMap'],finalMap=row['finalMap'],
            carriersByHead={h:row['initialMap'][h] for h in ['A','E','O']},carrierCount=len(carrier_keys),optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],maxTrackDifference=row['maxTrackDifference'],
            improvementOverU7EM41={str(m):prior_scores[str(m)]-policy[f'optimal{m}x']['score'] for m in [1,2]},
            differenceFromU7RM42={str(m):policy[f'optimal{m}x']['score']-x_scores[str(m)] for m in [1,2]}))
    # These probes are measured under the single fixed search policy, without claiming policy optimality.
    sweep_probes=[]
    for stage in raw['stages']:
        if stage['name']!='complete AEO sweep':continue
        seed=next(s for s in raw['seeds'] if s['id']==stage['center'])
        rc=next(r for r in raw['states'].values() if r['finalMap']==seed['finalMap'] and [r['initialMap'][h] for h in ['A','E','O']]==['R','C','C'])
        probes=[]
        for label,row in [('shared R',seed),('shared N',stage['sharedN']),('A R; E/O C',rc),('best1x',stage['best1x']),('best2x',stage['best2x'])]:
            probes.append(dict(label=label,id=row['id'],carriersByHead={h:row['initialMap'][h] for h in ['A','E','O']},M=row['audit']['M'],score=row['score'],doubledScore=row['doubledScore']))
        sweep_probes.append(dict(center=seed['id'],totalAssignments=stage['total'],legalUnique=stage['legalUnique'],probes=probes))
    best1=min(results,key=lambda r:r['optimal1x']['score']);best2=min(results,key=lambda r:r['optimal2x']['score'])
    out=dict(version='untoned-cr7e-aeo42-summary-1',completed=True,contract=raw['contract'],baseInitialMap=raw['baseInitialMap'],searchAuxiliaryPolicy=raw['policy'],
        newExactStates=len(raw['states']),newByM={str(m):sum(r['audit']['M']==m for r in raw['states'].values()) for m in sorted({r['audit']['M'] for r in raw['states'].values()})},
        uniqueCoveredLayouts=verified['uniqueCoveredLayouts'],coverage=verified['coverage'],closure=verified['closure'],results=results,best1x=best1['id'],best2x=best2['id'],
        fixedPolicySweepProbes=sweep_probes,U7EM41Baseline=prior_scores,U7RM42Comparison=x_scores,
        scope='Non-A/E/O initial mappings fixed to U7E; traditional actual 21x21 and full explicit M<=42 audit. Complete at-most-two-carrier assignments at the three recorded M41 final maps. Later finite carrier/final leader descent and selected joint memory-repair proposals may include a third carrier only when final-map savings keep total M<=42. Not exhaustive joint search, global optimality, or robust auxiliary-policy optimization. Finalists have full point-optimal policy enumeration or hash-verified identical-map reuse.')
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(dict(newExactStates=out['newExactStates'],newByM=out['newByM'],coverage=out['uniqueCoveredLayouts'],best1x=out['best1x'],best2x=out['best2x'],results=[dict(id=r['id'],M=r['audit']['M'],carriers=r['carriersByHead'],one=r['optimal1x']['score'],two=r['optimal2x']['score'],deltaToU7R=r['differenceFromU7RM42']) for r in results]),ensure_ascii=False))

if __name__=='__main__':main()
