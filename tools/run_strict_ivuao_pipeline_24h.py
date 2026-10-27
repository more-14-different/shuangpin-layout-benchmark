#!/usr/bin/env python3
"""
tools/run_strict_ivuao_pipeline_24h.py

Automated orchestrator for 21x21 Strict IVUAO simulated annealing exploration (~24 hours).
Sequentially explores cumulative thresholds:
  Level 1: M <= 44 / D <= 4
  Level 2: M <= 43 / D <= 3
  Level 3: M <= 42 / D <= 2
  Level 4: M <= 41 / D <= 1
  Level 5: M <= 40 / D == 0
  Level 6: M <= 40 / D == 0 prodgate (full production ergonomic gates)

Key guarantees:
- Production IVUAO order [8, 21, 20, 0, 14] strictly preserved everywhere.
- Inter-stage seed chaining: Each stage uses the newly discovered states from the preceding stage.
- Independent output roots for each stage, preserving SQLite archives and checkpoints.
- Full restartability / crash-resilience.
- Dynamic throughput adaptation to fill the ~24-hour exploration budget.
- Automatic production screening and Hamming radius 5 basin clustering upon completion.
"""

import argparse
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

PRODUCTION_TONE = bytes([8, 21, 20, 0, 14])
PRODUCTION_BASELINE = {
    "id": "R9-21X21-M40-02",
    "cktV4": 9.936905708592157,
    "maxMemory": 40,
    "maxD": 0,
    "maxV": 5,
    "maxRpS2": 0.0418079455791114,
    "maxRp": 0.05104491472386687,
    "minHomeFloor": 0.3507563825435487,
    "maxW": 0.03623226230403664,
    "maxY": 0.06868516416255256,
    "minMxScore": 140.8422565188559,
    "orderedMapping": "IVUAO",
}
RUNTIME_GUARD_EPSILON = 1e-12

STAGE_SPECS = [
    {
        "tier": "m44d4",
        "label": "M<=44 / D<=4",
        "maxMemory": 44,
        "maxD": 4,
        "maxV": None,
        "prodgate": False,
        "baseSeed": 24214400,
        "defaultGens": 80,
    },
    {
        "tier": "m43d3",
        "label": "M<=43 / D<=3",
        "maxMemory": 43,
        "maxD": 3,
        "maxV": None,
        "prodgate": False,
        "baseSeed": 24214300,
        "defaultGens": 80,
    },
    {
        "tier": "m42d2",
        "label": "M<=42 / D<=2",
        "maxMemory": 42,
        "maxD": 2,
        "maxV": None,
        "prodgate": False,
        "baseSeed": 24214200,
        "defaultGens": 80,
    },
    {
        "tier": "m41d1",
        "label": "M<=41 / D<=1",
        "maxMemory": 41,
        "maxD": 1,
        "maxV": None,
        "prodgate": False,
        "baseSeed": 24214100,
        "defaultGens": 80,
    },
    {
        "tier": "m40d0",
        "label": "M<=40 / D=0",
        "maxMemory": 40,
        "maxD": 0,
        "maxV": None,
        "prodgate": False,
        "baseSeed": 24214000,
        "defaultGens": 100,
    },
    {
        "tier": "m40d0-prodgate",
        "label": "M<=40 / D=0 ProdGate",
        "maxMemory": 40,
        "maxD": 0,
        "maxV": 5,
        "prodgate": True,
        "baseSeed": 25214000,
        "defaultGens": 350,  # Will be dynamically refined by budget
    },
]


def json_write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def decode_layout(state_key: bytes, layout_id: str) -> dict:
    if len(state_key) != 69:
        raise ValueError(f"invalid state key length {len(state_key)}")
    return {
        "id": layout_id,
        "capacity": list(state_key[:2]),
        "headKeys": list(state_key[2:29]),
        "finalKeys": list(state_key[29:64]),
        "tone": list(state_key[64:69]),
    }


def hamming(left: bytes, right: bytes, stop_after: int | None = None) -> int:
    distance = 0
    for a, b in zip(left, right):
        if a != b:
            distance += 1
            if stop_after is not None and distance > stop_after:
                return distance
    return distance


def row_to_state(row: sqlite3.Row, tier: str) -> dict:
    ergonomics = json.loads(row["ergonomics_json"])
    loads = ergonomics["loads"]
    return {
        "stateKeyBytes": bytes(row["state_key"]),
        "stateKey": bytes(row["state_key"]).hex(),
        "layoutId": row["layout_id"] if "layout_id" in row.keys() else "unknown",
        "cktV4": row["ckt_v4"],
        "memory": row["memory"],
        "displacedInitials": row["displaced_initials"],
        "displacedVowels": row["displaced_vowels"],
        "rpS2": loads.get("rp_s2", row["rp_max"]),
        "rpMax": row["rp_max"],
        "homeFloor": row["home_floor"],
        "wMax": loads.get("w_max", 0.0),
        "yMax": loads.get("y_max", 0.0),
        "mxScore": row["mx_score"],
        "firstSeenGeneration": row["first_seen_generation"],
        "sourceTier": tier,
    }


def public_state(state: dict) -> dict:
    return {key: value for key, value in state.items() if key != "stateKeyBytes"}


def guard_failures(state: dict) -> dict:
    failures = {}
    checks = (
        ("memory", state["memory"], PRODUCTION_BASELINE["maxMemory"], "max"),
        ("displacedInitials", state["displacedInitials"], PRODUCTION_BASELINE["maxD"], "max"),
        ("displacedVowels", state["displacedVowels"], PRODUCTION_BASELINE["maxV"], "max"),
        ("rpS2", state["rpS2"], PRODUCTION_BASELINE["maxRpS2"], "max"),
        ("rpMax", state["rpMax"], PRODUCTION_BASELINE["maxRp"], "max"),
        ("homeFloor", state["homeFloor"], PRODUCTION_BASELINE["minHomeFloor"], "min"),
        ("wMax", state["wMax"], PRODUCTION_BASELINE["maxW"], "max"),
        ("yMax", state["yMax"], PRODUCTION_BASELINE["maxY"], "max"),
        ("mxScore", state["mxScore"], PRODUCTION_BASELINE["minMxScore"], "min"),
    )
    for name, actual, limit, direction in checks:
        failed = actual > limit if direction == "max" else actual < limit
        if failed:
            relative = actual / limit - 1 if direction == "max" else limit / actual - 1
            failures[name] = {"actual": actual, "limit": limit, "relative": relative}
    return failures


def choose_diverse(states: list[dict], count: int, max_ckt: float | None = None) -> list[dict]:
    ordered = sorted(states, key=lambda state: (state["cktV4"], state["stateKey"]))
    selected = ordered[: min(3, len(ordered))]
    used = {state["stateKey"] for state in selected}
    candidates = [state for state in ordered if max_ckt is None or state["cktV4"] <= max_ckt]
    while len(selected) < count:
        remaining = [state for state in candidates if state["stateKey"] not in used]
        if not remaining:
            break
        chosen = max(
            remaining,
            key=lambda state: (
                min(hamming(state["stateKeyBytes"], prior["stateKeyBytes"]) for prior in selected),
                -state["cktV4"],
            ),
        )
        selected.append(chosen)
        used.add(chosen["stateKey"])
    return selected


def choose_seeds_for_tier(
    source_dbs: list[Path],
    target_m: int,
    target_d: int,
    tier_label: str,
    output_dir: Path,
) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    rows_by_key = {}
    for db in source_dbs:
        if not db.exists():
            continue
        con = sqlite3.connect(db)
        con.row_factory = sqlite3.Row
        cur = con.execute(
            "SELECT state_key, ckt_v4, memory, displaced_initials, displaced_vowels, "
            "rp_max, home_floor, mx_score, ergonomics_json, first_seen_generation FROM states "
            "WHERE memory <= ? AND displaced_initials <= ? AND substr(state_key, 65, 5) = ? "
            "ORDER BY ckt_v4 ASC",
            (target_m, target_d, PRODUCTION_TONE),
        )
        for r in cur.fetchall():
            k = bytes(r["state_key"])
            if k not in rows_by_key or r["ckt_v4"] < rows_by_key[k]["ckt_v4"]:
                rows_by_key[k] = r
        con.close()

    rows = list(rows_by_key.values())
    if not rows:
        raise RuntimeError(f"No valid states found in source DBs for M<={target_m}, D<={target_d}")

    # Standard 8-seed policy
    selected: list[tuple[str, sqlite3.Row]] = []
    used: set[bytes] = set()

    def add(reason: str, ordered: list[sqlite3.Row]) -> None:
        for row in ordered:
            k = bytes(row["state_key"])
            if k not in used:
                used.add(k)
                selected.append((reason, row))
                return

    add("best-ckt", sorted(rows, key=lambda r: (r["ckt_v4"], r["state_key"])))
    add("lowest-memory", sorted(rows, key=lambda r: (r["memory"], r["ckt_v4"], r["state_key"])))
    add("lowest-displaced-initials", sorted(rows, key=lambda r: (r["displaced_initials"], r["ckt_v4"], r["state_key"])))
    add("lowest-right-pinky", sorted(rows, key=lambda r: (r["rp_max"], r["ckt_v4"], r["state_key"])))
    add("highest-home-floor", sorted(rows, key=lambda r: (-r["home_floor"], r["ckt_v4"], r["state_key"])))
    add("highest-moving-hand", sorted(rows, key=lambda r: (-r["mx_score"], r["ckt_v4"], r["state_key"])))

    # Best production balanced if any
    safe_rows = []
    for r in rows:
        ergo = json.loads(r["ergonomics_json"])["loads"]
        if (
            r["rp_max"] <= PRODUCTION_BASELINE["maxRp"]
            and r["home_floor"] >= PRODUCTION_BASELINE["minHomeFloor"]
            and r["mx_score"] >= PRODUCTION_BASELINE["minMxScore"]
            and ergo.get("w_max", 0.0) <= PRODUCTION_BASELINE["maxW"]
            and ergo.get("y_max", 0.0) <= PRODUCTION_BASELINE["maxY"]
        ):
            safe_rows.append(r)
    add("best-production-balanced", sorted(safe_rows, key=lambda r: (r["ckt_v4"], r["state_key"])))

    # Fill remaining using novel basin (max min Hamming distance)
    while len(selected) < 8:
        candidates = [row for row in rows if bytes(row["state_key"]) not in used]
        if not candidates:
            break
        candidate = max(
            candidates[:4096],
            key=lambda row: (
                min(hamming(bytes(row["state_key"]), bytes(chosen["state_key"])) for _, chosen in selected),
                -row["ckt_v4"],
            ),
        )
        add("novel-basin", [candidate])

    if len(selected) < 8:
        raise RuntimeError(f"Could not select 8 seeds for {tier_label}, only got {len(selected)}")

    manifest_seeds = []
    seed_paths = []
    for rank, (reason, row) in enumerate(selected, 1):
        filename = f"seed-{rank:02d}-{reason}.json"
        target_path = output_dir / filename
        layout = decode_layout(bytes(row["state_key"]), f"strict-ivuao-{tier_label}-seed-{rank:02d}-{reason}")
        json_write(target_path, layout)
        seed_paths.append(target_path.as_posix())
        manifest_seeds.append(
            {
                "rank": rank,
                "reason": reason,
                "stateKey": bytes(row["state_key"]).hex(),
                "cktV4": row["ckt_v4"],
                "memory": row["memory"],
                "displacedInitials": row["displaced_initials"],
                "displacedVowels": row["displaced_vowels"],
                "rpMax": row["rp_max"],
                "homeFloor": row["home_floor"],
                "mxScore": row["mx_score"],
                "filename": filename,
            }
        )

    manifest = {
        "version": "ckt-v4-strict-ivuao-stage-seeds-1",
        "orderedMapping": "IVUAO",
        "tier": tier_label,
        "guards": {"maxMemory": target_m, "maxD": target_d},
        "seeds": manifest_seeds,
    }
    json_write(output_dir / "manifest.json", manifest)
    return seed_paths


def choose_seeds_for_prodgate(
    source_dbs: list[Path],
    output_dir: Path,
) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    all_states_by_key = {}
    for db in source_dbs:
        if not db.exists():
            continue
        con = sqlite3.connect(db)
        con.row_factory = sqlite3.Row
        cur = con.execute(
            "SELECT state_key, layout_id, ckt_v4, memory, displaced_initials, displaced_vowels, "
            "rp_max, home_floor, mx_score, ergonomics_json, first_seen_generation FROM states "
            "WHERE memory <= 40 AND displaced_initials = 0 AND displaced_vowels <= 5 "
            "AND substr(state_key, 65, 5) = ? ORDER BY ckt_v4 ASC",
            (PRODUCTION_TONE,),
        )
        for r in cur.fetchall():
            st = row_to_state(r, db.parent.name)
            k = st["stateKeyBytes"]
            if k not in all_states_by_key or st["cktV4"] < all_states_by_key[k]["cktV4"]:
                all_states_by_key[k] = st
        con.close()

    candidates = list(all_states_by_key.values())
    safe_states = [s for s in candidates if not guard_failures(s)]
    print(f"ProdGate seed pool: {len(candidates)} M40D0V5 states, {len(safe_states)} strictly pass all guards")

    # If safe states >= 8, choose diverse among them
    if len(safe_states) >= 8:
        chosen_states = choose_diverse(safe_states, 8, PRODUCTION_BASELINE["cktV4"] + 0.75)
    else:
        # Sort candidates by (number of failed guards, violation score, cktV4)
        def score_state(s):
            fails = guard_failures(s)
            viol = sum(v["relative"] for v in fails.values())
            return (len(fails), viol, s["cktV4"])
        ordered = sorted(candidates, key=score_state)
        chosen_states = ordered[:8]

    manifest_seeds = []
    seed_paths = []
    for rank, st in enumerate(chosen_states, 1):
        filename = f"seed-{rank:02d}-production-safe.json"
        target_path = output_dir / filename
        layout = decode_layout(st["stateKeyBytes"], f"strict-ivuao-prodgate-seed-{rank:02d}")
        json_write(target_path, layout)
        seed_paths.append(target_path.as_posix())
        manifest_seeds.append(
            {
                "rank": rank,
                "stateKey": st["stateKey"],
                "metrics": public_state(st),
                "filename": filename,
            }
        )

    manifest = {
        "version": "ckt-v4-strict-ivuao-production-gate-seeds-1",
        "productionBaseline": PRODUCTION_BASELINE,
        "orderedMapping": "IVUAO",
        "seeds": manifest_seeds,
    }
    json_write(output_dir / "manifest.json", manifest)
    return seed_paths


def make_relative(p: Path, repo: Path) -> str:
    try:
        return p.resolve().relative_to(repo.resolve()).as_posix()
    except Exception:
        return p.as_posix()


def build_config(
    repo: Path,
    spec: dict,
    seed_paths: list[str],
    output_root: Path,
    config_path: Path,
    generations: int,
) -> None:
    rel_seed_paths = [make_relative(Path(sp), repo) for sp in seed_paths]
    rel_output_root = make_relative(output_root, repo)
    guards = {
        "maxMemory": spec["maxMemory"],
        "maxD": spec["maxD"],
        "maxV": spec["maxV"],
        "maxRpS2": None,
        "maxRp": None,
        "maxW": None,
        "maxY": None,
        "minHomeFloor": None,
        "minMxScore": None,
    }
    if spec["prodgate"]:
        guards["maxRpS2"] = PRODUCTION_BASELINE["maxRpS2"] + RUNTIME_GUARD_EPSILON
        guards["maxRp"] = PRODUCTION_BASELINE["maxRp"] + RUNTIME_GUARD_EPSILON
        guards["maxW"] = PRODUCTION_BASELINE["maxW"] + RUNTIME_GUARD_EPSILON
        guards["maxY"] = PRODUCTION_BASELINE["maxY"] + RUNTIME_GUARD_EPSILON
        guards["minHomeFloor"] = PRODUCTION_BASELINE["minHomeFloor"] - RUNTIME_GUARD_EPSILON
        guards["minMxScore"] = PRODUCTION_BASELINE["minMxScore"] - RUNTIME_GUARD_EPSILON

    config = {
        "version": "ckt-v4-explorer-config-1",
        "cudaFull": True,
        "cudaBatch": True,
        "cudaBatchWindowMs": 100,
        "initialSchemes": [],
        "initialRanking": None,
        "initialLayouts": rel_seed_paths,
        "schemeTemplate": "S005-NF",
        "reference": "S005",
        "corpus": "research/.cache/ckt-v4-native-corpus.bin",
        "schemes": "research/.cache/ckt-v4-all-schemes.json",
        "snapshot": "tools/ckt_v4_upstream_role_tables.json",
        "ergonomicFixture": "research/.cache/ckt-v4-ergonomics.json",
        "outputRoot": rel_output_root,
        "generations": generations,
        "stepsPerChain": 40,
        "nextSeedCount": 8,
        "baseSeed": spec["baseSeed"],
        "temperature": 0.02,
        "checkpointEvery": 5,
        "verifyEvery": 20,
        "dutyMs": 0,
        "mxCorpus": "daily",
        "mxVariant": "native-punctuation",
        "maxCktDelta": 0.35,
        "noveltyDistance": 8,
        "basinRadius": 5,
        "basinSupport": 3,
        "pauseOnReview": False,
        "guards": guards,
    }
    json_write(config_path, config)


def run_stage(repo_root: Path, config_path: Path, output_root: Path, target_gens: int) -> float:
    """Runs a single explorer stage, handling resumption if already completed or interrupted."""
    db_path = output_root / "exploration.sqlite3"
    last_plan = output_root / f"generation-{target_gens:04d}-plan" / "plan.json"
    if db_path.exists() and last_plan.exists():
        print(f"[{output_root.name}] Already completed {target_gens} generations. Skipping execution.")
        return 0.0

    print(f"\n========================================================")
    print(f"Starting stage: {output_root.name} (Target: {target_gens} gens)")
    print(f"Config: {config_path}")
    print(f"========================================================\n")

    start_time = time.time()
    cmd = [
        "pwsh",
        "-NoLogo",
        "-NoProfile",
        "-File",
        str(repo_root / "tools/run_ckt_v4_explorer.ps1"),
        "-Config",
        str(config_path),
    ]
    process = subprocess.Popen(cmd, cwd=str(repo_root))
    ret = process.wait()
    duration = time.time() - start_time

    if ret != 0:
        raise RuntimeError(f"Stage {output_root.name} failed with return code {ret}")

    print(f"Stage {output_root.name} finished in {duration:.1f}s ({duration/60:.1f}m).")
    return duration


def perform_production_screening(all_roots: list[Path]) -> dict:
    unique_states: dict[bytes, dict] = {}
    for root in all_roots:
        db = root / "exploration.sqlite3"
        if not db.exists():
            continue
        con = sqlite3.connect(db)
        con.row_factory = sqlite3.Row
        cur = con.execute(
            "SELECT state_key, layout_id, ckt_v4, memory, displaced_initials, displaced_vowels, "
            "rp_max, home_floor, mx_score, ergonomics_json, first_seen_generation FROM states"
        )
        for r in cur.fetchall():
            st = row_to_state(r, root.name)
            k = st["stateKeyBytes"]
            if k not in unique_states or st["cktV4"] < unique_states[k]["cktV4"]:
                unique_states[k] = st
        con.close()

    production_pool = [
        s
        for s in unique_states.values()
        if s["stateKeyBytes"][-5:] == PRODUCTION_TONE
        and s["memory"] <= PRODUCTION_BASELINE["maxMemory"]
        and s["displacedInitials"] <= PRODUCTION_BASELINE["maxD"]
        and s["displacedVowels"] <= PRODUCTION_BASELINE["maxV"]
    ]
    safe_states = [s for s in production_pool if not guard_failures(s)]
    replacements = [s for s in safe_states if s["cktV4"] < PRODUCTION_BASELINE["cktV4"]]
    faster = [s for s in production_pool if s["cktV4"] < PRODUCTION_BASELINE["cktV4"]]

    near_misses = []
    for s in faster:
        fails = guard_failures(s)
        near_misses.append(
            {
                "state": public_state(s),
                "failedGuardCount": len(fails),
                "violationScore": sum(item["relative"] for item in fails.values()),
                "failures": fails,
            }
        )
    near_misses.sort(key=lambda item: (item["failedGuardCount"], item["violationScore"], item["state"]["cktV4"]))

    return {
        "uniqueStateCount": len(unique_states),
        "m40d0PoolCount": len(production_pool),
        "fasterThanProductionCount": len(faster),
        "allGuardsPassCount": len(safe_states),
        "replacementCount": len(replacements),
        "decision": "reject" if not replacements else "candidate-review-required",
        "topProductionSafe": [public_state(s) for s in sorted(safe_states, key=lambda s: s["cktV4"])[:15]],
        "closestFasterMisses": near_misses[:20],
    }


def merge_review_basins(all_roots: list[Path], radius: int = 5) -> tuple[list[dict], dict]:
    reviews: dict[bytes, dict] = {}
    raw_count = 0
    for root in all_roots:
        tier = root.name
        for review_path in sorted(root.glob("generation-*-plan/review-queue.json")):
            try:
                generation = int(review_path.parent.name.split("-")[1])
                items = json.loads(review_path.read_text(encoding="utf-8"))
            except Exception:
                continue
            for review in items:
                raw_count += 1
                key = bytes.fromhex(review["stateKey"])
                entry = reviews.setdefault(
                    key,
                    {
                        "key": key,
                        "stateKey": review["stateKey"],
                        "point": review["point"],
                        "sightings": [],
                    },
                )
                entry["sightings"].append(
                    {
                        "tier": tier,
                        "generation": generation,
                        "support": review.get("newNeighbourSupport", 1),
                        "nearestPriorDistance": review.get("nearestPriorDistance", None),
                    }
                )

    items = list(reviews.values())
    parents = list(range(len(items)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left: int, right: int) -> None:
        lroot, rroot = find(left), find(right)
        if lroot != rroot:
            parents[rroot] = lroot

    chunk_count = radius + 1
    boundaries = [(69 * idx) // chunk_count for idx in range(chunk_count + 1)]
    buckets: dict[tuple[int, bytes], list[int]] = defaultdict(list)
    for index, item in enumerate(items):
        candidates = set()
        for chunk in range(chunk_count):
            sig = item["key"][boundaries[chunk] : boundaries[chunk + 1]]
            candidates.update(buckets[(chunk, sig)])
        for prior in candidates:
            if hamming(item["key"], items[prior]["key"], radius) <= radius:
                union(index, prior)
        for chunk in range(chunk_count):
            sig = item["key"][boundaries[chunk] : boundaries[chunk + 1]]
            buckets[(chunk, sig)].append(index)

    components: dict[int, list[dict]] = defaultdict(list)
    for index, item in enumerate(items):
        components[find(index)].append(item)

    clusters = []
    for members in components.values():
        representative = min(members, key=lambda it: (it["point"]["metrics"]["cktV4"], it["stateKey"]))
        sightings = [sighting for member in members for sighting in member["sightings"]]
        metrics = representative["point"]["metrics"]
        clusters.append(
            {
                "memberCount": len(members),
                "reviewSightings": len(sightings),
                "tiers": sorted({sighting["tier"] for sighting in sightings}),
                "firstGeneration": min(sighting["generation"] for sighting in sightings),
                "lastGeneration": max(sighting["generation"] for sighting in sightings),
                "maxSupport": max(sighting["support"] for sighting in sightings),
                "representative": {
                    "stateKey": representative["stateKey"],
                    "metrics": metrics,
                },
            }
        )
        if len(members) > 1:
            clusters[-1]["memberStateKeys"] = sorted(member["stateKey"] for member in members)

    clusters.sort(key=lambda c: (c["representative"]["metrics"]["cktV4"], -c["maxSupport"]))
    for rank, cluster in enumerate(clusters, 1):
        cluster["rank"] = rank

    summary = {
        "rawReviewCount": raw_count,
        "uniqueReviewStates": len(items),
        "mergedBasinCount": len(clusters),
        "crossTierBasinCount": sum(len(c["tiers"]) > 1 for c in clusters),
        "radius": radius,
    }
    return clusters, summary


def generate_final_notes(
    repo_root: Path,
    screening: dict,
    basins: dict,
    stage_summaries: list[dict],
    total_elapsed_s: float,
    notes_path: Path,
) -> None:
    lines = []
    lines.append("# CKT v4 21×21 严格 IVUAO 24小时退火探索总结报告")
    lines.append("")
    lines.append(f"日期：2026-10-26")
    lines.append(f"总探索时间：{total_elapsed_s / 3600:.2f} 小时 ({total_elapsed_s / 60:.1f} 分钟)")
    lines.append("")
    lines.append("## 1. 探索口径与阶段指标")
    lines.append("")
    lines.append("| 阶段 | 累计口径 | 代数 | 评估状态数 | 最优 CKT v4 | 记忆量 M | 偏离声母 D | 偏离韵母 V |")
    lines.append("|---|---|---:|---:|---:|---:|---:|---:|")
    for s in stage_summaries:
        b = s["best"]
        lines.append(
            f"| {s['tier']} | {s['label']} | {s['generations']} | {s['states']} | "
            f"{b['cktV4']:.9f} | {b['memory']} | {b['displacedInitials']} | {b['displacedVowels']} |"
        )
    lines.append("")
    lines.append("## 2. 生产门槛筛选 (Production Hard Gate)")
    lines.append("")
    lines.append(f"- 基线方案：`{PRODUCTION_BASELINE['id']}` (CKT: `{PRODUCTION_BASELINE['cktV4']:.9f}`)")
    lines.append(f"- 探索总状态数：{screening['uniqueStateCount']}")
    lines.append(f"- M<=40, D=0, V<=5 生产候选池状态数：{screening['m40d0PoolCount']}")
    lines.append(f"- 速度快于基线状态数：{screening['fasterThanProductionCount']}")
    lines.append(f"- 通过全部人体工学门槛状态数：{screening['allGuardsPassCount']}")
    lines.append(f"- **同时更快且通过全部门槛的替换方案数**：{screening['replacementCount']}")
    lines.append(f"- **生产决策结果**：`{screening['decision']}`")
    lines.append("")
    if screening["topProductionSafe"]:
        lines.append("### 最优合规生产状态 Top 5")
        lines.append("")
        lines.append("| 排名 | CKT v4 | M | D | V | rp_max | home_floor | mx_score | 来源阶段 |")
        lines.append("|---:|---:|---:|---:|---:|---:|---:|---:|---|")
        for i, st in enumerate(screening["topProductionSafe"][:5], 1):
            lines.append(
                f"| {i} | {st['cktV4']:.9f} | {st['memory']} | {st['displacedInitials']} | {st['displacedVowels']} | "
                f"{st['rpMax']:.6f} | {st['homeFloor']:.6f} | {st['mxScore']:.2f} | {st['sourceTier']} |"
            )
        lines.append("")
    if screening["closestFasterMisses"]:
        lines.append("### 最接近更快的候选方案 (Near Misses)")
        lines.append("")
        for i, nm in enumerate(screening["closestFasterMisses"][:5], 1):
            st = nm["state"]
            fail_str = ", ".join(f"{k} (实测 {v['actual']:.5f} vs 限值 {v['limit']:.5f})" for k, v in nm["failures"].items())
            lines.append(f"{i}. CKT: `{st['cktV4']:.9f}`, 未过线指标 ({nm['failedGuardCount']} 项): {fail_str}")
        lines.append("")
    lines.append("## 3. 盆地归并 (Basin Clustering)")
    lines.append("")
    lines.append(f"- 归并半径：Hamming 半径 {basins['radius']}")
    lines.append(f"- 原始 Review 记录数：{basins['rawReviewCount']}")
    lines.append(f"- 独立 Review 状态数：{basins['uniqueReviewStates']}")
    lines.append(f"- 合并后独立盆地数：{basins['mergedBasinCount']}")
    lines.append(f"- 跨阶段重合盆地数：{basins['crossTierBasinCount']}")
    lines.append("")
    lines.append("## 4. 产物路径")
    lines.append("")
    lines.append("- 里程碑总结：`research/milestones/strict-ivuao/stage-24h-final-20261026.json`")
    lines.append("- 归并盆地：`research/milestones/strict-ivuao/stage-24h-merged-basins-20261026.jsonl`")
    lines.append("- 种子目录：`research/seeds/ckt-v4/strict-ivuao-24h-20261026/`")
    lines.append("- 各阶段输出目录：`research/exploration/production-ckt-v4-2121-strict-ivuao-24h-20261026-*/`")
    lines.append("")

    notes_path.parent.mkdir(parents=True, exist_ok=True)
    notes_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote final report notes to {notes_path}")


def main():
    parser = argparse.ArgumentParser(description="Run 21x21 strict IVUAO 24h exploration pipeline")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--total-hours", type=float, default=24.0, help="Total hours budget for exploration")
    parser.add_argument("--quick-smoke", action="store_true", help="Run 1 generation per stage for smoke verification")
    parser.add_argument("--single-stage", type=str, default=None, help="Run only a single stage (e.g. m44d4)")
    parser.add_argument("--post-process-only", action="store_true", help="Skip exploration and run screening/basin clustering on completed stages")
    args = parser.parse_args()

    repo = args.repo_root.resolve()
    date_str = "20261026"
    tag_prefix = f"production-ckt-v4-2121-strict-ivuao-24h-{date_str}"
    seeds_base = repo / f"research/seeds/ckt-v4/strict-ivuao-24h-{date_str}"
    config_base = repo / "research/config"
    milestone_base = repo / "research/milestones/strict-ivuao"
    notes_path = repo / "research/notes" / f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}-strict-ivuao-24h-exploration.md"

    # Stage 5 databases as starting source
    stage5_dbs = [
        repo / f"research/exploration/production-ckt-v4-2121-strict-ivuao-stage5-{t}-20261025/exploration.sqlite3"
        for t in ["m43d3", "m42d2", "m41d1", "m40d0"]
    ]

    total_budget_s = args.total_hours * 3600.0
    pipeline_state_path = repo / "research" / "exploration" / f"pipeline-state-strict-ivuao-24h-{date_str}.json"
    if pipeline_state_path.exists() and not args.quick_smoke:
        try:
            p_state = json.loads(pipeline_state_path.read_text(encoding="utf-8"))
            overall_start_time = p_state.get("startTime", time.time())
            print(f"Resuming pipeline started at {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(overall_start_time))}")
        except Exception:
            overall_start_time = time.time()
    else:
        overall_start_time = time.time()
        if not args.quick_smoke:
            json_write(pipeline_state_path, {"startTime": overall_start_time, "totalBudgetHours": args.total_hours})

    completed_roots = []
    source_dbs = list(stage5_dbs)
    stage_summaries = []
    measured_gen_seconds = []

    stages_to_run = STAGE_SPECS
    if args.single_stage:
        stages_to_run = [s for s in STAGE_SPECS if s["tier"] == args.single_stage]
        if not stages_to_run:
            raise ValueError(f"Unknown tier: {args.single_stage}")

    if args.post_process_only:
        print("Running in post-process-only mode across all existing stages...")
        for spec in STAGE_SPECS:
            tier = spec["tier"]
            stage_root = repo / "research" / "exploration" / f"{tag_prefix}-{tier}"
            db_path = stage_root / "exploration.sqlite3"
            if db_path.exists():
                completed_roots.append(stage_root)
                con = sqlite3.connect(db_path)
                con.row_factory = sqlite3.Row
                rows = con.execute("SELECT state_key, ckt_v4, memory, displaced_initials, displaced_vowels FROM states").fetchall()
                best_row = min(rows, key=lambda r: r["ckt_v4"])
                existing_plans = list(stage_root.glob("generation-*-plan/plan.json"))
                actual_gens = max([int(p.parent.name.split("-")[1]) for p in existing_plans], default=0)
                stage_summaries.append(
                    {
                        "tier": tier,
                        "label": spec["label"],
                        "generations": actual_gens,
                        "states": len(rows),
                        "best": {
                            "cktV4": best_row["ckt_v4"],
                            "memory": best_row["memory"],
                            "displacedInitials": best_row["displaced_initials"],
                            "displacedVowels": best_row["displaced_vowels"],
                        },
                    }
                )
                con.close()
    else:
        for stage_idx, spec in enumerate(stages_to_run):
            tier = spec["tier"]
            stage_root = repo / "research" / "exploration" / f"{tag_prefix}-{tier}"
            seed_dir = seeds_base / tier
            config_path = config_base / f"ckt-v4-{tag_prefix}-{tier}.json"

            # Determine generation count
            if args.quick_smoke:
                target_gens = 1
            elif spec["prodgate"]:
                existing_plans = list(stage_root.glob("generation-*-plan/plan.json"))
                current_gens = max([int(p.parent.name.split("-")[1]) for p in existing_plans], default=0)
                elapsed = time.time() - overall_start_time
                remaining_s = max(1800.0, total_budget_s - elapsed - 1800.0)  # Reserve 30m for basin merge & report
                avg_sec = 72.0
                add_gens = max(10, int(remaining_s / avg_sec))
                target_gens = current_gens + add_gens
                print(f"[ProdGate] Existing gens: {current_gens}, Elapsed {elapsed/3600:.2f}h, remaining {remaining_s/3600:.2f}h -> targeting {target_gens} total gens (+{add_gens} gens)")
            else:
                target_gens = spec["defaultGens"]

            # Check if already completed
            done_marker = stage_root / f"generation-{target_gens:04d}-plan" / "plan.json"
            db_path = stage_root / "exploration.sqlite3"

            if not (db_path.exists() and done_marker.exists()):
                # Generate seeds if not already present
                manifest_path = seed_dir / "manifest.json"
                if not manifest_path.exists():
                    print(f"\n[Stage {stage_idx+1}: {tier}] Generating 8 seeds from previous sources...")
                    if spec["prodgate"]:
                        seed_paths = choose_seeds_for_prodgate(source_dbs, seed_dir)
                    else:
                        seed_paths = choose_seeds_for_tier(source_dbs, spec["maxMemory"], spec["maxD"], tier, seed_dir)
                else:
                    seed_paths = [p.as_posix() for p in sorted(seed_dir.glob("seed-*.json")) if "manifest" not in p.name]

                # Write config
                build_config(repo, spec, seed_paths, stage_root, config_path, target_gens)

                # Run stage
                stage_duration = run_stage(repo, config_path, stage_root, target_gens)
                if target_gens > 0 and stage_duration > 0:
                    measured_gen_seconds.append(stage_duration / target_gens)

            # Verify tone slot invariant on output SQLite
            if db_path.exists():
                con = sqlite3.connect(db_path)
                con.row_factory = sqlite3.Row
                rows = con.execute("SELECT state_key, ckt_v4, memory, displaced_initials, displaced_vowels FROM states").fetchall()
                invalid_tones = sum(bytes(r["state_key"])[-5:] != PRODUCTION_TONE for r in rows)
                if invalid_tones > 0:
                    raise RuntimeError(f"FATAL: Stage {tier} produced {invalid_tones} states violating production IVUAO!")
                best_row = min(rows, key=lambda r: r["ckt_v4"])
                stage_summaries.append(
                    {
                        "tier": tier,
                        "label": spec["label"],
                        "generations": target_gens,
                        "states": len(rows),
                        "best": {
                            "cktV4": best_row["ckt_v4"],
                            "memory": best_row["memory"],
                            "displacedInitials": best_row["displaced_initials"],
                            "displacedVowels": best_row["displaced_vowels"],
                        },
                    }
                )
                con.close()

            completed_roots.append(stage_root)
            source_dbs.insert(0, db_path)  # Prepend new DB so next stage draws directly from it

            if not args.quick_smoke:
                json_write(
                    pipeline_state_path,
                    {
                        "startTime": overall_start_time,
                        "totalBudgetHours": args.total_hours,
                        "completedStages": [r.name for r in completed_roots],
                        "stageSummaries": stage_summaries,
                    },
                )

    total_elapsed_s = time.time() - overall_start_time
    print(f"\n========================================================")
    print(f"All stages completed! Total elapsed: {total_elapsed_s/3600:.2f} hours")
    print(f"Running production screening and basin clustering...")
    print(f"========================================================\n")

    screening = perform_production_screening(completed_roots)
    clusters, basins = merge_review_basins(completed_roots, radius=5)

    milestone_base.mkdir(parents=True, exist_ok=True)
    basin_path = milestone_base / f"stage-24h-merged-basins-{date_str}.jsonl"
    with basin_path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps({"type": "header", "orderedMapping": "IVUAO", "summary": basins}) + "\n")
        for cl in clusters:
            handle.write(json.dumps({"type": "basin", **cl}, ensure_ascii=False) + "\n")
    print(f"Wrote merged basins to {basin_path}")

    analysis_path = milestone_base / f"stage-24h-final-{date_str}.json"
    analysis_doc = {
        "version": "ckt-v4-strict-ivuao-stage-24h-final-1",
        "date": date_str,
        "totalElapsedSeconds": total_elapsed_s,
        "stages": stage_summaries,
        "productionScreen": screening,
        "basins": {**basins, "artifact": basin_path.relative_to(repo).as_posix()},
    }
    json_write(analysis_path, analysis_doc)
    print(f"Wrote final analysis to {analysis_path}")

    generate_final_notes(repo, screening, basins, stage_summaries, total_elapsed_s, notes_path)
    print("\nPipeline execution complete!\n")


if __name__ == "__main__":
    main()
