import os
import sys
import json
import shutil
import sqlite3
import subprocess
from pathlib import Path

repo_root = Path(r"D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121")
master_db_path = repo_root / "research" / "exploration" / "a7-closure-shared-archive-20261029" / "master-archive.sqlite3"

manifest_path = repo_root / "research" / "seeds" / "ckt-v4" / "a7-closure-multi-seed-20261029" / "manifest.json"
with open(manifest_path, "r", encoding="utf-8") as f:
    manifest = json.load(f)

seeds = manifest["seeds"]

# Production gate criteria
PROD_GATE = {
    "maxMemory": 40,
    "maxD": 0,
    "maxV": 5,
    "maxRpS2": 0.041807945580111396,
    "maxRp": 0.05104491472486687,
    "maxW": 0.036232262305036636,
    "maxY": 0.06868516416355257,
    "minHomeFloor": 0.3507563825425487,
    "minMxScore": 140.8422565188549
}

def analyze_db(db_path: Path):
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    cur.execute("""
        SELECT state_id, layout_id, ckt_v4, memory, displaced_initials, displaced_vowels,
               rp_max, home_floor, mx_score, ergonomics_json, hex(state_key)
        FROM states
        WHERE memory <= 40 AND displaced_initials = 0
        ORDER BY ckt_v4 ASC
    """)
    rows = cur.fetchall()
    con.close()
    
    if not rows:
        return None, None, []
    
    unconstrained_best = rows[0]
    
    prod_compliant = []
    for r in rows:
        v = r[5]
        rp_max = r[6]
        home = r[7]
        mx = r[8]
        ergo = json.loads(r[9]) if r[9] else {}
        
        rp_s2 = ergo.get("right_pinky_s2")
        w_val = ergo.get("w_load")
        y_val = ergo.get("y_load")
        
        is_compliant = True
        if v > PROD_GATE["maxV"]:
            is_compliant = False
        if home < PROD_GATE["minHomeFloor"]:
            is_compliant = False
        if mx < PROD_GATE["minMxScore"]:
            is_compliant = False
        if rp_max > PROD_GATE["maxRp"]:
            is_compliant = False
        if rp_s2 is not None and rp_s2 > PROD_GATE["maxRpS2"]:
            is_compliant = False
        if w_val is not None and w_val > PROD_GATE["maxW"]:
            is_compliant = False
        if y_val is not None and y_val > PROD_GATE["maxY"]:
            is_compliant = False
            
        if is_compliant:
            prod_compliant.append(r)
            
    prod_best = prod_compliant[0] if prod_compliant else None
    return unconstrained_best, prod_best, rows

RUN_SPECS = [
    {"name": "Run-A", "baseSeed": 29001001, "dir": "a7-closure-run-a-20261029"},
    {"name": "Run-B", "baseSeed": 29002002, "dir": "a7-closure-run-b-20261029"},
    {"name": "Run-C", "baseSeed": 29003003, "dir": "a7-closure-run-c-20261029"},
]

def setup_run(spec: dict, generations: int = 5):
    run_dir = repo_root / "research" / "exploration" / spec["dir"]
    run_dir.mkdir(parents=True, exist_ok=True)
    db_file = run_dir / "exploration.sqlite3"
    if not db_file.exists():
        print(f"[{spec['name']}] Copying master archive to {db_file}...")
        shutil.copy2(master_db_path, db_file)
        
    cfg_path = repo_root / "research" / "config" / f"ckt-v4-{spec['dir']}.json"
    cfg = {
        "version": "ckt-v4-explorer-config-1",
        "cudaFull": True,
        "cudaBatch": True,
        "cudaBatchWindowMs": 100,
        "initialSchemes": [],
        "initialRanking": None,
        "initialLayouts": seeds,
        "schemeTemplate": "S005-NF",
        "reference": "S005",
        "corpus": "research/.cache/ckt-v4-native-corpus.bin",
        "schemes": "research/.cache/ckt-v4-all-schemes.json",
        "snapshot": "tools/ckt_v4_upstream_role_tables.json",
        "ergonomicFixture": "research/.cache/ckt-v4-ergonomics.json",
        "outputRoot": f"research/exploration/{spec['dir']}",
        "generations": generations,
        "stepsPerChain": 40,
        "nextSeedCount": 8,
        "baseSeed": spec["baseSeed"],
        "temperature": 0.035,
        "checkpointEvery": 5,
        "verifyEvery": 20,
        "dutyMs": 0,
        "mxCorpus": "daily",
        "mxVariant": "native-punctuation",
        "maxCktDelta": 0.35,
        "noveltyDistance": 8,
        "basinRadius": 5,
        "basinSupport": 3,
        "pauseOnReview": False,
        "guards": {
            "maxMemory": 40,
            "maxD": 0,
            "maxV": None,
            "maxRpS2": None,
            "maxRp": None,
            "maxW": None,
            "maxY": None,
            "minHomeFloor": None,
            "minMxScore": None
        }
    }
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    return cfg_path, run_dir

if __name__ == "__main__":
    for spec in RUN_SPECS:
        cfg, rdir = setup_run(spec, generations=5)
        print(f"Config ready: {cfg.name} (baseSeed: {spec['baseSeed']})")
