"""Uniform 18-root repartition around 667: no internal or tone-specific splits."""
import argparse
import copy
import gzip
import hashlib
import itertools
import json
from pathlib import Path

from explore_cr_stable_neighbors import StableNeighbors
from run_cr_anneal import ROOT,atomic_json,lock_run

PARENT='f0ae939a38'
SOURCE=ROOT/'research/notes/2026-11-16-cr-balanced-followup-finalists.json'
CACHE_SOURCE=ROOT/'research/notes/2026-11-17-cr-87-neighbors-finalists.json'
OUTPUT=ROOT/'research/.cache/cr-667-root-regroup-20261117'
PREFIX=ROOT/'research/notes/2026-11-17-cr-667-root-regroup'


def read(path):return json.loads(Path(path).read_text(encoding='utf8'))
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def joint_root_moves(state):
    """All two-root reassignments and three-root cycles; validate final state only."""
    original=state['partition']
    for a,b in itertools.combinations(range(18),2):
        for ga,gb in itertools.product(range(10),repeat=2):
            if ga==original[a] or gb==original[b]:continue
            s=copy.deepcopy(state);s['partition'][a]=ga;s['partition'][b]=gb
            yield f'two-roots:{a}>{ga}/{b}>{gb}',s
    for a,b,c in itertools.combinations(range(18),3):
        old=[original[a],original[b],original[c]]
        if len(set(old))!=3:continue
        for shifted in [old[1:]+old[:1],old[-1:]+old[:-1]]:
            s=copy.deepcopy(state)
            for i,g in zip([a,b,c],shifted):s['partition'][i]=g
            yield f'three-root-cycle:{a}/{b}/{c}:{shifted}',s


def source_data():
    source=read(SOURCE);anchor=source['layouts'][0]
    if not anchor['key'].startswith('667610a3fc'):raise ValueError('wrong requested center')
    old=read(CACHE_SOURCE);archive=CACHE_SOURCE.parent/old['scoreArchive']['file']
    if sha(archive)!=old['scoreArchive']['sha256']:raise ValueError('score source hash mismatch')
    strip=lambda c:{k:v for k,v in c.items() if k!='pinnedAnchor'}
    if strip(source['contracts'][PARENT])!=strip(old['contracts'][PARENT]):raise ValueError('incompatible scoring contracts')
    return source,anchor,json.loads(gzip.decompress(archive.read_bytes()))[PARENT],archive


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--phase',choices=['prepare','joint','key-refine','export'],default='joint')
    p.add_argument('--workers',type=int,default=12);args=p.parse_args()
    if not 1<=args.workers<=16:p.error('workers must be 1 to 16')
    source,anchor,imported,archive=source_data()
    s=StableNeighbors(OUTPUT,PARENT,anchor=anchor);s.workers=args.workers;lock=lock_run(s.output)
    try:
        base=lambda c:{k:v for k,v in c.items() if k!='pinnedAnchor'}
        if base(s.progress['contract'])!=base(source['contracts'][PARENT]):raise ValueError('different corpus or policy')
        contract=dict(version='cr-667-root-regroup-v1',anchorKey=anchor['key'],
            constraints=s.profiles[PARENT],uniformRootGroups=True,rootInternalSplits=0,
            sourceHashes={str(path.relative_to(ROOT)).replace('\\','/'):sha(path) for path in [SOURCE,CACHE_SOURCE,archive]})
        path=s.output/'regroup-contract.json'
        if path.exists() and read(path)!=contract:raise ValueError('changed regroup experiment')
        atomic_json(path,contract)
        for key,row in imported.items():
            if s.space.key(row['state'])!=key:raise ValueError('invalid cached state')
            s.cache.setdefault(key,copy.deepcopy(row))
        center=copy.deepcopy(s.seeds[PARENT])
        if args.phase in ['joint','prepare']:
            candidates=list(s.candidates(center['state'],s.profiles[PARENT],joint_root_moves(center['state'])))
        elif args.phase=='key-refine':
            # Expand keys at the five best strict repartitions, not unrelated
            # historical layouts with a different partition.
            joint=next(r for r in s.progress['rounds'] if r['phase']=='joint-root-regroup')
            branches=sorted((s.cache[k] for k in joint['candidateKeys']),key=lambda r:(r['metrics']['ckt'],r['key']))[:5]
            def key_moves():
                for row in branches:
                    for r,region in enumerate(s.space.f['toneRegions']):
                        for g,old in enumerate(row['state']['groupKeys'][r]):
                            for target in region['keys']:
                                if target==old:continue
                                state=copy.deepcopy(row['state']);state['groupKeys'][r][g]=target
                                yield f'key-after-regroup:{row["key"][:10]}/{r}/{g}>{target}',state
                        for a,b in itertools.combinations(range(10),2):
                            if row['state']['groupKeys'][r][a]==row['state']['groupKeys'][r][b]:continue
                            state=copy.deepcopy(row['state']);keys=state['groupKeys'][r];keys[a],keys[b]=keys[b],keys[a]
                            yield f'key-swap-after-regroup:{row["key"][:10]}/{r}/{a}/{b}',state
            candidates=list(s.candidates(center['state'],s.profiles[PARENT],key_moves()))
        if args.phase=='prepare':
            print(json.dumps(dict(center=anchor['key'][:10],candidates=len(candidates),new=len({r['key'] for r in candidates}-s.cache.keys()),
                memoryCounts={str(m):sum(r['metrics']['m']==m for r in candidates) for m in [20,21,22]},
                rootInternalSplits=0)),flush=True);return
        if args.phase!='export':
            if len(s.cache.keys()-imported.keys())+len({r['key'] for r in candidates}-s.cache.keys())>5000:
                raise ValueError('exceeds 5000 new-state budget')
            if not s.progress['rounds']:s.cache[anchor['key']]['metrics']['verified']=False
            center=s.full_score(s.cache[anchor['key']])
            if abs(center['metrics']['ckt']-anchor['rustScore'])>1e-9:raise ValueError('667 full calibration mismatch')
            phase='joint-root-regroup' if args.phase=='joint' else 'keys-after-regroup'
            scored,fresh=s.score_batch(phase,candidates,center)
            winner=s.select(scored,PARENT,center)
            s.progress['centers'][PARENT]=winner
            stage=dict(phase=phase,centerKey=anchor['key'],candidateKeys=[r['key'] for r in candidates],
                available=len(candidates),considered=len(candidates),fresh=fresh,before=center['metrics']['ckt'],
                after=winner['metrics']['ckt'],winner=winner['key'],rootInternalSplits=0)
            if args.phase=='key-refine':stage['branchKeys']=[r['key'] for r in branches]
            s.progress['rounds'].append(stage);atomic_json(s.cache_path,s.cache);atomic_json(s.state_path,s.progress)
            print(json.dumps(stage|dict(candidateKeys='saved in state.json')),flush=True)
        else:
            if not s.progress['rounds']:raise ValueError('no scored regroup stages')
            # Only the explicitly searched regroup endpoints and requested
            # center are eligible. Old 87 is not a result of this experiment.
            keys={k for stage in s.progress['rounds'] for k in stage['candidateKeys']}
            center=s.full_score(s.cache[anchor['key']]);winner=s.select([s.cache[k] for k in keys],PARENT,center)
            s.progress['centers'][PARENT]=winner
            layout=s.export_layout(source,representative=winner)
            # Also export the best changed grouping even if it is a tradeoff.
            changed=sorted((s.cache[k] for k in keys if s.cache[k]['state']['partition']!=anchor['state']['partition']),
                key=lambda r:(r['metrics']['ckt'],r['key']))
            best_changed=None
            for row in changed:
                checked=s.full_score(row)
                if checked['metrics']['pinky']<=s.profiles[PARENT]['pinkyCeiling']+1e-12:
                    best_changed=checked;break
            layouts=[layout];layout['role']='best_from_667'
            if best_changed and best_changed['key']!=winner['key']:
                item=s.export_layout(source,representative=best_changed);item['role']='best_changed_partition';layouts.append(item)
            atomic_json(s.cache_path,s.cache);atomic_json(s.state_path,s.progress)
            out_archive=Path(str(PREFIX)+'-scores.json.gz')
            # Keep the evaluated endpoints and center, rather than duplicating
            # all imported historical neighborhoods in the tracked archive.
            selected={k:s.cache[k] for k in keys|{anchor['key']}}
            out_archive.write_bytes(gzip.compress(json.dumps({PARENT:selected},ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
            for item in layouts:
                item['uniqueScoredLayouts']=len(selected);item['fullyVerified']=sum(r['metrics'].get('verified',False) for r in selected.values())
            code=[Path(__file__),ROOT/'tools/explore_cr_stable_neighbors.py',ROOT/'tools/explore_cr_frontier_followup.py',
                ROOT/'tools/run_cr_anneal.py',ROOT/'research/config/cr-anneal-inputs.zip',SOURCE,CACHE_SOURCE,archive,
                ROOT/'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe',
                ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe']
            atomic_json(Path(str(PREFIX)+'-finalists.json'),dict(version='cr-667-root-regroup-v1',
                tokenKeys=source['tokenKeys'],firstAtomNames=source['firstAtomNames'],layouts=layouts,
                contracts={PARENT:s.progress['contract']},regroupContract=contract,stages=s.progress['rounds'],
                newStates=len(s.cache.keys()-imported.keys()),evaluatedStates=len(selected),rootInternalSplits=0,
                sourceHashes={path.relative_to(ROOT).as_posix():sha(path) for path in code},
                scoreArchive=dict(file=out_archive.name,sha256=sha(out_archive))))
            print(json.dumps([dict(role=r['role'],key=r['key'][:10],score=r['rustScore'],daily=r['metrics']['daily'],M=r['metrics']['m'])
                for r in layouts]),flush=True)
    finally:
        if s.engine:s.engine.close()
        lock.close()


if __name__=='__main__':main()
