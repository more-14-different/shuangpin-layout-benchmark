import glob
import os
import re
import json
import csv
from datetime import datetime
import sqlite3

import sys

repo = r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121'
if len(sys.argv) > 1:
    root = os.path.abspath(sys.argv[1])
else:
    ft_root = os.path.join(repo, 'research', 'exploration', 'production-ckt-v4-2121-finetune-20261024')
    if os.path.exists(ft_root):
        root = ft_root
    else:
        root = os.path.join(repo, 'research', 'exploration', 'production-ckt-v4-2121-descent-20261023')

if not os.path.exists(root):
    print(f"Output root not found: {root}")
    exit(0)

db_path = os.path.join(root, 'exploration.sqlite3')
if not os.path.exists(db_path):
    print("Database not yet initialized.")
    exit(0)

con = sqlite3.connect(db_path)
cur = con.cursor()

integrity = con.execute('PRAGMA integrity_check;').fetchall()
print('=== 1. SQLITE INTEGRITY & OVERVIEW ===')
print('PRAGMA integrity_check:', integrity)

state_count = cur.execute('SELECT COUNT(*) FROM states;').fetchone()[0]
gen_count = cur.execute('SELECT COUNT(*) FROM generations;').fetchone()[0]
best_db_ckt = cur.execute('SELECT MIN(ckt_v4) FROM states;').fetchone()[0]
min_mem = cur.execute('SELECT MIN(memory) FROM states;').fetchone()[0]
min_d = cur.execute('SELECT MIN(displaced_initials) FROM states;').fetchone()[0]
min_v = cur.execute('SELECT MIN(displaced_vowels) FROM states;').fetchone()[0]

print(f'Total unique states in DB: {state_count}')
print(f'Total DB generations: {gen_count}')
print(f'Absolute best CKT v4 in DB: {best_db_ckt:.6f}')
print(f'Absolute min Memory: {min_mem}')
print(f'Absolute min Displaced Initials: {min_d}')
print(f'Absolute min Displaced Vowels: {min_v}')

# 2. 4-Stage Frontier Breakdown
print('\n=== 2. 4-STAGE DESCENT FRONTIER BREAKDOWN ===')
stages = [
    (1, 43, 3),
    (2, 42, 2),
    (3, 41, 1),
    (4, 40, 0)
]
for stg, max_m, max_d in stages:
    cnt = cur.execute('SELECT COUNT(*) FROM states WHERE memory<=? AND displaced_initials<=?;', (max_m, max_d)).fetchone()[0]
    best_c = cur.execute('SELECT MIN(ckt_v4) FROM states WHERE memory<=? AND displaced_initials<=?;', (max_m, max_d)).fetchone()[0]
    best_str = f"{best_c:.6f}" if best_c is not None else "None"
    print(f"  Stage {stg} (M<={max_m}, D<={max_d}): {cnt:6d} states | Best CKT: {best_str}")

# Top 5 states in current frontier
cur_gen = gen_count
cur_stg, cur_m, cur_d = 1, 43, 3
if cur_gen > 300:
    cur_stg, cur_m, cur_d = 4, 40, 0
elif cur_gen > 200:
    cur_stg, cur_m, cur_d = 3, 41, 1
elif cur_gen > 100:
    cur_stg, cur_m, cur_d = 2, 42, 2

print(f'\nTop 5 states in current target region (M<={cur_m}, D<={cur_d}):')
top_states = cur.execute('''
    SELECT ckt_v4, memory, displaced_initials, displaced_vowels, rp_max, home_floor, mx_score, first_seen_generation, hex(state_key)
    FROM states
    WHERE memory<=? AND displaced_initials<=?
    ORDER BY ckt_v4 ASC
    LIMIT 5;
''', (cur_m, cur_d)).fetchall()
for r in top_states:
    print(f'  CKT={r[0]:.6f}, M={r[1]}, D={r[2]}, V={r[3]}, rp_max={r[4]:.4f}, home_floor={r[5]:.4f}, mx={r[6]:.2f}, gen={r[7]}, key={r[8][:16]}')

# 3. Check stderr files
stderr_files = glob.glob(os.path.join(root, 'generation-*', '*.stderr.log'))
session_stderr = os.path.join(root, 'anneal-batch-session.stderr.log')
all_stderrs = stderr_files + ([session_stderr] if os.path.exists(session_stderr) else [])
non_empty = [(f, os.path.getsize(f)) for f in all_stderrs if os.path.getsize(f) > 0]
print('\n=== 3. STDERR & ERROR AUDIT ===')
print(f'Total stderr files checked: {len(all_stderrs)}')
print(f'Non-empty stderr files: {len(non_empty)}')
if non_empty:
    for f, sz in non_empty[:5]:
        print(f'  {os.path.basename(f)}: {sz} bytes')

# 4. Check checkpoints of latest generation
latest_gen_dir = os.path.join(root, f'generation-{gen_count:04d}')
cps = sorted(glob.glob(os.path.join(latest_gen_dir, '*.checkpoint.json')))
cp_all_complete = True
print(f'\n=== 4. LATEST GENERATION ({gen_count}) CHECKPOINT AUDIT ({len(cps)} chains) ===')
for cp_f in cps:
    d = json.load(open(cp_f, 'r', encoding='utf-8'))
    iter_val = d.get('iteration')
    target_val = d.get('targetSteps')
    bscore = d.get('bestScore')
    fname = os.path.basename(cp_f)
    print(f'  {fname}: iter={iter_val}/{target_val}, bestScore={bscore:.6f}')
    if iter_val != target_val or target_val != 40:
        cp_all_complete = False
print(f'All generation {gen_count} checkpoints reached target 40: {cp_all_complete}')

# 5. Telemetry analysis
telem_f = os.path.join(root, 'telemetry.csv')
ws_list, pm_list, vram_list, util_list, temp_list, pwr_list, times = [], [], [], [], [], [], []
if os.path.exists(telem_f):
    with open(telem_f, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                ws_list.append(float(row['WorkingSetMB']))
                pm_list.append(float(row['PrivateBytesMB']))
                vram_list.append(float(row['VramUsedMB']))
                util_list.append(float(row['GpuUtilPercent']))
                temp_list.append(float(row['GpuTempC']))
                pwr_list.append(float(row['GpuPowerW']))
                times.append(row['Timestamp'])
            except:
                pass

print('\n=== 5. TELEMETRY SUMMARY ===')
print(f'Total telemetry samples: {len(ws_list)}')
if times:
    print(f'Start time: {times[0]} | End time: {times[-1]}')
    t0 = datetime.strptime(times[0], '%Y-%m-%d %H:%M:%S')
    t1 = datetime.strptime(times[-1], '%Y-%m-%d %H:%M:%S')
    dur_h = (t1 - t0).total_seconds() / 3600.0
    if dur_h > 0:
        print(f'Total elapsed: {dur_h:.2f} h | Real throughput: {gen_count / dur_h:.2f} gen/h')

if ws_list:
    print(f'RAM WorkingSet: min={min(ws_list):.1f} MB, max={max(ws_list):.1f} MB, mean={sum(ws_list)/len(ws_list):.1f} MB')
    print(f'RAM PrivateBytes: min={min(pm_list):.1f} MB, max={max(pm_list):.1f} MB, mean={sum(pm_list)/len(pm_list):.1f} MB')
    print(f'GPU VRAM Used: min={min(vram_list):.1f} MB, max={max(vram_list):.1f} MB, mean={sum(vram_list)/len(vram_list):.1f} MB')
    print(f'GPU Temp: min={min(temp_list):.1f} C, max={max(temp_list):.1f} C, mean={sum(temp_list)/len(temp_list):.1f} C')
    print(f'GPU Power: min={min(pwr_list):.1f} W, max={max(pwr_list):.1f} W, mean={sum(pwr_list)/len(pwr_list):.1f} W')

# 6. Latest Plan Seeds
latest_plan_file = os.path.join(root, f'generation-{gen_count:04d}-plan', 'plan.json')
if os.path.exists(latest_plan_file):
    p = json.load(open(latest_plan_file, 'r', encoding='utf-8'))
    print(f'\n=== 6. GENERATION {gen_count} PLAN SEEDS ===')
    for s in p['seeds']:
        m = s['point']['metrics']
        loads = m['ergonomics']['loads']
        fname = s.get('fileName', s.get('stateKey', '')[:16])
        print(f"Seed {s['rank']} ({s['reason']}): CKT={m['cktV4']:.6f}, M={m['memory']}, D={m['displacedInitials']}, V={m['displacedVowels']}, rp_s2={loads['rp_s2']:.4f}, home_floor={loads['home_floor']:.4f}, mx={m['ergonomics']['mxScore']:.2f}, key={fname}")
