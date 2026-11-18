"""Exhaust legal one-step neighborhoods while keeping daily >=130 and reducing CKT."""
import argparse
import itertools
import json
from pathlib import Path
import types

import search_cr_lan_f19_combined as a
from refine_cr_lan_f19_full import full_batch


def best_target(search):
    return min((r for r in search.cache.values() if r['metrics']['daily'] >= 130-1e-9 and search.loads_ok(r)),
        key=lambda r: (r['metrics']['ckt'], -r['metrics']['daily']), default=None)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--rounds', type=int, default=3)
    p.add_argument('--workers', type=int, default=12)
    args = p.parse_args()
    if not 1 <= args.rounds <= 10 or not 1 <= args.workers <= 16:
        p.error('rounds must be 1..10 and workers 1..16')
    lock = a.lock_run(a.OUTPUT)
    s = None
    try:
        s = a.CombinedSearch(args.workers)
        s.score_batch = types.MethodType(full_batch, s)
        for number in range(1, args.rounds+1):
            phase = f'target130-{number}'
            old = next((r for r in s.progress['rounds'] if r['phase'] == phase), None)
            if old:
                if old['generatorSha256'] != a.sha(Path(__file__)):
                    raise ValueError('changed target refinement source')
                if not old['improved']:
                    break
                continue
            center = best_target(s)
            if center is None:
                raise ValueError('need an audited daily >=130 seed')
            moves = itertools.chain(a.single_root_moves(center['state']), a.root_exchanges(center['state']),
                a.group_exchanges(center['state']))
            candidates = [r for r in s.candidates(moves) if r['metrics']['daily'] >= 130-1e-9]
            print(json.dumps(dict(stage=phase, center=center['key'][:10], ckt=center['metrics']['ckt'],
                daily=center['metrics']['daily'], candidates=len(candidates))), flush=True)
            before = center['metrics']['ckt']
            _, fresh = s.score_batch(phase, candidates, center)
            winner = best_target(s)
            improved = winner['metrics']['ckt'] < before-1e-10
            s.progress['rounds'].append(dict(phase=phase, branches=[center['key']],
                candidateKeys=[r['key'] for r in candidates], before=before, after=winner['metrics']['ckt'],
                winner=winner['key'], improved=improved, fresh=fresh, dailyFloor=130,
                generatorSha256=a.sha(Path(__file__)),
                fullCpuBackendSha256=a.sha(a.ROOT/'tools/refine_cr_lan_f19_full.py')))
            a.atomic_json(s.cache_path, s.cache)
            a.atomic_json(s.state_path, s.progress)
            print(json.dumps(dict(stage=phase, winner=winner['key'][:10], metrics=winner['metrics'])), flush=True)
            if not improved:
                break
        s.export()
    finally:
        if s and s.engine:
            s.engine.close()
        lock.close()


if __name__ == '__main__':
    main()
