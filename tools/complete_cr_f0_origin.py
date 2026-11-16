"""Complete the original f0 coupled neighborhood, pinned to its historical center."""
import argparse
import copy
from collections import Counter
import gzip
import hashlib
import itertools
import json
from pathlib import Path
import random

from explore_cr_stable_neighbors import StableNeighbors
from explore_cr_frontier_followup import local_moves,coupled_moves,paired_moves
from run_cr_anneal import ROOT,atomic_json,lock_run

PARENT='f0ae939a38'
SOURCE=ROOT/'research/notes/2026-11-16-cr-balanced-followup-finalists.json'
PREFIX=ROOT/'research/notes/2026-11-17-cr-f0-origin-completion'
OUTPUT=ROOT/'research/.cache/cr-f0-origin-completion-20261117'


def read(path):return json.loads(Path(path).read_text(encoding='utf8'))
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def reconstruct(search,source,cache):
    layout=source['layouts'][0]
    if layout['parent']!=PARENT or layout['anchorKey']!=search.seeds[PARENT]['key']:
        raise ValueError('unexpected source center')
    if source['contracts'][PARENT]!=search.progress['contract'] or layout['constraints']!=search.profiles[PARENT]:
        raise ValueError('changed corpus, policy, inputs or constraints')
    anchor=cache[layout['anchorKey']]
    local=list(search.candidates(anchor['state'],search.profiles[PARENT],local_moves(anchor['state'],search.space)))
    near=sorted([cache[r['key']] for r in local if r['key']!=anchor['key']],key=lambda r:r['metrics']['ckt'])[:20]
    candidates=list(search.candidates(anchor['state'],search.profiles[PARENT],itertools.chain(
        paired_moves(anchor['state'],near),coupled_moves(anchor['state'],search.space))))
    old=next(r for r in layout['rounds'] if r['phase']=='coupled')
    record=old['profiles'][PARENT]
    if anchor['key']!=layout['rounds'][0]['profiles'][PARENT]['winner'] or record['available']!=921 or len(candidates)!=921:
        raise ValueError('historical 921-candidate neighborhood changed')
    pairs=[r for r in candidates if r['label'].startswith('ranked-pair:')]
    rest=[r for r in candidates if not r['label'].startswith('ranked-pair:')]
    rng=random.Random(old['seed']);count=record['considered'];n=min(len(pairs),count//2)
    sampled=rng.sample(pairs,n)+rng.sample(rest,min(len(rest),count-n))
    if len(sampled)!=240 or any(r['key'] not in cache for r in sampled):
        raise ValueError('historical 240-candidate sample not reproduced')
    return anchor,candidates,sampled,near


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=OUTPUT)
    parser.add_argument('--prefix',type=Path,default=PREFIX)
    parser.add_argument('--workers',type=int,default=12)
    parser.add_argument('--prepare-only',action='store_true')
    args=parser.parse_args()
    if not 1<=args.workers<=16:parser.error('workers must be 1 to 16')
    source=read(SOURCE);archive=SOURCE.parent/source['scoreArchive']['file']
    if sha(archive)!=source['scoreArchive']['sha256']:raise ValueError('source score archive hash mismatch')
    old_cache=json.loads(gzip.decompress(archive.read_bytes()))[PARENT]
    search=StableNeighbors(args.output,PARENT);search.workers=args.workers;lock=lock_run(search.output)
    try:
        anchor,candidates,sampled,near=reconstruct(search,source,old_cache)
        ids={r['key'] for r in candidates};sample_ids={r['key'] for r in sampled}
        source_ids=ids & old_cache.keys();remaining=ids-sample_ids
        manifest=dict(version='cr-f0-origin-completion-v1',centerKey=anchor['key'],centerState=anchor['state'],
            wordAuxiliaryPolicy=search.policy,constraints=search.profiles[PARENT],
            sourceHashes={SOURCE.relative_to(ROOT).as_posix():sha(SOURCE),archive.relative_to(ROOT).as_posix():sha(archive)},
            contract=search.progress['contract'],nearKeys=[r['key'] for r in near],
            candidateKeys=[r['key'] for r in candidates],originalSampleKeys=[r['key'] for r in sampled],
            remainingAfterOriginalSample=sorted(remaining),previouslyScoredKeys=sorted(source_ids),
            newlyRequiredKeys=sorted(ids-source_ids))
        manifest_path=search.output/'completion-contract.json'
        if manifest_path.exists() and read(manifest_path)!=manifest:raise ValueError('changed completion experiment')
        atomic_json(manifest_path,manifest)
        if args.prepare_only:
            print(json.dumps(dict(total=len(ids),originalSample=len(sample_ids),remaining=len(remaining),
                previouslyScored=len(source_ids),newlyRequired=len(ids-source_ids))),flush=True);return
        # Import only this pinned neighborhood. Later centers cannot become winners here.
        allowed=ids|{anchor['key']}
        if any(key not in allowed for key in search.cache):raise ValueError('cache includes another neighborhood')
        proposals={r['key']:r for r in candidates}
        for key in source_ids|{anchor['key']}:
            row=old_cache[key]
            if search.space.key(row['state'])!=key:raise ValueError('source state key mismatch')
            if key in proposals and search.space.expand(row['state'])!=search.space.expand(proposals[key]['state']):
                raise ValueError('source physical layout mismatch')
            if key in search.cache and abs(search.cache[key]['metrics']['ckt']-row['metrics']['ckt'])>1e-9:
                raise ValueError('inconsistent reused score')
            search.cache.setdefault(key,copy.deepcopy(row))
        # Recalibrate the exact original center with the current full Rust scorer.
        search.cache[anchor['key']]['metrics']['verified']=False
        checked=search.full_score(search.cache[anchor['key']])
        for field in ['ckt','daily','pinky']:
            if abs(checked['metrics'][field]-search.seeds[PARENT]['metrics'][field])>1e-9:
                raise ValueError('original center anchor mismatch: '+field)
        print(json.dumps(dict(center=anchor['key'][:10],total=921,originalSample=240,
            previouslyScored=len(source_ids),newlyRequired=len(ids-source_ids))),flush=True)
        scored,fresh=search.score_batch('origin-coupled-921',candidates,checked)
        if {r['key'] for r in scored}!=ids:raise ValueError('incomplete 921 coverage')
        winner=search.select(scored,PARENT,checked)
        search.progress['centers'][PARENT]=winner
        item=dict(available=921,considered=921,fresh=fresh,before=checked['metrics']['ckt'],
            after=winner['metrics']['ckt'],winner=winner['key'],metrics=winner['metrics'],
            operators=dict(Counter(r['label'].split(':')[0] for r in candidates)))
        search.progress['rounds']=[dict(phase='origin-coupled-complete',seed=20261116,profiles={PARENT:item})]
        layout=search.export_layout(read(SOURCE))
        args.prefix.parent.mkdir(parents=True,exist_ok=True)
        output_archive=Path(str(args.prefix)+'-scores.json.gz')
        output_archive.write_bytes(gzip.compress(json.dumps({PARENT:search.cache},ensure_ascii=False,
            separators=(',',':')).encode(),mtime=0))
        completion=dict(manifest,allCandidatesScored=True,coverage=921,previouslyScored=len(source_ids),
            newlyRequired=len(ids-source_ids),newlyScoredThisRun=fresh,
            bestWithinOrigin=dict(key=winner['key'],metrics=winner['metrics']),
            priorBestAcrossCenters=dict(key=source['layouts'][0]['key'],metrics=source['layouts'][0]['metrics']))
        paths=[Path(__file__),ROOT/'tools/explore_cr_stable_neighbors.py',ROOT/'tools/explore_cr_frontier_followup.py',
            ROOT/'tools/run_cr_anneal.py',ROOT/'research/config/cr-anneal-inputs.zip',SOURCE,archive,
            ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe',
            ROOT/'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe']
        atomic_json(Path(str(args.prefix)+'-finalists.json'),dict(version='cr-f0-origin-completion-v1',
            tokenKeys=source['tokenKeys'],firstAtomNames=source['firstAtomNames'],layouts=[layout],
            contracts={PARENT:search.progress['contract']},completion=completion,
            sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in paths},
            scoreArchive=dict(file=output_archive.name,sha256=sha(output_archive))))
        print(json.dumps(dict(item,previouslyScored=len(source_ids),newlyRequired=len(ids-source_ids))),flush=True)
    finally:
        if search.engine:search.engine.close()
        lock.close()


if __name__=='__main__':main()
