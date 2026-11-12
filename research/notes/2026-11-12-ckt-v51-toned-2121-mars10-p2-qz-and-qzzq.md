# 火星 10 韵组带调 21×21（AVUIO 7:8:6）Phase II 多阶段退火与 QZ+ZQ 双空探索报告

- **日期**：2026-11-12
- **分支**：`research/mars10-qz-empty`
- **Rust 核心**：[toned_bucket.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/src/toned_bucket.rs)、[anneal-joint-toned-full.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/src/bin/anneal-joint-toned-full.rs)
- **前置 Phase I 报告**：[2026-11-12-ckt-v51-toned-2121-mars10-qz-empty.md](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qz-empty.md)
- **可复算 Finalist JSON**：
  - `QZ=空` 累计全局前沿：[ckt-v51-toned-2121-mars10-qz-empty-p2-finalist.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/config/ckt-v51-toned-2121-mars10-qz-empty-p2-finalist.json)
  - `QZ+ZQ=双空` 前沿：[ckt-v51-toned-2121-mars10-qzzq-empty-p2-finalist.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/config/ckt-v51-toned-2121-mars10-qzzq-empty-p2-finalist.json)
- **汇总与全量 JS 独立复算结果**：
  - `QZ=空`：[2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-p2-results.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-p2-results.json)、[2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-p2-js-verify.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-p2-js-verify.json)
  - `QZ+ZQ=双空`：[2026-11-12-ckt-v51-toned-2121-mars10-qzzq-empty-p2-results.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qzzq-empty-p2-results.json)、[2026-11-12-ckt-v51-toned-2121-mars10-qzzq-empty-p2-js-verify.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qzzq-empty-p2-js-verify.json)

---

## 一、Phase II 核心结论

1. **`QZ=空` 低 `D` 前沿被彻底改写——`D=1` 发现 `p->S, ch->K` 新盆地并反超 Round 1 的 `D=2` 方案**
   - 通过 Phase II 新增的 `first_swap` 算子（`first_swap ch(S) <-> p(K)`），`p2-qz-lowd-d1` 跳出此前的 `p->K, ch->S` 局部最优：
     - **`MARS10-QZEMPTY-P2-D1-M22-03`**：Rust `9.208241037882` / JS `9.208241037887`（`ordinaryD/F = 1/0`，`M = 22/24`），比 Round 1 的 `D=1` 最优（`9.227098`）大降 **`-0.018857`**，以更低的 **`D=1, M=22`** 直接支配淘汰了 Round 1 的 `D=1, M=23` 与 `D=2, M=23`（`9.210801`），仅比 Round 1 无 `QZ` 约束 `D=3` 原冠军（`9.203610`）高 `+0.004631`。
     - **`MARS10-QZEMPTY-P2-D1-M21-02`**：Rust `9.223020045035` / JS `9.223020045040`（`D=1/0`, `M=21/23`, `p->S` + `ch->K, sh->P`），较 Round 1 同 `M=21` 档（`9.238844`）降 **`-0.015824`**。
     - **`MARS10-QZEMPTY-P2-D0-M21-01`**：Rust `9.292634747093` / JS `9.292634747099`（`D=0/0`, `M=21/23`, `ch->K, sh->P, zero-E->C`），以更低记忆成本 `M=21` 击败并淘汰了 Round 1 `D=0, M=21`（`9.303429`）与 `D=0, M=22`（`9.293500`）。
   - `D=3` 全球冠军仍稳居 **`MARS10-QZEMPTY-P2-D3-M26-05`**（`9.194507769962` Rust / `9.194507769969` JS），并新增低记忆紧凑档 **`MARS10-QZEMPTY-P2-D3-M25-04`**（`9.195925525602` Rust & JS，`D=3/0, M=25/27`，仅靠保留 `zero-O=R` 省去 1 记忆开销）。
2. **`QZ+ZQ=双空` 硬约束突破：确认最低需 `D>=1`，`D=2` 已攻入 `9.276547`**
   - 全 1,407 音节下 **`z` 在四声上排覆盖全部 10 个火星韵组**；上排 7 键满占时必有韵在 `Q` 上，因此 `z` 不能留驻 `Z`（至少消耗 `1 D` 移出 `z`）。
   - **`MARS10-QZZQEMPTY-P2-D2-M24-04`** 达到 Rust `9.276547216583` / JS `9.276547216604`（`D=2/0`, `M=24/26`, `p->C, z->K` + `ch->S, sh->P, zero-A->N, zero-E->Z`），较其冷起点（`9.459383`）大降 `-0.182836`，且远超冷起点 `D=3` 路线（`9.307406`），揭示 **`zero-E->Z`**（四声不碰 `Q` 韵位，同时释放 `Z` 列低位高产）是 `QZ+ZQ` 双空的关键结构枢纽。
   - 最小偏移 `D=1` 档 **`MARS10-QZZQEMPTY-P2-D1-M23-02`**（`9.344047161710`）与 **`D1-M22-01`**（`9.346899160677`）同样全部通过 1,407 音节 `QZ=[]` 与 `ZQ=[]` 双空复验。

---

## 二、引擎升级与 Phase II 低占用多阶段退火运行明细

- **多阶段锯齿降温 (`--stages 4`)**：在 [toned_bucket.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/src/toned_bucket.rs) 新增 [`stage_temperature`](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/src/toned_bucket.rs#L178-L206)，在进度 `25% / 50% / 75%` 自动回拉至当前全局最优并按 `0.5^stage * initial_temp` 重升温再深冷至 `0.00001`。
- **新增成对交换与双向变 `D` 转移**：[anneal-joint-toned-full.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/src/bin/anneal-joint-toned-full.rs) 新增 `Operator 5 (first_swap)` 并在 `0 < D < max_d` 补齐 `ordinary_reset`；[qz_empty_constraint.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/tests/qz_empty_constraint.rs) 扩展至 8 项集成测试并通过。

| 任务 | 约束 | `max-d` | 步数 / 耗时 (s) | 拦截违例次数 | 起点 CKT | 终值最优 CKT | 新口径 `D` / `M` | 最终关键改动 |
|---|---|---:|---:|---:|---:|---:|---|---|
| `p2-qz-lowd-d1` | `QZ` | `1` | `4500` / `16858.69` | `282` | `9.227098` | **`9.208241037882`** | `1` / `22/24` | `p->S` + `ch->K, sh->P, zero-E->C` |
| `p2-qz-sweetspot-d2` | `QZ` | `2` | `4500` / `16817.64` | `251` | `9.210801` | `9.210800883689` | `2` / `23/25` | `p->K, s->N` + `ch->S, sh->P, zero-E->C` |
| `p2-qz-perf-d3` | `QZ` | `3` | `4500` / `17706.74` | `480` | `9.194508` | `9.194507769962` | `3` / `26/28` | `p->K, q->R, r->Q` + `ch->S, sh->P, zero-A/E/O->N/Q/Z` |
| `p2-qzzq-lowd-d2` | `QZ,ZQ` | `2` | `4500` / `17793.66` | `730` | `9.459383` | **`9.276547216583`** | `2` / `24/26` | `p->C, z->K` + `ch->S, sh->P, zero-A->N, zero-E->Z` |
| `p2-qzzq-perf-d3` | `QZ,ZQ` | `3` | `4500` / `18507.36` | `913` | `9.334728` | `9.307405960504` | `3` / `27/29` | `q->S, r->Q, z->W` + `ch->K, sh->P, zero-A/O->Z, zero-E->Q, zero-W->R` |

---

## 三、`QZ=空` 累计全局 Pareto 前沿（5 档，`Round 1 + Phase II`）

> 全部方案保持 Shape-only CKT v5.1（`1:3:1:1`、`AVUIO 12/213/24`、火星 10 韵组 `rhymeInternalSplits=0`、`7:8:6`、`ordinaryF=0`、`qzSyllables1407=[]`）。

| Finalist ID | 来源 | Rust CKT v5.1 | JS 复算 CKT v5.1 | Δ原冠军 (`9.203610`) | 新口径 `D/F` | 折叠 `D/F` | `M` (`lower/guard`) | 1407 占桶 | Common1237 占桶 | 声母与特殊族改动 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **MARS10-QZEMPTY-P2-D0-M21-01** | `p2-qz-lowd-d1:3072` | `9.292634747093` | `9.292634747099` | `+0.089025` | `0/0` | `3/3` | `21/23` | `423/441` (空18) | `421/441` (空20) | 无普通移位；`ch->K, sh->P, zero-E->C` |
| **MARS10-QZEMPTY-P2-D1-M21-02** | `p2-qz-lowd-d1:2227` | `9.223020045035` | `9.223020045040` | `+0.019410` | `1/0` | `4/3` | `21/23` | `425/441` (空16) | `424/441` (空17) | `p->S`；`ch->K, sh->P` |
| **MARS10-QZEMPTY-P2-D1-M22-03** | `p2-qz-lowd-d1:best` | **`9.208241037882`** | **`9.208241037887`** | `+0.004631` | `1/0` | `4/3` | `22/24` | `423/441` (空18) | `422/441` (空19) | `p->S`；`ch->K, sh->P, zero-E->C` |
| **MARS10-QZEMPTY-P2-D3-M25-04** | `p2-qz-perf-d3:1084` | `9.195925525602` | `9.195925525602` | `-0.007684` | `3/0` | `6/3` | `25/27` | `429/441` (空12) | `426/441` (空15) | `p->K, q->R, r->Q`；`ch->S, sh->P, zero-A->N, zero-E->Q` |
| **MARS10-QZEMPTY-P2-D3-M26-05** | `p2-qz-perf-d3:best` | **`9.194507769962`** | **`9.194507769969`** | **`-0.009102`** | `3/0` | `6/3` | `26/28` | `429/441` (空12) | `426/441` (空15) | `p->K, q->R, r->Q`；`ch->S, sh->P, zero-A->N, zero-E->Q, zero-O->Z` |

### 新晋关键 `QZ=空` 方案完整映射（`D0-M21`、`D1-M21`、`D1-M22`、`D3-M25`）

- **`MARS10-QZEMPTY-P2-D1-M22-03`（Phase II 最重要新发现，`D=1` 反超此前 `D=2`）**：
  - **声母**：`p->S`，其余 17 普通声母原位；`zh=E, ch->K, sh->P, zero-A=R, zero-E->C, zero-O=R, zero-W=W, zero-Y=Y`。
  - **韵区**：upper `a-ou:E, en-n:T, e-ei:W, eng-ai-v:P, an:Q, ang:Y, u:E, i-er:R, o-ong:Y, ao:T`；home `a-ou:S, en-n:L, e-ei:D, eng-ai-v:G, an:K, ang:J, u:H, i-er:F, o-ong:L, ao:H`；lower `a-ou:X, en-n:N, e-ei:B, eng-ai-v:C, an:M, ang:M, u:Z, i-er:B, o-ong:N, ao:C`。
  - **分赛道有效耗时 (`JS effectiveMs`)**：字 `168.715165`、二字 `448.449388`、三字 `546.061772`、四字 `514.744346` ms。
  - **桶审计**：`qzSyllables1407 = []`、`zqSyllables1407 = ["zan4", "zuan4"]`；1,407 空桶 `18` 个（`QZ, WR, WF, RF, RZ, RB, YZ, FR, FF, GR, GF, HR, HF, JZ, XZ, NZ, NN, MZ`），Common1237 空桶 `19` 个（多空 `CS`）。
- **`MARS10-QZEMPTY-P2-D0-M21-01`** 与 **`MARS10-QZEMPTY-P2-D1-M21-02`**：三调区韵映射完全同上（见汇总 JSON）；`D0-M21` 仅移 `ch->K, sh->P, zero-E->C`（字/二/三/四字 `effectiveMs` = `169.975207 / 450.541765 / 555.636445 / 522.259211`），`D1-M21` 仅移 `p->S, ch->K, sh->P`（`169.840413 / 448.532478 / 547.529287 / 515.211801`）。
- **`MARS10-QZEMPTY-P2-D3-M25-04`**：声母同 `05` 但 `zero-O=R`（不外移至 `Z`），韵区同 `05`（upper `E T W P Q Y E R Y T`，home `S G D F L J H K K H`，lower `Z N M C M X N B N C`），空桶与 `05` 同为 1407 空 `12` 个（`QP, QZ, QB, WR, WB, FR, FB, GR, GB, HR, HB, NN`）、1237 空 `15` 个。

---

## 四、`QZ+ZQ=双空` Pareto 前沿（4 档，1,407 音节双重硬验证通过）

> 全 4 档均满足 `qzSyllables1407 = []` **且** `zqSyllables1407 = []`，`rhymeInternalSplits = 0`、`ordinaryF = 0`。

| Finalist ID | 来源 | Rust CKT v5.1 | JS 复算 CKT v5.1 | Δ原冠军 | ΔMars0 | 新口径 `D/F` | 折叠 `D/F` | `M` | 1407 占桶 | Common1237 占桶 | 声母与特殊族改动 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **MARS10-QZZQEMPTY-P2-D1-M22-01** | `p2-qzzq-lowd-d2:924` | `9.346899160677` | `9.346899160687` | `+0.143289` | `-0.209631` | `1/0` | `3/3` | `22/24` | `412/441` (空29) | `409/441` (空32) | `z->K`；`ch->S, sh->P, zero-E->Z` |
| **MARS10-QZZQEMPTY-P2-D1-M23-02** | `p2-qzzq-lowd-d2:4467` | `9.344047161710` | `9.344047161744` | `+0.140437` | `-0.212483` | `1/0` | `3/3` | `23/25` | `410/441` (空31) | `405/441` (空36) | `z->K`；`ch->S, sh->P, zero-A->N, zero-E->Z` |
| **MARS10-QZZQEMPTY-P2-D2-M23-03** | `p2-qzzq-lowd-d2:4475` | `9.278460940021` | `9.278460940055` | `+0.074851` | `-0.278070` | `2/0` | `4/3` | `23/25` | `411/441` (空30) | `409/441` (空32) | `p->C, z->K`；`ch->S, sh->P, zero-E->Z` |
| **MARS10-QZZQEMPTY-P2-D2-M24-04** | `p2-qzzq-lowd-d2:best` | **`9.276547216583`** | **`9.276547216604`** | `+0.072937` | `-0.279983` | `2/0` | `4/3` | `24/26` | `410/441` (空31) | `406/441` (空35) | `p->C, z->K`；`ch->S, sh->P, zero-A->N, zero-E->Z` |

- **双空冠军 `MARS10-QZZQEMPTY-P2-D2-M24-04` 完整韵表**：
  - **upper (4)**：`a-ou:E, en-n:T, e-ei:P, eng-ai-v:W, an:Q, ang:Y, u:E, i-er:R, o-ong:Y, ao:T`
  - **home (2/3)**：`a-ou:S, en-n:L, e-ei:D, eng-ai-v:G, an:K, ang:J, u:H, i-er:F, o-ong:L, ao:H`
  - **lower (1/5)**：`a-ou:X, en-n:N, e-ei:B, eng-ai-v:C, an:M, ang:M, u:Z, i-er:B, o-ong:N, ao:C`
  - **分赛道有效耗时 (`JS effectiveMs`)**：`170.299813 / 450.505872 / 555.835849 / 516.495529` ms。
  - **1,407 空桶 (`31` 个)**：`QZ, WR, WF, RW, RF, RZ, RB, YZ, FR, FF, GR, GF, HR, HF, JZ, ZQ, ZW, ZE, ZY, ZS, ZG, ZH, ZJ, ZK, ZZ, ZX, ZM, XZ, NZ, NN, MZ`（`Z*` 仅余 `ZD, ZF, ZL, ZC, ZN, ZB, ZR, ZT, ZP` 承接 `zero-E`；**`QZ` 与 `ZQ` 均彻底为空**）。

---

## 五、Phase III（下一阶段 5~6h 多阶段退火）最有希望的延续方向

从 Phase II 结果看，最显著的未充分开发空间来自两个刚被打开但尚未完成分散/桥接的新盆地：

1. **方向 A（`QZ`, `D<=1`：`9.208241` 上分散零声母 `zero-A/O/W/Y`）**：`D1-M22-03` 中 **`zero-A` 与 `zero-O` 仍双双滞留在 `R`**，`zero-W/Y` 亦未联动，且其韵区完全沿用旧拓扑；以 `9.208241` 为起点用中等重升温单独深度退火，`D=1` 有望压近甚至突破 `9.200`。
2. **方向 B（`QZ`, `D<=2`：从 `p->S, ch->K` 新盆地桥接 `D=2`）**：Phase II 的 `D<=2` 路仍锁在旧 `p->K, s->N` 上而未接触 `p->S, ch->K`；从 `9.208241` 桥接至 `max-d=2`，结合第 2 个普通声母移位与零声母全分散，冲击 **`D=2 < 9.200` 甚至挑战 `9.194508`**。
3. **方向 C（`QZ`, `D<=3`：从 `p->S, ch->K` 新盆地跨入 `D<=3`）**：`9.194508` 所在的 `p->K, q->R, r->Q` 盆地在 4500 步精炼中纹丝不动（已局部饱和）；以全新的 `p->S, ch->K`（`9.208241`）直接桥接至 `D<=3`，检验能否以 `p->S + 2 移位` 开出比 `9.194508` 更低的新全局纪录。
4. **方向 D（`QZ+ZQ`, `D<=2`：`9.276547` 上分散 `zero-O/W/Y` 与深挖 `D=1/2`）**：`QZZQ-D2-M24-04` 仍留 `zero-O=R` 未分散且仅沿用早期的 `P/W` 微调韵表；从 `9.276547` 围绕 `D<=2` 做热重排+韵共适应，同步压低 `D=1`（`< 9.34`）与 `D=2`（`< 9.26`）。
5. **方向 E（`QZ+ZQ`, `D<=3`：从 `9.276547 (D=2)` 桥接 `D<=3` 解锁第三移位）**：Phase II `QZZQ D=3` 路陷入冷起点 `9.307406`，反而落后 `D=2` 达 `+0.0309`；从 `9.276547`（`p->C, z->K`）出发桥接至 `D<=3`，把双空性能前言继续下拉至 **`~9.23~9.25`** 区间。
