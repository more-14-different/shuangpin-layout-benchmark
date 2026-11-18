"""Unified AEO, movable onset units and joint rhymes, preferring no increase in D."""
import argparse
import copy
import gzip
import itertools
import json
from pathlib import Path
import types

from explore_cr_frontier_followup import Followup
from prepare_cr_m24_portfolio import make_layout
from refine_cr_lan_f19_full import full_batch
from run_cr_anneal import ROOT, Engine, atomic_json, digest, lock_run, unpack
from search_cr_667_zero_carriers import CarrierSpace, read, sha
from search_cr_lan_f19_combined import BUNDLE, POLICY, group_exchanges, root_exchanges, single_root_moves

SOURCE = ROOT/'research/notes/2026-11-18-cr-lan-f19-combined-finalists.json'
PREFIX = ROOT/'research/notes/2026-11-18-cr-lan-aeo-heads'
OUTPUT = ROOT/'research/.cache/cr-lan-aeo-heads-20261118'
SLACKS = [-.04, -.02, 0, .02, .05, .08]
TARGETS = [128, 130, 132, 135]


def onset_units(fixture):
    aeo = tuple(i for i, atom in enumerate(fixture['atoms']) if atom['name'] in ['zero-A', 'zero-E', 'zero-O'])
    return [aeo]+[(i,) for i in range(len(fixture['atoms'])) if i not in aeo]


def assign_unit(state, unit, key):
    for i in unit:
        state['firstKeys'][i] = key


def head_moves(state, space):
    units = onset_units(space.f)
    for unit in units:
        old = state['firstKeys'][unit[0]]
        for key in space.allowed_first:
            if key != old:
                s = copy.deepcopy(state)
                assign_unit(s, unit, key)
                yield 'head-move:'+','.join(map(str, unit))+'>'+key, s
    for a, b in itertools.combinations(units, 2):
        ka, kb = state['firstKeys'][a[0]], state['firstKeys'][b[0]]
        if ka != kb:
            s = copy.deepcopy(state)
            assign_unit(s, a, kb)
            assign_unit(s, b, ka)
            yield f'head-swap:{a}/{b}', s


def compensated_head_moves(state, space):
    # Refund an ordinary or W/Y association before assigning another unit.
    # Validate the joint endpoint, allowing different ordinary initials to move
    # without requiring an intermediate D increase to survive selection.
    units = onset_units(space.f)
    for i, atom in enumerate(space.f['atoms']):
        ordinary = len(atom['initial']) == 1 and atom['initial'] != '_'
        wy = atom['name'] in ['zero-W', 'zero-Y']
        target = atom['baselineKey'] if ordinary else atom['name'][-1]
        if not (ordinary or wy) or state['firstKeys'][i] == target:
            continue
        for unit in units:
            if i in unit:
                continue
            for key in space.allowed_first:
                if key == state['firstKeys'][unit[0]]:
                    continue
                s = copy.deepcopy(state)
                s['firstKeys'][i] = target
                assign_unit(s, unit, key)
                yield f'restore:{i}/head:{unit}>{key}', s


class AeoHeads(Followup):
    def __init__(self, workers=12):
        self.output = OUTPUT
        self.output.mkdir(parents=True, exist_ok=True)
        manifest = unpack(BUNDLE, self.output/'inputs')
        self.space = CarrierSpace(self.output/'inputs')
        self.source = read(SOURCE)
        self.base = next(r for r in self.source['layouts'] if r['key'].startswith('7af91c1a1c'))
        self.aeo = onset_units(self.space.f)[0]
        self.constraints = dict(self.source['constraints'], maxD=4, preferredD=self.base['metrics']['d'],
            dailyFloor=128, maxM=24, maxGuard=26)
        self.cache_path, self.state_path = self.output/'cache.json', self.output/'state.json'
        self.cache = read(self.cache_path) if self.cache_path.exists() else {}
        paths = [Path(__file__), SOURCE, ROOT/'tools/refine_cr_lan_f19_full.py',
            ROOT/'tools/search_cr_lan_f19_combined.py', ROOT/'tools/search_cr_667_zero_carriers.py',
            ROOT/'tools/run_cr_anneal.py', ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe']
        contract = dict(version='cr-lan-aeo-heads-v1', baselineKey=self.base['key'],
            manifest=digest(manifest), sourceHashes={p.relative_to(ROOT).as_posix(): sha(p) for p in paths},
            wordAuxiliaryPolicy=POLICY, shapeKeysByMeaning='AVUIO', toneKeysByTone='IVUAO',
            toneDigitsByShapeMeaning='42310', constraints=self.constraints, rootInternalSplits=0,
            groupKeyMultisets=[sorted(row) for row in self.base['state']['groupKeys']],
            aeoUnified=True, movableUnits=onset_units(self.space.f), primaryD=self.constraints['preferredD'],
            slacks=SLACKS, targets=TARGETS, jointNewBudget=1200,
            onsetScope='all onset and zero units may move/swap repeatedly; AEO remains one unit')
        self.progress = read(self.state_path) if self.state_path.exists() else dict(contract=contract, rounds=[], controlKeys=[])
        if self.progress['contract'] != contract or self.space.spec['wordAuxiliaryPolicy'] != POLICY:
            raise ValueError('changed AEO/onset experiment contract')
        self.engine, self.workers = None, workers
        self.score_batch = types.MethodType(full_batch, self)

    def valid_state(self, state):
        return (len({state['firstKeys'][i] for i in self.aeo}) == 1 and
            len(state['groupKeys']) == 3 and all(sorted(x) == sorted(y) for x, y in
                zip(state['groupKeys'], self.base['state']['groupKeys'], strict=True)))

    def candidates(self, moves, *, controls=False):
        seen = set()
        for label, state in moves:
            if not self.valid_state(state):
                raise ValueError('split AEO unit or changed tone-region key counts')
            m = self.space.memory(state)
            if not m or m['d'] > 4 or m['m'] > 24 or m['guard'] > 26:
                continue
            key = self.space.key(state)
            if key in seen:
                continue
            seen.add(key)
            m.update(self.space.daily(state))
            if not controls and m['daily'] < self.constraints['dailyFloor']-1e-9:
                continue
            yield dict(key=key, state=state, metrics=m, label=label)

    def loads_ok(self, row):
        m, p = row['metrics'], self.constraints
        return m['pinky'] <= p['pinkyCeiling']+1e-12 and m['rightPinky'] <= p['rightPinkyCeiling']+1e-12

    def representatives(self):
        qualified = [r for r in self.cache.values() if self.loads_ok(r)]
        rows = [r for r in qualified if r['metrics']['d'] <= self.constraints['preferredD'] and
            r['metrics']['daily'] >= self.constraints['dailyFloor']-1e-9]
        result = []
        for slack in SLACKS:
            pool = [r for r in rows if r['metrics']['ckt'] <= self.base['rustScore']+slack+1e-9]
            if pool:
                result.append((f'primary_best_daily_slack_{slack:g}', max(pool,
                    key=lambda r: (r['metrics']['daily'], -r['metrics']['ckt']))))
        for label, target in [(str(t), t) for t in TARGETS]+[('current', self.base['metrics']['daily'])]:
            pool = [r for r in rows if r['metrics']['daily'] >= target-1e-9]
            if pool:
                result.append(('primary_lowest_ckt_daily_'+label, min(pool,
                    key=lambda r: (r['metrics']['ckt'], -r['metrics']['daily']))))
        no_growth = [r for r in rows if r['metrics']['ckt'] <= self.base['rustScore']+1e-9]
        if no_growth:
            result.append(('primary_no_ckt_increase', max(no_growth, key=lambda r: r['metrics']['daily'])))
        controls = [self.cache[k] for k in self.progress['controlKeys'] if self.loads_ok(self.cache[k])]
        if controls:
            result.append(('aeo_only_lowest_ckt', min(controls, key=lambda r: r['metrics']['ckt'])))
            result.append(('aeo_only_highest_daily', max(controls, key=lambda r: r['metrics']['daily'])))
        diagnostic = [r for r in qualified if r['metrics']['d'] > self.constraints['preferredD'] and r['metrics']['daily'] >= 130]
        if diagnostic:
            result.append(('diagnostic_D_increase_lowest_ckt_130', min(diagnostic, key=lambda r: r['metrics']['ckt'])))
            same = [r for r in diagnostic if r['metrics']['ckt'] <= self.base['rustScore']+1e-9]
            if same:
                result.append(('diagnostic_D_increase_no_ckt_increase', max(same, key=lambda r: r['metrics']['daily'])))
        return result

    def status(self):
        return [dict(role=role, key=r['key'][:10], ckt=r['metrics']['ckt'], daily=r['metrics']['daily'],
            D=r['metrics']['d'], M=[r['metrics']['m'], r['metrics']['guard']]) for role, r in self.representatives()]

    def stage(self, phase):
        if any(r['phase'] == phase for r in self.progress['rounds']):
            print(json.dumps(dict(stage=phase, alreadyComplete=True)), flush=True)
            return
        if phase != 'controls' and not self.progress['controlKeys']:
            raise ValueError('run unified AEO controls before refinement')
        if phase == 'controls':
            def moves():
                for key in self.space.allowed_first:
                    s = copy.deepcopy(self.base['state'])
                    assign_unit(s, self.aeo, key)
                    yield 'AEO>'+key, s
            candidates = list(self.candidates(moves(), controls=True))
            self.progress['controlKeys'] = [r['key'] for r in candidates]
            branches = []
        elif phase == 'heads':
            branches = [self.cache[k] for k in self.progress['controlKeys']]
            candidates = list(self.candidates((row['key'][:10]+'/'+label, state)
                for row in branches for label, state in head_moves(row['state'], self.space)))
        elif phase == 'transfer':
            branches = list({r['key']: r for _, r in self.representatives()}.values())
            def moves():
                heads = {tuple(r['state']['firstKeys']) for r in branches}
                for first in sorted(heads):
                    for old in self.source['layouts']:
                        s = copy.deepcopy(old['state'])
                        s['firstKeys'] = list(first)
                        yield 'rhyme-transfer:'+old['key'][:10], s
            candidates = list(self.candidates(moves()))
        else:
            reps = self.representatives()
            branches = list({r['key']: r for _, r in reps}.values())[:12]
            def moves():
                for row in branches:
                    generators = [single_root_moves(row['state']), root_exchanges(row['state']),
                        group_exchanges(row['state']), head_moves(row['state'], self.space),
                        compensated_head_moves(row['state'], self.space)]
                    for label, state in itertools.chain.from_iterable(generators):
                        yield row['key'][:10]+'/'+label, state
            candidates = list(self.candidates(moves()))
        available = [r['key'] for r in candidates]
        missing = [r for r in candidates if r['key'] not in self.cache]
        if phase == 'heads':
            primary = [r for r in missing if r['metrics']['d'] <= self.constraints['preferredD']]
            diagnostic = [r for r in missing if r['metrics']['d'] > self.constraints['preferredD']]
            sampled = {r['key'] for r in sorted(diagnostic, key=lambda r: (-r['metrics']['daily'], r['key']))[:150]}
            sampled.update(r['key'] for r in sorted(diagnostic, key=lambda r: digest(['heads', r['key']]))[:150])
            keep = {r['key'] for r in primary} | sampled
            candidates = [r for r in candidates if r['key'] in self.cache or r['key'] in keep]
        elif phase not in ['controls', 'transfer'] and len(missing) > 1200:
            primary = [r for r in missing if r['metrics']['d'] <= self.constraints['preferredD']]
            diagnostic = [r for r in missing if r['metrics']['d'] > self.constraints['preferredD']]
            selected = {}
            for branch in branches:
                pool = sorted((r for r in primary if r['label'].startswith(branch['key'][:10]+'/')),
                    key=lambda r: (-r['metrics']['daily'], r['key']))
                selected.update((r['key'], r) for r in pool[:max(1, 500//len(branches))])
            for r in sorted(primary, key=lambda r: digest([phase, r['key']])):
                if len(selected) >= 1050:
                    break
                selected.setdefault(r['key'], r)
            for r in sorted(diagnostic, key=lambda r: digest([phase, 'diagnostic', r['key']])):
                if len(selected) >= 1200:
                    break
                selected.setdefault(r['key'], r)
            candidates = [r for r in candidates if r['key'] in self.cache or r['key'] in selected]
        print(json.dumps(dict(stage=phase, available=len(available), considered=len(candidates),
            missing=sum(r['key'] not in self.cache for r in candidates))), flush=True)
        _, fresh = self.score_batch(phase, candidates, self.base)
        self.progress['rounds'].append(dict(phase=phase, branches=[r['key'] for r in branches],
            availableKeys=available, candidateKeys=[r['key'] for r in candidates], fresh=fresh))
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
            layout = make_layout(self.space, row['state'], row['metrics'], self.source['tokenKeys'],
                'LANAEO-'+row['key'][:10])
            layout.update(wordAuxiliaryPolicy=POLICY, roles=[role], reference=False, anchorKey=self.base['key'])
            layouts.append(layout)
        reference = make_layout(self.space, self.base['state'], self.base['metrics'], self.source['tokenKeys'],
            'LANAEO-reference-'+self.base['key'][:10])
        reference.update(wordAuxiliaryPolicy=POLICY, roles=['current_reference'], reference=True, anchorKey=self.base['key'])
        layouts.append(reference)
        archive = Path(str(PREFIX)+'-scores.json.gz')
        archive.write_bytes(gzip.compress(json.dumps(self.cache, ensure_ascii=False,
            separators=(',', ':')).encode(), mtime=0))
        atomic_json(Path(str(PREFIX)+'-finalists.json'), dict(version=self.progress['contract']['version'],
            tokenKeys=self.source['tokenKeys'], firstAtomNames=self.source['firstAtomNames'], layouts=layouts,
            contract=self.progress['contract'], constraints=self.constraints, stages=self.progress['rounds'],
            controlKeys=self.progress['controlKeys'], evaluatedStates=len(self.cache), rootInternalSplits=0,
            scoreArchive=dict(file=archive.name, sha256=sha(archive))))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--phase', choices=['controls', 'heads', 'transfer', 'joint1', 'joint2', 'joint3', 'export', 'all'], default='all')
    p.add_argument('--workers', type=int, default=12)
    args = p.parse_args()
    if not 1 <= args.workers <= 16:
        p.error('workers must be 1 to 16')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    lock = lock_run(OUTPUT)
    s = None
    try:
        s = AeoHeads(args.workers)
        phases = ['controls', 'heads', 'transfer', 'joint1', 'joint2'] if args.phase == 'all' else [args.phase]
        for phase in phases:
            if phase != 'export':
                s.stage(phase)
        s.export()
    finally:
        if s and s.engine:
            s.engine.close()
        lock.close()


if __name__ == '__main__':
    main()
