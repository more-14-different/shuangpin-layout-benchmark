#!/usr/bin/env python3
"""Export the upstream role tables to a deterministic, Node-readable snapshot."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np


ROLES = ("L2i1", "L3i1", "L3i2", "L4i1", "L4i2", "L4i3")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    upstream = args.upstream.resolve()
    source = upstream / "产物" / "段当量表.npz"
    if not source.exists():
        raise SystemExit(f"missing upstream artifact: {source}")

    with np.load(source, allow_pickle=False) as data:
        letters = "".join(str(value) for value in data["letters"].tolist())
        tables: dict[str, dict[str, object]] = {}
        for role in ROLES:
            key = f"seg_{role}"
            values = np.asarray(data[key], dtype="<f4", order="C")
            tables[role] = {
                "shape": list(values.shape),
                "dtype": "float32-le",
                "base64": base64.b64encode(values.tobytes(order="C")).decode("ascii"),
            }
        cost_ms = float(data["cost_ms"])
        artifact_version = int(data["version"])

    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=upstream, check=True,
        capture_output=True, text=True, encoding="utf-8"
    ).stdout.strip()
    payload = {
        "version": "ckt-v4-upstream-role-v1",
        "upstream": "https://github.com/zhanghaozhecn/better-keystroke-timing",
        "commit": commit,
        "sourceArtifact": "产物/段当量表.npz",
        "sourceSha256": sha256(source),
        "artifactVersion": artifact_version,
        "errorRecoveryMs": cost_ms,
        "keys": letters.upper(),
        "roles": list(ROLES),
        "scope": "native 2/3/4-key expected motor-plus-error cost; 5/6-key values are an explicitly labelled continuation extrapolation in CKT v4",
        "localBuildAdjustment": "build_seg_table batch size reduced from 100000 to 20000 to fit available RAM; model equations and weights unchanged",
        "tables": tables,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({k: payload[k] for k in payload if k != "tables"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
