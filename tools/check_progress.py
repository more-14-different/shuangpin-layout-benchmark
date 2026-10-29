import re

log_path = r"C:\Users\Xcz\.gemini\antigravity\brain\641ca4c3-4e1a-4526-bc24-c67d5a37c231\.system_generated\tasks\task-1797.log"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

d4_start_idx = None
for idx, l in enumerate(lines):
    if "Search depth 4:" in l:
        d4_start_idx = idx
        break

d3_bases = []
for idx in range(d4_start_idx):
    m = re.search(r"FOUND PRODGATE COMPLIANT: ([^ ]+) from", lines[idx])
    if m:
        d3_bases.append(m.group(1))

best_by_u = {}
counts_by_u = {}
d4_hits = []
d4_base_seen = []
d4_base_set = set()

for idx, l in enumerate(lines):
    m_hit = re.search(r"FOUND PRODGATE COMPLIANT: (.+)-d4-(?:f|h)\d+_\d+ from", l)
    if m_hit:
        base_id = m_hit.group(1)
        if base_id not in d4_base_set:
            d4_base_set.add(base_id)
            d4_base_seen.append(base_id)

    m = re.search(r"CKT: ([\d\.]+), U: (\d+), M/D/V: ([^,]+), MX: ([\d\.]+), rp_max: ([\d\.]+), w_max: ([\d\.]+)", l)
    if m:
        ckt = float(m.group(1))
        u = int(m.group(2))
        counts_by_u[u] = counts_by_u.get(u, 0) + 1
        info = {
            "ckt": ckt,
            "mdv": m.group(3),
            "mx": float(m.group(4)),
            "rp_max": float(m.group(5)),
            "w_max": float(m.group(6)),
            "line": lines[idx - 1].strip() if idx > 0 else ""
        }
        if u not in best_by_u or ckt < best_by_u[u]["ckt"]:
            best_by_u[u] = info

print(f"Log line count: {len(lines)}")
print(f"Depth 4 bases completed: {len(d4_base_seen)} / 2856 ({len(d4_base_seen)/2856*100:.2f}%)")
if d4_base_seen and d4_base_seen[-1] in d3_bases:
    curr_pos = d3_bases.index(d4_base_seen[-1])
    print(f"Current base index in pool: {curr_pos} / {len(d3_bases)} ({curr_pos/len(d3_bases)*100:.2f}%)")

print("\n=== Current Pareto Front by U ===")
for u in sorted(best_by_u.keys()):
    b = best_by_u[u]
    print(f"U={u} (Total: {counts_by_u[u]}): Best CKT={b['ckt']:.6f}, MDV={b['mdv']}, MX={b['mx']}, rp={b['rp_max']}, w={b['w_max']}")
    print(f"   Origin: {b['line']}")
