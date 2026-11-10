import sys, json, os

repo_root = r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121'
dest_dir = os.path.join(repo_root, 'research', 'seeds', 'ckt-v4', 'a7-closure-multi-seed-20261029')
os.makedirs(dest_dir, exist_ok=True)

sys.path.append(os.path.join(repo_root, 'tools'))
import find_43_candidates as f43

scores = {}
step_output_file = r'C:\Users\Xcz\.gemini\antigravity\brain\641ca4c3-4e1a-4526-bc24-c67d5a37c231\.system_generated\steps\967\output.txt'
with open(step_output_file, 'r') as f:
    for line in f:
        if line.startswith('composite '):
            parts = line.strip().split()
            sid = parts[1].rstrip(':')
            score = float(parts[2])
            scores[sid] = score

candidates = f43.m40_d0_schemes
a7_43 = [c for c in candidates if tuple(c[0]['tone']) == ('I', 'V', 'U', 'A', 'O') and not c[0]['id'].startswith('S005')]

def to_state_bytes(c):
    s = c[0]
    lay = f43.scheme_to_layout(s, s['id'])
    return bytes([lay['capacity'][0], lay['capacity'][1]] + lay['headKeys'] + lay['finalKeys'] + lay['tone'])

def hamming(b1, b2):
    return sum(1 for x, y in zip(b1, b2) if x != y)

items = [{'id': c[0]['id'], 'bytes': to_state_bytes(c), 'scheme': c[0], 'mem': c[1], 'd': c[2], 'v': c[3], 'ckt': scores[c[0]['id']]} for c in a7_43]

radius = 5
adj = {i: [] for i in range(len(items))}
for i in range(len(items)):
    for j in range(i+1, len(items)):
        if hamming(items[i]['bytes'], items[j]['bytes']) <= radius:
            adj[i].append(j)
            adj[j].append(i)

visited = set()
clusters = []
for i in range(len(items)):
    if i not in visited:
        comp = []
        q = [i]
        visited.add(i)
        while q:
            curr = q.pop()
            comp.append(curr)
            for neighbor in adj[curr]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    q.append(neighbor)
        clusters.append(comp)

basins = []
for comp in clusters:
    members = [items[idx] for idx in comp]
    members.sort(key=lambda m: m['ckt'])
    rep = members[0]
    basins.append({
        'rep': rep,
        'members': members,
        'size': len(members)
    })

basins.sort(key=lambda b: b['rep']['ckt'])

seed_paths = []
print(f"Exporting {len(basins)} basin seeds to {dest_dir}:")
for rank, b in enumerate(basins, 1):
    rep = b['rep']
    sid = rep['id']
    layout = f43.scheme_to_layout(rep['scheme'], f"a7-basin-{rank:02d}-{sid.lower()}")
    out_file = os.path.join(dest_dir, f"seed-{rank:02d}-{sid}.json")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(layout, f, indent=2)
        f.write('\n')
    rel_path = os.path.relpath(out_file, repo_root).replace('\\', '/')
    seed_paths.append(rel_path)
    ckt_val = rep['ckt']
    bsize = b['size']
    m_val = rep['mem']
    d_val = rep['d']
    print(f"  Seed {rank:02d} [{sid}]: CKT={ckt_val:.6f}, BasinSize={bsize}, M={m_val}, D={d_val}")

manifest = {
    'version': 'ckt-v4-strict-avuio-seeds-1',
    'description': 'A7 43-candidate basin deduplicated seeds (radius 5) for multi-seed closure verification',
    'basinRadius': radius,
    'totalCandidates': len(items),
    'deduplicatedBasins': len(basins),
    'targetRegion': {'maxMemory': 40, 'maxDisplacedInitials': 0},
    'seeds': seed_paths
}

manifest_path = os.path.join(dest_dir, 'manifest.json')
with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=2)
    f.write('\n')
print(f"Wrote manifest: {manifest_path}")
