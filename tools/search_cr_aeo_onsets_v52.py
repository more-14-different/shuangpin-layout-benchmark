"""Explore onset basins with D<=2, unified AEO and unrestricted M."""

import concurrent.futures
import gzip
import json
import sys

from ckt_v52_toned_kernel import TonedV52Scorer
from run_cr_anneal import ROOT, atomic_json
from search_cr_667_zero_carriers import CarrierSpace
from search_cr_lan_aeo_heads import head_moves, compensated_head_moves
from explore_cr_frontier_followup import paired_moves
from search_cr_lan_f19_combined import (
    group_exchanges,
    root_exchanges,
    single_root_moves,
)

WORK = ROOT / "research/.cache/cr-aeo-onsets-v52"
OUTPUT = ROOT / "research/notes/2026-11-18-cr-aeo-onsets-v52.json"
LEFT_LIMIT = 0.09032422256372921
RIGHT_LIMIT = 0.07468205050495597


def load(path):
    return json.loads(path.read_text(encoding="utf8"))


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    space = CarrierSpace(ROOT / "research/.cache/cr-lan-fixed-20261117/inputs")
    scorer = TonedV52Scorer(ROOT / "research/.cache/cr-76-aeo-v52/templates.bin", ROOT)
    previous = load(ROOT / "research/notes/2026-11-18-cr-76-aeo-v52.json")
    cache = {}
    rounds = []
    resume = "--resume" in sys.argv
    if resume:
        cache = load(WORK / "cache.json")
        rounds = load(WORK / "rounds.json")

    def valid_loads(row):
        m = row["metrics"]
        return (
            m["pinky"] <= LEFT_LIMIT + 1e-12 and m["rightPinky"] <= RIGHT_LIMIT + 1e-12
        )

    def score(row):
        row["metrics"].update(scorer.score(row["state"]))
        return row

    def batch(moves, stage):
        if any(r["stage"] == stage for r in rounds):
            return
        pending = {}
        for label, state in moves:
            metrics = space.memory(state)
            if not metrics or metrics["d"] > 2:
                continue
            assert len(set(state["firstKeys"][20:23])) == 1
            key = space.key(state)
            if key in cache or key in pending:
                continue
            pending[key] = dict(
                key=key, state=state, metrics=metrics, label=label, stage=stage
            )
        for row in pending.values():
            row["metrics"].update(space.daily(row["state"]))
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            for row in executor.map(score, pending.values()):
                cache[row["key"]] = row
        above = [r for r in cache.values() if r["metrics"]["daily"] > 130]
        best = min(above, key=lambda r: r["metrics"]["cktV52"]) if above else None
        production = [r for r in above if valid_loads(r)]
        best_production = (
            min(production, key=lambda r: r["metrics"]["cktV52"])
            if production
            else None
        )
        record = dict(
            stage=stage,
            fresh=len(pending),
            total=len(cache),
            best=best,
            bestProduction=best_production,
        )
        rounds.append(record)
        atomic_json(WORK / "cache.json", cache)
        atomic_json(WORK / "rounds.json", rounds)
        print(
            json.dumps(
                dict(
                    stage=stage,
                    fresh=len(pending),
                    total=len(cache),
                    best=None if best is None else best["metrics"],
                    production=(
                        None if best_production is None else best_production["metrics"]
                    ),
                )
            ),
            flush=True,
        )

    def seeds():
        for target in [0, 126, 128, 130, 132]:
            rows = [r for r in previous["frontier"] if r["metrics"]["daily"] > target]
            if rows:
                r = min(rows, key=lambda r: r["metrics"]["cktV52"])
                yield "previous:" + r["key"][:10], r["state"]
        archive = json.loads(
            gzip.decompress(
                (
                    ROOT / "research/notes/2026-11-18-cr-lan-aeo-heads-scores.json.gz"
                ).read_bytes()
            )
        )
        rows = [r for r in archive.values() if r["metrics"]["d"] <= 2]
        for target in [0, 128, 130, 132]:
            choices = [r for r in rows if r["metrics"]["daily"] > target]
            for row in sorted(choices, key=lambda r: r["metrics"]["ckt"])[:3]:
                yield "archive:" + row["key"][:10], row["state"]

    def centers():
        rows = list(cache.values())
        chosen = {}
        for pool in [rows, [r for r in rows if valid_loads(r)]]:
            for target in [130, 132, 128, 0]:
                within = [r for r in pool if r["metrics"]["daily"] > target]
                if within:
                    best = min(within, key=lambda r: r["metrics"]["cktV52"])
                    chosen[best["key"]] = best
        # Preserve different displaced-initial pairs to cross k/l's local basin.
        pairs = {}
        for row in sorted(rows, key=lambda r: r["metrics"]["cktV52"]):
            if row["metrics"]["daily"] <= 128:
                continue
            signature = tuple(
                i
                for i, a in enumerate(space.f["atoms"])
                if len(a["initial"]) == 1
                and a["initial"] != "_"
                and row["state"]["firstKeys"][i] != a["baselineKey"]
            )
            if signature not in pairs:
                pairs[signature] = row
        for row in list(pairs.values())[:4]:
            chosen[row["key"]] = row
        return list(chosen.values())[:10]

    def neighbors(selected, joint):
        for row in selected:
            state = row["state"]
            yield from head_moves(state, space)
            yield from compensated_head_moves(state, space)
            if joint:
                yield from group_exchanges(state)
                yield from root_exchanges(state)
                yield from single_root_moves(state)

    batch(seeds(), "seeds")
    for index in range(4):
        batch(neighbors(centers(), index >= 2), f"onsets-{index+1}")

    def paired_onsets():
        for center in centers()[:6]:
            state = center["state"]
            alternatives = [
                r
                for r in cache.values()
                if r["state"]["partition"] == state["partition"]
                and r["state"]["groupKeys"] == state["groupKeys"]
                and r["state"]["firstKeys"] != state["firstKeys"]
            ]
            by_speed = sorted(alternatives, key=lambda r: r["metrics"]["cktV52"])[:20]
            by_daily = sorted(alternatives, key=lambda r: -r["metrics"]["daily"])[:12]
            unique = {r["key"]: r for r in by_speed + by_daily}
            yield from paired_moves(state, list(unique.values()))

    batch(paired_onsets(), "paired-onsets")

    def free_region_keys():
        import copy

        for center in centers()[:6]:
            for region, spec in enumerate(space.f["toneRegions"]):
                for group, old in enumerate(center["state"]["groupKeys"][region]):
                    for key in spec["keys"]:
                        if key != old:
                            state = copy.deepcopy(center["state"])
                            state["groupKeys"][region][group] = key
                            yield f"region-key:{region}/{group}>{key}", state

    batch(free_region_keys(), "unrestricted-region-keys")
    batch(neighbors(centers()[:6], True), "polish")

    def distant_seeds():
        for filename in [
            "2026-11-16-cr-stable-neighbors-finalists.json",
            "2026-11-17-cr-667-neighbors-finalists.json",
        ]:
            for row in load(ROOT / "research/notes" / filename)["layouts"]:
                state = row["state"]
                if len(set(state["firstKeys"][20:23])) == 1:
                    yield "distant:" + row["key"][:10], state

    batch(distant_seeds(), "distant-seeds")
    distant = [r for r in cache.values() if r["stage"] == "distant-seeds"]
    batch(neighbors(distant, False), "distant-onsets")
    batch(neighbors(centers(), True), "distant-joint")
    rows = sorted(cache.values(), key=lambda r: r["metrics"]["cktV52"])
    target = [r for r in rows if r["metrics"]["daily"] > 130]
    production = [r for r in target if valid_loads(r)]
    selected = {r["key"]: r for r in target[:5] + production[:5] + centers()}
    frontier = []
    for pool in [target, production]:
        daily = -float("inf")
        for row in pool:
            if row["metrics"]["daily"] > daily + 1e-10:
                frontier.append(row)
                daily = row["metrics"]["daily"]
    output = dict(
        version="cr-aeo-onsets-unrestricted-M-v52-v1",
        constraints=dict(
            maxD=2, maxM=None, aeoUnified=True, targetDailyStrictlyGreaterThan=130
        ),
        policy=dict(word2="21", word3="213", word4="14"),
        shapeKeysByMeaning="AVUIO",
        toneKeysByTone="IVUAO",
        controls=[r for r in cache.values() if r["stage"] == "seeds"],
        selected=list(selected.values()),
        frontier=list({r["key"]: r for r in frontier}.values()),
        rounds=rounds,
        best=target[0] if target else None,
        lowestCkt=rows[0],
        bestProduction=production[0] if production else None,
        counts=dict(
            scored=len(cache),
            above130=len(target),
            above130WithProductionLoads=len(production),
        ),
        loadComparison=dict(leftLimit=LEFT_LIMIT, rightLimit=RIGHT_LIMIT),
        scope="Four multi-center rounds, paired onset changes, unrestricted regional key assignments, joint polish and distant published onset basins; M and guard unrestricted; production load limits reported separately",
    )
    atomic_json(OUTPUT, output)
    OUTPUT.with_name(OUTPUT.stem + "-scores.json.gz").write_bytes(
        gzip.compress(
            json.dumps(cache, ensure_ascii=False, separators=(",", ":")).encode(),
            mtime=0,
        )
    )
    print(
        json.dumps(
            dict(
                output=str(OUTPUT),
                counts=output["counts"],
                best=output["best"],
                production=output["bestProduction"],
            )
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
