#!/usr/bin/env python3
"""Backfill applicable completion and native B-path columns for production candidates."""

from __future__ import annotations

import importlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SNOW = Path(r"D:\C2D\Documents\rime-snow-pinyin")
RESEARCH = SNOW / "scripts" / "research"
HTML = ROOT / "a7_CKT_R11.html"
AUDIT = ROOT / "a7_CKT_R11_integrated_materials" / "production_candidate_column_coverage.json"
FLAGSHIP_AUDIT = (
    ROOT / "a7_CKT_R11_integrated_materials"
    / "shenyun_21x26_d3v1_balanced_flagship_benchmark.json"
)

U357 = "gen0107-p5-f1h-11_13-d2-f25_26-d3-f4_22-d4-f11_13"
OVERALL17 = "SNOW-SHENYUN-21X26-PRODUCTION"
BALANCED = "SNOW-SHENYUN-21X26-D3V1-BALANCED"
TARGETS = (U357, OVERALL17, BALANCED)
PATHS = (
    ("j1", "keytao", "character", "p1"),
    ("j2", "keytao", "character", "p2"),
    ("s1", "sanpin", "character", "p1"),
    ("s2", "sanpin", "character", "p2"),
    ("wj1", "keytao", "word", "p1"),
    ("wj2", "keytao", "word", "p2"),
    ("ws1", "sanpin", "word", "p1"),
    ("ws2", "sanpin", "word", "p2"),
)


def run(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(list(args), cwd=cwd, check=True)


def coverage(data: dict) -> dict:
    entries = {entry["id"]: entry for entry in data["entries"]}
    result = {}
    for ident in TARGETS:
        entry = entries[ident]
        result[ident] = {
            "completionB": ident in data["completionB"]["schemes"],
            "completionBFixed": ident in data["completionBFixed"]["schemes"],
            "completionBV2": ident in data["completionBV2"]["schemes"],
            "completionBV3": ident in data["completionBV3"]["schemes"],
            "completionBV4": ident in data["completionBV4"]["schemes"],
            "nativeBPathCount": len(entry.get("bPathMetricsNative", {})),
        }
    return result


def native_b_paths(item: dict) -> dict[str, float]:
    modes = item["modes"]
    return {
        key: modes[mode][kind][stage]
        for key, mode, kind, stage in PATHS
    }


def normalize_cognitive_ms(metrics: dict) -> None:
    for name in ("cktV5Aggregate", "cktV51Aggregate"):
        aggregate = metrics.get(name)
        if aggregate:
            aggregate["cognitiveMs"] = aggregate["effectiveMs"] - aggregate["motorUpperMs"]


def main() -> None:
    if not sys.flags.utf8_mode:
        environment = os.environ.copy()
        environment["PYTHONUTF8"] = "1"
        raise SystemExit(subprocess.call([sys.executable, *sys.argv], env=environment))

    production = importlib.import_module("integrate_shenyun_21x26_production")
    sys.path.insert(0, str(RESEARCH))
    fixed = production.load_module(
        "fixed_frontier_coverage_repair",
        RESEARCH / "integrate_shenyun_21x21_completion_fixed_frontier.py",
    )
    old = production.load_module(
        "old_21x21_coverage_repair",
        RESEARCH / "integrate_shenyun_21x21_low_miss.py",
    )
    helper = old.load_helper(HTML)
    html = HTML.read_text(encoding="utf-8")
    data, body, end = helper.extract_payload(html)
    entries = {entry["id"]: entry for entry in data["entries"]}
    missing_targets = [ident for ident in TARGETS if ident not in entries]
    if missing_targets:
        raise ValueError(f"missing target entries: {missing_targets}")
    before = coverage(data)

    missing_completion = [
        ident for ident in TARGETS
        if any(
            ident not in data[block]["schemes"]
            for block in ("completionB", "completionBFixed", "completionBV2")
        )
    ]
    if missing_completion:
        with tempfile.TemporaryDirectory(prefix="production-column-coverage-") as location:
            temp = Path(location)
            scorer = RESEARCH / "score_shenyun_completion_ckt.js"
            scored = {}
            for mapping in ("native", "fixed", "v2"):
                output = temp / f"completion-{mapping}.json"
                command = [
                    "node", str(scorer), "--html", str(HTML), "--output", str(output),
                    "--ids", ",".join(missing_completion),
                    "--mapping", "fixed" if mapping == "v2" else mapping,
                ]
                if mapping == "v2":
                    command.extend(["--model", "v2"])
                run(*command, cwd=SNOW)
                scored[mapping] = json.loads(output.read_text(encoding="utf-8"))["schemes"]

        for ident in missing_completion:
            for mapping, block_name in (("native", "completionB"), ("fixed", "completionBFixed")):
                block = data[block_name]
                item = scored[mapping][ident]
                block["schemes"][ident] = item
                base = block["schemes"]["S005"]["modes"]
                block["ensembleScores"][ident] = {
                    "equal": {
                        str(t): fixed.ensemble(item["modes"], base, t, 1)
                        for t in (0, 150, 300, 600)
                    },
                    "word2": {
                        str(t): fixed.ensemble(item["modes"], base, t, 2)
                        for t in (0, 150, 300, 600)
                    },
                }
            data["completionBV2"]["schemes"][ident] = scored["v2"][ident]

    for ident in TARGETS:
        entries[ident]["bPathMetricsNative"] = native_b_paths(
            data["completionB"]["schemes"][ident]
        )
        normalize_cognitive_ms(entries[ident].get("productionCandidateMetrics", {}))

    native_complete = sum(
        len(entry.get("bPathMetricsNative", {})) == len(PATHS)
        for entry in data["entries"]
    )
    data["bPathBenchmark"]["schemeCount"] = native_complete
    repair_source = "production_candidate_column_coverage.json"
    selected_sources = data["bPathBenchmark"].setdefault("selectedSources", [])
    if repair_source not in selected_sources:
        selected_sources.append(repair_source)

    after = coverage(data)
    for ident, row in after.items():
        if not all(row[name] for name in (
            "completionB", "completionBFixed", "completionBV2",
            "completionBV3", "completionBV4",
        )) or row["nativeBPathCount"] != len(PATHS):
            raise ValueError(f"incomplete repair for {ident}: {row}")
    if native_complete != len(data["entries"]):
        missing = [
            entry["id"] for entry in data["entries"]
            if len(entry.get("bPathMetricsNative", {})) != len(PATHS)
        ]
        raise ValueError(f"native B-path catalogue remains incomplete: {missing}")

    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    AUDIT.write_text(json.dumps({
        "version": "production-candidate-column-coverage-1",
        "html": str(HTML),
        "catalogueCount": len(data["entries"]),
        "targets": list(TARGETS),
        "before": before,
        "after": after,
        "nativeBPathComplete": native_complete,
        "historicalBPathScope": "legacy-only; UI uses bPathMetricsNative",
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    if FLAGSHIP_AUDIT.exists():
        flagship_audit = json.loads(FLAGSHIP_AUDIT.read_text(encoding="utf-8"))
        normalize_cognitive_ms(flagship_audit.get("productionCandidateMetrics", {}))
        for version in ("cktV5", "cktV51"):
            aggregate = flagship_audit.get("cktV5V51", {}).get(version, {}).get("aggregate")
            if aggregate:
                aggregate["cognitiveMs"] = aggregate["effectiveMs"] - aggregate["motorUpperMs"]
        FLAGSHIP_AUDIT.write_text(
            json.dumps(flagship_audit, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    fixed.write_payload(HTML, html, body, end, data)
    print(json.dumps({
        "html": str(HTML),
        "audit": str(AUDIT),
        "catalogue": len(data["entries"]),
        "before": before,
        "after": after,
        "nativeBPathComplete": native_complete,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

