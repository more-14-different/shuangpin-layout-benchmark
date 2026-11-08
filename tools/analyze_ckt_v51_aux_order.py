#!/usr/bin/env python3
"""Rank a 21x26 scheme's 144 CKT v5.1 policies on the exact wide grid."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np


TRACKS = ("character", "word2", "word3", "word4")
WEIGHTS = {"character": 1, "word2": 3, "word3": 1, "word4": 1}
CURRENT = {"keytao": "12/21/14", "sanpin": "12/21/13"}
NAMES = {"keytao": "形笔辅", "sanpin": "调笔辅"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
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


def track_vectors(result: dict, baseline: dict) -> list[list[float]]:
    return [component_vector(result["tracks"][track], baseline) for track in TRACKS]


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


def make_grid() -> np.ndarray:
    count = 11**6
    quotient = np.arange(count, dtype=np.int32)
    grid = np.empty((count, 6), dtype=np.float64)
    for axis in range(5, -1, -1):
        grid[:, axis] = quotient % 11
        quotient //= 11
    grid *= 0.5
    return grid


def normalized_score(tracks: dict, reference: dict) -> float:
    power = sum(
        WEIGHTS[track]
        * (tracks[track]["effectiveMs"] / reference["tracks"][track]["effectiveMs"]) ** 4
        for track in TRACKS
    )
    return 10 * (power / sum(WEIGHTS.values())) ** 0.25


def rank_mode(
    mode: str,
    case: dict,
    reference: dict,
    baseline: dict,
    grid: np.ndarray,
    chunk_size: int,
) -> dict:
    keys = [result["policyKey"] for result in case["results"]]
    vectors = np.asarray(
        [track_vectors(result, baseline) for result in case["results"]], dtype=np.float64
    )
    reference_vectors = np.asarray(track_vectors(reference, baseline), dtype=np.float64)
    weights = np.asarray([WEIGHTS[track] for track in TRACKS], dtype=np.float64)
    count = len(keys)
    top1 = np.zeros(count, dtype=np.int64)
    top3 = np.zeros(count, dtype=np.int64)
    rank_sum = np.zeros(count, dtype=np.int64)
    worst_rank = np.zeros(count, dtype=np.int16)
    for start in range(0, len(grid), chunk_size):
        multipliers = grid[start : start + chunk_size]
        effective = vectors[:, :, 0][None, :, :] + np.einsum(
            "ba,pta->bpt", multipliers, vectors[:, :, 1:], optimize=True
        )
        reference_effective = reference_vectors[:, 0][None, :] + (
            multipliers @ reference_vectors[:, 1:].T
        )
        scores = np.sum(
            weights[None, None, :] * (effective / reference_effective[:, None, :]) ** 4,
            axis=2,
        )
        ranks = competition_ranks(scores)
        top1 += np.sum(ranks == 1, axis=0)
        top3 += np.sum(ranks <= 3, axis=0)
        rank_sum += np.sum(ranks, axis=0, dtype=np.int64)
        worst_rank = np.maximum(worst_rank, np.max(ranks, axis=0))
    points = len(grid)
    ranking = [
        {
            "policy": key,
            "top1Rate": float(top1[index] / points),
            "top3Rate": float(top3[index] / points),
            "meanRank": float(rank_sum[index] / points),
            "worstRank": int(worst_rank[index]),
        }
        for index, key in enumerate(keys)
    ]
    ranking.sort(
        key=lambda item: (
            item["meanRank"],
            -item["top3Rate"],
            -item["top1Rate"],
            item["worstRank"],
            item["policy"],
        )
    )
    baseline_effective = np.sum(vectors, axis=2)
    reference_baseline = np.sum(reference_vectors, axis=1)
    baseline_scores = 10 * (
        np.sum(
            weights[None, :] * (baseline_effective / reference_baseline) ** 4, axis=1
        )
        / sum(WEIGHTS.values())
    ) ** 0.25
    baseline_ranks = competition_ranks(baseline_scores[None, :])[0]
    baseline_order = np.argsort(baseline_scores, kind="stable")
    baseline_top10 = [
        {
            "policy": keys[index],
            "rank": int(baseline_ranks[index]),
            "normalizedCkt51": float(baseline_scores[index]),
        }
        for index in baseline_order[:10]
    ]
    robust = ranking[0]
    fixed = next(item for item in ranking if item["policy"] == CURRENT[mode])
    robust_result = next(
        result for result in case["results"] if result["policyKey"] == robust["policy"]
    )
    fixed_result = next(
        result for result in case["results"] if result["policyKey"] == CURRENT[mode]
    )
    print(
        f"{mode}: robust={robust['policy']} meanRank={robust['meanRank']:.6f}",
        file=sys.stderr,
    )
    return {
        "name": NAMES[mode],
        "robustPolicy": robust["policy"],
        "robust": robust,
        "fixedPolicy": CURRENT[mode],
        "fixed": fixed,
        "robustTop10": ranking[:10],
        "baselineTop10": baseline_top10,
        "robustScore": normalized_score(robust_result["tracks"], reference),
        "fixedScore": normalized_score(fixed_result["tracks"], reference),
        "robustTracks": robust_result["tracks"],
        "fixedTracks": fixed_result["tracks"],
    }


def pair_score(results: dict, field: str) -> float:
    power = 0.0
    for result in results.values():
        power += sum(
            WEIGHTS[track]
            * (
                result[field][track]["effectiveMs"]
                / result["referenceTracks"][track]["effectiveMs"]
            )
            ** 4
            for track in TRACKS
        )
    return 10 * (power / (2 * sum(WEIGHTS.values()))) ** 0.25


def main() -> None:
    args = parse_args()
    if args.chunk_size < 1:
        raise ValueError("--chunk-size must be positive")
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    supported = {
        "ckt5.1-single-21x26-aux-order-components-2",
        "ckt5.1-single-native-aux-order-components-3",
    }
    if payload["version"] not in supported:
        raise ValueError(f"unsupported input version: {payload['version']}")
    if payload["contract"]["name"] != "native-four-code-top-six-code":
        raise ValueError("this analyzer only supports the 21x26 four-code-top contract")
    grid = make_grid()
    results = {}
    for mode in ("keytao", "sanpin"):
        reference = payload["references"][mode]
        result = rank_mode(
            mode,
            payload["cases"][mode],
            reference,
            payload["baselineCostsMs"],
            grid,
            args.chunk_size,
        )
        result["referenceTracks"] = reference["tracks"]
        results[mode] = result
    output = {
        "version": (
            "ckt5.1-single-native-aux-order-robustness-3"
            if payload["version"].endswith("components-3")
            else "ckt5.1-single-21x26-aux-order-robustness-2"
        ),
        "id": payload["id"],
        "contract": payload["contract"],
        "lengthBalance": payload["lengthBalance"],
        "corpus": payload["corpus"],
        "trackWeights": WEIGHTS,
        "baselineCostsMs": payload["baselineCostsMs"],
        "independentGrid": {
            "rangePercent": [0, 500],
            "stepPercent": 50,
            "coefficients": [
                "firstAuxMs",
                "secondAuxMs",
                "thirdAuxMs",
                "selectionDecisionMs",
                "scanPerCandidateMs",
                "pageActionMs",
            ],
            "pointsPerCoefficient": 11,
            "combinations": 11**6,
        },
        "robustSelection": (
            "lowest mean competition rank; ties use higher top-three rate, higher "
            "top-one rate, lower worst rank, then lexical policy order"
        ),
        "referencePolicies": payload["referencePolicies"],
        "cases": results,
        "normalized": {
            "robustPairScore": pair_score(results, "robustTracks"),
            "fixedPairScore": pair_score(results, "fixedTracks"),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(args.output)


if __name__ == "__main__":
    main()
