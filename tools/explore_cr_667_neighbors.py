"""Coupled and adjacent-center exploration pinned to 667610a3fc."""
import argparse
import copy
import gzip
import hashlib
import itertools
import json
from pathlib import Path

from explore_cr_stable_neighbors import StableNeighbors
from explore_cr_frontier_followup import local_moves,coupled_moves,paired_moves
from run_cr_anneal import ROOT,atomic_json,lock_run

PARENT='f0ae939a38'
ANCHOR='667610a3fc'
SOURCE=ROOT/'research/notes/2026-11-16-cr-balanced-followup-finalists.json'
ORIGIN=ROOT/'research/notes/2026-11-17-cr-f0-origin-completion-finalists.json'
PREFIX=ROOT/'research/notes/2026-11-17-cr-667-neighbors'
OUTPUT=ROOT/'research/.cache/cr-667-neighbors-20261117'


def read(path):return json.loads(Path(path).read_text(encoding='utf8'))
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_sources():
    source=read(SOURCE);layout=source['layouts'][0]
    if not layout['key'].startswith(ANCHOR):raise ValueError('unexpected requested center')
    cache={};paths=[]
    for path in [SOURCE,ORIGIN]:
        data=read(path);archive=path.parent/data['scoreArchive']['file']
        if sha(archive)!=data['scoreArchive']['sha256']:raise ValueError('archive hash mismatch')
        if data['contracts'][PARENT]!=source['contracts'][PARENT]:raise ValueError('different source contracts')
        for key,row in json.loads(gzip.decompress(archive.read_bytes()))[PARENT].items():
            if key in cache and abs(cache[key]['metrics']['ckt']-row['metrics']['ckt'])>1e-9:
                raise ValueError('inconsistent source scores')
            cache.setdefault(key,row)
        paths.extend([path,archive])
    return source,layout,cache,paths


def audit_coverage(search,anchor):
    """Reconstruct each completed stage and verify every proposed endpoint was scored."""
    audits=[];profile=search.profiles[PARENT]
    for stage in search.progress['rounds']:
        key=stage.get('expandedCenterKey',anchor['key']);center=search.cache[key];state=center['state']
        if stage['phase']=='coupled':
            local=list(search.candidates(state,profile,local_moves(state,search.space)))
            near=sorted([search.cache[r['key']] for r in local if r['key']!=key],key=lambda r:r['metrics']['ckt'])[:20]
            moves=itertools.chain(paired_moves(state,near),coupled_moves(state,search.space))
        elif stage['phase']=='beam':
            moves=(('branch:'+branch+'/'+label,s) for branch in stage['branchKeys']
                for label,s in local_moves(search.cache[branch]['state'],search.space))
        else:moves=local_moves(state,search.space)
        candidates=list(search.candidates(state,profile,moves));record=stage['profiles'][PARENT]
        if len(candidates)!=record['available'] or record['considered']!=len(candidates):
            raise ValueError('incomplete stage candidate coverage')
        if any(r['key'] not in search.cache for r in candidates):raise ValueError('stage endpoint has no score')
        joint=0;maximum=0
        for row in candidates:
            other=row['state']
            first=sum(a!=b for a,b in zip(state['firstKeys'],other['firstKeys']))
            rhymes=sum(a!=b for a,b in zip(state['partition'],other['partition']))+sum(
                a!=b for x,y in zip(state['groupKeys'],other['groupKeys']) for a,b in zip(x,y))
            joint+=bool(first and rhymes);maximum=max(maximum,first+rhymes)
        audits.append(dict(phase=stage['phase'],centerKey=key,candidateKeys=[r['key'] for r in candidates],
            complete=True,count=len(candidates),initialRhymeJoint=joint,maxChangedVariables=maximum))
    return audits


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--phase',choices=['coupled','adjacent','polish','export'],default='coupled')
    p.add_argument('--workers',type=int,default=12)
    p.add_argument('--width',type=int,default=10)
    args=p.parse_args()
    if not 1<=args.workers<=16 or not 1<=args.width<=20:p.error('invalid workers or width')
    source,anchor,imported,paths=load_sources()
    search=StableNeighbors(OUTPUT,PARENT,anchor=anchor);search.workers=args.workers;lock=lock_run(search.output)
    try:
        contract=dict(sourceHashes={path.relative_to(ROOT).as_posix():sha(path) for path in paths},
            pinnedCenterKey=anchor['key'],importedStateCount=len(imported),constraints=search.profiles[PARENT])
        manifest=search.output/'source-contract.json'
        if manifest.exists() and read(manifest)!=contract:raise ValueError('changed imported experiment')
        atomic_json(manifest,contract)
        base={k:v for k,v in search.progress['contract'].items() if k!='pinnedAnchor'}
        if base!=source['contracts'][PARENT]:raise ValueError('different scoring environment')
        for key,row in imported.items():
            if search.space.key(row['state'])!=key:raise ValueError('invalid imported state')
            if row['metrics']['ckt']<anchor['metrics']['ckt']-1e-10:
                raise ValueError('source already has a better starting center')
            search.cache.setdefault(key,copy.deepcopy(row))
        if args.phase in ['coupled','adjacent']:
            # Both operations start at the requested 667, even if another phase improved it.
            search.progress['centers'][PARENT]=copy.deepcopy(search.seeds[PARENT])
        if not search.progress['rounds']:
            search.cache[anchor['key']]['metrics']['verified']=False
        expanded_key=search.progress['centers'][PARENT]['key']
        print(json.dumps(dict(requestedCenter=ANCHOR,expandedCenter=expanded_key[:10],phase=args.phase)),flush=True)
        if args.phase=='coupled':search.run('coupled',0,20261117)
        elif args.phase=='adjacent':search.beam(args.width)
        elif args.phase=='polish':search.run('polish',0,20261117)
        else:
            if not {'coupled','beam'}<={r['phase'] for r in search.progress['rounds']}:
                raise ValueError('complete coupled and adjacent stages before export')
            coverage=audit_coverage(search,anchor)
            layout=search.export_layout(source)
            archive=Path(str(PREFIX)+'-scores.json.gz')
            archive.write_bytes(gzip.compress(json.dumps({PARENT:search.cache},ensure_ascii=False,
                separators=(',',':')).encode(),mtime=0))
            code=[Path(__file__),ROOT/'tools/explore_cr_stable_neighbors.py',ROOT/'tools/explore_cr_frontier_followup.py',
                ROOT/'tools/run_cr_anneal.py',ROOT/'research/config/cr-anneal-inputs.zip',
                ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe',
                ROOT/'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe']
            atomic_json(Path(str(PREFIX)+'-finalists.json'),dict(version='cr-667-neighbors-v1',
                tokenKeys=source['tokenKeys'],firstAtomNames=source['firstAtomNames'],layouts=[layout],
                contracts={PARENT:search.progress['contract']},sourceContract=contract,
                coverage=coverage,
                importedStates=len(imported),newStates=len(set(search.cache)-set(imported)),
                sourceHashes={path.relative_to(ROOT).as_posix():sha(path) for path in code+paths},
                scoreArchive=dict(file=archive.name,sha256=sha(archive))))
            print(json.dumps(dict(center=anchor['key'][:10],winner=layout['key'][:10],before=anchor['rustScore'],
                after=layout['rustScore'],daily=layout['metrics']['daily'],newStates=len(set(search.cache)-set(imported)))),flush=True)
        if args.phase!='export':
            search.progress['rounds'][-1]['expandedCenterKey']=expanded_key
            atomic_json(search.state_path,search.progress)
    finally:
        if search.engine:search.engine.close()
        lock.close()


if __name__=='__main__':main()
