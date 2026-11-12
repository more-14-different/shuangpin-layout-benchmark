# 新韵组重分配＋QZ/ZQ双空：低D/M搜索

本轮最佳 `DZ4-0185`：CKT v5.1 **9.249159206**，D=2、M_lower/M_guard=22/25。相对原双空D2/M23的9.267572619降低**0.199%**；仍比非双空生产M21的9.203609845高0.495%。

共评分5145次，去重后5131个布局。本轮始终保持D≤2、M_lower≤23，未放宽预算。

主预算为普通声母D≤2、M_lower≤23，F=0，不设韵母声调例外。保持18个韵根、10个非空组；各根的全部韵母一起迁移，组成员不随声调变化。例如ong/iong始终属于同一个韵根。此搜索不是任意分组空间的全局最优证明。

M_lower=5＋首键位移成本＋多韵根组数＋各声调区(10−使用键数)之和；M_guard将多韵根组数替换为组内合并链接数（18−10=8）。M_guard另列，不假设恒等于M_lower＋2。

评分沿用CKT v5.1、12/213/24、1:3:1:1、AVUIO形辅（shapeKeysByMeaning）、IVUAO声调映射（toneKeysByTone）。Python生成时和Rust评分时均检查1407合法音节的QZ/ZQ；代表方案再由JS独立重算。

## 搜索轮次

| 轮次 | 算子 | D/M上限 | 评分数 | 最优ID | CKT v5.1 | M下界/guard |
|---|---|---:|---:|---|---:|---:|
| dual-regroup-r0 | root | 2/23 | 230 | DZ0-0150 | 9.263759507 | 22/25 |
| dual-regroup-low | root | 2/23 | 494 | DZL-0406 | 9.295440575 | 22/24 |
| dual-regroup-coupled | key,first,coupled | 2/23 | 959 | DZC-0193 | 9.263583296 | 23/25 |
| dual-regroup-r1 | root,key,first | 2/23 | 692 | DZ1-0489 | 9.259782384 | 22/25 |
| dual-regroup-r2 | root,key,first | 2/23 | 698 | DZ2-0233 | 9.257070873 | 22/25 |
| dual-regroup-r3 | root,key,first | 2/23 | 688 | DZ3-0231 | 9.250964104 | 22/25 |
| dual-regroup-r4 | root,key,first | 2/23 | 1384 | DZ4-0185 | 9.249159206 | 22/25 |

轮次评分数包括每轮保留的基线，不能直接当作全程独立布局数。root为根迁移/互换，key为组键迁移/互换，first为整个声母组件迁移，coupled为根迁移/互换与两受影响组的换键联动。

## 统一benchmark

移手分采用rime-snow-pinyin README中的“日常纯双拼移动手分数（含标点）”：同一日常八场景文稿2149击键，不含形辅、空格和选重，越高越好。

| ID | D/F | M下界/guard | CKT v5.1↓ | CKT v5↓ | 占桶/441 | 占比 | 日常含标点移手分↑ | 最大单指峰值 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| SNOW-JIANDAO-TONED | 1/0 | 21/23 | 9.203609845 | 9.199739583 | 427/441 | 96.83% | 122.778429 | 28.445% |
| MARS10-QZZQEMPTY-P3-D2-M23-04 | 2/0 | 23/25 | 9.267572619 | 9.264319911 | 412/441 | 93.42% | 124.924835 | 28.121% |
| DZ0-0150 | 2/0 | 22/25 | 9.263759507 | 9.260502778 | 411/441 | 93.20% | 125.088673 | 28.160% |
| DZL-0406 | 2/0 | 22/24 | 9.295440575 | 9.292677390 | 407/441 | 92.29% | 126.190280 | 26.492% |
| DZC-0193 | 2/0 | 23/25 | 9.263583296 | 9.260326381 | 411/441 | 93.20% | 121.047463 | 27.234% |
| DZ1-0489 | 2/0 | 22/25 | 9.259782384 | 9.256521454 | 410/441 | 92.97% | 121.201282 | 27.272% |
| DZ2-0233 | 2/0 | 22/25 | 9.257070873 | 9.253807075 | 410/441 | 92.97% | 120.595439 | 28.097% |
| DZ3-0231 | 2/0 | 22/25 | 9.250964104 | 9.247693834 | 408/441 | 92.52% | 120.554320 | 28.100% |
| DZ4-0185 | 2/0 | 22/25 | 9.249159206 | 9.245887019 | 408/441 | 92.52% | 120.573962 | 27.378% |
| DZ4-0532 | 1/0 | 21/24 | 9.339204938 | 9.337118680 | 408/441 | 92.52% | 120.167013 | 28.079% |
| DZL-0242 | 1/0 | 22/24 | 9.336022595 | 9.334383100 | 414/441 | 93.88% | 124.008920 | 26.151% |
| DZ4-0821 | 2/0 | 21/25 | 9.255107332 | 9.251841455 | 407/441 | 92.29% | 120.077314 | 27.592% |

生产M21仍为QZ含qia1/qiu1、ZQ含zan4/zuan4的对照；其他本报告代表方案均双空。搜索结果未替换生产布局。

## CKT v5.1四轨有效耗时

| ID | 单字ms | 二字ms | 三字ms | 四字ms | 加权选重率 | 平均码长 |
|---|---:|---:|---:|---:|---:|---:|
| SNOW-JIANDAO-TONED | 169.805 | 446.919 | 548.291 | 513.770 | 0.2163% | 3.773386 |
| MARS10-QZZQEMPTY-P3-D2-M23-04 | 170.565 | 449.042 | 553.019 | 520.549 | 0.2315% | 3.780992 |
| DZ0-0150 | 170.391 | 448.768 | 553.019 | 520.630 | 0.2316% | 3.781045 |
| DZL-0406 | 172.475 | 448.899 | 557.614 | 520.955 | 0.2374% | 3.786328 |
| DZC-0193 | 169.580 | 449.198 | 553.019 | 520.961 | 0.2265% | 3.780480 |
| DZ1-0489 | 169.406 | 448.923 | 553.019 | 521.043 | 0.2266% | 3.780533 |
| DZ2-0233 | 169.380 | 448.570 | 553.019 | 521.387 | 0.2272% | 3.780693 |
| DZ3-0231 | 169.148 | 447.623 | 553.019 | 522.983 | 0.2312% | 3.781406 |
| DZ4-0185 | 169.279 | 447.650 | 553.019 | 522.083 | 0.2317% | 3.780944 |
| DZ4-0532 | 170.364 | 449.847 | 562.693 | 530.928 | 0.2578% | 3.790334 |
| DZL-0242 | 173.249 | 449.419 | 562.710 | 525.112 | 0.2616% | 3.791473 |
| DZ4-0821 | 170.095 | 447.921 | 553.019 | 521.296 | 0.2324% | 3.781276 |

## DZ0-0150 声韵布局

首键：b→B；c→C；ch→K；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→S；q→Q；r→R；s→S；sh→P；t→T；x→X；z→C；zero-A→R；zero-E→Z；zero-O→R；zero-W→W；zero-Y→Y；zh→E。

| 组 | 全部韵母（v表示ü） | 四声/上排 | 二三声/中排 | 一声轻声/下排 |
|---|---|---|---|---|
| 0 | a / ia / iou / ou / ua | E | S | X |
| 1 | en / in / uen / vn | T | L | N |
| 2 | e / ei / ie / uei / ve | W | D | M |
| 3 | ai / eng / ing / uai / ueng / v | P | G | C |
| 4 | an / ian / uan / van | Q | K | M |
| 5 | ang / iang / uang | Y | J | B |
| 6 | u | E | H | Z |
| 7 | i | R | F | B |
| 8 | er / io / iong / o / ong / uo | Y | L | N |
| 9 | ao / iao | T | H | C |

## DZL-0406 声韵布局

首键：b→B；c→C；ch→K；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→C；q→Q；r→R；s→S；sh→P；t→T；x→X；z→S；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E。

| 组 | 全部韵母（v表示ü） | 四声/上排 | 二三声/中排 | 一声轻声/下排 |
|---|---|---|---|---|
| 0 | a / ia / iou / ou / ua | T | S | X |
| 1 | en / in / uen / vn | R | L | N |
| 2 | e / ei / ie / uei / ve | W | D | B |
| 3 | ai / eng / ing / uai / ueng / v | P | G | C |
| 4 | an / ian / uan / van | Q | K | M |
| 5 | ang / iang / uang / er | E | J | M |
| 6 | u | Y | H | Z |
| 7 | i | R | F | B |
| 8 | io / iong / o / ong / uo | E | L | N |
| 9 | ao / iao | Y | H | C |

## DZC-0193 声韵布局

首键：b→B；c→C；ch→K；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→S；q→Q；r→R；s→S；sh→P；t→T；x→X；z→C；zero-A→R；zero-E→Z；zero-O→R；zero-W→W；zero-Y→Y；zh→E。

| 组 | 全部韵母（v表示ü） | 四声/上排 | 二三声/中排 | 一声轻声/下排 |
|---|---|---|---|---|
| 0 | a / ia / iou / ou / ua | E | S | X |
| 1 | en / in / uen / vn | T | L | N |
| 2 | e / ei / ie / uei / ve | W | D | B |
| 3 | ai / eng / ing / uai / ueng / v | P | G | C |
| 4 | an / ian / uan / van | Q | K | M |
| 5 | ang / iang / uang | Y | J | M |
| 6 | u | E | H | Z |
| 7 | er / i | R | F | B |
| 8 | io / iong / o / ong / uo | Y | L | N |
| 9 | ao / iao | T | H | C |

## DZ1-0489 声韵布局

首键：b→B；c→C；ch→K；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→S；q→Q；r→R；s→S；sh→P；t→T；x→X；z→C；zero-A→R；zero-E→Z；zero-O→R；zero-W→W；zero-Y→Y；zh→E。

| 组 | 全部韵母（v表示ü） | 四声/上排 | 二三声/中排 | 一声轻声/下排 |
|---|---|---|---|---|
| 0 | a / ia / iou / ou / ua | E | S | X |
| 1 | en / in / uen / vn | T | L | N |
| 2 | e / ei / ie / uei / ve | W | D | B |
| 3 | ai / eng / ing / uai / ueng / v | P | G | C |
| 4 | an / ian / uan / van | Q | K | M |
| 5 | ang / iang / uang | Y | J | M |
| 6 | u | E | H | Z |
| 7 | i | R | F | B |
| 8 | er / io / iong / o / ong / uo | Y | L | N |
| 9 | ao / iao | T | H | C |

## DZ2-0233 声韵布局

首键：b→B；c→C；ch→K；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→S；q→Q；r→R；s→S；sh→P；t→T；x→X；z→C；zero-A→R；zero-E→Z；zero-O→R；zero-W→W；zero-Y→Y；zh→E。

| 组 | 全部韵母（v表示ü） | 四声/上排 | 二三声/中排 | 一声轻声/下排 |
|---|---|---|---|---|
| 0 | a / ia / iou / ou / ua | E | S | X |
| 1 | en / in / uen / vn | T | L | N |
| 2 | e / ei / ie / uei / ve | W | D | B |
| 3 | ai / eng / ing / uai / ueng | P | G | C |
| 4 | an / ian / uan / van | Q | K | M |
| 5 | ang / iang / uang | Y | J | M |
| 6 | u | E | H | Z |
| 7 | i | R | F | B |
| 8 | v / er / io / iong / o / ong / uo | Y | L | N |
| 9 | ao / iao | T | H | C |

## DZ3-0231 声韵布局

首键：b→B；c→C；ch→K；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→S；q→Q；r→R；s→S；sh→P；t→T；x→X；z→C；zero-A→R；zero-E→Z；zero-O→R；zero-W→W；zero-Y→Y；zh→E。

| 组 | 全部韵母（v表示ü） | 四声/上排 | 二三声/中排 | 一声轻声/下排 |
|---|---|---|---|---|
| 0 | a / ia / iou / ou / ua | E | S | X |
| 1 | en / in / uen / vn | P | L | N |
| 2 | e / ei / ie / uei / ve | W | D | B |
| 3 | ai / eng / ing / uai / ueng | P | G | C |
| 4 | an / ian / uan / van | Q | K | M |
| 5 | ang / iang / uang | Y | J | M |
| 6 | u | E | H | Z |
| 7 | i | R | F | B |
| 8 | v / er / io / iong / o / ong / uo | Y | L | N |
| 9 | ao / iao | T | H | C |

## DZ4-0185 声韵布局

首键：b→B；c→C；ch→K；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→S；q→Q；r→R；s→S；sh→P；t→T；x→X；z→C；zero-A→R；zero-E→Z；zero-O→R；zero-W→W；zero-Y→Y；zh→E。

| 组 | 全部韵母（v表示ü） | 四声/上排 | 二三声/中排 | 一声轻声/下排 |
|---|---|---|---|---|
| 0 | a / ia / iou / ou / ua | E | S | X |
| 1 | en / uen / v | P | L | N |
| 2 | e / ei / ie / uei / ve | W | D | B |
| 3 | ai / eng / ing / uai / ueng | P | G | C |
| 4 | an / ian / uan / van | Q | K | M |
| 5 | ang / iang / uang | Y | J | M |
| 6 | u | E | H | Z |
| 7 | i | R | F | B |
| 8 | in / vn / er / io / iong / o / ong / uo | Y | L | N |
| 9 | ao / iao | T | H | C |

## DZ4-0532 声韵布局

首键：b→B；c→C；ch→K；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→P；q→Q；r→R；s→S；sh→P；t→T；x→X；z→C；zero-A→R；zero-E→Z；zero-O→R；zero-W→W；zero-Y→Y；zh→E。

| 组 | 全部韵母（v表示ü） | 四声/上排 | 二三声/中排 | 一声轻声/下排 |
|---|---|---|---|---|
| 0 | a / ia / iou / ou / ua | E | S | X |
| 1 | en / in / uen / vn | P | L | N |
| 2 | e / ei / ie / uei / ve | W | D | B |
| 3 | ai / eng / ing / uai / ueng | P | G | C |
| 4 | an / ian / uan / van | Q | K | M |
| 5 | ang / iang / uang | Y | J | M |
| 6 | u | E | H | Z |
| 7 | i | R | F | B |
| 8 | v / er / io / iong / o / ong / uo | Y | L | N |
| 9 | ao / iao | T | H | C |

## DZL-0242 声韵布局

首键：b→B；c→C；ch→K；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→P；q→Q；r→R；s→S；sh→P；t→T；x→X；z→S；zero-A→R；zero-E→Z；zero-O→R；zero-W→W；zero-Y→Y；zh→E。

| 组 | 全部韵母（v表示ü） | 四声/上排 | 二三声/中排 | 一声轻声/下排 |
|---|---|---|---|---|
| 0 | a / ia / iou / ou / ua | T | S | X |
| 1 | en / in / uen / vn | R | L | N |
| 2 | e / ei / ie / uei / ve | W | D | B |
| 3 | ai / eng / ing / uai / ueng | P | G | C |
| 4 | an / ian / uan / van | Q | K | M |
| 5 | ang / iang / uang | E | J | M |
| 6 | u | Y | H | Z |
| 7 | er / i | R | F | B |
| 8 | v / io / iong / o / ong / uo | E | L | N |
| 9 | ao / iao | Y | H | C |

## DZ4-0821 声韵布局

首键：b→B；c→C；ch→K；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→S；q→Q；r→R；s→S；sh→P；t→T；x→X；z→C；zero-A→R；zero-E→Z；zero-O→R；zero-W→W；zero-Y→Y；zh→E。

| 组 | 全部韵母（v表示ü） | 四声/上排 | 二三声/中排 | 一声轻声/下排 |
|---|---|---|---|---|
| 0 | a / ia / iou / ou / ua | E | S | X |
| 1 | v | T | L | N |
| 2 | e / ei / ie / uei / ve | W | D | B |
| 3 | ai / eng / ing / uai / ueng | P | G | C |
| 4 | an / ian / uan / van | Q | K | M |
| 5 | ang / iang / uang | Y | J | M |
| 6 | u | E | H | Z |
| 7 | i | R | F | B |
| 8 | en / in / uen / vn / er / io / iong / o / ong / uo | Y | L | N |
| 9 | ao / iao | T | H | C |

## 复现与数据

每轮完整算子、起点与预算存于对应results.json的searchArguments；先按其参数生成job，再用tools/run_toned_neighbor_shards.py评分。justfile提供初始轮与后继轮配方。

- [代表布局与全部1407编码](2026-11-12-toned-dual-regroup-finalists.json)
- [完整benchmark](2026-11-12-toned-dual-regroup-benchmark.json)
- [轮次摘要](2026-11-12-toned-dual-regroup-history.json)
