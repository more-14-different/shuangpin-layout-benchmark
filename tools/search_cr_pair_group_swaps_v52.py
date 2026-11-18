"""Fixed-onset, intact-group key exchanges from two published v5.2 centers."""

import concurrent.futures
import copy
import gzip
import itertools
import json
import sys

from ckt_v52_toned_kernel import TonedV52Scorer
from explore_cr_frontier_followup import paired_moves
from run_cr_anneal import ROOT, atomic_json
from search_cr_667_zero_carriers import CarrierSpace
from search_cr_lan_f19_combined import (
    group_exchanges,
    root_exchanges,
    single_root_moves,
)

WORK = ROOT / "research/.cache/cr-pair-group-swaps-v52"
OUTPUT = ROOT / "research/notes/2026-11-18-cr-pair-group-swaps-v52.json"
LEFT_LIMIT = 0.09032422256372921
RIGHT_LIMIT = 0.07468205050495597


def load(path):
    return json.loads(path.read_text(encoding="utf8"))


def main():
    regroup = "--root-regroup" in sys.argv
    work = ROOT / "research/.cache/cr-six-root-regroup-v52" if regroup else WORK
    output = (
        ROOT / "research/notes/2026-11-19-cr-six-root-regroup-v52.json"
        if regroup
        else OUTPUT
    )
    work.mkdir(parents=True, exist_ok=True)
    space = CarrierSpace(ROOT / "research/.cache/cr-lan-fixed-20261117/inputs")
    scorer = TonedV52Scorer(ROOT / "research/.cache/cr-76-aeo-v52/templates.bin", ROOT)
    origins = [
        load(ROOT / "research/notes/2026-11-18-cr-aeo-onsets-v52.json")["best"],
        load(ROOT / "research/notes/2026-11-18-cr-retroflex-top-v52.json")["best"],
    ]
    origins = {row["key"][:10]: row for row in origins}
    if regroup:
        previous = load(OUTPUT)
        wanted = [
            "c2e49137b9",
            "a2bf3baaa2",
            "c4f8088bf4",
            "5bd306d6ca",
            "37af224387",
            "5ac3f286b0",
        ]
        available = {r["key"][:10]: r for r in previous["selected"]}
        origins = {ident: available[ident] for ident in wanted}
    cache = load(work / "cache.json") if "--resume" in sys.argv else {}
    rounds = load(work / "rounds.json") if "--resume" in sys.argv else []

    def cache_key(origin, state):
        key = space.key(state)
        return origin + ":" + key if regroup else key

    def moves(state):
        if regroup:
            yield from single_root_moves(state)
            yield from root_exchanges(state)
        else:
            yield from group_exchanges(state)

    def eligible(row):
        m = row["metrics"]
        return (
            m["daily"] > 130
            and m["pinky"] <= LEFT_LIMIT + 1e-12
            and m["rightPinky"] <= RIGHT_LIMIT + 1e-12
        )

    def evaluate(row):
        row["metrics"].update(scorer.score(row["state"]))
        return row

    def batch(moves, stage):
        if any(r["stage"] == stage for r in rounds):
            return
        pending = {}
        for origin, label, state in moves:
            baseline = origins[origin]["state"]
            assert state["firstKeys"] == baseline["firstKeys"]
            if regroup:
                assert state["groupKeys"] == baseline["groupKeys"]
            else:
                assert state["partition"] == baseline["partition"]
                assert all(
                    sorted(a) == sorted(b)
                    for a, b in zip(state["groupKeys"], baseline["groupKeys"])
                )
            metrics = space.memory(state)
            if not metrics:
                continue
            key = space.key(state)
            address = cache_key(origin, state)
            if address in cache or address in pending:
                continue
            fixed_metrics = ["d", "guard"] if regroup else ["d", "m", "guard"]
            assert all(
                metrics[k] == origins[origin]["metrics"][k] for k in fixed_metrics
            )
            pending[address] = dict(
                key=key,
                origin=origin,
                label=label,
                state=state,
                metrics=metrics,
                stage=stage,
            )
        for row in pending.values():
            row["metrics"].update(space.daily(row["state"]))
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            for row in executor.map(evaluate, pending.values()):
                cache[cache_key(row["origin"], row["state"])] = row
        best = {
            origin: min(
                [r for r in cache.values() if r["origin"] == origin and eligible(r)],
                key=lambda r: r["metrics"]["cktV52"],
            )
            for origin in origins
        }
        record = dict(stage=stage, fresh=len(pending), total=len(cache), best=best)
        rounds.append(record)
        atomic_json(work / "cache.json", cache)
        atomic_json(work / "rounds.json", rounds)
        print(
            json.dumps(
                dict(
                    stage=stage,
                    fresh=len(pending),
                    total=len(cache),
                    best={
                        k: dict(key=r["key"][:10], **r["metrics"])
                        for k, r in best.items()
                    },
                )
            ),
            flush=True,
        )

    batch(
        ((origin, "baseline", row["state"]) for origin, row in origins.items()),
        "baselines",
    )

    def centers(origin):
        rows = sorted(
            [r for r in cache.values() if r["origin"] == origin],
            key=lambda r: r["metrics"]["cktV52"],
        )
        chosen = {}
        for target in [130, origins[origin]["metrics"]["daily"], 132]:
            within = [
                r for r in rows if eligible(r) and r["metrics"]["daily"] >= target
            ]
            if within:
                chosen[within[0]["key"]] = within[0]
        for slack in [0.005, 0.015]:
            within = [
                r
                for r in rows
                if eligible(r)
                and r["metrics"]["cktV52"]
                <= origins[origin]["metrics"]["cktV52"] + slack
            ]
            if within:
                best = max(within, key=lambda r: r["metrics"]["daily"])
                chosen[best["key"]] = best
        # Also expand a low-cost state below daily 130 to allow a compensating second step.
        near = [r for r in rows if r["metrics"]["daily"] > 128]
        if near:
            chosen[near[0]["key"]] = near[0]
        return list(chosen.values())[: 3 if regroup else 6]

    def single_swaps():
        for origin in origins:
            for center in centers(origin):
                for label, state in moves(center["state"]):
                    yield origin, label, state

    for index in range(5):
        batch(single_swaps(), f"group-swaps-{index+1}")

    def paired_swaps():
        for origin, base in origins.items():
            center = min(
                [r for r in cache.values() if r["origin"] == origin and eligible(r)],
                key=lambda r: r["metrics"]["cktV52"],
            )
            alternatives = []
            for label, state in moves(center["state"]):
                row = cache.get(cache_key(origin, state))
                if row:
                    alternatives.append(row)
            by_speed = sorted(alternatives, key=lambda r: r["metrics"]["cktV52"])[:30]
            by_daily = sorted(alternatives, key=lambda r: -r["metrics"]["daily"])[:15]
            selected = list({r["key"]: r for r in by_speed + by_daily}.values())
            for label, state in paired_moves(center["state"], selected):
                if all(
                    sorted(a) == sorted(b)
                    for a, b in zip(state["groupKeys"], center["state"]["groupKeys"])
                ):
                    yield origin, label, state

    batch(paired_swaps(), "paired-group-swaps")

    def three_group_cycles():
        for origin in origins:
            center = min(
                [r for r in cache.values() if r["origin"] == origin and eligible(r)],
                key=lambda r: r["metrics"]["cktV52"],
            )
            if regroup:
                er, v = [space.spec["roots"].index(root) for root in ["er", "v"]]
                for first, second in itertools.product(range(10), repeat=2):
                    state = copy.deepcopy(center["state"])
                    state["partition"][er] = first
                    state["partition"][v] = second
                    yield origin, f"er-v:{first}/{second}", state
                continue
            for groups in itertools.combinations(range(10), 3):
                for direction in [1, 2]:
                    for mask in range(1, 8):
                        state = copy.deepcopy(center["state"])
                        for region in range(3):
                            if mask & (1 << region):
                                old = [state["groupKeys"][region][g] for g in groups]
                                for i, g in enumerate(groups):
                                    state["groupKeys"][region][g] = old[
                                        (i + direction) % 3
                                    ]
                        yield origin, f"cycle:{groups}/{direction}/{mask}", state

    batch(three_group_cycles(), "three-group-cycles")
    for index in range(2):
        batch(single_swaps(), f"polish-{index+1}")
    results = {}
    chosen = {}
    for origin, base in origins.items():
        rows = sorted(
            [r for r in cache.values() if r["origin"] == origin and eligible(r)],
            key=lambda r: r["metrics"]["cktV52"],
        )
        frontier = []
        daily = -float("inf")
        for row in rows:
            if row["metrics"]["daily"] > daily + 1e-10:
                frontier.append(row)
                daily = row["metrics"]["daily"]
        same_daily = [
            r for r in rows if r["metrics"]["daily"] >= base["metrics"]["daily"]
        ]
        results[origin] = dict(
            baseline=base,
            best=rows[0],
            bestAtBaselineDaily=same_daily[0],
            frontier=frontier,
            scored=sum(r["origin"] == origin for r in cache.values()),
        )
        for row in [rows[0], same_daily[0], *centers(origin)]:
            chosen[row["key"]] = row
    report = dict(
        version=(
            "cr-six-root-regroup-v52-v1" if regroup else "cr-pair-group-swaps-v52-v1"
        ),
        policy=dict(word2="21", word3="213", word4="14"),
        shapeKeysByMeaning="AVUIO",
        toneKeysByTone="IVUAO",
        constraints=dict(
            maxD=2,
            fixedFirstKeys=True,
            fixedRootPartition=not regroup,
            fixedGroupKeys=regroup,
            fixedRegionalKeyMultisets=True,
            targetDailyStrictlyGreaterThan=130,
            leftLimit=LEFT_LIMIT,
            rightLimit=RIGHT_LIMIT,
        ),
        controls=[],
        selected=list(chosen.values()),
        frontier=[],
        results=results,
        rounds=rounds,
        scored=len(cache),
        scope="Five multi-center exchange rounds, compatible paired exchanges, all three-group cycles at the best centers, then two polish rounds; candidate scoring retains baseline auxiliary policy",
    )
    if regroup:
        report["scope"] = (
            "Six frozen keyboard maps; intact 18 roots repartitioned across ten nonempty groups; five multi-center local rounds, compatible paired moves, joint er/v placements and two polish rounds; onsets/group keys/auxiliary policy fixed, M lower unrestricted"
        )
    atomic_json(output, report)
    output.with_name(output.stem + "-scores.json.gz").write_bytes(
        gzip.compress(
            json.dumps(cache, ensure_ascii=False, separators=(",", ":")).encode(),
            mtime=0,
        )
    )
    print(
        json.dumps(
            dict(
                output=str(output),
                scored=len(cache),
                best={k: r["best"]["metrics"] for k, r in results.items()},
            )
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
