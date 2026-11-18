"""Repartition intact Mars 18 roots over f19's ten fixed three-row key groups."""
import argparse
import copy
import gzip
import itertools
import json
from pathlib import Path

from explore_cr_frontier_followup import Followup
from prepare_cr_m24_portfolio import make_layout
from regroup_cr_667_roots import joint_root_moves
from run_cr_anneal import ROOT, atomic_json, digest, lock_run, unpack
from search_cr_667_zero_carriers import CarrierSpace, read, sha

PREFIX = ROOT/'research/notes/2026-11-18-cr-lan-f19-root-regroup'
OUTPUT = ROOT/'research/.cache/cr-lan-f19-root-regroup-20261118'
SOURCE = ROOT/'research/notes/2026-11-17-cr-lan-f19-stability-finalists.json'
BUNDLE = ROOT/'research/config/cr-lan-213-inputs.zip'
POLICY = dict(word2='21', word3='213', word4='14')
SLACKS = [0, .002, .005, .01, .02, .03, .05]


def single_root_moves(state):
    for root, old in enumerate(state['partition']):
        for group in range(10):
            if group != old:
                s = copy.deepcopy(state)
                s['partition'][root] = group
                yield f'root:{root}>{group}', s


class RootRegroup(Followup):
    def __init__(self, workers=4):
        self.output = OUTPUT
        self.output.mkdir(parents=True, exist_ok=True)
        manifest = unpack(BUNDLE, self.output/'inputs')
        self.space = CarrierSpace(self.output/'inputs')
        self.source = read(SOURCE)
        self.base = self.source['layouts'][0]
        if not self.base['key'].startswith('f19a0ad1dc') or self.base['wordAuxiliaryPolicy'] != POLICY:
            raise ValueError('wrong requested baseline or auxiliary policy')
        if self.space.spec['wordAuxiliaryPolicy'] != POLICY:
            raise ValueError('wrong frozen scoring corpus policy')
        self.constraints = self.base['constraints']
        self.cache_path = self.output/'cache.json'
        self.state_path = self.output/'state.json'
        self.cache = read(self.cache_path) if self.cache_path.exists() else {}
        contract = dict(version='cr-lan-f19-root-regroup-v1', baselineKey=self.base['key'],
            sourceSha256=sha(SOURCE), bundleManifest=digest(manifest), wordAuxiliaryPolicy=POLICY,
            fixedFirstKeys=self.base['state']['firstKeys'], fixedGroupKeys=self.base['state']['groupKeys'],
            maxM=self.constraints['maxM'], maxGuard=self.constraints['maxGuard'],
            dailyFloor=self.base['metrics']['daily'], slacks=SLACKS, rootInternalSplits=0,
            runnerSha256=sha(Path(__file__)),
            incrementalSha256=sha(ROOT/'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe'),
            fullScorerSha256=sha(ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe'))
        self.progress = read(self.state_path) if self.state_path.exists() else dict(contract=contract, rounds=[])
        if self.progress['contract'] != contract:
            raise ValueError('changed experiment contract; preserve this output and choose a new directory')
        self.workers = workers
        self.score_max_d = 2
        self.score_max_m = self.constraints['maxM']
        self.track_pinkies = True
        self.engine = None

    def candidates(self, moves):
        seen = set()
        for label, state in moves:
            if (state['firstKeys'] != self.base['state']['firstKeys'] or
                    state['groupKeys'] != self.base['state']['groupKeys']):
                raise ValueError('onsets or group keys changed during root repartition')
            m = self.space.memory(state)
            if not m or m['m'] > self.constraints['maxM'] or m['guard'] > self.constraints['maxGuard']:
                continue
            key = self.space.key(state)
            if key in seen:
                continue
            seen.add(key)
            m.update(self.space.daily(state))
            if m['daily'] < self.base['metrics']['daily']-1e-9:
                continue
            yield dict(key=key, state=state, metrics=m, label=label)

    def loads_ok(self, row):
        m = row['metrics']
        return (m['pinky'] <= self.constraints['pinkyCeiling']+1e-12 and
                m['rightPinky'] <= self.constraints['rightPinkyCeiling']+1e-12)

    def representatives(self):
        rows = [r for r in self.cache.values() if self.loads_ok(r)]
        result = []
        for slack in SLACKS:
            pool = [r for r in rows if r['metrics']['ckt'] <= self.base['rustScore']+slack+1e-9]
            if pool:
                result.append((f'best_daily_slack_{slack:g}',
                    max(pool, key=lambda r: (r['metrics']['daily'], -r['metrics']['ckt']))))
        result.append(('baseline', self.cache[self.base['key']]))
        return result

    def run_stage(self, phase):
        if any(r['phase'] == phase for r in self.progress['rounds']):
            print(json.dumps(dict(stage=phase, alreadyComplete=True)), flush=True)
            return
        anchor = self.full_score(dict(key=self.base['key'], state=self.base['state'], metrics=self.base['metrics']))
        if phase == 'local':
            branches = [anchor]
            moves = single_root_moves(anchor['state'])
        elif phase == 'joint':
            branches = [anchor]
            moves = joint_root_moves(anchor['state'])
        else:
            branches = list({r['key']: r for _, r in self.representatives()}.values())
            moves = ((r['key'][:10]+'/'+label, state) for r in branches
                for label, state in single_root_moves(r['state']))
        candidates = list(self.candidates(moves))
        print(json.dumps(dict(stage=phase, candidates=len(candidates),
            fresh=len({r['key'] for r in candidates}-self.cache.keys()))), flush=True)
        scored, fresh = self.score_batch(phase, candidates, anchor)
        record = dict(phase=phase, branches=[r['key'] for r in branches],
            candidateKeys=[r['key'] for r in candidates], considered=len(candidates), fresh=fresh,
            loadQualified=sum(self.loads_ok(r) for r in scored))
        self.progress['rounds'].append(record)
        atomic_json(self.cache_path, self.cache)
        atomic_json(self.state_path, self.progress)
        print(json.dumps(dict(stage=phase, representatives=[dict(role=role, key=r['key'][:10],
            ckt=r['metrics']['ckt'], daily=r['metrics']['daily']) for role, r in self.representatives()])), flush=True)

    def export(self):
        layouts = []
        for role, row in self.representatives():
            existing = next((r for r in layouts if r['key'] == row['key']), None)
            if existing:
                existing['roles'].append(role)
                continue
            checked = self.full_score(row)
            for field in ['pinky', 'rightPinky']:
                if abs(checked['metrics'][field]-row['metrics'][field]) > 1e-9:
                    raise ValueError('incremental/full load mismatch: '+field)
            layout = make_layout(self.space, row['state'], checked['metrics'], self.source['tokenKeys'],
                'LANRG-'+row['key'][:10])
            layout.update(wordAuxiliaryPolicy=POLICY, roles=[role], anchorKey=self.base['key'])
            layouts.append(layout)
        archive = Path(str(PREFIX)+'-scores.json.gz')
        archive.write_bytes(gzip.compress(json.dumps(self.cache, ensure_ascii=False,
            separators=(',', ':')).encode(), mtime=0))
        atomic_json(Path(str(PREFIX)+'-finalists.json'), dict(version=self.progress['contract']['version'],
            tokenKeys=self.source['tokenKeys'], firstAtomNames=self.source['firstAtomNames'],
            layouts=layouts, contract=self.progress['contract'], constraints=self.constraints,
            stages=self.progress['rounds'], evaluatedStates=len(self.cache), rootInternalSplits=0,
            scoreArchive=dict(file=archive.name, sha256=sha(archive)),
            sourceHashes={p.relative_to(ROOT).as_posix(): sha(p) for p in [Path(__file__), SOURCE, BUNDLE,
                ROOT/'tools/regroup_cr_667_roots.py', ROOT/'tools/explore_cr_frontier_followup.py',
                ROOT/'tools/search_cr_667_zero_carriers.py']}))
        atomic_json(self.cache_path, self.cache)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--phase', choices=['local', 'joint', 'beam1', 'beam2', 'beam3', 'export', 'all'], default='all')
    p.add_argument('--workers', type=int, default=4)
    args = p.parse_args()
    if not 1 <= args.workers <= 16:
        p.error('workers must be 1 to 16')
    search = RootRegroup(args.workers)
    lock = lock_run(search.output)
    try:
        phases = ['local', 'joint', 'beam1', 'beam2', 'beam3'] if args.phase == 'all' else [args.phase]
        for phase in phases:
            if phase != 'export':
                search.run_stage(phase)
        search.export()
    finally:
        if search.engine:
            search.engine.close()
        lock.close()


if __name__ == '__main__':
    main()
