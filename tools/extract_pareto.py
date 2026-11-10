import re
import json

log_path = r"C:\Users\Xcz\.gemini\antigravity\brain\641ca4c3-4e1a-4526-bc24-c67d5a37c231\.system_generated\tasks\task-1797.log"

prod_seeds = {
    "gen0107-p5": "1515010f0c0503130d0b060a070910170a160411190212111111121818160a090d1012040c11040b050f09021901130d03030f05070217031306011806110a04081514000e",
    "gen0076-p8": "1515010f0c0503130d0b060a070910170a160411190212111111121818160a090d1005040c11040b050f09021901130d12030f12070217031306011806110a03081514000e",
    "gen0170-p7": "1515010f0c0503130d0b060a070910170a160411190212111111121818160a090d1012040c11040b030f09021901130d050303050702170f1306011806110a04081514000e",
    "BCW-3c47744cf2f7": "1515010f0c0503130d0b060a07091017041216111902121010100a181812070b0c101617040d090f0b130a190206030705010a05090302061311011811180d01081514000e"
}

def decode_state_key(hex_str):
    raw = bytes.fromhex(hex_str)
    cap = list(raw[0:2])
    heads = list(raw[2:29])
    finals = list(raw[29:64])
    tone = list(raw[64:69])
    return cap, heads, finals, tone

def encode_state_key(cap, heads, finals, tone):
    raw = bytes(cap + heads + finals + tone)
    return raw.hex()

def replay_mutations(layout_id):
    base_seed = None
    for s in ["gen0107-p5", "gen0076-p8", "gen0170-p7", "BCW-3c47744cf2f7"]:
        if layout_id.startswith(s):
            base_seed = s
            break
    if not base_seed:
        raise ValueError(f"Unknown base seed for {layout_id}")
    
    cap, heads, finals, tone = decode_state_key(prod_seeds[base_seed])
    suffix = layout_id[len(base_seed):]
    tokens = suffix.strip("-").split("-")
    
    idx = 0
    while idx < len(tokens):
        tok = tokens[idx]
        if not tok:
            idx += 1
            continue
        if tok in ("f1h", "h1h"):
            idx += 1
            pair = tokens[idx]
            i, j = [int(x) for x in pair.split("_")]
            if tok == "f1h":
                finals[i], finals[j] = finals[j], finals[i]
            else:
                heads[i], heads[j] = heads[j], heads[i]
        elif tok.startswith("d") and tok[1:].isdigit():
            idx += 1
            pair = tokens[idx]
            kind = pair[0]
            i, j = [int(x) for x in pair[1:].split("_")]
            if kind == "f":
                finals[i], finals[j] = finals[j], finals[i]
            else:
                heads[i], heads[j] = heads[j], heads[i]
        elif (tok.startswith("f") or tok.startswith("h")) and "_" in tok:
            kind = tok[0]
            i, j = [int(x) for x in tok[1:].split("_")]
            if kind == "f":
                finals[i], finals[j] = finals[j], finals[i]
            else:
                heads[i], heads[j] = heads[j], heads[i]
        else:
            raise ValueError(f"Unhandled token: {tok} in {layout_id}")
        idx += 1

    return cap, heads, finals, tone

def hamming_distance(h1, f1, t1, h2, f2, t2):
    dist = 0
    for a, b in zip(h1, h2):
        if a != b: dist += 1
    for a, b in zip(f1, f2):
        if a != b: dist += 1
    for a, b in zip(t1, t2):
        if a != b: dist += 1
    return dist

bcw_cap, bcw_h, bcw_f, bcw_t = decode_state_key(prod_seeds["BCW-3c47744cf2f7"])

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

candidates = []
for i, l in enumerate(lines):
    m = re.search(r"CKT: ([\d\.]+), U: (\d+), M/D/V: ([^,]+), MX: ([\d\.]+), rp_max: ([\d\.]+), w_max: ([\d\.]+)", l)
    if m:
        ckt = float(m.group(1))
        u = int(m.group(2))
        mdv = m.group(3)
        mx = float(m.group(4))
        rp_max = float(m.group(5))
        w_max = float(m.group(6))
        m_id = re.search(r"FOUND PRODGATE COMPLIANT: ([^\s]+) from", lines[i-1])
        if m_id:
            layout_id = m_id.group(1)
            candidates.append({
                "id": layout_id,
                "ckt": ckt,
                "u": u,
                "mdv": mdv,
                "mx": mx,
                "rp_max": rp_max,
                "w_max": w_max,
            })

by_u = {}
for c in candidates:
    u = c["u"]
    if u not in by_u:
        by_u[u] = []
    by_u[u].append(c)

for u in sorted(by_u.keys()):
    by_u[u].sort(key=lambda x: x["ckt"])

# Top candidates
selected = [
    # 1. 全合规最低 CKT
    by_u[353][0], # U=353: CKT 9.703548
    by_u[354][0], # U=354: CKT 9.704072
    # 2. CKT/U/工效综合平衡 (Tier-A)
    by_u[356][0], # U=356: CKT 9.713832
    by_u[357][0], # U=357: CKT 9.716421, MX 143.38
    # 3. 全合规最高 U
    by_u[358][0], # U=358: CKT 9.720905
    by_u[359][0], # U=359: CKT 9.742204
]

print("=== Replaying Selected Top Pareto Candidates ===")
for s in selected:
    c, h, f, t = replay_mutations(s["id"])
    st_key = encode_state_key(c, h, f, t)
    assert len(st_key) == 138, f"Expected 138 hex chars, got {len(st_key)}"
    h_dist = hamming_distance(h, f, t, bcw_h, bcw_f, bcw_t)
    s["state_key"] = st_key
    s["hamming_to_bcw"] = h_dist
    print(f"[{s['id']}]\n  U={s['u']}, CKT={s['ckt']:.6f}, MX={s['mx']:.2f}, Hamm_to_BCW={h_dist}")
    print(f"  stateKey={st_key}\n")

with open(r"d:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\tools\selected_pareto_preview.json", "w", encoding="utf-8") as f_out:
    json.dump(selected, f_out, indent=2)
print("Saved preview to selected_pareto_preview.json")
