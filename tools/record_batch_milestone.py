import os
import sys
import json
import sqlite3
import csv
from datetime import datetime

repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if len(sys.argv) > 1:
    root = os.path.abspath(sys.argv[1])
else:
    sa_root = os.path.join(repo, 'research', 'exploration', 'production-ckt-v4-2121-strict-avuio-20261024')
    if os.path.exists(sa_root):
        root = sa_root
    else:
        ft_root = os.path.join(repo, 'research', 'exploration', 'production-ckt-v4-2121-finetune-20261024')
        if os.path.exists(ft_root):
            root = ft_root
        else:
            root = os.path.join(repo, 'research', 'exploration', 'production-ckt-v4-2121-descent-20261023')

is_strict = 'strict-avuio' in root
is_finetune = 'finetune' in root and not is_strict
if is_strict:
    milestone_dir = os.path.join(repo, 'research', 'milestones', 'strict-avuio')
elif is_finetune:
    milestone_dir = os.path.join(repo, 'research', 'milestones', 'finetune')
else:
    milestone_dir = os.path.join(repo, 'research', 'milestones', 'descent')
os.makedirs(milestone_dir, exist_ok=True)

db_path = os.path.join(root, 'exploration.sqlite3')
con = sqlite3.connect(db_path)
cur = con.cursor()

gen_count = cur.execute('SELECT COUNT(*) FROM generations;').fetchone()[0]
state_count = cur.execute('SELECT COUNT(*) FROM states;').fetchone()[0]
best_db_ckt = cur.execute('SELECT MIN(ckt_v4) FROM states;').fetchone()[0]

# Determine stage and batch
if is_finetune:
    stage = 4
    batch = (gen_count - 1) // 25 + 1
else:
    stage = 1 + (gen_count - 1) // 100
    gen_in_stage = (gen_count - 1) % 100 + 1
    batch = (gen_in_stage - 1) // 25 + 1

# Frontier stats
stages_stats = {}
for s, max_m, max_d in [(1, 43, 3), (2, 42, 2), (3, 41, 1), (4, 40, 0)]:
    cnt = cur.execute('SELECT COUNT(*) FROM states WHERE memory<=? AND displaced_initials<=?;', (max_m, max_d)).fetchone()[0]
    best_c = cur.execute('SELECT MIN(ckt_v4) FROM states WHERE memory<=? AND displaced_initials<=?;', (max_m, max_d)).fetchone()[0]
    stages_stats[f"stage_{s}"] = {
        "target": {"maxMemory": max_m, "maxD": max_d},
        "count": cnt,
        "bestCkt": best_c
    }

# Top states in target stage
cur_m, cur_d = 43, 3
if stage == 2: cur_m, cur_d = 42, 2
elif stage == 3: cur_m, cur_d = 41, 1
elif stage == 4: cur_m, cur_d = 40, 0

top_rows = cur.execute('''
    SELECT ckt_v4, memory, displaced_initials, displaced_vowels, rp_max, home_floor, mx_score, first_seen_generation, hex(state_key)
    FROM states
    WHERE memory<=? AND displaced_initials<=?
    ORDER BY ckt_v4 ASC
    LIMIT 5;
''', (cur_m, cur_d)).fetchall()

top_list = []
for r in top_rows:
    top_list.append({
        "cktV4": r[0],
        "memory": r[1],
        "displacedInitials": r[2],
        "displacedVowels": r[3],
        "rpMax": r[4],
        "homeFloor": r[5],
        "mxScore": r[6],
        "gen": r[7],
        "key": r[8][:16]
    })

# Telemetry
telem_f = os.path.join(root, 'telemetry.csv')
ws_list, vram_list, temp_list, pwr_list, times = [], [], [], [], []
if os.path.exists(telem_f):
    with open(telem_f, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                ws_list.append(float(row['WorkingSetMB']))
                vram_list.append(float(row['VramUsedMB']))
                temp_list.append(float(row['GpuTempC']))
                pwr_list.append(float(row['GpuPowerW']))
                times.append(row['Timestamp'])
            except:
                pass

milestone = {
    "version": "ckt-v4-descent-milestone-1",
    "stage": stage,
    "batch": batch,
    "generation": gen_count,
    "timestamp": datetime.now().isoformat(),
    "statesInDb": state_count,
    "bestCktDb": best_db_ckt,
    "frontier": stages_stats,
    "topStates": top_list,
    "telemetry": {
        "samples": len(ws_list),
        "meanWorkingSetMB": sum(ws_list)/len(ws_list) if ws_list else None,
        "meanVramUsedMB": sum(vram_list)/len(vram_list) if vram_list else None,
        "meanGpuTempC": sum(temp_list)/len(temp_list) if temp_list else None,
        "meanGpuPowerW": sum(pwr_list)/len(pwr_list) if pwr_list else None,
        "startTime": times[0] if times else None,
        "endTime": times[-1] if times else None
    }
}

if is_finetune:
    out_name = f"finetune-batch-{batch:02d}-gen-{gen_count:04d}.json"
else:
    out_name = f"stage-{stage:02d}-batch-{batch:02d}-gen-{gen_count:04d}.json"
out_path = os.path.join(milestone_dir, out_name)
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(milestone, f, indent=2)
    f.write('\n')

print(f"Recorded milestone: {out_path}")
