import json

p_json = r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\research\notes\2026-10-29-bcw-3c47744cf2f7-baseline-diagnosis.json'
with open(p_json, 'r', encoding='utf-8') as f:
    d = json.load(f)

md = []
md.append('# BCW-3c47744cf2f7 原始基线深度诊断与固化产物报告\n')
md.append('日期：2026-10-29\n')
md.append('## 1. 核心指标总览\n')
md.append('| 维度 | 指标项 | 测量真值 | 生产门禁 (ProdGate) 约束 | 合规状态 | 偏差说明 |')
md.append('| :--- | :--- | :---: | :---: | :---: | :--- |')
md.append(f'| **速度效能** | CKT v4 (vs S005=10) | **{d["cktV4"]:.6f}** | ≤ 9.705581 | ✅ 达标 | 性能优异，处于 Astra 7 前沿 |')
md.append(f'| **拓扑约束** | 容量 (Capacity) | 21×21 | 21×21 | ✅ 达标 | 严格声部21辅音/韵部21辅音 |')
md.append(f'| **记忆负荷** | 记忆代价 M | {d["memory"]} | ≤ 40 | ✅ 达标 | 边界合规 |')
md.append(f'| **初声位移** | 声母偏位 D | {d["displacedInitials"]} | = 0 | ✅ 达标 | 21 辅音声母零位移 |')
md.append(f'| **元音偏位** | 声调元音位移 V | {d["displacedVowels"]} | ≤ 5 | ✅ 达标 | 严格 IVUAO 五元音槽 |')
md.append(f'| **音节唯一性** | Common399 唯一码数 U | **{d["common399"]["u"]}** | 基线 352 (参考) | 🌟 **超额 +8** | 核心价值所在 (仅39对重码) |')
md.append(f'| **工效：右小指** | rp_s2 | {d["ergonomics"]["rpS2"]:.6f} | ≤ 0.041808 | ❌ **超标** | 超标 +115.3% (P键承担韵母 i) |')
md.append(f'| **工效：右小指峰** | rp_max | {d["ergonomics"]["rpMax"]:.6f} | ≤ 0.051045 | ❌ **超标** | 超标 +95.7% (P键承担韵母 i) |')
md.append(f'| **工效：中排基底** | homeFloor | {d["ergonomics"]["homeFloor"]:.6f} | ≥ 0.350756 | ❌ **不达标** | 低 -22.9% (高频内容偏离中排) |')
md.append(f'| **工效：W 键峰值** | w_max | {d["ergonomics"]["wMax"]:.6f} | ≤ 0.036232 | ❌ **极端超标** | 超标 +386.9% (W同时承担 sh+e) |')
md.append(f'| **工效：Y 键峰值** | y_max | {d["ergonomics"]["yMax"]:.6f} | ≤ 0.068685 | ❌ **轻微超标** | 超标 +1.0% (Y承担 uo+van) |')
md.append(f'| **工效：移动手** | mxScore | {d["ergonomics"]["mxScore"]:.3f} | ≥ 140.842 | ❌ **不达标** | 低 -5.6% (手感流动性不足) |\n')

md.append('## 2. 8 轨候选选重率明细 (8-Track Selection Rates)\n')
md.append('| 输入模式 | 粒度轨道 | 轨道权重 | 选重率 (Selection Rate) | 百分比 |')
md.append('| :--- | :--- | :---: | :---: | :---: |')
tracks = d['tracks']
md.append(f'| 键道 (KeyTao) | 单字 (Character) | 1 | {tracks["keytao"]["character"]:.6f} | {tracks["keytao"]["character"]*100:.3f}% |')
md.append(f'| 键道 (KeyTao) | 二字词 (Word2) | 3 | {tracks["keytao"]["word2"]:.6f} | {tracks["keytao"]["word2"]*100:.3f}% |')
md.append(f'| 键道 (KeyTao) | 三字词 (Word3) | 1 | {tracks["keytao"]["word3"]:.6f} | {tracks["keytao"]["word3"]*100:.3f}% |')
md.append(f'| 键道 (KeyTao) | 四字词 (Word4) | 1 | {tracks["keytao"]["word4"]:.6f} | {tracks["keytao"]["word4"]*100:.3f}% |')
md.append(f'| 三拼 (SanPin) | 单字 (Character) | 1 | {tracks["sanpin"]["character"]:.6f} | {tracks["sanpin"]["character"]*100:.3f}% |')
md.append(f'| 三拼 (SanPin) | 二字词 (Word2) | 3 | {tracks["sanpin"]["word2"]:.6f} | {tracks["sanpin"]["word2"]*100:.3f}% |')
md.append(f'| 三拼 (SanPin) | 三字词 (Word3) | 1 | {tracks["sanpin"]["word3"]:.6f} | {tracks["sanpin"]["word3"]*100:.3f}% |')
md.append(f'| 三拼 (SanPin) | 四字词 (Word4) | 1 | {tracks["sanpin"]["word4"]:.6f} | {tracks["sanpin"]["word4"]*100:.3f}% |\n')

md.append('## 3. Common399 音节碰撞全貌分析\n')
md.append(f'- **唯一双码音节数 U**：`{d["common399"]["u"]} / 399`')
md.append(f'- **重码桶总数**：`{d["common399"]["collisionBucketCount"]} 个`')
md.append(f'- **受重码影响音节总数**：`{d["common399"]["affectedSyllables"]} 个`')
md.append('- **重码深度分布**：全部 39 个重码桶大小均为 2（`{"2": 39}`），**无任何三重或三重以上重码**。\n')

md.append('### 全部 39 对碰撞音节明细表\n')
md.append('| 序号 | 触发双码 | 碰撞音节 1 | 碰撞音节 2 | 碰撞机制说明 |')
md.append('| :---: | :---: | :---: | :---: | :--- |')
for i, item in enumerate(d['common399']['collisionPairs'], 1):
    c1, c2 = item['syllables'][0], item['syllables'][1]
    md.append(f'| {i:02d} | `{item["code"]}` | `{c1}` | `{c2}` | 共享键位 `{item["code"][0]}`+`{item["code"][1]}` |')

md.append('\n## 4. 编码状态与键位拓扑\n')
md.append('### 4.1 紧凑状态键 (State Key)\n')
md.append(f'```text\n{d["stateKey"]}\n```\n')

md.append('### 4.2 声母键位映射 (Initial Mapping)\n')
md.append('| 声母 | 键位 | 声母 | 键位 | 声母 | 键位 | 声母 | 键位 |')
md.append('| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |')
imap = list(d['initialMap'].items())
for i in range(0, len(imap), 4):
    chunk = imap[i:i+4]
    row = []
    for k, v in chunk:
        row.extend([f'`{k}`', f'**{v}**'])
    while len(row) < 8:
        row.extend(['', ''])
    md.append('| ' + ' | '.join(row) + ' |')

md.append('\n### 4.3 韵母键位映射 (Final Mapping)\n')
md.append('| 韵母 | 键位 | 韵母 | 键位 | 韵母 | 键位 | 韵母 | 键位 |')
md.append('| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |')
fmap = list(d['finalMap'].items())
for i in range(0, len(fmap), 4):
    chunk = fmap[i:i+4]
    row = []
    for k, v in chunk:
        row.extend([f'`{k}`', f'**{v}**'])
    while len(row) < 8:
        row.extend(['', ''])
    md.append('| ' + ' | '.join(row) + ' |')

md.append('\n## 5. 诊断结论与定向修复战略指引\n')
md.append('> [!WARNING]')
md.append('> **诊断结论**：原案 `BCW-3c47744cf2f7` 具有目前已知最强的低音节重码优势（$U=360$，相比生产三强的 $U=352$ 净增 8 个纯净双键码音节，且 0 三重重码）。')
md.append('> 但其在生产工效上存在致命死穴（6 项门禁全部失守），根本原因非常明确：')
md.append('> 1. **W 键过载**：同时容纳高频声母 `sh` 与高频韵母 `e`，导致 `w_max` 飙升至 0.1764（超标 386.9%）；')
md.append('> 2. **右小指过载**：极高频韵母 `i` 落于外缘键 `P`，导致右小指指标 `rp_s2` (0.090) 与 `rp_max` (0.100) 几乎翻倍超标；')
md.append('> 3. **中排率偏低**：中排率仅 0.2706，远低于 0.3508 底线，拖累 MX 评分至 132.998。')
md.append('>\n')
md.append('> **修复战略**：')
md.append('> - **第一步**：将高频韵母 `e` 移出 `W`（如移至低负荷辅音键 `S` 或中排）；')
md.append('> - **第二步**：将高频韵母 `i` 移出 `P`（移至中排主力键如 `L`）；')
md.append('> - **第三步**：在消除结构性红线的同时，最大化保全 $U > 352$ 的音节互补分布拓扑；')
md.append('> - **第四步**：通过双向播种（Basin 01 全家族 8 种子 + 生产三强 `gen0170-p7` / `gen0107-p5` / `gen0076-p8`），向合规区实施高保真 Pareto 搜寻。')

target_md = r'D:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121\research\notes\2026-10-29-bcw-3c47744cf2f7-baseline-diagnosis.md'
with open(target_md, 'w', encoding='utf-8') as f:
    f.write('\n'.join(md) + '\n')

print('Saved baseline markdown report to:', target_md)
