"""Enumerate retroflex placements with at least two on home row, then refine."""

import concurrent.futures
import copy
import gzip
import itertools
import json
import sys

from ckt_v52_toned_kernel import TonedV52Scorer
from run_cr_anneal import ROOT, atomic_json
from search_cr_667_zero_carriers import CarrierSpace
from search_cr_lan_aeo_heads import head_moves, compensated_head_moves
from search_cr_lan_f19_combined import (
    group_exchanges,
    root_exchanges,
    single_root_moves,
)

WORK = ROOT / "research/.cache/cr-retroflex-home-v52"
OUTPUT = ROOT / "research/notes/2026-11-18-cr-retroflex-home-v52.json"
HOME = set("ASDFGHJKL")
LEFT_LIMIT = 0.09032422256372921
RIGHT_LIMIT = 0.07468205050495597


def load(path):
    return json.loads(path.read_text(encoding="utf8"))


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    space = CarrierSpace(ROOT / "research/.cache/cr-lan-fixed-20261117/inputs")
    scorer = TonedV52Scorer(ROOT / "research/.cache/cr-76-aeo-v52/templates.bin", ROOT)
    previous = load(ROOT / "research/notes/2026-11-18-cr-aeo-onsets-v52.json")
    retroflex = [
        i for i, a in enumerate(space.f["atoms"]) if a["name"] in ["ch", "sh", "zh"]
    ]
    assert len(retroflex) == 3
    cache = load(WORK / "cache.json") if "--resume" in sys.argv else {}
    rounds = load(WORK / "rounds.json") if "--resume" in sys.argv else []

    def home_count(state):
        return sum(state["firstKeys"][i] in HOME for i in retroflex)

    def loads_ok(row):
        return (
            row["metrics"]["pinky"] <= LEFT_LIMIT + 1e-12
            and row["metrics"]["rightPinky"] <= RIGHT_LIMIT + 1e-12
        )

    def evaluate(row):
        row["metrics"].update(scorer.score(row["state"]))
        return row

    def batch(moves, stage):
        if any(r["stage"] == stage for r in rounds):
            return
        pending = {}
        for label, state in moves:
            m = space.memory(state)
            if not m or m["d"] > 2 or home_count(state) < 2:
                continue
            assert len(set(state["firstKeys"][20:23])) == 1
            key = space.key(state)
            if key not in cache and key not in pending:
                pending[key] = dict(
                    key=key, state=state, metrics=m, label=label, stage=stage
                )
        for row in pending.values():
            row["metrics"].update(space.daily(row["state"]))
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            for row in executor.map(evaluate, pending.values()):
                cache[row["key"]] = row
        target = sorted(
            [r for r in cache.values() if r["metrics"]["daily"] > 130],
            key=lambda r: r["metrics"]["cktV52"],
        )
        eligible = [r for r in target if loads_ok(r)]
        record = dict(
            stage=stage,
            fresh=len(pending),
            total=len(cache),
            best=None if not target else target[0],
            bestProduction=None if not eligible else eligible[0],
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
                    best=None if not target else target[0]["metrics"],
                    production=None if not eligible else eligible[0]["metrics"],
                )
            ),
            flush=True,
        )

    seed_rows = [
        previous["best"],
        previous["lowestCkt"],
        next(r for r in previous["frontier"] if r["metrics"]["daily"] > 131),
    ]
    seed_rows += [
        r
        for r in load(
            ROOT / "research/notes/2026-11-16-cr-stable-neighbors-finalists.json"
        )["layouts"]
        if r["key"].startswith("6a384")
    ]
    seeds = {space.key(row["state"]): row for row in seed_rows}
    assignments = [
        keys
        for keys in itertools.product(space.allowed_first, repeat=3)
        if sum(key in HOME for key in keys) >= 2
    ]

    def enumeration():
        for row in seeds.values():
            for keys in assignments:
                state = copy.deepcopy(row["state"])
                for index, key in zip(retroflex, keys):
                    state["firstKeys"][index] = key
                yield "retroflex:" + ",".join(keys) + "/seed:" + row["key"][:10], state

    batch(enumeration(), "retroflex-enumeration")

    def centers():
        rows = sorted(cache.values(), key=lambda r: r["metrics"]["cktV52"])
        chosen = {}
        for pool in [rows, [r for r in rows if loads_ok(r)]]:
            for target in [130, 132, 128, 0]:
                best = next((r for r in pool if r["metrics"]["daily"] > target), None)
                if best:
                    chosen[best["key"]] = best
        # Keep an outside-home retroflex basin even when the all-home seed wins.
        for count in [2, 3]:
            candidates = [
                r
                for r in rows
                if home_count(r["state"]) == count and r["metrics"]["daily"] > 128
            ]
            for row in candidates[:2]:
                chosen[row["key"]] = row
        return list(chosen.values())[:8]

    def neighbors(joint):
        for row in centers():
            state = row["state"]
            yield from head_moves(state, space)
            yield from compensated_head_moves(state, space)
            if joint:
                yield from group_exchanges(state)
                yield from root_exchanges(state)
                yield from single_root_moves(state)

    batch(neighbors(False), "ordinary-onset-compensation")
    batch(neighbors(True), "joint-refinement-1")
    batch(neighbors(True), "joint-refinement-2")
    rows = sorted(cache.values(), key=lambda r: r["metrics"]["cktV52"])
    target = [r for r in rows if r["metrics"]["daily"] > 130]
    production = [r for r in target if loads_ok(r)]
    selected = {r["key"]: r for r in target[:4] + production[:4] + centers()}
    outside = [r for r in target if home_count(r["state"]) == 2]
    outside_production = [r for r in outside if loads_ok(r)]
    for row in outside[:3]:
        selected[row["key"]] = row
    if outside_production:
        selected[outside_production[0]["key"]] = outside_production[0]
    frontier = []
    for pool in [target, production]:
        best_daily = -float("inf")
        for row in pool:
            if row["metrics"]["daily"] > best_daily + 1e-10:
                frontier.append(row)
                best_daily = row["metrics"]["daily"]
    report = dict(
        version="cr-retroflex-home-v52-v1",
        constraints=dict(maxD=2, maxM=None, aeoUnified=True, minRetroflexHome=2),
        policy=dict(word2="21", word3="213", word4="14"),
        shapeKeysByMeaning="AVUIO",
        toneKeysByTone="IVUAO",
        retroflexAtoms=[space.f["atoms"][i]["name"] for i in retroflex],
        homeKeys=sorted(HOME.intersection(space.allowed_first)),
        assignmentsPerSeed=len(assignments),
        seedStates=[r["state"] for r in seeds.values()],
        rounds=rounds,
        controls=[],
        selected=list(selected.values()),
        frontier=list({r["key"]: r for r in frontier}.values()),
        best=target[0],
        bestProduction=production[0] if production else None,
        bestWithExactlyTwoHome=outside[0] if outside else None,
        bestWithExactlyTwoHomeProduction=(
            outside_production[0] if outside_production else None
        ),
        lowestCkt=rows[0],
        counts=dict(
            scored=len(cache),
            above130=len(target),
            above130WithProductionLoads=len(production),
        ),
        scope="Full retroflex assignment enumeration on four fixed rhyme/onset seeds, then compensated ordinary-onset and two joint refinement rounds; D<=2 and at least two retroflex initials on home row throughout",
    )
    atomic_json(OUTPUT, report)
    OUTPUT.with_name(OUTPUT.stem + "-scores.json.gz").write_bytes(
        gzip.compress(
            json.dumps(cache, ensure_ascii=False, separators=(",", ":")).encode(),
            mtime=0,
        )
    )
    print(
        json.dumps(
            dict(output=str(OUTPUT), counts=report["counts"], best=report["best"])
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
