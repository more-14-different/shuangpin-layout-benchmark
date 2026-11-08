#!/usr/bin/env python3
"""Rank one scheme's 144 CKT v5.1 policies on independent six-cost grids."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


TRACKS = ("character", "word2", "word3", "word4")
WEIGHTS = np.asarray([1, 3, 1, 1], dtype=np.float64)
COMPONENTS = (
    "firstAuxMs",
    "secondAuxMs",
    "thirdAuxMs",
    "selectionDecisionMs",
    "scanPerCandidateMs",
    "pageActionMs",
)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--chunk-size", type=int, default=4096)
    return parser.parse_args()


def component_vector(track: dict, baseline: dict) -> list[float]:
    return [
        track["motorUpperMs"],
        baseline["firstAuxMs"] * track["firstAuxRate"],
        baseline["secondAuxMs"] * track["secondAuxRate"],
        baseline["thirdAuxMs"] * track["thirdAuxRate"],
        baseline["selectionDecisionMs"] * track["selectionRate"],
        baseline["scanPerCandidateMs"] * track["meanRejectedCandidates"],
        baseline["pageActionMs"] * track["meanPageActions"],
    ]


def vectors(result: dict, baseline: dict) -> np.ndarray:
    return np.asarray(
        [component_vector(result["tracks"][track], baseline) for track in TRACKS],
        dtype=np.float64,
    )


def competition_ranks(scores: np.ndarray, tolerance: float = 1e-9) -> np.ndarray:
    order = np.argsort(scores, axis=1, kind="stable")
    sorted_scores = np.take_along_axis(scores, order, axis=1)
    positions = np.broadcast_to(
        np.arange(1, scores.shape[1] + 1, dtype=np.int16), scores.shape
    )
    changes = np.empty(scores.shape, dtype=bool)
    changes[:, 0] = True
    changes[:, 1:] = np.abs(np.diff(sorted_scores, axis=1)) > tolerance
    sorted_ranks = np.maximum.accumulate(
        np.where(changes, positions, 0).astype(np.int16), axis=1
    )
    ranks = np.empty_like(sorted_ranks)
    np.put_along_axis(ranks, order, sorted_ranks, axis=1)
    return ranks


def grid(minimum: float, maximum: float, step: float) -> np.ndarray:
    points = int(round((maximum - minimum) / step)) + 1
    count = points**6
    quotient = np.arange(count, dtype=np.int64)
    result = np.empty((count, 6), dtype=np.float64)
    for axis in range(5, -1, -1):
        result[:, axis] = quotient % points
        quotient //= points
    result = minimum + result * step
    return result


def score_at(vectors_: np.ndarray, reference: np.ndarray, multipliers: np.ndarray) -> np.ndarray:
    effective = vectors_[:, :, 0] + np.einsum(
        "a,pta->pt", multipliers, vectors_[:, :, 1:], optimize=True
    )
    reference_effective = reference[:, 0] + reference[:, 1:] @ multipliers
    return 10 * (
        np.sum(WEIGHTS[None, :] * (effective / reference_effective[None, :]) ** 4, axis=1)
        / np.sum(WEIGHTS)
    ) ** 0.25


def rank_grid(
    case: dict,
    reference_result: dict,
    baseline: dict,
    multipliers: np.ndarray,
    chunk_size: int,
) -> dict:
    keys = [row["policyKey"] for row in case["results"]]
    policy_vectors = np.asarray(
        [vectors(row, baseline) for row in case["results"]], dtype=np.float64
    )
    reference = vectors(reference_result, baseline)
    count = len(keys)
    top1 = np.zeros(count, dtype=np.int64)
    top3 = np.zeros(count, dtype=np.int64)
    rank_sum = np.zeros(count, dtype=np.int64)
    worst = np.zeros(count, dtype=np.int16)
    for start in range(0, len(multipliers), chunk_size):
        batch = multipliers[start : start + chunk_size]
        effective = policy_vectors[:, :, 0][None, :, :] + np.einsum(
            "ba,pta->bpt", batch, policy_vectors[:, :, 1:], optimize=True
        )
        reference_effective = reference[:, 0][None, :] + batch @ reference[:, 1:].T
        fourth = np.sum(
            WEIGHTS[None, None, :]
            * (effective / reference_effective[:, None, :]) ** 4,
            axis=2,
        )
        ranks = competition_ranks(fourth)
        top1 += np.sum(ranks == 1, axis=0)
        top3 += np.sum(ranks <= 3, axis=0)
        rank_sum += np.sum(ranks, axis=0, dtype=np.int64)
        worst = np.maximum(worst, np.max(ranks, axis=0))
    total = len(multipliers)
    ranking = [
        {
            "policy": key,
            "top1Rate": float(top1[index] / total),
            "top3Rate": float(top3[index] / total),
            "meanRank": float(rank_sum[index] / total),
            "worstRank": int(worst[index]),
        }
        for index, key in enumerate(keys)
    ]
    ranking.sort(
        key=lambda row: (
            row["meanRank"], -row["top3Rate"], -row["top1Rate"],
            row["worstRank"], row["policy"],
        )
    )
    baseline_scores = score_at(policy_vectors, reference, np.ones(6))
    baseline_order = np.argsort(baseline_scores, kind="stable")
    return {
        "points": total,
        "winner": ranking[0],
        "top10": ranking[:10],
        "baselineTop10": [
            {
                "policy": keys[index],
                "score": float(baseline_scores[index]),
                "rank": position,
            }
            for position, index in enumerate(baseline_order[:10], 1)
        ],
    }


def main() -> None:
    args = arguments()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    baseline = payload["baselineCostsMs"]
    grids = {
        "main0To500Step50": grid(0.0, 5.0, 0.5),
        "mainPositive50To500Step50": grid(0.5, 5.0, 0.5),
        "extreme0To1000Step100": grid(0.0, 10.0, 1.0),
        "extremePositive100To1000Step100": grid(1.0, 10.0, 1.0),
    }
    output = {
        "version": "ckt5.1-single-scheme-six-cost-robustness-1",
        "id": payload["id"],
        "contract": payload["contract"],
        "trackWeights": dict(zip(TRACKS, WEIGHTS.astype(int).tolist())),
        "baselineCostsMs": baseline,
        "coefficients": list(COMPONENTS),
        "grids": {},
        "cases": {},
    }
    for grid_name, multipliers in grids.items():
        output["grids"][grid_name] = {
            "rangePercent": [
                50 if "Positive50" in grid_name else 100 if "Positive100" in grid_name else 0,
                500 if "500" in grid_name else 1000,
            ],
            "stepPercent": 50 if "500" in grid_name else 100,
            "pointsPerCoefficient": round(len(multipliers) ** (1 / 6)),
            "combinations": len(multipliers),
        }
    for mode in ("keytao", "sanpin"):
        output["cases"][mode] = {}
        for grid_name, multipliers in grids.items():
            print(f"{mode}/{grid_name}: {len(multipliers):,} points", flush=True)
            output["cases"][mode][grid_name] = rank_grid(
                payload["cases"][mode], payload["references"][mode], baseline,
                multipliers, args.chunk_size,
            )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        mode: {
            grid_name: output["cases"][mode][grid_name]["winner"]
            for grid_name in grids
        }
        for mode in ("keytao", "sanpin")
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
