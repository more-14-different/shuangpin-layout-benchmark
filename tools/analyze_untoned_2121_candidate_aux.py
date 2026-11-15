"""Compare 21x21 candidates using complete native policy components and wide cost grids."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import time

import numpy as np
from analyze_single_ckt_v51_aux_order import competition_ranks

KINDS = ('character', 'word2', 'word3', 'word4')
FIELDS = ('firstAuxMs', 'secondAuxMs', 'thirdAuxMs', 'selectionDecisionMs', 'scanPerCandidateMs', 'pageActionMs')
RATES = ('firstAuxRate', 'secondAuxRate', 'thirdAuxRate', 'selectionRate', 'meanRejectedCandidates', 'meanPageActions')
WEIGHTS = np.array([1, 3, 1, 1], dtype=float)
SELECTED = 'OC21-bf9bf45a7e60'


def vectors(tracks, baseline):
    result = np.asarray([[tracks[k]['motorUpperMs']] + [baseline[f] * tracks[k][r] for f, r in zip(FIELDS, RATES)] for k in KINDS])
    np.testing.assert_allclose(result.sum(axis=-1), [tracks[k]['effectiveMs'] for k in KINDS], rtol=0, atol=1e-9)
    return result


def batches(step, size):
    for start in range(0, 11**6, size):
        quotient = np.arange(start, min(start + size, 11**6), dtype=np.int64)
        grid = np.empty((len(quotient), 6))
        for axis in range(5, -1, -1):
            grid[:, axis] = (quotient % 11) * step
            quotient //= 11
        yield start, grid, np.all(grid > 0, axis=1)


def powers(v, reference, batch):
    effective = v[..., 0][None, ...] + np.einsum('ba,...ta->b...t', batch, v[..., 1:], optimize=True)
    denominator = reference[:, 0][None, :] + batch @ reference[:, 1:].T
    return np.sum(WEIGHTS * (effective / denominator[:, None, :])**4, axis=-1)


def mode_score(fourth):
    return 10 * (fourth / 6)**0.25


def joined_score(fourth):
    return 10 * (fourth / 12)**0.25


def factorize(case, baseline):
    """Exact separability: 24 joint word2/word4 choices plus 6 word3 choices."""
    rows = case['results']
    full = np.asarray([vectors(row['tracks'], baseline) for row in rows])
    pairs, thirds, pi, ti = [], [], [], []
    for row in rows:
        p = (row['policy']['word2'], row['policy']['word4'])
        t = row['policy']['word3']
        if p not in pairs:
            pairs.append(p)
        if t not in thirds:
            thirds.append(t)
        pi.append(pairs.index(p))
        ti.append(thirds.index(t))
    pv = np.asarray([full[pi.index(i), [1, 3], :] for i in range(len(pairs))])
    tv = np.asarray([full[ti.index(i), 2, :] for i in range(len(thirds))])
    for i in range(len(rows)):
        np.testing.assert_array_equal(full[i, [1, 3]], pv[pi[i]])
        np.testing.assert_array_equal(full[i, 2], tv[ti[i]])
        np.testing.assert_array_equal(full[i, 0], full[0, 0])
    return full, pv, tv, np.asarray(pi), np.asarray(ti)


def factor_parts(factors, reference, batch):
    full, pv, tv, pi, ti = factors
    den = reference[:, 0][None, :] + batch @ reference[:, 1:].T
    pair = pv[..., 0][None, ...] + np.einsum('ba,pta->bpt', batch, pv[..., 1:], optimize=True)
    pair = np.sum(np.asarray([3, 1]) * (pair / den[:, None, [1, 3]])**4, axis=-1)
    third = (tv[:, 0][None, :] + batch @ tv[:, 1:].T) / den[:, 2, None]
    char = (full[0, 0, 0] + batch @ full[0, 0, 1:]) / den[:, 0]
    return pair, third**4, char**4


def factored_powers(factors, reference, batch):
    pair, third, char = factor_parts(factors, reference, batch)
    return pair[:, factors[3]] + third[:, factors[4]] + char[:, None]


def stats(count):
    return dict(n=0, rankSum=np.zeros(count, np.int64), top1=np.zeros(count, np.int64), top3=np.zeros(count, np.int64), worst=np.zeros(count, np.int16))


def accumulate(s, ranks):
    s['n'] += len(ranks)
    s['rankSum'] += ranks.sum(axis=0, dtype=np.int64)
    s['top1'] += (ranks == 1).sum(axis=0)
    s['top3'] += (ranks <= 3).sum(axis=0)
    s['worst'] = np.maximum(s['worst'], ranks.max(axis=0))


def ranking(s, keys):
    result = [dict(policy=key, meanRank=float(s['rankSum'][i] / s['n']), top1Rate=float(s['top1'][i] / s['n']),
                   top3Rate=float(s['top3'][i] / s['n']), worstRank=int(s['worst'][i])) for i, key in enumerate(keys)]
    return sorted(result, key=lambda x: (x['meanRank'], -x['top3Rate'], -x['top1Rate'], x['worstRank'], x['policy']))


def default_mode(case, reference, baseline):
    v = np.asarray([vectors(row['tracks'], baseline) for row in case['results']])
    fourth = powers(v, reference, np.ones((1, 6)))[0]
    order = np.argsort(fourth, kind='stable')
    return dict(fourth=fourth, ranking=[dict(policy=case['results'][i]['policyKey'], score=float(mode_score(fourth[i])), fourth=float(fourth[i])) for i in order])


def gaps(case, reference, baseline, winner, runner, step, size):
    keys = [row['policyKey'] for row in case['results']]
    v = np.asarray([vectors(case['results'][keys.index(k)]['tracks'], baseline) for k in (winner, runner)])
    all_deltas, positive_deltas = [], []
    for _, batch, positive in batches(step, size):
        scored = mode_score(powers(v, reference, batch))
        delta = scored[:, 1] - scored[:, 0]
        all_deltas.append(delta)
        positive_deltas.append(delta[positive])
    def describe(delta):
        return dict(mean=float(np.mean(delta)), minimum=float(np.min(delta)), maximum=float(np.max(delta)),
                    p05=float(np.quantile(delta, .05)), median=float(np.median(delta)), p95=float(np.quantile(delta, .95)),
                    winnerStrictWinRate=float(np.mean(delta > 1e-9)), tieRate=float(np.mean(np.abs(delta) <= 1e-9)))
    return describe(np.concatenate(all_deltas)), describe(np.concatenate(positive_deltas))


def compare_layouts(values, fixed_values, ids, positive):
    answer = {}
    for label, data in [('scenarioOptimalPolicies', values), ('fixedMainPositiveRobustPolicies', fixed_values)]:
        for suffix, mask in [('includingZero', np.ones(len(positive), bool)), ('positiveOnly', positive)]:
            scores = joined_score(data[:, mask].T)
            ranks = competition_ranks(scores)
            best = scores.min(axis=1)
            ref = scores[:, ids.index(SELECTED)]
            rows = []
            for i, ident in enumerate(ids):
                regret = scores[:, i] - best
                rows.append(dict(id=ident, top1Rate=float(np.mean(ranks[:, i] == 1)), meanRank=float(np.mean(ranks[:, i])),
                                 worstRank=int(ranks[:, i].max()), meanRegret=float(np.mean(regret)), maxRegret=float(np.max(regret)),
                                 strictlyBeatsSelectedRate=float(np.mean(scores[:, i] < ref - 1e-9))))
            answer[label + ':' + suffix] = sorted(rows, key=lambda x: (x['meanRank'], -x['top1Rate'], x['id']))
    return answer


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--chunk-size', type=int, default=8192)
    parser.add_argument('--limit', type=int)
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    raw = args.input.read_bytes()
    payload = json.loads(gzip.decompress(raw) if args.input.suffix == '.gz' else raw)
    schemes = payload['schemes'][:args.limit]
    if not args.limit and len(schemes) != 7:
        raise ValueError('expected all seven candidates; component export is incomplete')
    baseline = payload['baselineCostsMs']
    refs = {m: vectors(payload['references'][m]['tracks'], baseline) for m in ('keytao', 'sanpin')}
    out = dict(version='untoned-2121-candidate-aux-robustness-1', componentsSha256=hashlib.sha256(raw).hexdigest(),
               contract=payload['contract'], baselineCostsMs=baseline, referencePolicies=payload['referencePolicies'],
               coefficients=list(FIELDS), scenarioCountPerZeroGrid=11**6, scenarioCountPerPositiveGrid=10**6,
               selection='mean competition rank, then Top3, Top1, worst rank, policy key; coefficients independent; fixed S005 reference', schemes={}, layoutComparison={})
    digest = lambda value: hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    out['scoreContractSha256'] = digest({k: payload[k] for k in ('contract', 'baselineCostsMs', 'references', 'referencePolicies', 'sourceHashes')})
    out['analyzerSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    cached = {}
    if args.resume and args.output.exists():
        old = json.loads(args.output.read_text(encoding='utf-8'))
        if old.get('scoreContractSha256') != out['scoreContractSha256'] or old.get('analyzerSha256') != out['analyzerSha256']:
            raise ValueError('resume score/analyzer contract differs')
        cached = old['schemes']
    defaults = {}
    for scheme in schemes:
        ident = scheme['id']
        defaults[ident] = {m: default_mode(scheme['cases'][m], refs[m], baseline) for m in refs}
        best = {m: defaults[ident][m]['ranking'][0] for m in refs}
        second = min(best['sanpin']['fourth'] + defaults[ident]['keytao']['ranking'][1]['fourth'],
                     best['keytao']['fourth'] + defaults[ident]['sanpin']['ranking'][1]['fourth'])
        minimum = float(joined_score(best['keytao']['fourth'] + best['sanpin']['fourth']))
        out['schemes'][ident] = dict(fixedPolicyScore=scheme['fixedScore'], defaultOptimalScore=minimum,
            defaultOptimalPolicies={m: best[m]['policy'] for m in refs}, defaultSecondBestScore=float(joined_score(second)),
            defaultRunnerUpGap=float(joined_score(second) - minimum), defaultModeTop5={m: defaults[ident][m]['ranking'][:5] for m in refs}, grids={})
        out['schemes'][ident]['componentsSha256'] = digest(scheme)
        if ident in cached:
            if cached[ident].get('componentsSha256') != digest(scheme):
                raise ValueError('resume layout components differ: ' + ident)
            out['schemes'][ident] = cached[ident]

    def save():
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    save()
    for grid_name, step in [('main0To500', .5), ('extreme0To1000', 1.)]:
        oracle = np.zeros((len(schemes), 11**6))
        fixed = np.zeros_like(oracle)
        positive_mask = np.zeros(11**6, bool)
        for index, scheme in enumerate(schemes):
            ident = scheme['id']
            per_mode = {}
            for mode, reference in refs.items():
                started = time.perf_counter()
                case = scheme['cases'][mode]
                factors = factorize(case, baseline)
                keys = [row['policyKey'] for row in case['results']]
                reused = out['schemes'][ident]['grids'].get(grid_name, {}).get(mode)
                all_stats, pos_stats = stats(len(keys)), stats(len(keys))
                # Independent reconstruction verifies the factorization before the large sweep.
                probe = np.asarray([[1]*6, [0]*6, [0, .5, 1, 2, 3, 5]])
                np.testing.assert_allclose(factored_powers(factors, reference, probe), powers(factors[0], reference, probe), rtol=1e-14, atol=1e-10)
                for start, batch, positive in batches(step, args.chunk_size):
                    end = start + len(batch)
                    pair, third, char = factor_parts(factors, reference, batch)
                    if not reused:
                        fourth = pair[:, factors[3]] + third[:, factors[4]] + char[:, None]
                        ranks = competition_ranks(fourth)
                        accumulate(all_stats, ranks)
                        if positive.any():
                            accumulate(pos_stats, ranks[positive])
                    oracle[index, start:end] += pair.min(axis=1) + third.min(axis=1) + char
                    positive_mask[start:end] = positive
                entries = reused or {}
                for name, s in ([] if reused else [('includingZero', all_stats), ('positiveOnly', pos_stats)]):
                    ranks = ranking(s, keys)
                    entries[name] = dict(points=s['n'], winner=ranks[0], runnerUp=ranks[1],
                        meanRankGap=ranks[1]['meanRank'] - ranks[0]['meanRank'], top10=ranks[:10])
                for name in ([] if reused else entries):
                    winner, runner = entries[name]['winner']['policy'], entries[name]['runnerUp']['policy']
                    # Both summaries share one evaluation when the first two policies agree.
                    cache_key = (winner, runner)
                    if name == 'includingZero':
                        gap_key = cache_key
                        gap_data = gaps(case, reference, baseline, winner, runner, step, args.chunk_size)
                    elif cache_key != gap_key:
                        gap_data = gaps(case, reference, baseline, winner, runner, step, args.chunk_size)
                    entries[name]['headToHeadCKTGap'] = gap_data[0 if name == 'includingZero' else 1]
                per_mode[mode] = entries
                if grid_name == 'main0To500':
                    target = out['schemes'][ident].setdefault('mainPositiveRobustPolicies', {})
                    target[mode] = entries['positiveOnly']['winner']['policy']
                chosen = out['schemes'][ident]['mainPositiveRobustPolicies'][mode]
                chosen_index = keys.index(chosen)
                v = factors[0][chosen_index:chosen_index+1]
                for start, batch, _ in batches(step, args.chunk_size):
                    fixed[index, start:start+len(batch)] += powers(v, reference, batch)[:, 0]
                print(f'{grid_name} {ident} {mode}: {entries["positiveOnly"]["winner"]["policy"]}; {time.perf_counter()-started:.1f}s' + (' cached ranks' if reused else ''), flush=True)
            out['schemes'][ident]['grids'][grid_name] = per_mode
            save()
        out['layoutComparison'][grid_name] = compare_layouts(oracle, fixed, [s['id'] for s in schemes], positive_mask)
        save()
    for scheme in schemes:
        ident = scheme['id']
        result = out['schemes'][ident]
        fourth = 0
        formula = {}
        for mode in refs:
            key = result['mainPositiveRobustPolicies'][mode]
            row = next(r for r in scheme['cases'][mode]['results'] if r['policyKey'] == key)
            formula[mode] = {k: {f: row['tracks'][k][f] for f in ('motorUpperMs', *RATES)} for k in KINDS}
            fourth += defaults[ident][mode]['fourth'][[r['policyKey'] for r in scheme['cases'][mode]['results']].index(key)]
        result['mainPositiveRobustDefaultScore'] = float(joined_score(fourth))
        result['formulaComponents'] = formula
    out['completed'] = True
    save()


if __name__ == '__main__':
    main()
