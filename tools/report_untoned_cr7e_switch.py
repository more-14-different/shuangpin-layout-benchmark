"""Audit adaptive initial switching and report the temporary bucket domain explicitly."""
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OPEN='--open' in sys.argv
PREFIX=ROOT/('research/notes/2026-11-20-untoned-cr7e-switch-v52'+('-openbuckets' if OPEN else ''))
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def check(hashes):
    for p,h in hashes.items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p
def identity(row):return tuple(sorted(row['initialMap'].items())),tuple(sorted(row['finalMap'].items()))
def cost(t,m):return t['motorUpperMs']+m*(t['effectiveMs']-t['motorUpperMs'])
def fourth(tracks,reference,m):return sum(w*(cost(tracks[k],m)/cost(reference[k],m))**4 for k,w in [('character',1),('word2',3),('word3',1),('word4',1)])

def main():
    raw=read(str(PREFIX)+'.json');verified=read(str(PREFIX)+'-verification.json')
    assert raw['completed'] and verified['completed'];check(raw['sourceHashes']);check(verified['sourceHashes'])
    assert raw['contract']['qzEmpty']==raw['contract']['zqEmpty']==(not OPEN)
    previous_file=ROOT/'research/notes/2026-11-20-untoned-cr7e-restored21-v52-summary.json';previous=read(previous_file)
    comparison={str(m):min(r[f'optimal{m}x']['score'] for r in previous['results']) for m in [1,2]}
    sources=[Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json'),previous_file];results=[]
    for row in verified['results']:
        memory=memory_r2.audit(verified['auditInput'],row)
        assert memory['coverage']==399 and memory['M'] in [41,42] and memory['ordinaryDisplacedCount']==2 and memory['branchCount']==0 and memory['usedFinalKeys']==21
        assert (memory['M'],memory['unique'])==(row['audit']['M'],row['audit']['unique'])
        codes=[row['codeList'][p] for p,_ in verified['auditInput']['base']]
        assert len({c[0] for c in codes})==len({c[1] for c in codes})==21
        assert ('QZ' in codes)==row['audit']['qz'] and ('ZQ' in codes)==row['audit']['zq']
        if not OPEN:assert 'QZ' not in codes and 'ZQ' not in codes
        assert row['maxTrackDifference']<1e-8 and row['auxiliarySemantics']['toneDigitsByShapeMeaning']=='42310'
        pfile=Path(str(PREFIX)+'-policy-'+row['id']+'.json');policy=read(pfile);check(policy['sourceHashes']);sources.append(pfile)
        cfile=Path(str(PREFIX)+'-components-'+row['id']+'.json.gz');components=json.loads(gzip.decompress(cfile.read_bytes()));sources.append(cfile)
        assert components['id']==row['id']
        assert identity(policy)==identity(row) and policy['activePhysicalKeys']==[21,21] and policy['auxiliarySemantics']==row['auxiliarySemantics'] and components['reference']==raw['reference']
        for m in [1,2]:
            total=0
            for mode in ['keytao','sanpin']:
                cases=components['cases'][mode]['results'];assert len(cases)==144 and len({c['policyKey'] for c in cases})==144
                best=min(fourth(c['tracks'],raw['reference'][mode],m) for c in cases)
                chosen=next(c for c in cases if c['policyKey']==policy[f'optimal{m}x']['policy'][mode])
                assert abs(fourth(chosen['tracks'],raw['reference'][mode],m)-best)<1e-12;total+=best
            assert abs(10*(total/12)**.25-policy[f'optimal{m}x']['score'])<1e-9
        results.append(dict(id=row['id'],audit=row['audit'],independentMemory=memory,initialMap=row['initialMap'],finalMap=row['finalMap'],optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x'],maxTrackDifference=row['maxTrackDifference'],differenceFromU7R={str(m):policy[f'optimal{m}x']['score']-comparison[str(m)] for m in [1,2]}))
    trials=[]
    for t in raw['trials']:
        trials.append(dict(index=t['index'],anchor=t['anchor'],axis=t['axis'],initialMap=t['initialMap'],startId=t['startId'],finalId=t['finalId'],batches=len(t['batches']),finalProbeSelections=sum(len(b['selectedIds']) for b in t['batches']),totalGain=t['totalGain'],stopReason=t['reason']))
    occupied=[r for r in raw['states'].values() if r['audit']['qz'] or r['audit']['zq']]
    out=dict(version='untoned-cr7e-adaptive-switch-summary-1',completed=True,bucketsTemporarilyRelaxed=OPEN,contract=raw['contract'],searchAuxiliaryPolicy=raw['policy'],newExactStates=len(raw['states']),uniqueCoveredLayouts=verified['uniqueCoveredLayouts'],distinctInitials=verified['distinctInitials'],
        selectionImplementationClarification='Candidate generation includes frequency-guided home-row allocations. Numeric ranking uses motor proxy plus weighted collision miss only; there is no explicit initial-home-share term. This clarifies the broader wording in the frozen raw contract description.',
        newByM={str(m):sum(r['audit']['M']==m for r in raw['states'].values()) for m in [41,42]},
        occupiedBucketCounts={b:sum(r['audit'][b] for r in raw['states'].values()) for b in ['qz','zq']},
        batchCountHistogram={str(n):sum(len(t['batches'])==n for t in raw['trials']) for n in [1,2,3]},trialResults=trials,results=results,U7RComparison=comparison,
        occupiedBucketLayouts=len(occupied),bestOccupiedBucketFixedPolicy={axis:dict(id=min(occupied,key=lambda r:r[axis])['id'],score=min(r[axis] for r in occupied)) for axis in ['score','doubledScore']} if occupied else {},
        scope='Eighteen different initial maps with short final-probe batches. Switch when batch target improvement is below .003; at most three 32-layout batches per initial. Proxies plus deterministic diversification select candidates. Separate strict and temporarily relaxed QZ/ZQ domains. No exhaustive final neighborhood, initial neighborhood, local/global optimality, or robust auxiliary-policy claim. Full point-optimal auxiliary enumeration covers selected leaders only.')
    out['sourceHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    Path(str(PREFIX)+'-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(dict(open=OPEN,newExactStates=out['newExactStates'],coverage=out['uniqueCoveredLayouts'],distinctInitials=out['distinctInitials'],batchHistogram=out['batchCountHistogram'],occupiedBuckets=out['occupiedBucketCounts'],results=[dict(id=r['id'],one=r['optimal1x']['score'],two=r['optimal2x']['score'],M=r['audit']['M'],D=r['audit']['D'],qz=r['audit']['qz'],zq=r['audit']['zq']) for r in results]),ensure_ascii=False))

if __name__=='__main__':main()
