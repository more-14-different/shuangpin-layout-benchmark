"""Prepare tone-independent rhyme repartitions and subsequent group swaps.

M_lower = 4 + first displacement cost + 1 head-deletion rule + number of
multi-root groups + sum(group count - used keys per tone region).
M_guard replaces multi-root group count with sum(group size - 1).
The 18 roots are derived from the inventory, retaining i/u/v separately.
"""
import argparse
import copy
import json
from collections import defaultdict
from itertools import combinations
from prepare_toned_rhyme_neighbors import ROOT, read, build_job


def make_job(refine=False, combine=False):
    job = build_job()
    fixture = job['fixture']
    original = read('research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json')
    layouts = read('research/config/ckt-v51-toned-2121-mars10-qz-empty-p3-finalist.json')['layouts']
    inventory = read('research/config/ckt-v51-toned-2121-seeds.json')
    root_by_final = {}
    for x in inventory['decomposition']:
        root = x['fullFinal'] if x['rhymeBody'] == '_' else x['rhymeBody']
        assert root_by_final.setdefault(x['fullFinal'], root) == root
    roots = sorted(set(root_by_final.values()))
    assert len(roots) == 18
    final_roots = [roots.index(root_by_final[x['name']]) for x in fixture['rhymeAtoms']]
    parent_by_root = {}
    for f, root in enumerate(final_roots):
        assert parent_by_root.setdefault(root, job['parents'][f]) == job['parents'][f]
    original_partition = [parent_by_root[i] for i in range(len(roots))]
    first_for_py = {p: i for i, a in enumerate(fixture['atoms']) for p in a['pinyin']}
    final_for_py = {p: i for i, a in enumerate(fixture['rhymeAtoms']) for p in a['pinyin']}
    region_for_tone = {t: i for i, r in enumerate(fixture['toneRegions']) for t in r['tones']}
    legal = [(first_for_py[p], final_for_py[p], region_for_tone[t + 1])
             for p, codes in enumerate(fixture['tonedCodes']) for t, code in enumerate(codes) if code]
    candidates, rejected, seen = [], defaultdict(int), set()

    def add(anchor, kind, description, partition, keys, first):
        sizes = [partition.count(g) for g in range(10)]
        if 0 in sizes:
            rejected['empty-group'] += 1
            return
        state = dict(firstKeys=first, rhymeKeys=[[row[partition[root]] for root in final_roots] for row in keys])
        signature = json.dumps(state, sort_keys=True)
        if signature in seen:
            return
        seen.add(signature)
        first_cost = sum(a['moveMemoryDelta'] for i, a in enumerate(fixture['atoms']) if first[i] != a['baselineKey'])
        merge = sum(10 - len(set(row)) for row in keys)
        group_rules = sum(n > 1 for n in sizes)
        memory = 5 + first_cost + group_rules + merge
        guard = 5 + first_cost + sum(n - 1 for n in sizes) + merge
        if memory > anchor['memoryAudit']['memoryLower'] or memory > 24:
            rejected['memory'] += 1
            return
        if any(first[a] == 'Q' and state['rhymeKeys'][r][f] == 'Z' for a, f, r in legal):
            rejected['QZ'] += 1
            return
        groups = [{ 'slot': g, 'roots': [roots[i] for i, p in enumerate(partition) if p == g],
                   'finals': [x['name'] for f, x in enumerate(fixture['rhymeAtoms']) if partition[final_roots[f]] == g],
                   'keys': {region['name']: keys[r][g] for r, region in enumerate(fixture['toneRegions'])}}
                  for g in range(10)]
        candidates.append(dict(id=f'G{3 if combine and refine else (2 if combine else int(refine))}-{len(candidates):04d}', anchor=anchor['id'], kind=kind,
            description=description, state=state, memory=memory, memoryGuard=guard, splits=0, merge=merge,
            sourceRhymeColumnMergeRules=group_rules, sourceRhymeColumnMergeLinks=8,
            partition=partition, groupKeys=keys, rhymeGroups=groups))

    for anchor in [layouts[4], layouts[2]]:
        if combine and refine and anchor != layouts[4]:
            continue
        first = [anchor['firstKeys'][a['name']] for a in fixture['atoms']]
        keys = [[anchor['toneRegionRhymeKeys'][r['name']][g['name']] for g in original['rhymeAtoms']]
                for r in fixture['toneRegions']]
        add(anchor, 'baseline', 'original partition', original_partition, keys, first)
        if combine and not refine:
            previous = read('research/.cache/toned-regroup-job.json')
            scores = read('research/.cache/toned-regroup-results.json')
            assert scores['completed'] == scores['total']
            by_id = {c['id']: c for c in previous['candidates']}
            baseline = next(c['score'] for c in scores['results'] if by_id[c['id']]['anchor'] == anchor['id'] and by_id[c['id']]['kind'] == 'baseline')
            leaders = [by_id[c['id']] for c in scores['results'] if by_id[c['id']]['anchor'] == anchor['id'] and c['score'] < baseline - 1e-9]
            for left, right in combinations(leaders, 2):
                changes = {}
                conflict = False
                for lead in [left, right]:
                    for i, group in enumerate(lead['partition']):
                        if group != original_partition[i]:
                            if i in changes and changes[i] != group:
                                conflict = True
                            changes[i] = group
                if conflict:
                    continue
                partition = original_partition.copy()
                for i, group in changes.items():
                    partition[i] = group
                add(anchor, 'combined-regroup', left['description'] + '; ' + right['description'], partition, keys, first)
        elif not refine:
            for a in range(18):
                for target in range(10):
                    if target == original_partition[a]:
                        continue
                    partition = original_partition.copy()
                    partition[a] = target
                    add(anchor, 'root-transfer', f'{roots[a]} -> slot {target}', partition, keys, first)
                for b in range(a + 1, 18):
                    if original_partition[a] == original_partition[b]:
                        continue
                    partition = original_partition.copy()
                    partition[a], partition[b] = partition[b], partition[a]
                    add(anchor, 'root-exchange', f'{roots[a]} <-> {roots[b]}', partition, keys, first)
        else:
            prefix = 'toned-regroup-combine' if combine else 'toned-regroup'
            previous = read(f'research/.cache/{prefix}-job.json')
            scores = read(f'research/.cache/{prefix}-results.json')
            assert scores['completed'] == scores['total']
            by_id = {c['id']: c for c in previous['candidates']}
            ranked = sorted(scores['results'], key=lambda c: c['score'])
            eligible = [by_id[c['id']] for c in ranked if by_id[c['id']]['anchor'] == anchor['id'] and
                        by_id[c['id']]['kind'] != 'baseline']
            # Follow both the best score and the best lower-memory route.
            leaders = [eligible[0]]
            cheaper = [c for c in eligible if c['memory'] < anchor['memoryAudit']['memoryLower']]
            alternate = cheaper[0] if cheaper else eligible[1]
            if not combine and alternate['id'] != leaders[0]['id']:
                leaders.append(alternate)
            for lead in leaders:
                add(anchor, 'regroup-leader', lead['description'], lead['partition'], keys, first)
                touched = {g for i, g in enumerate(lead['partition']) if g != original_partition[i]}
                touched.update(original_partition[i] for i, g in enumerate(lead['partition']) if g != original_partition[i])
                for r, region in enumerate(fixture['toneRegions']):
                    for a, b in combinations(range(10), 2):
                        # Directed co-adaptation: swap either changed group
                        # with every other group, in every tone region.
                        if not ({a, b} & touched):
                            continue
                        if keys[r][a] == keys[r][b]:
                            continue
                        changed = copy.deepcopy(keys)
                        changed[r][a], changed[r][b] = changed[r][b], changed[r][a]
                        add(anchor, 'regroup-plus-swap', f"{lead['description']}; {region['name']} slots {a}<->{b}",
                            lead['partition'], changed, first)
    job.update(candidates=candidates, rejected=dict(rejected), memoryConvention=__doc__,
               rootNames=roots, finalRoots=final_roots, regrouping=True)
    return job


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refine', action='store_true')
    parser.add_argument('--combine', action='store_true')
    args = parser.parse_args()
    job = make_job(args.refine, args.combine)
    name = ('toned-regroup-combine-refine' if args.refine else 'toned-regroup-combine') if args.combine else ('toned-regroup-refine' if args.refine else 'toned-regroup')
    (ROOT / f'research/.cache/{name}-job.json').write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(dict(candidates=len(job['candidates']), rejected=job['rejected'])))


if __name__ == '__main__':
    main()
