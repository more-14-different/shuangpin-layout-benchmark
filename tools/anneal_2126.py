"""GPU-assisted heuristic annealing; ONLY full CPU CKT decides acceptance/champions.

No claim of a Boltzmann stationary distribution: proxy-directed proposals are asymmetric.
One Node worker, bounded CUDA batches, round-robin routes, atomic checkpoints, exact resume RNG.
"""
import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import random
import signal
import subprocess
import time

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ROWS = [list(range(10)), list(range(10, 19)), list(range(19, 26))]
# Actual letters QWERTYUIOP / ASDFGHJKL / ZXCVBNM as alphabet indices.
KEYS = [[ord(k)-65 for k in row] for row in ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']]


def atomic(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    with tmp.open('w', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, allow_nan=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def valid(state, seed, max_multi=10):
    p = state['partition']
    if len(p) != 18 or set(p) != set(range(10)):
        return False
    if sum(p.count(g) > 1 for g in range(10)) > max_multi:
        return False
    if len(state['maps']) != 3 or not 0 <= state['policy'] < 144:
        return False
    for r, row in enumerate(state['maps']):
        if len(row) != 10 or len(set(row)) != seed['rowCounts'][r]:
            return False
        if any(k < 0 or k >= len(ROWS[r]) for k in row):
            return False
        if seed['qEmpty'] and r == 0 and 0 in row:
            return False
    if 'legalRootTones' in seed:
        occupied = [set(), set(), set()]
        for root, tone in seed['legalRootTones']:
            row = seed['toneRowsByTone'][str(tone)]
            occupied[row].add(state['maps'][row][p[root]])
        if [len(s) for s in occupied] != seed['rowCounts']:
            return False
    return True


def mutate(state, seed, rng, max_multi=10):
    for _ in range(200):
        s = copy.deepcopy(state)
        # Single, coupled and multi-step proposals can cross the previously audited walls.
        moves = rng.choices([1, 2, 4, 8], [55, 25, 15, 5])[0]
        for _ in range(moves):
            op = rng.randrange(5)
            if op < 2:
                a, b = rng.sample(range(18), 2)
                if op == 0:
                    s['partition'][a] = rng.randrange(10)
                else:
                    s['partition'][a], s['partition'][b] = s['partition'][b], s['partition'][a]
            elif op < 4:
                r = rng.randrange(3)
                a, b = rng.sample(range(10), 2)
                if op == 2:
                    s['maps'][r][a], s['maps'][r][b] = s['maps'][r][b], s['maps'][r][a]
                else:
                    s['maps'][r][a] = rng.randrange(1 if seed['qEmpty'] and r == 0 else 0, len(ROWS[r]))
            else:
                s['policy'] = rng.randrange(144)
        if s != state and valid(s, seed, max_multi):
            return s
    raise RuntimeError('failed to generate legal proposal')


class Proxy:
    """GPU screening heuristic, NOT CKT. float64 CPU/GPU parity checked at startup."""
    def __init__(self, bundle, backend, memory_mb):
        if backend == 'cuda':
            import cupy as cp
            cp.get_default_memory_pool().set_limit(size=memory_mb * 1024**2)
            self.xp = cp
            self.energy = cp.RawKernel(r'''
            extern "C" __global__ void energy(const long long* code, const double* w,
                                              double* out, long long n, long long total) {
              long long i=(long long)blockIdx.x*blockDim.x+threadIdx.x;
              if(i>=total) return;
              if(i%n!=n-1 && code[i]==code[i+1]) {out[i]=0;return;}
              double mass=0; long long begin=(i/n)*n;
              for(long long j=i;j>=begin && code[j]==code[i];--j) mass+=w[j];
              out[i]=mass*mass;
            }''', 'energy')
        else:
            self.xp = np
        self.bundle = bundle
        xp = self.xp
        self.roots = xp.asarray([t['root'] for t in bundle['tokens']], dtype=xp.int64)
        self.first = xp.asarray([ord(t['first'])-65 for t in bundle['tokens']], dtype=xp.int64)
        self.tones = [t['tone'] for t in bundle['tokens']]
        self.weights = xp.asarray(bundle['proxyWeights'], dtype=xp.float64)
        self.motor = xp.asarray(bundle['proxyMotor'], dtype=xp.float64)
        self.words = {}
        for kind, records in bundle['proxyWords'].items():
            self.words[kind] = (xp.asarray([w['tokens'] for w in records], dtype=xp.int64),
                                xp.asarray([w['weight'] for w in records], dtype=xp.float64))
        self.keys = xp.asarray([r + [0]*(10-len(r)) for r in KEYS], dtype=xp.int64)

    def evaluate(self, route, states):
        xp = self.xp
        seed = self.bundle['seeds'][route]
        row = xp.asarray([seed['toneRowsByTone'][str(t)] for t in self.tones], dtype=xp.int64)
        partitions = xp.asarray([s['partition'] for s in states], dtype=xp.int64)
        maps = xp.asarray([s['maps'] for s in states], dtype=xp.int64)
        batch = xp.arange(len(states))[:, None]
        second = self.keys[row[None, :], maps[batch, row[None, :], partitions[:, self.roots]]]
        codes = self.first[None, :] * 26 + second
        result = (self.motor[xp.arange(len(self.tones))[None, :], second] * self.weights).sum(axis=1)
        # Weighted pair collision energy, computed exactly for these sampled base-code buckets.
        def collision(c, w):
            order = xp.argsort(c, axis=1)
            sorted_codes = xp.take_along_axis(c, order, axis=1)
            weights = xp.broadcast_to(w, c.shape)
            sorted_w = xp.take_along_axis(weights, order, axis=1)
            if xp is not np:
                energy = xp.empty_like(sorted_w)
                self.energy(((c.size+255)//256,), (256,),
                            (sorted_codes, sorted_w, energy, np.int64(c.shape[1]), np.int64(c.size)))
                return energy.sum(axis=1) - (w**2).sum()
            prefix = xp.cumsum(sorted_w, axis=1)
            start = xp.concatenate([xp.ones((len(states), 1), dtype=bool), sorted_codes[:, 1:] != sorted_codes[:, :-1]], axis=1)
            start_indices = xp.maximum.accumulate(xp.where(start, xp.arange(c.shape[1])[None, :], 0), axis=1)
            previous = xp.concatenate([xp.zeros((len(states), 1)), prefix[:, :-1]], axis=1)
            group_mass = prefix - xp.take_along_axis(previous, start_indices, axis=1)
            end = xp.concatenate([sorted_codes[:, :-1] != sorted_codes[:, 1:], xp.ones((len(states), 1), dtype=bool)], axis=1)
            return (group_mass**2 * end).sum(axis=1) - (w**2).sum()
        result += 300 * collision(codes, self.weights)
        for kind, (tokens, w) in self.words.items():
            if kind == 'word2':
                c = codes[:, tokens[:, 0]] * 676 + codes[:, tokens[:, 1]]
                factor = 3
            else:
                stem = ((self.first[tokens[:, 0]] * 26 + self.first[tokens[:, 1]]) * 26 + self.first[tokens[:, 2]]) * 26
                c = stem[None, :] + second[:, tokens[:, 2]]
                factor = 1
            result += factor * 300 * collision(c, w)
        if xp is not np:
            xp.cuda.Stream.null.synchronize()
            return xp.asnumpy(result)
        return result


class Worker:
    def __init__(self, bundle, memory_mb):
        self.p = subprocess.Popen(['node', f'--max-old-space-size={memory_mb}',
                                   str(ROOT/'tools/anneal_2126_worker.js'), str(bundle)],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
                                  encoding='utf-8', bufsize=1)
        ready = self.read()
        if not ready.get('ready'):
            raise RuntimeError(ready)

    def read(self):
        line = self.p.stdout.readline()
        if not line:
            raise RuntimeError('exact worker exited; checkpoint retained')
        result = json.loads(line)
        if 'error' in result:
            raise RuntimeError(result['error'])
        return result

    def score(self, route, state, export=False):
        self.p.stdin.write(json.dumps(dict(route=route, state=state, export=export))+'\n')
        self.p.stdin.flush()
        return self.read()

    def close(self):
        if self.p.poll() is None:
            self.p.stdin.close()
            try:
                self.p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.p.terminate()
                self.p.wait(timeout=5)


def tuplify(x):
    return tuple(map(tuplify, x)) if isinstance(x, list) else x


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bundle', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--backend', choices=['cuda', 'cpu'], default='cuda')
    p.add_argument('--hours', type=float, default=24)
    p.add_argument('--steps', type=int, default=0, help='additional exact proposals; 0 is time-limited')
    p.add_argument('--batch', type=int, default=64)
    p.add_argument('--gpu-mb', type=int, default=1024)
    p.add_argument('--node-mb', type=int, default=8192)
    p.add_argument('--duty', type=float, default=.45, help='active fraction for this worker, NOT global GPU utilization')
    p.add_argument('--seed', type=int, default=212626)
    p.add_argument('--random-proposal', type=float, default=.35)
    p.add_argument('--cycle', type=int, default=2048, help='proposals per replica per reheating cycle')
    p.add_argument('--max-multi', type=int, default=10, help='max multi-root groups; structural cap, not calibrated M')
    args = p.parse_args()
    if not (0 < args.duty <= 1 and 1 <= args.batch <= 512 and 0 <= args.random_proposal <= 1
            and args.hours > 0 and args.steps >= 0 and args.cycle >= 8 and 1 <= args.max_multi <= 10
            and args.gpu_mb >= 128 and args.node_mb >= 1024):
        p.error('invalid resource/search limits')
    args.out.mkdir(parents=True, exist_ok=True)
    lock = args.out/'run.lock'
    try:
        lock_fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise SystemExit('run.lock exists: do not run two writers; after crash verify PID is gone before removing lock')
    os.write(lock_fd, str(os.getpid()).encode()); os.close(lock_fd)
    worker = None
    checkpoint = None
    stop = False
    def request_stop(*_):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)
    rng = random.Random(args.seed)
    try:
        manifest = json.loads((args.bundle/'manifest.json').read_text(encoding='utf-8'))
        for name, sha in manifest['files'].items():
            if hashlib.sha256((args.bundle/name).read_bytes()).hexdigest() != sha:
                raise ValueError('bundle integrity failure: '+name)
        bundle = json.loads((args.bundle/'search.json').read_text(encoding='utf-8'))
        for seed in bundle['seeds'].values():
            seed['legalRootTones'] = sorted({(t['root'], t['tone']) for t in bundle['tokens']})
        # Reject resume after scorer/search code or scientific contract changes.
        code_files = list((ROOT/'tools').glob('*.js')) + [Path(__file__)]
        code_hash = hashlib.sha256(b''.join(f.name.encode()+f.read_text(encoding='utf-8').encode('utf-8') for f in sorted(code_files))).hexdigest()
        contract = dict(manifest=manifest, codeHash=code_hash, batch=args.batch, seed=args.seed,
                        randomProposal=args.random_proposal, cycle=args.cycle, maxMulti=args.max_multi)
        cp_path = args.out/'checkpoint.json'
        if cp_path.exists():
            checkpoint = json.loads(cp_path.read_text(encoding='utf-8'))
            if checkpoint['contract'] != contract:
                raise ValueError('resume contract differs; start a new output directory')
            rng.setstate(tuplify(checkpoint['rng']))
        else:
            replicas = []
            for route, seed in bundle['seeds'].items():
                if not valid(seed['state'], seed, args.max_multi):
                    raise ValueError('seed violates max-multi or structural constraints')
                for temp in [.002, .01, .04]:
                    replicas.append(dict(route=route, state=seed['state'], score=seed['score'], temp=temp, visits=0, accepts=0))
            checkpoint = dict(contract=contract, iteration=0, replicas=replicas,
                              best={r:dict(state=s['state'], score=s['score']) for r,s in bundle['seeds'].items()})
        worker = Worker(args.bundle.resolve(), args.node_mb)
        for r, b in checkpoint['best'].items():
            replay = worker.score(r, b['state'], export=True)
            if abs(replay['score']-b['score']) > 1e-10:
                raise ValueError('checkpoint exact score drift')
            atomic(args.out/f'best-{r}.json', dict(route=r, state=b['state'], **replay))
        proxy = Proxy(bundle, args.backend, args.gpu_mb)
        cpu = Proxy(bundle, 'cpu', args.gpu_mb)
        # Test actual candidate batches across all routes, including random mutations.
        parity_rng = random.Random(17)
        max_error = 0.0
        for r,s in bundle['seeds'].items():
            candidates = [s['state']] + [mutate(s['state'],s,parity_rng,args.max_multi) for _ in range(7)]
            a, b = cpu.evaluate(r,candidates), proxy.evaluate(r,candidates)
            np.testing.assert_allclose(a,b,rtol=1e-10,atol=1e-9)
            max_error = max(max_error,float(np.max(np.abs(a-b))))
        atomic(args.out/'startup.json', dict(backend=args.backend, proxyParityMaxError=max_error,
               seedScores=manifest['seedScores'], note='GPU proxy is not CKT; acceptance uses full CKT'))
        print(json.dumps(dict(ready=True,backend=args.backend,proxyParity=max_error)),flush=True)
        def save():
            checkpoint['rng'] = rng.getstate()
            atomic(cp_path,checkpoint)
        save()
        initial = checkpoint['iteration']; start = time.monotonic(); last_print = 0.0
        while not stop and not (args.out/'STOP').exists():
            if time.monotonic()-start >= args.hours*3600 or (args.steps and checkpoint['iteration']-initial >= args.steps):
                break
            tick = time.monotonic()
            index = checkpoint['iteration'] % len(checkpoint['replicas'])
            lane = checkpoint['replicas'][index]; route=lane['route']; seed=bundle['seeds'][route]
            candidates = [mutate(lane['state'],seed,rng,args.max_multi) for _ in range(args.batch)]
            estimates = proxy.evaluate(route,candidates)
            selected = rng.randrange(len(candidates)) if rng.random()<args.random_proposal else int(np.argmin(estimates))
            candidate = candidates[selected]
            value = worker.score(route,candidate)
            score = value['score']
            temperature = lane['temp'] * (0.02 ** ((lane['visits'] % args.cycle)/args.cycle))
            delta=score-lane['score']
            accepted = delta <= 0 or rng.random() < math.exp(-delta/temperature)
            if accepted:
                lane.update(state=candidate,score=score);lane['accepts']+=1
            lane['visits']+=1
            if score < checkpoint['best'][route]['score']-1e-10:
                checkpoint['best'][route]=dict(state=candidate,score=score)
                exported=worker.score(route,candidate,export=True)
                atomic(args.out/f'best-{route}.json',dict(route=route,state=candidate,**exported))
                with (args.out/'improvements.jsonl').open('a',encoding='utf-8') as f:
                    f.write(json.dumps(dict(iteration=checkpoint['iteration'],route=route,score=score,state=candidate))+'\n')
                print(f'NEW {route} {score:.12f}',flush=True)
            # Replica exchange within a route. Scientific settings fixed in checkpoint.
            if lane['visits'] % 32 == 0:
                group=index//3*3; other=checkpoint['replicas'][group+(index%3+1)%3]
                other_t=other['temp']*(.02**((other['visits']%args.cycle)/args.cycle))
                logp=(1/temperature-1/other_t)*(lane['score']-other['score'])
                if logp>=0 or rng.random()<math.exp(logp):
                    lane['state'],other['state']=other['state'],lane['state']
                    lane['score'],other['score']=other['score'],lane['score']
            checkpoint['iteration']+=1
            save()
            if time.monotonic()-last_print > 30:
                print(json.dumps(dict(iteration=checkpoint['iteration'],best={r:b['score'] for r,b in checkpoint['best'].items()})),flush=True)
                last_print=time.monotonic()
            # Duty includes CPU scoring, and is interruptible; STOP checked every <=1 second.
            rest=(time.monotonic()-tick)*(1/args.duty-1)
            until=time.monotonic()+rest
            while time.monotonic()<until and not stop and not (args.out/'STOP').exists():
                time.sleep(min(1,until-time.monotonic()))
        save()
        print(json.dumps(dict(stopped=True,iteration=checkpoint['iteration'],best={r:b['score'] for r,b in checkpoint['best'].items()})),flush=True)
    finally:
        if worker:
            worker.close()
        lock.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
