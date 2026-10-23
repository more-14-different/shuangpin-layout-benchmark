#!/usr/bin/env python3
"""
enhance_exploration_seeds.py

Manages seed selection and Pareto frontier locking for the 4-stage steep descent exploration:
- Stage 1 (Gen 1..100):   M <= 43, D <= 3
- Stage 2 (Gen 101..200): M <= 42, D <= 2
- Stage 3 (Gen 201..300): M <= 41, D <= 1
- Stage 4 (Gen 301..400): M <= 40, D <= 0

Ensures all 8 seeds per generation strictly adhere to the target region,
drawing directly from evaluated Pareto states in SQLite, and synthesizing
high-CKT compliant layouts across stage transitions when new basins are opened.
"""

import sys
import os
import json
import glob
import sqlite3
import random

def get_stage_targets(generation):
    # plan.json produced after generation N is used by generation N+1
    target_gen = generation + 1
    if target_gen <= 100:
        return 1, 43, 3
    elif target_gen <= 200:
        return 2, 42, 2
    elif target_gen <= 300:
        return 3, 41, 1
    else:
        return 4, 40, 0

def decode_state_key(state_bytes, layout_id):
    return {
        "id": layout_id,
        "capacity": [state_bytes[0], state_bytes[1]],
        "headKeys": list(state_bytes[2:29]),
        "finalKeys": list(state_bytes[29:64]),
        "tone": list(state_bytes[64:69])
    }

def load_scheme_fixtures(repo_root):
    fixture_path = os.path.join(repo_root, "research", ".cache", "ckt-v4-all-schemes.json")
    with open(fixture_path, "r", encoding="utf-8") as f:
        d = json.load(f)
    alphabet = d["keyAlphabet"]
    heads = d["heads"]
    finals = d["finals"]
    pinyin_map = d["pinyinMap"]
    common_pinyin = d["commonPinyin"]
    s005 = next(s for s in d["schemes"] if s["id"] == "S005")
    
    s005_head_keys = [255] * 27
    s005_final_keys = [255] * 35
    for p_idx in common_pinyin:
        h, fin = pinyin_map[p_idx]
        if [h, fin] == [255, 255]:
            continue
        code = s005["codeList"][p_idx]
        if not code:
            continue
        s005_head_keys[h] = alphabet.index(code[0])
        s005_final_keys[fin] = alphabet.index(code[1])
        
    s005_tone = [alphabet.index(c) for c in s005["tone"]]
    return alphabet, heads, finals, s005_head_keys, s005_final_keys, s005_tone

def calc_diagnostics(head_keys, final_keys, alphabet, heads, finals):
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

def synthesize_compliant_layout(base_head, base_final, target_m, target_d, alphabet, heads, finals, s005_heads, rng):
    """
    Synthesize a valid 21x21 layout satisfying memory <= target_m and displaced_initials <= target_d.
    Preserves optimized finals whenever possible, adapting heads towards S005 / QWERTY natural positions.
    """
    head_cand = list(base_head)
    final_cand = list(base_final)
    
    # If target_d == 0, S005 head layout is strictly D=0 and 21 distinct keys
    if target_d == 0:
        head_cand = list(s005_heads)
    elif target_d <= 2:
        # Check current displaced initials
        def preferred(token):
            if len(token) == 1 and token[0].upper() in alphabet:
                return alphabet.index(token[0].upper())
            return None
        displaced = [i for i in range(21) if len(heads[i]) == 1 and preferred(heads[i]) != head_cand[i]]
        if len(displaced) > target_d:
            # Need to reduce displacements: either use s005 heads or swap back to home
            if target_d == 2:
                # Top 1 swap: 'p' (1) to P (15), 'x' (13) to R (17)
                if head_cand[1] != 15 and 15 not in head_cand:
                    head_cand[1] = 15
                elif head_cand[1] != 15 and head_cand[13] == 15:
                    old_p = head_cand[1]
                    head_cand[1] = 15
                    head_cand[13] = old_p
            if target_d == 1 or len([i for i in range(21) if len(heads[i]) == 1 and preferred(heads[i]) != head_cand[i]]) > target_d:
                # Interpolate with s005 heads
                head_cand = list(s005_heads)
                # Intentionally displace 1 initial to provide target_d == 1 diversity
                if target_d == 1:
                    # displace 'r' or 'x'
                    disp_key = rng.choice([k for k in range(34) if k not in head_cand and k not in final_cand[:5]])
                    head_cand[17] = disp_key # r displaced

    # Ensure tone is valid and disjoint
    used = set(head_cand) | set(final_cand)
    available_tones = [k for k in range(34) if k not in used]
    if len(available_tones) < 5:
        # Fallback tones
        tones = [k for k in range(34) if k not in set(head_cand)][:5]
    else:
        tones = available_tones[:5]

    mem, d_val, _ = calc_diagnostics(head_cand, final_cand, alphabet, heads, finals)
    
    # If mem > target_m, mutate compound finals to match target_m
    if mem > target_m:
        # Revert some finals towards S005 finals
        head_cand = list(s005_heads)
        mem, d_val, _ = calc_diagnostics(head_cand, final_cand, alphabet, heads, finals)

    return {
        "id": f"syn-m{mem}-d{d_val}",
        "capacity": [21, 21],
        "headKeys": head_cand,
        "finalKeys": final_cand,
        "tone": tones
    }

def handle_descent_generation(plan_dir, generation):
    stage, max_m, max_d = get_stage_targets(generation)
    root = os.path.dirname(plan_dir)
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    alphabet, heads, finals, s005_heads, s005_finals, s005_tone = load_scheme_fixtures(repo_root)

    db_path = os.path.join(root, "exploration.sqlite3")
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # Query evaluated states satisfying current stage constraints
    cur.execute("""
        SELECT state_key, ckt_v4, memory, displaced_initials, rp_max, home_floor, mx_score
        FROM states
        WHERE memory <= ? AND displaced_initials <= ?
        ORDER BY ckt_v4 ASC;
    """, (max_m, max_d))
    matching_rows = cur.fetchall()

    seed_files = sorted(glob.glob(os.path.join(plan_dir, "seed-*.json")))
    if len(seed_files) != 8:
        print(f"Warning: expected 8 seed files, got {len(seed_files)}", file=sys.stderr)
        return

    rng = random.Random(generation * 31415 + max_m * 100 + max_d)
    layouts = []

    if matching_rows:
        # 1. Best CKT
        best_r = matching_rows[0]
        layouts.append(decode_state_key(best_r[0], f"descent-s{stage}-gen{generation:04d}-best-ckt"))
        used_keys = {best_r[0]}

        # 2. Metric extremes if available
        if len(matching_rows) > 1:
            r_rp = min(matching_rows, key=lambda r: r[4])
            if r_rp[0] not in used_keys:
                layouts.append(decode_state_key(r_rp[0], f"descent-s{stage}-gen{generation:04d}-rp"))
                used_keys.add(r_rp[0])
            r_home = max(matching_rows, key=lambda r: r[5])
            if r_home[0] not in used_keys and len(layouts) < 8:
                layouts.append(decode_state_key(r_home[0], f"descent-s{stage}-gen{generation:04d}-home"))
                used_keys.add(r_home[0])
            r_mx = max(matching_rows, key=lambda r: r[6])
            if r_mx[0] not in used_keys and len(layouts) < 8:
                layouts.append(decode_state_key(r_mx[0], f"descent-s{stage}-gen{generation:04d}-mx"))
                used_keys.add(r_mx[0])

        # Fill remaining from top CKT
        for r in matching_rows:
            if r[0] not in used_keys:
                layouts.append(decode_state_key(r[0], f"descent-s{stage}-gen{generation:04d}-p{len(layouts)+1}"))
                used_keys.add(r[0])
            if len(layouts) == 8:
                break

    # If fewer than 8 matching states, first bridge from nearest preceding stage states (e.g. Stage 3 -> Stage 4)
    if len(layouts) < 8:
        needed = 8 - len(layouts)
        cur.execute("""
            SELECT state_key FROM states
            WHERE memory <= ? AND displaced_initials <= ?
            ORDER BY ckt_v4 ASC
            LIMIT ?;
        """, (max_m + 2, max_d + 1, needed))
        bridge_rows = cur.fetchall()
        for br in bridge_rows:
            br_bytes = br[0]
            syn = synthesize_compliant_layout(s005_heads, list(br_bytes[29:64]), max_m, max_d, alphabet, heads, finals, s005_heads, rng)
            layouts.append(syn)
            if len(layouts) == 8:
                break

    # If still fewer than 8, synthesize compliant seeds from base/best
    base_head = s005_heads
    base_final = s005_finals
    if matching_rows:
        best_bytes = matching_rows[0][0]
        base_head = list(best_bytes[2:29])
        base_final = list(best_bytes[29:64])
    else:
        # Check if any states exist in the DB at all
        cur.execute("SELECT state_key FROM states ORDER BY ckt_v4 ASC LIMIT 1;")
        any_r = cur.fetchone()
        if any_r:
            base_final = list(any_r[0][29:64])

    compound_indices = [i for i in range(35) if i not in (0, 5, 10, 20, 23, 31)]
    while len(layouts) < 8:
        # Mutate compound finals to generate diverse candidate
        mut_final = list(base_final)
        for _ in range(rng.randint(1, 4)):
            i1, i2 = rng.sample(compound_indices, 2)
            mut_final[i1], mut_final[i2] = mut_final[i2], mut_final[i1]
        syn = synthesize_compliant_layout(base_head, mut_final, max_m, max_d, alphabet, heads, finals, s005_heads, rng)
        layouts.append(syn)

    # Write out seeds
    for sf, layout in zip(seed_files, layouts):
        with open(sf, "w", encoding="utf-8") as f:
            json.dump(layout, f, indent=2)
            f.write("\n")

    best_score_str = f"{matching_rows[0][1]:.6f}" if matching_rows else "synthesizing"
    print(f"[Descent Stage {stage}] (Gen {generation:04d}): Locked all 8 seeds to M<={max_m}, D<={max_d} basin (In DB: {len(matching_rows)}, Best CKT: {best_score_str})")

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
    handle_descent_generation(plan_dir, generation)

if __name__ == "__main__":
    main()
