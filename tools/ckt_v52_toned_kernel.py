"""CPU scorer for single-code native 21x21 routes, cross-checked with the JS scorer.

Rows are sorted by descending frequency and stable ID by export_ckt_v52_templates.js.
Each symbolic terminal code contains its earlier stages as prefixes. A first-ranked
row exits immediately, so only residual rows enter the next prefix bucket.
"""

import base64
import json
from pathlib import Path

import numba
import numpy as np

KINDS = ["character", "word2", "word3", "word4"]


def load_tables(filename, field):
    source = json.loads(Path(filename).read_text(encoding="utf8"))
    return tuple(
        np.frombuffer(
            base64.b64decode(source[field][role]["base64"]), dtype="<f4"
        ).astype(np.float64)
        for role in ["L2i1", "L3i1", "L3i2", "L4i1", "L4i2", "L4i3"]
    )


@numba.njit(nogil=True)
def score_rows(rows, physical_keys, motor, errors):
    bucket_codes = np.zeros(1048576, np.int64)
    bucket_counts = np.zeros(1048576, np.int32)
    totals = np.zeros((2, 4))
    weights = np.zeros(4)
    hits = np.zeros(4)
    left_pinky = np.zeros(4)
    right_pinky = np.zeros(4)
    indices = np.zeros(6, np.int64)
    for row in rows:
        kind, weight, terminal_length = row[0], row[1], row[2]
        base_length = 2 if kind == 0 else (3 if kind == 2 else 4)
        pool = 1 if kind == 0 else (2 if kind == 2 else 3)
        packed_code = pool
        for position in range(terminal_length):
            indices[position] = physical_keys[row[3 + position]]
            packed_code = packed_code * 32 + indices[position]
            if position + 1 >= base_length:
                slot = ((packed_code * 2654435761) ^ (packed_code >> 12)) & 1048575
                while bucket_codes[slot] != 0 and bucket_codes[slot] != packed_code:
                    slot = (slot + 1) & 1048575
                bucket_codes[slot] = packed_code
                bucket_counts[slot] += 1
                rank = bucket_counts[slot]
                if rank == 1 or position + 1 == terminal_length:
                    break
        length = position + 1
        pair = indices[0] * 30 + indices[1]
        correction = 0.0
        if length == 2:
            milliseconds = motor[0][pair]
        elif length == 3:
            triple = pair * 30 + indices[2]
            milliseconds = motor[1][triple] + motor[2][triple]
        else:
            first_triple = pair * 30 + indices[2]
            last_triple = (
                indices[position - 2] * 30 + indices[position - 1]
            ) * 30 + indices[position]
            milliseconds = motor[3][first_triple] + motor[5][last_triple]
            rolling_error = errors[3][first_triple] + errors[5][last_triple]
            for start in range(length - 3):
                window = (
                    (indices[start] * 30 + indices[start + 1]) * 30 + indices[start + 2]
                ) * 30 + indices[start + 3]
                milliseconds += motor[4][window]
                rolling_error += errors[4][window]
            if length > 4:
                first = errors[3][first_triple]
                middle = errors[4][first_triple * 30 + indices[3]]
                last = errors[5][(indices[1] * 30 + indices[2]) * 30 + indices[3]]
                tail = (
                    errors[0][indices[3] * 30 + indices[4]]
                    if length == 5
                    else 1 - (1 - errors[1][last_triple]) * (1 - errors[2][last_triple])
                )
                correction = 782.2 * (
                    first
                    + middle
                    + last
                    + (1 - first) * (1 - middle) * (1 - last) * tail
                    - rolling_error
                )
        cost = (
            milliseconds
            + 300 * (length - base_length)
            + 600 * (rank > 1)
            + 50 * (rank - 1)
            + 300 * ((rank - 1) // 6)
        )
        weights[kind] += weight
        totals[0, kind] += weight * cost
        totals[1, kind] += weight * (cost + correction)
        hits[kind] += weight * length
        for index in indices[:length]:
            if index == 16 or index == 0 or index == 25:
                left_pinky[kind] += weight
            if index == 15:
                right_pinky[kind] += weight
    return totals / weights, left_pinky / hits, right_pinky / hits


class TonedV52Scorer:
    def __init__(self, template, root):
        self.rows = np.fromfile(template, np.int32).reshape(-1, 9)
        self.motor = load_tables(
            root / "tools/ckt_v4_upstream_role_tables.json", "tables"
        )
        self.errors = load_tables(
            root
            / "research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json",
            "errorTables",
        )
        publication = json.loads(
            (root / "research/notes/2026-11-18-ckt-v52-all-schemes.json").read_text(
                encoding="utf8"
            )
        )
        self.references = np.array(
            [
                [
                    publication["references"][version]["keytao"][kind]["effectiveMs"]
                    for kind in KINDS
                ]
                for version in ["v51", "v52"]
            ]
        )

    def score(self, state):
        keys = state["firstKeys"] + [
            region[group]
            for region in state["groupKeys"]
            for group in state["partition"]
        ]
        physical = np.array([ord(key) - 65 for key in keys] + list(range(30)))
        tracks, left, right = score_rows(self.rows, physical, self.motor, self.errors)
        scores = (
            10
            * np.average((tracks / self.references) ** 4, axis=1, weights=[1, 3, 1, 1])
            ** 0.25
        )
        return dict(
            cktV51=float(scores[0]),
            cktV52=float(scores[1]),
            effectiveTracksV52=dict(zip(KINDS, tracks[1].tolist())),
            pinky=float(max(left)),
            rightPinky=float(max(right)),
        )
