"""Exact 11^6 grids for each UM40 layout's 144 policies, separately by mode.

Ranks use v5.2 normalized CKT scores, tolerance 1e-9. Wide-grid winner means
lowest mean rank; minimax regret is also reported, without conflating criteria.
Candidate routes are frozen by frequency/motor rules, independently of cognitive
costs; six-component linear repricing therefore covers the complete grids.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
import time

import numpy as np

from analyze_single_ckt_v51_aux_order import (
    COMPONENTS, competition_ranks, grid, score_at, vectors,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "research/notes/2026-11-21-um40-v52-policies.json"
DEST = ROOT / "research/notes/2026-11-21-um40-v52-policy-robustness.json"
TOL = 1e-9
WEIGHTS = np.array([1., 3., 1., 1.])


def scores_at_batch(a, b, points):
    effective = a[None, :, :, 0] + np.einsum("ba,pta->bpt", points, a[:, :, 1:], optimize=False)
    reference = b[None, :, 0] + points @ b[:, 1:].T
    return 10 * (np.sum(WEIGHTS[None, None, :] * (effective / reference[:, None, :]) ** 4, axis=2) / 6) ** .25


def summarize_pair(a, b, points, first, second, positive=False, chunk=4096):
    pieces = []
    win = tie = loss = 0
    worst = None
    for start in range(0, len(points), chunk):
        batch = points[start:start+chunk]
        if positive:
            batch = batch[np.all(batch > 0, axis=1)]
        if not len(batch):
            continue
        scores = scores_at_batch(a[[first, second]], b, batch)
        gaps = scores[:, 1] - scores[:, 0]
        pieces.append(gaps)
        win += int(np.sum(gaps > TOL)); tie += int(np.sum(np.abs(gaps) <= TOL)); loss += int(np.sum(gaps < -TOL))
        j = int(np.argmin(gaps))
        if worst is None or gaps[j] < worst[0]:
            worst = (float(gaps[j]), batch[j].tolist(), scores[j].tolist())
    values = np.concatenate(pieces)
    return {"definition": "runner-up score minus mean-rank winner score; positive favors winner",
            "points": len(values), "winnerBeatsRunnerRate": win / len(values),
            "tieRate": tie / len(values), "runnerBeatsWinnerRate": loss / len(values),
            "minGap": float(values.min()), "p05Gap": float(np.quantile(values, .05)),
            "medianGap": float(np.median(values)), "p95Gap": float(np.quantile(values, .95)),
            "maxGap": float(values.max()),
            "worstCase": {"gap": worst[0], "multipliers": worst[1], "scoresWinnerRunner": worst[2]}}


def audit_case(case, reference, costs, points, current_key, chunk=4096):
    rows = case["results"]
    assert len(rows) == 144 and len({r["policyKey"] for r in rows}) == 144
    a = np.asarray([vectors(r, costs) for r in rows]); b = vectors({"tracks": reference}, costs)
    default = score_at(a, b, np.ones(6)); doubled = score_at(a, b, np.full(6, 2.))
    for i, row in enumerate(rows):
        assert abs(default[i] - row["score"]) < TOL
        for t, track in enumerate(row["tracks"].values()):
            assert abs(a[i, t, 0] + a[i, t, 1:].sum() - track["effectiveMs"]) < 1e-8
    n = len(rows)
    stats = {part: {"count": 0, "rank": np.zeros(n, np.int64), "top1": np.zeros(n, np.int64),
                   "top3": np.zeros(n, np.int64), "worstRank": np.zeros(n, np.int16),
                   "maxRegret": np.zeros(n), "regret": np.zeros(n)} for part in ("all", "positive")}
    for start in range(0, len(points), chunk):
        batch = points[start:start+chunk]
        scores = scores_at_batch(a, b, batch)
        ranks = competition_ranks(scores, tolerance=TOL)
        regrets = scores / scores.min(axis=1)[:, None] - 1
        for part, mask in (("all", np.ones(len(batch), bool)), ("positive", np.all(batch > 0, axis=1))):
            r = ranks[mask]; g = regrets[mask]
            if not len(r):
                continue
            s = stats[part]; s["count"] += len(r)
            s["rank"] += r.sum(axis=0, dtype=np.int64)
            s["top1"] += (r == 1).sum(axis=0); s["top3"] += (r <= 3).sum(axis=0)
            s["worstRank"] = np.maximum(s["worstRank"], r.max(axis=0))
            s["maxRegret"] = np.maximum(s["maxRegret"], g.max(axis=0)); s["regret"] += g.sum(axis=0)
    output = {}
    current_index = next(i for i, r in enumerate(rows) if r["policyKey"] == current_key)
    for part, s in stats.items():
        ranked = []
        for i, row in enumerate(rows):
            count = s["count"]
            ranked.append({"policy": row["policyKey"], "policyIndex": i, "meanRank": float(s["rank"][i]/count),
                           "top1Rate": float(s["top1"][i]/count), "top3Rate": float(s["top3"][i]/count),
                           "worstRank": int(s["worstRank"][i]), "worstRegret": float(s["maxRegret"][i]),
                           "meanRegret": float(s["regret"][i]/count),
                           "defaultScore": float(default[i]), "doubledScore": float(doubled[i])})
        ranked.sort(key=lambda r: (r["meanRank"], -r["top3Rate"], -r["top1Rate"], r["worstRank"], r["policy"]))
        minimax = sorted(ranked, key=lambda r: (r["worstRegret"], r["meanRegret"], r["defaultScore"], r["policy"]))
        first, second = ranked[:2]
        output[part] = {"points": s["count"], "winner": first, "runnerUp": second,
                        "meanRankGap": second["meanRank"] - first["meanRank"],
                        "minimaxWinner": minimax[0], "minimaxRunnerUp": minimax[1],
                        "minimaxWorstRegretGap": minimax[1]["worstRegret"]-minimax[0]["worstRegret"],
                        "current": next(r for r in ranked if r["policyIndex"] == current_index),
                        "currentPositionByMeanRank": next(i+1 for i, r in enumerate(ranked) if r["policyIndex"] == current_index),
                        "ranking": ranked,
                        "winnerRunnerGap": summarize_pair(a, b, points, first["policyIndex"], second["policyIndex"], part == "positive", chunk)}
    def top(scores):
        return [{"policy": rows[i]["policyKey"], "score": float(scores[i])} for i in np.argsort(scores, kind="stable")[:10]]
    output["defaultTop10"] = top(default); output["doubledTop10"] = top(doubled)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--available", action="store_true", help="process completed enumeration cases only")
    parser.add_argument("--chunk", type=int, default=4096)
    args = parser.parse_args()
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    result = json.loads(DEST.read_text(encoding="utf-8")) if DEST.exists() else {
        "version": "um40-v52-independent-six-cost-wide-grids-v1", "coefficientOrder": list(COMPONENTS),
        "baselineCostsMs": source["baselineCostsMs"], "ranking": "mean rank, then top3, top1, worst rank, policy key",
        "minimaxRanking": "worst relative regret, mean relative regret, default score, policy key",
        "rankTieTolerance": TOL, "schemes": {}}
    result["analysisSourceSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    for name, maximum, step in (("main", 5., .5), ("extreme", 10., 1.)):
        points = grid(0., maximum, step)
        assert len(points) == 1771561
        for ident, layout in source["schemes"].items():
            target = result["schemes"].setdefault(ident, {"id": ident, "name": layout["name"], "cases": {}})
            for mode, case in layout["cases"].items():
                if len(case["results"]) != 144 or not case.get("publishedPolicyReplayVerified"):
                    assert args.available, "incomplete enumeration"
                    continue
                out = target["cases"].setdefault(mode, {})
                case_digest = hashlib.sha256(json.dumps(case, sort_keys=True).encode()).hexdigest()
                if name in out:
                    assert out[name]["caseDigest"] == case_digest
                    continue
                t0 = time.time()
                print(f"{ident}/{mode}/{name}: 1,771,561 points x 144 policies", flush=True)
                current = "/".join(layout["publishedPolicies"][mode][k] for k in ("word2", "word3", "word4"))
                out[name] = {"range": [0, maximum], "step": step, "caseDigest": case_digest,
                             **audit_case(case, source["references"][mode], source["baselineCostsMs"], points, current, args.chunk)}
                print(json.dumps({"id": ident, "mode": mode, "grid": name,
                                  "winner": out[name]["all"]["winner"], "currentPosition": out[name]["all"]["currentPositionByMeanRank"],
                                  "seconds": time.time()-t0}), flush=True)
                result["enumerationSha256"] = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
                DEST.write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    result["enumerationSha256"] = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    DEST.write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(DEST, flush=True)
    with DEST.with_suffix('.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        fields = ['id', 'mode', 'grid', 'part', 'points', 'winner', 'runnerUp', 'meanRank1', 'meanRank2',
                  'meanRankGap', 'top1Rate', 'worstRank', 'minimaxWinner', 'minimaxWorstRegret',
                  'current', 'currentPosition', 'currentTop1Rate', 'defaultBest', 'doubledBest',
                  'winnerBeatsRunnerRate', 'runnerBeatsWinnerRate', 'minGap', 'medianGap', 'maxGap']
        writer = csv.DictWriter(stream, fieldnames=fields); writer.writeheader()
        for ident, layout in result['schemes'].items():
            for mode, cases in layout['cases'].items():
                for name, doc in cases.items():
                    for part in ['all', 'positive']:
                        v = doc[part]; gap = v['winnerRunnerGap']
                        writer.writerow(dict(id=ident, mode=mode, grid=name, part=part, points=v['points'],
                            winner=v['winner']['policy'], runnerUp=v['runnerUp']['policy'],
                            meanRank1=v['winner']['meanRank'], meanRank2=v['runnerUp']['meanRank'],
                            meanRankGap=v['meanRankGap'], top1Rate=v['winner']['top1Rate'], worstRank=v['winner']['worstRank'],
                            minimaxWinner=v['minimaxWinner']['policy'], minimaxWorstRegret=v['minimaxWinner']['worstRegret'],
                            current=v['current']['policy'], currentPosition=v['currentPositionByMeanRank'], currentTop1Rate=v['current']['top1Rate'],
                            defaultBest=doc['defaultTop10'][0]['policy'], doubledBest=doc['doubledTop10'][0]['policy'],
                            **{k:gap[k] for k in ['winnerBeatsRunnerRate','runnerBeatsWinnerRate','minGap','medianGap','maxGap']}))


if __name__ == "__main__":
    main()
