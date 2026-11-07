#!/usr/bin/env python3
"""
tools/export_m40_d3_v2_milestone.py

Extracts 7D Pareto frontier candidates from 21x26 M<=40, D<=3, V<=2 production run
and generates milestone assets in research/milestones/m40-d3-v2/:
  - m40-d3-v2-pareto-frontier-20261108.json
  - m40-d3-v2-milestone-summary.json
  - 2026-11-08-m40-d3-v2-production-final-report.md
"""

import json
import sqlite3
from collections import defaultdict, Counter
from datetime import datetime, timezone
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
schemes_json = repo / "research/.cache/ckt-v4-all-schemes.json"
db_path = repo / "research/exploration/production-ckt-v4-2126-m40-d3-v2-20261108/exploration.sqlite3"
milestone_dir = repo / "research/milestones/m40-d3-v2"
milestone_dir.mkdir(parents=True, exist_ok=True)

with open(schemes_json, "r", encoding="utf-8") as f:
    fixture = json.load(f)

alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./"
heads = fixture["heads"]
finals = fixture["finals"]

def main():
    if not db_path.exists():
        print(f"Database {db_path} does not exist yet. Run the exploration first.")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT count(*), min(ckt_v4), max(ckt_v4), min(memory), max(memory), max(first_seen_generation) FROM states")
    row = cur.fetchone()
    total_states, min_ckt, max_ckt, min_mem, max_mem, max_gen = row
    print(f"Total states: {total_states}, Min CKT: {min_ckt:.6f}, Max Gen: {max_gen}")

    cur.execute("""
        SELECT state_key, layout_id, ckt_v4, memory, displaced_initials, displaced_vowels,
               rp_max, home_floor, mx_score, ergonomics_json, first_seen_generation
        FROM states
        WHERE memory <= 40 AND displaced_initials <= 3 AND displaced_vowels <= 2
        ORDER BY ckt_v4 ASC
    """)
    all_rows = cur.fetchall()
    print(f"Total compliant states queried: {len(all_rows)}")

    pareto = []
    for s in all_rows:
        is_dominated = False
        for other in pareto:
            if (other["ckt_v4"] <= s["ckt_v4"] and
                other["memory"] <= s["memory"] and
                other["displaced_initials"] <= s["displaced_initials"] and
                other["displaced_vowels"] <= s["displaced_vowels"] and
                other["rp_max"] <= s["rp_max"] and
                other["home_floor"] >= s["home_floor"] and
                other["mx_score"] >= s["mx_score"]):
                is_dominated = True
                break
        if not is_dominated:
            pareto = [o for o in pareto if not (
                s["ckt_v4"] <= o["ckt_v4"] and s["memory"] <= o["memory"] and
                s["displaced_initials"] <= o["displaced_initials"] and s["displaced_vowels"] <= o["displaced_vowels"] and
                s["rp_max"] <= o["rp_max"] and s["home_floor"] >= o["home_floor"] and s["mx_score"] >= o["mx_score"]
            )]
            pareto.append(s)

    pareto.sort(key=lambda x: x["ckt_v4"])
    print(f"Pareto frontier size (7D): {len(pareto)}")

    def format_layout(row):
        sk = row["state_key"]
        hex_key = sk.hex() if isinstance(sk, bytes) else sk
        buf = bytes.fromhex(hex_key)
        head_keys = list(buf[2:29])
        final_keys = list(buf[29:64])
        tone = list(buf[64:69])
        
        ergo = json.loads(row["ergonomics_json"]) if row["ergonomics_json"] else {}
        loads = ergo.get("loads", {})

        return {
            "stateKey": hex_key,
            "layoutId": row["layout_id"],
            "cktV4": row["ckt_v4"],
            "memory": row["memory"],
            "displacedInitials": row["displaced_initials"],
            "displacedVowels": row["displaced_vowels"],
            "rpMax": row["rp_max"],
            "homeFloor": row["home_floor"],
            "mxScore": row["mx_score"],
            "loads": loads,
            "firstSeenGeneration": row["first_seen_generation"],
            "layout": {
                "capacity": [buf[0], buf[1]],
                "headKeys": head_keys,
                "finalKeys": final_keys,
                "tone": tone
            }
        }

    pareto_formatted = [format_layout(r) for r in pareto]

    slices = {}
    for item in pareto_formatted:
        combo = f"M{item['memory']}_D{item['displacedInitials']}_V{item['displacedVowels']}"
        if combo not in slices:
            slices[combo] = item

    v0_front = [p for p in pareto_formatted if p["displacedVowels"] == 0]
    v1_front = [p for p in pareto_formatted if p["displacedVowels"] == 1]
    v2_front = [p for p in pareto_formatted if p["displacedVowels"] == 2]

    pareto_export = {
        "version": "ckt-v4-m40-d3-v2-production-frontier-1",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "generationsReached": max_gen,
        "totalExploredStates": total_states,
        "paretoFrontierCount": len(pareto_formatted),
        "bestCktV4": pareto_formatted[0]["cktV4"] if pareto_formatted else None,
        "targetGuards": {
            "maxMemory": 40,
            "maxDisplacedInitials": 3,
            "maxDisplacedVowels": 2
        },
        "keySlices": slices,
        "top50Pareto": pareto_formatted[:50],
        "top20ParetoV0": v0_front[:20],
        "top20ParetoV2": v2_front[:20]
    }

    pareto_file = milestone_dir / "m40-d3-v2-pareto-frontier-20261108.json"
    with open(pareto_file, "w", encoding="utf-8") as f:
        json.dump(pareto_export, f, indent=2)
    print(f"Saved Pareto frontier to {pareto_file}")

    cur.execute("SELECT generation, plan_json FROM generations ORDER BY generation ASC")
    gen_rows = cur.fetchall()
    gen_progression = []
    for gr in gen_rows:
        pj = json.loads(gr["plan_json"])
        gen_progression.append({
            "generation": gr["generation"],
            "bestCktV4": pj.get("bestCktV4"),
            "totalStates": pj.get("totalStates"),
            "frontierCount": pj.get("frontierCount"),
            "acceptanceRate": pj.get("annealBatch", {}).get("acceptedFraction")
        })

    milestone_summary = {
        "version": "ckt-v4-m40-d3-v2-milestone-summary-1",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "caliber": "M<=40, D<=3, V<=2",
        "capacity": [21, 26],
        "generationsCompleted": max_gen,
        "totalExploredStates": total_states,
        "globalBest": pareto_formatted[0] if pareto_formatted else None,
        "v0Best": v0_front[0] if v0_front else None,
        "v1Best": v1_front[0] if v1_front else None,
        "v2Best": v2_front[0] if v2_front else None,
        "generationProgression": gen_progression
    }

    summary_file = milestone_dir / "m40-d3-v2-milestone-summary.json"
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(milestone_summary, f, indent=2)
    print(f"Saved Milestone summary to {summary_file}")
    conn.close()

if __name__ == "__main__":
    main()
