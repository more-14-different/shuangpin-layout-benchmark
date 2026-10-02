# 交互式、可复现 の 双拼方案 选型探索

当前离线页为 `a7_CKT_R11.html`：在 [Common399](https://wwwhomes.uni-bielefeld.de/gibbon/Syllables/Mandarin)[^common399]、统一语料和冻结模型下，汇集 **467 个完整方案**，可筛选比较、查看键图与逐音节码表，并回看各轮探索结果。

指标速读：[M-R2](https://github.com/more-14-different/shuangpin-layout-benchmark)[^memory] 的 `M` 为记忆项，`D`/`V` 为普通声母/基础韵母原键偏移数[^dv]，均越低越易记；`U` 为 Common399 中的不同二键码数[^u]，越高越好；[A7E-v5/v4](https://github.com/more-14-different/shuangpin-layout-benchmark)[^ensemble]、[v6-CW150](https://github.com/more-14-different/shuangpin-layout-benchmark)[^v6] 与 [CKT](https://github.com/zhanghaozhecn/conditional-keystroke-timing)[^ckt] 均越低越好。所有结果都是冻结合同[^contracts]下的模型值，不代表全局最优或真人实验结论。

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

## 代表方案性能

| 方案 | 键域 | M/D/V | U | [A7E-v5 / v4 / v6](https://github.com/more-14-different/shuangpin-layout-benchmark)[^ensemble] | 补全 [CKT](https://github.com/zhanghaozhecn/conditional-keystroke-timing)[^ckt] ms |
|---|---:|---:|---:|---:|---:|
| `SNF4-M37-AE-12` | 21×26 | 37/4/0 | 399 | 9.9692 / 10.6046 / 9.0590 | 67.855 |
| `R2-21X21-M38-01` | 21×21 | 38/0/5 | 373 | 10.7153 / 10.7618 / 9.6446 | 86.832 |
| `R3-21X21-M43-06` | 21×21 | 43/0/5 | 373 | 10.6631 / 10.6797 / 9.5851 | 95.221 |
| `R4-21X21-M41-07` | 21×21 | 41/0/5 | 373 | 10.3236 / 10.7454 / 9.4286 | 88.827 |
| `R5-21X26-M39-09` | 21×26 | 39/3/2 | 399 | 10.0252 / 10.6172 / 9.0640 | 68.716 |
| `R6-21X26-M42-16` | 21×26 | 42/1/5 | 399 | 10.3905 / 10.6906 / 9.4175 | 70.856 |
| `R7-21X21-M40-01` | 21×21 | 40/0/5 | 373 | 10.3619 / 10.7235 / 9.4840 | 87.031 |
| `R8-21X21-M40-01` | 21×21 | 40/0/5 | 373 | 10.4131 / 10.7489 / 9.4988 | 82.038 |
| `R9-21X26-M37-05` | 21×26 | 37/4/0 | 399 | 9.9382 / 10.5892 / 9.0343 | 67.490 |
| `R10-21X26-M39-08` | 21×26 | 39/5/0 | 399 | 9.9167 / 10.5691 / 9.0195 | 67.324 |
| `R11-21X26-M39-05` | 21×26 | 39/5/0 | 399 | 9.9158 / 10.5724 / 9.0241 | 67.215 |

## 实战采用

- `R8-21X21-M40-01` 已投入生产/实战，被 [rime-snow-pinyin](https://github.com/ChenZhu-Xie/rime-snow-pinyin) 的“无[飞键](https://pingshunhuangalex.gitbook.io/rime-xkjd/advance-in-xkjd/alt-code)道・神韵”用作双拼编码方案。
- `R10-21X26-M39-08` 也即将被 [rime-snow-pinyin](https://github.com/ChenZhu-Xie/rime-snow-pinyin) 采用。

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
[^aux]: 五辅是五个互斥的声调或形码辅助键；AVUIO 表示键道形辅“折、横、撇、竖、点”的固定键序。
[^contracts]: “合同”是固定数据集、编码规则与评测环境的组合；20 合同覆盖裸声韵、单字含辅和多种二字词含辅场景，保证方案在相同输入条件下比较。
[^hf]: HF 是指定单字与词组合同中含辅码主行占比的较小值，用于约束较差场景而非只看平均值。
[^mx34]: [macroxue/shuangpin](https://github.com/macroxue/shuangpin) 的 moving-hand 模型逐键跟踪双手位置；MX34 在原生 30 键模型上扩展 `[ ] \\ '` 四键，分数越高越好，不含形辅、空格或选重。
