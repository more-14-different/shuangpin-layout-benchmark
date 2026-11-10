#!/usr/bin/env python3
"""Test Flypy-style final merges around published U357 under strict guards.

The script is deliberately reproducible: it derives every candidate from the
published U357 state, evaluates the repository's frozen CKT-v4 fixture with the
native scorer, and independently reconstructs all ergonomic dimensions used in
the U357 comparison report.
"""

from __future__ import annotations

import argparse
import copy
import itertools
import json
import math
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
SCHEMES_PATH = ROOT / "research/.cache/ckt-v4-all-schemes.json"
ERGONOMICS_PATH = ROOT / "research/.cache/ckt-v4-ergonomics.json"
CORPUS_PATH = ROOT / "research/.cache/ckt-v4-native-corpus.bin"
SCORER_PATH = ROOT / "research/ckt-v4-core/target/release/score-native.exe"
OUTPUT_DIR = ROOT / "research/.cache"

U357_ID = "gen0107-p5-f1h-11_13-d2-f25_26-d3-f4_22-d4-f11_13"
U357_STATE = (
    "1515010f0c0503130d0b060a070910170a160411190212111111121818160a090d"
    "0512040c11040b050f09021901130d03030f10070203171306011806110a040815"
    "14000e"
)
FLYPY_PAIRS = (("v", "u"), ("vn", "un"), ("van", "uan"))


@dataclass(frozen=True)
class Layout:
    capacity: tuple[int, int]
    heads: tuple[int, ...]
    finals: tuple[int, ...]
    tones: tuple[int, ...]

    @classmethod
    def from_hex(cls, state: str) -> "Layout":
        raw = bytes.fromhex(state)
        if len(raw) != 69:
            raise ValueError(f"layout state must contain 69 bytes, got {len(raw)}")
        return cls(
            (raw[0], raw[1]),
            tuple(raw[2:29]),
            tuple(raw[29:64]),
            tuple(raw[64:69]),
        )

    def state_key(self) -> str:
        return bytes((*self.capacity, *self.heads, *self.finals, *self.tones)).hex()

    def with_finals(self, finals: Iterable[int]) -> "Layout":
        return Layout(self.capacity, self.heads, tuple(finals), self.tones)

    def with_heads(self, heads: Iterable[int]) -> "Layout":
        return Layout(self.capacity, tuple(heads), self.finals, self.tones)


def preferred_key(token: str, alphabet: str) -> int | None:
    if len(token) != 1:
        return None
    key = token.upper()
    return alphabet.find(key) if key in alphabet else None


def diagnostics(layout: Layout, heads: list[str], finals: list[str], alphabet: str) -> dict[str, int]:
    differs_head = lambda i: layout.heads[i] != preferred_key(heads[i], alphabet)
    differs_final = lambda i: layout.finals[i] != preferred_key(finals[i], alphabet)
    displaced_initials = sum(len(heads[i]) == 1 and differs_head(i) for i in range(21))
    displaced_vowels = sum(differs_final(finals.index(name)) for name in ("a", "e", "i", "o", "u"))
    memory = sum(differs_head(i) for i in range(21))
    memory += len(set(layout.heads[21:24]))
    memory += int(differs_head(24)) + int(differs_head(25))
    if layout.heads[26] != layout.heads[25]:
        memory += int(layout.heads[26] != preferred_key(heads[25], alphabet)) + 1
    memory += sum(differs_final(i) for i in range(35))
    return {
        "memory": memory,
        "displacedInitials": displaced_initials,
        "displacedVowels": displaced_vowels,
        "initialKeyCount": len(set(layout.heads)),
        "finalKeyCount": len(set(layout.finals)),
    }


def code_list(layout: Layout, fixture: dict[str, Any]) -> list[str | None]:
    alphabet = fixture["keyAlphabet"]
    validity_template = next(
        item["codeList"] for item in fixture["schemes"] if item["id"] == U357_ID
    )
    result: list[str | None] = []
    for index, (head, final) in enumerate(fixture["pinyinMap"]):
        if validity_template[index] is None or head == 255 or final == 255:
            result.append(None)
        else:
            result.append(alphabet[layout.heads[head]] + alphabet[layout.finals[final]])
    return result


def scheme(layout: Layout, fixture: dict[str, Any], candidate_id: str) -> dict[str, Any]:
    alphabet = fixture["keyAlphabet"]
    return {
        "id": candidate_id,
        "capacity": list(layout.capacity),
        "tone": "".join(alphabet[key] for key in layout.tones),
        "codeList": code_list(layout, fixture),
    }


def row_distance(moving: dict[str, Any], x0: float, y0: float, x1: float, y1: float) -> float:
    stagger = moving["rowStagger"]
    if y0 > 0:
        x0 += stagger["firstLowerRow"] + (y0 - 1) * stagger["perAdditionalRow"]
    if y1 > 0:
        x1 += stagger["firstLowerRow"] + (y1 - 1) * stagger["perAdditionalRow"]
    return math.hypot(x0 - x1, y0 - y1)


def moving_hand(layout: Layout, fixture: dict[str, Any], ergonomic: dict[str, Any]) -> dict[str, float]:
    moving = ergonomic["movingHand"]
    codes = code_list(layout, fixture)
    tokens = moving["corpora"]["daily"]["tokens"]
    strokes: list[str] = []
    for token in tokens:
        if token.get("key"):
            strokes.append(token["key"].upper())
        else:
            strokes.extend(codes[token["pinyinIndex"]])

    positions = [[0.0, 0.0], [0.0, 0.0]]
    last = float(moving["initialPreviousColumn"])
    last_finger = 0
    elapsed = 0.0
    effective = 0.0
    overlap = 0.0
    same_hand_hits = 0
    left = 0
    for key in strokes:
        geometry = moving["geometry"][key]
        x, y, finger = float(geometry["x"]), float(geometry["y"]), int(geometry["finger"])
        hand = int(x >= 5.0)
        same_hand = hand == int(last >= 5.0)
        previous_x = finger + positions[hand][0]
        previous_y = 1.0 + positions[hand][1]
        positions[hand] = [x - finger, y - 1.0]
        movement = row_distance(moving, previous_x, previous_y, x, y) if same_hand else 0.0
        distance = 0.2 + movement
        elapsed += distance / moving["fingerSpeeds"][finger]
        effective += distance
        if same_hand:
            same_hand_hits += 1
        else:
            overlap += row_distance(moving, previous_x, previous_y, x, y)
        left += int(x < 5.0)
        last, last_finger = x, finger

    hits = len(strokes)
    return {
        "movingScore": len(tokens) / elapsed * 200.0,
        "leftShare": left / hits,
        "sameHandRate": same_hand_hits / hits,
        "avgEffectiveDistance": effective / hits,
        "avgTotalDistance": (effective + overlap) / hits,
    }


def load_metrics(layout: Layout, ergonomic: dict[str, Any]) -> dict[str, float]:
    model = ergonomic["loadModel"]
    mapped = (*layout.heads, *layout.finals, *layout.tones)
    alphabet = model["layoutKeyAlphabet"]
    physical_keys = [alphabet[index] for index in mapped]
    per_track: list[dict[str, float]] = []
    for masses in model["masses"]:
        loads = {key: 0.0 for key in model["keys"]}
        for key, mass in zip(physical_keys, masses, strict=True):
            loads[key] += mass
        per_track.append(loads)

    def group_peak(keys: str) -> float:
        unique = set(keys)
        return max(sum(track.get(key, 0.0) for key in unique) for track in per_track)

    roles = model["trackRoles"]
    track_index = {name: i for i, name in enumerate(model["tracks"])}
    home_keys = model["homeKeys"]
    home_s2 = sum(per_track[track_index[roles["s2"]]].get(key, 0.0) for key in set(home_keys))
    home_c4 = sum(per_track[track_index[roles["c4"]]].get(key, 0.0) for key in set(home_keys))
    home_wx = sum(per_track[track_index[roles["wx"]]].get(key, 0.0) for key in set(home_keys))

    geometry = ergonomic["movingHand"]["geometry"]
    finger_peaks = []
    for finger in range(10):
        finger_keys = {key for key, value in geometry.items() if value["finger"] == finger}
        finger_peaks.append(max(sum(track.get(key, 0.0) for key in finger_keys) for track in per_track))

    return {
        "qazPeak": group_peak("QAZ"),
        "rightPinkyPeak": group_peak(model["rightPinkyKeys"]),
        "maxFingerPeak": max(finger_peaks),
        "homeS2": home_s2,
        "tybPeak": group_peak("TYB"),
        "homeFloor": min(home_c4, home_wx),
        "wMax": max(track.get("W", 0.0) for track in per_track),
        "yMax": max(track.get("Y", 0.0) for track in per_track),
    }


def ergonomics(layout: Layout, fixture: dict[str, Any], ergonomic: dict[str, Any]) -> dict[str, float]:
    return load_metrics(layout, ergonomic) | moving_hand(layout, fixture, ergonomic)


def assert_reference(metrics: dict[str, float]) -> None:
    expected = {
        "leftShare": 0.5076779897626803,
        "sameHandRate": 0.46533271288971617,
        "avgEffectiveDistance": 0.6554918624581969,
        "qazPeak": 0.1631186082848794,
        "rightPinkyPeak": 0.051044914723866866,
        "maxFingerPeak": 0.25214941827887194,
        "homeS2": 0.5203069214183453,
        "tybPeak": 0.14091953200048554,
        "homeFloor": 0.3762039577208698,
        "movingScore": 143.37998127078376,
    }
    mismatches = [
        f"{name}: got {metrics[name]:.15g}, expected {value:.15g}"
        for name, value in expected.items()
        if not math.isclose(metrics[name], value, rel_tol=0.0, abs_tol=2e-12)
    ]
    if mismatches:
        raise RuntimeError("ergonomic reconstruction mismatch:\n" + "\n".join(mismatches))


def passes_ergonomic_guards(candidate: dict[str, float], baseline: dict[str, float], eps: float = 1e-12) -> bool:
    lower = (
        "sameHandRate",
        "avgEffectiveDistance",
        "qazPeak",
        "rightPinkyPeak",
        "maxFingerPeak",
        "tybPeak",
        "wMax",
        "yMax",
    )
    higher = ("homeS2", "homeFloor", "movingScore")
    if any(candidate[name] > baseline[name] + eps for name in lower):
        return False
    if any(candidate[name] + eps < baseline[name] for name in higher):
        return False
    return abs(candidate["leftShare"] - 0.5) <= abs(baseline["leftShare"] - 0.5) + eps


def ergonomic_failures(candidate: dict[str, float], baseline: dict[str, float], eps: float = 1e-12) -> list[str]:
    lower = (
        "sameHandRate", "avgEffectiveDistance", "qazPeak", "rightPinkyPeak",
        "maxFingerPeak", "tybPeak", "wMax", "yMax",
    )
    higher = ("homeS2", "homeFloor", "movingScore")
    failures = [name for name in lower if candidate[name] > baseline[name] + eps]
    failures += [name for name in higher if candidate[name] + eps < baseline[name]]
    if abs(candidate["leftShare"] - 0.5) > abs(baseline["leftShare"] - 0.5) + eps:
        failures.append("leftShareBalance")
    return failures


def ergonomic_violation(candidate: dict[str, float], baseline: dict[str, float]) -> float:
    """Dimensionless sum of relative guard overruns, used only to rank near misses."""
    total = 0.0
    for name in (
        "sameHandRate", "avgEffectiveDistance", "qazPeak", "rightPinkyPeak",
        "maxFingerPeak", "tybPeak", "wMax", "yMax",
    ):
        total += max(0.0, candidate[name] - baseline[name]) / baseline[name]
    for name in ("homeS2", "homeFloor", "movingScore"):
        total += max(0.0, baseline[name] - candidate[name]) / baseline[name]
    baseline_balance = abs(baseline["leftShare"] - 0.5)
    total += max(0.0, abs(candidate["leftShare"] - 0.5) - baseline_balance) / baseline_balance
    return total


def direct_candidates(base: Layout, final_index: dict[str, int]) -> Iterable[tuple[str, Layout, dict[str, str]]]:
    choices = ("none", "left-to-right", "right-to-left")
    for actions in itertools.product(choices, repeat=len(FLYPY_PAIRS)):
        if all(action == "none" for action in actions):
            continue
        finals = list(base.finals)
        labels: list[str] = []
        changes: dict[str, str] = {}
        for (left, right), action in zip(FLYPY_PAIRS, actions, strict=True):
            if action == "none":
                continue
            source, target = (left, right) if action == "left-to-right" else (right, left)
            finals[final_index[source]] = finals[final_index[target]]
            labels.append(f"{source}>{target}")
            changes[source] = target
        yield "merge-" + "_".join(labels), base.with_finals(finals), changes


def nearby_candidates(
    direct: list[tuple[str, Layout, dict[str, str]]],
    base: Layout,
    finals: list[str],
    alphabet: str,
) -> Iterable[tuple[str, Layout, dict[str, str]]]:
    """One final move or swap after a Flypy merge, using U357's 21 sound keys."""
    # A merge frees one of the 21 capacity slots.  The important compensation
    # is therefore allowed to introduce one formerly unavailable MX34 key,
    # especially a natural A/E/I/O/U key that actually reduces M-R2.
    allowed_keys = [key for key in range(len(alphabet)) if key not in base.tones]
    for parent_id, layout, merges in direct:
        locked = set(merges) | set(merges.values())
        free_indices = [i for i, name in enumerate(finals) if name not in locked]
        for index in free_indices:
            for key in allowed_keys:
                if layout.finals[index] == key:
                    continue
                changed = list(layout.finals)
                changed[index] = key
                yield f"{parent_id}__move-{finals[index]}-{key:02d}", layout.with_finals(changed), merges
        for left_pos, left in enumerate(free_indices):
            for right in free_indices[left_pos + 1 :]:
                if layout.finals[left] == layout.finals[right]:
                    continue
                changed = list(layout.finals)
                changed[left], changed[right] = changed[right], changed[left]
                yield (
                    f"{parent_id}__swap-{finals[left]}-{finals[right]}",
                    layout.with_finals(changed),
                    merges,
                )


def w_native_candidates(
    direct: list[tuple[str, Layout, dict[str, str]]],
    base: Layout,
    heads: list[str],
    alphabet: str,
) -> list[tuple[str, Layout, dict[str, str]]]:
    """Restore the zero-initial W to W, the legal one-rule M40 -> M39 step."""
    index = heads.index("W")
    target = preferred_key("W", alphabet)
    result = []
    for parent_id, layout, merges in [("base", base, {})] + direct:
        changed = list(layout.heads)
        changed[index] = target
        result.append((f"w-native__{parent_id}", layout.with_heads(changed), merges))
    return result


def zero_group_candidates(
    direct: list[tuple[str, Layout, dict[str, str]]],
    base: Layout,
    heads: list[str],
    alphabet: str,
) -> Iterable[tuple[str, Layout, dict[str, str]]]:
    """Put A/E/O/W zero initials on one key, as in Flypy's zero-initial key."""
    indices = [heads.index(name) for name in ("A", "E", "O", "W")]
    parents = [("base", base, {})] + direct
    for key, key_name in enumerate(alphabet):
        for parent_id, layout, merges in parents:
            changed = list(layout.heads)
            for index in indices:
                changed[index] = key
            yield (
                f"zero-{key_name}__{parent_id}",
                layout.with_heads(changed),
                merges,
            )


def targeted_depth2_candidates(
    direct: list[tuple[str, Layout, dict[str, str]]],
    base: Layout,
    fixture: dict[str, Any],
    ergonomic: dict[str, Any],
    baseline_ergonomics: dict[str, float],
) -> Iterable[tuple[str, Layout, dict[str, str]]]:
    """Expand the one-step M39 near misses that fail only the QAZ guard."""
    alphabet = fixture["keyAlphabet"]
    finals = fixture["finals"]
    for parent_id, layout, merges in nearby_candidates(direct, base, finals, alphabet):
        diag = diagnostics(layout, fixture["heads"], finals, alphabet)
        if diag["memory"] >= 40 or diag["finalKeyCount"] > 21:
            continue
        parent_ergo = ergonomics(layout, fixture, ergonomic)
        if ergonomic_failures(parent_ergo, baseline_ergonomics) != ["qazPeak"]:
            continue
        locked = set(merges) | set(merges.values()) | {"a"}
        free_indices = [i for i, name in enumerate(finals) if name not in locked]
        for index in free_indices:
            for key in range(len(alphabet)):
                if layout.finals[index] == key:
                    continue
                changed = list(layout.finals)
                changed[index] = key
                yield (
                    f"{parent_id}__d2-move-{finals[index]}-{key:02d}",
                    layout.with_finals(changed),
                    merges,
                )
        for left_pos, left in enumerate(free_indices):
            for right in free_indices[left_pos + 1 :]:
                if layout.finals[left] == layout.finals[right]:
                    continue
                changed = list(layout.finals)
                changed[left], changed[right] = changed[right], changed[left]
                yield (
                    f"{parent_id}__d2-swap-{finals[left]}-{finals[right]}",
                    layout.with_finals(changed),
                    merges,
                )


def score_ckt(
    records: list[dict[str, Any]], fixture: dict[str, Any], layouts: dict[str, Layout]
) -> dict[str, float]:
    reference = next(item for item in fixture["schemes"] if item["id"] == "S005")
    generated = copy.deepcopy(fixture)
    generated["schemes"] = [reference] + [scheme(layouts[item["id"]], fixture, item["id"]) for item in records]
    generated["counts"]["schemes"] = len(generated["schemes"])
    fixture_path = OUTPUT_DIR / "u357-flypy-low-memory-schemes.json"
    fixture_path.write_text(json.dumps(generated, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    command = [
        str(SCORER_PATH),
        str(CORPUS_PATH),
        str(fixture_path),
        str(ROOT / "tools/ckt_v4_upstream_role_tables.json"),
    ]
    completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if completed.returncode:
        raise RuntimeError(
            f"native scorer failed ({completed.returncode}):\n{completed.stderr.strip()}"
        )
    pattern = re.compile(r"^composite (?:\((.+)\)|(.+)): ([0-9.eE+-]+)$", re.MULTILINE)
    scores = {(wrapped or plain): float(value) for wrapped, plain, value in pattern.findall(completed.stdout)}
    missing = [item["id"] for item in records if item["id"] not in scores]
    if missing:
        raise RuntimeError(f"native scorer omitted {len(missing)} candidates: {missing[:5]}")
    return scores


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--neighborhood", action="store_true", help="include one-move/one-swap compensation")
    parser.add_argument("--depth2", action="store_true", help="target a second repair at QAZ-only M39 near misses")
    parser.add_argument("--w-native", action="store_true", help="test legal M39 zero-initial W restoration")
    parser.add_argument("--zero-group", action="store_true", help="merge A/E/O/W zero initials onto one key")
    parser.add_argument("--max-ckt-candidates", type=int, default=5000)
    args = parser.parse_args()

    fixture = json.loads(SCHEMES_PATH.read_text(encoding="utf-8"))
    ergonomic = json.loads(ERGONOMICS_PATH.read_text(encoding="utf-8"))
    base = Layout.from_hex(U357_STATE)
    if next(item for item in fixture["schemes"] if item["id"] == U357_ID)["codeList"] != code_list(base, fixture):
        raise RuntimeError("published U357 state no longer matches the frozen fixture")

    alphabet = fixture["keyAlphabet"]
    final_index = {name: i for i, name in enumerate(fixture["finals"])}
    baseline_ergonomics = ergonomics(base, fixture, ergonomic)
    assert_reference(baseline_ergonomics)
    baseline_diagnostics = diagnostics(base, fixture["heads"], fixture["finals"], alphabet)

    direct = list(direct_candidates(base, final_index))
    source = list(direct)
    w_candidates = w_native_candidates(direct, base, fixture["heads"], alphabet)
    if args.zero_group:
        source = list(zero_group_candidates(
            direct, base, fixture["heads"], alphabet
        ))
    elif args.w_native and args.neighborhood:
        source = w_candidates + list(nearby_candidates(
            w_candidates, base, fixture["finals"], alphabet
        ))
    elif args.w_native:
        source = w_candidates
    elif args.depth2:
        source = list(targeted_depth2_candidates(
            direct, base, fixture, ergonomic, baseline_ergonomics
        ))
    elif args.neighborhood:
        source.extend(nearby_candidates(direct, base, fixture["finals"], alphabet))

    seen: set[str] = set()
    layouts: dict[str, Layout] = {"U357": base}
    records: list[dict[str, Any]] = [
        {
            "id": "U357",
            "kind": "baseline",
            "stateKey": base.state_key(),
            "diagnostics": baseline_diagnostics,
            "ergonomics": baseline_ergonomics,
        }
    ]
    generated_count = 0
    structural_count = 0
    ergonomic_pass_count = 0
    for candidate_id, layout, merges in source:
        generated_count += 1
        state_key = layout.state_key()
        if state_key in seen or state_key == base.state_key():
            continue
        seen.add(state_key)
        diag = diagnostics(layout, fixture["heads"], fixture["finals"], alphabet)
        capacity_ok = diag["initialKeyCount"] <= 21 and diag["finalKeyCount"] <= 21
        auxiliary_ok = set(layout.finals).isdisjoint(layout.tones)
        memory_ok = diag["memory"] < baseline_diagnostics["memory"]
        if not capacity_ok or not auxiliary_ok or ((args.neighborhood or args.depth2 or args.w_native or args.zero_group) and not memory_ok):
            continue
        structural_count += 1
        ergo = ergonomics(layout, fixture, ergonomic)
        ergonomic_pass = passes_ergonomic_guards(ergo, baseline_ergonomics)
        ergonomic_pass_count += int(ergonomic_pass)
        safe_id = re.sub(r"[^A-Za-z0-9_.-]", "-", candidate_id)
        layouts[safe_id] = layout
        records.append(
            {
                "id": safe_id,
                "kind": "compensated" if "__" in candidate_id else "direct",
                "parentMerges": merges,
                "stateKey": state_key,
                "diagnostics": diag,
                "ergonomics": ergo,
                "ergonomicPass": ergonomic_pass,
                "ergonomicFailures": ergonomic_failures(ergo, baseline_ergonomics),
                "ergonomicViolation": ergonomic_violation(ergo, baseline_ergonomics),
            }
        )

    scored_records = records if not (args.neighborhood or args.depth2 or args.zero_group) else [records[0]] + [
        record for record in records[1:] if record["ergonomicPass"]
    ]
    if len(scored_records) > args.max_ckt_candidates:
        raise RuntimeError(
            f"{len(scored_records) - 1} candidates passed ergonomic prefilters; increase "
            "--max-ckt-candidates or tighten the neighborhood"
        )
    ckt_scores = score_ckt(scored_records, fixture, layouts)
    baseline_ckt = ckt_scores["U357"]
    for record in records:
        record["cktV4"] = ckt_scores.get(record["id"])
        record["cktPass"] = record["cktV4"] is not None and record["cktV4"] <= baseline_ckt + 1e-12
        record["strictPass"] = record["id"] != "U357" and record.get("ergonomicPass", True) and record["cktPass"]

    records.sort(key=lambda item: (
        not item["strictPass"],
        not item.get("ergonomicPass", True),
        item.get("ergonomicViolation", 0.0),
        item["cktV4"] if item["cktV4"] is not None else math.inf,
        item["id"],
    ))
    result = {
        "experiment": "u357-flypy-low-memory",
        "baseline": {"id": "U357", "cktV4": baseline_ckt, "memory": baseline_diagnostics["memory"]},
        "search": {
            "neighborhood": args.neighborhood,
            "depth2": args.depth2,
            "wNative": args.w_native,
            "zeroGroup": args.zero_group,
            "generated": generated_count,
            "unique": len(seen),
            "structuralCandidates": structural_count,
            "ergonomicPass": ergonomic_pass_count,
            "cktScored": len(scored_records),
            "strictPass": sum(item["strictPass"] for item in records),
        },
        "guards": {
            "memory": "< U357",
            "cktV4": "<= U357",
            "lowerIsBetter": [
                "sameHandRate",
                "avgEffectiveDistance",
                "qazPeak",
                "rightPinkyPeak",
                "maxFingerPeak",
                "tybPeak",
                "wMax",
                "yMax",
            ],
            "higherIsBetter": ["homeS2", "homeFloor", "movingScore"],
            "balance": "abs(leftShare - 0.5) <= U357",
        },
        "m39LowerBound": {
            "requiredNaturalZeroInitial": "W",
            "zeroInitialWTokenPeak": max(
                row[ergonomic["tokenOrder"].index("W")]
                for row in ergonomic["loadModel"]["masses"]
            ),
            "u357WPeak": baseline_ergonomics["wMax"],
            "strictWGuardPossible": max(
                row[ergonomic["tokenOrder"].index("W")]
                for row in ergonomic["loadModel"]["masses"]
            ) <= baseline_ergonomics["wMax"] + 1e-12,
        },
        "records": records,
    }
    if args.zero_group:
        output_name = "u357-flypy-zero-group-results.json"
    elif args.w_native and args.neighborhood:
        output_name = "u357-flypy-w-native-neighborhood-results.json"
    elif args.w_native:
        output_name = "u357-flypy-w-native-results.json"
    elif args.depth2:
        output_name = "u357-flypy-depth2-results.json"
    elif args.neighborhood:
        output_name = "u357-flypy-neighborhood-results.json"
    else:
        output_name = "u357-flypy-direct-results.json"
    output_path = OUTPUT_DIR / output_name
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output_path), **result["search"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
