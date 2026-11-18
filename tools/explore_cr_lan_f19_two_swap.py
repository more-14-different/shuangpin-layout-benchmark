"""Target 130 with two exchanges and historical seeds restored to f19 key counts."""
import argparse
from collections import Counter
import copy
import heapq
import itertools
import json
from pathlib import Path

from explore_cr_frontier_followup import Followup
import search_cr_lan_f19_combined as a

PROPOSALS = a.OUTPUT/'two-swap-proposals.json'
SCORED = a.OUTPUT/'two-swap-scored.json'
WORK = a.OUTPUT/'two-swap-probe'
SEEDS = a.ROOT/'research/notes/2026-11-18-cr-lan-213-finalists.json'


def repair_row_multiset(row, baseline):
    excess, missing = Counter(row)-Counter(baseline), Counter(baseline)-Counter(row)
    if not excess:
        yield row[:]
        return
    options = [list(itertools.combinations([i for i, x in enumerate(row) if x == key], count))
        for key, count in sorted(excess.items())]
    seen = set()
    for choices in itertools.product(*options):
        indices = sorted(itertools.chain.from_iterable(choices))
        for values in sorted(set(itertools.permutations(missing.elements()))):
            repaired = row[:]
            for i, value in zip(indices, values, strict=True):
                repaired[i] = value
            signature = tuple(repaired)
            if signature not in seen:
                seen.add(signature)
                yield repaired


def propose():
    space = a.CarrierSpace(a.OUTPUT/'inputs')
    source = a.read(a.PREVIOUS)
    candidates, branches = {}, []
    for seed in source['layouts']:
        first = {}
        for label, state in a.group_exchanges(seed['state']):
            m = space.memory(state)
            if not m or m['m'] > 24:
                continue
            m.update(space.daily(state))
            key = space.key(state)
            first.setdefault(key, dict(key=key, state=state, metrics=m, label=seed['key'][:10]+'/'+label))
        branches.extend(heapq.nlargest(5, first.values(), key=lambda r: r['metrics']['daily']))
    for branch in branches:
        for label, state in a.group_exchanges(branch['state']):
            m = space.memory(state)
            if not m or m['m'] > 24:
                continue
            m.update(space.daily(state))
            if m['daily'] < 130:
                continue
            key = space.key(state)
            candidates.setdefault(key, dict(key=key, state=state, metrics=m, label=branch['label']+'/'+label))
    baseline = a.read(a.SOURCE)['layouts'][0]
    projection_keys = set()
    for seed in a.read(SEEDS)['layouts']:
        if seed['state']['firstKeys'] != baseline['state']['firstKeys']:
            raise ValueError('historical seed has different fixed onsets')
        rows = [list(repair_row_multiset(row, base)) for row, base in
            zip(seed['state']['groupKeys'], baseline['state']['groupKeys'], strict=True)]
        for keys in itertools.product(*rows):
            state = copy.deepcopy(seed['state'])
            state['groupKeys'] = list(keys)
            if not a.same_key_multisets(state, baseline['state']):
                raise ValueError('historical seed projection changed the target multiset')
            m = space.memory(state)
            if not m or m['m'] > 24:
                continue
            m.update(space.daily(state))
            if m['daily'] < baseline['metrics']['daily']-1e-9:
                continue
            key = space.key(state)
            projection_keys.add(key)
            candidates.setdefault(key, dict(key=key, state=state, metrics=m,
                label='projected-seed:'+seed['key'][:10]))
    a.atomic_json(PROPOSALS, dict(version='cr-lan-f19-targeted-v2', target=130, topPerSeed=5,
        sourceSha256=a.sha(a.PREVIOUS), generatorSha256=a.sha(Path(__file__)),
        projectedSourceSha256=a.sha(SEEDS), projectedSeedKeys=sorted(projection_keys),
        seedKeys=[r['key'] for r in source['layouts']], branchKeys=[r['key'] for r in branches],
        candidates=list(candidates.values())))
    print(json.dumps(dict(twoSwapCandidates=len(candidates),
        maxDaily=max((r['metrics']['daily'] for r in candidates.values()), default=None))), flush=True)


def score(workers):
    proposals = a.read(PROPOSALS)
    if proposals['generatorSha256'] != a.sha(Path(__file__)) or proposals['sourceSha256'] != a.sha(a.PREVIOUS):
        raise ValueError('target proposals changed source contract')
    if proposals['projectedSourceSha256'] != a.sha(SEEDS):
        raise ValueError('historical projection source changed')
    WORK.mkdir(parents=True, exist_ok=True)
    a.unpack(a.BUNDLE, WORK/'inputs')
    s = Followup.__new__(Followup)
    s.output, s.space = WORK, a.CarrierSpace(WORK/'inputs')
    s.cache_path = WORK/'cache.json'
    s.cache = a.read(s.cache_path) if s.cache_path.exists() else {}
    s.workers, s.score_max_d, s.score_max_m, s.track_pinkies = workers, 2, 24, True
    base = a.read(a.SOURCE)['layouts'][0]
    anchor = dict(key=base['key'], state=base['state'], metrics=base['metrics'])
    s.cache.setdefault(anchor['key'], anchor)
    lock = a.lock_run(WORK)
    try:
        rows, _ = s.score_batch('two-swap', proposals['candidates'], anchor)
        a.atomic_json(SCORED, dict(version=proposals['version'], proposalsSha256=a.sha(PROPOSALS), rows=rows))
        good = [r for r in rows if r['metrics']['daily'] >= 130-1e-9 and
            r['metrics']['pinky'] <= base['constraints']['pinkyCeiling']+1e-12
            and r['metrics']['rightPinky'] <= base['constraints']['rightPinkyCeiling']+1e-12]
        best = min(good, key=lambda r: r['metrics']['ckt'], default=None)
        print(json.dumps(dict(scored=len(rows), loadQualified=len(good),
            best=None if best is None else dict(key=best['key'][:10], metrics=best['metrics']))), flush=True)
    finally:
        lock.close()


def merge():
    proposals, scored = a.read(PROPOSALS), a.read(SCORED)
    if scored['proposalsSha256'] != a.sha(PROPOSALS) or proposals['generatorSha256'] != a.sha(Path(__file__)):
        raise ValueError('target score provenance changed')
    if {r['key'] for r in proposals['candidates']} != {r['key'] for r in scored['rows']}:
        raise ValueError('target score coverage mismatch')
    lock = a.lock_run(a.OUTPUT)
    s = None
    try:
        s = a.CombinedSearch()
        if not any(r['phase'] == 'targeted-seeds-and-two-swaps' for r in s.progress['rounds']):
            for row in scored['rows']:
                if not a.same_key_multisets(row['state'], s.base['state']) or s.space.key(row['state']) != row['key']:
                    raise ValueError('target state violated fixed contract')
                old = s.cache.get(row['key'])
                if old and abs(old['metrics']['ckt']-row['metrics']['ckt']) > 1e-9:
                    raise ValueError('target/combined score mismatch')
                s.cache.setdefault(row['key'], row)
            s.progress['rounds'].append(dict(phase='targeted-seeds-and-two-swaps', candidateKeys=[r['key'] for r in scored['rows']],
                branches=proposals['branchKeys'], sourceHashes=dict(generator=a.sha(Path(__file__)),
                    proposals=a.sha(PROPOSALS), scores=a.sha(SCORED), projectedSeeds=a.sha(SEEDS)), target=130, topPerSeed=5,
                projectedSeedKeys=proposals['projectedSeedKeys']))
            a.atomic_json(s.cache_path, s.cache)
            a.atomic_json(s.state_path, s.progress)
        s.export()
        print(json.dumps(s.status()), flush=True)
    finally:
        if s and s.engine:
            s.engine.close()
        lock.close()


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--phase', choices=['propose', 'score', 'merge'], default='propose')
    p.add_argument('--workers', type=int, default=4)
    args = p.parse_args()
    if not 1 <= args.workers <= 16:
        p.error('workers must be 1 to 16')
    if args.phase == 'propose':
        propose()
    elif args.phase == 'score':
        score(args.workers)
    else:
        merge()
