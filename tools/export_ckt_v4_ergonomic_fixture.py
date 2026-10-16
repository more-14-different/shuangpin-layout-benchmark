#!/usr/bin/env python3
"""Export a compact, hash-bound CKT v4 ergonomic verification fixture.

The R11 replay is a local/ignored research artifact.  This adapter copies only
abstract matrices, geometry, corpus tokens, and frozen numerical results; it
does not extract or vendor the replay implementation.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any
from zipfile import ZipFile


VERSION = "ckt-v4-ergonomics-1"
REPLAY_ROOT = "R11_integrated_replay/"
EXPECTED_SCHEMES = ("S005-NF", "SNF4-M36-AE-07")
TONE_TOKENS = ("tone1", "tone2", "tone3", "tone4", "tone5")
MX_UNIT = "relative hand-model cost; not ms"
RIGHT_PINKY_KEYS = "P[]\\;'/"
MX_FIELDS = (
    "hits",
    "chars",
    "time",
    "effective_distance",
    "overlap_distance",
    "same_hand_hits",
    "same_finger_hits",
    "diff_finger_hits",
    "score",
    "speed",
    "total_distance",
    "row_load",
    "finger_load",
    "left_load",
    "right_load",
    "avg_time",
    "avg_distance",
    "avg_effective_distance",
    "avg_overlap_distance",
    "same_hand_rate",
    "extendedKeyHits",
    "unit",
    "strokeSha256",
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json_member(archive: ZipFile, name: str) -> tuple[Any, bytes]:
    raw = archive.read(REPLAY_ROOT + name)
    return json.loads(raw), raw


def extract_html_payload(raw: bytes) -> dict[str, Any]:
    html = raw.decode("utf-8")
    marker = '<script id="payload"'
    start = html.find(marker)
    if start < 0:
        raise ValueError("HTML payload marker is missing")
    start = html.find(">", start) + 1
    end = html.find("</script>", start)
    if start <= 0 or end < 0:
        raise ValueError("HTML payload boundaries are invalid")
    return json.loads(gzip.decompress(base64.b64decode(html[start:end])))


def split_pinyin(py: str, heads: list[str], finals: list[str]) -> tuple[int, int]:
    consonants = sorted(heads[:21], key=len, reverse=True)
    if py[0] in "aeo":
        head, final = py[0].upper(), py
    elif py.startswith("y"):
        head = "YU" if py in {"yu", "yuan", "yue", "yun"} else "Y"
        final = py[1:]
    elif py.startswith("w"):
        head, final = "W", py[1:]
    else:
        head = next((value for value in consonants if py.startswith(value)), "")
        if not head:
            raise ValueError(f"unsupported pinyin {py!r}")
        final = py[len(head) :]
    if head in {"j", "q", "x", "Y", "YU"} and final.startswith("u"):
        final = "v" + final[1:]
    try:
        return heads.index(head), finals.index(final)
    except ValueError as error:
        raise ValueError(f"unsupported pinyin split {py!r}: {head!r}/{final!r}") from error


def assign_once(values: list[str | None], index: int, key: str, label: str) -> None:
    previous = values[index]
    if previous is not None and previous != key:
        raise ValueError(f"inconsistent {label} mapping at {index}: {previous!r} != {key!r}")
    values[index] = key


def factor_layout(
    payload: dict[str, Any], entry: dict[str, Any], heads: list[str], finals: list[str]
) -> list[str]:
    head_keys: list[str | None] = [None] * len(heads)
    final_keys: list[str | None] = [None] * len(finals)
    for pinyin_index, *_ in payload["base"]:
        code = entry["codeList"][pinyin_index]
        if not isinstance(code, str) or len(code) != 2:
            raise ValueError(f"{entry['id']} lacks a two-key common-pinyin code")
        head_index, final_index = split_pinyin(payload["pinyin"][pinyin_index], heads, finals)
        assign_once(head_keys, head_index, code[0].upper(), "head")
        assign_once(final_keys, final_index, code[1].upper(), "final")
    if any(value is None for value in head_keys + final_keys):
        raise ValueError(f"{entry['id']} does not cover all 62 head/final tokens")
    tones = list(entry["tone"].upper())
    if len(tones) != 5:
        raise ValueError(f"{entry['id']} tone mapping must contain five keys")
    return [str(value) for value in head_keys + final_keys] + tones


def load_diagnostics(
    layout: list[str], meta: dict[str, Any], masses: list[list[float]], audit: dict[str, Any]
) -> dict[str, float]:
    tracks = meta["tracks"]
    keys = meta["keys"]
    if any(key not in keys for key in layout):
        raise ValueError("layout contains a key outside the load model alphabet")

    def key_load(track_index: int, key: str) -> float:
        return sum(
            masses[track_index][token_index]
            for token_index, mapped_key in enumerate(layout)
            if mapped_key == key
        )

    right_by_track = [
        sum(key_load(track_index, key) for key in RIGHT_PINKY_KEYS)
        for track_index in range(len(tracks))
    ]
    home_keys = [key for key in keys if key in "ASDFGHJKL;'" ]
    home_by_track = [
        sum(key_load(track_index, key) for key in home_keys)
        for track_index in range(len(tracks))
    ]
    s2 = tracks.index("S2")
    c4 = tracks.index("C4-Snow")
    wx = tracks.index("WX-Snow-12")
    result = {
        "rp_s2": right_by_track[s2],
        "rp_max": max(right_by_track),
        "home_s2": home_by_track[s2],
        "home_c4": home_by_track[c4],
        "home_wx": home_by_track[wx],
        "home_floor": min(home_by_track[c4], home_by_track[wx]),
        "w_max": max(key_load(index, "W") for index in range(len(tracks))),
        "y_max": max(key_load(index, "Y") for index in range(len(tracks))),
    }
    frozen = {
        "rp_s2": audit["rightPinkyByTrack"]["S2"],
        "rp_max": audit["rightPinkyMax20"],
        "home_s2": audit["homeS2"],
        "home_c4": audit["homeC4"],
        "home_wx": audit["homeWX"],
        "home_floor": audit["homeFloor"],
        "w_max": audit["Wmax"],
        "y_max": audit["Ymax"],
    }
    for name, value in result.items():
        if abs(value - frozen[name]) > 1e-12:
            raise ValueError(
                f"load replay mismatch for {name}: computed {value!r}, frozen {frozen[name]!r}"
            )
    return frozen


def corpus_strokes(
    corpus: dict[str, Any], variant: str, pinyin_index: dict[str, int], codes: list[str | None]
) -> str:
    strokes: list[str] = []
    for token in corpus["tokens"]:
        if variant == "hanzi-only" and "pinyin" not in token:
            continue
        if "key" in token:
            stroke = token["key"]
        else:
            index = pinyin_index.get(token["pinyin"])
            if index is None or not codes[index]:
                raise ValueError(f"missing pinyin code for {token.get('pinyin')!r}")
            stroke = codes[index]
        strokes.append(stroke.lower())
    return "".join(strokes)


def compact_mx(value: dict[str, Any]) -> dict[str, Any]:
    result = {field: value[field] for field in MX_FIELDS}
    if result["unit"] != MX_UNIT:
        raise ValueError(f"unexpected MX unit {result['unit']!r}")
    return result


def build_fixture(replay_path: Path, html_path: Path) -> dict[str, Any]:
    replay_raw = replay_path.read_bytes()
    html_raw = html_path.read_bytes()
    payload = extract_html_payload(html_raw)
    with ZipFile(replay_path) as archive:
        meta, meta_raw = read_json_member(archive, "model_meta.json")
        load_data, load_raw = read_json_member(archive, "r4_token_loads.json")
        corpora, corpora_raw = read_json_member(archive, "R9_corpora.json")
        mx, mx_raw = read_json_member(archive, "R11_macroxue_all_schemes.json")
        load_audit, audit_raw = read_json_member(archive, "R11_load_audit.json")

    heads = meta["heads"]
    finals = meta["finals"]
    tracks = meta["tracks"]
    token_order = heads + finals + list(TONE_TOKENS)
    masses = [load_data[track]["mass"] for track in tracks]
    if len(heads) != 27 or len(finals) != 35 or len(token_order) != 67:
        raise ValueError("R11 token vocabulary is not canonical 27+35+5")
    if len(tracks) != 20 or any(len(row) != 67 for row in masses):
        raise ValueError("R11 load matrix is not 20x67")
    if set(meta["keys"]) != set(mx["keys"]) or len(meta["keys"]) != 34:
        raise ValueError("R11 load/MX key alphabets disagree")
    if corpora != mx["corpora"]:
        raise ValueError("R9 corpus and frozen MX corpus disagree")

    entries = {entry["id"]: entry for entry in payload["entries"]}
    pinyin_index = {pinyin: index for index, pinyin in enumerate(payload["pinyin"])}
    expected: dict[str, Any] = {}
    for scheme_id in EXPECTED_SCHEMES:
        if scheme_id not in entries or scheme_id not in mx["values"]:
            raise ValueError(f"expected regular scheme {scheme_id!r} is missing")
        layout = factor_layout(payload, entries[scheme_id], heads, finals)
        loads = load_diagnostics(layout, meta, masses, load_audit["values"][scheme_id])
        moving: dict[str, Any] = {}
        for corpus_name in ("daily", "default"):
            for variant in ("native-punctuation", "hanzi-only"):
                key = f"{corpus_name}|{variant}"
                frozen = mx["values"][scheme_id][key]
                strokes = corpus_strokes(
                    corpora[corpus_name], variant, pinyin_index, entries[scheme_id]["codeList"]
                )
                if sha256(strokes.encode()) != frozen["strokeSha256"]:
                    raise ValueError(f"current HTML no longer reproduces {scheme_id} {key}")
                moving[key] = compact_mx(frozen)
        expected[scheme_id] = {"layout": layout, "loads": loads, "movingHand": moving}

    corpus_fixture: dict[str, Any] = {}
    for name in ("daily", "default"):
        tokens = [
            {
                **{field: token[field] for field in ("char", "pinyin", "key") if field in token},
                **(
                    {"pinyinIndex": pinyin_index[token["pinyin"]]}
                    if "pinyin" in token
                    else {}
                ),
            }
            for token in corpora[name]["tokens"]
        ]
        corpus_fixture[name] = {
            "tokens": tokens,
            "variants": {
                "native-punctuation": {
                    "tokenCount": len(tokens),
                    "characterCount": len(tokens),
                    "includeFixedKeys": True,
                },
                "hanzi-only": {
                    "tokenCount": sum("pinyin" in token for token in tokens),
                    "characterCount": sum("pinyin" in token for token in tokens),
                    "includeFixedKeys": False,
                },
            },
        }

    geometry = {
        key: {
            "x": mx["layout"][key]["x"],
            "y": mx["layout"][key]["y"],
            "finger": mx["layout"][key]["finger"],
        }
        for key in mx["keys"]
    }
    return {
        "version": VERSION,
        "verificationStatus": "exact",
        "source": "R11 integrated replay abstract data; current HTML mapping cross-check",
        "sourceHashes": {
            "replayZip": sha256(replay_raw),
            "html": sha256(html_raw),
            "modelMeta": sha256(meta_raw),
            "tokenLoads": sha256(load_raw),
            "corpora": sha256(corpora_raw),
            "movingHandResults": sha256(mx_raw),
            "loadAudit": sha256(audit_raw),
        },
        "tokenOrder": token_order,
        "loadModel": {
            "keys": meta["keys"],
            "layoutKeyAlphabet": "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./",
            "tracks": tracks,
            "masses": masses,
            "rightPinkyKeys": RIGHT_PINKY_KEYS,
            "homeKeys": "ASDFGHJKL;'",
            "trackRoles": {"s2": "S2", "c4": "C4-Snow", "wx": "WX-Snow-12"},
        },
        "movingHand": {
            "keys": mx["keys"],
            "layoutKeyAlphabet": "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./",
            "geometry": geometry,
            "fingerSpeeds": [0.6, 0.9, 0.9, 1.0, 1.0, 1.0, 1.0, 0.9, 0.9, 0.6],
            "rowStagger": {"firstLowerRow": 0.25, "perAdditionalRow": 0.5},
            "initialPreviousColumn": 0.0,
            "unit": MX_UNIT,
            "corpora": corpus_fixture,
        },
        "expected": expected,
    }


def parse_args() -> argparse.Namespace:
    repo = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--replay",
        type=Path,
        default=repo / "a7_CKT_R11_integrated_materials" / "R11_integrated_replay.zip",
    )
    parser.add_argument("--html", type=Path, default=repo / "a7_CKT_R11.html")
    parser.add_argument(
        "--output", type=Path, default=repo / "research" / ".cache" / "ckt-v4-ergonomics.json"
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    fixture = build_fixture(args.replay.resolve(), args.html.resolve())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(fixture, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"wrote {args.output} ({len(fixture['expected'])} verified schemes)")


if __name__ == "__main__":
    main()
