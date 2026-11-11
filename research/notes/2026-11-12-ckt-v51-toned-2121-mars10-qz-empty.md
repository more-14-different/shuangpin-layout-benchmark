# 火星 10 韵组带调 21×21（AVUIO 7:8:6）QZ=空 约束联合退火研究报告（Round 1）

- **日期**：2026-11-12
- **分支**：`research/mars10-qz-empty`（基于 `origin/main` @ `b37ba2d`）
- **Rust 内核**：[toned_bucket.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/src/toned_bucket.rs)、[anneal-joint-toned-full.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/src/bin/anneal-joint-toned-full.rs)
- **可复算 Finalist JSON**：[ckt-v51-toned-2121-mars10-qz-empty-finalist.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/config/ckt-v51-toned-2121-mars10-qz-empty-finalist.json)
- **全量汇总与 JS 复算报告**：[2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-results.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-results.json)、[2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-js-verify.json](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-js-verify.json)

---

## 一、核心结论

1. **在严格保持 `QZ=空`（全 1,407 合法带调音节中 `QZ` 出现数为 `0`）下反超此前无约束冠军**
   - 第一轮全局最优方案 **`MARS10-QZEMPTY-D3-M26-07`** 达到：
     - **Rust CKT v5.1**：`9.194507769962`
     - **JS 全量独立复算 CKT v5.1**：`9.194507769969`
     - **相对此前无 QZ 约束冠军 (`9.203609845305`)**：**`-0.009102`**（不降反升，突破 `9.20` 大关）
     - **相对 Mars0 基线 (`9.556530457331402`)**：**`-0.362023`**
2. **揭示此前联合退火器的两个结构性收获**：
   - **修复零声母捆绑 Bug 后释放核心收益**：将 `zero-A`、`zero-E`、`zero-O` 从捆绑迁移拆分为 3 个独立可移动特殊族后，退火自动让 `zero-A` / `zero-E` / `zero-O` 各赴低碰撞空位（如 `zero-A->N, zero-E->Q, zero-O->Z`），使 `q->R, r->Q` 路线大降 `-0.0505`。
   - **发现“保留 `q=Q` + `s->N` 避让 `ch->S`”的低 D 强主盆地 (`D=2, M=23/25 -> 9.210801`)**：从 Route 2 Seed (`q->C, a-ou=Z`) 直接退火易受 `QZ` 拓扑势垒阻隔而停留在 `9.265769`；从 Route 1 结果桥接至 `D<=2` 后发现移动普通声母 `p->K, s->N` 即可保留 `q=Q`（改由韵侧 `lower:u->Z` 空出 `QZ`），在同等 `D=2, M=23/25` 预算下比 Route 2 Seed 降 **`-0.056091`**，且此时 `zero-A/O` 尚在 `R` 未分散。
3. **形成完整的 7 档非支配 `(CKT, M_lower, D_ordinary)` Pareto 前沿**（覆盖 `D=0, 1, 2, 3` 且 Rust 与全量 JS 偏差 `< 2e-11`）。

---

## 二、评测与搜索合同校验

- **评测合同**：Shape-only CKT v5.1，字/二/三/四字词权重 `1:3:1:1`，固定 `shapeKeysByMeaning = AVUIO`（对应 `toneKeysByTone = IVUAO`、`toneDigitsByShapeMeaning = 42310`）及词辅 `12/213/24`。
- **调区与韵组**：调区固定 `7:8:6`（上排 7 键四声 / 中排 8 键二三声 / 下排 6 键一声与轻声）；火星 10 韵组完整不拆组（`rhymeInternalSplits = 0`、`mergeLower = 9`）。
- **声母域与 `D/F` 双口径严格区分**：
  - 8 个特殊族各自独立完整移动：`zh`、`ch`、`sh`、`zero-Y`、`zero-W`、`zero-A`、`zero-E`、`zero-O`。
  - 18 个普通单字母声母保持 `ordinaryF = 0`。
  - **新口径（`ordinaryD/F`）**：仅统计普通单字母声母位移/分裂；
  - **历史折叠口径（`legacyFoldedD/F`）**：沿用 `zh->z, ch->c, sh->s` 规则统计折叠与分裂。下表同时列明两套口径，不混用。
- **硬约束与合同测试**：
  - [anneal-joint-toned-full.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/src/bin/anneal-joint-toned-full.rs) 增加 `--require-empty-buckets QZ`、`--rhyme-only`、`--seeds-json`；v2 checkpoint 写入 `requireEmptyBuckets`、`fixtureId`、`sourceHashes`、`maxD` 并在 `--resume` 时强校验。
  - [qz_empty_constraint.rs](file:///d:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/ckt-v4-core/tests/qz_empty_constraint.rs) 6 项集成测试全过：验证 `9.203609845305` 原冠军因 `QZ=qia1,qiu1` 被拒、3 个合法种子通过、`ZQ=zan4,zuan4` 不被拒、resume 合同不一致报错、1,407/Common1237 占桶与 Pareto 规则正确。

---

## 三、Pareto 前沿总表（严格保留低 M / 低 D）

> 全部 7 个方案均已通过全量 JS (`score_toned_2121_ckt_v51.js`, `--policy 12/213/24 --shape AVUIO`) 独立复算与全 1,407 音节实编码 `QZ` 检查（全部 `qzSyllables1407 = []`、`rhymeInternalSplits = 0`）。

| Finalist ID | 来源 | Rust CKT v5.1 | JS 复算 CKT v5.1 | Δ原冠军 (`9.203610`) | ΔMars0 (`9.556530`) | 新口径 `D/F` | 历史折叠 `D/F` | `M` (`lower/guard`) | `moves` (`1st/rhy/splits`) | 1407 占桶 | Common1237 占桶 | 关键声母改动（相对 Mars0） |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **MARS10-QZEMPTY-D0-M21-01** | `route1-joint:pareto` | `9.303428969825` | `9.303428969832` | `+0.099819` | `-0.253101` | `0/0` | `3/3` | `21/23` | `3/19/0` | `420/441` (空21) | `419/441` (空22) | `ch->S, sh->P, zero-E->C` |
| **MARS10-QZEMPTY-D0-M22-02** | `route0-d0-joint:best` | `9.293499917482` | `9.293499917496` | `+0.089890` | `-0.263031` | `0/0` | `3/3` | `22/24` | `4/21/0` | `422/441` (空19) | `418/441` (空23) | `ch->K, sh->P, zero-A->N, zero-E->C` |
| **MARS10-QZEMPTY-D1-M21-03** | `route1-rhyme-s999999` | `9.238843755038` | `9.238843755048` | `+0.035234` | `-0.317687` | `1/0` | `4/3` | `21/23` | `3/21/0` | `425/441` (空16) | `424/441` (空17) | `p->K` + `ch->S, sh->P` |
| **MARS10-QZEMPTY-D1-M22-04** | `route1-joint:best` | `9.230074442636` | `9.230074442640` | `+0.026465` | `-0.326456` | `1/0` | `4/3` | `22/24` | `4/19/0` | `422/441` (空19) | `421/441` (空20) | `p->K` + `ch->S, sh->P, zero-E->C` |
| **MARS10-QZEMPTY-D1-M23-05** | `route2-from-9230-d2` | `9.227098461834` | `9.227098461847` | `+0.023489` | `-0.329432` | `1/0` | `4/3` | `23/25` | `5/21/0` | `422/441` (空19) | `421/441` (空20) | `p->K` + `ch->S, sh->P, zero-E->C, zero-O->Z` |
| **MARS10-QZEMPTY-D2-M23-06** | `route1-bridge-d3` | `9.210800883697` | `9.210800883713` | `+0.007191` | `-0.345730` | `2/0` | `4/3` | `23/25` | `5/22/0` | `425/441` (空16) | `424/441` (空17) | `p->K, s->N` + `ch->S, sh->P, zero-E->C` |
| **MARS10-QZEMPTY-D3-M26-07** | `route3-joint:best` | **`9.194507769962`** | **`9.194507769969`** | **`-0.009102`** | **`-0.362023`** | `3/0` | `6/3` | `26/28` | `8/20/0` | `429/441` (空12) | `426/441` (空15) | `p->K, q->R, r->Q` + `ch->S, sh->P, zero-A->N, zero-E->Q, zero-O->Z` |

---

## 四、各路线随机种子与运行明细

| 阶段 / 任务 | Seed | 参数要点 | 初值 CKT | 最优 CKT | 新口径 `D` / `M` | 拦截 `QZ` 次数 | 步数 | 耗时 (s) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Route 1 韵区 | `42` | `--rhyme-only`, `T:0.02->0.00005` | `9.312083` | `9.282422833554` | `1` / `21/23` | `323` | `4000` | `16089.1` |
| Route 1 韵区 | `1410786` | `--rhyme-only`, `T:0.006->0.00003` | `9.312083` | `9.247912366226` | `1` / `21/23` | `92` | `1200` | `5840.9` |
| Route 1 韵区 | `999999` | `--rhyme-only`, `T:0.006->0.00003` | `9.312083` | **`9.238843755038`** | `1` / `21/23` | `72` | `1200` | `5645.6` |
| Route 2 韵区 | `42` | `--rhyme-only`, `T:0.006->0.00003` | `9.266892` | **`9.265768655095`** | `2` / `23/25` | `29` | `1200` | `5848.5` |
| Route 2 韵区 | `1410786` | `--rhyme-only`, `T:0.006->0.00003` | `9.266892` | `9.265768655100` | `2` / `23/25` | `21` | `1200` | `5764.6` |
| Route 2 韵区 | `999999` | `--rhyme-only`, `T:0.006->0.00003` | `9.266892` | `9.265768655108` | `2` / `23/25` | `26` | `1200` | `5653.7` |
| Route 3 韵区 | `42` | `--rhyme-only`, `T:0.006->0.00003` | `9.261538` | `9.248845653505` | `3` / `23/25` | `17` | `1200` | `5812.2` |
| Route 3 韵区 | `1410786` | `--rhyme-only`, `T:0.006->0.00003` | `9.261538` | **`9.245015327241`** | `3` / `23/25` | `16` | `1200` | `5690.9` |
| Route 3 韵区 | `999999` | `--rhyme-only`, `T:0.006->0.00003` | `9.261538` | `9.248845653509` | `3` / `23/25` | `19` | `1200` | `5790.1` |
| Route 1 联合 | `42` | `max-d 1`, from `r1-rhyme-s999999` | `9.238844` | **`9.230074442636`** | `1` / `22/24` | `106` | `1500` | `5952.0` |
| Route 2 联合 | `42` | `max-d 2`, from `r2-rhyme-s42` | `9.265769` | `9.265768655095` | `2` / `23/25` | `129` | `1500` | `6423.7` |
| Route 2 联合 (温) | `1410786` | `max-d 2`, `T:0.012->0.00003` | `9.265769` | `9.265768655095` | `2` / `23/25` | `117` | `1500` | `6434.4` |
| Route 3 联合 | `42` | `max-d 3`, from `r3-rhyme-s1410786` | `9.245015` | **`9.194507769962`** | `3` / `26/28` | `102` | `1500` | `6022.1` |
| Route 3 联合 | `999999` | `max-d 3`, from `r3-rhyme-s1410786` | `9.245015` | `9.195815010089` | `3` / `26/28` | `76` | `1200` | `4871.5` |
| 专项 `D=0` 联合 | `888888` | `max-d 0`, from `D0M21` | `9.303429` | **`9.293499917482`** | `0` / `22/24` | `77` | `1200` | `5406.3` |
| 桥接 `D<=2` 联合 | `202611` | `max-d 2`, from `9.230074` | `9.230074` | **`9.227098461834`** | `1` / `23/25` | `73` | `1200` | `4807.6` |
| 桥接 `D<=3` 联合 | `777777` | `max-d 3`, from `9.230074` | `9.230074` | **`9.210800883697`** | `2` / `23/25` | `68` | `1200` | `4839.9` |

---

## 五、全部 7 个 Pareto 前沿方案完整映射与空桶验证

### 1. 全局冠军 `MARS10-QZEMPTY-D3-M26-07`（CKT `9.194507769962` / JS `9.194507769969`）

- **普通声母（18 个）**：`p->K`, `q->R`, `r->Q`；其余 15 个（`b=B, c=C, d=D, f=F, g=G, h=H, j=J, k=K, l=L, m=M, n=N, s=S, t=T, x=X, z=Z`）保持原位。`ordinaryD/F = 3/0`，历史折叠 `D/F = 6/3`。
- **8 个特殊/零声母族**：`zh=E, ch=S, sh=P, zero-Y=Y, zero-W=W, zero-A=N, zero-E=Q, zero-O=Z`。
- **三调区 10 韵组映射**：
  - **upper (4 声)**：`a-ou->E, en-n->T, e-ei->W, eng-ai-v->P, an->Q, ang->Y, u->E, i-er->R, o-ong->Y, ao->T`
  - **home (2/3 声)**：`a-ou->S, en-n->G, e-ei->D, eng-ai-v->F, an->L, ang->J, u->H, i-er->K, o-ong->K, ao->H`
  - **lower (1/5 声)**：`a-ou->Z, en-n->N, e-ei->M, eng-ai-v->C, an->M, ang->X, u->N, i-er->B, o-ong->N, ao->C`
- **分赛道有效耗时 (`JS effectiveMs`)**：单字 `170.941287` ms、二字 `445.676986` ms、三字 `547.643466` ms、四字 `513.008016` ms。
- **桶审计与 `QZ` 显式验证**：
  - `qzSyllables1407`: `[]`（`QZ` **确认为空**）；`zqSyllables1407`: `["zan4", "zuan4"]`（未被错误拒绝）。
  - **1,407 占桶**：`429 / 441`，空桶 (`12` 个)：`QP, QZ, QB, WR, WB, FR, FB, GR, GB, HR, HB, NN`。
  - **Common1237 占桶**：`426 / 441`，空桶 (`15` 个)：`QQ, QP, QZ, QX, QB, WR, WB, FR, FB, GR, GB, HR, HB, CS, NN`。

### 2. 低 D 综合冠军 `MARS10-QZEMPTY-D2-M23-06`（CKT `9.210800883697` / JS `9.210800883713`）

- **声母与零声母**：`p->K, s->N`（其余 16 普通声母原位，`q=Q`）；`zh=E, ch=S, sh=P, zero-Y=Y, zero-W=W, zero-A=R, zero-E=C, zero-O=R`。`ordinaryD/F = 2/0`（历史折叠 `4/3`），`M = 23/25`。
- **三调区 10 韵组映射**：
  - **upper (4)**：`a-ou->E, en-n->T, e-ei->W, eng-ai-v->P, an->Q, ang->Y, u->E, i-er->R, o-ong->Y, ao->T`
  - **home (2/3)**：`a-ou->S, en-n->H, e-ei->D, eng-ai-v->G, an->K, ang->J, u->H, i-er->F, o-ong->L, ao->L`
  - **lower (1/5)**：`a-ou->X, en-n->N, e-ei->B, eng-ai-v->C, an->M, ang->M, u->Z, i-er->B, o-ong->N, ao->C`
- **桶审计**：`qzSyllables1407 = []`；`zqSyllables1407 = ["zan4", "zuan4"]`。
  - **1,407 占桶**：`425 / 441`，空桶 (`16` 个)：`QZ, WR, WF, RF, RZ, RB, YZ, FR, FF, GR, GF, HR, HF, JZ, XZ, MZ`。
  - **Common1237 占桶**：`424 / 441`，空桶 (`17` 个)：`QZ, WR, WF, RF, RZ, RB, YZ, FR, FF, GR, GF, HR, HF, JZ, XZ, CS, MZ`。

### 3. 其余 5 档 Pareto 前沿（`D0` 与 `D1` 完整映射及空桶）

- **`MARS10-QZEMPTY-D1-M23-05`**（`9.227098461834`, `D=1/0`, `M=23/25`）：
  - 声母：`p->K`, `ch->S, sh->P, zh=E, zero-A=R, zero-E=C, zero-O=Z, zero-W=W, zero-Y=Y`。
  - upper: `a-ou:E, en-n:T, e-ei:W, eng-ai-v:P, an:Q, ang:Y, u:E, i-er:R, o-ong:Y, ao:T`
  - home: `a-ou:S, en-n:L, e-ei:D, eng-ai-v:G, an:K, ang:J, u:H, i-er:F, o-ong:L, ao:H`
  - lower: `a-ou:X, en-n:N, e-ei:B, eng-ai-v:C, an:M, ang:M, u:Z, i-er:B, o-ong:N, ao:C`
  - `QZ=[]`；1,407 占桶 `422/441`（空 `19` 个：`QZ, WR, WF, RF, RZ, RB, RN, YZ, FR, FF, GR, GF, HR, HF, JZ, XZ, NZ, NN, MZ`）；Common1237 占桶 `421/441`（多空 `CS`）。
- **`MARS10-QZEMPTY-D1-M22-04`**（`9.230074442636`, `D=1/0`, `M=22/24`）：
  - 声母：`p->K`, `ch->S, sh->P, zh=E, zero-A=R, zero-E=C, zero-O=R, zero-W=W, zero-Y=Y`。
  - upper/home 同 `05`；lower: `a-ou:X, en-n:N, e-ei:M, eng-ai-v:C, an:M, ang:C, u:Z, i-er:B, o-ong:N, ao:B`。
  - `QZ=[]`；1,407 占桶 `422/441`（空 `19` 个：`QZ, WR, WF, WB, RF, RZ, YZ, FR, FF, FB, GR, GF, HR, HF, JZ, XZ, NZ, NN, MZ`）；Common1237 占桶 `421/441`（多空 `CS`）。
- **`MARS10-QZEMPTY-D1-M21-03`**（`9.238843755038`, `D=1/0`, `M=21/23`）：
  - 声母：`p->K`, `ch->S, sh->P, zh=E, zero-A/E/O=R, zero-W=W, zero-Y=Y`。
  - upper/home/lower 韵组映射同 `05`（仅 `zero-E`、`zero-O` 未移出 `R`）。
  - `QZ=[]`；1,407 占桶 `425/441`（空 `16` 个：`QZ, WR, WF, RZ, YZ, FR, FF, GR, GF, HR, HF, JZ, XZ, NZ, NN, MZ`）；Common1237 占桶 `424/441`（多空 `CS`）。
- **`MARS10-QZEMPTY-D0-M22-02`**（`9.293499917482`, `D=0/0`, `M=22/24`）：
  - 声母：18 普通声母全冻结；`ch->K, sh->P, zh=E, zero-A->N, zero-E->C, zero-O=R, zero-W=W, zero-Y=Y`。
  - 韵组映射同 `05`。
  - `QZ=[]`；1,407 占桶 `422/441`（空 `19` 个：`QZ, WR, WF, RP, RF, RZ, RB, YZ, FR, FF, GR, GF, HR, HF, JZ, XZ, NZ, NN, MZ`）；Common1237 占桶 `418/441`（多空 `RQ, RM, SG, CS`）。
- **`MARS10-QZEMPTY-D0-M21-01`**（`9.303428969825`, `D=0/0`, `M=21/23`）：
  - 声母：18 普通声母全冻结；`ch->S, sh->P, zh=E, zero-A=R, zero-E->C, zero-O=R, zero-W=W, zero-Y=Y`。
  - upper/home/lower 同 `04`。
  - `QZ=[]`；1,407 占桶 `420/441`（空 `21` 个：`QZ, WR, WF, WB, RF, RZ, YZ, FR, FF, FB, GR, GF, HR, HF, JZ, KR, KF, XZ, NZ, NN, MZ`）；Common1237 占桶 `419/441`（多空 `CS`）。

---

## 六、本轮结论与下一阶段（低占用长时多阶段 + `QZ+ZQ` 双空）探索方向

1. **方向 1（`D<=2` 从 `9.210801` 深挖并释放全零声母分散）**
   - 机制：`MARS10-QZEMPTY-D2-M23-06` 保留了 `q=Q` 并以 `s->N` 解开 `ch->S` 冲突，此时 `zero-A` 与 `zero-O` 仍在 `R` 上且 `zero-W/Y` 未深入联动。参照 `D=3` 路线靠零声母完全分散立降 `~0.04` 的实证规律，在 `D<=2` 下开展“中温重排 -> 低温韵区共适应 -> 极低温精炼”的多阶段退火，极有希望把 **`D=2` 也压进 `9.19~9.20`**。
2. **方向 2（`D<=1` 与 `D=0` 超低偏移极值摸底）**
   - 机制：探索是否有除 `p->K` 外的其他单普通声母（或 `zh/ch/sh` 非典型配对）与 5 个独立零声母协同，在严格 `D<=1` 乃至 `D=0` 下继续压缩 `9.227098 (D=1)` 与 `9.293500 (D=0)`。
3. **方向 3（`D<=3` 冲刺更低 CKT 与低 `M` 紧凑前沿 `M=23..25`）**
   - 机制：从 `9.194508` 继续做长周期精细多阶段退火看能否逼近 `9.18x`，同时对 `M=24/25` 档做定向收紧，降低记忆代价。
4. **方向 4（`QZ` 与 `ZQ` 同时为音节空桶，`--require-empty-buckets QZ,ZQ`，`D<=3` 且越低越好）**
   - **结构定理**（已在 1,407 音节全遍历证实）：所有本轮优解虽满足 `QZ=[]`，但均包含 `ZQ=[zan4, zuan4]`。并且 **`z` 在四声上排覆盖全部 10 个火星韵组**（`zou4, zen4/zun4, ze4/zui4, zai4/zeng4, zan4/zuan4, zang4, zu4, zi4, zong4/zuo4, zao4`）。因此只要韵组保持上排 `Q` 被占用且 `z` 停留在 `Z`，`ZQ` 就永远无法同时为空。
   - **突破路径**：在 `D<=3` 约束下将 `z` 移离 `Z`（至少花 `1 D`），使 `Z` 改放空白键位，或改由在四声存在空韵的声族（如 `zero-E` 仅占 `e-ei/i-er`、`zero-O`、`q/j/x` 缺 `u4`、`zh/ch/sh` 或 `r` 等）落于 `Z`，配合 `lower:u->Z` 或声母换位实现 **`QZ=[]` 且 `ZQ=[]` 双重硬约束**下的全局优解。
