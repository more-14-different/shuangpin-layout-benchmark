from __future__ import annotations

import base64
import gzip
import json
import re
import unittest
from pathlib import Path

from tools.shenyun_collision_benchmark import (
    COLLISION_21X26_EXTREMES,
    CUTS,
    PURE_Y_SCOPE,
    SPLIT_Y_YU_SCOPE,
    _combine,
    evaluate_layout,
    read_word_corpus,
    select_collision_entries,
    select_onset_scope_entries,
    zero_onset_scope,
)


BENCH_ROOT = Path(__file__).resolve().parents[1]
SNOW_ROOT = Path(r"D:\C2D\Documents\rime-snow-pinyin")
EXTREMES = SNOW_ROOT / "research-notes/data/shenyun-21x28-collision-extremes.json"
HTML = BENCH_ROOT / "a7_CKT_R11.html"
COLLISION_AUDIT = BENCH_ROOT / "a7_CKT_R11_integrated_materials/shenyun_21x26_28_collisions.json"
R10_FRONTIER = SNOW_ROOT / "research-notes/data/shenyun-r10-21x28-frontier.json"
DICTIONARIES = [
    SNOW_ROOT / f"snow_pinyin.{name}.dict.yaml"
    for name in ("base", "ext", "tencent")
]

EXPECTED_DIRECTIONS = {
    "R21X28-an-ang": (("an",), ("ang",)),
    "R21X28-ang-an": (("ang",), ("an",)),
    "R21X28-an-in-ui": (("an",), ("in", "ui")),
    "R21X28-in-ui-an": (("in", "ui"), ("an",)),
    "R21X28-ang-in-ui": (("ang",), ("in", "ui")),
    "R21X28-in-ui-ang": (("in", "ui"), ("ang",)),
}
CONSONANTS = (
    "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h",
    "j", "q", "x", "zh", "ch", "sh", "r", "z", "c", "s",
)
PARSER = tuple(sorted(CONSONANTS, key=len, reverse=True))
YU = {"yu", "yuan", "yue", "yun"}


def extract_payload() -> dict:
    html = HTML.read_text(encoding="utf-8")
    start = html.index('<script id="payload"')
    body = html.index(">", start) + 1
    end = html.index("</script>", body)
    return json.loads(gzip.decompress(base64.b64decode(html[body:end])))


def split_pinyin(value: str) -> tuple[str, str]:
    py = re.sub(r"[0-9]+$", "", value.lower()).replace("ü", "v")
    if py[0] in "aeo":
        return py[0].upper(), py
    if py.startswith("y"):
        head = "YU" if py in YU else "Y"
        final = py[1:]
    elif py.startswith("w"):
        head, final = "W", py[1:]
    else:
        head = next(candidate for candidate in PARSER if py.startswith(candidate))
        final = py[len(head):]
    if head in {"j", "q", "x", "Y", "YU"} and final.startswith("u"):
        final = "v" + final[1:]
    return head, final


class HistoricalCollisionExtremeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = json.loads(EXTREMES.read_text(encoding="utf-8"))
        cls.schemes = {row["id"]: row for row in cls.source["schemes"]}
        cls.payload = extract_payload()

    def test_six_stable_ids_and_punctuation_directions(self) -> None:
        self.assertEqual(set(self.schemes), set(EXPECTED_DIRECTIONS))
        for scheme_id, (comma, period) in EXPECTED_DIRECTIONS.items():
            final_map = self.schemes[scheme_id]["finalMap"]
            actual_comma = tuple(sorted(k for k, value in final_map.items() if value == ","))
            actual_period = tuple(sorted(k for k, value in final_map.items() if value == "."))
            self.assertEqual(actual_comma, comma, scheme_id)
            self.assertEqual(actual_period, period, scheme_id)

    def test_common399_unique_and_d1_v0(self) -> None:
        pinyin = self.payload["source"]["pinyin"] if "source" in self.payload else None
        if pinyin is None:
            # The atlas stores the same ordered spelling list at the top level.
            pinyin = self.payload["pinyin"]
        base_indexes = [index for index, _ in self.payload["base"]]
        for scheme_id, scheme in self.schemes.items():
            initial_map = scheme["initialMap"]
            final_map = scheme["finalMap"]
            codes = []
            for index in base_indexes:
                head, final = split_pinyin(pinyin[index])
                codes.append(initial_map[head] + final_map[final])
            base_final_displaced = sum(final_map[final] != final.upper() for final in "aeiou")
            self.assertEqual(len(codes), 399, scheme_id)
            self.assertEqual(len(set(codes)), 399, scheme_id)
            # D is the R11 memory-r2 displacement audit, not a literal
            # comparison with the spelling (zh/ch/sh have canonical classes).
            self.assertEqual(scheme["D"], 1, scheme_id)
            self.assertNotEqual(initial_map["x"], "X", scheme_id)
            self.assertEqual(base_final_displaced, 0, scheme_id)
            self.assertEqual(scheme["V"], 0, scheme_id)
            self.assertEqual(scheme["capacity"], [21, 28])
            self.assertEqual(scheme["actual"], [21, 28])

    def test_existing_tone_entry_is_the_sixth_layout(self) -> None:
        existing = next(
            row for row in self.payload["entries"]
            if row["id"] == "SNOW-SHENYUN-21X28-TONE"
        )
        historical = self.schemes["R21X28-in-ui-an"]
        self.assertEqual(existing["initialMap"], historical["initialMap"])
        self.assertEqual(existing["finalMap"], historical["finalMap"])
        self.assertEqual(existing["tone"], historical["toneKeys"])


class CatalogueCollisionEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.payload = extract_payload()
        cls.common399 = {
            re.sub(r"[0-9]+$", "", cls.payload["pinyin"][index].lower())
            for index, _ in cls.payload["base"]
        }
        cls.corpus = read_word_corpus(
            DICTIONARIES,
            max_cut=max(CUTS),
            allowed_pinyin=cls.common399,
        )
        cls.by_id = {row["id"]: row for row in cls.payload["entries"]}

    CONTINUATION_21X26_IDS = {
        "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-04",
        "S21X26-CONT-F02-M38-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT-F02-M38-PURE-Y-CANYON-07",
        "S21X26-CONT-F04-M37-PURE-Y-CANYON-01",
        "S21X26-CONT-F03-M39-PURE-Y-CANYON-02",
    }
    CONTINUATION_2_21X26_IDS = {
        "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-03",
        "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-05",
        "S21X26-CONT2-F05-M37-PURE-Y-CANYON-01",
        "S21X26-CONT2-F04-M38-PURE-Y-CANYON-01",
        "S21X26-CONT2-F06-M39-PURE-Y-CANYON-01",
        "S21X26-CONT2-F02-M40-PURE-Y-CANYON-01",
    }
    CONTINUATION_3_21X26_IDS = {
        "S21X26-CONT3-F02-M40-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT3-F03-M38-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT3-F07-M39-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT3-F06-M38-PURE-Y-CANYON-01",
        "S21X26-CONT3-F07-M39-PURE-Y-CANYON-01",
        "S21X26-CONT3-F08-M40-PURE-Y-CANYON-01",
        "S21X26-CONT3-F08-M40-PURE-Y-CANYON-02",
        "S21X26-CONT3-F08-M40-PURE-Y-CANYON-03",
    }
    CONTINUATION_4_21X26_IDS = {
        "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-10",
        "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-11",
        "S21X26-CONT4-F06-M40-PURE-Y-PERFORMANCE-12",
        "S21X26-CONT4-F05-M39-PURE-Y-CANYON-01",
        "S21X26-CONT4-F06-M40-PURE-Y-CANYON-01",
        "S21X26-CONT4-F06-M40-PURE-Y-CANYON-02",
        "S21X26-CONT4-F06-M40-PURE-Y-CANYON-08",
    }
    CONTINUATION_5_21X26_IDS = {
        "S21X26-CONT5-F03-M40-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT5-F08-M40-PURE-Y-PERFORMANCE-11",
        "S21X26-CONT5-F04-M40-PURE-Y-CANYON-05",
        "S21X26-CONT5-F07-M40-PURE-Y-CANYON-01",
        "S21X26-CONT5-F06-M40-PURE-Y-CANYON-01",
    }

    def test_selects_all_21x28_and_retained_21x26_controls(self) -> None:
        selected = select_collision_entries(self.payload["entries"])
        self.assertEqual(len(selected), 60)
        selected_21x26 = {
            row["id"] for row in selected if row["capacity"] == [21, 26]
        }
        self.assertEqual(
            selected_21x26,
            COLLISION_21X26_EXTREMES
            | self.CONTINUATION_21X26_IDS
            | self.CONTINUATION_2_21X26_IDS
            | self.CONTINUATION_3_21X26_IDS
            | self.CONTINUATION_4_21X26_IDS
            | self.CONTINUATION_5_21X26_IDS
            | {
                "S21X26-M40-PURE-Y-PERFORMANCE-04",
                "S21X26-M38-PURE-Y-PERFORMANCE-01",
                "S21X26-M39-PURE-Y-PERFORMANCE-10",
                "S21X26-M37-PURE-Y-CANYON-09",
                "S21X26-M39-PURE-Y-CANYON-01",
            },
        )
        self.assertTrue(all(row["capacity"] == [21, 28] for row in selected if row["id"] not in selected_21x26))
        self.assertIn("SNOW-SHENYUN-21X28-TONE", {row["id"] for row in selected})
        self.assertNotIn("R8-21X21-M40-01", {row["id"] for row in selected})
        for entry in selected:
            self.assertIn(zero_onset_scope(entry), {PURE_Y_SCOPE, SPLIT_Y_YU_SCOPE})
            if entry["capacity"] == [21, 28]:
                self.assertEqual(zero_onset_scope(entry), PURE_Y_SCOPE)

    def test_pure_y_and_split_y_yu_are_independent_selectable_scopes(self) -> None:
        capacities = {(21, 26)}
        pure = select_onset_scope_entries(
            self.payload["entries"], PURE_Y_SCOPE, capacities=capacities
        )
        split = select_onset_scope_entries(
            self.payload["entries"], SPLIT_Y_YU_SCOPE, capacities=capacities
        )
        self.assertTrue(COLLISION_21X26_EXTREMES <= {entry["id"] for entry in pure})
        self.assertEqual(
            {entry["id"] for entry in split},
            {
                "NF4I-AE-Z-YU-M38-21",
                "NF4I-AE-Z-YU-M40-24",
                "NF4I-AV-Z-YU-M40-29",
                "NF4I-AV-AEO-YU-M40-30",
            },
        )

    def test_r10_baseline_matches_frozen_common399_head_and_filtered_tail(self) -> None:
        expected_source = json.loads(R10_FRONTIER.read_text(encoding="utf-8"))
        expected = next(
            row["fourCodeCollision"] for row in expected_source["schemes"]
            if row["id"] == "R10-21X26-M39-08"
        )
        actual = evaluate_layout(
            self.by_id["R10-21X26-M39-08"],
            self.payload["pinyin"],
            self.corpus,
        )
        self.assertEqual(set(actual["cuts"]), {str(cut) for cut in CUTS})
        for cut in (500, 1000, 2000):
            got = actual["cuts"][str(cut)]
            want = expected["cuts"][str(cut)]
            for key in ("crossBuckets", "collisionBuckets", "maxBucket"):
                self.assertEqual(got[key], want[key], (cut, key))
            for key in ("crossAffectedRate", "crossFirstChoiceLossRate"):
                self.assertAlmostEqual(got[key], want[key], places=14, msg=(cut, key))
        tail = actual["cuts"]["10000"]
        self.assertEqual(tail["covered"], {"double": 9995, "triple": 9995, "quadruple": 10000})
        self.assertAlmostEqual(tail["crossAffectedRate"], 0.1421296609200027, places=14)
        self.assertAlmostEqual(tail["crossFirstChoiceLossRate"], 0.0454303224645746, places=14)
        self.assertEqual((tail["crossBuckets"], tail["collisionBuckets"], tail["maxBucket"]), (1608, 4482, 18))

    def test_historical_balanced_layout_matches_frozen_result(self) -> None:
        actual = evaluate_layout(
            self.by_id["SNOW-SHENYUN-21X28-TONE"],
            self.payload["pinyin"],
            self.corpus,
        )
        top = actual["cuts"]["10000"]
        self.assertAlmostEqual(top["crossAffectedRate"], 0.06664157662362989, places=14)
        self.assertAlmostEqual(top["crossFirstChoiceLossRate"], 0.01974913246144691, places=14)
        self.assertEqual(top["crossBuckets"], 805)
        self.assertEqual(top["collisionBuckets"], 4063)
        self.assertEqual(top["maxBucket"], 17)
        self.assertAlmostEqual(actual["fiveCutAverageCrossAffectedRate"], 0.021428129203392213, places=14)
        self.assertAlmostEqual(actual["fiveCutAverageCrossFirstChoiceLossRate"], 0.006313405013854136, places=14)

    def test_corpus_is_globally_restricted_to_common399(self) -> None:
        for rows in self.corpus.values():
            for row in rows:
                for reading in row["readings"]:
                    self.assertTrue(set(reading) <= self.common399)

    def test_missing_codes_remain_missing_and_results_are_deterministic(self) -> None:
        entry = dict(self.by_id["R10-21X26-M39-08"])
        entry["id"] = "missing"
        entry["codeList"] = [None] * len(entry["codeList"])
        first = evaluate_layout(entry, self.payload["pinyin"], self.corpus)
        second = evaluate_layout(entry, self.payload["pinyin"], self.corpus)
        self.assertEqual(first, second)
        for metrics in first["cuts"].values():
            self.assertEqual(metrics["covered"], {"double": 0, "triple": 0, "quadruple": 0})
            self.assertIsNone(metrics["crossAffectedRate"])
            self.assertIsNone(metrics["crossFirstChoiceLossRate"])

    def test_tied_winner_is_stable_by_word_not_family_iteration_order(self) -> None:
        double = [{"word": "a", "weight": 10.0, "codes": {"ABCD"}}]
        triple = [{"word": "b", "weight": 10.0, "codes": {"ABCD"}}]
        quadruple = [{"word": "c", "weight": 5.0, "codes": {"WXYZ"}}]
        forward = _combine({"double": double, "triple": triple, "quadruple": quadruple})
        reverse = _combine({"quadruple": quadruple, "triple": triple, "double": double})
        for result in (forward, reverse):
            self.assertEqual(result["crossBuckets"], 1)
            self.assertEqual(result["collisionBuckets"], 1)
            self.assertEqual(result["maxBucket"], 2)
            self.assertEqual(result["crossAffectedRate"], 0.8)
            self.assertEqual(result["crossFirstChoiceLossRate"], 0.4)


class IntegratedAtlasTests(unittest.TestCase):
    EXPECTED_NEW_IDS = {
        "SHENYUN-R10X28-D1-M39",
        "SHENYUN-R10X28-D2-M38",
        "SHENYUN-R10X28-D4-M38",
        "SHENYUN-R10X28-D5-M39-BAL",
        "SHENYUN-R10X28-D5-M39-PERF",
        "R21X28-an-ang",
        "R21X28-ang-an",
        "R21X28-an-in-ui",
        "R21X28-ang-in-ui",
        "R21X28-in-ui-ang",
    }
    REMOVED_21X26_RESEARCH_IDS = {
        "S21X26-PURE-Y-PERFORMANCE-01",
        "S21X26-SPLIT-Y-YU-PERFORMANCE-01",
        "S21X26-PURE-Y-COLLISION-01",
        "S21X26-PURE-Y-COLLISION-02",
        "S21X26-SPLIT-Y-YU-COLLISION-01",
        "S21X26-PURE-Y-PERFORMANCE-05",
        "S21X26-SPLIT-Y-YU-PERFORMANCE-09",
        "S21X26-PURE-Y-CANYON-12",
        "S21X26-PURE-Y-CANYON-01",
        "S21X26-SPLIT-Y-YU-CANYON-01",
    }
    CONSTRAINED_21X26_IDS = {
        "S21X26-M40-PURE-Y-PERFORMANCE-04",
        "S21X26-M38-PURE-Y-PERFORMANCE-01",
        "S21X26-M39-PURE-Y-PERFORMANCE-10",
        "S21X26-M37-PURE-Y-CANYON-09",
        "S21X26-M39-PURE-Y-CANYON-01",
    }
    CONTINUATION_21X26_IDS = {
        "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-04",
        "S21X26-CONT-F02-M38-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT-F02-M38-PURE-Y-CANYON-07",
        "S21X26-CONT-F04-M37-PURE-Y-CANYON-01",
        "S21X26-CONT-F03-M39-PURE-Y-CANYON-02",
    }
    CONTINUATION_2_21X26_IDS = {
        "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-03",
        "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-05",
        "S21X26-CONT2-F05-M37-PURE-Y-CANYON-01",
        "S21X26-CONT2-F04-M38-PURE-Y-CANYON-01",
        "S21X26-CONT2-F06-M39-PURE-Y-CANYON-01",
        "S21X26-CONT2-F02-M40-PURE-Y-CANYON-01",
    }
    CONTINUATION_3_21X26_IDS = {
        "S21X26-CONT3-F02-M40-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT3-F03-M38-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT3-F07-M39-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT3-F06-M38-PURE-Y-CANYON-01",
        "S21X26-CONT3-F07-M39-PURE-Y-CANYON-01",
        "S21X26-CONT3-F08-M40-PURE-Y-CANYON-01",
        "S21X26-CONT3-F08-M40-PURE-Y-CANYON-02",
        "S21X26-CONT3-F08-M40-PURE-Y-CANYON-03",
    }
    CONTINUATION_4_21X26_IDS = {
        "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-10",
        "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-11",
        "S21X26-CONT4-F06-M40-PURE-Y-PERFORMANCE-12",
        "S21X26-CONT4-F05-M39-PURE-Y-CANYON-01",
        "S21X26-CONT4-F06-M40-PURE-Y-CANYON-01",
        "S21X26-CONT4-F06-M40-PURE-Y-CANYON-02",
        "S21X26-CONT4-F06-M40-PURE-Y-CANYON-08",
    }
    CONTINUATION_5_21X26_IDS = {
        "S21X26-CONT5-F03-M40-PURE-Y-PERFORMANCE-01",
        "S21X26-CONT5-F08-M40-PURE-Y-PERFORMANCE-11",
        "S21X26-CONT5-F04-M40-PURE-Y-CANYON-05",
        "S21X26-CONT5-F07-M40-PURE-Y-CANYON-01",
        "S21X26-CONT5-F06-M40-PURE-Y-CANYON-01",
    }

    @classmethod
    def setUpClass(cls) -> None:
        cls.payload = extract_payload()
        cls.by_id = {row["id"]: row for row in cls.payload["entries"]}

    def test_catalogue_contains_historical_and_reviewed_research_entries(self) -> None:
        self.assertEqual(len(self.payload["entries"]), 524)
        self.assertTrue(self.EXPECTED_NEW_IDS <= self.by_id.keys())
        self.assertTrue(self.REMOVED_21X26_RESEARCH_IDS.isdisjoint(self.by_id))
        self.assertTrue(self.CONSTRAINED_21X26_IDS <= self.by_id.keys())
        self.assertTrue(self.CONTINUATION_21X26_IDS <= self.by_id.keys())
        self.assertTrue(self.CONTINUATION_2_21X26_IDS <= self.by_id.keys())
        self.assertTrue(self.CONTINUATION_3_21X26_IDS <= self.by_id.keys())
        self.assertTrue(self.CONTINUATION_4_21X26_IDS <= self.by_id.keys())
        self.assertTrue(self.CONTINUATION_5_21X26_IDS <= self.by_id.keys())
        self.assertTrue({"R10-21X26-M38-07", "R10-21X26-M37-04"} <= self.by_id.keys())
        self.assertNotIn("R21X28-in-ui-an", self.by_id)

    def test_all_21x28_roles_use_canonical_zero_onset_labels(self) -> None:
        zero_labels = {"ØA", "ØE", "ØO", "ØW", "ØY", "ØYU"}
        parser_labels = {"A", "E", "O", "W", "Y", "YU"}
        rows = [entry for entry in self.payload["entries"] if entry["capacity"] == [21, 28]]
        self.assertEqual(len(rows), 17)
        for entry in rows:
            flattened = {role for roles in entry["roles"].values() for role in roles}
            self.assertTrue(zero_labels <= flattened, entry["id"])
            self.assertTrue(parser_labels.isdisjoint(flattened), entry["id"])
            self.assertEqual(entry["zeroOnsetScope"], PURE_Y_SCOPE)

    def test_all_60_retained_entries_have_collisions(self) -> None:
        selected = select_collision_entries(self.payload["entries"])
        self.assertEqual(len(selected), 60)
        self.assertEqual(
            {entry["id"] for entry in selected},
            {
                entry["id"] for entry in self.payload["entries"]
                if entry.get("fourCodeCollision") is not None
            },
        )
        for entry in selected:
            collision = entry.get("fourCodeCollision")
            self.assertIsNotNone(collision, entry["id"])
            self.assertEqual(set(collision["cuts"]), {str(cut) for cut in CUTS})
        self.assertEqual(self.payload["fourCodeCollisionBenchmark"]["schemeCount"], 60)
        self.assertEqual(self.payload["fourCodeCollisionBenchmark"]["families"], ["AUAU", "AAAU", "AAAA"])
        self.assertEqual(self.payload["fourCodeCollisionBenchmark"]["activeOnsetScope"], PURE_Y_SCOPE)
        self.assertEqual(
            self.payload["fourCodeCollisionBenchmark"]["availableOnsetScopes"],
            [PURE_Y_SCOPE, SPLIT_Y_YU_SCOPE],
        )

    def test_collision_audit_records_preservation_and_full_coverage(self) -> None:
        audit = json.loads(COLLISION_AUDIT.read_text(encoding="utf-8"))
        self.assertEqual(audit["catalogueCount"], 524)
        self.assertEqual(audit["collisionSchemeCount"], 60)
        self.assertEqual(audit["preservedExistingEntries"], 484)
        self.assertEqual(audit["mutatedExistingFields"], [])
        self.assertEqual(
            set(audit["addedSchemeIds"]),
            self.CONSTRAINED_21X26_IDS
            | self.CONTINUATION_21X26_IDS
            | self.CONTINUATION_2_21X26_IDS
            | self.CONTINUATION_3_21X26_IDS
            | self.CONTINUATION_4_21X26_IDS
            | self.CONTINUATION_5_21X26_IDS,
        )

    def test_html_exposes_collision_summary_and_five_cut_detail(self) -> None:
        html = HTML.read_text(encoding="utf-8")
        self.assertEqual(html.count("SHENYUN_COLLISION_UI_V2"), 1)
        self.assertEqual(html.count("SHENYUN_COLLISION_NAV_V1"), 1)
        self.assertEqual(html.count("SHENYUN_ZERO_ONSET_LABELS_V1"), 1)
        for label in (
            "五档跨族受影响均值",
            "五档首选损失均值",
            "Top10k 受影响",
            "Top10k 首选损失",
            "Top10k 最大桶",
            "四码碰撞明细",
            "零声母 scope",
            "跨族碰撞桶",
            "全部碰撞桶",
        ):
            self.assertIn(label, html)


if __name__ == "__main__":
    unittest.main()
