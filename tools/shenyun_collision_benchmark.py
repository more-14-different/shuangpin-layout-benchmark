"""Catalogue-wide standard four-code collision measurements.

The contract is deliberately narrower than a complete Feima state machine:
two-character words use AUAU, three-character words use AAAU, and
four-character words use AAAA.  Every layout is evaluated against the same
globally sorted Snow dictionaries at Top 500/1k/2k/5k/10k.
"""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path
from typing import Iterable


CUTS = (500, 1000, 2000, 5000, 10000)
PURE_Y_SCOPE = "pure-y"
SPLIT_Y_YU_SCOPE = "split-y-yu"
ONSET_SCOPES = (PURE_Y_SCOPE, SPLIT_Y_YU_SCOPE)
COLLISION_21X26_EXTREMES = {
    "R11-21X26-M36-01",
    "R11-21X26-M37-02",
    "R11-21X26-M38-03",
}
SHENYUN_21X26_RESEARCH = {
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
    "S21X26-M40-PURE-Y-PERFORMANCE-04",
    "S21X26-M38-PURE-Y-PERFORMANCE-01",
    "S21X26-M39-PURE-Y-PERFORMANCE-10",
    "S21X26-M37-PURE-Y-CANYON-09",
    "S21X26-M39-PURE-Y-CANYON-01",
    "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-04",
    "S21X26-CONT-F02-M38-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT-F02-M38-PURE-Y-CANYON-07",
    "S21X26-CONT-F04-M37-PURE-Y-CANYON-01",
    "S21X26-CONT-F03-M39-PURE-Y-CANYON-02",
    "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-03",
    "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-05",
    "S21X26-CONT2-F05-M37-PURE-Y-CANYON-01",
    "S21X26-CONT2-F04-M38-PURE-Y-CANYON-01",
    "S21X26-CONT2-F06-M39-PURE-Y-CANYON-01",
    "S21X26-CONT2-F02-M40-PURE-Y-CANYON-01",
    "S21X26-CONT3-F02-M40-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT3-F03-M38-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT3-F07-M39-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT3-F06-M38-PURE-Y-CANYON-01",
    "S21X26-CONT3-F07-M39-PURE-Y-CANYON-01",
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-01",
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-02",
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-03",
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-10",
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-11",
    "S21X26-CONT4-F06-M40-PURE-Y-PERFORMANCE-12",
    "S21X26-CONT4-F05-M39-PURE-Y-CANYON-01",
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-01",
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-02",
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-08",
    "S21X26-CONT5-F03-M40-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT5-F08-M40-PURE-Y-PERFORMANCE-11",
    "S21X26-CONT5-F04-M40-PURE-Y-CANYON-05",
    "S21X26-CONT5-F07-M40-PURE-Y-CANYON-01",
    "S21X26-CONT5-F06-M40-PURE-Y-CANYON-01",
}
COLLISION_21X26_IDS = COLLISION_21X26_EXTREMES | SHENYUN_21X26_RESEARCH
FAMILY_STAGE = {2: "AUAU", 3: "AAAU", 4: "AAAA"}
FAMILY_NAME = {2: "double", 3: "triple", 4: "quadruple"}


def normalize_pinyin(value: str) -> str:
    return re.sub(r"[0-9]+$", "", value.strip().lower()).replace("u:", "v").replace("ü", "v")


def zero_onset_scope(entry: dict) -> str | None:
    """Classify an explicit onset map without guessing from legacy code lists."""
    initial_map = entry.get("initialMap") or {}
    y_key = initial_map.get("Y")
    yu_key = initial_map.get("YU")
    if y_key is None or yu_key is None:
        return None
    return PURE_Y_SCOPE if y_key == yu_key else SPLIT_Y_YU_SCOPE


def select_onset_scope_entries(
    entries: Iterable[dict],
    onset_scope: str,
    *,
    capacities: set[tuple[int, int]] | None = None,
    scheme_ids: set[str] | None = None,
) -> list[dict]:
    """Select an explicit ØY model; unresolved legacy entries are excluded."""
    if onset_scope not in ONSET_SCOPES:
        raise ValueError(f"unsupported onset scope: {onset_scope}")
    return [
        entry for entry in entries
        if zero_onset_scope(entry) == onset_scope
        and (capacities is None or tuple(entry.get("capacity", ())) in capacities)
        and (scheme_ids is None or entry.get("id") in scheme_ids)
    ]


def select_collision_entries(entries: Iterable[dict]) -> list[dict]:
    """Select the declared 21x28 and reviewed 21x26 collision cohorts.

    The 21x28 cohort uses pure Y.  The reviewed 21x26 cohort deliberately
    includes both pure-Y and split-Y/YU layouts, with the scope recorded on
    every row rather than silently coercing one model into the other.
    """
    candidates = [
        entry for entry in entries
        if tuple(entry.get("capacity", ())) == (21, 28)
        or entry.get("id") in COLLISION_21X26_IDS
    ]
    return [
        entry for entry in candidates
        if zero_onset_scope(entry) in ONSET_SCOPES
        and (
            tuple(entry.get("capacity", ())) != (21, 28)
            or zero_onset_scope(entry) == PURE_Y_SCOPE
        )
    ]


def read_word_corpus(
    paths: Iterable[Path],
    max_cut: int = 10000,
    allowed_pinyin: set[str] | None = None,
) -> dict[int, list[dict]]:
    """Merge, globally sort, and retain only the largest requested cut.

    Rows keep their global frequency position even when none of their readings
    belongs to ``allowed_pinyin``.  This makes coverage explicit (for example,
    9,995/10,000) instead of silently promoting lower-frequency replacements.
    """
    if allowed_pinyin is not None:
        allowed_pinyin = {normalize_pinyin(value) for value in allowed_pinyin}
    merged: dict[str, dict] = {}
    for path in paths:
        body = False
        with Path(path).open("r", encoding="utf-8-sig") as stream:
            for raw in stream:
                line = raw.rstrip("\r\n")
                if not body:
                    body = line.strip() == "..."
                    continue
                if not line or line.startswith("#"):
                    continue
                fields = line.split("\t")
                if len(fields) not in (2, 3):
                    continue
                word, reading = fields[:2]
                length = len(word)
                if length not in FAMILY_STAGE:
                    continue
                syllables = tuple(normalize_pinyin(value) for value in reading.split())
                if len(syllables) != length:
                    continue
                try:
                    weight = float(fields[2].removesuffix("%")) if len(fields) == 3 and fields[2] else 0.0
                except ValueError:
                    continue
                row = merged.setdefault(word, {"word": word, "weight": weight, "readings": set()})
                row["weight"] = max(row["weight"], weight)
                row["readings"].add(syllables)

    result: dict[int, list[dict]] = {length: [] for length in FAMILY_STAGE}
    for row in merged.values():
        readings = sorted(row["readings"])
        if allowed_pinyin is not None:
            readings = [reading for reading in readings if set(reading) <= allowed_pinyin]
        row["readings"] = readings
        result[len(row["word"])].append(row)
    for length, rows in result.items():
        rows.sort(key=lambda row: (-row["weight"], row["word"]))
        result[length] = rows[:max_cut]
    return result


def _code_lookup(entry: dict, pinyin: list[str]) -> dict[str, str | None]:
    if len(entry["codeList"]) != len(pinyin):
        raise ValueError(f"{entry['id']}: codeList/pinyin length mismatch")
    result: dict[str, str | None] = {}
    for spelling, code in zip(pinyin, entry["codeList"]):
        key = normalize_pinyin(spelling)
        if key in result and result[key] != code:
            raise ValueError(f"{entry['id']}: conflicting normalized spelling {key}")
        result[key] = code
    return result


def _encode_row(row: dict, length: int, lookup: dict[str, str | None]) -> dict:
    encoded_codes: set[str] = set()
    for reading in row["readings"]:
        syllable_codes = [lookup.get(syllable) for syllable in reading]
        if any(code is None or len(code) != 2 for code in syllable_codes):
            continue
        codes = [str(code) for code in syllable_codes]
        if length == 2:
            encoded_codes.add(codes[0] + codes[1])
        elif length == 3:
            encoded_codes.add(codes[0][0] + codes[1][0] + codes[2])
        else:
            encoded_codes.add("".join(code[0] for code in codes))
    return {"word": row["word"], "weight": row["weight"], "codes": encoded_codes}


def _combine(families: dict[str, list[dict]]) -> dict:
    buckets: dict[str, set[tuple[str, int]]] = defaultdict(set)
    for family, items in families.items():
        for index, item in enumerate(items):
            for code in item["codes"]:
                buckets[code].add((family, index))

    winners: dict[str, tuple[str, int]] = {}
    for code, members in buckets.items():
        winners[code] = min(
            members,
            key=lambda member: (
                -families[member[0]][member[1]]["weight"],
                families[member[0]][member[1]]["word"],
                member[0],
            ),
        )

    covered = {family: 0 for family in families}
    total_weight = 0.0
    cross_weight = 0.0
    cross_loss = 0.0
    for family, items in families.items():
        for index, item in enumerate(items):
            codes = item["codes"]
            if not codes:
                continue
            covered[family] += 1
            weight = item["weight"]
            total_weight += weight
            all_cross = all(
                len({member[0] for member in buckets[code]}) > 1
                for code in codes
            )
            if all_cross:
                cross_weight += weight
                if not any(winners[code] == (family, index) for code in codes):
                    cross_loss += weight

    collision_buckets = [members for members in buckets.values() if len(members) > 1]
    cross_buckets = [
        members for members in buckets.values()
        if len({member[0] for member in members}) > 1
    ]
    return {
        "covered": covered,
        "totalWeight": total_weight,
        "crossAffectedWeight": cross_weight,
        "crossFirstChoiceLossWeight": cross_loss,
        "crossAffectedRate": cross_weight / total_weight if total_weight else None,
        "crossFirstChoiceLossRate": cross_loss / total_weight if total_weight else None,
        "crossBuckets": len(cross_buckets),
        "collisionBuckets": len(collision_buckets),
        "maxBucket": max((len(members) for members in buckets.values()), default=0),
    }


def evaluate_layout(
    entry: dict,
    pinyin: list[str],
    corpus: dict[int, list[dict]],
    cuts: tuple[int, ...] = CUTS,
) -> dict:
    lookup = _code_lookup(entry, pinyin)
    encoded = {
        length: [_encode_row(row, length, lookup) for row in corpus[length]]
        for length in FAMILY_STAGE
    }
    result = {
        "families": [FAMILY_STAGE[length] for length in FAMILY_STAGE],
        "cuts": {},
    }
    for cut in cuts:
        result["cuts"][str(cut)] = _combine({
            FAMILY_NAME[length]: encoded[length][:cut]
            for length in FAMILY_STAGE
        })
    affected = [
        metrics["crossAffectedRate"] for metrics in result["cuts"].values()
        if metrics["crossAffectedRate"] is not None
    ]
    loss = [
        metrics["crossFirstChoiceLossRate"] for metrics in result["cuts"].values()
        if metrics["crossFirstChoiceLossRate"] is not None
    ]
    result["fiveCutAverageCrossAffectedRate"] = (
        sum(affected) / len(affected) if len(affected) == len(cuts) else None
    )
    result["fiveCutAverageCrossFirstChoiceLossRate"] = (
        sum(loss) / len(loss) if len(loss) == len(cuts) else None
    )
    return result


def benchmark_catalogue(
    entries: Iterable[dict],
    pinyin: list[str],
    corpus: dict[int, list[dict]],
) -> dict[str, dict]:
    return {
        entry["id"]: evaluate_layout(entry, pinyin, corpus)
        for entry in select_collision_entries(entries)
    }
