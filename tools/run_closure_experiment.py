import os
import sys
import json
import shutil
import sqlite3
import math
from pathlib import Path

repo_root = Path(r"D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121")
master_dir = repo_root / "research" / "exploration" / "a7-closure-shared-archive-20261029"
master_dir.mkdir(parents=True, exist_ok=True)
master_db_path = master_dir / "master-archive.sqlite3"

source_db_path = repo_root / "research" / "exploration" / "production-ckt-v4-2121-strict-ivuao-d0-deep-anneal-20261028" / "exploration.sqlite3"
pg_db_path = repo_root / "research" / "exploration" / "production-ckt-v4-2121-strict-ivuao-24h-20261026-m40d0-prodgate" / "exploration.sqlite3"

def bucket(v: float, step: float) -> int:
    return math.floor(v / step)

def calc_coverage_cell(ckt_v4, memory, d, v, rp_max, home_floor, mx_score):
    rp = bucket(rp_max, 0.0025) if rp_max is not None else -1
    home = bucket(home_floor, 0.01) if home_floor is not None else -1
    mx = bucket(mx_score, 1.0) if mx_score is not None else -1
    return f"c{bucket(ckt_v4, 0.05)}-m{memory}-d{d}-v{v}-rp{rp}-h{home}-mx{mx}"

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

def merge_prodgate_elites():
    if not pg_db_path.exists():
        return
    con_pg = sqlite3.connect(pg_db_path)
    cur_pg = con_pg.cursor()
    cur_pg.execute("""
        SELECT state_key, layout_id, iteration, ckt_v4, memory, displaced_initials,
               displaced_vowels, ergonomics_json, rp_max, home_floor, mx_score,
               first_seen_generation, last_seen_generation, evaluations, last_seeded_generation
        FROM states
        WHERE ckt_v4 <= 9.720 AND memory <= 40 AND displaced_initials = 0
    """)
    rows = cur_pg.fetchall()
    con_pg.close()

    con_m = sqlite3.connect(master_db_path)
    cur_m = con_m.cursor()
    inserted = 0
    for r in rows:
        cell = calc_coverage_cell(r[3], r[4], r[5], r[6], r[8], r[9], r[10])
        try:
            cur_m.execute("""
                INSERT INTO states (
                    state_key, layout_id, iteration, ckt_v4, memory, displaced_initials,
                    displaced_vowels, ergonomics_json, rp_max, home_floor, mx_score,
                    first_seen_generation, last_seen_generation, evaluations, last_seeded_generation,
                    coverage_cell
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(state_key) DO UPDATE SET
                    evaluations = states.evaluations + excluded.evaluations,
                    last_seen_generation = max(states.last_seen_generation, excluded.last_seen_generation)
            """, (*r, cell))
            inserted += 1
        except Exception:
            pass

    con_m.commit()
    con_m.close()
    print(f"Merged {inserted} elite prodgate states into master archive.")

def merge_run_to_master(run_db: Path, master_db: Path):
    con_run = sqlite3.connect(run_db)
    cur_run = con_run.cursor()
    cur_run.execute("""
        SELECT state_key, layout_id, iteration, ckt_v4, memory, displaced_initials,
               displaced_vowels, ergonomics_json, rp_max, home_floor, mx_score,
               first_seen_generation, last_seen_generation, evaluations, last_seeded_generation,
               coverage_cell
        FROM states
    """)
    rows = cur_run.fetchall()
    con_run.close()

    con_m = sqlite3.connect(master_db)
    cur_m = con_m.cursor()
    inserted = 0
    for r in rows:
        try:
            cur_m.execute("""
                INSERT INTO states (
                    state_key, layout_id, iteration, ckt_v4, memory, displaced_initials,
                    displaced_vowels, ergonomics_json, rp_max, home_floor, mx_score,
                    first_seen_generation, last_seen_generation, evaluations, last_seeded_generation,
                    coverage_cell
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(state_key) DO UPDATE SET
                    evaluations = states.evaluations + excluded.evaluations,
                    last_seen_generation = max(states.last_seen_generation, excluded.last_seen_generation)
            """, r)
            inserted += 1
        except Exception:
            pass

    con_m.commit()
    con_m.close()
    print(f"Merged {inserted} states into master archive.")

if __name__ == "__main__":
    merge_prodgate_elites()
    u, p, all_r = analyze_db(master_db_path)
    print("Master archive stats:")
    print(f"  Total states in archive: {len(all_r)}")
    print(f"  Unconstrained best: CKT={u[2]:.6f} ({u[1]})")
    print(f"  ProdGate compliant best: CKT={p[2]:.6f} ({p[1]})")
