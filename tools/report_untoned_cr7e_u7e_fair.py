"""Report the U7E-only follow-up without treating unequal historical budgets as a proof."""
import argparse
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'research/notes/2026-11-20-untoned-cr7e-u7e-fair'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(hashes):
    for p,h in hashes.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--phase',choices=['drop20','restored21'],default='drop20');args=parser.parse_args()
    prefix=Path(str(BASE)+'-'+args.phase+'-v52');raw=read(str(prefix)+'.json');verified=read(str(prefix)+'-verification.json')
    assert raw['completed'] and verified['completed'];check(raw['sourceHashes']);check(verified['sourceHashes'])
    earlier21=ROOT/'research/notes/2026-11-20-untoned-cr7e-blocks-v52-summary.json'
    earlier20=ROOT/'research/notes/2026-11-20-untoned-cr7e-dropfinal-v52-summary.json'
    x_frontier_file=ROOT/'research/notes/2026-11-20-untoned-cr7e-restored21-v52-summary.json'
    baseline=read(earlier21);old_drop=read(earlier20);x_frontier=read(x_frontier_file)
    known={}
    if args.phase=='restored21':
        for name in ['far','recovery','blocks','crosswide','multiblock','dropfinal','restored21']:
            known.update(read(ROOT/f'research/notes/2026-11-20-untoned-cr7e-{name}-v52.json')['states'])
        known.update(read(str(BASE)+'-drop20-v52.json')['states'])
        known.update(raw['states'])
    baseline_scores={str(m):min(r[f'optimal{m}x']['score'] for r in baseline['results']) for m in [1,2]}
    x_scores={str(m):min(r[f'optimal{m}x']['score'] for r in x_frontier['results']) for m in [1,2]}
    expected=20 if args.phase=='drop20' else 21
    sources=[Path(__file__),Path(str(prefix)+'.json'),Path(str(prefix)+'-verification.json'),earlier21,earlier20,x_frontier_file]
    rows={row['id']:row for row in verified['results']}
    if args.phase=='restored21' and raw['states']:
        # The old frontier can dominate global rankings while the new centers still merit verification.
        for axis in ['score','doubledScore']:
            candidate=min(raw['states'].values(),key=lambda r:r[axis])
            if candidate['id'] not in rows:
                replay_file=Path(str(prefix)+'-replay-'+candidate['id']+'.json');row=read(replay_file);check(row['sourceHashes']);sources.append(replay_file)
                assert row['initialMap']==candidate['initialMap'] and row['finalMap']==candidate['finalMap']
                assert row['score']==candidate['score'] and row['doubledScore']==candidate['doubledScore']
                rows[row['id']]=row
    results=[]
    for row in rows.values():
        memory=memory_r2.audit(verified['auditInput'],row)
        assert memory['coverage']==399 and memory['M']<=42 and memory['ordinaryDisplacedCount']<=2 and memory['branchCount']==0
        assert memory['usedFinalKeys']==expected and (memory['M'],memory['unique'])==(row['audit']['M'],row['audit']['unique'])
        assert row['initialMap']==raw['initialMap'] and row['maxTrackDifference']<1e-8
        codes=[row['codeList'][p] for p,_ in verified['auditInput']['base']]
        assert len(set(c[0] for c in codes))==21 and len(set(c[1] for c in codes))==expected and 'QZ' not in codes and 'ZQ' not in codes
        if expected==20:assert all(c[1]!=row['forbiddenFinalKey'] for c in codes)
        assert row['auxiliarySemantics']['toneDigitsByShapeMeaning']=='42310'
        pfile=Path(str(prefix)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        if policy.get('retainedVerifierRevision'):
            rev=policy['retainedVerifierRevision'];assert hashlib.sha256(gzip.decompress(Path(rev['archive']).read_bytes())).hexdigest()==rev['uncompressedSha256']
        assert policy['initialMap']==row['initialMap'] and policy['finalMap']==row['finalMap'] and policy['activePhysicalKeys']==[21,expected]
        assert policy['auxiliarySemantics']==row['auxiliarySemantics']
        results.append(dict(id=row['id'],forbiddenFinalKey=row.get('forbiddenFinalKey'),initialMap=row['initialMap'],finalMap=row['finalMap'],audit=row['audit'],independentMemory=memory,
            optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],maxTrackDifference=row['maxTrackDifference'],
            improvementOverU7E21Frontier={str(m):baseline_scores[str(m)]-policy[f'optimal{m}x']['score'] for m in [1,2]},
            differenceFromU7X21Frontier={str(m):policy[f'optimal{m}x']['score']-x_scores[str(m)] for m in [1,2]},
            changesFromEarlierU7E1x={f:[raw['baseline']['one']['finalMap'][f],v] for f,v in row['finalMap'].items() if raw['baseline']['one']['finalMap'][f]!=v}))
    lanes=[]
    for lane in raw['lanes']:
        candidates=[r for r in results if expected==21 or r['forbiddenFinalKey']==lane['forbiddenFinalKey']]
        best1=min(candidates,key=lambda r:r['optimal1x']['score']);best2=min(candidates,key=lambda r:r['optimal2x']['score'])
        previous=next((l for l in old_drop['lanes'] if l['family']=='U7E' and l['forbiddenFinalKey']==lane['forbiddenFinalKey']),None)
        lanes.append(dict(forbiddenFinalKey=lane['forbiddenFinalKey'],knownLayouts=lane['count'],best1x=best1['id'],best2x=best2['id'],optimal1x=best1['optimal1x'],optimal2x=best2['optimal2x'],
            improvementOverEarlierDrop={str(m):previous[f'optimal{m}x']['score']-(best1 if m==1 else best2)[f'optimal{m}x']['score'] for m in [1,2]} if previous else None))
    paths=[]
    for trajectory in raw['restoredPaths']:
        seed=known[trajectory['seedId']];last=known[trajectory['currentId']];axis=trajectory['axis']
        paths.append(dict(**trajectory,seedFixedPolicyScore=seed[axis],lastFixedPolicyScore=last[axis],fixedPolicyImprovement=seed[axis]-last[axis],
            lastScore=last['score'],lastDoubledScore=last['doubledScore']))
    out=dict(version='untoned-cr7e-u7e-fair-summary-1',phase=args.phase,completed=True,contract=raw['contract'],initialMap=raw['initialMap'],searchAuxiliaryPolicy=raw['policy'],
        seeds=raw['seeds'],newExactStates=len(raw['states']),importedUniqueStates=raw['importedUniqueStates'],coverage=verified['coverage'],uniqueCoveredLayouts=verified['uniqueCoveredLayouts'],
        closure=verified['closure'],restoredPaths=paths,continuation=raw.get('continuation'),lanes=lanes,results=results,U7E21Baseline=baseline_scores,U7X21Comparison=x_scores,
        scope='U7E initials exclusively. Both original layouts and descended frontiers included. Q/Z have independent alternating complete-ring descent with eight rings per lane at most. Restored lane/cost paths include best candidates and alternative centers distinct from the old two frontiers, initially sharing eight rings; the recorded continuation permits four additional fresh-scored path rings, while cached historical rings are free, followed by global-leader rings. Finite search, not a global optimum proof. Closure only refers to recorded fixed-policy leaders and defined final move/swap/whole-group operators; auxiliary optimization covers finalists only.')
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(prefix)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(dict(phase=args.phase,newExactStates=out['newExactStates'],coverage=out['uniqueCoveredLayouts'],lanes=[dict(ex=l['forbiddenFinalKey'],best1=l['best1x'],best2=l['best2x'],one=l['optimal1x']['score'],two=l['optimal2x']['score'],improvement=l['improvementOverEarlierDrop']) for l in lanes]),ensure_ascii=False))

if __name__=='__main__':main()
