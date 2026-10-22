import sqlite3
import os
import json

repo = r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121'
source_db = os.path.join(repo, 'research', 'exploration', 'production-ckt-v4-2121-20261021', 'exploration.sqlite3')
dest_dir = os.path.join(repo, 'research', 'seeds', 'ckt-v4', 'initial-descent-21x21-20261023')
os.makedirs(dest_dir, exist_ok=True)

con = sqlite3.connect(source_db)
cur = con.cursor()

# Query candidates with M<=43, D<=3
cur.execute('''
    SELECT ckt_v4, memory, displaced_initials, displaced_vowels, rp_max, home_floor, mx_score, first_seen_generation, hex(state_key), state_key
    FROM states
    WHERE memory<=43 AND displaced_initials<=3
    ORDER BY ckt_v4 ASC;
''')
rows = cur.fetchall()

def decode_state_key(state_bytes, layout_id):
    return {
        "id": layout_id,
        "capacity": [state_bytes[0], state_bytes[1]],
        "headKeys": list(state_bytes[2:29]),
        "finalKeys": list(state_bytes[29:64]),
        "tone": list(state_bytes[64:69])
    }

# 1. Best CKT
s1 = rows[0]
# 2. Min rp_max
s2 = min(rows, key=lambda r: r[4])
# 3. Max home_floor
s3 = max(rows, key=lambda r: r[5])
# 4. Max mx_score
s4 = max(rows, key=lambda r: r[6])

selected = [s1, s2, s3, s4]
selected_keys = {r[8] for r in selected}

# Fill remaining by CKT
for r in rows:
    if r[8] not in selected_keys:
        selected.append(r)
        selected_keys.add(r[8])
    if len(selected) == 8:
        break

reasons = [
    'best-ckt-v4',
    'metric-extreme:right-pinky',
    'metric-extreme:home-floor',
    'metric-extreme:moving-hand',
    'pareto-rank-2',
    'pareto-rank-3',
    'pareto-rank-4',
    'pareto-rank-5'
]

print(f'Writing 8 initial seeds to {dest_dir}:')
seed_paths = []
for idx, (r, reason) in enumerate(zip(selected, reasons)):
    rank = idx + 1
    ckt = r[0]
    hex_k = r[8]
    raw_b = r[9]
    layout_id = f"descent-s1-seed-{rank:02d}-{hex_k[:12]}"
    layout = decode_state_key(raw_b, layout_id)
    out_file = os.path.join(dest_dir, f"seed-{rank:02d}-{hex_k[:12]}.json")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(layout, f, indent=2)
        f.write('\n')
    rel_path = os.path.relpath(out_file, repo).replace('\\', '/')
    seed_paths.append(rel_path)
    print(f"  Seed {rank} ({reason}): CKT={ckt:.6f}, M={r[1]}, D={r[2]}, V={r[3]}, rp={r[4]:.4f}, home={r[5]:.4f}, mx={r[6]:.2f} -> {os.path.basename(out_file)}")

# Write manifest
manifest = {
    "version": "ckt-v4-descent-seeds-1",
    "sourceDatabase": os.path.relpath(source_db, repo).replace('\\', '/'),
    "stage": 1,
    "targetRegion": {"maxMemory": 43, "maxDisplacedInitials": 3},
    "seeds": seed_paths
}
manifest_path = os.path.join(dest_dir, "manifest.json")
with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=2)
    f.write('\n')
print(f"Wrote manifest: {manifest_path}")
