#!/usr/bin/env python3
"""
enhance_exploration_seeds.py

Manages seed selection and enhancement between generations.
- In Stage C (generation < 400): applies "连线移面" (hyperplane shift) to seeds 3 and 4.
- In Stage D (generation >= 400): strictly enforces M <= 44 and D <= 4 across ALL 8 seeds,
  selecting the Pareto-optimal M <= 44, D <= 4 states from SQLite and seeding all chains
  exclusively within this extreme low-displacement basin.
"""

import sys
import os
import json
import glob
import sqlite3
import random

def decode_state_key(state_bytes, layout_id="BCW-m44-d4"):
    return {
        "id": layout_id,
        "capacity": [state_bytes[0], state_bytes[1]],
        "headKeys": list(state_bytes[2:29]),
        "finalKeys": list(state_bytes[29:64]),
        "tone": list(state_bytes[64:69])
    }

def build_hybrid_layout(head_layout, final_layout, label):
    h_keys = list(head_layout["headKeys"])
    f_keys = list(final_layout["finalKeys"])
    
    h_set = set(h_keys)
    f_set = set(f_keys)
    used = h_set | f_set
    
    tones = []
    for t in head_layout["tone"]:
        if t not in used and t not in tones:
            tones.append(t)
    for t in final_layout["tone"]:
        if t not in used and t not in tones and len(tones) < 5:
            tones.append(t)
    for k in range(34):
        if k not in used and k not in tones and len(tones) < 5:
            tones.append(k)
            
    if len(tones) < 5:
        return None
        
    hybrid = {
        "id": f"HYB-{label}",
        "capacity": [21, 21],
        "headKeys": h_keys,
        "finalKeys": f_keys,
        "tone": tones[:5]
    }
    
    if len(hybrid["headKeys"]) != 27 or len(hybrid["finalKeys"]) != 35:
        return None
    if len(set(hybrid["headKeys"])) != 21 or len(set(hybrid["finalKeys"])) != 21 or len(set(hybrid["tone"])) != 5:
        return None
    if not set(hybrid["tone"]).isdisjoint(set(hybrid["headKeys"])):
        return None
    if not set(hybrid["tone"]).isdisjoint(set(hybrid["finalKeys"])):
        return None
        
    return hybrid

def handle_stage_d(plan_dir, generation):
    root = os.path.dirname(plan_dir)
    db_path = os.path.join(root, "exploration.sqlite3")
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    
    # Query best M<=44, D<=4 states in SQLite
    rows = cur.execute("""
        SELECT state_key, ckt_v4, memory, displaced_initials, layout_id
        FROM states
        WHERE memory <= 44 AND displaced_initials <= 4
        ORDER BY ckt_v4 ASC
        LIMIT 8;
    """).fetchall()
    
    seed_files = sorted(glob.glob(os.path.join(plan_dir, "seed-*.json")))
    if len(seed_files) != 8:
        print(f"Warning: expected 8 seed files, got {len(seed_files)}", file=sys.stderr)
        return
        
    compound_indices = [i for i in range(35) if i not in (0, 5, 10, 20, 23, 31)]
    rng = random.Random(generation * 1000 + 44)
    
    # Base layout from best M<=44, D<=4 state
    base_state_bytes = rows[0][0]
    base_layout = decode_state_key(base_state_bytes, "BCW-m44-d4-opt")
    
    layouts = []
    # Use real discovered M<=44, D<=4 states
    for r in rows:
        layouts.append(decode_state_key(r[0], f"BCW-m44-d4-ckt{r[1]:.4f}"))
        
    # If fewer than 8, synthesize diverse compound rhyme mutations
    while len(layouts) < 8:
        idx = len(layouts) + 1
        l = {
            "id": f"BCW-m44-d4-mut{idx:02d}",
            "capacity": [21, 21],
            "headKeys": list(base_layout["headKeys"]),
            "finalKeys": list(base_layout["finalKeys"]),
            "tone": list(base_layout["tone"])
        }
        for _ in range(idx * 2):
            i1, i2 = rng.sample(compound_indices, 2)
            l["finalKeys"][i1], l["finalKeys"][i2] = l["finalKeys"][i2], l["finalKeys"][i1]
        layouts.append(l)
        
    for sf, layout in zip(seed_files, layouts):
        with open(sf, "w", encoding="utf-8") as f:
            json.dump(layout, f, indent=2)
            f.write("\n")
            
    print(f"Stage D (Gen {generation}): Successfully locked all 8 seeds to M<=44, D<=4 basin (Discovered: {len(rows)}/8, Best CKT: {rows[0][1]:.4f})")

def handle_stage_c(plan_dir, plan):
    seeds = plan.get("seeds", [])
    if len(seeds) < 8:
        return
        
    s1 = seeds[0]["point"]["layout"]
    s2 = seeds[1]["point"]["layout"]
    s_ergo = seeds[6]["point"]["layout"] if len(seeds) > 6 else seeds[5]["point"]["layout"]
    
    seed_files = sorted(glob.glob(os.path.join(plan_dir, "seed-*.json")))
    seed3_file = next((sf for sf in seed_files if os.path.basename(sf).startswith("seed-03-")), None)
    seed4_file = next((sf for sf in seed_files if os.path.basename(sf).startswith("seed-04-")), None)
    
    if not seed3_file or not seed4_file:
        return
        
    h1 = build_hybrid_layout(s2, s1, "lowMD-x-bestCKT")
    h2 = build_hybrid_layout(s2, s_ergo, "lowMD-x-ergo")
    
    if h1:
        with open(seed3_file, "w", encoding="utf-8") as f:
            json.dump(h1, f, indent=2)
            f.write("\n")
    if h2:
        with open(seed4_file, "w", encoding="utf-8") as f:
            json.dump(h2, f, indent=2)
            f.write("\n")
    print(f"Stage C: Enhanced seed-03 and seed-04 via hyperplane shift")

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <plan_directory>", file=sys.stderr)
        sys.exit(1)
        
    plan_dir = os.path.abspath(sys.argv[1])
    plan_file = os.path.join(plan_dir, "plan.json")
    if not os.path.exists(plan_file):
        print(f"Error: plan.json not found in {plan_dir}", file=sys.stderr)
        sys.exit(1)
        
    with open(plan_file, "r", encoding="utf-8") as f:
        plan = json.load(f)
        
    generation = plan.get("generation", 0)
    if generation >= 400:
        handle_stage_d(plan_dir, generation)
    else:
        handle_stage_c(plan_dir, plan)

if __name__ == "__main__":
    main()
