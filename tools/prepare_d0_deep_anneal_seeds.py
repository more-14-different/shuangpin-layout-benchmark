import sqlite3
import json
import os
from pathlib import Path

worktree = Path(r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121')
m40d0_db = worktree / 'research/exploration/production-ckt-v4-2121-strict-ivuao-24h-20261026-m40d0/exploration.sqlite3'
output_dir = worktree / 'research/seeds/ckt-v4/strict-ivuao-d0-deep-anneal-20261028'
output_dir.mkdir(parents=True, exist_ok=True)

conn = sqlite3.connect(m40d0_db)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# We want M<=40, D=0, V<=5 and strict IVUAO
PRODUCTION_TONE = bytes([8, 21, 20, 0, 14])

cur.execute('''
    SELECT state_key, layout_id, ckt_v4, memory, displaced_initials, displaced_vowels,
           rp_max, home_floor, mx_score, ergonomics_json, first_seen_generation
    FROM states
    WHERE memory <= 40 AND displaced_initials = 0 AND substr(state_key, 65, 5) = ?
    ORDER BY ckt_v4 ASC
''', (PRODUCTION_TONE,))
rows = cur.fetchall()

print(f"Found {len(rows)} valid states with M<=40, D=0 and strict IVUAO in m40d0 db.")

# Pick top diverse seeds:
# 1. best-ckt
# 2. rank 2 ckt
# 3. rank 3 ckt
# 4. lowest-memory (if < 40) or lowest-right-pinky
# 5. highest-home-floor
# 6. highest mx-score
# 7. lowest rp_max
# 8. diverse / novel

used_keys = set()
selected = []

def add_seed(row, reason):
    k = bytes(row['state_key'])
    if k not in used_keys:
        used_keys.add(k)
        selected.append((row, reason))
        return True
    return False

# Seed 1: absolute best CKT
add_seed(rows[0], "best-ckt")
# Seed 2: 2nd best CKT
add_seed(rows[1], "runner-up-ckt")
# Seed 3: 3rd best CKT
add_seed(rows[2], "third-best-ckt")

# Seed 4: lowest rp_max
by_rp = sorted(rows, key=lambda r: (r['rp_max'] or 99.0, r['ckt_v4']))
for r in by_rp:
    if add_seed(r, "lowest-right-pinky"):
        break

# Seed 5: highest home_floor
by_home = sorted(rows, key=lambda r: (-(r['home_floor'] or 0.0), r['ckt_v4']))
for r in by_home:
    if add_seed(r, "highest-home-floor"):
        break

# Seed 6: highest mx_score
by_mx = sorted(rows, key=lambda r: (-(r['mx_score'] or 0.0), r['ckt_v4']))
for r in by_mx:
    if add_seed(r, "highest-mx-score"):
        break

# Seed 7: lowest memory
by_mem = sorted(rows, key=lambda r: (r['memory'], r['ckt_v4']))
for r in by_mem:
    if add_seed(r, "lowest-memory"):
        break

# Fill remaining up to 8 from top CKT
for r in rows:
    if len(selected) >= 8:
        break
    add_seed(r, f"top-ckt-rank-{len(selected)+1}")

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./"

manifest_seeds = []
for idx, (r, reason) in enumerate(selected):
    state_key_bytes = bytes(r['state_key'])
    hex_key = state_key_bytes.hex()
    
    # decode layout
    cap = list(state_key_bytes[0:2])
    head_keys = list(state_key_bytes[2:29])
    final_keys = list(state_key_bytes[29:64])
    tone = list(state_key_bytes[64:69])
    
    layout_obj = {
        "id": f"strict-ivuao-d0-deep-seed-{idx+1:02d}-{reason}",
        "capacity": cap,
        "headKeys": head_keys,
        "finalKeys": final_keys,
        "tone": tone
    }
    
    fname = f"seed-{idx+1:02d}-{reason}.json"
    with open(output_dir / fname, 'w', encoding='utf-8') as f:
        json.dump(layout_obj, f, indent=2)
        
    manifest_seeds.append({
        "rank": idx + 1,
        "reason": reason,
        "stateKey": hex_key,
        "cktV4": r['ckt_v4'],
        "memory": r['memory'],
        "displacedInitials": r['displaced_initials'],
        "displacedVowels": r['displaced_vowels'],
        "rpMax": r['rp_max'],
        "homeFloor": r['home_floor'],
        "mxScore": r['mx_score'],
        "filename": fname
    })
    print(f"Seed {idx+1}: {reason:22} | CKT: {r['ckt_v4']:.6f} | M={r['memory']}, D={r['displaced_initials']}, V={r['displaced_vowels']} | rp_max={r['rp_max']:.5f} | home={r['home_floor']:.4f} | mx={r['mx_score']:.1f}")

manifest = {
    "version": "strict-ivuao-d0-deep-anneal-seeds-1",
    "target": {"maxMemory": 40, "maxD": 0, "maxV": 5},
    "seeds": manifest_seeds
}

with open(output_dir / "manifest.json", 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=2)

print(f"\nManifest and {len(manifest_seeds)} seeds written to {output_dir}")
conn.close()
