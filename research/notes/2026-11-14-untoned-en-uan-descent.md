# 无调 21×21：从 en/uan 下潜，并从占桶退火迁回组合规律

本轮最佳点为 `untoned-combination-ablation / A0002`，CKT v5.1
`9.546661174906893`。相对用户指定的 en/uan 起点降低约 0.1186%，
相对生产 QZ-e8f37a 降低约 0.2220%。尚未部署到 Rime。

| 布局 | CKT v5.1 ↓ | 日常移手分 ↑ | S2 主行 ↑ | 系列当量 v4 ↓ |
|---|---:|---:|---:|---:|
| 生产 QZ-e8f37a | 9.56789806405906 | 135.217638 | 54.541768% | 10.815673343336183 |
| en(D) ↔ uan(E) 起点 | 9.558000928591156 | 136.175727 | 53.064043% | 10.807004105466556 |
| 起点 + v(D) ↔ vn(G) | 9.5510920942959 | 135.856868 | 53.064043% | 10.810189493538054 |
| 上项 + N/H 整韵母组交换 | 9.547176430924718 | 136.721526 | 51.778955% | 10.80778964634867 |
| 上项 + u(N) ↔ an(M) | **9.546661174906893** | **137.071543** | **51.778955%** | **10.806395523689147** |

最终方案相对 en/uan 起点，CKT、移手分、当量均改善，主行减少 1.285088
个百分点。按用户要求，本轮不以主行不下降为门槛。

最终方案保持 M-R2=42、D=2、无额外路由、21×21 实际键域、399 音节覆盖，
QZ/ZQ 均为空桶。唯一码由起点的 345 增至 346。声母没有改动。
`toneKeysByTone=IVUAO`，`shapeKeysByMeaning=AVUIO`，形义顺序声调数字仍为 42310。

## 交换顺序及消融

相对生产版，依次执行：

1. `en:D→E`，`uan:E→D`。
2. `v:D→G`，`vn:G→D`。
3. N/H 整韵母组交换：`ai:N→H`，`iong:H→N`，`u:H→N`。
4. `u:N→M`，`an:M→N`。

先在允许占用 QZ/ZQ 的分支上观察到第 3、4 步：从 `ua↔uan`
产生的 ZQ 占桶点 `9.566037758807472`，N/H 整组交换降到
`9.56163800861059`，再 u/an 交换降到 `9.561463468835111`。

随后将这两个操作迁回双空桶起点，分别作消融：

| 底座 | 仅 N/H 组交换 | 仅 u/an 交换 | N/H 后 u/an |
|---|---:|---:|---:|
| en/uan（9.558001） | 9.553433305384583 | 9.564939693396948 | 9.553300217012007 |
| en/uan + v/vn（9.551092） | 9.547176430924718 | 9.5581793805094 | 9.546661174906893 |

这表明 u/an 单独交换会恶化 CKT，但在 N/H 组交换之后能小幅改善；
收益依赖此前的韵母组合。不能把 `ai↔iong` 单 token 交换等同于 N/H 整组交换，
后者同时移动 u。占桶探索提供了可迁回双空桶布局的组合线索，
不意味着占桶本身降低了 CKT。

## 搜索与评分范围

- en/uan 双空桶邻域：550 个合规状态，36 个固定生产辅序全量评分。
- 放宽 QZ/ZQ 并加入历史兄弟方案：734 个合规状态，51 个全量评分。
- en/uan + v/vn 下一层：597 个合规状态，27 个全量评分。
- 两条精确 CKT Metropolis 短链：40 步与 24 步；随机种子 1411、1412，
  温度从 0.025 几何下降到 0.002；支持单 token 与整键组交换。
- 两组各 3 个消融点。上述数字含重复底座，不能相加宣称独立状态数。

主评测沿用传统 21×21 原生 v5.1 字词竞争路由，健道辅序 `12/213/24`、
弎拼 `12/213/23`，固定 S005 锚点。没有为每个布局重新枚举稳健辅序。
有界筛选与短链不是全局最优证明，也不是完整一阶邻域封闭证明。

运动耗时只用于预筛；最终 CKT 为全语料评分。优胜点另经原始
Engine7/CKTEngine 的 20 合同重放，当量不是 CKT 的别名。
移手分使用原 Python macroxue 引擎。16 项既有评分/辅助键语义测试通过。

## 数据及复现

所有 JSON 位于本目录，最终映射和逐步分数见
`2026-11-14-untoned-combination-ablation-neighbors.json`；独立当量与主行审计见
`2026-11-14-untoned-combination-ablation-ergonomics.json`。
`untoned-en-uan-open`、`untoned-en-uan-v-vn-r2` 为邻域记录，
`untoned-en-uan-anneal`、`untoned-occupied-anneal` 为接受/拒绝轨迹，
`untoned-nh-ablation` 为迁回双空桶起点的消融记录。

```powershell
python -X utf8 tools/explore_untoned_2121_v51.py --seed-report research/notes/2026-11-14-untoned-2121-v51-neighbors.json --seed-id N0221 --tag untoned-en-uan-open --relaxed-home --allow-occupied
python -X utf8 tools/anneal_untoned_2121_v51.py --source-tag untoned-en-uan-open --seed-id N0545 --tag untoned-occupied-anneal --steps 24 --random-seed 1412
python -X utf8 tools/explore_untoned_2121_v51.py --seed-report research/notes/2026-11-14-untoned-en-uan-open-neighbors.json --seed-id N0593 --tag untoned-en-uan-v-vn-r2 --relaxed-home --allow-occupied --no-historical --screen-width 6
python -X utf8 tools/anneal_untoned_2121_v51.py --source-tag untoned-en-uan-v-vn-r2 --seed-id N0000 --tag untoned-combination-ablation --steps 3 --nh-ablation
python -X utf8 tools/audit_untoned_2121_neighbors.py --tag untoned-combination-ablation
```

复现依赖本机已有 ignored R11 HTML、冻结 replay fixtures 和 Rime 语料；
输入 SHA-256 与源提交保存在各轮 provenance JSON。不同 tag 使用独立缓存目录，
应串行运行以限制完整载荷的内存峰值。
