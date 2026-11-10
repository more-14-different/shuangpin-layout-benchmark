import os
import json

repo_root = r"D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121"
dest_dir = os.path.join(repo_root, "research", "seeds", "ckt-v4", "initial-strict-avuio-21x21-20261024")
os.makedirs(dest_dir, exist_ok=True)

fixture_path = os.path.join(repo_root, "research", ".cache", "ckt-v4-all-schemes.json")
with open(fixture_path, "r", encoding="utf-8") as f:
    d = json.load(f)

alphabet = d["keyAlphabet"]
heads = d["heads"]
finals = d["finals"]
pinyin_map = d["pinyinMap"]
common_pinyin = d["commonPinyin"]

def scheme_to_layout(s, layout_id):
    head_keys = [255] * 27
    final_keys = [255] * 35
    for p_idx in common_pinyin:
        h, fin = pinyin_map[p_idx]
        if [h, fin] == [255, 255]:
            continue
        code = s["codeList"][p_idx]
        if not code:
            continue
        head_keys[h] = alphabet.index(code[0])
        final_keys[fin] = alphabet.index(code[1])
    tone_keys = [alphabet.index(c) for c in s["tone"]]
    return {
        "id": layout_id,
        "capacity": s["capacity"],
        "headKeys": head_keys,
        "finalKeys": final_keys,
        "tone": tone_keys
    }

def calc_diagnostics(head_keys, final_keys):
    def preferred(token):
        if len(token) == 1:
            ch = token[0].upper()
            if ch in alphabet:
                return alphabet.index(ch)
        return None

    def differs(actual, token):
        return preferred(token) != actual

    d_inits = sum(1 for i in range(21) if len(heads[i]) == 1 and differs(head_keys[i], heads[i]))
    vowels = ['a', 'e', 'i', 'o', 'u']
    d_vowels = sum(1 for v in vowels if differs(final_keys[finals.index(v)], v))
    mem = sum(1 for i in range(21) if differs(head_keys[i], heads[i]))
    mem += len(set(head_keys[21:24]))
    mem += 1 if differs(head_keys[24], heads[24]) else 0
    mem += 1 if differs(head_keys[25], heads[25]) else 0
    if head_keys[26] != head_keys[25]:
        mem += 1 if head_keys[26] != preferred(heads[25]) else 0
        mem += 1
    mem += sum(1 for i in range(35) if differs(final_keys[i], finals[i]))
    return mem, d_inits, d_vowels

CONSONANTS = set(alphabet.index(c) for c in "BCDEFGHJKLMNPQRSTWXYZ")
AVUIO = set(alphabet.index(c) for c in "AVUIO")

selected_scheme_ids = [
    ("R9-21X21-M40-02", "production-snow-pinyin-benchmark"),
    ("R9-21X21-M40-01", "canonical-r9-best"),
    ("R7-21X21-M40-01", "canonical-r7-baseline"),
    ("R8-21X21-M40-01", "canonical-r8-baseline"),
    ("R4-21X21-M41-07", "canonical-r4-baseline"),
    ("R3-21X21-M43-06", "canonical-r3-m43"),
    ("NF2-21X21-AVUIO-M39-26", "canonical-nf2-lowm39"),
    ("S005-NF", "historical-foundation-s005nf")
]

seed_paths = []
print("Initializing 8 strict AVUIO 21x21 seeds:")
for rank, (sid, reason) in enumerate(selected_scheme_ids, 1):
    scheme = next(x for x in d["schemes"] if x["id"] == sid)
    layout_id = f"strict-avuio-s1-seed-{rank:02d}-{sid.lower()}"
    layout = scheme_to_layout(scheme, layout_id)
    
    # Assert strict requirements
    assert layout["capacity"] == [21, 21]
    assert set(layout["tone"]) == AVUIO, f"Invalid tone keys for {sid}: {layout['tone']}"
    assert set(layout["headKeys"]) == CONSONANTS, f"Invalid head keys for {sid}"
    assert set(layout["finalKeys"]) == CONSONANTS, f"Invalid final keys for {sid}"
    assert 255 not in layout["headKeys"] and 255 not in layout["finalKeys"]
    
    mem, d_val, v_val = calc_diagnostics(layout["headKeys"], layout["finalKeys"])
    assert mem <= 43, f"Memory {mem} > 43 for {sid}"
    assert d_val <= 3, f"D {d_val} > 3 for {sid}"
    
    out_file = os.path.join(dest_dir, f"seed-{rank:02d}-{sid}.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(layout, f, indent=2)
        f.write("\n")
    rel_path = os.path.relpath(out_file, repo_root).replace("\\", "/")
    seed_paths.append(rel_path)
    print(f"  Seed {rank} [{reason}]: {sid} -> M={mem}, D={d_val}, V={v_val}, tone={''.join(alphabet[k] for k in layout['tone'])} ({os.path.basename(out_file)})")

manifest = {
    "version": "ckt-v4-strict-avuio-seeds-1",
    "description": "Strict AVUIO 21x21 seeds adhering 100% to fixed AVUIO auxiliary keys and 21 consonant keys",
    "stage": 1,
    "targetRegion": {"maxMemory": 43, "maxDisplacedInitials": 3},
    "seeds": seed_paths
}
manifest_path = os.path.join(dest_dir, "manifest.json")
with open(manifest_path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
print(f"Manifest written: {manifest_path}")
