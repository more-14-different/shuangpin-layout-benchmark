import json, sqlite3
from pathlib import Path

repo = Path('.')
schemes_file = repo / 'research/.cache/ckt-v4-all-schemes.json'
ranking_file = repo / 'research/config/ckt-v4-ranked-seeds-21x26.json'

fixture = json.load(open(schemes_file, encoding='utf-8'))
ranking_data = json.load(open(ranking_file, encoding='utf-8'))
ranking_map = {item['id']: item for item in ranking_data['ranking']}

heads = fixture['heads']
finals = fixture['finals']
pinyin_map = fixture['pinyinMap']
common_pinyin = fixture['commonPinyin']
alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./"

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
for sid, desc in [
    ('SY26-V3-M38-D3-V1-NO-DE-01', 'Top Speed Champion D3/V1'),
    ('SY26-V3-R2-M38-D3-V1-SPEED-01', 'Top Speed Alternative D3/V1'),
    ('SY26-V3-R2-M37-D3-V0-SPEED-01', 'Top Speed V0 Champion D3/V0'),
    ('SY26-V3-R2-M37-D3-V0-ULP-01', 'Ultra-Low Pinky V0 D3/V0'),
    ('R10-21X26-M36-01', 'Historical Production Anchor R10'),
    ('R11-21X26-M36-01', 'Historical Production Anchor R11')
]:
    s = scheme_map[sid]
    layout = compile_layout(s)
    ckt = ranking_map[sid]['cktV4']
    m, d, v = diagnose(layout['headKeys'], layout['finalKeys'])
    seeds_raw.append({
        'name': sid,
        'desc': desc,
        'ckt': ckt,
        'layout': layout,
        'm': m, 'd': d, 'v': v
    })

# 5. D1 Champion (9.167862)
d1_champ_file = repo / 'research/seeds/ckt-v4/cross-basin-verify-20261030/seed-01-f_to_J_champion.json'
d1_layout = json.load(open(d1_champ_file, encoding='utf-8'))
d1_layout['id'] = '21x26-D1-champion-f_to_J'
m, d, v = diagnose(d1_layout['headKeys'], d1_layout['finalKeys'])
seeds_raw.append({
    'name': '21x26-D1-champion-f_to_J',
    'desc': 'Saturated D1 Empirical Champion (f->J)',
    'ckt': 9.167862,
    'layout': d1_layout,
    'm': m, 'd': d, 'v': v
})

# 6. D1 V0 Frontier (9.201335) from Run-A
conn = sqlite3.connect('research/exploration/cross-basin-run-a-20261030/exploration.sqlite3')
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute('SELECT hex(state_key) as hex_key, ckt_v4, memory, displaced_initials, displaced_vowels FROM states WHERE displaced_vowels = 0 ORDER BY ckt_v4 ASC LIMIT 1')
r = cur.fetchone()
kb = bytes.fromhex(r['hex_key'])
v0_layout = {
    'id': '21x26-D1-V0-frontier-RunA',
    'capacity': [kb[0], kb[1]],
    'headKeys': list(kb[2:29]),
    'finalKeys': list(kb[29:64]),
    'tone': list(kb[64:69])
}
m, d, v = diagnose(v0_layout['headKeys'], v0_layout['finalKeys'])
seeds_raw.append({
    'name': '21x26-D1-V0-frontier-RunA',
    'desc': 'D1 V=0 Frontier Champion (Run-A Gen 3)',
    'ckt': r['ckt_v4'],
    'layout': v0_layout,
    'm': m, 'd': d, 'v': v
})
conn.close()

# Sort seeds by CKT ascending
seeds_raw.sort(key=lambda x: x['ckt'])

launch_seed_dir = repo / 'research/seeds/ckt-v4/m40-d3-launch-20261031'
launch_seed_dir.mkdir(parents=True, exist_ok=True)

initial_layouts_paths = []
manifest_seeds = []

for idx, s in enumerate(seeds_raw, 1):
    safe_name = s['name'].replace('-', '_')
    filename = f"seed-{idx:02d}-{safe_name}.json"
    file_path = launch_seed_dir / filename
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(s['layout'], f, indent=2)
    rel_path = f"research/seeds/ckt-v4/m40-d3-launch-20261031/{filename}"
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
        'version': 'ckt-v4-m40-d3-launch-seeds-1',
        'caliber': 'M<=40, D<=3, V<=1',
        'capacity': [21, 26],
        'baseSeed': 21264003,
        'seeds': manifest_seeds
    }, f, indent=2)

print(f"Exported {len(manifest_seeds)} initial seed layouts to {launch_seed_dir}")

# Generate configuration file for M<=40, D<=3, V<=1
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
    "outputRoot": "research/exploration/production-ckt-v4-2126-m40-d3-20261031",
    "generations": 15,
    "stepsPerChain": 40,
    "nextSeedCount": 8,
    "baseSeed": 21264003,
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
        "maxV": 1,
        "maxRpS2": None,
        "maxRp": None,
        "maxW": None,
        "maxY": None,
        "minHomeFloor": None,
        "minMxScore": None
    }
}

config_path = repo / 'research/config/ckt-v4-production-2126-m40-d3-20261031.json'
with open(config_path, 'w', encoding='utf-8') as f:
    json.dump(config, f, indent=2)

print(f"Exported production config to {config_path}")
