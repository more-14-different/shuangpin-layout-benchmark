# 交互式、可复现 の 双拼方案 选型探索

当前离线页为 `a7_CKT_R11.html`：在 [Common399](https://wwwhomes.uni-bielefeld.de/gibbon/Syllables/Mandarin)[^common399]、统一语料和冻结模型下，汇集 **467 个完整方案**，可筛选比较、查看键图与逐音节码表，并回看各轮探索结果。

指标速读：[M-R2](https://github.com/more-14-different/shuangpin-layout-benchmark)[^memory] 的 `M` 为记忆项，`D`/`V` 为普通声母/基础韵母原键偏移数[^dv]，均越低越易记；`U` 为 Common399 中的不同二键码数[^u]，越高越好；[A7E-v5/v4](https://github.com/more-14-different/shuangpin-layout-benchmark)[^ensemble]、[v6-CW150](https://github.com/more-14-different/shuangpin-layout-benchmark)[^v6] 与 [CKT](https://github.com/zhanghaozhecn/conditional-keystroke-timing)[^ckt] 均越低越好。所有结果都是冻结合同[^contracts]下的模型值，不代表全局最优或真人实验结论。

拼音拓扑以 `ve` 作为 `üe` 的唯一规范韵母，来源中写成 `ue` 的形式在进入布局映射前统一规范化为 `ve`。冻结语料里的 `jue/que/xue/yue` 原已按同一语义处理，且当前评测集不含 `gue`，因此这一别名规则不改变 Common399、CKT、人因或搜索排名；未来扩展集若加入 `gue`，它会复用各方案的 `ve` 键，只影响 Common399 之外的扩展重码与空码统计。

## 探索阶段

PR1–NF3 建立了历史方案、五类键域和单首键前沿；R11 页面保留其结果，并以 NF4 为后续演进起点。

| 阶段 | 相对上一阶段的进步与已探明范围 | 新增 / 累计 | 代表方案 |
|---|---|---:|---|
| NF4 | 引入可逐项核对的 [M-R1](https://github.com/more-14-different/shuangpin-layout-benchmark)[^memory] 记忆账；扩展 21×26 严格无[飞键](https://pingshunhuangalex.gitbook.io/rime-xkjd/advance-in-xkjd/alt-code)[^no-fly]与规则零声母分支 | +34 / 350 | `SNF4-M37-AE-12` |
| R2 | 升级为 [M-R2](https://github.com/more-14-different/shuangpin-layout-benchmark)[^memory] 映射＋路由账本，单列 D，并修正 [S005](https://pingshunhuangalex.gitbook.io/rime-xkjd/learn-xkjd/layouts)[^s005]；搜索低记忆、低声母偏移前沿 | +18 / 368 | `R2-21X21-M38-01` |
| R3 | 加入语料加权非首选硬约束[^nonfirst]，分开统计 D/V，并穷举[五辅](https://input.tansongchen.com/snow-jiandao/)[^aux]顺序 | +16 / 384 | `R3-21X21-M43-06` |
| R4 | 将全 20 合同[^contracts]右小指负担纳入约束，探明 21×21 的 D≤1 / D≤2 取舍 | +17 / 401 | `R4-21X21-M41-07` |
| R5 | 把含[形辅](https://input.tansongchen.com/snow-jiandao/)[^aux]主行率、角色键频与空格敏感性纳入复核，推进低偏移 21×26 前沿 | +11 / 412 | `R5-21X26-M39-09` |
| R6 | 固定五辅映射，围绕 D=1 与含辅主行率做 21×26 有界搜索 | +19 / 431 | `R6-21X26-M42-16` |
| R7 | 转向固定 [AVUIO](https://github.com/ChenZhu-Xie/rime-snow-pinyin#%E6%97%A0%E9%A3%9E%E9%94%AE%E9%81%93%E7%A5%9E%E9%9F%B5-%E5%8F%8C%E6%8B%BC%E7%BC%96%E7%A0%81%E6%96%B9%E6%A1%88)[^aux] 的 21×21 补全约束邻域，分别核验系综、主行与记忆 | +14 / 445 | `R7-21X21-M40-01` |
| R8 | 补全例外键口径并加入 v6 情景指标；闭合固定五辅的 21×21 / 21×26 局部邻域 | +10 / 455 | `R8-21X21-M40-01` |
| R9 | 新增完整 [moving-hand](https://github.com/macroxue/shuangpin)[^mx34] 文稿评测与 34 键扩展；21×26 放宽 D/HF[^hf] 寻找低记忆取舍 | +21 / 476 | `R9-21X26-M37-05` |
| R10 | 修正跨键域比较资格，将日常纯汉字 [MX34](https://macroxue.github.io/shuangpin/eval.html)[^mx34] 纳入目标；限定 21×26、D≤5、V≤1、Common399 无重无飞、固定五辅 | +8 / 484 | `R10-21X26-M39-08` |
| R11 | 在 R10 约束内加入复合操作、定向韵键与有限两层搜索；同时整合文稿热图、检索和说明卡片 | +8 / 492 | `R11-21X26-M39-05` |

### R11 之后：CKT v4 多级探索

R11 冻结后没有直接顺延为 R12，而是先重建 CKT v4 精确评分、代际避重与 CUDA 后端，再分成两条生产路线。21×21 从 M/D 逐级收紧进入固定 IVUAO 与 ProdGate，形成 U357 及其严格不退化的 M40 下界；21×26 先画出 M≤46/D≤10/V≤1 宽域，再证明固定拓扑下 D≥1，分别压实 D≤1 与 D≤3 的经验前沿。

| 路线 | 已探索区域 | 当前结论 |
|---|---|---|
| 方法层 | CKT v4 CPU/JS 精确回归、SQLite 避重、多目标选种、CUDA finalists | 后续轮次共享同一状态与评分合同；CUDA 不改变分数 |
| 21×21 | 分级下降 → 严格 IVUAO → ProdGate → 23 盆地 / 3 baseSeed 复核 | ProdGate 前沿 9.705581；U357 的 M<40 在严格不退化合同下不可行 |
| 21×26 | 宽域低 V → M≤40/D≤1/V≤1 → M≤40/D≤3/V≤1 | D=0 结构不可行；D≤1 前沿 9.167862，D≤3 前沿 9.050693，后二者尚未加入完整 ProdGate |

完整的时间线、状态规模、负结果、证据分支和可复用方法见 [`docs/POST_R11_EXPLORATION.md`](docs/POST_R11_EXPLORATION.md)。后续 CKT v4 约 9.x 的归一化分数与本页 R11“补全 CKT ms”不是同一数值轴，不能直接横向比较。

## 代表方案性能

<!-- README_REPRESENTATIVES:START（由 tools/update_readme_representatives.mjs 生成，请勿手改） -->

现行主指标是 [CKT v4](https://github.com/more-14-different/shuangpin-layout-benchmark/blob/main/docs/CKT_v4_SPEC.md)（越低越好，S005＝10）；本表用项目评分代码从冻结结果重算 NF4—R11，并把 R11 后各层的速度极值、生产门禁方案和实战均衡点放在同一脉络中。CKT v4 与历史“补全 CKT ms”不是同一数值轴；“—”表示该探索点没有按旧指标补算。

| 方案 | 阶段／定位 | 键域 | M/D/V | U | CKT v4 ↓ | A7E-v5 / v4 / v6 ↓ | 补全 CKT ms ↓ |
|---|---|---:|---:|---:|---:|---:|---:|
| `SNF4-M37-AE-12` | NF4 | 21×26 | 37/4/0 | 399 | 9.195416 | 9.9692 / 10.6046 / 9.0590 | 67.855 |
| `R2-21X21-M38-01` | R2 | 21×21 | 38/0/5 | 373 | 10.084493 | 10.7153 / 10.7618 / 9.6446 | 86.832 |
| `R3-21X21-M43-06` | R3 | 21×21 | 43/0/5 | 373 | 9.861039 | 10.6631 / 10.6797 / 9.5851 | 95.221 |
| `R4-21X21-M41-07` | R4 | 21×21 | 41/0/5 | 373 | 10.062029 | 10.3236 / 10.7454 / 9.4286 | 88.827 |
| `R5-21X26-M39-09` | R5 | 21×26 | 39/3/2 | 399 | 9.233220 | 10.0252 / 10.6172 / 9.0640 | 68.716 |
| `R6-21X26-M42-16` | R6 | 21×26 | 42/1/5 | 399 | 9.352607 | 10.3905 / 10.6906 / 9.4175 | 70.856 |
| `R7-21X21-M40-01` | R7 | 21×21 | 40/0/5 | 373 | 10.006506 | 10.3619 / 10.7235 / 9.4840 | 87.031 |
| `R8-21X21-M40-01` | R8 | 21×21 | 40/0/5 | 373 | 9.939897 | 10.4131 / 10.7489 / 9.4988 | 82.038 |
| `R9-21X26-M37-05` | R9 | 21×26 | 37/4/0 | 399 | 9.237304 | 9.9382 / 10.5892 / 9.0343 | 67.490 |
| `R10-21X26-M39-08` | R10 | 21×26 | 39/5/0 | 399 | 9.237569 | 9.9167 / 10.5691 / 9.0195 | 67.324 |
| `R11-21X26-M39-05` | R11 冻结 | 21×26 | 39/5/0 | 399 | 9.234330 | 9.9158 / 10.5724 / 9.0241 | 67.215 |
| [`P3-Finetune-best`](https://github.com/more-14-different/shuangpin-layout-benchmark/blob/97b58a868caab6734afd150b687ecc2e0a8333bf/research/milestones/finetune/finetune-batch-04-gen-0100.json) | P3 · 21×21 低温微调 | 21×21 | 40/0/5 | — | 9.420200 | — | — |
| [`U357-21X21-M40-D0`](https://github.com/more-14-different/shuangpin-layout-benchmark/blob/11713b652cd6a2350d8bf6d0a16d3383d8f0038f/research/notes/2026-10-29-prodgate-directed-repair-final-report.md) | P4 · ProdGate／实战 | 21×21 | 40/0/5 | 357 | 9.716421 | 10.4733 / 10.8046 / 9.5129 | 89.917 |
| [`P5-Wide-best`](https://github.com/more-14-different/shuangpin-layout-benchmark/blob/dc3b0ca4852d923f2384385910e3907eeb766d6e/research/seeds/ckt-v4/low-disp-20261026-gen0400/manifest.json) | P5 · 21×26 宽域速度极值 | 21×26 | ≤46/≤10/≤1 | — | 8.949768 | — | — |
| [`P6-D1-Speed`](https://github.com/more-14-different/shuangpin-layout-benchmark/blob/7a7e154f3f7d0c86653ee15e755ccd72e866e5e2/research/milestones/strict-d0/2026-10-30-strict-d0-production-closure-report.md) | P6 · D≤1 速度极值 | 21×26 | 37/1/1 | — | 9.167862 | — | — |
| [`Overall-17`](https://github.com/more-14-different/shuangpin-layout-benchmark/blob/7a7e154f3f7d0c86653ee15e755ccd72e866e5e2/research/milestones/strict-d0/2026-10-30-strict-d0-production-closure-report.md) | P6 · 低记忆均衡／实战 | 21×26 | 36/1/1 | 399 | 9.185254 | 10.8219 / 10.6847 / 9.5341 | 75.672 |
| [`P8-D3-Speed`](https://github.com/more-14-different/shuangpin-layout-benchmark/blob/70545d9f182a97700f7b404e18487fb12738ce01/research/milestones/m40-d3/2026-10-31-m40-d3-production-final-report.md) | P8 · D≤3 速度极值 | 21×26 | 38/3/1 | — | 9.050693 | — | — |
| [`P8-D3-V0`](https://github.com/more-14-different/shuangpin-layout-benchmark/blob/70545d9f182a97700f7b404e18487fb12738ce01/research/milestones/m40-d3/2026-10-31-m40-d3-production-final-report.md) | P8 · 基础元音原位极值 | 21×26 | 38/3/0 | — | 9.073755 | — | — |

P3/P5/P6/P8 的“速度极值”用于标记已探索地形，不等于可直接采用的生产方案；可投产性还需看人体工学门禁、重码和记忆成本。完整层级、状态规模与负结果见 [R11 后探索总览](https://github.com/more-14-different/shuangpin-layout-benchmark/blob/main/docs/POST_R11_EXPLORATION.md)。

<!-- README_REPRESENTATIVES:END -->

## 实战采用

<!-- README_ADOPTION:START（由 tools/update_readme_representatives.mjs 生成，请勿手改） -->

截至 2026-11-01，[rime-snow-pinyin](https://github.com/ChenZhu-Xie/rime-snow-pinyin/blob/main/README.md) 的当前实装分为两条：

- [冰雪键道](https://github.com/ChenZhu-Xie/rime-snow-pinyin/blob/main/snow_jiandao.schema.yaml)与[冰雪三拼](https://github.com/ChenZhu-Xie/rime-snow-pinyin/blob/main/snow_sanpin.schema.yaml)共用 [无飞键道(U357) 21×21 双拼](https://github.com/more-14-different/shuangpin-layout-benchmark/blob/11713b652cd6a2350d8bf6d0a16d3383d8f0038f/research/notes/2026-10-29-prodgate-directed-repair-final-report.md)；运行仓库以 [U357 映射夹具](https://github.com/ChenZhu-Xie/rime-snow-pinyin/blob/main/docs/shenyun-u357-mapping.json) 固化 `U357-21X21-M40-D0`。

- [冰雪神韵·形](https://github.com/ChenZhu-Xie/rime-snow-pinyin/blob/main/snow_shenyun_shape.schema.yaml)与[冰雪神韵·调](https://github.com/ChenZhu-Xie/rime-snow-pinyin/blob/main/snow_shenyun_tone.schema.yaml)共用 [神韵(Overall-17) 21×26 双拼](https://github.com/more-14-different/shuangpin-layout-benchmark/blob/7a7e154f3f7d0c86653ee15e755ccd72e866e5e2/research/milestones/strict-d0/2026-10-30-strict-d0-production-closure-report.md)；运行仓库以 [21×26 映射配置](https://github.com/ChenZhu-Xie/rime-snow-pinyin/blob/main/config/shenyun-21x26-mapping.json) 和[公共拼写代数](https://github.com/ChenZhu-Xie/rime-snow-pinyin/blob/main/snow_shenyun_common.yaml)固化 `SNOW-SHENYUN-21X26-PRODUCTION`。

以上实装文件链接跟随运行仓库的 `main`，用于查看当前采用状态；方案来源链接固定到定稿提交，便于长期复核其搜索合同和映射。

<!-- README_ADOPTION:END -->

下载：[GitHub Releases](https://github.com/more-14-different/shuangpin-layout-benchmark/releases/latest) · [Gitee Releases](https://gitee.com/xie-chenzhu/shuangpin-layout-benchmark/releases)

[^common399]: 普通话的 399 个共同音节集合；本项目以它作为方案覆盖、二键唯一性与多项评测的共同口径。
[^memory]: M-R1/M-R2 是本项目的记忆账本版本；M-R2 逐项计入非原键声韵映射与额外路由规则，M-R1 是其上一版口径。
[^dv]: D 是 18 个普通声母偏离同名原键的数量；V 是 `a/e/i/o/u` 五个基础韵母偏离原键的数量。偏移对应的映射费已经计入 M。
[^u]: U 是 Common399 实际得到的不同二键码数量；U 越小，音节重码越多。
[^ensemble]: A7E-v5 仅以 CKT 计时模型汇总冻结合同；A7E-v4 是同时汇总公开击键当量与几何模型的历史综合分，二者均越低越好。
[^v6]: v6-CW150 是实验性字词情景分：对 19 个合同的组内 CKT 加入 `150 ms × 非首选率`，并以 S005＝10 归一化；不含抽象 S2。
[^ckt]: [Conditional Keystroke Timing](https://github.com/zhanghaozhecn/conditional-keystroke-timing) 根据键对条件估算击键时间；“补全 CKT”还为重码桶追加固定规则后缀。
[^no-fly]: “飞键”指同一逻辑成分因上下文改走其他物理键；“无飞键”方案避免这种条件换键。
[^s005]: S005 是星空键道的同键域历史基线；本项目保留其原作条件首键和同口径冻结成绩。
[^nonfirst]: 按冻结字词频率统计音节或词条未落在首选候选的加权比例，用于区分高频重码与低频重码的实际影响。
[^aux]: 五辅是五个互斥的声调或形码辅助键。正文谈具体映射时，`AVUIO` 表示键道形辅“折、横、撇、竖、点”的有序键位，配对声调“一、二、三、四、轻”为 `IVUAO`，按形辅键序观察声调恒为 `42310`；数据字段 `auxiliaryClass` 及历史方案 ID 中的 `AEUIO` / `AVUIO` 仅是保留键／顶功键集合类别，不表示有序映射，也不一定等于 `tone` 使用的键集，实际声调与形辅映射以 `tone` 字段及语义转换为准。
[^contracts]: “合同”是固定数据集、编码规则与评测环境的组合；20 合同覆盖裸声韵、单字含辅和多种二字词含辅场景，保证方案在相同输入条件下比较。
[^hf]: HF 是指定单字与词组合同中含辅码主行占比的较小值，用于约束较差场景而非只看平均值。
[^mx34]: [macroxue/shuangpin](https://github.com/macroxue/shuangpin) 的 moving-hand 模型逐键跟踪双手位置；MX34 在原生 30 键模型上扩展 `[ ] \\ '` 四键，分数越高越好，不含形辅、空格或选重。
