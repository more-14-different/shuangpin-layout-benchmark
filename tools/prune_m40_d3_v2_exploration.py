#!/usr/bin/env python3
"""Prune and streamline the M<=40, D<=3, V<=2 exploration database and intermediate artifacts.

Retains:
- 100% of 7D Pareto-optimal frontier states (1,576 states)
- 100% of high-performance states (CKT <= 9.15)
- 100% of initial launch and final gen-0400 production seeds
- Top 20 layouts for each (M, D, V) slice
- Top 50 layouts across ergonomic dimensions (RP min, Home Floor max, MX max)
- All 400 generation records in generations table
- All contract and archive metadata
- Milestone generation directories (gen-0015, gen-0090, gen-0250, gen-0400)
"""

import glob
import json
import os
import shutil
import sqlite3
import sys
import time

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    exp_dir = os.path.join(repo_root, "research", "exploration", "production-ckt-v4-2126-m40-d3-v2-20261108")
    db_path = os.path.join(exp_dir, "exploration.sqlite3")

    if not os.path.exists(db_path):
        print(f"Error: Database {db_path} not found.")
        sys.exit(1)

    initial_db_size = os.path.getsize(db_path) / 1024 / 1024
    print(f"=== Streamlining Exploration Database: {db_path} ===")
    print(f"Initial DB file size: {initial_db_size:.2f} MB")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT state_id, hex(state_key) as hex_key, ckt_v4, memory, displaced_initials, displaced_vowels, rp_max, home_floor, mx_score FROM states ORDER BY ckt_v4 ASC")
    rows = cur.fetchall()
    total_states = len(rows)
    print(f"Total states currently in DB: {total_states}")

    # 1. 7D Pareto frontier
    print("Computing 7D Pareto frontier...")
    pareto = []
    for s in rows:
        dominated = False
        for other in pareto:
            if (other['ckt_v4'] <= s['ckt_v4'] and
                other['memory'] <= s['memory'] and
                other['displaced_initials'] <= s['displaced_initials'] and
                other['displaced_vowels'] <= s['displaced_vowels'] and
                other['rp_max'] <= s['rp_max'] and
                other['home_floor'] >= s['home_floor'] and
                other['mx_score'] >= s['mx_score']):
                dominated = True
                break
        if not dominated:
            pareto = [o for o in pareto if not (
                s['ckt_v4'] <= o['ckt_v4'] and s['memory'] <= o['memory'] and
                s['displaced_initials'] <= o['displaced_initials'] and s['displaced_vowels'] <= o['displaced_vowels'] and
                s['rp_max'] <= o['rp_max'] and s['home_floor'] >= o['home_floor'] and s['mx_score'] >= o['mx_score']
            )]
            pareto.append(s)

    pareto_ids = {p['state_id'] for p in pareto}
    print(f"  -> Retained 7D Pareto optimal states: {len(pareto_ids)}")

    # 2. CKT <= 9.15
    top_ckt_ids = {s['state_id'] for s in rows if s['ckt_v4'] <= 9.15}
    print(f"  -> Retained top CKT (<= 9.15) states: {len(top_ckt_ids)}")

    # 3. Seed states from launch & gen0400 manifests
    manifests = [
        os.path.join(repo_root, "research", "seeds", "ckt-v4", "m40-d3-v2-launch-20261108", "manifest.json"),
        os.path.join(repo_root, "research", "seeds", "ckt-v4", "m40-d3-v2-20261108-gen0400", "manifest.json"),
    ]
    seed_keys = set()
    for mf in manifests:
        if os.path.exists(mf):
            with open(mf, "r", encoding="utf-8") as f:
                d = json.load(f)
                for s in d.get("seeds", []):
                    sk = s.get("stateKey")
                    if sk:
                        seed_keys.add(sk.upper())
    seed_ids = {s['state_id'] for s in rows if s['hex_key'] in seed_keys}
    print(f"  -> Retained seed states: {len(seed_ids)}")

    # 4. Top 20 per (M, D, V) slice
    slice_ids = set()
    by_slice = {}
    for s in rows:
        combo = (s['memory'], s['displaced_initials'], s['displaced_vowels'])
        by_slice.setdefault(combo, []).append(s['state_id'])
    for combo, sids in by_slice.items():
        slice_ids.update(sids[:20])
    print(f"  -> Retained top 20 per (M,D,V) slice: {len(slice_ids)} states across {len(by_slice)} slices")

    # 5. Top 50 by ergonomics
    top_rp_ids = {s['state_id'] for s in sorted(rows, key=lambda x: (x['rp_max'] if x['rp_max'] is not None else 999))[:50]}
    top_home_ids = {s['state_id'] for s in sorted(rows, key=lambda x: (x['home_floor'] if x['home_floor'] is not None else -999), reverse=True)[:50]}
    top_mx_ids = {s['state_id'] for s in sorted(rows, key=lambda x: (x['mx_score'] if x['mx_score'] is not None else -999), reverse=True)[:50]}

    keep_ids = pareto_ids | top_ckt_ids | seed_ids | slice_ids | top_rp_ids | top_home_ids | top_mx_ids
    pruned_count = total_states - len(keep_ids)
    print(f"\nFinal retain count: {len(keep_ids)} states ({len(keep_ids)/total_states*100:.2f}%)")
    print(f"States to prune: {pruned_count} states ({pruned_count/total_states*100:.2f}%)")

    # Execute deletion
    print("\nExecuting SQLite prune transaction...")
    cur.execute("CREATE TEMP TABLE keep_states (state_id INTEGER PRIMARY KEY)")
    cur.executemany("INSERT INTO keep_states VALUES (?)", [(sid,) for sid in keep_ids])

    cur.execute("DELETE FROM state_bands WHERE state_id NOT IN (SELECT state_id FROM keep_states)")
    bands_deleted = cur.rowcount
    print(f"  Deleted {bands_deleted} rows from state_bands.")

    cur.execute("DELETE FROM state_sources WHERE state_id NOT IN (SELECT state_id FROM keep_states)")
    sources_deleted = cur.rowcount
    print(f"  Deleted {sources_deleted} rows from state_sources.")

    cur.execute("DELETE FROM states WHERE state_id NOT IN (SELECT state_id FROM keep_states)")
    states_deleted = cur.rowcount
    print(f"  Deleted {states_deleted} rows from states.")

    conn.commit()

    print("Compacting database with VACUUM...")
    t0 = time.time()
    cur.execute("VACUUM")
    conn.commit()
    print(f"  VACUUM finished in {time.time() - t0:.2f}s.")

    final_db_size = os.path.getsize(db_path) / 1024 / 1024
    print(f"Compact DB file size: {final_db_size:.2f} MB (reduced by {initial_db_size - final_db_size:.2f} MB / {(1 - final_db_size/initial_db_size)*100:.1f}%)")

    # Verify counts
    cur.execute("SELECT count(*) FROM states")
    rem_states = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM state_bands")
    rem_bands = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM state_sources")
    rem_sources = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM generations")
    rem_gens = cur.fetchone()[0]
    print(f"Integrity check: {rem_states} states, {rem_bands} state_bands, {rem_sources} state_sources, {rem_gens} generations.")

    conn.close()

    # Step 2: Pruning intermediate generation directories on disk
    print("\n=== Streamlining Exploration Intermediate Step Dirs ===")
    milestone_gens = {15, 90, 250, 400}
    all_gen_dirs = sorted(glob.glob(os.path.join(exp_dir, "generation-*")))
    deleted_dirs_count = 0
    retained_dirs_count = 0

    for gd in all_gen_dirs:
        bname = os.path.basename(gd)
        parts = bname.replace("-plan", "").split("-")
        try:
            gnum = int(parts[1])
        except (ValueError, IndexError):
            continue

        if gnum in milestone_gens:
            retained_dirs_count += 1
        else:
            try:
                shutil.rmtree(gd)
                deleted_dirs_count += 1
            except Exception as e:
                print(f"Warning: failed to delete {gd}: {e}")

    print(f"Intermediate generation folders cleaned: deleted {deleted_dirs_count} folders, retained {retained_dirs_count} milestone folders.")
    print("Streamlining complete!")

if __name__ == "__main__":
    main()
