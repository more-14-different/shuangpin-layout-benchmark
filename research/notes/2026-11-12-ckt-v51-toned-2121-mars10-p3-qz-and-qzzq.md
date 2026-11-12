# 火星 10 韵组带调 21×21（AVUIO 7:8:6）Phase III 深度桥接与阶段总报告

- **日期**：2026-11-12
- **分支**：`research/mars10-qz-empty`
- **Rust 内核与测试**：[toned_bucket.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/src/toned_bucket.rs)、[anneal-joint-toned-full.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/src/bin/anneal-joint-toned-full.rs)、[qz_empty_constraint.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/tests/qz_empty_constraint.rs)
- **前序报告**：[Round 1](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qz-empty.md)、[Phase II](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-p2-qz-and-qzzq.md)
- **三阶段累计可复算 Finalist JSON**：
  - `QZ=空` 累计前沿（6 档）：[ckt-v51-toned-2121-mars10-qz-empty-p3-finalist.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/config/ckt-v51-toned-2121-mars10-qz-empty-p3-finalist.json)
  - `QZ+ZQ=双空` 累计前沿（6 档）：[ckt-v51-toned-2121-mars10-qzzq-empty-p3-finalist.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/config/ckt-v51-toned-2121-mars10-qzzq-empty-p3-finalist.json)
- **汇总与全量 JS 独立复算文件**：
  - `QZ=空`：[2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-p3-results.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-p3-results.json)、[2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-p3-js-verify.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-p3-js-verify.json)
  - `QZ+ZQ=双空`：[2026-11-12-ckt-v51-toned-2121-mars10-qzzq-empty-p3-results.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qzzq-empty-p3-results.json)、[2026-11-12-ckt-v51-toned-2121-mars10-qzzq-empty-p3-js-verify.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qzzq-empty-p3-js-verify.json)

---

## 一、Phase III 核心突破与三阶段总体画像

1. **`QZ=空`：`l<->zh (E)` + `p->S, ch->K` 双重桥接把 `D=2` 压至 `9.195220`，仅用 2 个普通移位逼近 `D=3` 极限**
   - **`MARS10-QZEMPTY-P3-D2-M24-05`**：Rust `9.195219662658` / JS `9.195219662663`（`ordinaryD/F = 2/0`，`M = 24/26`，`l->E, p->S` + `zh->L, ch->K, sh->P, zero-A->N, zero-E->C`）。
     - 相比 Round 1 `D=2` 最优（`9.210801`）再降 **`-0.015581`**；
     - 相比此前无 `QZ` 约束冠军（`9.203610, D=3`）大胜 **`-0.008390`**；
     - 直接支配淘汰 Round 1/Phase II 的 `D=3, M=25`（`9.195926`）与 Phase III 的 `D=3, M=24`（`9.197623`），距全球 `D=3, M=26` 最高分（`9.194508`）仅 **`+0.000712`**，却节省 `1 D` 与 `2 M`。
   - **`MARS10-QZEMPTY-P3-D2-M23-04`**：Rust `9.201359836995` / JS `9.201359837001`（`D=2/0`, `M=23/25`，同 `l->E, p->S`，保留 `zero-A=R`），同样在 `D=2, M=23` 下击败了原无约束 `D=3` 冠军（`9.203610`）。
   - `D=0`（`9.292634747080`）、`D=1, M=21`（`9.223020045021`）、`D=1, M=22`（`9.208241037869`）、`D=3, M=26`（`9.194507769962`）在长时间深挖后全部稳定收口。

2. **`QZ+ZQ=双空`：跨两轮 `z->C` + `p->S, l->E` 对称合流，全局最优压至 `9.251049`**
   - Phase III 通过 `p3-qzzq-d3-bridge` 在双空约束下同样自主发现了 `l<->zh (E)` + `p->S, ch->K` 结构，并与 `z->C, zero-E/O->Z` 结合：
     - **`MARS10-QZZQEMPTY-P3-D3-M25-06`**：Rust `9.251049198069` / JS `9.251049198071`（`D=3/0`, `M=25/27`，`l->E, p->S, z->C` + `ch->K, sh->P, zh->L, zero-E->Z, zero-O->Z`），比 Phase II 双空最优（`9.276547`）再降 **`-0.025498`**，比 Phase II 冷线 `D=3`（`9.307406`）大降 **`-0.056357`**。
     - **`MARS10-QZZQEMPTY-P3-D3-M24-05`**：Rust `9.251459746685` / JS `9.251459746685`（`D=3/0`, `M=24/26`，保持 `zero-O=R` 省 1 `M`）。
     - **`MARS10-QZZQEMPTY-P3-D2-M23-04`**：Rust `9.267572618863` / JS `9.267572618865`（`D=2/0`, `M=23/25`，`p->S, z->C` + `ch->K, sh->P, zero-E->Z`），以更低记忆成本支配淘汰了 Phase II `D=2, M=24`（`9.276547`）与 Phase III `d2-refine`（`9.269772`）。
     - **`MARS10-QZZQEMPTY-P3-D1-M22-01`**：`z->S` + `ch->K, sh->P, zero-E->Z` 达到 `9.345226513799`（比 Phase II `D1-M22` 降 `-0.001673`）。

3. **约束边界与代价定量对比（全 1,407 音节独立验证）**
   - 相比仅 `QZ=空`，叠加要求 **`ZQ` 也必须为空** 在各 `D` 档位对应的当前最优 CKT 边际代价：
     - **`D=1`**：`9.344047` vs `9.208241`（**`+0.135806`**，因至少需花费唯一 `1 D` 强行把 `z` 移出 `Z`）；
     - **`D=2`**：`9.267573` vs `9.195220`（**`+0.072353`**）；
     - **`D=3`**：`9.251049` vs `9.194508`（**`+0.056541`**）。

---

## 二、Phase III 运行明细（5 路 4 阶段锯齿退火，`--stages 4 --steps 4800 --duty-ms 15`）

| 任务 ID | 约束 | `max-d` | 步数 / 耗时 (s) | 拦截违例 | 起点 CKT | 终值最优 CKT | 新口径 `D` / `M` | 最终关键声母改动 |
|---|---|---:|---:|---:|---:|---:|---|---|
| `p3-qz-d1-disperse` | `QZ` | `1` | `4800` / `18993.36` | `285` | `9.208241` | `9.208241037869` | `1` / `22/24` | `p->S`；`ch->K, sh->P, zero-E->C` |
| `p3-qz-d2-p2s-bridge` | `QZ` | `2` | `4800` / `19271.08` | `286` | `9.208241` | **`9.195219662658`** | `2` / `24/26` | `l->E, p->S`；`ch->K, sh->P, zh->L, zero-A->N, zero-E->C` |
| `p3-qz-d3-p2s-bridge` | `QZ` | `3` | `4800` / `19132.51` | `283` | `9.208241` | `9.197622588664` | `3` / `24/26` | `b->M, m->B, p->S`；`ch->K, sh->P, zero-E->C` |
| `p3-qzzq-d2-refine` | `QZ,ZQ` | `2` | `4800` / `19928.81` | `795` | `9.276547` | `9.269771768081` | `2` / `24/26` | `p->S, z->C`；`ch->K, sh->P, zero-A->N, zero-E->Z` |
| `p3-qzzq-d3-bridge` | `QZ,ZQ` | `3` | `4800` / `19874.61` | `692` | `9.276547` | **`9.251049198069`** | `3` / `25/27` | `l->E, p->S, z->C`；`ch->K, sh->P, zh->L, zero-E/O->Z` |

---

## 三、`QZ=空` 三阶段累计全局 Pareto 前沿（6 档全通过 JS 复算）

> 全部满足：Shape-only CKT v5.1、`1:3:1:1`、`AVUIO 12/213/24`、`7:8:6`、火星 10 韵组 `rhymeInternalSplits=0`、`ordinaryF=0`、`qzSyllables1407=[]`。

| Finalist ID | 来源 | Rust CKT v5.1 | JS 复算 CKT v5.1 | Δ原冠军 (`9.203610`) | ΔMars0 (`9.556530`) | 新口径 `D/F` | 折叠 `D/F` | `M` (`lower/guard`) | 1407 占桶 | Common1237 占桶 | 声母与特殊族改动 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **MARS10-QZEMPTY-P3-D0-M21-01** | `p3-qz-d1:4653` | `9.292634747080` | `9.292634747099` | `+0.089025` | `-0.263896` | `0/0` | `3/3` | `21/23` | `423/441` (空18) | `421/441` (空20) | 无普通移位；`ch->K, sh->P, zero-E->C` |
| **MARS10-QZEMPTY-P3-D1-M21-02** | `p3-qz-d1:4730` | `9.223020045021` | `9.223020045040` | `+0.019410` | `-0.333510` | `1/0` | `4/3` | `21/23` | `425/441` (空16) | `424/441` (空17) | `p->S`；`ch->K, sh->P` |
| **MARS10-QZEMPTY-P3-D1-M22-03** | `p3-qz-d1:best` | `9.208241037869` | `9.208241037887` | `+0.004631` | `-0.348289` | `1/0` | `4/3` | `22/24` | `423/441` (空18) | `422/441` (空19) | `p->S`；`ch->K, sh->P, zero-E->C` |
| **MARS10-QZEMPTY-P3-D2-M23-04** | `p3-qz-d2:1448` | **`9.201359836995`** | **`9.201359837001`** | **`-0.002250`** | `-0.355171` | `2/0` | `5/3` | `23/25` | `425/441` (空16) | `423/441` (空18) | `l->E, p->S`；`zh->L, ch->K, sh->P, zero-E->C` |
| **MARS10-QZEMPTY-P3-D2-M24-05** | `p3-qz-d2:best` | **`9.195219662658`** | **`9.195219662663`** | **`-0.008390`** | `-0.361311` | `2/0` | `5/3` | `24/26` | `419/441` (空22) | `417/441` (空24) | `l->E, p->S`；`zh->L, ch->K, sh->P, zero-A->N, zero-E->C` |
| **MARS10-QZEMPTY-P3-D3-M26-06** | `p2-qz-d3:best` | **`9.194507769962`** | **`9.194507769969`** | **`-0.009102`** | **`-0.362023`** | `3/0` | `6/3` | `26/28` | `429/441` (空12) | `426/441` (空15) | `p->K, q->R, r->Q`；`ch->S, sh->P, zero-A->N, zero-E->Q, zero-O->Z` |

### 新增 `QZ=空` `D=2` 双档核心完整信息

- **`MARS10-QZEMPTY-P3-D2-M24-05`（推荐低 `D` 均衡首选）**：
  - **韵区**：upper `a-ou:E, en-n:T, e-ei:W, eng-ai-v:P, an:Q, ang:Y, u:E, i-er:R, o-ong:Y, ao:T`；home `a-ou:S, en-n:L, e-ei:D, eng-ai-v:G, an:K, ang:J, u:H, i-er:F, o-ong:L, ao:H`；lower `a-ou:X, en-n:N, e-ei:M, eng-ai-v:C, an:M, ang:C, u:Z, i-er:B, o-ong:N, ao:B`。
  - **分赛道有效耗时 (`JS effectiveMs`)**：字 `169.551868`、二字 `447.683120`、三字 `545.942599`、四字 `511.449596` ms（字、三字、四字均快于 `D3-M26-06`）。
  - **桶审计**：`qzSyllables1407 = []`、`zqSyllables1407 = ["zan4", "zuan4"]`；1,407 空桶 `22` 个（`QZ, WR, WF, WB, RP, RF, RZ, RB, RM, YZ, FR, FF, FB, GR, GF, HR, HF, JZ, XZ, NZ, NN, MZ`），Common1237 空桶 `24` 个（多空 `RQ, CS`）。
- **`MARS10-QZEMPTY-P3-D2-M23-04`**：
  - **韵区**：仅在 upper 把 `en-n` 设为 `R`（其余同 `03`，即 lower `e-ei:B, ang:M, ao:C`）。
  - **分赛道 `JS effectiveMs`**：`168.446255 / 448.565738 / 545.823482 / 513.030939` ms；`qzSyllables1407 = []`；1,407 空桶 `16` 个（`QZ, WT, WF, RF, RZ, RB, YZ, FT, FF, GF, HF, JZ, XZ, NZ, NN, MZ`）。

---

## 四、`QZ+ZQ=双空` 三阶段累计全局 Pareto 前沿（6 档全通过 JS 复算）

> 全 6 档均实编码验证：`qzSyllables1407 = []` **且** `zqSyllables1407 = []`，`rhymeInternalSplits = 0`、`ordinaryF = 0`。

| Finalist ID | 来源 | Rust CKT v5.1 | JS 复算 CKT v5.1 | Δ原冠军 | ΔMars0 | 新口径 `D/F` | 折叠 `D/F` | `M` | 1407 占桶 | Common1237 占桶 | 声母与特殊族改动 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **MARS10-QZZQEMPTY-P3-D1-M22-01** | `p3-qzzq-d2:1286` | `9.345226513799` | `9.345226513786` | `+0.141617` | `-0.211304` | `1/0` | `3/3` | `22/24` | `414/441` (空27) | `411/441` (空30) | `z->S`；`ch->K, sh->P, zero-E->Z` |
| **MARS10-QZZQEMPTY-P3-D1-M23-02** | `p2-qzzq-d2:4467` | `9.344047161710` | `9.344047161744` | `+0.140437` | `-0.212483` | `1/0` | `3/3` | `23/25` | `410/441` (空31) | `405/441` (空36) | `z->K`；`ch->S, sh->P, zero-A->N, zero-E->Z` |
| **MARS10-QZZQEMPTY-P3-D2-M22-03** | `p3-qzzq-d2:1206` | `9.310038928468` | `9.310038928457` | `+0.106429` | `-0.246492` | `2/0` | `4/3` | `22/24` | `408/441` (空33) | `408/441` (空33) | `p->C, z->S`；`ch->K, sh->P` |
| **MARS10-QZZQEMPTY-P3-D2-M23-04** | `p3-qzzq-d3:3003` | **`9.267572618863`** | **`9.267572618865`** | `+0.063963` | `-0.288958` | `2/0` | `4/3` | `23/25` | `412/441` (空29) | `410/441` (空31) | `p->S, z->C`；`ch->K, sh->P, zero-E->Z` |
| **MARS10-QZZQEMPTY-P3-D3-M24-05** | `p3-qzzq-d3:2744` | `9.251459746685` | `9.251459746685` | `+0.047850` | `-0.305071` | `3/0` | `5/3` | `24/26` | `412/441` (空29) | `410/441` (空31) | `l->E, p->S, z->C`；`zh->L, ch->K, sh->P, zero-E->Z` |
| **MARS10-QZZQEMPTY-P3-D3-M25-06** | `p3-qzzq-d3:best` | **`9.251049198069`** | **`9.251049198071`** | `+0.047439` | `-0.305481` | `3/0` | `5/3` | `25/27` | `416/441` (空25) | `415/441` (空26) | `l->E, p->S, z->C`；`zh->L, ch->K, sh->P, zero-E->Z, zero-O->Z` |

### `QZ+ZQ=双空` 最强 `D=2` 与 `D=3` 完整信息

- **`MARS10-QZZQEMPTY-P3-D3-M25-06`（`QZ+ZQ` 双空冠军）**：
  - **韵区**：upper `a-ou:E, en-n:T, e-ei:W, eng-ai-v:P, an:Q, ang:Y, u:E, i-er:R, o-ong:Y, ao:T`；home `a-ou:S, en-n:L, e-ei:D, eng-ai-v:G, an:K, ang:J, u:H, i-er:F, o-ong:L, ao:H`；lower `a-ou:X, en-n:C, e-ei:M, eng-ai-v:N, an:M, ang:B, u:Z, i-er:B, o-ong:N, ao:C`。
  - **分赛道 `JS effectiveMs`**：`170.480847 / 448.314701 / 552.290269 / 518.665130` ms。
  - **桶审计**：`qzSyllables1407 = []`、`zqSyllables1407 = []`；1,407 空桶 `25` 个（`QZ, WR, WF, RF, RZ, YZ, FR, FF, GR, GF, HR, HF, JZ, ZQ, ZP, ZG, ZH, ZJ, ZK, ZZ, ZB, XZ, NZ, NN, MZ`），Common1237 空桶 `26` 个（`ZY` 亦空）。
- **`MARS10-QZZQEMPTY-P3-D2-M23-04`（双空低 `D` 最优）**：
  - **韵区**：upper 与 home 同 `06`；lower 为 `a-ou:X, en-n:N, e-ei:M, eng-ai-v:C, an:M, ang:B, u:Z, i-er:B, o-ong:N, ao:C`。
  - **分赛道 `JS effectiveMs`**：`170.565183 / 449.042360 / 553.019200 / 520.548504` ms；1,407 空 `29` 桶、1237 空 `31` 桶，`QZ=[]` 且 `ZQ=[]`。

---

## 五、后续可选深入方向总结

1. **`QZ=空` `D=3` 从 `9.195220` (`l->E, p->S`) 跨盆加第 3 移位**：Phase III 验证了 `l->E, p->S` 仅用 `2 D` 就压到 `9.195220`，但未见该盆地在 `D=3`（如叠加 `q/r/c` 单移位）彻底展开；可专门以 `MARS10-QZEMPTY-P3-D2-M24-05` 为锚点重探 `D<=3` 冲击 `< 9.192`。
2. **`QZ+ZQ` 双空补充 `l->E, z->C`（不移 `p`）的 `D=2` 路线**：目前 `D=2` 双空用的是 `p->S, z->C`，尚未单独以 `l->E, z->C` 测试其是否有比 `9.267573` 更低的分值。
3. **最终选型落地建议**：若关注低记忆/低声母改动实用性，首选 **`MARS10-QZEMPTY-P3-D2-M24-05`（`9.195220, D=2, M=24`）** 或 **`D1-M22-03`（`9.208241, D=1, M=22`）**；若同时硬性要求 `QZ` 与 `ZQ` 双重留空，当前最佳均衡为 **`MARS10-QZZQEMPTY-P3-D3-M24-05`（`9.251460, D=3, M=24`）** / **`D3-M25-06`（`9.251049`）** 与 **`D2-M23-04`（`9.267573, D=2, M=23`）**。
