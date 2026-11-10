import argparse
import json
import sqlite3
from pathlib import Path


PRODUCTION_TONE = bytes([8, 21, 20, 0, 14])
PRODUCTION_BASELINE = {
    "ckt": 9.936905708592155,
    "rp_max": 0.051044914723866866,
    "home_floor": 0.3507563825435487,
    "mx_score": 140.8422565188559,
    "w_max": 0.03623226230403664,
    "y_max": 0.06868516416255256,
}
TIERS = [(43, 3), (42, 2), (41, 1), (40, 0)]


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


def hamming(left: bytes, right: bytes) -> int:
    return sum(a != b for a, b in zip(left, right))


def choose(rows: list[sqlite3.Row]) -> list[tuple[str, sqlite3.Row]]:
    selected: list[tuple[str, sqlite3.Row]] = []
    used: set[bytes] = set()

    def add(reason: str, ordered: list[sqlite3.Row]) -> None:
        for row in ordered:
            if row["state_key"] not in used:
                used.add(row["state_key"])
                selected.append((reason, row))
                return

    add("best-ckt", sorted(rows, key=lambda r: (r["ckt_v4"], r["state_key"])))
    add("lowest-memory", sorted(rows, key=lambda r: (r["memory"], r["ckt_v4"], r["state_key"])))
    add("lowest-displaced-initials", sorted(rows, key=lambda r: (r["displaced_initials"], r["ckt_v4"], r["state_key"])))
    add("lowest-right-pinky", sorted(rows, key=lambda r: (r["rp_max"], r["ckt_v4"], r["state_key"])))
    add("highest-home-floor", sorted(rows, key=lambda r: (-r["home_floor"], r["ckt_v4"], r["state_key"])))
    add("highest-moving-hand", sorted(rows, key=lambda r: (-r["mx_score"], r["ckt_v4"], r["state_key"])))
    production_safe = [
        row
        for row in rows
        if row["rp_max"] <= PRODUCTION_BASELINE["rp_max"]
        and row["home_floor"] >= PRODUCTION_BASELINE["home_floor"]
        and row["mx_score"] >= PRODUCTION_BASELINE["mx_score"]
        and row["w_max"] <= PRODUCTION_BASELINE["w_max"]
        and row["y_max"] <= PRODUCTION_BASELINE["y_max"]
    ]
    add("best-production-balanced", sorted(production_safe, key=lambda r: (r["ckt_v4"], r["state_key"])))

    while len(selected) < 8:
        candidates = [row for row in rows if row["state_key"] not in used]
        if not candidates:
            break
        candidate = max(
            candidates[:4096],
            key=lambda row: (
                min(hamming(row["state_key"], chosen["state_key"]) for _, chosen in selected),
                -row["ckt_v4"],
            ),
        )
        add("novel-basin", [candidate])
    return selected


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--config-root", required=True, type=Path)
    parser.add_argument("--shared-cache-root", required=True, type=Path)
    parser.add_argument("--generations", type=int, default=100)
    args = parser.parse_args()

    connection = sqlite3.connect(args.database)
    connection.row_factory = sqlite3.Row
    args.output_root.mkdir(parents=True, exist_ok=True)
    args.config_root.mkdir(parents=True, exist_ok=True)

    for tier_index, (max_memory, max_d) in enumerate(TIERS, 1):
        best = connection.execute(
            "SELECT MIN(ckt_v4) FROM states WHERE memory<=? AND displaced_initials<=? "
            "AND substr(state_key,65,5)=?",
            (max_memory, max_d, PRODUCTION_TONE),
        ).fetchone()[0]
        rows = connection.execute(
            "SELECT state_key,ckt_v4,memory,displaced_initials,displaced_vowels,rp_max,"
            "home_floor,mx_score,"
            "json_extract(ergonomics_json,'$.loads.w_max') AS w_max,"
            "json_extract(ergonomics_json,'$.loads.y_max') AS y_max,"
            "first_seen_generation FROM states "
            "WHERE memory<=? AND displaced_initials<=? AND substr(state_key,65,5)=? "
            "ORDER BY ckt_v4,state_key",
            (max_memory, max_d, PRODUCTION_TONE),
        ).fetchall()
        selected = choose(rows)
        if len(selected) != 8:
            raise RuntimeError(f"M<={max_memory} D<={max_d} produced only {len(selected)} seeds")

        label = f"m{max_memory}d{max_d}"
        seed_dir = args.output_root / label
        seed_dir.mkdir(parents=True, exist_ok=True)
        manifest_seeds = []
        initial_layouts = []
        for rank, (reason, row) in enumerate(selected, 1):
            filename = f"seed-{rank:02d}-{reason}.json"
            layout = decode_layout(row["state_key"], f"strict-ivuao-{label}-seed-{rank:02d}-{reason}")
            (seed_dir / filename).write_text(json.dumps(layout, indent=2) + "\n", encoding="utf-8")
            initial_layouts.append((seed_dir / filename).as_posix())
            manifest_seeds.append(
                {
                    "rank": rank,
                    "reason": reason,
                    "stateKey": row["state_key"].hex(),
                    "metrics": {
                        "cktV4": row["ckt_v4"],
                        "memory": row["memory"],
                        "displacedInitials": row["displaced_initials"],
                        "displacedVowels": row["displaced_vowels"],
                        "rpMax": row["rp_max"],
                        "homeFloor": row["home_floor"],
                        "mxScore": row["mx_score"],
                        "wMax": row["w_max"],
                        "yMax": row["y_max"],
                    },
                    "firstSeenGeneration": row["first_seen_generation"],
                    "filename": filename,
                }
            )
        manifest = {
            "version": "ckt-v4-strict-ivuao-stage-seeds-1",
            "sourceDatabase": args.database.as_posix(),
            "orderedMapping": "IVUAO",
            "guards": {"maxMemory": max_memory, "maxD": max_d},
            "sourceBestCktV4": best,
            "seeds": manifest_seeds,
        }
        (seed_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

        run_root = f"research/exploration/production-ckt-v4-2121-strict-ivuao-stage5-{label}-20261025"
        config = {
            "version": "ckt-v4-explorer-config-1",
            "cudaFull": True,
            "cudaBatch": True,
            "cudaBatchWindowMs": 100,
            "initialSchemes": [],
            "initialRanking": None,
            "initialLayouts": initial_layouts,
            "schemeTemplate": "S005-NF",
            "reference": "S005",
            "corpus": (args.shared_cache_root / "ckt-v4-native-corpus.bin").as_posix(),
            "schemes": (args.shared_cache_root / "ckt-v4-all-schemes.json").as_posix(),
            "snapshot": "tools/ckt_v4_upstream_role_tables.json",
            "ergonomicFixture": (args.shared_cache_root / "ckt-v4-ergonomics.json").as_posix(),
            "outputRoot": run_root,
            "generations": args.generations,
            "stepsPerChain": 40,
            "nextSeedCount": 8,
            "baseSeed": 21215600 + tier_index * 100,
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
            "guards": {
                "maxMemory": max_memory,
                "maxD": max_d,
                "maxV": None,
                "maxRpS2": None,
                "maxRp": None,
                "maxW": None,
                "maxY": None,
                "minHomeFloor": None,
                "minMxScore": None,
            },
        }
        config_path = args.config_root / f"ckt-v4-production-21x21-strict-ivuao-stage5-{label}-20261025.json"
        config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
        print(f"prepared {label}: best={best:.9f}, seeds={len(selected)}, config={config_path}")


if __name__ == "__main__":
    main()
