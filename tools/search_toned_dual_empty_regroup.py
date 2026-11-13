"""Deterministic bounded neighborhoods of tone-independent roots, with QZ/ZQ empty.

M_lower = 5 + first displacement cost + count(multi-root groups)
          + sum(10 - distinct region keys).
M_guard replaces count(multi-root groups) by sum(group size - 1).
Ten nonempty groups; 18 rhyme roots; no tone-specific final exceptions.
"""
import argparse
import copy
import json
from collections import Counter
from itertools import combinations
from prepare_toned_rhyme_neighbors import ROOT, read
from search_toned_rhyme_regroup import make_job

SOURCE = 'research/config/ckt-v51-toned-2121-mars10-qzzq-empty-p3-finalist.json'


def build(args):
    job = make_job()
    fixture, roots, final_roots = job['fixture'], job['rootNames'], job['finalRoots']
    if getattr(args, 'swap_tone_rows', False):
        upper = next(r for r in fixture['toneRegions'] if r['name'] == 'upper')
        lower = next(r for r in fixture['toneRegions'] if r['name'] == 'lower')
        upper['tones'], lower['tones'] = lower['tones'], upper['tones']
    original = read('research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json')
    first_for_py = {p: i for i, a in enumerate(fixture['atoms']) for p in a['pinyin']}
    final_for_py = {p: i for i, a in enumerate(fixture['rhymeAtoms']) for p in a['pinyin']}
    region_for_tone = {t: i for i, r in enumerate(fixture['toneRegions']) for t in r['tones']}
    legal = [(first_for_py[p], final_for_py[p], region_for_tone[t + 1])
             for p, codes in enumerate(fixture['tonedCodes']) for t, code in enumerate(codes) if code]
    assert len(legal) == 1407
    candidates, rejected, seen = [], Counter(), set()
    previously_scored = set()
    for prefix in getattr(args, 'exclude', []) or []:
        old_job, old_scores = read(prefix + '-job.json'), read(prefix + '-scores.json')
        completed_ids = {row['id'] for row in old_scores['results']}
        previously_scored.update(json.dumps(c['state'], sort_keys=True) for c in old_job['candidates'] if c['id'] in completed_ids)
    ordinary = [i for i, a in enumerate(fixture['atoms']) if len(a['initial']) == 1 and a['initial'] != '_']

    def add(seed, kind, description, partition, keys, first):
        if getattr(args, 'q_empty_rhyme', False):
            if any('Q' in row for row in keys) or any(first[i] != 'Q' for i,a in enumerate(fixture['atoms']) if a['initial'] == 'q'):
                rejected['Q-rhyme-or-q-initial'] += 1
                return
        sizes = [partition.count(g) for g in range(10)]
        if 0 in sizes:
            rejected['empty-group'] += 1
            return
        d = sum(first[i] != fixture['atoms'][i]['baselineKey'] for i in ordinary)
        first_cost = sum(a['moveMemoryDelta'] for i, a in enumerate(fixture['atoms']) if first[i] != a['baselineKey'])
        merge = sum(10 - len(set(row)) for row in keys)
        group_rules = sum(n > 1 for n in sizes)
        memory, guard = 5 + first_cost + group_rules + merge, 5 + first_cost + 8 + merge
        if d > args.max_d or memory > args.max_m or guard > getattr(args, 'max_guard', 999):
            rejected['D/M'] += 1
            return
        state = dict(firstKeys=first, rhymeKeys=[[row[partition[root]] for root in final_roots] for row in keys])
        for code in getattr(args, 'require_empty', ['QZ', 'ZQ']):
            if any(first[a] == code[0] and state['rhymeKeys'][r][f] == code[1] for a, f, r in legal):
                rejected[code] += 1
                return
        signature = json.dumps(state, sort_keys=True)
        if kind != 'baseline' and signature in previously_scored:
            rejected['already-scored'] += 1
            return
        if signature in seen:
            rejected['duplicate'] += 1
            return
        seen.add(signature)
        groups = [dict(slot=g, roots=[roots[i] for i, p in enumerate(partition) if p == g],
                       finals=[a['name'] for f, a in enumerate(fixture['rhymeAtoms']) if partition[final_roots[f]] == g],
                       keys={r['name']: keys[ri][g] for ri, r in enumerate(fixture['toneRegions'])}) for g in range(10)]
        candidates.append(dict(id=f'{args.tag}-{len(candidates):04d}', anchor=seed['id'], kind=kind,
            description=description, state=state, memory=memory, memoryGuard=guard, ordinaryD=d,
            splits=0, merge=merge, sourceRhymeColumnMergeRules=group_rules,
            sourceRhymeColumnMergeLinks=8, partition=partition, groupKeys=keys, rhymeGroups=groups))

    if getattr(args, 'production', False):
        production = read('research/.cache/ckt-v51-toned-mars10-D1-final.json')
        first = []
        for atom in production['atoms']:
            values = {code[0] for p in atom['pinyin'] for code in production['tonedCodes'][p] if code}
            assert len(values) == 1
            first.append(values.pop())
        keys = []
        for region in production['toneRegions']:
            row = []
            for atom in production['rhymeAtoms']:
                values = {production['tonedCodes'][p][t-1][1] for p in atom['pinyin'] for t in region['tones']
                          if production['tonedCodes'][p][t-1]}
                assert len(values) == 1
                row.append(values.pop())
            keys.append(row)
        seeds = [dict(id='PRODUCTION-M21', partition=job['candidates'][0]['partition'], groupKeys=keys,
                      state=dict(firstKeys=first), score=9.203609845305458)]
    elif getattr(args, 'seed_file', None):
        seeds = read(args.seed_file)['seeds']
    elif args.previous:
        previous, scores = read(args.previous + '-job.json'), read(args.previous + '-scores.json')
        assert scores['completed'] == scores['total'] == len(previous['candidates'])
        by_id = {c['id']: c for c in previous['candidates']}
        ranked = [dict(by_id[r['id']], score=r['score']) for r in sorted(scores['results'], key=lambda r: r['score'])]
        seeds = ranked[:args.leaders]
    else:
        partition = job['candidates'][0]['partition']
        seeds = []
        for anchor in read(SOURCE)['layouts']:
            if anchor['id'] not in args.anchors.split(','):
                continue
            keys = [[anchor['toneRegionRhymeKeys'][r['name']][g['name']] for g in original['rhymeAtoms']]
                    for r in fixture['toneRegions']]
            seeds.append(dict(id=anchor['id'], partition=partition, groupKeys=keys,
                              state=dict(firstKeys=[anchor['firstKeys'][a['name']] for a in fixture['atoms']]),
                              score=anchor['rustScore']))
    assert seeds
    for seed in seeds:
        partition, keys, first = seed['partition'], seed['groupKeys'], seed['state']['firstKeys']
        add(seed, 'baseline', 'unchanged seed ' + seed['id'], partition, keys, first)
        if 'erv' in args.operators:
            er, v = roots.index('er'), roots.index('v')
            for er_target in range(10):
                for v_target in range(10):
                    changed = partition.copy()
                    changed[er], changed[v] = er_target, v_target
                    add(seed, 'er-v-combination', f'er -> slot {er_target}; v -> slot {v_target}', changed, keys, first)
        root_neighbors = []
        for a in range(18):
            for target in range(10):
                if partition[a] == target or partition.count(partition[a]) == 1:
                    continue
                changed = partition.copy()
                changed[a] = target
                root_neighbors.append(('root-transfer', f'{roots[a]} -> slot {target}', changed, {partition[a], target}))
            for b in range(a + 1, 18):
                if partition[a] == partition[b]:
                    continue
                changed = partition.copy()
                changed[a], changed[b] = changed[b], changed[a]
                root_neighbors.append(('root-exchange', f'{roots[a]} <-> {roots[b]}', changed, {partition[a], partition[b]}))
        if 'root' in args.operators:
            for kind, desc, changed, _ in root_neighbors:
                add(seed, kind, desc, changed, keys, first)
        if 'key' in args.operators:
            for ri, region in enumerate(fixture['toneRegions']):
                for a in range(10):
                    for key in region['keys']:
                        if keys[ri][a] == key:
                            continue
                        changed = copy.deepcopy(keys)
                        changed[ri][a] = key
                        add(seed, 'group-key-move', f'{region["name"]} slot {a} -> {key}', partition, changed, first)
                for a, b in combinations(range(10), 2):
                    if keys[ri][a] == keys[ri][b]:
                        continue
                    changed = copy.deepcopy(keys)
                    changed[ri][a], changed[ri][b] = changed[ri][b], changed[ri][a]
                    add(seed, 'group-key-swap', f'{region["name"]} slots {a} <-> {b}', partition, changed, first)
        if 'first' in args.operators:
            for i, atom in enumerate(fixture['atoms']):
                for key in 'QWERTYPSDFGHJKLZXCBNM':
                    if first[i] == key:
                        continue
                    changed = first.copy()
                    changed[i] = key
                    add(seed, 'first-move', f'{atom["name"]} -> {key}', partition, keys, changed)
        # Coupled moves can cross infeasible intermediate partitions. Restricted
        # to swapping the two affected groups; all tone regions are included.
        if 'coupled' in args.operators:
            for _, desc, changed_partition, touched in root_neighbors:
                a, b = sorted(touched)
                for ri, region in enumerate(fixture['toneRegions']):
                    if keys[ri][a] == keys[ri][b]:
                        continue
                    changed = copy.deepcopy(keys)
                    changed[ri][a], changed[ri][b] = changed[ri][b], changed[ri][a]
                    add(seed, 'root-plus-key-swap', f'{desc}; {region["name"]} slots {a} <-> {b}', changed_partition, changed, first)
    job.update(candidates=candidates, rejected=dict(rejected), memoryConvention=__doc__,
               maxD=args.max_d, maxM=args.max_m, requireEmpty=getattr(args, 'require_empty', ['QZ', 'ZQ']),
               seedScores={s['id']: s['score'] for s in seeds}, sourceLayouts=SOURCE,
               searchArguments=vars(args))
    job['maxMemoryGuard'] = getattr(args, 'max_guard', 999)
    if getattr(args, 'q_empty_rhyme', False):
        job['forbiddenRhymeKeys'] = ['Q']
        job['preserveQInitial'] = True
    return job


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prefix', required=True)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--previous')
    parser.add_argument('--seed-file')
    parser.add_argument('--production', action='store_true')
    parser.add_argument('--q-empty-rhyme', action='store_true')
    parser.add_argument('--require-empty', nargs='*', default=['QZ', 'ZQ'])
    parser.add_argument('--leaders', type=int, default=1)
    parser.add_argument('--max-d', type=int, default=2)
    parser.add_argument('--max-m', type=int, default=23)
    parser.add_argument('--max-guard', type=int, default=999)
    parser.add_argument('--swap-tone-rows', action='store_true', help='upper tones 1/5; lower tone 4; home unchanged')
    parser.add_argument('--operators', default='root')
    parser.add_argument('--exclude', action='append', default=[], help='previously scored prefix; repeatable')
    parser.add_argument('--anchors', default='MARS10-QZZQEMPTY-P3-D2-M23-04')
    args = parser.parse_args()
    job = build(args)
    (ROOT / (args.prefix + '-job.json')).write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(dict(candidates=len(job['candidates']), rejected=job['rejected']), ensure_ascii=False))


if __name__ == '__main__':
    main()
