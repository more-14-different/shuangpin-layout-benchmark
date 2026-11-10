import json

with open(r'd:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\research\notes\2026-10-29-pareto-audit-full.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

for item in items:
    pg = item['prodGate']
    ergo = item['ergonomics']
    tracks = item['tracks']
    print('==============================')
    print('ID:', item['candidateId'])
    print(f'CKT: {item["cktV4"]:.6f} (ref: {item["referenceId"]}={item["referenceScore"]:.1f})')
    print(f'M/D/V: {item["memory"]}/{item["displacedInitials"]}/{item["displacedVowels"]}')
    print(f'Common399: U={item["common399"]["u"]}, Collisions={item["common399"]["collisionBucketCount"]}, Affected={item["common399"]["affectedSyllables"]}')
    print(f'ProdGate passesAll: {pg["passesAll"]} (rp_s2={ergo["rpS2"]:.5f}, rp_max={ergo["rpMax"]:.5f}, home={ergo["homeFloor"]:.4f}, w_max={ergo["wMax"]:.5f}, y_max={ergo["yMax"]:.5f}, mx={ergo["mxScore"]:.2f})')
    print(f'8-Tracks KeyTao: char={tracks["keytao"]["character"]:.4f}, w2={tracks["keytao"]["word2"]:.4f}, w3={tracks["keytao"]["word3"]:.4f}, w4={tracks["keytao"]["word4"]:.4f}')
    print(f'8-Tracks SanPin: char={tracks["sanpin"]["character"]:.4f}, w2={tracks["sanpin"]["word2"]:.4f}, w3={tracks["sanpin"]["word3"]:.4f}, w4={tracks["sanpin"]["word4"]:.4f}')
    print(f'Hamming to BCW: {item["hammingToBcw"]}')
