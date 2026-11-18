"""Joint intact-root repartition and per-region group-key exchanges toward daily 130."""
import argparse
import copy
import gzip
import itertools
import json
from pathlib import Path

from explore_cr_frontier_followup import Followup
from prepare_cr_m24_portfolio import make_layout
from regroup_cr_lan_f19_roots import SOURCE, BUNDLE, POLICY, single_root_moves
from run_cr_anneal import ROOT, atomic_json, digest, lock_run, unpack
from search_cr_667_zero_carriers import CarrierSpace, read, sha

PREFIX = ROOT/'research/notes/2026-11-18-cr-lan-f19-combined'
OUTPUT = ROOT/'research/.cache/cr-lan-f19-combined-20261118'
PREVIOUS = ROOT/'research/notes/2026-11-18-cr-lan-f19-root-regroup-finalists.json'
SLACKS = [0, .01, .02, .03, .05, .08, .12, .15]
TARGETS = [128, 130, 131, 132]


def group_exchanges(state):
    for a, b in itertools.combinations(range(10), 2):
        for mask in range(1, 8):
            s = copy.deepcopy(state)
            for region in range(3):
                if mask & (1 << region):
                    row = s['groupKeys'][region]
                    row[a], row[b] = row[b], row[a]
            if s != state:
                yield f'groups:{a}/{b}:regions:{mask}', s


def root_exchanges(state):
    for a, b in itertools.combinations(range(18), 2):
        if state['partition'][a] == state['partition'][b]:
            continue
        s = copy.deepcopy(state)
        s['partition'][a], s['partition'][b] = s['partition'][b], s['partition'][a]
        yield f'roots:{a}/{b}', s


def same_key_multisets(state, baseline):
    return (state['firstKeys'] == baseline['firstKeys'] and len(state['groupKeys']) == 3 and
        all(sorted(x) == sorted(y) for x, y in zip(state['groupKeys'], baseline['groupKeys'], strict=True)))


class CombinedSearch(Followup):
    def __init__(self, workers=12):
        self.output = OUTPUT
        self.output.mkdir(parents=True, exist_ok=True)
        manifest = unpack(BUNDLE, self.output/'inputs')
        self.space = CarrierSpace(self.output/'inputs')
        self.source = read(SOURCE)
        self.base = self.source['layouts'][0]
        self.constraints = self.base['constraints']
        self.cache_path, self.state_path = self.output/'cache.json', self.output/'state.json'
        previous = read(PREVIOUS)
        archive = PREVIOUS.parent/previous['scoreArchive']['file']
        if sha(archive) != previous['scoreArchive']['sha256']:
            raise ValueError('previous score archive changed')
        self.imported = json.loads(gzip.decompress(archive.read_bytes()))
        if self.space.spec['wordAuxiliaryPolicy'] != POLICY or self.base['wordAuxiliaryPolicy'] != POLICY:
            raise ValueError('wrong auxiliary policy')
        self.cache = read(self.cache_path) if self.cache_path.exists() else copy.deepcopy(self.imported)
        code = [Path(__file__), ROOT/'tools/explore_cr_frontier_followup.py',
            ROOT/'tools/regroup_cr_lan_f19_roots.py', ROOT/'tools/search_cr_667_zero_carriers.py',
            ROOT/'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe',
            ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe']
        contract = dict(version='cr-lan-f19-combined-v1', baselineKey=self.base['key'],
            manifest=digest(manifest), sourceSha256=sha(SOURCE), previousSha256=sha(PREVIOUS),
            importedArchiveSha256=sha(archive), importedStates=len(self.imported),
            fixedFirstKeys=self.base['state']['firstKeys'],
            groupKeyMultisets=[sorted(row) for row in self.base['state']['groupKeys']],
            constraints=self.constraints, wordAuxiliaryPolicy=POLICY, slacks=SLACKS, targets=TARGETS,
            rootInternalSplits=0, freshPerRound=900,
            sourceHashes={p.relative_to(ROOT).as_posix(): sha(p) for p in code})
        self.progress = read(self.state_path) if self.state_path.exists() else dict(contract=contract, rounds=[])
        if self.progress['contract'] != contract:
            raise ValueError('changed combined experiment contract')
        self.workers, self.score_max_d, self.score_max_m = workers, 2, 24
        self.track_pinkies, self.engine = True, None

    def loads_ok(self, row):
        m, p = row['metrics'], self.constraints
        return m['pinky'] <= p['pinkyCeiling']+1e-12 and m['rightPinky'] <= p['rightPinkyCeiling']+1e-12

    def candidates(self, moves):
        seen = set()
        for label, state in moves:
            if not same_key_multisets(state, self.base['state']):
                raise ValueError('fixed initials or per-region key multisets changed')
            m = self.space.memory(state)
            if not m or m['m'] > 24 or m['guard'] > 26:
                continue
            key = self.space.key(state)
            if key in seen:
                continue
            seen.add(key)
            m.update(self.space.daily(state))
            if m['daily'] < self.base['metrics']['daily']-1e-9:
                continue
            yield dict(key=key, state=state, label=label, metrics=m)

    def representatives(self):
        rows = [r for r in self.cache.values() if self.loads_ok(r)]
        result = []
        for slack in SLACKS:
            pool = [r for r in rows if r['metrics']['ckt'] <= self.base['rustScore']+slack+1e-9]
            if pool:
                result.append((f'best_daily_slack_{slack:g}', max(pool,
                    key=lambda r: (r['metrics']['daily'], -r['metrics']['ckt']))))
        for target in TARGETS:
            pool = [r for r in rows if r['metrics']['daily'] >= target-1e-9]
            if pool:
                result.append((f'lowest_ckt_daily_{target}', min(pool,
                    key=lambda r: (r['metrics']['ckt'], -r['metrics']['daily']))))
        result.append(('baseline', self.cache[self.base['key']]))
        return result

    def status(self):
        return [dict(role=role, key=r['key'][:10], ckt=r['metrics']['ckt'], daily=r['metrics']['daily'])
            for role, r in self.representatives()]

    def stage(self, phase):
        if any(r['phase'] == phase for r in self.progress['rounds']):
            print(json.dumps(dict(stage=phase, alreadyComplete=True)), flush=True)
            return
        anchor = self.full_score(self.cache[self.base['key']])
        branches = list({r['key']: r for _, r in self.representatives()}.values())
        def moves():
            for row in branches:
                generators = [group_exchanges(row['state'])]
                if phase != 'swaps':
                    generators.extend([single_root_moves(row['state']), root_exchanges(row['state'])])
                for label, state in itertools.chain.from_iterable(generators):
                    yield row['key'][:10]+'/'+label, state
        candidates = list(self.candidates(moves()))
        # Preserve neighboring proposals' locality for the incremental resolver.
        # If a later round exceeds the budget, keep each center's high-daily moves
        # and a deterministic sample; record all available/proposed IDs explicitly.
        missing = [r for r in candidates if r['key'] not in self.cache]
        available = [r['key'] for r in candidates]
        if len(missing) > 900 and phase != 'swaps':
            selected = {}
            per_center = max(1, 600//len(branches))
            for branch in branches:
                pool = sorted((r for r in missing if r['label'].startswith(branch['key'][:10]+'/')),
                    key=lambda r: (-r['metrics']['daily'], r['key']))
                selected.update((r['key'], r) for r in pool[:per_center])
            for r in sorted(missing, key=lambda r: digest(['sample', phase, r['key']])):
                if len(selected) >= 900:
                    break
                selected.setdefault(r['key'], r)
            candidates = [r for r in candidates if r['key'] in self.cache or r['key'] in selected]
        print(json.dumps(dict(stage=phase, available=len(available), considered=len(candidates),
            missing=sum(r['key'] not in self.cache for r in candidates))), flush=True)
        scored, fresh = self.score_batch(phase, candidates, anchor)
        self.progress['rounds'].append(dict(phase=phase, branches=[r['key'] for r in branches],
            availableKeys=available, candidateKeys=[r['key'] for r in candidates], fresh=fresh,
            loadQualified=sum(self.loads_ok(r) for r in scored)))
        atomic_json(self.cache_path, self.cache)
        atomic_json(self.state_path, self.progress)
        print(json.dumps(dict(stage=phase, representatives=self.status())), flush=True)

    def export(self):
        layouts = []
        for role, row in self.representatives():
            old = next((r for r in layouts if r['key'] == row['key']), None)
            if old:
                old['roles'].append(role)
                continue
            checked = self.full_score(row)
            for field in ['pinky', 'rightPinky']:
                if abs(row['metrics'][field]-checked['metrics'][field]) > 1e-9:
                    raise ValueError('incremental/full load mismatch')
            layout = make_layout(self.space, row['state'], checked['metrics'], self.source['tokenKeys'],
                'LANJ-'+row['key'][:10])
            layout.update(wordAuxiliaryPolicy=POLICY, roles=[role], anchorKey=self.base['key'])
            layouts.append(layout)
        archive = Path(str(PREFIX)+'-scores.json.gz')
        archive.write_bytes(gzip.compress(json.dumps(self.cache, ensure_ascii=False,
            separators=(',', ':')).encode(), mtime=0))
        atomic_json(Path(str(PREFIX)+'-finalists.json'), dict(version=self.progress['contract']['version'],
            tokenKeys=self.source['tokenKeys'], firstAtomNames=self.source['firstAtomNames'],
            layouts=layouts, constraints=self.constraints, contract=self.progress['contract'],
            stages=self.progress['rounds'], importedKeys=sorted(self.imported),
            evaluatedStates=len(self.cache), newStates=len(self.cache.keys()-self.imported.keys()),
            rootInternalSplits=0, scoreArchive=dict(file=archive.name, sha256=sha(archive))))
        atomic_json(self.cache_path, self.cache)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--phase', choices=['swaps', 'joint1', 'joint2', 'joint3', 'joint4', 'export', 'all'], default='all')
    p.add_argument('--workers', type=int, default=12)
    a = p.parse_args()
    if not 1 <= a.workers <= 16:
        p.error('workers must be 1 to 16')
    s = CombinedSearch(a.workers)
    lock = lock_run(s.output)
    try:
        phases = ['swaps', 'joint1', 'joint2', 'joint3', 'joint4'] if a.phase == 'all' else [a.phase]
        for phase in phases:
            if phase != 'export':
                s.stage(phase)
        s.export()
    finally:
        if s.engine:
            s.engine.close()
        lock.close()


if __name__ == '__main__':
    main()
