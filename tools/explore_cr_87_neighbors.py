"""Bounded coupled and adjacent search from 87de6cc69c, with explicit state budget."""
import argparse
import copy
import gzip
import hashlib
import json
from pathlib import Path

from explore_cr_stable_neighbors import StableNeighbors
from explore_cr_667_neighbors import audit_coverage
from run_cr_anneal import ROOT,atomic_json,lock_run

PARENT='f0ae939a38'
ANCHOR='87de6cc69c'
SOURCE=ROOT/'research/notes/2026-11-17-cr-667-neighbors-finalists.json'
PREFIX=ROOT/'research/notes/2026-11-17-cr-87-neighbors'
OUTPUT=ROOT/'research/.cache/cr-87-neighbors-20261117'
BUDGET=5000


def read(path):return json.loads(Path(path).read_text(encoding='utf8'))
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_source():
    source=read(SOURCE);anchor=source['layouts'][0]
    if not anchor['key'].startswith(ANCHOR):raise ValueError('requested anchor is not 87')
    archive=SOURCE.parent/source['scoreArchive']['file']
    if sha(archive)!=source['scoreArchive']['sha256']:raise ValueError('source score hash mismatch')
    return source,anchor,json.loads(gzip.decompress(archive.read_bytes()))[PARENT],archive


class BudgetSearch(StableNeighbors):
    def score_batch(self,name,candidates,anchor):
        missing={r['key'] for r in candidates}-self.cache.keys()
        used=len(self.cache.keys()-self.imported_keys)
        if used+len(missing)>BUDGET:
            raise ValueError(f'new-state budget exceeded: {used}+{len(missing)}>{BUDGET}; reduce branch width')
        return super().score_batch(name,candidates,anchor)


def tradeoffs(search,anchor):
    """Keep daily recovery without making the chosen fixed-policy CKT worse than 87."""
    eligible=[r for r in search.cache.values() if r['metrics']['ckt']<=anchor['rustScore']+1e-10
        and r['metrics']['daily']>=anchor['metrics']['daily']-1e-9]
    for row in sorted(eligible,key=lambda r:(-r['metrics']['daily'],r['metrics']['ckt'])):
        checked=search.full_score(row)
        if checked['metrics']['pinky']<=search.profiles[PARENT]['pinkyCeiling']+1e-12:
            return checked
    return search.full_score(search.seeds[PARENT])


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--phase',choices=['coupled','adjacent','polish','export'],default='coupled')
    p.add_argument('--workers',type=int,default=12);p.add_argument('--width',type=int,default=10)
    args=p.parse_args()
    if not 1<=args.workers<=16 or not 1<=args.width<=20:p.error('invalid workers or width')
    source,anchor,imported,source_archive=load_source()
    search=BudgetSearch(OUTPUT,PARENT,anchor=anchor);search.workers=args.workers
    search.imported_keys=set(imported);lock=lock_run(search.output)
    try:
        contract=dict(version='cr-87-bounded-neighbors-v1',pinnedCenterKey=anchor['key'],budget=BUDGET,
            importedStateCount=len(imported),constraints=search.profiles[PARENT],
            sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in [SOURCE,source_archive]})
        path=search.output/'source-contract.json'
        if path.exists() and read(path)!=contract:raise ValueError('changed bounded experiment')
        atomic_json(path,contract)
        base=lambda c:{k:v for k,v in c.items() if k!='pinnedAnchor'}
        if base(source['contracts'][PARENT])!=base(search.progress['contract']):raise ValueError('different scoring contract')
        for key,row in imported.items():
            if search.space.key(row['state'])!=key:raise ValueError('source state hash mismatch')
            if row['metrics']['ckt']<anchor['rustScore']-1e-10:raise ValueError('source already has a better center')
            search.cache.setdefault(key,copy.deepcopy(row))
        if args.phase in ['coupled','adjacent']:
            search.progress['centers'][PARENT]=copy.deepcopy(search.seeds[PARENT])
        if not search.progress['rounds']:search.cache[anchor['key']]['metrics']['verified']=False
        expanded=search.progress['centers'][PARENT]['key']
        print(json.dumps(dict(requested=ANCHOR,expanded=expanded[:10],phase=args.phase,
            newStates=len(search.cache.keys()-search.imported_keys),budget=BUDGET)),flush=True)
        if args.phase=='coupled':search.run('coupled',0,20261117)
        elif args.phase=='adjacent':search.beam(args.width)
        elif args.phase=='polish':search.run('polish',0,20261117)
        else:
            if not {'coupled','beam'}<={r['phase'] for r in search.progress['rounds']}:
                raise ValueError('complete coupled and adjacent phases before export')
            coverage=audit_coverage(search,anchor)
            layout=search.export_layout(source);layout['role']='lowest_ckt'
            layouts=[layout];recovery=tradeoffs(search,anchor)
            if recovery['key']!=layout['key']:
                alternate=search.export_layout(source,representative=recovery)
                alternate['role']='daily_recovery_under_anchor_ckt';layouts.append(alternate)
            for exported in layouts:
                exported['uniqueScoredLayouts']=len(search.cache)
                exported['fullyVerified']=sum(r['metrics'].get('verified',False) for r in search.cache.values())
            atomic_json(search.cache_path,search.cache);atomic_json(search.state_path,search.progress)
            archive=Path(str(PREFIX)+'-scores.json.gz')
            archive.write_bytes(gzip.compress(json.dumps({PARENT:search.cache},ensure_ascii=False,
                separators=(',',':')).encode(),mtime=0))
            code=[Path(__file__),ROOT/'tools/explore_cr_stable_neighbors.py',ROOT/'tools/explore_cr_667_neighbors.py',
                ROOT/'tools/explore_cr_frontier_followup.py',ROOT/'tools/run_cr_anneal.py',
                ROOT/'research/config/cr-anneal-inputs.zip',
                ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe',
                ROOT/'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe',SOURCE,source_archive]
            atomic_json(Path(str(PREFIX)+'-finalists.json'),dict(version='cr-87-neighbors-v1',
                tokenKeys=source['tokenKeys'],firstAtomNames=source['firstAtomNames'],layouts=layouts,
                contracts={PARENT:search.progress['contract']},sourceContract=contract,coverage=coverage,
                importedStates=len(imported),newStates=len(search.cache.keys()-search.imported_keys),budget=BUDGET,
                sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in code},
                scoreArchive=dict(file=archive.name,sha256=sha(archive))))
            print(json.dumps([dict(role=r['role'],key=r['key'][:10],score=r['rustScore'],daily=r['metrics']['daily'])
                for r in layouts]),flush=True)
        if args.phase!='export':
            search.progress['rounds'][-1]['expandedCenterKey']=expanded
            atomic_json(search.state_path,search.progress)
    finally:
        if search.engine:search.engine.close()
        lock.close()


if __name__=='__main__':main()
