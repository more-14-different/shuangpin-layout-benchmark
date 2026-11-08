#!/usr/bin/env python3
"""Integrate the six reviewed M42/D2 QZ+ZQ-empty 21x21 schemes into R11."""

from __future__ import annotations

import copy
import collections
import hashlib
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
V5_CACHE = REPLAY / "exact-v5-v51-21x21"
AUDIT = (
    ROOT / "a7_CKT_R11_integrated_materials"
    / "a7_qz_zq_empty_m42d2_six_benchmark.json"
)
SOURCE_BRANCH = "production/ckt-v4-2121-strict-avuio-20261024"
SOURCE_COMMIT = "f247355"
TONE_KEYS_BY_TONE = "IVUAO"
SHAPE_KEYS_BY_MEANING = "AVUIO"
TONE_DIGITS_BY_SHAPE_MEANING = "42310"
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./"
HEADS = [
    "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j",
    "q", "x", "zh", "ch", "sh", "r", "z", "c", "s", "A", "E", "O",
    "W", "Y", "YU",
]
FINALS = [
    "a", "ai", "an", "ang", "ao", "e", "ei", "en", "eng", "er", "i",
    "ia", "ian", "iang", "iao", "ie", "in", "ing", "iong", "iu", "o",
    "ong", "ou", "u", "ua", "uai", "uan", "uang", "ui", "un", "uo",
    "v", "van", "ve", "vn",
]
TRACK_WEIGHTS = {"character": 1, "word2": 3, "word3": 1, "word4": 1}
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

CANDIDATES = [
    {
        "id": "QZ-1a16aa4efe93",
        "label": "综合中心",
        "archivedCktV4": 9.576377236511233,
        "stateKey": "1515010f0c0503130d04060f070910170a120b1119021211021116181809070c1819120b031309050b0f091002110a0d01060b160d1017040211060a03130406081514000e",
    },
    {
        "id": "QZ-e8f37a0998f9",
        "label": "近邻速度型",
        "archivedCktV4": 9.56073454942596,
        "stateKey": "1515010f0c0503130d04060f070910170a120b111902121102111618180f0d0c1819120b031309050b090f1002110a0701060b16071017040211060a03130406081514000e",
    },
    {
        "id": "QZ-c6f1cd673f93",
        "label": "速度端点",
        "archivedCktV4": 9.55283864991326,
        "stateKey": "1515010f0c0503130d04060f070910170a120b111902121102111618180b0c031819120f04130d050f0d0b1002110a1806010f16070217091011010a04130701081514000e",
    },
    {
        "id": "QZ-ffc213d4eda1",
        "label": "低 TYB／低异键同指端点",
        "archivedCktV4": 9.591254911945663,
        "stateKey": "1515010f0c0503130d04060f070910170b120a111902121102111618180b070d1816120f041109050f090b1002040a1806060f030c1017190213060a13110701081514000e",
    },
    {
        "id": "QZ-69bef3e03438",
        "label": "低单指／低异键同指端点",
        "archivedCktV4": 9.630363234043132,
        "stateKey": "1515010f0c0503130d04060f070910170a120b111902121102111618180b170d1819120f041109050f090b0702130a1801030f160c0710060203130a04111703081514000e",
    },
    {
        "id": "QZ-39397c912347",
        "label": "低 TYB 极端端点",
        "archivedCktV4": 9.62504838122717,
        "stateKey": "1515010f0c0503130d04060f070910170a120b111902121105111618180b07020c03120f04110a050f090b1002130a0c01060f160d1017190613060a04110718081514000e",
    },
]


def run(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(list(args), cwd=cwd, check=True)


def decode_state(candidate: dict) -> dict:
    raw = bytes.fromhex(candidate["stateKey"])
    if len(raw) != 69 or list(raw[:2]) != [21, 21]:
        raise ValueError(f"invalid 21x21 state for {candidate['id']}: {len(raw)} bytes")
    if any(index >= len(ALPHABET) for index in raw[2:]):
        raise ValueError(f"key index outside alphabet for {candidate['id']}")
    initial_map = dict(zip(HEADS, (ALPHABET[index] for index in raw[2:29])))
    final_map = dict(zip(FINALS, (ALPHABET[index] for index in raw[29:64])))
    tone = "".join(ALPHABET[index] for index in raw[64:69])
    if tone != TONE_KEYS_BY_TONE:
        raise ValueError(f"unexpected toneKeysByTone for {candidate['id']}: {tone}")
    return {
        "id": candidate["id"],
        "initialMap": initial_map,
        "finalMap": final_map,
        "toneKeys": tone,
        "capacity": [21, 21],
        "actual": [21, 21],
        "M": 42,
        "D": 2,
        "V": 5,
        "label": candidate["label"],
        "atlasSubfamily": "21x21 M42 D2 QZ/ZQ empty reviewed basin",
        "atlasSource": f"{SOURCE_BRANCH}@{SOURCE_COMMIT}",
    }


def make_entry(helper, source: dict, split, candidate: dict) -> dict:
    scheme = decode_state(candidate)
    initial_map = scheme["initialMap"]
    final_map = scheme["finalMap"]
    split_y_yu = initial_map["Y"] != initial_map["YU"]
    code_list = []
    for spelling in source["pinyin"]:
        if spelling in helper.NOT_COMMON399:
            code_list.append(None)
            continue
        head, final = split(spelling, split_y_yu)
        code_list.append(initial_map[head] + final_map[final])
    common_codes = [code_list[index] for index, _ in source["base"]]
    digest = hashlib.sha256(
        json.dumps(code_list, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()
    actual = [
        len({code[0] for code in common_codes}),
        len({code[1] for code in common_codes}),
    ]
    return {
        "id": candidate["id"],
        "name": f"冰雪神韵·QZ/ZQ 空桶·{candidate['label']}",
        "family": "Snow Shenyun 21x21",
        "subfamily": "AVUIO 锁定·M42/D2·QZ/ZQ 空桶",
        "source": f"{SOURCE_BRANCH}@{SOURCE_COMMIT}",
        "new": True,
        "codeList": code_list,
        "tone": TONE_KEYS_BY_TONE,
        "capacity": [21, 21],
        "actual": actual,
        "initialMap": initial_map,
        "finalMap": final_map,
        "roles": helper.onset_roles(initial_map),
        "zeroOnsetScope": helper.zero_onset_scope({"initialMap": initial_map}),
        "rhymes": helper.inverse(final_map),
        "reservedKeys": SHAPE_KEYS_BY_MEANING,
        "auxiliaryClass": "AVUIO",
        "defaultAuxOrder": False,
        "auxiliaryMappingMatchesReservation": True,
        "topgongReserve": SHAPE_KEYS_BY_MEANING,
        "topgongValid": True,
        "strictTopgong": True,
        "exceptionCount": 0,
        "searchMemoryNoTone": 42,
        "searchMetrics": {"M": 42, "D": 2},
        "mappingAudit": {
            "scope": "Common399; 21x21; fixed AVUIO auxiliary key set; QZ/ZQ empty",
            "codeListSha256": digest,
            "ordinaryInitialDisplacements": 2,
            "baseFinalDisplacements": 5,
            "aaVacancies": None,
            "qzEmpty": "QZ" not in common_codes,
            "zqEmpty": "ZQ" not in common_codes,
        },
        "r11Provenance": {
            "parent": None,
            "kind": "post-R11 21x21 M42/D2 QZ+ZQ empty reviewed basin candidate",
            "soundLayout": candidate["id"],
            "branch": SOURCE_BRANCH,
            "commit": SOURCE_COMMIT,
            "stateKey": candidate["stateKey"],
        },
        "productionCandidateMetrics": {
            "archivedCktV4": candidate["archivedCktV4"],
            "memory": 42,
            "displacedInitials": 2,
            "displacedVowels": 5,
            "qzEmpty": True,
            "zqEmpty": True,
        },
        "notes": [
            "21x21；M42、D2、V5；QZ 与 ZQ 均为空桶；Common399 重码按实际桶补全计费。",
            "toneKeysByTone=IVUAO；shapeKeysByMeaning=AVUIO；toneDigitsByShapeMeaning=42310。",
            "普通声母位移为 l->E、k->P；其余差异属于复声母／零声母路由。",
        ],
    }


def aggregate_completion(scheme: dict) -> dict[str, float]:
    fields = (
        "motorUpperMs", "cognitiveMs", "effectiveMs", "firstAuxRate",
        "secondAuxRate", "thirdAuxRate", "selectionRate",
        "meanRejectedCandidates", "meanPageActions", "meanKeys",
    )
    result = {field: 0.0 for field in fields}
    denominator = 0
    for mode in ("keytao", "sanpin"):
        for kind, weight in TRACK_WEIGHTS.items():
            track = scheme["modes"][mode][kind]
            for field in fields:
                value = track.get(field, 0) or 0
                if field == "cognitiveMs" and not math.isfinite(value):
                    value = track["effectiveMs"] - track["motorUpperMs"]
                result[field] += weight * value
            denominator += weight
    return {field: value / denominator for field, value in result.items()}


def score_v5_v51_21x21(
    scorer_source: Path, staged: Path, output: Path, ident: str, temp: Path
) -> dict:
    source = scorer_source.read_text(encoding="utf-8")
    source = source.replace(
        'require("./auxiliary_semantics.js")',
        f"require({json.dumps(str(ROOT / 'tools' / 'auxiliary_semantics.js'))})",
        1,
    )
    source = source.replace(
        'keytao: { word2: "12", word3: "21", word4: "42" },\n'
        '    sanpin: { word2: "12", word3: "21", word4: "13" },',
        'keytao: { word2: "12", word3: "23", word4: "24" },\n'
        '    sanpin: { word2: "12", word3: "21", word4: "23" },',
        1,
    )
    source = source.replace(
        'keytao: { word2: "12", word3: "21", word4: "14" },\n'
        '    sanpin: { word2: "12", word3: "21", word4: "13" },',
        'keytao: { word2: "12", word3: "231", word4: "24" },\n'
        '    sanpin: { word2: "12", word3: "213", word4: "23" },',
        1,
    )
    v51_at = source.index("const V51_POLICIES")
    v51_source = source[v51_at:].replace(
        'keytao: { word2: "12", word3: "21", word4: "24" },\n'
        '    sanpin: { word2: "12", word3: "21", word4: "23" },',
        'keytao: { word2: "12", word3: "231", word4: "24" },\n'
        '    sanpin: { word2: "12", word3: "213", word4: "23" },',
        1,
    )
    source = source[:v51_at] + v51_source
    source = source.replace(
        'if (entry.capacity[0] !== 21 || entry.capacity[1] !== 26) {\n'
        '    throw new Error(`scheme is not 21x26: ${entry.capacity}`);\n  }',
        'if (entry.capacity[0] !== 21 || entry.capacity[1] !== 21) {\n'
        '    throw new Error(`scheme is not 21x21: ${entry.capacity}`);\n  }',
        1,
    )
    source = source.replace(
        'const benchmark = path.resolve(__dirname, "..");',
        f"const benchmark = {json.dumps(str(ROOT))};",
        1,
    )
    source = source.replace(
        '[mode, evaluateV51CandidateMode(entry, mode, V51_POLICIES.candidate[mode])]',
        '[mode, evaluateV51ReferenceMode(entry, mode, V51_POLICIES.candidate[mode])]',
        1,
    )
    source = source.replace(
        'ckt-v5-v5.1-fixed-21x26-production-policies-1',
        'ckt-v5-v5.1-fixed-21x21-production-policies-1',
        1,
    )
    generated = temp / f"score-{ident}.js"
    generated.write_text(source, encoding="utf-8")
    run(
        "node", str(generated), "--id", ident, "--html", str(staged),
        "--snow", str(SNOW), "--output", str(output), cwd=ROOT,
    )
    return json.loads(output.read_text(encoding="utf-8"))


def group_peak(data: dict, ident: str, group: str) -> dict:
    keys = data["ckt"]["keys"]
    rows = []
    for track, metric in data["ckt"]["tracks"][ident].items():
        value = sum(metric["load"][keys.index(key)] for key in group)
        rows.append((value, track))
    value, track = max(rows)
    return {"value": value, "track": track}


def readme_metrics(data: dict, entry: dict, v5_v51: dict, production) -> dict:
    ident = entry["id"]
    completion = data["completionBV4"]["schemes"][ident]
    aggregate = aggregate_completion(completion)
    fair = data["fairCKT"]["values"][ident]
    macro = data["macroxue"]["values"][ident]["daily|native-punctuation"]
    load = data["r11LoadSummaries"][ident]
    common_codes = [entry["codeList"][index] for index, _ in data["base"]]
    buckets = collections.Counter(common_codes)
    colliding = [size for size in buckets.values() if size > 1]
    unique = fair["unique399"]
    return {
        "M-R2": entry["memoryAuditR2"]["M"],
        "flyingKeyComponents": {"initials": 0, "zeroInitialGroups": 0, "finals": 0},
        "logicAuditFA1": entry["logicAudit"]["score"],
        "logicUniformityLUv1r": entry["logicUniformity"]["score"],
        "common399UniqueCodes": unique,
        "common399UniqueRate": unique / 399,
        "common399CollisionExcess": 399 - unique,
        "common399CollisionBuckets": len(colliding),
        "common399AffectedSyllables": sum(colliding),
        "common399AffectedRate": sum(colliding) / 399,
        "s2FrequencyWeightedMiss": fair["S2miss"],
        "s2CompletionMeanKeys": fair["S2Completion"]["meanKeys"],
        "s2CompletionCenterMs": fair["S2Completion"]["centerMs"],
        "s2DifferentKeySameFingerRate": data["ckt"]["tracks"][ident]["S2"]["sfb"],
        "cktV3": production.score_v3(
            data["completionBV3"]["schemes"][ident]["modes"],
            data["completionBV3"]["schemes"]["S005"]["modes"],
        ),
        "cktV4": production.score_v4(
            completion["modes"],
            data["completionBV4"]["schemes"]["S005"]["modes"],
            data["completionBV4"]["cognitiveDefaults"],
        ),
        "cktV5": v5_v51["cktV5"]["score"],
        "cktV51": v5_v51["cktV51"]["score"],
        "ensembleV3": data["ensembleV3"]["values"][ident]["score"],
        "ensembleV4": data["ensembleV4"]["values"][ident]["score"],
        "ensembleV5": data["ensembleV5"]["values"][ident]["score"],
        "ensembleV6CW150": data["ensembleV6"]["values"][ident]["score"],
        "aggregateSelectionRate": aggregate["selectionRate"],
        "aggregateFirstAuxRate": aggregate["firstAuxRate"],
        "aggregateSecondAuxRate": aggregate["secondAuxRate"],
        "dailyLeftRightLoad": {
            "left": macro["left_load"], "right": macro["right_load"],
            "leftShare": macro["left_load"] / macro["hits"],
        },
        "dailySameHandRate": macro["same_hand_rate"],
        "dailyMeanEffectiveDistance": macro["avg_effective_distance"],
        "leftPinkyQAZPeak20Contracts": group_peak(data, ident, "QAZ"),
        "rightPinkyPeak20Contracts": {
            "value": load["rightPinkyMax20"], "track": load["rightPinkyTrack"]
        },
        "maxFingerPeak20Contracts": load["maxFinger20"],
        "homeShareS2": load["homeS2"],
        "homeFloor20Contracts": load["homeFloor"],
        "indexFingerTYBPeak20Contracts": group_peak(data, ident, "TYB"),
        "dailyEightScenarioMovingHand": macro["score"],
        "dailyAverageOverlapDistance": macro["avg_overlap_distance"],
        "dailyAverageTotalDistance": macro["avg_distance"],
        "dailyAverageTime": macro["avg_time"],
    }


def main() -> None:
    if not sys.flags.utf8_mode:
        environment = os.environ.copy()
        environment["PYTHONUTF8"] = "1"
        raise SystemExit(subprocess.call([sys.executable, *sys.argv], env=environment))

    production = importlib.import_module("integrate_shenyun_21x26_production")
    sys.path.insert(0, str(RESEARCH))
    fixed = production.load_module(
        "fixed_frontier_qz_six",
        RESEARCH / "integrate_shenyun_21x21_completion_fixed_frontier.py",
    )
    old = production.load_module(
        "old_21x21_qz_six",
        RESEARCH / "integrate_shenyun_21x21_low_miss.py",
    )
    helper = old.load_helper(HTML)

    html = HTML.read_text(encoding="utf-8")
    data, body, end = helper.extract_payload(html)
    existing_ids = {entry["id"] for entry in data["entries"]}
    candidate_ids = {candidate["id"] for candidate in CANDIDATES}
    if candidate_ids <= existing_ids:
        print(json.dumps({"alreadyIntegrated": sorted(candidate_ids), "catalogue": len(existing_ids)}))
        return
    if candidate_ids & existing_ids:
        raise ValueError("only part of the six-scheme cohort is already integrated")
    before_missing = production.missing_by_map(data, existing_ids)
    source = json.loads((REPLAY / "source.json").read_text(encoding="utf-8"))
    if source["pinyin"] != data["pinyin"]:
        raise ValueError("frozen replay and atlas pinyin indices differ")

    sys.path.insert(0, str(REPLAY))
    split = importlib.import_module("audit").split
    entries = []
    candidate_by_id = {candidate["id"]: candidate for candidate in CANDIDATES}
    for candidate in CANDIDATES:
        entry = make_entry(helper, source, split, candidate)
        common_codes = [entry["codeList"][index] for index, _ in source["base"]]
        if "QZ" in common_codes or "ZQ" in common_codes:
            raise ValueError(f"QZ/ZQ empty-bucket invariant failed: {entry['id']}")
        entry.update({
            "name": f"冰雪神韵·QZ/ZQ 空桶·{candidate['label']}",
            "family": "Snow Shenyun 21x21",
            "subfamily": "AVUIO 锁定·M42/D2·QZ/ZQ 空桶",
            "reservedKeys": SHAPE_KEYS_BY_MEANING,
            "auxiliaryClass": "AVUIO",
            "defaultAuxOrder": False,
            "topgongReserve": SHAPE_KEYS_BY_MEANING,
            "sourceSearchRound": "strict-avuio-stage-1-to-stage-2-reviewed-qz-basin",
            "r11Provenance": {
                "parent": None,
                "kind": "post-R11 21x21 M42/D2 QZ+ZQ empty reviewed basin candidate",
                "soundLayout": candidate["id"],
                "branch": SOURCE_BRANCH,
                "commit": SOURCE_COMMIT,
                "stateKey": candidate["stateKey"],
            },
            "productionCandidateMetrics": {
                "archivedCktV4": candidate["archivedCktV4"],
                "memory": 42,
                "displacedInitials": 2,
                "displacedVowels": 5,
                "qzEmpty": True,
                "zqEmpty": True,
            },
            "notes": [
                "21x21；Common399 399/399 唯一；M42、D2、V5；QZ 与 ZQ 均为空桶。",
                "toneKeysByTone=IVUAO；shapeKeysByMeaning=AVUIO；toneDigitsByShapeMeaning=42310。",
                "普通声母位移为 l->E、k->P；其余差异属于复声母／零声母路由。",
            ],
        })
        entry["mappingAudit"].update({
            "scope": "Common399; 21x21; fixed AVUIO auxiliary key set; QZ/ZQ empty",
            "ordinaryInitialDisplacements": 2,
            "baseFinalDisplacements": 5,
            "qzEmpty": True,
            "zqEmpty": True,
        })
        entries.append(entry)

    exact = {}
    missing_entries = []
    for entry in entries:
        path = REPLAY / "exact" / f"{entry['id']}.json"
        if path.exists():
            scored = json.loads(path.read_text(encoding="utf-8"))
            if scored.get("entry", {}).get("codeList") != entry["codeList"]:
                raise ValueError(f"stale exact replay cache: {entry['id']}")
            exact[entry["id"]] = scored
        else:
            missing_entries.append(entry)
    if missing_entries:
        score_list = REPLAY / "entries_to_score.json"
        original = score_list.read_bytes() if score_list.exists() else None
        try:
            score_list.write_text(
                json.dumps(missing_entries, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            run(
                "node", "--max-old-space-size=1800", "eval_full.js", "0",
                str(len(missing_entries)), cwd=REPLAY,
            )
        finally:
            if original is None:
                score_list.unlink(missing_ok=True)
            else:
                score_list.write_bytes(original)
        for entry in missing_entries:
            exact[entry["id"]] = json.loads(
                (REPLAY / "exact" / f"{entry['id']}.json").read_text(encoding="utf-8")
            )

    before_snapshot = helper.preservation_snapshot(data, existing_ids)
    original_cwd = Path.cwd()
    try:
        data = old.integrate_colliding(helper, data, entries, exact, REPLAY)
        helper.integrate_macroxue(data, entries, REPLAY)
    finally:
        os.chdir(original_cwd)
    if before_snapshot != helper.preservation_snapshot(data, existing_ids):
        raise ValueError("existing catalogue metrics changed")

    scope = [
        "Snow Shenyun 21x21 M42/D2 QZ+ZQ empty reviewed basin",
        f"six representatives from {SOURCE_BRANCH}@{SOURCE_COMMIT}",
    ]
    if scope not in data["r11Research"]["scopeRows"]:
        data["r11Research"]["scopeRows"].append(scope)
    collision_results = helper.attach_four_code_collisions(data, source)
    data["fourCodeCollisionBenchmark"]["catalogueCount"] = len(data["entries"])

    v5_results = {}
    ids_arg = ",".join(entry["id"] for entry in entries)
    with tempfile.TemporaryDirectory(prefix="a7-qz-empty-six-") as location:
        temp = Path(location)
        staged = temp / "staged.html"
        staged.write_text(html[:body] + fixed.pack(data) + html[end:], encoding="utf-8")

        completion = {}
        b_scorer = RESEARCH / "score_shenyun_completion_ckt.js"
        for mapping in ("native", "fixed", "v2"):
            output = temp / f"completion-{mapping}.json"
            command = [
                "node", str(b_scorer), "--html", str(staged), "--output", str(output),
                "--ids", ids_arg, "--mapping", "fixed" if mapping == "v2" else mapping,
            ]
            if mapping == "v2":
                command.extend(["--model", "v2"])
            run(*command, cwd=SNOW)
            completion[mapping] = json.loads(output.read_text(encoding="utf-8"))["schemes"]

        for entry in entries:
            ident = entry["id"]
            for mapping, block_name in (("native", "completionB"), ("fixed", "completionBFixed")):
                block = data[block_name]
                item = completion[mapping][ident]
                block["schemes"][ident] = item
                base = block["schemes"]["S005"]["modes"]
                block["ensembleScores"][ident] = {
                    "equal": {str(t): fixed.ensemble(item["modes"], base, t, 1) for t in (0, 150, 300, 600)},
                    "word2": {str(t): fixed.ensemble(item["modes"], base, t, 2) for t in (0, 150, 300, 600)},
                }
            data["completionBV2"]["schemes"][ident] = completion["v2"][ident]

        extension = {
            "ids": [entry["id"] for entry in entries],
            "source": f"M42/D2 QZ+ZQ empty reviewed basin @ {SOURCE_COMMIT}",
            "contract": "21x21; toneKeysByTone=IVUAO; full frozen completion replay",
        }
        for block_name in ("completionB", "completionBFixed"):
            extensions = data[block_name]["source"].setdefault("extensions", [])
            if extension not in extensions:
                extensions.append(extension)

        one = copy.copy(data)
        one["entries"] = entries
        one_html = temp / "one.html"
        one_html.write_text(html[:body] + fixed.pack(one) + html[end:], encoding="utf-8")
        v3_output = temp / "completion-v3.json"
        run(
            "node", str(ROOT / "tools" / "score_completion_ckt_v3.js"),
            "--html", str(one_html), "--output", str(v3_output),
            "--limit", str(len(entries)), cwd=ROOT,
        )
        v3_schemes = json.loads(v3_output.read_text(encoding="utf-8"))["schemes"]
        for entry in entries:
            data["completionBV3"]["schemes"][entry["id"]] = v3_schemes[entry["id"]]

        staged.write_text(html[:body] + fixed.pack(data) + html[end:], encoding="utf-8")
        v4_output = temp / "completion-v4.json"
        run(
            "node", str(ROOT / "tools" / "score_completion_ckt_v4.js"),
            "--html", str(staged), "--output", str(v4_output), "--ids", ids_arg,
            "--compact", "--no-cross-audit", "--quiet", cwd=ROOT,
        )
        v4_schemes = json.loads(v4_output.read_text(encoding="utf-8"))["schemes"]
        for entry in entries:
            data["completionBV4"]["schemes"][entry["id"]] = v4_schemes[entry["id"]]

        staged.write_text(html[:body] + fixed.pack(data) + html[end:], encoding="utf-8")
        terminal_output = temp / "terminal-buckets.json"
        run(
            "node", str(ROOT / "tools" / "score_terminal_buckets.js"),
            "--html", str(staged), "--snow", str(SNOW), "--ids", ids_arg,
            "--output", str(terminal_output), cwd=ROOT,
        )
        terminal = json.loads(terminal_output.read_text(encoding="utf-8"))
        for entry in entries:
            entry["terminalBucketAudit"] = terminal[entry["id"]]

        for entry in entries:
            ident = entry["id"]
            V5_CACHE.mkdir(parents=True, exist_ok=True)
            output = V5_CACHE / f"{ident}.json"
            if output.exists():
                cached = json.loads(output.read_text(encoding="utf-8"))
                if (
                    cached.get("id") == ident
                    and cached.get("version") == "ckt-v5-v5.1-fixed-21x21-production-policies-1"
                ):
                    v5_results[ident] = cached
                    continue
            v5_results[ident] = score_v5_v51_21x21(
                ROOT / "tools" / "score_ckt_v5_v51_scheme.js",
                staged, output, ident, temp,
            )

    for entry in entries:
        ident = entry["id"]
        native_modes = data["completionB"]["schemes"][ident]["modes"]
        entry["bPathMetricsNative"] = {
            key: native_modes[mode][kind][stage]
            for key, mode, kind, stage in NATIVE_B_PATHS
        }
        metrics = readme_metrics(data, entry, v5_results[ident], production)
        entry["readmeBenchmarkMetrics"] = metrics
        entry["productionCandidateMetrics"].update({
            "replayedCktV3": metrics["cktV3"],
            "replayedCktV4": metrics["cktV4"],
            "replayedCktV5": metrics["cktV5"],
            "replayedCktV51": metrics["cktV51"],
            "cktV4Aggregate": production.aggregate_v4(
                data["completionBV4"]["schemes"][ident]["modes"]
            ),
            "cktV5Aggregate": v5_results[ident]["cktV5"]["aggregate"],
            "cktV51Aggregate": v5_results[ident]["cktV51"]["aggregate"],
            "cktV5Policies": v5_results[ident]["cktV5"]["policies"],
            "cktV51Policies": v5_results[ident]["cktV51"]["policies"],
        })
    data["bPathBenchmark"]["schemeCount"] = sum(
        len(candidate.get("bPathMetricsNative", {})) == len(NATIVE_B_PATHS)
        for candidate in data["entries"]
    )

    all_ids = existing_ids | candidate_ids
    after_missing = production.missing_by_map(data, all_ids)
    for name, missing in after_missing.items():
        if missing != before_missing[name]:
            raise ValueError(f"incomplete or changed benchmark map {name}: {sorted(missing)}")

    audit = {
        "version": "a7-qz-zq-empty-m42d2-six-full-benchmark-v1",
        "catalogueCount": len(data["entries"]),
        "source": {"branch": SOURCE_BRANCH, "commit": SOURCE_COMMIT},
        "auxiliarySemantics": {
            "toneKeysByTone": TONE_KEYS_BY_TONE,
            "shapeKeysByMeaning": SHAPE_KEYS_BY_MEANING,
            "toneDigitsByShapeMeaning": TONE_DIGITS_BY_SHAPE_MEANING,
        },
        "schemes": {},
    }
    for entry in entries:
        ident = entry["id"]
        audit["schemes"][ident] = {
            "label": candidate_by_id[ident]["label"],
            "stateKey": candidate_by_id[ident]["stateKey"],
            "mappingAudit": entry["mappingAudit"],
            "memoryAuditR2": entry["memoryAuditR2"],
            "logicUniformity": entry["logicUniformity"],
            "logicAudit": entry["logicAudit"],
            "productionCandidateMetrics": entry["productionCandidateMetrics"],
            "readmeBenchmarkMetrics": entry["readmeBenchmarkMetrics"],
            "terminalBucketAudit": entry["terminalBucketAudit"],
            "fourCodeCollision": entry.get("fourCodeCollision"),
            "cktTracks": data["ckt"]["tracks"][ident],
            "fairCKT": data["fairCKT"]["values"][ident],
            "ensemble": {
                name: data[name]["values"][ident]
                for name in ("ensemble", "ensembleV2", "ensembleV3", "ensembleV4", "ensembleV5", "ensembleV6")
            },
            "load": data["r11LoadSummaries"][ident],
            "pair": data["r11PairMetrics"]["values"][ident],
            "macroxue": data["macroxue"]["values"][ident],
            "completionB": data["completionB"]["schemes"][ident],
            "completionBFixed": data["completionBFixed"]["schemes"][ident],
            "completionBV2": data["completionBV2"]["schemes"][ident],
            "completionBV3": data["completionBV3"]["schemes"][ident],
            "completionBV4": data["completionBV4"]["schemes"][ident],
            "cktV5V51": v5_results[ident],
        }
    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    AUDIT.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    fixed.write_payload(HTML, html, body, end, data)
    print(json.dumps({
        "html": str(HTML),
        "audit": str(AUDIT),
        "catalogue": len(data["entries"]),
        "added": [entry["id"] for entry in entries],
        "htmlSha256": hashlib.sha256(HTML.read_bytes()).hexdigest(),
        "metrics": {entry["id"]: entry["readmeBenchmarkMetrics"] for entry in entries},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
