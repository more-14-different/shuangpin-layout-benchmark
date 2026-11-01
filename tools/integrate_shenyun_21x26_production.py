#!/usr/bin/env python3
"""Integrate the reviewed Overall-17 21x26 production layout into R11."""

from __future__ import annotations

import copy
import importlib
import importlib.util
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SNOW = Path(r"D:\C2D\Documents\rime-snow-pinyin")
RESEARCH = SNOW / "scripts" / "research"
HTML = ROOT / "a7_CKT_R11.html"
REPLAY = ROOT / "research" / ".cache" / "R11_integrated_replay"
AUDIT = ROOT / "a7_CKT_R11_integrated_materials" / "shenyun_21x26_production_benchmark.json"

IDENT = "SNOW-SHENYUN-21X26-PRODUCTION"
SOURCE_BRANCH = "production/ckt-v4-2126-strict-d0-20261030"
SOURCE_COMMIT = "7a7e154f3f7d0c86653ee15e755ccd72e866e5e2"
ARCHIVE_COMMIT = "70545d9f182a97700f7b404e18487fb12738ce01"
STATE_KEY = (
    "151A010F0C0903130D0B060A070910170515161119021217171710181800070E18"
    "120416090D14080A0F0B0319021110170C0A05141711100F0B130C15130601080414000E"
)
EXPECTED_CKT_V4 = 9.185254321702468

INITIAL_MAP = {
    "b": "B", "p": "P", "m": "M", "f": "J", "d": "D", "t": "T",
    "n": "N", "l": "L", "g": "G", "k": "K", "h": "H", "j": "J",
    "q": "Q", "x": "X", "zh": "F", "ch": "V", "sh": "W", "r": "R",
    "z": "Z", "c": "C", "s": "S", "A": "X", "E": "X", "O": "X",
    "W": "Q", "Y": "Y", "YU": "Y",
}

FINAL_MAP = {
    "a": "A", "ai": "H", "an": "O", "ang": "Y", "ao": "S",
    "e": "E", "ei": "W", "en": "J", "eng": "N", "er": "U",
    "i": "I", "ia": "K", "ian": "P", "iang": "L", "iao": "D",
    "ie": "Z", "in": "C", "ing": "R", "iong": "Q", "iu": "X",
    "o": "M", "ong": "K", "ou": "F", "u": "U", "ua": "X",
    "uai": "R", "uan": "Q", "uang": "P", "ui": "L", "un": "T",
    "uo": "M", "v": "V", "van": "T", "ve": "G", "vn": "B",
}

SCHEME = {
    "id": IDENT,
    "initialMap": INITIAL_MAP,
    "finalMap": FINAL_MAP,
    "toneKeys": "IEUAO",
    "capacity": [21, 26],
    "actual": [21, 26],
    "M": 36,
    "D": 1,
    "V": 1,
    "label": "Overall-17",
    "atlasSubfamily": "21x26 strict D<=1 production candidate",
    "atlasSource": (
        f"{SOURCE_BRANCH}@{SOURCE_COMMIT}; Overall-17 archived at {ARCHIVE_COMMIT}"
    ),
}

TRACKS = (
    ("keytao", "character", 1, 2), ("keytao", "word2", 3, 4),
    ("keytao", "word3", 1, 3), ("keytao", "word4", 1, 4),
    ("sanpin", "character", 1, 2), ("sanpin", "word2", 3, 4),
    ("sanpin", "word3", 1, 3), ("sanpin", "word4", 1, 4),
)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(list(args), cwd=cwd, check=True)


def score_v3(modes: dict, reference: dict) -> float:
    total = 0.0
    weight_sum = 0.0
    for mode, kind, weight, base_length in TRACKS:
        row = modes[mode][kind]
        anchor = reference[mode][kind]

        def effective(value: dict) -> float:
            first = 1 - value["stageWeight"][0]
            second = max(0.0, value["meanKeys"] - base_length - first)
            return (
                value["completionUpperMs"]
                + 600 * value["p2"]
                + 300 * first
                + 300 * second
            )

        total += weight * (effective(row) / effective(anchor)) ** 4
        weight_sum += weight
    return 10 * (total / weight_sum) ** 0.25


def score_v4(modes: dict, reference: dict, parameters: dict) -> float:
    def effective(row: dict) -> float:
        return (
            row["motorUpperMs"]
            + parameters["firstAuxMs"] * row["firstAuxRate"]
            + parameters["secondAuxMs"] * row["secondAuxRate"]
            + (parameters["selectionDecisionMs"] + parameters["selectionActionMs"])
            * row["selectionRate"]
            + parameters["scanPerCandidateMs"] * row["meanRejectedCandidates"]
            + parameters["pageActionMs"] * row["meanPageActions"]
        )

    total = 0.0
    weight_sum = 0.0
    for mode, kind, weight, _ in TRACKS:
        total += weight * (
            effective(modes[mode][kind]) / effective(reference[mode][kind])
        ) ** 4
        weight_sum += weight
    return 10 * (total / weight_sum) ** 0.25


def aggregate_v4(modes: dict) -> dict[str, float]:
    fields = {
        "motorUpperMs": "motorUpperMs",
        "firstAuxRate": "firstAuxRate",
        "secondAuxRate": "secondAuxRate",
        "selectionRate": "selectionRate",
        "meanRejectedCandidates": "meanRejectedCandidates",
        "meanPageActions": "meanPageActions",
    }
    weight_sum = sum(row[2] for row in TRACKS)
    return {
        output: sum(
            weight * modes[mode][kind][source]
            for mode, kind, weight, _ in TRACKS
        ) / weight_sum
        for output, source in fields.items()
    }


def missing_by_map(data: dict, ids: set[str]) -> dict[str, set[str]]:
    paths = {
        "ensemble": data["ensemble"]["values"],
        "ensembleV2": data["ensembleV2"]["values"],
        "ensembleV3": data["ensembleV3"]["values"],
        "ensembleV4": data["ensembleV4"]["values"],
        "ensembleV5": data["ensembleV5"]["values"],
        "ensembleV6": data["ensembleV6"]["values"],
        "ckt": data["ckt"]["tracks"],
        "fairCKT": data["fairCKT"]["values"],
        "load": data["r11LoadSummaries"],
        "pair": data["r11PairMetrics"]["values"],
        "eligibility": data["r11Eligibility"],
        "macroxue": data["macroxue"]["values"],
        "completionB": data["completionB"]["schemes"],
        "completionBFixed": data["completionBFixed"]["schemes"],
        "completionBV2": data["completionBV2"]["schemes"],
        "completionBV3": data["completionBV3"]["schemes"],
        "completionBV4": data["completionBV4"]["schemes"],
    }
    return {name: ids - set(values) for name, values in paths.items()}


def main() -> None:
    if not sys.flags.utf8_mode:
        environment = os.environ.copy()
        environment["PYTHONUTF8"] = "1"
        raise SystemExit(subprocess.call([sys.executable, *sys.argv], env=environment))
    sys.path.insert(0, str(RESEARCH))
    fixed = load_module(
        "fixed_frontier",
        RESEARCH / "integrate_shenyun_21x21_completion_fixed_frontier.py",
    )
    old = load_module(
        "old_21x21",
        RESEARCH / "integrate_shenyun_21x21_low_miss.py",
    )
    helper = old.load_helper(HTML)

    html = HTML.read_text(encoding="utf-8")
    data, body, end = helper.extract_payload(html)
    existing_ids = {entry["id"] for entry in data["entries"]}
    if IDENT in existing_ids:
        present = next(entry for entry in data["entries"] if entry["id"] == IDENT)
        required = missing_by_map(data, existing_ids)
        incomplete = [name for name, missing in required.items() if IDENT in missing]
        if present.get("r11Provenance", {}).get("stateKey") != STATE_KEY or incomplete:
            raise ValueError(f"partial or mismatched integration: {incomplete}")
        print(json.dumps({"alreadyIntegrated": IDENT, "catalogue": len(existing_ids)}))
        return

    before_missing = missing_by_map(data, existing_ids)
    if not (REPLAY / "source.json").exists():
        raise FileNotFoundError(f"missing frozen replay source: {REPLAY / 'source.json'}")
    source = json.loads((REPLAY / "source.json").read_text(encoding="utf-8"))
    if source["pinyin"] != data["pinyin"]:
        raise ValueError("frozen replay and atlas pinyin indices differ")

    sys.path.insert(0, str(REPLAY))
    split = importlib.import_module("audit").split
    entry = helper.make_entry(source, split, SCHEME)
    entry.update({
        "name": "冰雪神韵·21×26 生产版",
        "family": "Snow Shenyun 21x26",
        "subfamily": "IEUAO 锁定·D1/V1·生产候选",
        "sourceSearchRound": "strict-d0-overall-frontier",
        "sourceSearchRank": 17,
        "r11Provenance": {
            "parent": None,
            "kind": "post-R11 21x26 strict-D1 production candidate",
            "soundLayout": IDENT,
            "branch": SOURCE_BRANCH,
            "commit": SOURCE_COMMIT,
            "archiveCommit": ARCHIVE_COMMIT,
            "frontier": "topFrontierOverall",
            "frontierRank": 17,
            "stateKey": STATE_KEY,
        },
        "productionCandidateMetrics": {
            "archivedCktV4": EXPECTED_CKT_V4,
            "memory": 36,
            "displacedInitials": 1,
            "displacedVowels": 1,
            "firstSeenGeneration": 389,
            "rpS2": 0.025518214912535617,
            "rpMax": 0.03516423185567739,
            "homeS2": 0.37024921543826345,
            "homeC4": 0.24733118234751789,
            "homeWX": 0.29421729067459096,
            "homeFloor": 0.24733118234751789,
            "wMax": 0.06395887732528338,
            "yMax": 0.07695774976451161,
            "mxScore": 132.2185188145348,
        },
        "notes": [
            "21x26; Common399 399/399 unique; M36, D1, V1; fixed IEUAO auxiliary keys.",
            "Only ordinary initial displacement is f->J; preferred base-final displacement is o->M.",
            "Selected as Overall-17 after joint selection/auxiliary-latency sensitivity analysis.",
        ],
    })

    exact_path = REPLAY / "exact" / f"{IDENT}.json"
    if exact_path.exists():
        scored = json.loads(exact_path.read_text(encoding="utf-8"))
        if scored.get("entry", {}).get("codeList") != entry["codeList"]:
            raise ValueError(f"stale exact replay cache for {IDENT}")
    else:
        score_list = REPLAY / "entries_to_score.json"
        original = score_list.read_bytes() if score_list.exists() else None
        try:
            score_list.write_text(
                json.dumps([entry], ensure_ascii=False, indent=2), encoding="utf-8"
            )
            run(
                "node", "--max-old-space-size=1400", "eval_full.js", "0", "1",
                cwd=REPLAY,
            )
        finally:
            if original is None:
                score_list.unlink(missing_ok=True)
            else:
                score_list.write_bytes(original)
        scored = json.loads(exact_path.read_text(encoding="utf-8"))

    before_snapshot = helper.preservation_snapshot(data, existing_ids)
    original_cwd = Path.cwd()
    try:
        data = helper.integrate(data, source, [entry], {IDENT: scored}, REPLAY)
        helper.integrate_macroxue(data, [entry], REPLAY)
    finally:
        os.chdir(original_cwd)
    if before_snapshot != helper.preservation_snapshot(data, existing_ids):
        raise ValueError("existing catalogue metrics changed")

    scope = [
        "Snow Shenyun 21x26 production candidate",
        f"Overall-17 from {SOURCE_BRANCH}@{SOURCE_COMMIT[:7]}; M36/D1/V1",
    ]
    if scope not in data["r11Research"]["scopeRows"]:
        data["r11Research"]["scopeRows"].append(scope)

    collision_results = helper.attach_four_code_collisions(data, source)
    data["fourCodeCollisionBenchmark"]["catalogueCount"] = len(data["entries"])

    with tempfile.TemporaryDirectory(prefix="shenyun-2126-production-") as location:
        temp = Path(location)
        staged = temp / "staged.html"
        staged.write_text(html[:body] + fixed.pack(data) + html[end:], encoding="utf-8")

        completion = {}
        b_scorer = RESEARCH / "score_shenyun_completion_ckt.js"
        for mapping in ("native", "fixed", "v2"):
            output = temp / f"completion-{mapping}.json"
            command = [
                "node", str(b_scorer), "--html", str(staged), "--output", str(output),
                "--ids", IDENT, "--mapping", "fixed" if mapping == "v2" else mapping,
            ]
            if mapping == "v2":
                command.extend(["--model", "v2"])
            run(*command, cwd=SNOW)
            completion[mapping] = json.loads(output.read_text(encoding="utf-8"))["schemes"][IDENT]

        for mapping, block_name in (("native", "completionB"), ("fixed", "completionBFixed")):
            block = data[block_name]
            item = completion[mapping]
            block["schemes"][IDENT] = item
            base = block["schemes"]["S005"]["modes"]
            block["ensembleScores"][IDENT] = {
                "equal": {str(t): fixed.ensemble(item["modes"], base, t, 1) for t in (0, 150, 300, 600)},
                "word2": {str(t): fixed.ensemble(item["modes"], base, t, 2) for t in (0, 150, 300, 600)},
            }
            extension = {
                "ids": [IDENT],
                "source": f"Overall-17 strict-D1 production candidate @ {ARCHIVE_COMMIT[:7]}",
                "contract": "21x26; fixed IEUAO; full frozen completion replay",
            }
            extensions = block["source"].setdefault("extensions", [])
            if extension not in extensions:
                extensions.append(extension)
        data["completionBV2"]["schemes"][IDENT] = completion["v2"]

        one = copy.copy(data)
        one["entries"] = [entry]
        one_html = temp / "one.html"
        one_html.write_text(html[:body] + fixed.pack(one) + html[end:], encoding="utf-8")
        v3_output = temp / "completion-v3.json"
        run(
            "node", str(ROOT / "tools" / "score_completion_ckt_v3.js"),
            "--html", str(one_html), "--output", str(v3_output), "--limit", "1",
            cwd=ROOT,
        )
        v3 = json.loads(v3_output.read_text(encoding="utf-8"))["schemes"][IDENT]
        data["completionBV3"]["schemes"][IDENT] = v3

        staged.write_text(html[:body] + fixed.pack(data) + html[end:], encoding="utf-8")
        v4_output = temp / "completion-v4.json"
        run(
            "node", str(ROOT / "tools" / "score_completion_ckt_v4.js"),
            "--html", str(staged), "--output", str(v4_output), "--ids", IDENT,
            "--compact", "--no-cross-audit", "--quiet",
            cwd=ROOT,
        )
        v4 = json.loads(v4_output.read_text(encoding="utf-8"))["schemes"][IDENT]
        data["completionBV4"]["schemes"][IDENT] = v4

        terminal_output = temp / "terminal-buckets.json"
        run(
            "node", str(ROOT / "tools" / "score_terminal_buckets.js"),
            "--html", str(staged), "--snow", str(SNOW), "--ids", IDENT,
            "--output", str(terminal_output),
            cwd=ROOT,
        )
        entry["terminalBucketAudit"] = json.loads(
            terminal_output.read_text(encoding="utf-8")
        )[IDENT]

    v3_score = score_v3(
        data["completionBV3"]["schemes"][IDENT]["modes"],
        data["completionBV3"]["schemes"]["S005"]["modes"],
    )
    v4_score = score_v4(
        data["completionBV4"]["schemes"][IDENT]["modes"],
        data["completionBV4"]["schemes"]["S005"]["modes"],
        data["completionBV4"]["cognitiveDefaults"],
    )
    if not math.isclose(v4_score, EXPECTED_CKT_V4, rel_tol=0, abs_tol=1e-12):
        raise ValueError(f"CKT v4 mismatch: {v4_score} != {EXPECTED_CKT_V4}")

    entry["productionCandidateMetrics"].update({
        "replayedCktV3": v3_score,
        "replayedCktV4": v4_score,
        "cktV4Aggregate": aggregate_v4(data["completionBV4"]["schemes"][IDENT]["modes"]),
        "latencySensitivity": {
            "candidateCohort": 14,
            "coreScenarios": 343,
            "tauMs": [300, 1200, 150],
            "firstAuxMs": [150, 600, 75],
            "secondAuxMs": [150, 600, 75],
            "meanRank": 2.3469387755102042,
            "bestRank": 2,
            "worstRank": 3,
            "top3Rate": 1.0,
            "top5Rate": 1.0,
        },
    })

    all_ids = existing_ids | {IDENT}
    after_missing = missing_by_map(data, all_ids)
    for name, missing in after_missing.items():
        if IDENT in missing or missing != before_missing[name]:
            raise ValueError(f"incomplete or changed benchmark map {name}: {sorted(missing)}")

    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    AUDIT.write_text(json.dumps({
        "version": "shenyun-21x26-production-overall17-v1",
        "id": IDENT,
        "catalogueCount": len(data["entries"]),
        "source": entry["r11Provenance"],
        "mappingAudit": entry["mappingAudit"],
        "memoryAuditR2": entry["memoryAuditR2"],
        "logicUniformity": entry["logicUniformity"],
        "logicAudit": entry["logicAudit"],
        "productionCandidateMetrics": entry["productionCandidateMetrics"],
        "terminalBucketAudit": entry["terminalBucketAudit"],
        "fourCodeCollision": collision_results[IDENT],
        "cktTracks": data["ckt"]["tracks"][IDENT],
        "fairCKT": data["fairCKT"]["values"][IDENT],
        "ensemble": {
            name: data[name]["values"][IDENT]
            for name in ("ensemble", "ensembleV2", "ensembleV3", "ensembleV4", "ensembleV5", "ensembleV6")
        },
        "load": data["r11LoadSummaries"][IDENT],
        "pair": data["r11PairMetrics"]["values"][IDENT],
        "macroxue": data["macroxue"]["values"][IDENT],
        "completionB": data["completionB"]["schemes"][IDENT],
        "completionBFixed": data["completionBFixed"]["schemes"][IDENT],
        "completionBV2": data["completionBV2"]["schemes"][IDENT],
        "completionBV3": data["completionBV3"]["schemes"][IDENT],
        "completionBV4": data["completionBV4"]["schemes"][IDENT],
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    fixed.write_payload(HTML, html, body, end, data)
    print(json.dumps({
        "html": str(HTML),
        "audit": str(AUDIT),
        "id": IDENT,
        "catalogue": len(data["entries"]),
        "cktV3": v3_score,
        "cktV4": v4_score,
        "M": entry["memoryAuditR2"]["M"],
        "D": entry["memoryAuditR2"]["ordinaryDisplacedCount"],
        "V": entry["mappingAudit"]["baseFinalDisplacements"],
        "unique399": entry["memoryAuditR2"]["unique"],
        "benchmarkMaps": sorted(after_missing),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
