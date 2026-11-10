import argparse
import hashlib
import json
import sqlite3
from collections import defaultdict
from pathlib import Path


TIERS = (
    ("m43d3", 43, 3),
    ("m42d2", 42, 2),
    ("m41d1", 41, 1),
    ("m40d0", 40, 0),
)
PRODUCTION_TONE = bytes([8, 21, 20, 0, 14])
PRODUCTION = {
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


def json_write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def basin_jsonl_write(path: Path, summary: dict, clusters: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    records = [
        {"type": "header", "version": "ckt-v4-merged-basins-jsonl-1", "orderedMapping": "IVUAO", "summary": summary},
        *({"type": "basin", **cluster} for cluster in clusters),
    ]
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")


def decode_layout(state_key: bytes, layout_id: str) -> dict:
    if len(state_key) != 69:
        raise ValueError(f"invalid state key length: {len(state_key)}")
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
        "layoutId": row["layout_id"],
        "cktV4": row["ckt_v4"],
        "memory": row["memory"],
        "displacedInitials": row["displaced_initials"],
        "displacedVowels": row["displaced_vowels"],
        "rpS2": loads["rp_s2"],
        "rpMax": row["rp_max"],
        "homeFloor": row["home_floor"],
        "wMax": loads["w_max"],
        "yMax": loads["y_max"],
        "mxScore": row["mx_score"],
        "firstSeenGeneration": row["first_seen_generation"],
        "sourceTier": tier,
    }


def public_state(state: dict) -> dict:
    return {key: value for key, value in state.items() if key != "stateKeyBytes"}


def guard_failures(state: dict) -> dict:
    failures = {}
    checks = (
        ("memory", state["memory"], PRODUCTION["maxMemory"], "max"),
        ("displacedInitials", state["displacedInitials"], PRODUCTION["maxD"], "max"),
        ("displacedVowels", state["displacedVowels"], PRODUCTION["maxV"], "max"),
        ("rpS2", state["rpS2"], PRODUCTION["maxRpS2"], "max"),
        ("rpMax", state["rpMax"], PRODUCTION["maxRp"], "max"),
        ("homeFloor", state["homeFloor"], PRODUCTION["minHomeFloor"], "min"),
        ("wMax", state["wMax"], PRODUCTION["maxW"], "max"),
        ("yMax", state["yMax"], PRODUCTION["maxY"], "max"),
        ("mxScore", state["mxScore"], PRODUCTION["minMxScore"], "min"),
    )
    for name, actual, limit, direction in checks:
        failed = actual > limit if direction == "max" else actual < limit
        if failed:
            relative = actual / limit - 1 if direction == "max" else limit / actual - 1
            failures[name] = {"actual": actual, "limit": limit, "relative": relative}
    return failures


def load_states(database: Path, tier: str) -> list[dict]:
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        "SELECT state_key,layout_id,ckt_v4,memory,displaced_initials,displaced_vowels,"
        "ergonomics_json,rp_max,home_floor,mx_score,first_seen_generation FROM states"
    ).fetchall()
    connection.close()
    return [row_to_state(row, tier) for row in rows]


def merge_review_basins(run_roots: dict[str, Path], radius: int = 5) -> tuple[list[dict], dict]:
    reviews: dict[bytes, dict] = {}
    raw_count = 0
    for tier, root in run_roots.items():
        for review_path in sorted(root.glob("generation-*-plan/review-queue.json")):
            generation = int(review_path.parent.name.split("-")[1])
            for review in json.loads(review_path.read_text(encoding="utf-8")):
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
                        "support": review["newNeighbourSupport"],
                        "nearestPriorDistance": review["nearestPriorDistance"],
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
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parents[right_root] = left_root

    # With radius five, splitting a 69-byte key into six chunks guarantees that
    # two neighbours share at least one complete chunk. This avoids an O(n^2)
    # full scan while preserving exact Hamming-radius clustering.
    chunk_count = radius + 1
    boundaries = [(69 * index) // chunk_count for index in range(chunk_count + 1)]
    buckets: dict[tuple[int, bytes], list[int]] = defaultdict(list)
    for index, item in enumerate(items):
        candidates = set()
        for chunk in range(chunk_count):
            signature = item["key"][boundaries[chunk] : boundaries[chunk + 1]]
            candidates.update(buckets[(chunk, signature)])
        for prior in candidates:
            if hamming(item["key"], items[prior]["key"], radius) <= radius:
                union(index, prior)
        for chunk in range(chunk_count):
            signature = item["key"][boundaries[chunk] : boundaries[chunk + 1]]
            buckets[(chunk, signature)].append(index)

    components: dict[int, list[dict]] = defaultdict(list)
    for index, item in enumerate(items):
        components[find(index)].append(item)

    clusters = []
    for members in components.values():
        representative = min(members, key=lambda item: (item["point"]["metrics"]["cktV4"], item["stateKey"]))
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
                "minNearestPriorDistance": min(sighting["nearestPriorDistance"] for sighting in sightings),
                "representative": {
                    "stateKey": representative["stateKey"],
                    "metrics": metrics,
                },
            }
        )
        if len(members) > 1:
            clusters[-1]["memberStateKeys"] = sorted(member["stateKey"] for member in members)
    clusters.sort(key=lambda cluster: (cluster["representative"]["metrics"]["cktV4"], -cluster["maxSupport"]))
    for rank, cluster in enumerate(clusters, 1):
        cluster["rank"] = rank

    summary = {
        "rawReviewCount": raw_count,
        "uniqueReviewStates": len(items),
        "mergedBasinCount": len(clusters),
        "crossTierBasinCount": sum(len(cluster["tiers"]) > 1 for cluster in clusters),
        "lateBasinCount": sum(cluster["lastGeneration"] >= 76 for cluster in clusters),
        "radius": radius,
    }
    return clusters, summary


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


def prepare_continuation(
    repo: Path,
    run_roots: dict[str, Path],
    config_root: Path,
    seed_root: Path,
    safe_states: list[dict],
) -> list[dict]:
    outputs = []
    for tier, _, _ in TIERS:
        source_plan = run_roots[tier] / "generation-0100-plan"
        target_dir = seed_root / tier
        target_dir.mkdir(parents=True, exist_ok=True)
        plan = json.loads((source_plan / "plan.json").read_text(encoding="utf-8"))
        seed_paths = []
        seed_records = []
        source_files = sorted(source_plan.glob("seed-*.json"))
        if len(source_files) != 8:
            raise RuntimeError(f"{tier} has {len(source_files)} continuation seeds, expected 8")
        for index, source in enumerate(source_files, 1):
            layout = json.loads(source.read_text(encoding="utf-8"))
            if layout["tone"] != list(PRODUCTION_TONE):
                raise RuntimeError(f"{source} does not preserve production IVUAO")
            target = target_dir / f"seed-{index:02d}-gen0100-next.json"
            json_write(target, layout)
            relative = target.relative_to(repo).as_posix()
            seed_paths.append(relative)
            seed_records.append(
                {
                    "rank": index,
                    "source": source.relative_to(repo).as_posix(),
                    "sourceSelection": plan["seeds"][index - 1]["reason"],
                    "filename": target.name,
                    "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                }
            )
        manifest = {
            "version": "ckt-v4-strict-ivuao-continuation-seeds-1",
            "sourceRun": run_roots[tier].relative_to(repo).as_posix(),
            "sourceGeneration": 100,
            "orderedMapping": "IVUAO",
            "seeds": seed_records,
        }
        json_write(target_dir / "manifest.json", manifest)

        source_config_path = config_root / f"ckt-v4-production-21x21-strict-ivuao-stage5-{tier}-20261025.json"
        config = json.loads(source_config_path.read_text(encoding="utf-8"))
        config["initialLayouts"] = seed_paths
        config["corpus"] = "research/.cache/ckt-v4-native-corpus.bin"
        config["schemes"] = "research/.cache/ckt-v4-all-schemes.json"
        config["ergonomicFixture"] = "research/.cache/ckt-v4-ergonomics.json"
        config["outputRoot"] = f"research/exploration/production-ckt-v4-2121-strict-ivuao-stage6-{tier}-20261025"
        config["baseSeed"] += 1_000_000
        target_config = config_root / f"ckt-v4-production-21x21-strict-ivuao-stage6-{tier}-20261025.json"
        json_write(target_config, config)
        outputs.append({"tier": tier, "config": target_config.relative_to(repo).as_posix()})

    production_seeds = choose_diverse(safe_states, 8, PRODUCTION["cktV4"] + 0.75)
    if len(production_seeds) != 8:
        raise RuntimeError(f"production gate produced only {len(production_seeds)} seeds")
    gate_dir = seed_root / "m40d0-prodgate"
    gate_dir.mkdir(parents=True, exist_ok=True)
    gate_layouts = []
    gate_records = []
    for index, state in enumerate(production_seeds, 1):
        target = gate_dir / f"seed-{index:02d}-production-safe.json"
        json_write(target, decode_layout(state["stateKeyBytes"], f"strict-ivuao-stage6-prodgate-{index:02d}"))
        gate_layouts.append(target.relative_to(repo).as_posix())
        gate_records.append({"rank": index, "metrics": public_state(state), "filename": target.name})
    json_write(
        gate_dir / "manifest.json",
        {
            "version": "ckt-v4-strict-ivuao-production-gate-seeds-1",
            "productionBaseline": PRODUCTION,
            "orderedMapping": "IVUAO",
            "seeds": gate_records,
        },
    )

    base_config = json.loads(
        (config_root / "ckt-v4-production-21x21-strict-ivuao-stage5-m40d0-20261025.json").read_text(encoding="utf-8")
    )
    base_config["initialLayouts"] = gate_layouts
    base_config["corpus"] = "research/.cache/ckt-v4-native-corpus.bin"
    base_config["schemes"] = "research/.cache/ckt-v4-all-schemes.json"
    base_config["ergonomicFixture"] = "research/.cache/ckt-v4-ergonomics.json"
    base_config["outputRoot"] = "research/exploration/production-ckt-v4-2121-strict-ivuao-stage6-m40d0-prodgate-r1-20261025"
    base_config["baseSeed"] += 2_000_000
    base_config["guards"] = {
        "maxMemory": PRODUCTION["maxMemory"],
        "maxD": PRODUCTION["maxD"],
        "maxV": PRODUCTION["maxV"],
        "maxRpS2": PRODUCTION["maxRpS2"] + RUNTIME_GUARD_EPSILON,
        "maxRp": PRODUCTION["maxRp"] + RUNTIME_GUARD_EPSILON,
        "maxW": PRODUCTION["maxW"] + RUNTIME_GUARD_EPSILON,
        "maxY": PRODUCTION["maxY"] + RUNTIME_GUARD_EPSILON,
        "minHomeFloor": PRODUCTION["minHomeFloor"] - RUNTIME_GUARD_EPSILON,
        "minMxScore": PRODUCTION["minMxScore"] - RUNTIME_GUARD_EPSILON,
    }
    gate_config = config_root / "ckt-v4-production-21x21-strict-ivuao-stage6-m40d0-prodgate-20261025.json"
    json_write(gate_config, base_config)
    outputs.append({"tier": "m40d0-prodgate", "config": gate_config.relative_to(repo).as_posix()})
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--date", default="20261025")
    args = parser.parse_args()
    repo = args.repo.resolve()
    run_roots = {
        tier: repo / f"research/exploration/production-ckt-v4-2121-strict-ivuao-stage5-{tier}-{args.date}"
        for tier, _, _ in TIERS
    }
    config_root = repo / "research/config"
    milestone_root = repo / "research/milestones/strict-ivuao"
    seed_root = repo / f"research/seeds/ckt-v4/strict-ivuao-stage6-{args.date}"

    unique_states: dict[bytes, dict] = {}
    tier_summaries = []
    for tier, max_memory, max_d in TIERS:
        database = run_roots[tier] / "exploration.sqlite3"
        states = load_states(database, tier)
        invalid_tones = sum(state["stateKeyBytes"][-5:] != PRODUCTION_TONE for state in states)
        for state in states:
            unique_states.setdefault(state["stateKeyBytes"], state)
        best = min(states, key=lambda state: (state["cktV4"], state["stateKey"]))
        checkpoints = {
            str(generation): min(
                state["cktV4"] for state in states if state["firstSeenGeneration"] <= generation
            )
            for generation in (25, 50, 75, 100)
        }
        tier_summaries.append(
            {
                "tier": tier,
                "guards": {"maxMemory": max_memory, "maxD": max_d},
                "generations": 100,
                "states": len(states),
                "invalidOrderedMappings": invalid_tones,
                "best": public_state(best),
                "cumulativeBestByGeneration": checkpoints,
            }
        )

    production_pool = [
        state
        for state in unique_states.values()
        if state["stateKeyBytes"][-5:] == PRODUCTION_TONE
        and state["memory"] <= PRODUCTION["maxMemory"]
        and state["displacedInitials"] <= PRODUCTION["maxD"]
        and state["displacedVowels"] <= PRODUCTION["maxV"]
    ]
    safe_states = [state for state in production_pool if not guard_failures(state)]
    replacements = [state for state in safe_states if state["cktV4"] < PRODUCTION["cktV4"]]
    faster = [state for state in production_pool if state["cktV4"] < PRODUCTION["cktV4"]]
    near_misses = []
    for state in faster:
        failures = guard_failures(state)
        near_misses.append(
            {
                "state": public_state(state),
                "failedGuardCount": len(failures),
                "violationScore": sum(item["relative"] for item in failures.values()),
                "failures": failures,
            }
        )
    near_misses.sort(key=lambda item: (item["failedGuardCount"], item["violationScore"], item["state"]["cktV4"]))

    clusters, basin_summary = merge_review_basins(run_roots)
    basin_path = milestone_root / "stage-05-merged-basins-gen-0100.jsonl"
    basin_jsonl_write(basin_path, basin_summary, clusters)

    continuation = prepare_continuation(repo, run_roots, config_root, seed_root, safe_states)
    analysis = {
        "version": "ckt-v4-strict-ivuao-stage-final-1",
        "stage": 5,
        "generationPerTier": 100,
        "orderedMapping": "IVUAO",
        "productionBaseline": PRODUCTION,
        "tiers": tier_summaries,
        "productionScreen": {
            "uniqueStateCount": len(unique_states),
            "m40d0PoolCount": len(production_pool),
            "fasterThanProductionCount": len(faster),
            "allGuardsPassCount": len(safe_states),
            "replacementCount": len(replacements),
            "decision": "reject" if not replacements else "candidate-review-required",
            "topProductionSafe": [public_state(state) for state in sorted(safe_states, key=lambda state: state["cktV4"])[:10]],
            "closestFasterMisses": near_misses[:20],
        },
        "basins": {**basin_summary, "artifact": basin_path.relative_to(repo).as_posix()},
        "continuation": continuation,
    }
    analysis_path = milestone_root / "stage-05-final-gen-0100.json"
    json_write(analysis_path, analysis)
    print(f"wrote {analysis_path}")
    print(f"wrote {basin_path}")
    print(json.dumps({"production": analysis["productionScreen"], "basins": basin_summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
