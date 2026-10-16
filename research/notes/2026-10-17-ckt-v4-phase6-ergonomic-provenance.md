# CKT v4 第 6C 阶段：人体工学指标来源与精确性

状态：`exact`（2026-10-17）。历史 20 轨负载与 MX34 移手模型均已由 Rust 独立复现；它们可以作为显式护栏或精确前沿维度，但 **CKT v4 仍是退火接受概率的唯一能量**。

## 冻结材料与边界

导出器 `tools/export_ckt_v4_ergonomic_fixture.py` 从本地忽略的
`a7_CKT_R11_integrated_materials/R11_integrated_replay.zip` 直接读取抽象数据，不解压、不复制 replay 实现源码。它还读取当前 `a7_CKT_R11.html`，按 Common399 分解两个规则方案，并用四组完整击键流 SHA-256 证明当前码表与 R11 冻结结果仍是同一口径。输出
`research/.cache/ckt-v4-ergonomics.json` 约 210 KiB，同样被忽略。

冻结来源哈希如下；任一项变化都应重新导出并完成全套一致性测试，不能沿用本文的 `exact` 结论。

| 来源 | SHA-256 |
|---|---|
| R11 replay zip | `6dd14831193dd7e6718a668ffa6cfebac0a76335c8edcbd230af0eeb6a8fc4ca` |
| 当前 HTML | `348d1b271083a2d0bd76a67678d5b5978b4767b2e51fe90fbedb18fe2f702c79` |
| `model_meta.json` | `d491d561372450e5d550c2d0949f31c3da16a1e78bddf4a2680517a8c460a9fc` |
| `r4_token_loads.json` | `7126b1e101d5a2b0ceecaa095392de58a77add1e25369cb965b9d0adb190a90d` |
| `R9_corpora.json` | `6bed0c7bde411d093c862a7499c65ac4e05f4e7643b467efbadda254f5f4b165` |
| `R11_macroxue_all_schemes.json` | `93ebc52ca5e06d9bb68c1547b92760c29adb6020dd39f98faa0bfd18b0c2af48` |
| `R11_load_audit.json` | `dc7271b3d06564a2912241410db9aab3376630d2045f64c0fb235841a7dcb870` |

Replay 中的 MX Python 文件声明 GPL-3.0；本仓库本身亦为 GPL-3.0。Rust crate 的数值实现没有复制 replay 源码文本，只依据导出的几何、常量和冻结结果重建并测试数值合同；大型 replay 与派生 fixture 不进入 Git。`research/ckt-v4-core/Cargo.toml` 目前单独声明 MIT，若将该 crate 拆分发布，仍应在发布前单独复核数据与许可边界。

## 历史 20 轨负载

固定状态顺序为 27 个声母、35 个韵母和 5 个辅码槽，共 67 列；键域为完整 34 键。对轨道 `t`、状态 `i` 的冻结质量记为 `m[t,i]`，方案把状态映射到键 `K(i)`，则键负载为：

`load(t,k) = Σ(i: K(i)=k) m[t,i]`

Rust 直接从 20×67 矩阵求和，不导入旧退火脚本的混合目标。公开诊断定义为：

| 字段 | 定义 | 正式前沿方向 |
|---|---|---|
| `rp_s2` | S2 轨 `P[]\;'/` 的组和 | 仅诊断/可设上限 |
| `rp_max` | 上述右小指组和在 20 轨的最大值 | 最小化 |
| `home_s2` | S2 轨 `ASDFGHJKL;'` 的组和 | 仅诊断 |
| `home_c4` | C4-Snow 轨 home 组和 | 仅诊断 |
| `home_wx` | WX-Snow-12 轨 home 组和 | 仅诊断 |
| `home_floor` | `min(home_c4, home_wx)` | 仅诊断 |
| `w_max` | W 键在 20 轨的最大值 | 最小化 |
| `y_max` | Y 键在 20 轨的最大值 | 最小化 |

home-row 占比不是天然“越低越好”，因此不会被错误加入支配关系。正式负载前沿只使用三个有明确峰值含义的 `rp_max / w_max / y_max`。命令行仍可单独限制 `rp_s2`。

Rust 对 `S005-NF` 和 `SNF4-M36-AE-07` 的八项结果逐值复现 R11，测试绝对容差为 `1e-14`。读取 fixture 时，67 状态顺序、R11 键序、内核键序、20×67 尺寸和有限非负质量均是强校验；置换状态或键序会失败，不能静默换口径。

## MX34 移手模型

MX34 使用三行 30 键加 `[]\'`。扩展键坐标分别为 `(10,0)`、`(11,0)`、`(12.25,0)`、`(10,1)`，均为右小指；不会投影回 26/30 键。行错位在 `y>0` 时给横坐标增加 `0.25 + (y-1)×0.5`，手指速度固定为
`[0.6,0.9,0.9,1,1,1,1,0.9,0.9,0.6]`。

每次击键的同手有效距离为 `d = 0.2 + distance(previous,current)`；换手时有效距离只取 `0.2`，另把两位置距离计入 overlap。相对时间累加 `d / finger_speed`。初始 previous column 固定为 0，双手位置均从 `(0,0)` 开始。最终：

- `score = character_count / relative_time × 200`，方向为最大化；
- `speed = hit_count / relative_time × 100`；
- `total_distance = effective_distance + overlap_distance`；
- 同手率、同/异指距离桶、行/指/左右手负载均从同一击键流直接累计。

`time` 的单位明确为 `relative hand-model cost; not ms`。它不是实测毫秒、肌肉疲劳或认知负担，不能以名称暗示医学/人体工学测量结论。模型也不加入空格、选重或字形键；这些行为仍由 CKT v4 的运动与认知合同处理，避免重复计价。

语料口径为：daily 原生标点 1,129 token、汉字-only 1,020 token；default 原生标点 198 token、汉字-only 174 token。带固定 `key` 的 token 必须绕过方案拼音映射；汉字-only 过滤掉固定标点/字母。默认 CLI 口径是 `daily|native-punctuation`，可显式切换。

Rust 对两个代表方案的四种语料口径复现 score、relative time、距离、行/指/手负载与同手/同指结果，浮点容差为 `1e-10`。另有手算两键路径、固定键优先、四个扩展键、空输入和未知键测试。

## 搜索集成规则

`--ergonomic-fixture` 加载指标；可选护栏为 `--max-rp-s2`、`--max-rp`、`--max-w`、`--max-y` 与 `--min-mx-score`，语料用 `--mx-corpus`、`--mx-variant` 指定。所有阈值、语料口径、verification 状态和来源哈希进入 v10 checkpoint 与 frontier provenance。

- 没有这些参数时，RNG、提案、CKT 评分和接受概率路径不变；
- 负载护栏在结构/Common399 检查后、约 29 万行联合池评分前执行；
- MX guard 需要完整方案码表，但仍在 CKT 行评分前执行；
- `exact` 负载峰值按最小化、MX score 按最大化进入 Pareto；
- `provisional` 数值可以序列化供观察，但不得执行 guard、不得参与支配；CLI 若尝试把 provisional fixture 用作 guard 会明确失败；
- CKT v4 始终是模拟退火接受概率的唯一能量，没有人体工学加权总分。

真实一步 smoke 证明加载 exact fixture 且给出宽松阈值时，RNG 状态、当前/最佳 CKT、接受数、布局和逐类提案统计与纯 CKT 运行相同；不可能的右小指阈值会报告具体指标。日志 writer 仍不保留历史，fixture 只增加固定约 210 KiB 的只读数据。

## 适用范围与保留项

本实现面向通过 `regularAnneal` 审计的 27+35 规则方案，覆盖完整 34 键，和容量数字本身无绑定。21×21 与 23×23 继续按既有规则允许 Common399 碰撞；其他尺寸继续要求 399 唯一。`N095/H37` 等特殊拓扑仍可正向计算 CKT v4，但阶段 6 不提供专用退火适配器，也不纳入本人体工学退火闭环。

当前 `exact` 表示“对上述冻结 R11 数值合同逐项一致”，不表示该历史模型已经通过人体实验，也不表示三个负载峰值和 MX score 应被默认启用。公平比较时必须公开相同 fixture 哈希、语料 variant 和护栏阈值。

## 复现

```powershell
just ckt-v4-ergonomic-fixture
cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test ergonomic_loads
cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test moving_hand
cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test ergonomic_integration
just ckt-v4-ergonomic-smoke
```

若 Rust 1.98.1 在 Windows 的增量测试缓存触发已观察到的编译器 ICE，可在不改变测试内容的情况下运行：

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -j 1 --manifest-path research/ckt-v4-core/Cargo.toml
```
