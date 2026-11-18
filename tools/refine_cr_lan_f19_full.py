"""Use persistent full CPU scorers for broad joint moves; identical native score."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import threading
import types

import search_cr_lan_f19_combined as a
from run_cr_anneal import Engine


def full_batch(self, name, candidates, anchor):
    missing = {r['key']: r for r in candidates if r['key'] not in self.cache}
    fresh = len(missing)
    path = self.output/(name+'-full-scores.json')
    contract = dict(version='cr-lan-f19-full-native-cpu-v1',
        sourceSha256=a.sha(Path(__file__)), searchContract=a.digest(self.progress['contract']),
        candidates=a.digest([dict(key=r['key'], state=r['state']) for r in candidates]))
    results = {}
    if path.exists():
        old = a.read(path)
        if old['contract'] != contract:
            raise ValueError('changed full-score candidate/backend contract')
        for key, row in old['results'].items():
            if key in missing:
                if row['state'] != missing[key]['state']:
                    raise ValueError('recovered full-score state mismatch')
                self.cache[key] = row
                del missing[key]
            results[key] = row
    pending = list(missing.values())
    chunks = [pending[i:i+4] for i in range(0, len(pending), 4)]
    local, engines, guard = threading.local(), [], threading.Lock()
    def evaluate(chunk):
        if not hasattr(local, 'engine'):
            local.engine = Engine(a.ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe',
                self.output/'inputs', 'cpu', 1, 300)
            with guard:
                engines.append(local.engine)
        values = local.engine.score([self.space.expand(r['state']) for r in chunk], True)
        return [dict(r, metrics=dict(r['metrics'], **v)) for r, v in zip(chunk, values, strict=True)]
    try:
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            futures = [executor.submit(evaluate, chunk) for chunk in chunks]
            completed = 0
            for future in as_completed(futures):
                for row in future.result():
                    self.cache[row['key']] = row
                    results[row['key']] = row
                    completed += 1
                if completed % 40 == 0 or completed == len(pending):
                    a.atomic_json(path, dict(contract=contract, results=results))
                    print(json.dumps(dict(stage=name, fullCpuCompleted=completed,
                        fullCpuPending=len(pending), recovered=fresh-len(pending))), flush=True)
    finally:
        for engine in engines:
            engine.close()
    return [self.cache[r['key']] for r in candidates], fresh


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--phase', choices=['joint1', 'joint2', 'joint3', 'joint4'], default='joint1')
    p.add_argument('--workers', type=int, default=12)
    args = p.parse_args()
    if not 1 <= args.workers <= 16:
        p.error('workers must be 1 to 16')
    lock = a.lock_run(a.OUTPUT)
    s = None
    try:
        s = a.CombinedSearch(args.workers)
        s.score_batch = types.MethodType(full_batch, s)
        s.stage(args.phase)
        stage = next(r for r in s.progress['rounds'] if r['phase'] == args.phase)
        stage['fullCpuBackendSha256'] = a.sha(Path(__file__))
        a.atomic_json(s.state_path, s.progress)
        s.export()
    finally:
        if s and s.engine:
            s.engine.close()
        lock.close()


if __name__ == '__main__':
    main()
