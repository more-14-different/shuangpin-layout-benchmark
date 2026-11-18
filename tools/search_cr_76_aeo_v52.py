"""Deterministic constrained neighborhood search from 76f30871bf with unified AEO."""

import concurrent.futures
import copy
import gzip
import json
import sys
from pathlib import Path

from ckt_v52_toned_kernel import TonedV52Scorer
from run_cr_anneal import ROOT, atomic_json
from search_cr_667_zero_carriers import CarrierSpace
from search_cr_lan_aeo_heads import head_moves, compensated_head_moves
from search_cr_lan_f19_combined import (
    group_exchanges,
    root_exchanges,
    single_root_moves,
)

WORK = ROOT / "research/.cache/cr-76-aeo-v52"
OUTPUT = ROOT / "research/notes/2026-11-18-cr-76-aeo-v52.json"
POLICY = dict(word2="21", word3="213", word4="14")
LEFT_LIMIT = 0.09032422256372921
RIGHT_LIMIT = 0.07468205050495597


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    space = CarrierSpace(ROOT / "research/.cache/cr-lan-fixed-20261117/inputs")
    baseline = json.loads(
        (ROOT / "research/config/cr-76-aeo-v52.json").read_text(encoding="utf8")
    )["baseline"]
    scorer = TonedV52Scorer(WORK / "templates.bin", ROOT)
    calibration = scorer.score(baseline["state"])
    assert abs(calibration["cktV52"] - baseline["score"]) < 1e-9
    aeo = [
        i
        for i, a in enumerate(space.f["atoms"])
        if a["name"] in ["zero-A", "zero-E", "zero-O"]
    ]
    extend = "--extend-guard" in sys.argv
    cache = (
        json.loads((WORK / "cache.json").read_text(encoding="utf8")) if extend else {}
    )
    rounds = json.loads(OUTPUT.read_text(encoding="utf8"))["rounds"] if extend else []
    guard_limit = 24

    def eligible(row):
        return (
            row["metrics"]["pinky"] <= LEFT_LIMIT + 1e-12
            and row["metrics"]["rightPinky"] <= RIGHT_LIMIT + 1e-12
        )

    def evaluate(candidate):
        candidate["metrics"].update(scorer.score(candidate["state"]))
        return candidate

    def batch(moves, name):
        pending = {}
        for label, state in moves:
            metrics = space.memory(state)
            if (
                not metrics
                or metrics["d"] > 2
                or metrics["m"] > 22
                or (guard_limit is not None and metrics["guard"] > guard_limit)
            ):
                continue
            assert len({state["firstKeys"][i] for i in aeo}) == 1
            key = space.key(state)
            if key in cache or key in pending:
                continue
            pending[key] = dict(
                key=key, state=state, metrics=metrics, label=label, stage=name
            )
        for row in pending.values():
            row["metrics"].update(space.daily(row["state"]))
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            for row in executor.map(evaluate, pending.values()):
                cache[row["key"]] = row
        rounds.append(dict(stage=name, fresh=len(pending), total=len(cache)))
        atomic_json(WORK / "cache.json", cache)
        print(json.dumps(rounds[-1]), flush=True)

    def controls():
        for key in space.allowed_first:
            state = copy.deepcopy(baseline["state"])
            for index in aeo:
                state["firstKeys"][index] = key
            yield "AEO>" + key, state

    def centers(limit=6):
        rows = [row for row in cache.values() if eligible(row)]
        chosen = {}
        # Maintain distinct speed/daily tradeoffs instead of a single weighted objective.
        for budget in [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08]:
            within = [
                r
                for r in rows
                if r["metrics"]["cktV52"] <= calibration["cktV52"] + budget
            ]
            if within:
                best = min(
                    within,
                    key=lambda r: (-r["metrics"]["daily"], r["metrics"]["cktV52"]),
                )
                chosen[best["key"]] = best
        for target in [124, 126, 128, 130]:
            within = [r for r in rows if r["metrics"]["daily"] >= target]
            if within:
                best = min(within, key=lambda r: r["metrics"]["cktV52"])
                chosen[best["key"]] = best
        return list(chosen.values())[:limit]

    def neighborhood(selected):
        for center in selected:
            state = center["state"]
            for operator in [group_exchanges, root_exchanges]:
                yield from operator(state)
            yield from single_root_moves(state)
            yield from head_moves(state, space)
            yield from compensated_head_moves(state, space)

    if not extend:
        batch(controls(), "AEO-controls")
    controls_rows = [r for r in cache.values() if r["stage"] == "AEO-controls"]
    # First expand several different carrier keys, even if initial CKT is worse.
    initial = sorted(
        [r for r in controls_rows if eligible(r)], key=lambda r: r["metrics"]["cktV52"]
    )[:4]
    if not extend:
        for round_number in range(3):
            batch(
                neighborhood(initial if round_number == 0 else centers()),
                f"joint-{round_number+1}",
            )
    # The requested constraint concerns the lower M count. Check one additional
    # neighborhood without imposing a separate conservative guard budget.
    guard_limit = None
    batch(neighborhood(centers()), "guard-relaxed")
    rows = sorted(
        [r for r in cache.values() if eligible(r)], key=lambda r: r["metrics"]["cktV52"]
    )
    frontier = []
    best_daily = -float("inf")
    for row in rows:
        if row["metrics"]["daily"] > best_daily + 1e-10:
            frontier.append(row)
            best_daily = row["metrics"]["daily"]
    output = dict(
        version="cr-76-unified-aeo-v52-v1",
        baseline=baseline,
        calibration=calibration,
        constraints=dict(maxM=22, maxD=2, leftPinky=LEFT_LIMIT, rightPinky=RIGHT_LIMIT),
        policy=POLICY,
        shapeKeysByMeaning="AVUIO",
        toneKeysByTone="IVUAO",
        controls=controls_rows,
        rounds=rounds,
        frontier=frontier,
        selected=centers(20),
        counts=dict(scored=len(cache), loadEligible=len(rows)),
        scope="Three deterministic rounds with guard<=24, then one round without a guard budget; intact roots, original regional key multisets; all onset units movable with unified AEO",
    )
    atomic_json(OUTPUT, output)
    archive = OUTPUT.with_name(OUTPUT.stem + "-scores.json.gz")
    archive.write_bytes(
        gzip.compress(
            json.dumps(cache, ensure_ascii=False, separators=(",", ":")).encode("utf8"),
            mtime=0,
        )
    )
    print(
        json.dumps(
            dict(
                output=str(OUTPUT),
                counts=output["counts"],
                frontier=[dict(key=r["key"][:10], **r["metrics"]) for r in frontier],
            )
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
