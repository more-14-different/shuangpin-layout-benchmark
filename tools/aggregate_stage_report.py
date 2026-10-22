import glob
import os
import re
import json
import csv
from datetime import datetime
import sqlite3

root = r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\research\exploration\production-ckt-v4-2121-20261021'

# 1. Database stats and integrity
db_path = os.path.join(root, 'exploration.sqlite3')
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
print(f'Absolute best CKT v4 in entire DB: {best_db_ckt:.6f}')
print(f'Absolute min Memory: {min_mem}')
print(f'Absolute min Displaced Initials: {min_d}')
print(f'Absolute min Displaced Vowels: {min_v}')

# 2. Stage D (Gen 401-700) Specific SQLite Stats
print('\n=== 2. STAGE D (GEN 401-700) BREAKTHROUGH ANALYSIS ===')
# States discovered in Stage D
staged_states_count = cur.execute('SELECT COUNT(*) FROM states WHERE first_seen_generation >= 401;').fetchone()[0]
staged_best_ckt = cur.execute('SELECT MIN(ckt_v4) FROM states WHERE first_seen_generation >= 401;').fetchone()[0]
print(f'Unique states first seen in Stage D (Gen 401-700): {staged_states_count}')
print(f'Best CKT v4 discovered during Stage D: {staged_best_ckt:.6f}')

# Prior to Stage D (Gen <= 400) vs After Stage D (Gen <= 700)
c_m44_d4 = cur.execute('SELECT COUNT(*), MIN(ckt_v4) FROM states WHERE memory<=44 AND displaced_initials<=4 AND first_seen_generation<=400;').fetchone()
d_m44_d4 = cur.execute('SELECT COUNT(*), MIN(ckt_v4) FROM states WHERE memory<=44 AND displaced_initials<=4;').fetchone()
print(f'M<=44, D<=4 before Stage D: count={c_m44_d4[0]}, best_ckt={c_m44_d4[1]}')
print(f'M<=44, D<=4 after  Stage D: count={d_m44_d4[0]}, best_ckt={d_m44_d4[1]:.6f}')

c_m45_d5 = cur.execute('SELECT COUNT(*), MIN(ckt_v4) FROM states WHERE memory<=45 AND displaced_initials<=5 AND first_seen_generation<=400;').fetchone()
d_m45_d5 = cur.execute('SELECT COUNT(*), MIN(ckt_v4) FROM states WHERE memory<=45 AND displaced_initials<=5;').fetchone()
print(f'M<=45, D<=5 before Stage D: count={c_m45_d5[0]}, best_ckt={c_m45_d5[1]}')
print(f'M<=45, D<=5 after  Stage D: count={d_m45_d5[0]}, best_ckt={d_m45_d5[1]:.6f}')

c_m46_d6 = cur.execute('SELECT COUNT(*), MIN(ckt_v4) FROM states WHERE memory<=46 AND displaced_initials<=6 AND first_seen_generation<=400;').fetchone()
d_m46_d6 = cur.execute('SELECT COUNT(*), MIN(ckt_v4) FROM states WHERE memory<=46 AND displaced_initials<=6;').fetchone()
print(f'M<=46, D<=6 before Stage D: count={c_m46_d6[0]}, best_ckt={c_m46_d6[1]:.6f}')
print(f'M<=46, D<=6 after  Stage D: count={d_m46_d6[0]}, best_ckt={d_m46_d6[1]:.6f}')

# Top 10 states in strict M<=44, D<=4 region
print('\nTop 10 states in M<=44, D<=4 region sorted by CKT v4:')
top_strict = cur.execute('''
    SELECT ckt_v4, memory, displaced_initials, displaced_vowels, rp_max, home_floor, mx_score, first_seen_generation, hex(state_key)
    FROM states
    WHERE memory<=44 AND displaced_initials<=4
    ORDER BY ckt_v4 ASC
    LIMIT 10;
''').fetchall()
for r in top_strict:
    print(f'  CKT={r[0]:.6f}, M={r[1]}, D={r[2]}, V={r[3]}, rp_max={r[4]:.4f}, home_floor={r[5]:.4f}, mx={r[6]:.2f}, first_seen_gen={r[7]}, key={r[8][:16]}')

# Top 10 states in M<=45, D<=5 region
print('\nTop 10 states in M<=45, D<=5 region sorted by CKT v4:')
top_m45 = cur.execute('''
    SELECT ckt_v4, memory, displaced_initials, displaced_vowels, rp_max, home_floor, mx_score, first_seen_generation, hex(state_key)
    FROM states
    WHERE memory<=45 AND displaced_initials<=5
    ORDER BY ckt_v4 ASC
    LIMIT 10;
''').fetchall()
for r in top_m45:
    print(f'  CKT={r[0]:.6f}, M={r[1]}, D={r[2]}, V={r[3]}, rp_max={r[4]:.4f}, home_floor={r[5]:.4f}, mx={r[6]:.2f}, first_seen_gen={r[7]}, key={r[8][:16]}')

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
        print(f'  {f}: {sz} bytes')

# 4. Check checkpoints of generation 700
gen700_cps = sorted(glob.glob(os.path.join(root, 'generation-0700', '*.checkpoint.json')))
cp_all_complete = True
print(f'\n=== 4. GENERATION 700 CHECKPOINT AUDIT ({len(gen700_cps)} chains) ===')
for cp_f in gen700_cps:
    d = json.load(open(cp_f, 'r', encoding='utf-8'))
    iter_val = d.get('iteration')
    target_val = d.get('targetSteps')
    bscore = d.get('bestScore')
    fname = os.path.basename(cp_f)
    print(f'  {fname}: iter={iter_val}/{target_val}, bestScore={bscore:.6f}')
    if iter_val != target_val or target_val != 40:
        cp_all_complete = False
print(f'All generation 700 checkpoints reached target 40: {cp_all_complete}')

# 5. Telemetry analysis for Stage D (PIDs: 1708, 22932)
telem_f = os.path.join(root, 'telemetry.csv')
stage_d_pids = {'1708', '22932'}
ws_list, pm_list, vram_list, util_list, temp_list, pwr_list, times = [], [], [], [], [], [], []
if os.path.exists(telem_f):
    with open(telem_f, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                if row['TargetPid'] in stage_d_pids:
                    ws_list.append(float(row['WorkingSetMB']))
                    pm_list.append(float(row['PrivateBytesMB']))
                    vram_list.append(float(row['VramUsedMB']))
                    util_list.append(float(row['GpuUtilPercent']))
                    temp_list.append(float(row['GpuTempC']))
                    pwr_list.append(float(row['GpuPowerW']))
                    times.append(row['Timestamp'])
            except:
                pass

print('\n=== 5. TELEMETRY SUMMARY (STAGE D: PIDs 1708 & 22932) ===')
print(f'Total Stage D telemetry samples: {len(ws_list)}')
if times:
    print(f'Stage D Start time: {times[0]} | Stage D End time: {times[-1]}')
    # PID 1708 duration
    t_1708 = [t for i, t in enumerate(times) if reader] # compute from segments
    # Let's inspect per PID
    for pid in sorted(stage_d_pids):
        p_times = []
        with open(telem_f, 'r', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                if r['TargetPid'] == pid:
                    p_times.append(r['Timestamp'])
        if p_times:
            t0 = datetime.strptime(p_times[0], '%Y-%m-%d %H:%M:%S')
            t1 = datetime.strptime(p_times[-1], '%Y-%m-%d %H:%M:%S')
            dur_h = (t1 - t0).total_seconds() / 3600.0
            print(f'  Segment PID {pid}: {len(p_times)} samples, {p_times[0]} -> {p_times[-1]} ({dur_h:.2f} h)')

    # Overall Stage D duration across both segments:
    # Seg 1: Gen 401..557 (157 gens)
    # Seg 2: Gen 558..700 (143 gens)
    # Total = 300 gens
    total_gens_stage_d = 300
    # Seg 1 time: 2026-10-22 15:15:08 to 20:08:16 = 4.886 h
    # Seg 2 time: 2026-10-22 20:26:55 to 2026-10-23 03:04:24 = 6.625 h
    # Total compute time = 11.51 h
    total_compute_hours = 4.886 + 6.625
    print(f'Stage D Total compute hours: {total_compute_hours:.2f} h')
    print(f'Stage D Real throughput: {total_gens_stage_d / total_compute_hours:.2f} gen/h')

if ws_list:
    print(f'RAM WorkingSet: min={min(ws_list):.1f} MB, max={max(ws_list):.1f} MB, mean={sum(ws_list)/len(ws_list):.1f} MB')
    print(f'RAM PrivateBytes: min={min(pm_list):.1f} MB, max={max(pm_list):.1f} MB, mean={sum(pm_list)/len(pm_list):.1f} MB')
    print(f'GPU VRAM Used: min={min(vram_list):.1f} MB, max={max(vram_list):.1f} MB, mean={sum(vram_list)/len(vram_list):.1f} MB (Capacity: 8192 MB)')
    print(f'GPU Temp: min={min(temp_list):.1f} C, max={max(temp_list):.1f} C, mean={sum(temp_list)/len(temp_list):.1f} C')
    print(f'GPU Power: min={min(pwr_list):.1f} W, max={max(pwr_list):.1f} W, mean={sum(pwr_list)/len(pwr_list):.1f} W')

# 6. Milestone generations overview (Gen 1, 15, 70, 200, 400, 500, 600, 700)
print('\n=== 6. MILESTONE GENERATIONS OVERVIEW (GEN 1..700) ===')
milestones = [1, 15, 70, 200, 400, 500, 557, 600, 650, 700]
print(f"{'Gen':>5} | {'Best CKT v4':>12} | {'New States':>10} | {'Total States':>12} | {'Reviews':>8}")
print('-'*58)
for g in milestones:
    plan_f = os.path.join(root, f'generation-{g:04d}-plan', 'plan.json')
    rev_f = os.path.join(root, f'generation-{g:04d}-plan', 'review-queue.json')
    if os.path.exists(plan_f):
        p = json.load(open(plan_f, 'r', encoding='utf-8'))
        rev_count = len(json.load(open(rev_f, 'r', encoding='utf-8'))) if os.path.exists(rev_f) else 0
        print(f"{g:5d} | {p['bestCktV4']:12.6f} | {p['importedNewStates']:10d} | {p['totalStates']:12d} | {rev_count:8d}")

# 7. Final 8 seeds from gen 700
p700 = json.load(open(os.path.join(root, 'generation-0700-plan', 'plan.json'), 'r', encoding='utf-8'))
print('\n=== 7. FINAL 8 SEEDS IN GENERATION 700 PLAN ===')
for s in p700['seeds']:
    m = s['point']['metrics']
    loads = m['ergonomics']['loads']
    fname = s.get('fileName', s.get('stateKey', '')[:16])
    print(f"Seed {s['rank']} ({s['reason']}): CKT={m['cktV4']:.6f}, M={m['memory']}, D={m['displacedInitials']}, V={m['displacedVowels']}, rp_s2={loads['rp_s2']:.4f}, home_floor={loads['home_floor']:.4f}, mx={m['ergonomics']['mxScore']:.2f}, key={fname}")

rev700 = json.load(open(os.path.join(root, 'generation-0700-plan', 'review-queue.json'), 'r', encoding='utf-8'))
print(f'\nGeneration 700 review queue size: {len(rev700)}')
