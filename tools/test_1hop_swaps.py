import json, subprocess

with open(r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\research\.cache\a7-43-candidates.json', 'r', encoding='utf-8') as f:
    cache = json.load(f)

alphabet = cache['keyAlphabet']
finals = cache['finals']
pinyinMap = cache['pinyinMap']
commonPinyin = cache['commonPinyin']

sk = '1515010f0c0503130d0b060a070910170a160411190212111111121818160a090d1012040c11040b050f09021901130d03030f05070217031306011806110a04081514000e'
raw = bytearray.fromhex(sk)

swaps = [
    ('uai', 'uan', 357),
    ('ong', 'uai', 356),
    ('ai', 'uai', 354),
    ('an', 'uai', 354),
    ('ua', 'uan', 353),
    ('ia', 'iu', 353),
    ('ia', 'iang', 353),
    ('uan', 'uang', 353),
    ('ai', 'en', 353),
    ('an', 'en', 353),
    ('an', 'ou', 353),
    ('uai', 'un', 353)
]

for f1, f2, expected_u in swaps:
    idx1, idx2 = finals.index(f1), finals.index(f2)
    mutated = bytearray(raw)
    mutated[29 + idx1], mutated[29 + idx2] = mutated[29 + idx2], mutated[29 + idx1]
    mut_hex = bytes(mutated).hex()
    
    cmd = [
        r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\research\ckt-v4-core\target\debug\audit-layout-full.exe',
        '--corpus', r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\research\.cache\ckt-v4-native-corpus.bin',
        '--schemes', r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\research\.cache\ckt-v4-all-schemes.json',
        '--snapshot', r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\tools\ckt_v4_upstream_role_tables.json',
        '--ergonomics', r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\research\.cache\ckt-v4-ergonomics.json',
        '--reference', 'S005',
        '--layout', mut_hex
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        data = json.loads(res.stdout)
        pg = data['prodGate']
        u = data['common399']['u']
        ckt = data['cktV4']
        ergo = data['ergonomics']
        all_pass = pg['passesAll']
        print(f'{f1}<->{f2}: U={u}, CKT={ckt:.6f}, ProdGate={all_pass}, mx={ergo["mxScore"]:.2f}, rp_max={ergo["rpMax"]:.4f}, w_max={ergo["wMax"]:.4f}')
    else:
        print(f'{f1}<->{f2}: failed {res.stderr}')
