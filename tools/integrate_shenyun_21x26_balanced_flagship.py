#!/usr/bin/env python3
"""Integrate the reviewed D3/V1 balanced 21x26 flagship into R11."""

from __future__ import annotations

import copy
import importlib
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
AUDIT = (
    ROOT / "a7_CKT_R11_integrated_materials"
    / "shenyun_21x26_d3v1_balanced_flagship_benchmark.json"
)

IDENT = "SNOW-SHENYUN-21X26-D3V1-BALANCED"
SOURCE_BRANCH = "production/ckt-v4-2126-m40-d3-20261031"
SOURCE_COMMIT = "70545d9f182a97700f7b404e18487fb12738ce01"
SOURCE_FRONTIER_RANK = 48
SOURCE_LAYOUT_ID = "SY26-V3-R2-M37-D3-V0-SPEED-01"
STATE_KEY = (
    "151A010F0C0503130D0B060A070905181217151119021018181809161600050B0D0A"
    "0704030904081112171902011006150E11181412160C020F060E0F0C1316080414000E"
)
EXPECTED_CKT_V4 = 9.083575240979211
EXPECTED_CKT_V5 = 9.096336062543223
EXPECTED_CKT_V51_PRE_SOFT_BALANCE = 9.104619328754065
EXPECTED_CKT_V51_SOFT_BALANCE_FIXED = 9.104645274517786
EXPECTED_CKT_V51 = 9.10299979136027
CKT_V51_ROBUSTNESS = {
    "version": "d3v1-ckt51-soft-balance-aux-order-robustness-1",
    "report": (
        "research/notes/2026-11-09-d3v1-ckt-v51-"
        "soft-balance-aux-order-robustness.md"
    ),
    "contract": "native-four-code-top-six-code",
    "lengthBalance": {
        "version": "soft-page-fill-v2",
        "pageSize": 6,
        "maximumCandidates": 120,
        "minimumInputLength": 4,
        "sourceCommit": "a1f471d3704093c3624f56129dd8622db68b6e2d",
        "snowHead": "b719b65f09c016a9ed1417dd3014fe34a7dafbf3",
        "sourceFile": "lua/snow/length_balance.lua",
    },
    "selectedPolicies": {
        "keytao": {"word2": "12", "word3": "12", "word4": "24"},
        "sanpin": {"word2": "12", "word3": "21", "word4": "13"},
    },
    "referencePolicies": {
        "keytao": {"word2": "12", "word3": "213", "word4": "24"},
        "sanpin": {"word2": "12", "word3": "213", "word4": "23"},
    },
    "normalized": {
        "selectedPairScore": EXPECTED_CKT_V51,
        "historicalFixedPairScore": EXPECTED_CKT_V51_SOFT_BALANCE_FIXED,
        "preSoftBalancePairScore": EXPECTED_CKT_V51_PRE_SOFT_BALANCE,
    },
    "grid": {
        "rangePercent": [0, 500],
        "stepPercent": 50,
        "coefficients": [
            "firstAuxMs", "secondAuxMs", "thirdAuxMs",
            "selectionDecisionMs", "scanPerCandidateMs", "pageActionMs",
        ],
        "combinations": 1771561,
    },
    "cases": {
        "keytao": {
            "winner": {
                "policy": "12/12/24", "top1Rate": 0.993030440385626,
                "top3Rate": 0.9995851116614105,
                "meanRank": 1.0087312827500718, "worstRank": 16,
            },
            "runnerUp": {
                "policy": "12/12/23", "top1Rate": 0.0,
                "top3Rate": 0.988968485984959,
                "meanRank": 2.046163806947658, "worstRank": 22,
            },
            "meanRankDistance": 1.0374325241975863,
            "historicalFixed": {
                "policy": "12/21/14", "meanRank": 5.406295916426248,
                "worstRank": 42,
            },
        },
        "sanpin": {
            "winner": {
                "policy": "12/21/13", "top1Rate": 0.887770728752778,
                "top3Rate": 0.9645149108610993,
                "meanRank": 1.2983893865353775, "worstRank": 13,
            },
            "runnerUp": {
                "policy": "12/21/14", "top1Rate": 0.0,
                "top3Rate": 0.8824008882561764,
                "meanRank": 2.7021700071293058, "worstRank": 19,
            },
            "meanRankDistance": 1.4037806205939283,
            "historicalFixed": {
                "policy": "12/21/13", "meanRank": 1.2983893865353775,
                "worstRank": 13,
            },
        },
    },
    "scope": {
        "learnedPriority": "excluded: no personal user history in frozen corpus",
        "downstreamFilters": (
            "fixed/postpone/simplified excluded to match historical CKT scope"
        ),
    },
}
CKT_V51_ROBUST_AGGREGATE = {
    "motorUpperMs": 340.56857871474125,
    "cognitiveMs": 80.28268875775984,
    "effectiveMs": 420.8512674725011,
    "firstAuxRate": 0.20939963883278057,
    "secondAuxRate": 0.04473679923108823,
    "thirdAuxRate": 0.0,
    "selectionRate": 0.006073662615525337,
    "meanRejectedCandidates": 0.007829687436980128,
    "meanPageActions": 2.0251324783289845e-05,
    "meanKeys": 3.841243883358151,
}
NATIVE_B_PATHS = (
    ("j1", "keytao", "character", "p1"),
    ("j2", "keytao", "character", "p2"),
    ("s1", "sanpin", "character", "p1"),
    ("s2", "sanpin", "character", "p2"),
    ("wj1", "keytao", "word", "p1"),
    ("wj2", "keytao", "word", "p2"),
    ("ws1", "sanpin", "word", "p1"),
    ("ws2", "sanpin", "word", "p2"),
)

INITIAL_MAP = {
    "b": "B", "p": "P", "m": "M", "f": "F", "d": "D", "t": "T",
    "n": "N", "l": "L", "g": "G", "k": "K", "h": "H", "j": "J",
    "q": "F", "x": "Y", "zh": "S", "ch": "X", "sh": "V", "r": "R",
    "z": "Z", "c": "C", "s": "Q", "A": "Y", "E": "Y", "O": "Y",
    "W": "J", "Y": "W", "YU": "W",
}

FINAL_MAP = {
    "a": "A", "ai": "F", "an": "L", "ang": "N", "ao": "K",
    "e": "H", "ei": "E", "en": "D", "eng": "J", "er": "E",
    "i": "I", "ia": "R", "ian": "S", "iang": "X", "iao": "Z",
    "ie": "C", "in": "B", "ing": "Q", "iong": "G", "iu": "V",
    "o": "O", "ong": "R", "ou": "Y", "u": "U", "ua": "S",
    "uai": "W", "uan": "M", "uang": "C", "ui": "P", "un": "G",
    "uo": "O", "v": "P", "van": "M", "ve": "T", "vn": "W",
}

SCHEME = {
    "id": IDENT,
    "initialMap": INITIAL_MAP,
    "finalMap": FINAL_MAP,
    "toneKeys": "IEUAO",
    "capacity": [21, 26],
    "actual": [21, 26],
    "M": 40,
    "D": 3,
    "V": 1,
    "label": "D3/V1 综合旗舰",
    "atlasSubfamily": "21x26 M<=40 D<=3 V<=1 balanced production candidate",
    "atlasSource": f"{SOURCE_BRANCH}@{SOURCE_COMMIT}",
}


def run(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(list(args), cwd=cwd, check=True)


def apply_ckt_v51_robustness(entry: dict) -> None:
    metrics = entry.setdefault("productionCandidateMetrics", {})
    metrics["replayedCktV51PreSoftBalance"] = EXPECTED_CKT_V51_PRE_SOFT_BALANCE
    metrics["replayedCktV51SoftBalanceFixed"] = EXPECTED_CKT_V51_SOFT_BALANCE_FIXED
    metrics["replayedCktV51"] = EXPECTED_CKT_V51
    metrics["cktV51Aggregate"] = copy.deepcopy(CKT_V51_ROBUST_AGGREGATE)
    metrics["cktV51Policies"] = {
        "candidate": copy.deepcopy(CKT_V51_ROBUSTNESS["selectedPolicies"]),
        "reference": copy.deepcopy(CKT_V51_ROBUSTNESS["referencePolicies"]),
    }
    metrics["cktV51AuxOrderRobustness"] = copy.deepcopy(CKT_V51_ROBUSTNESS)
    note = (
        "CKT v5.1 soft-page-fill-v2 稳健辅序："
        "形笔辅 12/12/24，调笔辅 12/21/13。"
    )
    if note not in entry.setdefault("notes", []):
        entry["notes"].append(note)


def refresh_audit(entry: dict, catalogue_count: int) -> None:
    if not AUDIT.exists():
        raise FileNotFoundError(f"missing integrated audit: {AUDIT}")
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    audit["version"] = "shenyun-21x26-d3v1-balanced-flagship-v2"
    audit["catalogueCount"] = catalogue_count
    audit["productionCandidateMetrics"] = entry["productionCandidateMetrics"]
    audit["cktV51SoftBalanceRobustness"] = copy.deepcopy(CKT_V51_ROBUSTNESS)
    AUDIT.write_text(
        json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def max_finger_audit(data: dict) -> dict:
    tracks = data["ckt"]["tracks"][IDENT]
    track_name, track = max(tracks.items(), key=lambda item: item[1]["maxFinger"])
    finger_index = max(range(8), key=lambda index: track["finger"][index])
    finger_labels = [
        "左小指", "左无名指", "左中指", "左食指",
        "右食指", "右中指", "右无名指", "右小指",
    ]
    keys = data["reference"]["keys"] + "_"
    layout = data["reference"]["layout"]
    rows = []
    for index, key in enumerate(keys):
        if key not in layout or layout[key]["finger"] != finger_index:
            continue
        load = track["load"][index]
        roles = {
            role: values[index]
            for role, values in track.get("roleLoads", {}).items()
            if values[index] > 0
        }
        rows.append({"key": key, "load": load, "roleLoads": roles})
    rows.sort(key=lambda row: (-row["load"], row["key"]))
    finger_load = track["finger"][finger_index]
    for row in rows:
        row["shareOfFingerLoad"] = row["load"] / finger_load if finger_load else 0
    return {
        "scope": "maximum single-finger share over the frozen 20 A7E contracts",
        "track": track_name,
        "fingerIndex": finger_index,
        "finger": finger_labels[finger_index],
        "load": finger_load,
        "keys": rows,
        "sumOfKeyLoads": sum(row["load"] for row in rows),
    }


def main() -> None:
    if not sys.flags.utf8_mode:
        environment = os.environ.copy()
        environment["PYTHONUTF8"] = "1"
        raise SystemExit(subprocess.call([sys.executable, *sys.argv], env=environment))

    production = importlib.import_module("integrate_shenyun_21x26_production")
    sys.path.insert(0, str(RESEARCH))
    fixed = production.load_module(
        "fixed_frontier_flagship",
        RESEARCH / "integrate_shenyun_21x21_completion_fixed_frontier.py",
    )
    old = production.load_module(
        "old_21x21_flagship",
        RESEARCH / "integrate_shenyun_21x21_low_miss.py",
    )
    helper = old.load_helper(HTML)

    html = HTML.read_text(encoding="utf-8")
    data, body, end = helper.extract_payload(html)
    existing_ids = {entry["id"] for entry in data["entries"]}
    if IDENT in existing_ids:
        present = next(entry for entry in data["entries"] if entry["id"] == IDENT)
        incomplete = [
            name for name, missing in production.missing_by_map(data, existing_ids).items()
            if IDENT in missing
        ]
        metrics = present.get("productionCandidateMetrics", {})
        replayed_v51 = metrics.get("replayedCktV51", math.inf)
        if (
            present.get("r11Provenance", {}).get("stateKey") != STATE_KEY
            or incomplete
            or not any(math.isclose(
                replayed_v51, expected, rel_tol=0, abs_tol=1e-12,
            ) for expected in (
                EXPECTED_CKT_V51_PRE_SOFT_BALANCE, EXPECTED_CKT_V51,
            ))
            or len(present.get("bPathMetricsNative", {})) != len(NATIVE_B_PATHS)
        ):
            raise ValueError(f"partial or mismatched integration: {incomplete}")
        apply_ckt_v51_robustness(present)
        refresh_audit(present, len(existing_ids))
        fixed.write_payload(HTML, html, body, end, data)
        print(json.dumps({
            "updatedIntegration": IDENT,
            "catalogue": len(existing_ids),
            "cktV51PreSoftBalance": EXPECTED_CKT_V51_PRE_SOFT_BALANCE,
            "cktV51SoftBalanceFixed": EXPECTED_CKT_V51_SOFT_BALANCE_FIXED,
            "cktV51": EXPECTED_CKT_V51,
            "policies": CKT_V51_ROBUSTNESS["selectedPolicies"],
            "report": CKT_V51_ROBUSTNESS["report"],
        }, ensure_ascii=False, indent=2))
        return

    before_missing = production.missing_by_map(data, existing_ids)
    source = json.loads((REPLAY / "source.json").read_text(encoding="utf-8"))
    if source["pinyin"] != data["pinyin"]:
        raise ValueError("frozen replay and atlas pinyin indices differ")

    sys.path.insert(0, str(REPLAY))
    split = importlib.import_module("audit").split
    entry = helper.make_entry(source, split, SCHEME)
    entry.update({
        "name": "冰雪神韵·21×26 D3/V1 综合旗舰",
        "family": "Snow Shenyun 21x26",
        "subfamily": "IEUAO 锁定·D3/V1·综合旗舰候选",
        "sourceSearchRound": "m40-d3-production-closure",
        "sourceSearchRank": SOURCE_FRONTIER_RANK,
        "r11Provenance": {
            "parent": SOURCE_LAYOUT_ID,
            "kind": "post-R11 21x26 M40/D3/V1 balanced production candidate",
            "soundLayout": IDENT,
            "branch": SOURCE_BRANCH,
            "commit": SOURCE_COMMIT,
            "frontier": "m40-d3-pareto-frontier-20261031",
            "frontierRank": SOURCE_FRONTIER_RANK,
            "stateKey": STATE_KEY,
        },
        "productionCandidateMetrics": {
            "archivedCktV4": EXPECTED_CKT_V4,
            "memory": 40,
            "displacedInitials": 3,
            "displacedVowels": 1,
            "firstSeenGeneration": 291,
            "rpS2": 0.026153485576957396,
            "rpMax": 0.031498080493856884,
            "homeS2": 0.43912042074215174,
            "homeC4": 0.32555781432170683,
            "homeWX": 0.32518797379127934,
            "homeFloor": 0.32518797379127934,
            "wMax": 0.05738086821659889,
            "yMax": 0.06265999190823264,
            "mxScore": 142.3218631169652,
        },
        "notes": [
            "21x26；Common399 399/399 唯一；M40、D3、V1；toneKeysByTone=IEUAO。",
            "shapeKeysByMeaning=AEUIO；toneDigitsByShapeMeaning=42310。",
            "普通声母位移为 q->F、x->Y、s->Q；基础韵母位移为 e->H。",
            "综合性能候选；最大单指峰值来自 C2 合同的右食指 Y/U/H/J/N/M 键群。",
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
            run("node", "--max-old-space-size=1400", "eval_full.js", "0", "1", cwd=REPLAY)
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
        "Snow Shenyun 21x26 balanced flagship candidate",
        f"D3/V1 balanced from {SOURCE_BRANCH}@{SOURCE_COMMIT[:7]}; M40/D3/V1",
    ]
    if scope not in data["r11Research"]["scopeRows"]:
        data["r11Research"]["scopeRows"].append(scope)
    collision_results = helper.attach_four_code_collisions(data, source)
    data["fourCodeCollisionBenchmark"]["catalogueCount"] = len(data["entries"])

    with tempfile.TemporaryDirectory(prefix="shenyun-2126-d3v1-balanced-") as location:
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
                "source": f"D3/V1 balanced production candidate @ {SOURCE_COMMIT[:7]}",
                "contract": "21x26; toneKeysByTone=IEUAO; full frozen completion replay",
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
        data["completionBV3"]["schemes"][IDENT] = json.loads(
            v3_output.read_text(encoding="utf-8")
        )["schemes"][IDENT]

        staged.write_text(html[:body] + fixed.pack(data) + html[end:], encoding="utf-8")
        v4_output = temp / "completion-v4.json"
        run(
            "node", str(ROOT / "tools" / "score_completion_ckt_v4.js"),
            "--html", str(staged), "--output", str(v4_output), "--ids", IDENT,
            "--compact", "--no-cross-audit", "--quiet", cwd=ROOT,
        )
        data["completionBV4"]["schemes"][IDENT] = json.loads(
            v4_output.read_text(encoding="utf-8")
        )["schemes"][IDENT]

        terminal_output = temp / "terminal-buckets.json"
        run(
            "node", str(ROOT / "tools" / "score_terminal_buckets.js"),
            "--html", str(staged), "--snow", str(SNOW), "--ids", IDENT,
            "--output", str(terminal_output), cwd=ROOT,
        )
        entry["terminalBucketAudit"] = json.loads(
            terminal_output.read_text(encoding="utf-8")
        )[IDENT]

        v5_v51_output = temp / "ckt-v5-v51.json"
        run(
            "node", str(ROOT / "tools" / "score_ckt_v5_v51_scheme.js"),
            "--id", IDENT, "--html", str(staged), "--snow", str(SNOW),
            "--output", str(v5_v51_output), cwd=ROOT,
        )
        v5_v51 = json.loads(v5_v51_output.read_text(encoding="utf-8"))

    native_modes = data["completionB"]["schemes"][IDENT]["modes"]
    entry["bPathMetricsNative"] = {
        key: native_modes[mode][kind][stage]
        for key, mode, kind, stage in NATIVE_B_PATHS
    }
    data["bPathBenchmark"]["schemeCount"] = sum(
        len(candidate.get("bPathMetricsNative", {})) == len(NATIVE_B_PATHS)
        for candidate in data["entries"]
    )

    v3_score = production.score_v3(
        data["completionBV3"]["schemes"][IDENT]["modes"],
        data["completionBV3"]["schemes"]["S005"]["modes"],
    )
    v4_score = production.score_v4(
        data["completionBV4"]["schemes"][IDENT]["modes"],
        data["completionBV4"]["schemes"]["S005"]["modes"],
        data["completionBV4"]["cognitiveDefaults"],
    )
    if not math.isclose(v4_score, EXPECTED_CKT_V4, rel_tol=0, abs_tol=1e-12):
        raise ValueError(f"CKT v4 mismatch: {v4_score} != {EXPECTED_CKT_V4}")
    if not math.isclose(v5_v51["cktV5"]["score"], EXPECTED_CKT_V5, rel_tol=0, abs_tol=1e-12):
        raise ValueError("CKT v5 mismatch")
    if not math.isclose(
        v5_v51["cktV51"]["score"], EXPECTED_CKT_V51_PRE_SOFT_BALANCE,
        rel_tol=0, abs_tol=1e-12,
    ):
        raise ValueError("pre-soft-balance CKT v5.1 mismatch")

    finger_audit = max_finger_audit(data)
    entry["productionCandidateMetrics"].update({
        "replayedCktV3": v3_score,
        "replayedCktV4": v4_score,
        "replayedCktV5": v5_v51["cktV5"]["score"],
        "replayedCktV51": v5_v51["cktV51"]["score"],
        "cktV4Aggregate": production.aggregate_v4(
            data["completionBV4"]["schemes"][IDENT]["modes"]
        ),
        "cktV5Aggregate": v5_v51["cktV5"]["aggregate"],
        "cktV51Aggregate": v5_v51["cktV51"]["aggregate"],
        "cktV5Policies": v5_v51["cktV5"]["policies"],
        "cktV51Policies": v5_v51["cktV51"]["policies"],
        "maxFingerAudit": finger_audit,
    })
    apply_ckt_v51_robustness(entry)

    all_ids = existing_ids | {IDENT}
    after_missing = production.missing_by_map(data, all_ids)
    for name, missing in after_missing.items():
        if IDENT in missing or missing != before_missing[name]:
            raise ValueError(f"incomplete or changed benchmark map {name}: {sorted(missing)}")

    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    AUDIT.write_text(json.dumps({
        "version": "shenyun-21x26-d3v1-balanced-flagship-v2",
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
        "cktV5V51": v5_v51,
        "cktV51SoftBalanceRobustness": CKT_V51_ROBUSTNESS,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    fixed.write_payload(HTML, html, body, end, data)
    print(json.dumps({
        "html": str(HTML),
        "audit": str(AUDIT),
        "id": IDENT,
        "catalogue": len(data["entries"]),
        "cktV3": v3_score,
        "cktV4": v4_score,
        "cktV5": v5_v51["cktV5"]["score"],
        "cktV51PreSoftBalance": v5_v51["cktV51"]["score"],
        "cktV51SoftBalanceFixed": EXPECTED_CKT_V51_SOFT_BALANCE_FIXED,
        "cktV51": EXPECTED_CKT_V51,
        "M": entry["memoryAuditR2"]["M"],
        "D": entry["memoryAuditR2"]["ordinaryDisplacedCount"],
        "V": entry["mappingAudit"]["baseFinalDisplacements"],
        "unique399": entry["memoryAuditR2"]["unique"],
        "maxFingerAudit": finger_audit,
        "benchmarkMaps": sorted(after_missing),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

