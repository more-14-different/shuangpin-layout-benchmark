"""Score deterministic contiguous job shards using the existing exact Rust evaluator."""
import argparse
import json
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('prefix')
    parser.add_argument('--workers', type=int, default=3)
    args = parser.parse_args()
    prefix = ROOT / args.prefix
    job = json.loads(Path(str(prefix) + '-job.json').read_text(encoding='utf8'))
    candidates = job['candidates']
    workers = min(max(args.workers, 1), len(candidates))
    assert workers
    processes, logs, output_paths = [], [], []
    started = time.monotonic()
    try:
        for i in range(workers):
            shard = dict(job, candidates=candidates[i * len(candidates) // workers:(i + 1) * len(candidates) // workers])
            job_path = Path(f'{prefix}-shard{i}-job.json')
            out_path = Path(f'{prefix}-shard{i}-scores.json')
            job_path.write_text(json.dumps(shard, ensure_ascii=False), encoding='utf8')
            # Mark outputs pending so a rerun cannot consume stale shard scores.
            out_path.write_text(json.dumps(dict(completed=0, total=len(shard['candidates']), elapsedSeconds=0, results=[])), encoding='utf8')
            log = Path(f'{prefix}-shard{i}.log').open('w', encoding='utf8')
            logs.append(log)
            output_paths.append(out_path)
            command = [str(ROOT / 'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe'),
                       'research/.cache/ckt-v51-toned-native-corpus.bin', 'tools/ckt_v4_upstream_role_tables.json',
                       str(job_path), str(out_path)]
            processes.append(subprocess.Popen(command, cwd=ROOT, stdout=log, stderr=log,
                                               creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)))
        last_print = 0
        while True:
            statuses = [p.poll() for p in processes]
            if any(code is not None and code != 0 for code in statuses):
                raise RuntimeError(f'shard failed: {statuses}; inspect {prefix}-shard*.log')
            try:
                outputs = [json.loads(p.read_text(encoding='utf8')) for p in output_paths]
            except (json.JSONDecodeError, PermissionError):
                time.sleep(1)
                continue
            rows = [r for output in outputs for r in output['results']]
            elapsed = time.monotonic() - started
            combined = dict(completed=len(rows), total=len(candidates), elapsedSeconds=elapsed,
                            workerSeconds=sum(x['elapsedSeconds'] for x in outputs), workers=workers, results=rows)
            Path(str(prefix) + '-scores.json').write_text(json.dumps(combined, indent=2), encoding='utf8')
            done = all(code == 0 for code in statuses)
            if elapsed - last_print >= 30 or done:
                best = min(rows, key=lambda r: r['score']) if rows else None
                print(json.dumps(dict(completed=len(rows), total=len(candidates), elapsedSeconds=elapsed, best=best)), flush=True)
                last_print = elapsed
            if done:
                assert len(rows) == len(candidates)
                assert {r['id'] for r in rows} == {c['id'] for c in candidates}
                break
            time.sleep(2)
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
                process.wait()
        for log in logs:
            log.close()


if __name__ == '__main__':
    main()
