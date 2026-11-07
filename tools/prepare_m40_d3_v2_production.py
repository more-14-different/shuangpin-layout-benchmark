import json
import sqlite3
import os
from pathlib import Path

repo = Path(r"D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2126")

schemes_file = repo / 'research/.cache/ckt-v4-all-schemes.json'
fixture = json.load(open(schemes_file, encoding='utf-8'))
heads = fixture['heads']
finals = fixture['finals']
pinyin_map = fixture['pinyinMap']
common_pinyin = fixture['commonPinyin']
alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./"

ranking_file = repo / 'research/config/ckt-v4-ranked-seeds-21x26.json'
ranking_data = json.load(open(ranking_file, encoding='utf-8'))
ranking_map = {item['id']: item for item in ranking_data['ranking']}

def preferred(token):
    if len(token) == 1:
        c = token.upper()
        if c in alphabet:
            return alphabet.index(c)
    return None

def differs(actual, token):
    pref = preferred(token)
    return pref is None or pref != actual

def diagnose(head_keys, final_keys):
    displaced_initials = 0
    for i in range(21):
        if len(heads[i]) == 1 and differs(head_keys[i], heads[i]):
            displaced_initials += 1
            
    displaced_vowels = 0
    for v_name in ["a", "e", "i", "o", "u"]:
        idx = finals.index(v_name)
        if differs(final_keys[idx], finals[idx]):
            displaced_vowels += 1
            
    memory = displaced_initials
    memory += len(set(head_keys[21:24]))
    memory += int(differs(head_keys[24], heads[24]))
    memory += int(differs(head_keys[25], heads[25]))
    if head_keys[26] != head_keys[25]:
        pref25 = preferred(heads[25])
        memory += int(head_keys[26] != (pref25 if pref25 is not None else -1))
        memory += 1
    for i in range(35):
        if differs(final_keys[i], finals[i]):
            memory += 1
            
    return memory, displaced_initials, displaced_vowels

def compile_layout(scheme_input):
    code_list = scheme_input['codeList']
    head_keys = [-1] * 27
    final_keys = [-1] * 35
    for p_idx in common_pinyin:
        code = code_list[p_idx]
        head, fin = pinyin_map[p_idx]
        if head == 255 or fin == 255 or code is None:
            continue
        c1 = alphabet.index(code[0].upper())
        c2 = alphabet.index(code[1].upper())
        if head_keys[head] != -1 and head_keys[head] != c1:
            return None
        head_keys[head] = c1
        if final_keys[fin] != -1 and final_keys[fin] != c2:
            return None
        final_keys[fin] = c2
    if any(k == -1 for k in head_keys) or any(k == -1 for k in final_keys):
        return None
    tone = [alphabet.index(c.upper()) for c in scheme_input['tone']]
    return {
        'id': scheme_input['id'],
        'capacity': scheme_input['capacity'],
        'headKeys': head_keys,
        'finalKeys': final_keys,
        'tone': tone
    }

scheme_map = {s['id']: s for s in fixture['schemes']}

seeds_raw = []

# 1. Reigning champion from m40-d3 gen0400: CKT 9.050693 (M38, D3, V1)
champ_file = repo / 'research/seeds/ckt-v4/m40-d3-20261031-gen0400/best-global-ckt-v4.json'
champ_layout = json.load(open(champ_file, encoding='utf-8'))
m, d, v = diagnose(champ_layout['headKeys'], champ_layout['finalKeys'])
seeds_raw.append({
    'name': 'm40-d3-global-champion-gen0400',
    'desc': 'Reigning Production Champion (CKT 9.050693)',
    'ckt': 9.050693,
    'layout': champ_layout,
    'm': m, 'd': d, 'v': v
})

# 2. V=0 Champion: CKT 9.073755 (M38, D3, V0)
v0_champ_file = repo / 'research/seeds/ckt-v4/m40-d3-launch-20261031/seed-03-SY26_V3_R2_M37_D3_V0_SPEED_01.json'
v0_layout = json.load(open(v0_champ_file, encoding='utf-8'))
m, d, v = diagnose(v0_layout['headKeys'], v0_layout['finalKeys'])
seeds_raw.append({
    'name': 'SY26-V3-R2-M37-D3-V0-SPEED-01',
    'desc': 'V=0 Champion Anchor (CKT 9.073755)',
    'ckt': 9.073755,
    'layout': v0_layout,
    'm': m, 'd': d, 'v': v
})

# 3. High Speed Alternative: SY26-V3-M38-D3-V1-NO-DE-01 (CKT 9.088558, M35 D3 V1)
s3 = scheme_map['SY26-V3-M38-D3-V1-NO-DE-01']
s3_layout = compile_layout(s3)
m, d, v = diagnose(s3_layout['headKeys'], s3_layout['finalKeys'])
seeds_raw.append({
    'name': 'SY26-V3-M38-D3-V1-NO-DE-01',
    'desc': 'High-Speed Alternative M35 Anchor',
    'ckt': 9.088558,
    'layout': s3_layout,
    'm': m, 'd': d, 'v': v
})

# 4. Ultra-low Pinky V0: SY26-V3-R2-M37-D3-V0-ULP-01 (CKT 9.096939, M34 D3 V0)
s4 = scheme_map['SY26-V3-R2-M37-D3-V0-ULP-01']
s4_layout = compile_layout(s4)
m, d, v = diagnose(s4_layout['headKeys'], s4_layout['finalKeys'])
seeds_raw.append({
    'name': 'SY26-V3-R2-M37-D3-V0-ULP-01',
    'desc': 'Ultra-Low Pinky V0 M34 Anchor',
    'ckt': 9.096939,
    'layout': s4_layout,
    'm': m, 'd': d, 'v': v
})

# 5. D=1 Champion: 21x26-D1-champion-f_to_J (CKT 9.167862, M37 D1 V1)
d1_file = repo / 'research/seeds/ckt-v4/m40-d3-launch-20261031/seed-05-21x26_D1_champion_f_to_J.json'
d1_layout = json.load(open(d1_file, encoding='utf-8'))
m, d, v = diagnose(d1_layout['headKeys'], d1_layout['finalKeys'])
seeds_raw.append({
    'name': '21x26-D1-champion-f_to_J',
    'desc': 'Saturated D1 Empirical Champion',
    'ckt': 9.167862,
    'layout': d1_layout,
    'm': m, 'd': d, 'v': v
})

# 6. Native V=2 Anchor 1: R5-21X26-M39-09 (CKT 9.233220, M36 D3 V2)
s6 = scheme_map['R5-21X26-M39-09']
s6_layout = compile_layout(s6)
m, d, v = diagnose(s6_layout['headKeys'], s6_layout['finalKeys'])
seeds_raw.append({
    'name': 'R5-21X26-M39-09',
    'desc': 'Native V=2 Frontier Anchor (CKT 9.233220)',
    'ckt': 9.233220,
    'layout': s6_layout,
    'm': m, 'd': d, 'v': v
})

# 7. Native V=2 Anchor 2: R5-21X26-M40-10 (CKT 9.258210, M37 D3 V2)
s7 = scheme_map['R5-21X26-M40-10']
s7_layout = compile_layout(s7)
m, d, v = diagnose(s7_layout['headKeys'], s7_layout['finalKeys'])
seeds_raw.append({
    'name': 'R5-21X26-M40-10',
    'desc': 'Native V=2 Balanced Anchor (CKT 9.258210)',
    'ckt': 9.258210,
    'layout': s7_layout,
    'm': m, 'd': d, 'v': v
})

# 8. Historical Anchor R11: R11-21X26-M36-01 (CKT 9.387920, M36 D1 V0)
s8 = scheme_map['R11-21X26-M36-01']
s8_layout = compile_layout(s8)
m, d, v = diagnose(s8_layout['headKeys'], s8_layout['finalKeys'])
seeds_raw.append({
    'name': 'R11-21X26-M36-01',
    'desc': 'Historical Production Anchor R11',
    'ckt': 9.387920,
    'layout': s8_layout,
    'm': m, 'd': d, 'v': v
})

# Sort seeds by CKT ascending
seeds_raw.sort(key=lambda x: x['ckt'])

launch_seed_dir = repo / 'research/seeds/ckt-v4/m40-d3-v2-launch-20261108'
launch_seed_dir.mkdir(parents=True, exist_ok=True)

initial_layouts_paths = []
manifest_seeds = []

for idx, s in enumerate(seeds_raw, 1):
    assert s['m'] <= 40, f"M {s['m']} exceeds 40"
    assert s['d'] <= 3, f"D {s['d']} exceeds 3"
    assert s['v'] <= 2, f"V {s['v']} exceeds 2"

    safe_name = s['name'].replace('-', '_')
    filename = f"seed-{idx:02d}-{safe_name}.json"
    file_path = launch_seed_dir / filename
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(s['layout'], f, indent=2)
    rel_path = f"research/seeds/ckt-v4/m40-d3-v2-launch-20261108/{filename}"
    initial_layouts_paths.append(rel_path)
    manifest_seeds.append({
        'rank': idx,
        'filename': filename,
        'relativePath': rel_path,
        'id': s['name'],
        'description': s['desc'],
        'cktV4': s['ckt'],
        'memory': s['m'],
        'displacedInitials': s['d'],
        'displacedVowels': s['v']
    })

# Write launch manifest
manifest_path = launch_seed_dir / 'manifest.json'
with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump({
        'version': 'ckt-v4-m40-d3-v2-launch-seeds-1',
        'caliber': 'M<=40, D<=3, V<=2',
        'capacity': [21, 26],
        'baseSeed': 21264032,
        'seeds': manifest_seeds
    }, f, indent=2)

print(f"Exported {len(manifest_seeds)} initial seed layouts to {launch_seed_dir}")

# Generate configuration file for M<=40, D<=3, V<=2
config = {
    "version": "ckt-v4-explorer-config-1",
    "cudaFull": True,
    "cudaBatch": True,
    "cudaBatchWindowMs": 100,
    "initialSchemes": [],
    "initialRanking": None,
    "initialLayouts": initial_layouts_paths,
    "schemeTemplate": "SNF4-M36-AE-07",
    "reference": "S005",
    "corpus": "research/.cache/ckt-v4-native-corpus.bin",
    "schemes": "research/.cache/ckt-v4-all-schemes.json",
    "snapshot": "tools/ckt_v4_upstream_role_tables.json",
    "ergonomicFixture": "research/.cache/ckt-v4-ergonomics.json",
    "outputRoot": "research/exploration/production-ckt-v4-2126-m40-d3-v2-20261108",
    "generations": 15,
    "stepsPerChain": 40,
    "nextSeedCount": 8,
    "baseSeed": 21264032,
    "temperature": 0.02,
    "checkpointEvery": 5,
    "verifyEvery": 20,
    "dutyMs": 0,
    "mxCorpus": "daily",
    "mxVariant": "native-punctuation",
    "maxCktDelta": 0.35,
    "noveltyDistance": 8,
    "basinRadius": 5,
    "basinSupport": 3,
    "pauseOnReview": False,
    "guards": {
        "maxMemory": 40,
        "maxD": 3,
        "maxV": 2,
        "maxRpS2": None,
        "maxRp": None,
        "maxW": None,
        "maxY": None,
        "minHomeFloor": None,
        "minMxScore": None
    }
}

config_path = repo / 'research/config/ckt-v4-production-2126-m40-d3-v2-20261108.json'
with open(config_path, 'w', encoding='utf-8') as f:
    json.dump(config, f, indent=2)

print(f"Exported production config to {config_path}")
