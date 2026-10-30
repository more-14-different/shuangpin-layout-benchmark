"""Score the external flypy21 layout against the frozen R11 benchmark.

The script never writes to the Snow Pinyin source repository.  It extracts the
local frozen replay into a temporary directory, scores one synthetic catalogue
entry, and writes a compact JSON result under this repository's ignored cache.
"""

from __future__ import annotations

import argparse
import base64
import copy
import gzip
import hashlib
import importlib
import json
import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "a7_CKT_R11.html"
REPLAY_ZIP = ROOT / "a7_CKT_R11_integrated_materials" / "R11_integrated_replay.zip"
SNOW_REPO = Path(r"D:\C2D\Documents\rime-snow-pinyin")
SCHEME_ID = "FLYPY21-GROUP-D"
PUBLISHED_ID = "gen0107-p5-f1h-11_13-d2-f25_26-d3-f4_22-d4-f11_13"

INITIAL_MAP = {
    "b": "B", "p": "P", "m": "M", "f": "F", "d": "D", "t": "T",
    "n": "N", "l": "L", "g": "G", "k": "K", "h": "H", "j": "J",
    "q": "Q", "x": "X", "zh": "W", "ch": "F", "sh": "E", "r": "R",
    "z": "Z", "c": "C", "s": "S", "A": "C", "E": "C", "O": "C",
    "W": "W", "Y": "Y", "YU": "Y",
}

FINAL_MAP = {
    "a": "X", "ai": "D", "an": "R", "ang": "H", "ao": "C",
    "e": "E", "ei": "W", "en": "F", "eng": "G", "er": "M",
    "i": "K", "ia": "X", "ian": "M", "iang": "F", "iao": "N",
    "ie": "P", "in": "B", "ing": "L", "iong": "S", "iu": "Q",
    "o": "L", "ong": "S", "ou": "Z", "u": "J", "ua": "X",
    "uai": "P", "uan": "T", "uang": "M", "ui": "B", "un": "Y",
    "uo": "L", "v": "J", "van": "T", "ve": "R", "vn": "Y",
}


def extract_payload(html: str) -> tuple[dict, int, int]:
    marker = '<script id="payload"'
    at = html.index(marker)
    start = html.index(">", at) + 1
    end = html.index("</script>", start)
    data = json.loads(gzip.decompress(base64.b64decode(html[start:end])))
    return data, start, end


def write_payload_html(template: str, start: int, end: int, data: dict, path: Path) -> None:
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace(
        "</script", "<\\/script"
    ).encode()
    encoded = base64.b64encode(gzip.compress(raw, compresslevel=6, mtime=0)).decode()
    path.write_text(template[:start] + encoded + template[end:], encoding="utf-8")


def inverse(mapping: dict[str, str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for token, key in mapping.items():
        result.setdefault(key, []).append(token)
    return {key: sorted(tokens) for key, tokens in result.items()}


def onset_roles(initial_map: dict[str, str]) -> dict[str, list[str]]:
    return {
        key: sorted(token for token, value in initial_map.items() if value == key)
        for key in sorted(set(initial_map.values()))
    }


def build_entry(source: dict, split) -> dict:
    code_list: list[str | None] = []
    unsupported: list[str] = []
    for spelling in source["pinyin"]:
        try:
            head, final = split(spelling, False)
            code = INITIAL_MAP[head] + FINAL_MAP[final]
        except (KeyError, ValueError):
            code = None
            unsupported.append(spelling)
        code_list.append(code)

    common_indices = [index for index, *_ in source["base"]]
    common_codes = [code_list[index] for index in common_indices]
    if len(common_codes) != 399 or any(code is None for code in common_codes):
        raise RuntimeError("flypy21 does not completely encode Common399")
    actual = [len({code[0] for code in common_codes}), len({code[1] for code in common_codes})]
    digest = hashlib.sha256(
        json.dumps(code_list, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()
    return {
        "id": SCHEME_ID,
        "name": "群友 flypy21 方案 D",
        "family": "External flypy21",
        "subfamily": "community submission",
        "source": "clip_20261030_172115_075_001_31f1b1d4.txt + keyboard image",
        "new": True,
        "codeList": code_list,
        "tone": "IVUAO",
        "capacity": [21, 21],
        "actual": actual,
        "initialMap": INITIAL_MAP,
        "finalMap": FINAL_MAP,
        "roles": onset_roles(INITIAL_MAP),
        "zeroOnsetScope": "pure-y",
        "rhymes": inverse(FINAL_MAP),
        "reservedKeys": "AIUOV",
        "auxiliaryClass": "AIUOV",
        "defaultAuxOrder": False,
        "auxiliaryMappingMatchesReservation": True,
        "topgongReserve": "AIUOV",
        "topgongValid": True,
        "strictTopgong": True,
        "exceptionCount": 0,
        "mappingAudit": {
            "scope": "Common399; 21x21",
            "codeListSha256": digest,
            "ordinaryInitialDisplacements": 0,
            "baseFinalDisplacements": 4,
        },
        "r11Provenance": {
            "parent": None,
            "kind": "one-off equal-footing external comparison",
            "soundLayout": SCHEME_ID,
        },
        "notes": [
            "Text and image agree on the sound layout.",
            "IVUAO is assumed for the five auxiliary keys because the submission only specifies sound keys.",
        ],
        "unsupportedPinyin": unsupported,
    }


def run(command: list[str], cwd: Path) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def ckt_v3_score(modes: dict, reference: dict) -> float:
    tracks = [
        ("keytao", "character", 1, 2), ("keytao", "word2", 3, 4),
        ("keytao", "word3", 1, 3), ("keytao", "word4", 1, 4),
        ("sanpin", "character", 1, 2), ("sanpin", "word2", 3, 4),
        ("sanpin", "word3", 1, 3), ("sanpin", "word4", 1, 4),
    ]
    total = 0.0
    weighted = 0.0
    for mode, kind, weight, base in tracks:
        row = modes[mode][kind]
        anchor = reference[mode][kind]

        def effective(value: dict) -> float:
            first = 1 - value["stageWeight"][0]
            second = max(0.0, value["meanKeys"] - base - first)
            return (
                value["completionUpperMs"]
                + 600 * value["p2"]
                + 300 * first
                + 300 * second
            )

        weighted += weight * (effective(row) / effective(anchor)) ** 4
        total += weight
    return 10 * (weighted / total) ** 0.25


def ckt_v4_components(modes: dict) -> dict[str, float]:
    weights = {"character": 1, "word2": 3, "word3": 1, "word4": 1}
    components = {
        "motor": 0.0, "firstAux": 0.0, "secondAux": 0.0,
        "selectionDecision": 0.0, "scan": 0.0, "selectionAction": 0.0,
        "page": 0.0,
    }
    total_weight = 0.0
    for mode in ("keytao", "sanpin"):
        for kind, weight in weights.items():
            row = modes[mode][kind]
            components["motor"] += weight * row["motorUpperMs"]
            components["firstAux"] += weight * 300 * row["firstAuxRate"]
            components["secondAux"] += weight * 300 * row["secondAuxRate"]
            components["selectionDecision"] += weight * 600 * row["selectionRate"]
            components["scan"] += weight * 50 * row["meanRejectedCandidates"]
            components["page"] += weight * 300 * row["meanPageActions"]
            total_weight += weight
    for key in components:
        components[key] /= total_weight
    components["total"] = sum(components.values())
    return components


def aggregate_rate(modes: dict, field: str) -> float:
    weights = {"character": 1, "word2": 3, "word3": 1, "word4": 1}
    return sum(
        weights[kind] * modes[mode][kind][field]
        for mode in ("keytao", "sanpin")
        for kind in weights
    ) / 12


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "research" / ".cache" / "flypy21-comparison.json",
    )
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    html_text = HTML.read_text(encoding="utf-8")
    current, payload_start, payload_end = extract_payload(html_text)

    with tempfile.TemporaryDirectory(prefix="flypy21-benchmark-", ignore_cleanup_errors=True) as temp_name:
        temp = Path(temp_name)
        with zipfile.ZipFile(REPLAY_ZIP) as archive:
            archive.extractall(temp)
        replay = temp / "R11_integrated_replay"
        source_html = (replay / "inputs" / "source484.html").read_text(encoding="utf-8")
        source, _, _ = extract_payload(source_html)
        (replay / "source.json").write_text(
            json.dumps(source, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        if source["pinyin"] != current["pinyin"]:
            raise RuntimeError("frozen replay and current atlas pinyin indices differ")

        sys.path.insert(0, str(replay))
        split = importlib.import_module("audit").split
        memory_r2 = importlib.import_module("memory_r2")
        logic = importlib.import_module("logic")
        metrics_r8 = importlib.import_module("metrics_r8")
        entry = build_entry(source, split)

        (replay / "entries_to_score.json").write_text(
            json.dumps([entry], ensure_ascii=False, indent=2), encoding="utf-8"
        )
        run(["node", "--max-old-space-size=1400", "eval_full.js", "0", "1"], replay)
        exact = json.loads((replay / "exact" / f"{SCHEME_ID}.json").read_text(encoding="utf-8"))

        audit = memory_r2.audit(source, entry)
        entry["memoryAuditR2"] = audit
        entry["memoryAuditNF4"] = copy.deepcopy(audit)
        entry["memory"] = {
            "firstLinks": audit["firstLinks"],
            "finalLinks": audit["finalLinks"],
            "nontrivialFinals": audit["finalLinks"],
            "toneLinks": 5,
            "conditionalBranches": audit["branchCount"],
            "commonNontrivial": audit["M"] + 5,
            "definition": "M-R2-explicit",
            "scope": audit["scope"],
        }
        entry["logicUniformity"] = logic.lu(entry)
        entry["logicAudit"] = logic.fa(entry)
        entry["sound"] = copy.deepcopy(exact["quick"][SCHEME_ID + "|S2"])
        entry["sound"]["memory"] = audit["M"] + 5

        augmented = copy.deepcopy(current)
        augmented["entries"].append(entry)
        for version in ("ensemble", "ensembleV2", "ensembleV3", "ensembleV4", "ensembleV5"):
            augmented[version]["values"][SCHEME_ID] = copy.deepcopy(exact["scores"][version])
        for key, value in exact["quick"].items():
            augmented["quick"][key] = value
        augmented["ckt"]["tracks"][SCHEME_ID] = exact["tracks"]
        augmented["ckt"]["eligibility"][SCHEME_ID] = {
            "eligible": exact["fair"]["domainValid"],
            "unique399": audit["unique"],
            "actualI": entry["actual"][0],
            "actualR": entry["actual"][1],
            "reasons": [],
        }
        augmented["fairCKT"]["values"][SCHEME_ID] = exact["fair"]
        augmented["finalSelection"]["factorAuditValues"][SCHEME_ID] = entry["logicAudit"]

        v6_all = metrics_r8.compute(augmented)
        v6 = v6_all["values"][SCHEME_ID]

        sys.path.insert(0, str(ROOT / "tools"))
        adapter = importlib.import_module("integrate_shenyun_21x28")
        load = adapter.load_summary(augmented, SCHEME_ID)
        adapter.integrate_macroxue(augmented, [entry], replay)
        moving = augmented["macroxue"]["values"][SCHEME_ID]

        s005 = next(row for row in augmented["entries"] if row["id"] == "S005")
        scoring_data = copy.deepcopy(augmented)
        scoring_data["entries"] = [entry, s005] + [
            row for row in augmented["entries"] if row["id"] not in {SCHEME_ID, "S005"}
        ]
        temp_html = temp / "flypy21-r11.html"
        write_payload_html(html_text, payload_start, payload_end, scoring_data, temp_html)

        v3_path = temp / "v3.json"
        run([
            "node", str(ROOT / "tools" / "score_completion_ckt_v3.js"),
            "--html", str(temp_html), "--output", str(v3_path), "--limit", "2",
        ], ROOT)
        v3_data = json.loads(v3_path.read_text(encoding="utf-8"))["schemes"]
        v3_score = ckt_v3_score(v3_data[SCHEME_ID]["modes"], v3_data["S005"]["modes"])

        v4_path = temp / "v4.json"
        run([
            "node", str(ROOT / "tools" / "score_completion_ckt_v4.js"),
            "--html", str(temp_html), "--snow", str(SNOW_REPO),
            "--ids", f"{SCHEME_ID},S005", "--output", str(v4_path), "--quiet",
        ], ROOT)
        v4_data = json.loads(v4_path.read_text(encoding="utf-8"))
        v4_friend = v4_data["schemes"][SCHEME_ID]

        terminal_path = temp / "terminal-buckets.json"
        run([
            "node", str(ROOT / "tools" / "score_terminal_buckets.js"),
            "--html", str(temp_html), "--snow", str(SNOW_REPO),
            "--ids", SCHEME_ID, "--output", str(terminal_path),
        ], ROOT)
        terminal_buckets = json.loads(terminal_path.read_text(encoding="utf-8"))[SCHEME_ID]

        common_indices = [index for index, *_ in current["base"]]
        common_codes = [entry["codeList"][index] for index in common_indices]
        buckets: dict[str, list[str]] = {}
        for index, code in zip(common_indices, common_codes):
            buckets.setdefault(code, []).append(current["pinyin"][index])
        collisions = {code: values for code, values in buckets.items() if len(values) > 1}

        daily = moving["daily|native-punctuation"]
        result = {
            "version": 1,
            "policy": {
                "schemeId": SCHEME_ID,
                "publishedId": PUBLISHED_ID,
                "baselineId": "S005",
                "capacity": [21, 21],
                "assumedAuxiliaryOrder": "IVUAO",
                "sourceRepositoryWritten": False,
            },
            "mapping": {
                "initialMap": INITIAL_MAP,
                "finalMap": FINAL_MAP,
                "actual": entry["actual"],
                "unsupportedPinyin": entry["unsupportedPinyin"],
                "common399UniqueCodes": len(buckets),
                "common399CollisionExcess": 399 - len(buckets),
                "common399CollisionBuckets": len(collisions),
                "common399AffectedSyllables": sum(map(len, collisions.values())),
                "collisionBuckets": collisions,
            },
            "metrics": {
                "M-R2": audit["M"],
                "ordinaryInitialDisplacements": audit["ordinaryDisplacedCount"],
                "vowelDisplacements": sum(FINAL_MAP[value] != value.upper() for value in "aeiou"),
                "logicAuditFA1": entry["logicAudit"]["score"],
                "logicUniformityLUv1r": entry["logicUniformity"]["score"],
                "s2FrequencyWeightedMiss": exact["fair"]["S2miss"],
                "s2CompletionMeanKeys": exact["fair"]["S2Completion"]["meanKeys"],
                "s2CompletionCenterMs": exact["fair"]["S2Completion"]["centerMs"],
                "cktV3": v3_score,
                "cktV4": v4_friend["score"],
                "ensembleV3": exact["scores"]["ensembleV3"]["score"],
                "ensembleV4": exact["scores"]["ensembleV4"]["score"],
                "ensembleV5": exact["scores"]["ensembleV5"]["score"],
                "ensembleV6CW150": v6["score"],
                "aggregateSelectionRate": aggregate_rate(v4_friend["modes"], "selectionRate"),
                "aggregateFirstAuxRate": aggregate_rate(v4_friend["modes"], "firstAuxRate"),
                "aggregateSecondAuxRate": aggregate_rate(v4_friend["modes"], "secondAuxRate"),
                "dailyLeftRightLoad": {
                    "left": daily["left_load"], "right": daily["right_load"],
                    "leftShare": daily["left_load"] / daily["hits"],
                },
                "dailySameHandRate": daily["same_hand_rate"],
                "dailyMeanEffectiveDistance": daily["avg_effective_distance"],
                "leftPinkyQAZPeak20Contracts": load["leftPinkyMax20"],
                "leftPinkyPeakTrack": load["leftPinkyTrack"],
                "rightPinkyPeak20Contracts": load["rightPinkyMax20"],
                "rightPinkyPeakTrack": load["rightPinkyTrack"],
                "maxFingerPeak20Contracts": load["maxFinger20"],
                "homeShareS2": load["homeS2"],
                "indexFingerTYBPeak20Contracts": max(
                    sum(metric["load"][augmented["reference"]["keys"].index(key)] for key in "TYB")
                    for metric in exact["tracks"].values()
                ),
                "homeFloor20Contracts": min(load["homeByTrack"].values()),
                "dailyEightScenarioMovingHand": daily["score"],
            },
            "cktV4": {
                "components": ckt_v4_components(v4_friend["modes"]),
                "modes": v4_friend["modes"],
                "scenarioScores": v4_friend["scenarioScores"],
                "crossLength": v4_friend["crossLength"],
                "terminalWordCollisionBuckets": terminal_buckets,
            },
            "historicalExact": {
                "verification": exact["verification"],
                "fair": exact["fair"],
                "scores": exact["scores"],
                "loadSummary": load,
                "movingHand": moving,
                "v6": v6,
            },
        }

    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    if not sys.flags.utf8_mode:
        environment = os.environ.copy()
        environment["PYTHONUTF8"] = "1"
        raise SystemExit(subprocess.call([sys.executable, *sys.argv], env=environment))
    main()
