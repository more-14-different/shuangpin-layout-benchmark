import os
import shutil
import sqlite3
import sys

sys.stdout.reconfigure(line_buffering=True)

base = r"d:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\research\exploration"

print("=== Starting Exploration Database & Directory Streamlining ===")

# 1. Clean redundant run directories
redundant_dirs = [
    os.path.join(base, "a7-closure-run-a-20261029"),
    os.path.join(base, "a7-closure-run-b-20261029"),
    os.path.join(base, "a7-closure-run-c-20261029"),
    os.path.join(base, "production-ckt-v4-2121-strict-ivuao-24h-20261026-m40d0"),
]

for d in redundant_dirs:
    if os.path.exists(d):
        sz = sum(os.path.getsize(os.path.join(root, f)) for root, _, files in os.walk(d) for f in files)
        cnt = sum(len(files) for _, _, files in os.walk(d))
        print(f"Removing redundant directory: {os.path.basename(d)} ({sz / (1024*1024):.2f} MB, {cnt} files)...")
        shutil.rmtree(d)
        print("  -> Removed.")

# 2. Prune early generation subdirectories in prodgate exploration
pg_dir = os.path.join(base, "production-ckt-v4-2121-strict-ivuao-24h-20261026-m40d0-prodgate")
if os.path.exists(pg_dir):
    print("\nCleaning early generation checkpoint folders in m40d0-prodgate (keeping gen 290-302)...")
    removed_bytes = 0
    removed_files = 0
    for item in os.listdir(pg_dir):
        if item.startswith("generation-") and not item.endswith("-plan"):
            try:
                gen_num = int(item.split("-")[1])
                if gen_num < 290:
                    p = os.path.join(pg_dir, item)
                    plan_p = os.path.join(pg_dir, f"generation-{gen_num:04d}-plan")
                    for target in [p, plan_p]:
                        if os.path.exists(target):
                            if os.path.isdir(target):
                                sz = sum(os.path.getsize(os.path.join(r, f)) for r, _, files in os.walk(target) for f in files)
                                cnt = sum(len(files) for _, _, files in os.walk(target))
                                removed_bytes += sz
                                removed_files += cnt
                                shutil.rmtree(target)
                            else:
                                removed_bytes += os.path.getsize(target)
                                removed_files += 1
                                os.remove(target)
            except Exception:
                pass
    print(f"  -> Removed {removed_files} early checkpoint files ({removed_bytes / (1024*1024):.2f} MB).")

# 3. Clean early generation subdirectories in d0-deep-anneal
anneal_dir = os.path.join(base, "production-ckt-v4-2121-strict-ivuao-d0-deep-anneal-20261028")
if os.path.exists(anneal_dir):
    print("\nCleaning early generation checkpoint folders in d0-deep-anneal (keeping gen 370-382)...")
    removed_bytes = 0
    removed_files = 0
    for item in os.listdir(anneal_dir):
        if item.startswith("generation-") and not item.endswith("-plan"):
            try:
                gen_num = int(item.split("-")[1])
                if gen_num < 370:
                    p = os.path.join(anneal_dir, item)
                    plan_p = os.path.join(anneal_dir, f"generation-{gen_num:04d}-plan")
                    for target in [p, plan_p]:
                        if os.path.exists(target):
                            if os.path.isdir(target):
                                sz = sum(os.path.getsize(os.path.join(r, f)) for r, _, files in os.walk(target) for f in files)
                                cnt = sum(len(files) for _, _, files in os.walk(target))
                                removed_bytes += sz
                                removed_files += cnt
                                shutil.rmtree(target)
                            else:
                                removed_bytes += os.path.getsize(target)
                                removed_files += 1
                                os.remove(target)
            except Exception:
                pass
    print(f"  -> Removed {removed_files} early checkpoint files ({removed_bytes / (1024*1024):.2f} MB).")

# 4. Prune database states in production-ckt-v4-2121-strict-ivuao-24h-20261026-m40d0-prodgate/exploration.sqlite3
pg_db = os.path.join(pg_dir, "exploration.sqlite3")
if os.path.exists(pg_db):
    initial_sz = os.path.getsize(pg_db) / (1024 * 1024)
    print(f"\nPruning database: {os.path.basename(pg_db)} (Initial size: {initial_sz:.2f} MB)...")
    con = sqlite3.connect(pg_db)
    cur = con.cursor()
    
    cur.execute("SELECT count(*) FROM states")
    before_states = cur.fetchone()[0]
    
    print("Building temporary table of inferior/early states...")
    cur.execute("""
        CREATE TEMP TABLE to_delete AS
        SELECT state_id FROM states
        WHERE ckt_v4 > 10.0
           OR (first_seen_generation < 100 AND ckt_v4 > 9.85)
    """)
    cur.execute("CREATE INDEX tmp_del_idx ON to_delete(state_id)")
    cur.execute("SELECT count(*) FROM to_delete")
    del_count = cur.fetchone()[0]
    print(f"Identified {del_count} redundant states for deletion.")

    print("Creating temporary index on state_bands(state_id) for fast pruning...")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tmp_state_bands_sid ON state_bands(state_id)")

    print("Pruning state_bands...")
    cur.execute("DELETE FROM state_bands WHERE state_id IN (SELECT state_id FROM to_delete)")
    
    print("Pruning state_sources...")
    cur.execute("DELETE FROM state_sources WHERE state_id IN (SELECT state_id FROM to_delete)")
    
    print("Pruning states...")
    cur.execute("DELETE FROM states WHERE state_id IN (SELECT state_id FROM to_delete)")
    
    print("Dropping temporary index...")
    cur.execute("DROP INDEX IF EXISTS idx_tmp_state_bands_sid")
    con.commit()
    
    cur.execute("SELECT count(*) FROM states")
    after_states = cur.fetchone()[0]
    print(f"  -> Pruning complete! (States before: {before_states}, after: {after_states}).")
    
    print("Running VACUUM to compact database and defragment storage...")
    cur.execute("VACUUM")
    con.close()
    
    final_sz = os.path.getsize(pg_db) / (1024 * 1024)
    print(f"  -> Vacuum complete! Final DB size: {final_sz:.2f} MB (Reclaimed: {initial_sz - final_sz:.2f} MB).")

print("\n=== All Streamlining Completed Successfully ===")
