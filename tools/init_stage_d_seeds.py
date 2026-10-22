import json
import os
import glob
import random

# Gen 43 M=44, D=4 base layout
base_layout = {
    "id": "BCW-m44-d4-base",
    "capacity": [21, 21],
    "headKeys": [1, 15, 31, 5, 3, 19, 2, 11, 6, 10, 7, 9, 16, 13, 23, 30, 4, 23, 25, 2, 18, 16, 16, 5, 22, 24, 24],
    "finalKeys": [29, 24, 9, 13, 23, 15, 7, 10, 30, 23, 17, 23, 22, 5, 33, 18, 1, 21, 18, 11, 15, 32, 5, 12, 21, 22, 19, 33, 11, 32, 1, 19, 25, 30, 7],
    "tone": [20, 14, 8, 26, 0]
}

# The single-vowel final indices in finals_35:
# 0: 'a', 5: 'e', 10: 'i', 20: 'o', 23: 'u', 31: 'v'
# Swapping ANY other indices (compound rhymes) guarantees M and D are completely unchanged!
compound_indices = [i for i in range(35) if i not in (0, 5, 10, 20, 23, 31)]

plan_dir = r"D:\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\research\exploration\production-ckt-v4-2121-20261021\generation-0400-plan"

rng = random.Random(20261022)

# Collect existing seed files
seed_files = sorted(glob.glob(os.path.join(plan_dir, "seed-*.json")))
assert len(seed_files) == 8, f"Expected 8 seed files, got {len(seed_files)}"

print("Generating 8 distinct M<=44, D<=4 seeds for Stage D...")
for rank, sf in enumerate(seed_files, 1):
    layout = {
        "id": f"BCW-m44-d4-seed{rank:02d}",
        "capacity": [21, 21],
        "headKeys": list(base_layout["headKeys"]),
        "finalKeys": list(base_layout["finalKeys"]),
        "tone": list(base_layout["tone"])
    }
    
    if rank == 1:
        # Seed 1: Pure base M=44, D=4
        pass
    else:
        # Swap compound rhymes to create diverse starting configurations
        # rank 2: 2 swaps, rank 3: 4 swaps, etc.
        swaps = rank * 2
        for _ in range(swaps):
            i1, i2 = rng.sample(compound_indices, 2)
            layout["finalKeys"][i1], layout["finalKeys"][i2] = layout["finalKeys"][i2], layout["finalKeys"][i1]
            
    # Verify structure
    assert len(layout["headKeys"]) == 27
    assert len(layout["finalKeys"]) == 35
    assert len(set(layout["headKeys"])) == 21
    assert len(set(layout["finalKeys"])) == 21
    assert len(set(layout["tone"])) == 5
    assert set(layout["tone"]).isdisjoint(set(layout["headKeys"]))
    assert set(layout["tone"]).isdisjoint(set(layout["finalKeys"]))
    
    with open(sf, "w", encoding="utf-8") as f:
        json.dump(layout, f, indent=2)
        f.write("\n")
        
    print(f"  Rank {rank}: {os.path.basename(sf)} -> {layout['id']}")

print("All 8 seeds successfully initialized with M<=44, D<=4!")
