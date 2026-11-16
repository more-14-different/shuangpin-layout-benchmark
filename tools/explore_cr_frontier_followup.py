"""Finite local, coupled, and independently seeded low-temperature CR searches."""
import argparse
import copy
from collections import Counter
import gzip
import hashlib
import itertools
import json
import math
import os
from pathlib import Path
import random
import subprocess
import time

from run_cr_anneal import ROOT, SearchSpace, Engine, unpack, atomic_json, fits_budget, digest, lock_run

ARCHIVE = ROOT / 'research/config/cr-frontier-finalists.json'
DEFAULT_OUTPUT = ROOT / 'research/.cache/cr-frontier-followup-20261116'


def local_moves(state, space):
    for root, old in enumerate(state['partition']):
        for target in range(10):
            if old != target:
                s = copy.deepcopy(state); s['partition'][root] = target
                yield f'root:{space.spec["roots"][root]}:{old}>{target}', s
    for a, b in itertools.combinations(range(18), 2):
        if state['partition'][a] != state['partition'][b]:
            s = copy.deepcopy(state); s['partition'][a], s['partition'][b] = s['partition'][b], s['partition'][a]
            yield f'root-swap:{a}/{b}', s
    for region, spec in enumerate(space.f['toneRegions']):
        for group, old in enumerate(state['groupKeys'][region]):
            for target in spec['keys']:
                if target != old:
                    s = copy.deepcopy(state); s['groupKeys'][region][group] = target
                    yield f'key:{region}/{group}:{old}>{target}', s
        for a, b in itertools.combinations(range(10), 2):
            if state['groupKeys'][region][a] != state['groupKeys'][region][b]:
                s = copy.deepcopy(state); row = s['groupKeys'][region]; row[a], row[b] = row[b], row[a]
                yield f'key-swap:{region}/{a}/{b}', s
    for atom, old in enumerate(state['firstKeys']):
        for target in space.allowed_first:
            if target != old:
                s = copy.deepcopy(state); s['firstKeys'][atom] = target
                yield f'first:{space.f["atoms"][atom]["name"]}:{old}>{target}', s
    for a, b in itertools.combinations(range(len(state['firstKeys'])), 2):
        if state['firstKeys'][a] != state['firstKeys'][b]:
            s = copy.deepcopy(state); row = s['firstKeys']; row[a], row[b] = row[b], row[a]
            yield f'first-swap:{a}/{b}', s


def coupled_moves(state, space):
    # Validate only the final combination: a root step can temporarily exceed M.
    for root, old in enumerate(state['partition']):
        for target in range(10):
            if old == target:
                continue
            s = copy.deepcopy(state); s['partition'][root] = target
            for region in range(3):
                c = copy.deepcopy(s); row = c['groupKeys'][region]; row[old], row[target] = row[target], row[old]
                yield f'root+key-swap:{root}/{old}>{target}/{region}', c
                for group in (old, target):
                    for key in space.f['toneRegions'][region]['keys']:
                        if key != state['groupKeys'][region][group]:
                            c = copy.deepcopy(s); c['groupKeys'][region][group] = key
                            yield f'root+key-move:{root}/{target}/{region}/{group}>{key}', c
    for a, b in itertools.combinations(range(18), 2):
        ga, gb = state['partition'][a], state['partition'][b]
        if ga == gb:
            continue
        for region in range(3):
            s = copy.deepcopy(state); s['partition'][a], s['partition'][b] = gb, ga
            row = s['groupKeys'][region]; row[ga], row[gb] = row[gb], row[ga]
            yield f'root-swap+key-swap:{a}/{b}/{region}', s
    er, v = (space.spec['roots'].index(root) for root in ['er', 'v'])
    for ga, gb in itertools.product(range(10), repeat=2):
        s = copy.deepcopy(state); s['partition'][er], s['partition'][v] = ga, gb
        yield f'er+v:{ga}/{gb}', s


def paired_moves(state, alternatives):
    def edits(other):
        changes = {}
        for field in ['firstKeys', 'partition']:
            for i, (a, b) in enumerate(zip(state[field], other[field], strict=True)):
                if a != b:
                    changes[field, i, -1] = b
        for r in range(3):
            for i, (a, b) in enumerate(zip(state['groupKeys'][r], other['groupKeys'][r], strict=True)):
                if a != b:
                    changes['groupKeys', r, i] = b
        return changes
    for first, second in itertools.combinations(alternatives, 2):
        a, b = edits(first['state']), edits(second['state'])
        if not a or not b or any(a[k] != b[k] for k in a.keys() & b.keys()):
            continue
        combined = copy.deepcopy(state)
        for (field, i, j), value in (a | b).items():
            if j == -1:
                combined[field][i] = value
            else:
                combined[field][i][j] = value
        yield 'ranked-pair:' + first.get('label', first['key'][:10]) + '+' + second.get('label', second['key'][:10]), combined


class Followup:
    def __init__(self, output):
        self.output = output; output.mkdir(parents=True, exist_ok=True)
        self.manifest = unpack(ROOT / 'research/config/cr-anneal-inputs.zip', output / 'inputs')
        self.space = SearchSpace(output / 'inputs')
        archive = json.loads(ARCHIVE.read_text(encoding='utf8'))
        roles = {'speed': 'global_ckt_minimum', 'balanced': 'balanced_daily_king', 'daily': 'ultra_high_daily'}
        self.seeds = {name: copy.deepcopy(next(row['item'] for row in archive['finalists'] if row['role'] == role))
                      for name, role in roles.items()}
        self.profiles = {name: dict(maxM=seed['metrics']['m'],
            dailyFloor=0 if name == 'speed' else seed['metrics']['daily'],
            pinkyCeiling=1 if name == 'speed' else seed['metrics']['pinky']) for name, seed in self.seeds.items()}
        self.cache_path = output / 'cache.json'
        self.cache = json.loads(self.cache_path.read_text(encoding='utf8')) if self.cache_path.exists() else {}
        self.state_path = output / 'state.json'
        self.progress = json.loads(self.state_path.read_text(encoding='utf8')) if self.state_path.exists() else {
            'contract': dict(bundleManifest=digest(self.manifest), archive=digest(archive), maxD=2, maxGuard=24,
                             shapeKeysByMeaning='AVUIO', toneKeysByTone='IVUAO', wordPolicy='12/213/24'),
            'profiles': self.profiles, 'centers': self.seeds, 'rounds': []}
        if self.progress['contract']['bundleManifest'] != digest(self.manifest) or self.progress['contract']['archive'] != digest(archive):
            raise ValueError('changed frozen inputs; use a new output directory')
        if self.progress['profiles'] != self.profiles:
            raise ValueError('changed objective constraints; use a new output directory')
        self.engine = None

    def full_score(self, item):
        if self.engine is None:
            self.engine = Engine(ROOT / 'research/ckt-v4-core/target/release/score-toned-stream.exe',
                                 self.output / 'inputs', 'cpu', 2, 300)
        key = self.space.key(item['state'])
        if key in self.cache and self.cache[key]['metrics'].get('verified'):
            return self.cache[key]
        score = self.engine.score([self.space.expand(item['state'])], True)[0]
        previous = item.get('metrics', self.cache.get(key, {}).get('metrics', {}))
        if 'ckt' in previous and abs(previous['ckt'] - score['ckt']) > 1e-9:
            raise ValueError(f'full/incremental mismatch: {key}')
        item = dict(item, key=key, metrics=dict(self.space.memory(item['state']), **self.space.daily(item['state']), **score))
        self.cache[key] = item
        return item

    def audit_seeds(self):
        for name, seed in self.seeds.items():
            actual = self.full_score(seed)
            for field in ['ckt', 'daily', 'pinky']:
                if abs(actual['metrics'][field] - seed['metrics'][field]) > 1e-9:
                    raise ValueError(f'seed mismatch {name}/{field}')

    def candidates(self, state, profile, moves):
        seen = set()
        for label, s in moves:
            memory = self.space.memory(s)
            if not memory or not fits_budget(memory, profile):
                continue
            key = self.space.key(s)
            if key in seen:
                continue
            seen.add(key)
            daily = self.space.daily(s)
            if daily['daily'] + 1e-10 < profile['dailyFloor']:
                continue
            yield dict(key=key, state=s, label=label, metrics=dict(memory, **daily))

    def score_batch(self, name, candidates, anchor):
        # Keep a complete canonical cache across rounds and objective profiles.
        missing = {item['key']: item for item in candidates if item['key'] not in self.cache}
        path = self.output / name
        fresh = len(missing)
        # Import completed prefixes left by an interrupted scorer, only after
        # checking the exact fixture and each expanded state and ID.
        for old_job_path in sorted(self.output.glob(name + '*-job.json')):
            old_score_path = Path(str(old_job_path).replace('-job.json', '-scores.json'))
            if not old_score_path.exists():
                continue
            old_job = json.loads(old_job_path.read_text(encoding='utf8'))
            if old_job['fixture'] != self.space.f:
                raise ValueError('recovery fixture mismatch')
            old_scores = json.loads(old_score_path.read_text(encoding='utf8'))
            old_items = {c['id']: c for c in old_job['candidates']}
            for result in old_scores['results']:
                key = result['id']
                if key == anchor['key']:
                    if abs(result['score'] - anchor['metrics']['ckt']) > 1e-9:
                        raise ValueError('recovery anchor mismatch')
                    continue
                if key in missing:
                    item = missing[key]
                    if old_items[key]['state'] != self.space.expand(item['state']) or not math.isfinite(result['score']):
                        raise ValueError('recovery state mismatch')
                    self.cache[key] = dict(item, metrics=dict(item['metrics'], ckt=result['score'], verified=False))
                    del missing[key]
        atomic_json(self.cache_path, self.cache)
        if missing:
            pending = list(missing.values()); workers = min(2, len(pending))
            processes, logs, shards = [], [], []
            try:
                for worker in range(workers):
                    states = [anchor] + pending[worker*len(pending)//workers:(worker+1)*len(pending)//workers]
                    # A new suffix preserves earlier partial recovery evidence.
                    shard = Path(str(path) + f'-part{worker}-{len(pending)}')
                    job = dict(fixture=self.space.f, maxD=2, maxM=22, requireEmpty=[], candidates=[
                        dict(id=item['key'], state=self.space.expand(item['state']), memory=item['metrics']['m']) for item in states])
                    atomic_json(Path(str(shard) + '-job.json'), job)
                    log = Path(str(shard) + '.log').open('w', encoding='utf8'); logs.append(log)
                    processes.append(subprocess.Popen([str(ROOT / 'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe'),
                        str(self.output / 'inputs/corpus.bin'), str(self.output / 'inputs/snapshot.json'),
                        str(shard) + '-job.json', str(shard) + '-scores.json'], stdout=log, stderr=log,
                        creationflags=(subprocess.CREATE_NO_WINDOW | subprocess.BELOW_NORMAL_PRIORITY_CLASS) if os.name == 'nt' else 0))
                    shards.append((shard, states))
                while any(p.poll() is None for p in processes):
                    if any(p.poll() not in (None, 0) for p in processes):
                        raise RuntimeError(f'{name}: incremental scorer failed; inspect shard logs')
                    done = 0
                    for shard, _ in shards:
                        try:
                            scores = json.loads(Path(str(shard) + '-scores.json').read_text(encoding='utf8'))
                            done += max(0, scores['completed'] - 1)
                        except (FileNotFoundError, json.JSONDecodeError, PermissionError):
                            pass
                    print(json.dumps(dict(stage=name, completed=done+fresh-len(pending), total=fresh)), flush=True)
                    try:
                        next(p for p in processes if p.poll() is None).wait(timeout=30)
                    except subprocess.TimeoutExpired:
                        pass
                if any(p.returncode for p in processes):
                    raise RuntimeError('incremental scorer failed')
            finally:
                for p in processes:
                    if p.poll() is None:
                        p.terminate(); p.wait()
                for log in logs:
                    log.close()
            for shard, states in shards:
                scores = json.loads(Path(str(shard) + '-scores.json').read_text(encoding='utf8'))
                if scores['completed'] != len(states):
                    raise ValueError('incomplete neighborhood scores')
                for item, result in zip(states, scores['results'], strict=True):
                    if item['key'] != result['id']:
                        raise ValueError('candidate/result mismatch')
                    if item['key'] == anchor['key']:
                        if abs(result['score'] - anchor['metrics']['ckt']) > 1e-9:
                            raise ValueError('incremental anchor mismatch')
                        continue
                    self.cache[item['key']] = dict(item, metrics=dict(item['metrics'], ckt=result['score'], verified=False))
            atomic_json(self.cache_path, self.cache)
        return [self.cache[item['key']] for item in candidates], fresh

    def select(self, candidates, name, center):
        profile = self.profiles[name]
        for item in sorted(candidates, key=lambda item: item['metrics']['ckt']):
            if item['metrics']['ckt'] >= center['metrics']['ckt'] - 1e-10:
                break
            if not fits_budget(item['metrics'], profile) or item['metrics']['daily'] + 1e-10 < profile['dailyFloor']:
                continue
            checked = self.full_score(item)
            if checked['metrics']['pinky'] <= profile['pinkyCeiling'] + 1e-12:
                return checked
        return center

    def cross_profile(self, record):
        record['crossProfileReuse'] = {}
        for name, center in list(self.progress['centers'].items()):
            best = self.select(list(self.cache.values()), name, center)
            self.progress['centers'][name] = best
            record['crossProfileReuse'][name] = dict(before=center['metrics']['ckt'], after=best['metrics']['ckt'], winner=best['key'])

    def run(self, phase, limit, seed):
        self.audit_seeds(); started = time.monotonic(); record = dict(phase=phase, seed=seed, profiles={})
        for index, name in enumerate(self.seeds):
            center = self.progress['centers'][name]; center = self.full_score(center)
            before = center['metrics']['ckt']; rng = random.Random(seed + index)
            moves = local_moves(center['state'], self.space) if phase in ['local', 'polish'] else coupled_moves(center['state'], self.space)
            if phase == 'coupled':
                known = [self.cache[item['key']] for item in self.candidates(center['state'], self.profiles[name],
                         local_moves(center['state'], self.space)) if item['key'] in self.cache and item['key'] != center['key']]
                near = sorted(known, key=lambda item: item['metrics']['ckt'])[:20]
                moves = itertools.chain(paired_moves(center['state'], near), moves)
            candidates = list(self.candidates(center['state'], self.profiles[name], moves))
            available = len(candidates)
            if phase == 'coupled' and limit and len(candidates) > limit:
                pairs = [item for item in candidates if item['label'].startswith('ranked-pair:')]
                rest = [item for item in candidates if not item['label'].startswith('ranked-pair:')]
                pair_count = min(len(pairs), limit//2)
                candidates = rng.sample(pairs, pair_count) + rng.sample(rest, min(len(rest), limit-pair_count))
            scored, fresh = self.score_batch(f'{len(self.progress["rounds"])+1}-{phase}-{name}', candidates, center)
            winner = self.select(scored, name, center)
            self.progress['centers'][name] = winner
            record['profiles'][name] = dict(available=available, considered=len(candidates), fresh=fresh,
                before=before, after=winner['metrics']['ckt'], winner=winner['key'], metrics=winner['metrics'],
                operators=dict(Counter(item['label'].split(':')[0] for item in candidates)))
            print(json.dumps(dict(profile=name, **record['profiles'][name])), flush=True)
        record['elapsedSeconds'] = time.monotonic() - started
        self.cross_profile(record)
        self.progress['rounds'].append(record)
        atomic_json(self.cache_path, self.cache); atomic_json(self.state_path, self.progress)

    def anneal(self, steps, seed):
        self.audit_seeds(); started = time.monotonic()
        record = dict(phase='anneal', seed=seed, repetitions=2, stepsPerRepetition=steps, profiles={})
        for index, name in enumerate(self.seeds):
            start = self.full_score(self.progress['centers'][name]); best = start; before = best['metrics']['ckt']
            chains = []
            for repetition in range(2):
                rng = random.Random(seed + repetition*100 + index); current = start
                accepted = 0; fresh = 0
                for step in range(steps):
                    state, _ = self.space.propose(current['state'], rng, self.profiles[name])
                    key = self.space.key(state); fresh += key not in self.cache
                    candidate = self.full_score(dict(key=key, state=state, label=f'anneal:{name}/{repetition}/{step}'))
                    temperature = .0007 * (.00002/.0007)**(step/max(1, steps-1))
                    delta = candidate['metrics']['ckt'] - current['metrics']['ckt']
                    if candidate['metrics']['pinky'] <= self.profiles[name]['pinkyCeiling'] + 1e-12 and (
                            delta <= 0 or rng.random() < math.exp(-delta/temperature)):
                        accepted += 1; current = candidate
                        if current['metrics']['ckt'] < best['metrics']['ckt'] - 1e-10:
                            best = current
                    if (step+1) % 12 == 0:
                        print(json.dumps(dict(phase='anneal', profile=name, repetition=repetition,
                            steps=step+1, best=best['metrics']['ckt'], accepted=accepted)), flush=True)
                chains.append(dict(seed=seed+repetition*100+index, accepted=accepted, fresh=fresh))
                atomic_json(self.cache_path, self.cache)
            self.progress['centers'][name] = best
            record['profiles'][name] = dict(before=before, after=best['metrics']['ckt'],
                winner=best['key'], metrics=best['metrics'], chains=chains)
        record['elapsedSeconds'] = time.monotonic() - started
        self.cross_profile(record)
        self.progress['rounds'].append(record)
        atomic_json(self.cache_path, self.cache); atomic_json(self.state_path, self.progress)

    def export(self, prefix):
        self.audit_seeds(); record = {}; self.cross_profile(record)
        atomic_json(self.cache_path, self.cache); atomic_json(self.state_path, self.progress)
        fixture = self.space.f
        decomposition = json.loads((ROOT / 'research/config/ckt-v51-toned-2121-seeds.json').read_text(encoding='utf8'))['decomposition']
        finals = {item['pinyin']: item['fullFinal'] for item in decomposition}
        first = {py: i for i, atom in enumerate(fixture['atoms']) for py in atom['pinyin']}
        final = {py: i for i, atom in enumerate(fixture['rhymeAtoms']) for py in atom['pinyin']}
        regions = {tone: i for i, spec in enumerate(fixture['toneRegions']) for tone in spec['tones']}
        tokens = [(py, tone) for py, codes in enumerate(fixture['tonedCodes'])
                  for tone, code in enumerate(codes, 1) if code]
        layouts = []
        representatives = [(name, item) for name, item in self.progress['centers'].items()]
        seen = {item['key'] for _, item in representatives}
        for record in self.progress['rounds']:
            for name, entry in record['profiles'].items():
                key = entry['winner']
                if key in seen or key == self.seeds[name]['key']:
                    continue
                seen.add(key)
                representatives.append((name, self.full_score(self.cache[key])))
        for name, item in representatives:
            state = item['state']; metrics = item['metrics']; expanded = self.space.expand(state)
            if self.space.key(state) != item['key']:
                raise ValueError('export key does not match the actual state')
            groups = []
            for group in range(10):
                members = [py for fi, atom in enumerate(fixture['rhymeAtoms'])
                           if state['partition'][self.space.spec['finalRoots'][fi]] == group for py in atom['pinyin']]
                groups.append(dict(roots=[root for i, root in enumerate(self.space.spec['roots']) if state['partition'][i] == group],
                    finals=sorted({finals[fixture['pinyin'][py]] for py in members}),
                    keys={region['name']: state['groupKeys'][i][group] for i, region in enumerate(fixture['toneRegions'])}))
            layouts.append(dict(id='CRF-'+name.upper()+'-'+item['key'][:10], profile=name, key=item['key'],
                description=f'Finite frontier follow-up: {name}', rustScore=metrics['ckt'],
                firstKeys={atom['name']: state['firstKeys'][i] for i, atom in enumerate(fixture['atoms'])},
                tonedCodes=[expanded['firstKeys'][first[py]]+expanded['rhymeKeys'][regions[tone]][final[py]] for py, tone in tokens],
                memoryAudit=dict(ordinaryD=metrics['d'], ordinaryF=0, memoryLower=metrics['m'], memoryGuard=metrics['guard']),
                rhymeGroups=groups, state=state, metrics=metrics,
                before=self.seeds[name]['metrics'], deltaVsSeed=metrics['ckt']-self.seeds[name]['metrics']['ckt']))
        sources = [Path(__file__), ROOT / 'tools/run_cr_anneal.py', ROOT / 'research/config/cr-anneal-inputs.zip', ARCHIVE,
            ROOT / 'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe',
            ROOT / 'research/ckt-v4-core/target/release/score-toned-stream.exe']
        sources += sorted((ROOT / 'research/ckt-v4-core/src').rglob('*.rs'))
        source_hashes = {str(file.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(file.read_bytes()).hexdigest() for file in sources}
        cache_path = Path(str(prefix)+'-scores.json.gz')
        canonical_cache = json.dumps(dict(version=1, layouts=[self.cache[key] for key in sorted(self.cache)]),
                                    ensure_ascii=False, separators=(',', ':')).encode('utf8')
        cache_path.write_bytes(gzip.compress(canonical_cache, mtime=0))
        result = dict(version='cr-frontier-followup-v1', contract=self.progress['contract'],
            profiles=self.profiles, rounds=self.progress['rounds'], uniqueScoredLayouts=len(self.cache),
            fullyRecomputedLayouts=sum(item['metrics'].get('verified',False) for item in self.cache.values()),
            frozenInputManifest=self.manifest, sourceHashes=source_hashes,
            scoreArchive=dict(file=cache_path.name,sha256=hashlib.sha256(cache_path.read_bytes()).hexdigest()),
            firstAtomNames=[atom['name'] for atom in fixture['atoms']],
            tokenKeys=[fixture['pinyin'][py]+str(tone) for py, tone in tokens], layouts=layouts,
            limitations='finite neighborhoods, sampled coupled moves, two short independent RNG restarts per profile; not a global optimality certificate')
        atomic_json(Path(str(prefix)+'-finalists.json'), result)
        atomic_json(Path(str(prefix)+'-auxiliary-inputs.json'), dict(tokenKeys=result['tokenKeys'],
            layouts=[{key:row[key] for key in ['id','profile','key','rustScore','tonedCodes','memoryAudit','rhymeGroups']}
                     for row in layouts]))
        print(json.dumps(dict(output=str(prefix)+'-finalists.json',unique=len(self.cache),
            winners=[{k:row[k] for k in ['id','rustScore','deltaVsSeed']} for row in layouts])), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--phase', choices=['local', 'coupled', 'anneal', 'polish', 'export'], default='local')
    parser.add_argument('--limit', type=int, default=1200)
    parser.add_argument('--steps', type=int, default=24)
    parser.add_argument('--seed', type=int, default=20261116)
    parser.add_argument('--prefix', type=Path, default=ROOT / 'research/notes/2026-11-16-cr-frontier-followup')
    args = parser.parse_args()
    if args.steps < 1 or args.limit < 0:
        parser.error('steps must be positive and limit must be nonnegative')
    search = Followup(args.output)
    lock = lock_run(args.output)
    try:
        if args.phase == 'export':
            search.export(args.prefix)
        elif args.phase == 'anneal':
            search.anneal(args.steps, args.seed)
        else:
            search.run(args.phase, args.limit, args.seed)
    finally:
        if search.engine:
            search.engine.close()
        lock.close()


if __name__ == '__main__':
    main()
