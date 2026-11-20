#!/usr/bin/env python3
"""Append the three original UM40 layouts, replaying every native R11 column.

Usage: python -X utf8 tools/integrate_um40_r11.py
Requires the existing R11 replay cache and local rime-snow-pinyin scorers.
The HTML is replaced only after all scores and preservation checks pass.
Use --resume after scoring is interrupted; cached inputs and old rows are verified.
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
import sys
from pathlib import Path

import integrate_a7_qz_empty_six as shared
import integrate_shenyun_21x26_production as production

ROOT, HTML, SNOW, REPLAY = shared.ROOT, shared.HTML, shared.SNOW, shared.REPLAY
WORK = ROOT / "research/.cache/um40-r11-publication-20261120"
AUDIT = ROOT / "research/notes/2026-11-20-um40-r11-publication.json"
IDS = ["UM40-dff81aa57dd2", "UM40-8acdbdac3fad", "UM40-ac9707a932d1"]


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(value):
    return hashlib.sha256(value).hexdigest()


def make_entry(helper, data, candidate):
    im, fm, codes = candidate["initialMap"], candidate["finalMap"], candidate["codeList"]
    common = [codes[i] for i, _ in data["base"]]
    assert len(set(common)) == 399 and "QZ" not in common
    assert [data["pinyin"][i] for i, _ in data["base"] if codes[i] == "ZQ"] == ["zen"]
    return {
        "id": candidate["id"], "name": f"冰雪神韵2126·UM40·{candidate['label']}",
        "family": "Snow Shenyun 21x26", "subfamily": "UM40·M40/D3·QZ空桶／ZQ=zen",
        "source": "research/notes/2026-11-20-um40-fixed-initial-rhymes.json",
        "new": True, "codeList": codes, "tone": "IEUAO", "capacity": [21, 26],
        "actual": [len({c[0] for c in common}), len({c[1] for c in common})],
        "initialMap": im, "finalMap": fm, "roles": helper.onset_roles(im),
        "rhymes": helper.inverse(fm), "zeroOnsetScope": helper.zero_onset_scope({"initialMap": im}),
        "reservedKeys": "AEUIO", "auxiliaryClass": "AEUIO", "defaultAuxOrder": False,
        "auxiliaryMappingMatchesReservation": True, "topgongReserve": "AEUIO",
        "topgongValid": True, "strictTopgong": True, "exceptionCount": 0,
        "searchMemoryNoTone": 40, "searchMetrics": {"M": 40, "D": 3},
        "mappingAudit": {
            "scope": "Common399; 21x26; QZ empty; ZQ=zen",
            "codeListSha256": sha(json.dumps(codes, ensure_ascii=False, separators=(",", ":")).encode()),
            "ordinaryInitialDisplacements": 3, "baseFinalDisplacements": 1,
            "aaVacancies": None, "qzEmpty": True, "zqEmpty": False,
        },
        "r11Provenance": {"parent": "T2126-V52-M4-ec60a3637a99", "kind": "UM40 original three; not double-empty repair"},
        "productionCandidateMetrics": {"memory": 40, "displacedInitials": 3, "displacedVowels": 1,
                                       "qzEmpty": True, "zqEmpty": False},
        "um40Publication": {"label": candidate["label"], "expected": candidate["expected"],
                            "comparison": candidate["comparison"]},
        "notes": [
            "21×26 无调双拼；Common399 399/399 唯一码；M40、D3；三个方案声母相同，仅韵母有差异。",
            "QZ 空桶；ZQ 非空（zen）。这是原方案，不是后续 QZ/ZQ 双空修复版本。",
            "toneKeysByTone=IEUAO；shapeKeysByMeaning=AEUIO；toneDigitsByShapeMeaning=42310。",
            "1x 为默认六项认知成本；2x 为六项成本同步加倍，S005 参考同步重算；未使用完整扰动网格。",
        ],
    }


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(shared.RESEARCH))
    helper = production.load_module("um40_helper", ROOT / "tools/integrate_shenyun_21x28.py")
    fixed = production.load_module("um40_fixed", shared.RESEARCH / "integrate_shenyun_21x21_completion_fixed_frontier.py")
    original = HTML.read_bytes()
    html = original.decode("utf-8")
    data, body, end = helper.extract_payload(html)
    existing_ids = {e["id"] for e in data["entries"]}
    if set(IDS) <= existing_ids:
        assert all(any(e["id"] == ident and e.get("um40Publication") for e in data["entries"]) for ident in IDS)
        print(json.dumps({"alreadyIntegrated": IDS}))
        return
    assert not (set(IDS) & existing_ids), "partial UM40 publication"
    backup = WORK / "before.html"
    if not backup.exists():
        backup.write_bytes(original)
    before = helper.preservation_snapshot(data, existing_ids)
    before_missing = production.missing_by_map(data, existing_ids)
    old_v52 = copy.deepcopy(data["cktV52"])
    shared.run("node", "--max-old-space-size=8192", str(ROOT / "tools/um40_r11.js"), "prepare", str(HTML), str(WORK / "inputs.json"), cwd=ROOT)
    entries = [make_entry(helper, data, c) for c in read(WORK / "inputs.json")]
    source = read(REPLAY / "source.json")
    assert source["pinyin"] == data["pinyin"]
    staged = WORK / "staged.html"
    ids_arg = ",".join(IDS)
    if "--resume" in sys.argv:
        staged_data, _, _ = helper.extract_payload(staged.read_text(encoding="utf-8"))
        staged_entries = {e["id"]: e for e in staged_data["entries"]}
        for e in entries:
            saved = staged_entries[e["id"]]
            for key in ("initialMap", "finalMap", "codeList", "um40Publication"):
                assert saved[key] == e[key], f"stale staged input: {e['id']}/{key}"
        assert before == helper.preservation_snapshot(staged_data, existing_ids)
        assert before_missing == production.missing_by_map(staged_data, existing_ids | set(IDS))
        assert old_v52 == staged_data["cktV52"]
        data = staged_data
        entries = [staged_entries[ident] for ident in IDS]
    else:
        missing = []
        for e in entries:
            cached = REPLAY / "exact" / f"{e['id']}.json"
            if cached.exists():
                assert read(cached)["entry"]["codeList"] == e["codeList"], "stale replay"
            else:
                missing.append(e)
        if missing:
            score_list = REPLAY / "entries_to_score.json"
            previous = score_list.read_bytes() if score_list.exists() else None
            try:
                write(score_list, missing)
                shared.run("node", "--max-old-space-size=1800", "eval_full.js", "0", str(len(missing)), cwd=REPLAY)
            finally:
                if previous is not None:
                    score_list.write_bytes(previous)
                else:
                    score_list.unlink(missing_ok=True)
        exact = {e["id"]: read(REPLAY / "exact" / f"{e['id']}.json") for e in entries}
        prior_cwd = Path.cwd()
        try:
            data = helper.integrate(data, source, entries, exact, REPLAY)
            helper.integrate_macroxue(data, entries, REPLAY)
        finally:
            os.chdir(prior_cwd)
        helper.attach_four_code_collisions(data, source)
        data["fourCodeCollisionBenchmark"]["catalogueCount"] = len(data["entries"])

        def stage():
            staged.write_text(html[:body] + fixed.pack(data) + html[end:], encoding="utf-8")

        stage()
        ids_arg = ",".join(IDS)
        for mapping, block in (("native", "completionB"), ("fixed", "completionBFixed"), ("v2", "completionBV2")):
            output = WORK / f"completion-{mapping}.json"
            args = ["node", str(shared.RESEARCH / "score_shenyun_completion_ckt.js"), "--html", str(staged),
                    "--output", str(output), "--ids", ids_arg, "--mapping", "fixed" if mapping == "v2" else mapping]
            if mapping == "v2":
                args.extend(["--model", "v2"])
            shared.run(*args, cwd=SNOW)
            values = read(output)["schemes"]
            for e in entries:
                ident = e["id"]
                data[block]["schemes"][ident] = values[ident]
                if mapping != "v2":
                    ref = data[block]["schemes"]["S005"]["modes"]
                    data[block]["ensembleScores"][ident] = {
                        name: {str(t): fixed.ensemble(values[ident]["modes"], ref, t, w) for t in (0, 150, 300, 600)}
                        for name, w in (("equal", 1), ("word2", 2))
                    }
        one = copy.copy(data)
        one["entries"] = entries
        single = WORK / "cohort.html"
        single.write_text(html[:body] + fixed.pack(one) + html[end:], encoding="utf-8")
        for version, input_html, extra in ((3, single, ["--limit", "3"]),
                                           (4, staged, ["--ids", ids_arg, "--compact", "--no-cross-audit", "--quiet"])):
            output = WORK / f"completion-v{version}.json"
            shared.run("node", str(ROOT / f"tools/score_completion_ckt_v{version}.js"), "--html", str(input_html),
                       "--output", str(output), *extra, cwd=ROOT)
            values = read(output)["schemes"]
            for e in entries:
                data[f"completionBV{version}"]["schemes"][e["id"]] = values[e["id"]]
        stage()
    terminal_file = WORK / "terminal.json"
    if "--resume" not in sys.argv or not terminal_file.exists():
        shared.run("node", str(ROOT / "tools/score_terminal_buckets.js"), "--html", str(staged),
                   "--snow", str(SNOW), "--ids", ids_arg, "--output", str(terminal_file), cwd=ROOT)
    terminal = read(terminal_file)
    score_file = WORK / "native-scores.json"
    shared.run("node", "--max-old-space-size=8192", str(ROOT / "tools/um40_r11.js"), "score", str(staged), str(score_file), cwd=ROOT)
    scores = read(score_file)["schemes"]
    for e in entries:
        ident = e["id"]
        s = scores[ident]
        e["terminalBucketAudit"] = terminal[ident]
        native = data["completionB"]["schemes"][ident]["modes"]
        e["bPathMetricsNative"] = {key: native[mode][kind][step] for key, mode, kind, step in shared.NATIVE_B_PATHS}
        metrics = shared.readme_metrics(data, e, {"cktV5": s["v5"], "cktV51": s["v51"]}, production)
        # These layouts use one key per family, without flying keys or branches.
        assert e["memoryAuditR2"]["branchCount"] == 0
        metrics["cktV52"] = s["v52"]["score"]
        e["readmeBenchmarkMetrics"] = metrics
        p = e["productionCandidateMetrics"]
        p.update({"replayedCktV3": metrics["cktV3"], "replayedCktV4": metrics["cktV4"],
                  "cktV4Aggregate": production.aggregate_v4(data["completionBV4"]["schemes"][ident]["modes"]),
                  "cktV51BalanceContract": "soft-page-fill-v2", "doubledCktV52": s["doubledV52"]})
        for version, key in (("5", "v5"), ("51", "v51"), ("52", "v52")):
            p[f"replayedCktV{version}"] = s[key]["score"]
            p[f"cktV{version}Aggregate"] = s[key]["aggregate"]
            p[f"cktV{version}Policies"] = s["v5"]["policies"] if version == "5" else s["contract"]["policies"]
        p["cktV52Modes"] = s["v52"]["modes"]
        e["um40Publication"]["doubledV52"] = s["doubledV52"]
        data["cktV52"]["schemes"][ident] = {k: v for k, v in s.items() if k not in ("v5", "doubledV52")}
    data["cktV52"]["counts"] = {
        "untoned": sum(r["kind"] == "untoned" for r in data["cktV52"]["schemes"].values()),
        "toned": sum(r["kind"] == "tone-in-main" for r in data["cktV52"]["schemes"].values()),
        "total": len(data["cktV52"]["schemes"]),
    }
    data["bPathBenchmark"]["schemeCount"] = sum(len(e.get("bPathMetricsNative", {})) == 8 for e in data["entries"])
    assert before == helper.preservation_snapshot(data, existing_ids), "existing catalogue changed"
    assert before_missing == production.missing_by_map(data, existing_ids | set(IDS)), "missing native columns"
    for ident, record in old_v52["schemes"].items():
        assert data["cktV52"]["schemes"][ident] == record
    for key in old_v52:
        if key not in ("schemes", "counts"):
            assert data["cktV52"][key] == old_v52[key], key
    ui = (ROOT / "tools/um40_r11_ui.js").read_text(encoding="utf-8")
    result = html[:body] + fixed.pack(data) + html[end:]
    closing = result.rindex("</body>")
    result = result[:closing] + '<script id="um40-r11-ui">\n' + ui + "\n</script>\n" + result[closing:]
    assert HTML.read_bytes() == original, "HTML changed during scoring"
    # Keep reproducible additions tracked even though the large HTML is ignored.
    write(ROOT / "research/config/um40-r11-entries.json", entries)
    write(AUDIT, {"version": "um40-original-three-r11-publication-v1", "ids": IDS,
                  "catalogueBefore": len(existing_ids), "catalogueAfter": len(data["entries"]),
                  "existingCataloguePreserved": True, "existingV52Preserved": True,
                  "htmlBeforeSha256": sha(original), "htmlAfterSha256": sha(result.encode()),
                  "semantics": {"toneKeysByTone": "IEUAO", "shapeKeysByMeaning": "AEUIO", "toneDigitsByShapeMeaning": "42310"},
                  "scores": scores})
    HTML.write_bytes(result.encode("utf-8"))
    print(json.dumps({"added": IDS, "catalogue": len(data["entries"]), "audit": str(AUDIT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
