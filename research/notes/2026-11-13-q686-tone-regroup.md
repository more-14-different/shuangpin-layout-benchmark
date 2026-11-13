# Q空韵6:8:6：重分组与上下排声调互换

固定QR1-0324声母布局，D2；M_lower≤23、M_guard≤25；Q仅用于声母，第二码禁Q。每个韵根的成员整体迁移，不添加韵母声调例外。两条路线键域均为WERTYP / SDFGHJKL / ZXCBNM。不额外约束QZ；ZQ因第二码禁Q而自动为空。

原调区：上排四声、中排二三声、下排一声与轻声。互换调区：上排一声与轻声、中排二三声、下排四声。只改变主码声调区；形辅shapeKeysByMeaning=AVUIO、toneKeysByTone=IVUAO及词辅12/213/24不变。

| 轮次 | 算子 | 上/下调区 | 评分数 | 最低CKT |
|---|---|---|---:|---:|
| q686-keep | root,key,erv | [4]/[1, 5] | 544 | 9.252483591 |
| q686-swap | root,key,erv | [1, 5]/[4] | 544 | 9.475605428 |
| q686-keep-r1 | root,key,erv,coupled | [4]/[1, 5] | 1205 | 9.243445752 |
| q686-swap-r1 | root,key,erv,coupled | [1, 5]/[4] | 1207 | 9.432377683 |

共评分3500次，按实际调区和完整布局去重后3498个。有限起点与邻域搜索不构成全局最优证明。

原调区最低CKT：QK1-0048，9.243445752；含标点移手124.531208。
互换调区最低CKT：QS1-0614，9.432377683；含标点移手120.276229。

四个值得保留的原调区分支，都先从QR1-0324将en/in/uen/vn组的四声键T改为P，随后分别做以下操作（各分支独立，不是逐项叠加）：

- QK1-0048：ü整体并入en/in/uen/vn组；本轮最低CKT，但移手低于原Q空韵基线。
- QK1-0009：er并入a/ou组，ü并入o/ong组；M下界降到22，guard仍为25。
- QK1-0434：en/in/uen/vn与ao/iao组交换中排K/H；CKT、移手和四轨左小指峰值均优于原Q空韵基线。
- QK1-0276：ing整体并入o/ong组；移手127.238509，CKT略优于原Q空韵基线，四轨左小指峰值略高。

原调区最优CKT仍高于生产M21；本轮没有同时胜过生产方案全部指标的候选。上下排各6键只表示键数相等，键位成本、声调频率和碰撞组合并不相等。互换路线尚未尝试任意大范围重排，当前结果只支持优先继续原调区路线。

移手分采用rime-snow-pinyin README的日常纯双拼含标点口径；表中左小指负荷是按键占比，不是独立压力模型得分。

| ID | 上排声调 | D/F | M下界/guard | CKT v5.1↓ | 含标点移手↑ | 左小指四轨峰值↓ | 日常左小指↓ | 占桶 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| SNOW-JIANDAO-TONED | [4] | 1/0 | 21/23 | 9.203609845 | 122.778429 | 10.809% | 7.120% | 427 |
| QK0-0326 | [4] | 2/0 | 23/25 | 9.252483591 | 125.135010 | 9.120% | 4.979% | 408 |
| QK0-0325 | [4] | 2/0 | 23/25 | 9.258056180 | 124.775205 | 9.117% | 4.979% | 408 |
| QK0-0220 | [4] | 2/0 | 22/25 | 9.260571808 | 125.101293 | 9.126% | 4.979% | 408 |
| QK0-0000 | [4] | 2/0 | 23/25 | 9.266244342 | 125.101654 | 9.123% | 4.979% | 408 |
| QK0-0286 | [4] | 2/0 | 22/25 | 9.271990974 | 126.016315 | 9.037% | 4.979% | 408 |
| QS0-0530 | [1, 5] | 2/0 | 23/25 | 9.475605428 | 122.280162 | 8.979% | 5.863% | 409 |
| QS0-0520 | [1, 5] | 2/0 | 23/25 | 9.494834921 | 120.138035 | 8.979% | 5.863% | 409 |
| QS0-0009 | [1, 5] | 2/0 | 22/25 | 9.543625932 | 122.233526 | 8.979% | 5.910% | 409 |
| QS0-0000 | [1, 5] | 2/0 | 23/25 | 9.556058113 | 121.837883 | 8.979% | 5.863% | 409 |
| QK1-0048 | [4] | 2/0 | 23/25 | 9.243445752 | 124.531208 | 9.114% | 4.979% | 408 |
| QK1-0051 | [4] | 2/0 | 23/25 | 9.243515319 | 124.447528 | 9.105% | 4.979% | 408 |
| QK1-0009 | [4] | 2/0 | 22/25 | 9.245309125 | 124.420300 | 9.105% | 4.979% | 408 |
| QK1-0434 | [4] | 2/0 | 23/25 | 9.247729150 | 125.456619 | 9.100% | 4.979% | 408 |
| QK1-0000 | [4] | 2/0 | 23/25 | 9.252483591 | 125.135010 | 9.120% | 4.979% | 408 |
| QK1-0276 | [4] | 2/0 | 23/25 | 9.261595033 | 127.238509 | 9.126% | 4.979% | 408 |
| QS1-0614 | [1, 5] | 2/0 | 23/25 | 9.432377683 | 120.276229 | 8.979% | 7.073% | 409 |
| QS1-0170 | [1, 5] | 2/0 | 23/25 | 9.437194451 | 120.093944 | 8.979% | 6.189% | 410 |
| QS1-0576 | [1, 5] | 2/0 | 23/25 | 9.438549869 | 123.633355 | 8.979% | 6.282% | 407 |
| QS1-0271 | [1, 5] | 2/0 | 23/25 | 9.449746197 | 124.596345 | 8.979% | 5.863% | 409 |
| QS1-0009 | [1, 5] | 2/0 | 22/25 | 9.464461744 | 122.385380 | 8.979% | 5.910% | 409 |
| QS1-0000 | [1, 5] | 2/0 | 23/25 | 9.475605428 | 122.280162 | 8.979% | 5.863% | 409 |

Q空韵候选可用容量420；生产M21为441。独立JS重算核对Rust分数误差小于1e-9。原调区和互换调区使用相同合法音节清单；交换调区后，合法音节碰撞组合可能改变，不能沿用原桶计数。

## QK0-0326

upper slot 1 -> P

| 韵母（v=ü） | 上排[4] | 中排[3, 2] | 下排[1, 5] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | P | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QK0-0325

upper slot 1 -> Y

| 韵母（v=ü） | 上排[4] | 中排[3, 2] | 下排[1, 5] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | Y | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QK0-0220

en -> slot 8

| 韵母（v=ü） | 上排[4] | 中排[3, 2] | 下排[1, 5] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| in / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| en / uen / io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QK0-0000

unchanged seed QR1-0324

| 韵母（v=ü） | 上排[4] | 中排[3, 2] | 下排[1, 5] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QK0-0286

o -> slot 5

| 韵母（v=ü） | 上排[4] | 中排[3, 2] | 下排[1, 5] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er / io / o / uo | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| iong / ong | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QS0-0530

lower slots 4 <-> 5

| 韵母（v=ü） | 上排[1, 5] | 中排[3, 2] | 下排[4] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | X |
| ang / iang / uang / er | Y | J | M |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QS0-0520

lower slots 2 <-> 5

| 韵母（v=ü） | 上排[1, 5] | 中排[3, 2] | 下排[4] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | X |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er | Y | J | M |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QS0-0009

er -> slot 0; v -> slot 8

| 韵母（v=ü） | 上排[1, 5] | 中排[3, 2] | 下排[4] |
|---|---|---|---|
| a / ia / iou / ou / ua / er | E | S | Z |
| en / in / uen / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| v / io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QS0-0000

unchanged seed QR1-0324

| 韵母（v=ü） | 上排[1, 5] | 中排[3, 2] | 下排[4] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QK1-0048

er -> slot 5; v -> slot 1

| 韵母（v=ü） | 上排[4] | 中排[3, 2] | 下排[1, 5] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn / v | P | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QK1-0051

er -> slot 5; v -> slot 8

| 韵母（v=ü） | 上排[4] | 中排[3, 2] | 下排[1, 5] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | P | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| v / io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QK1-0009

er -> slot 0; v -> slot 8

| 韵母（v=ü） | 上排[4] | 中排[3, 2] | 下排[1, 5] |
|---|---|---|---|
| a / ia / iou / ou / ua / er | E | S | Z |
| en / in / uen / vn | P | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| v / io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QK1-0434

home slots 1 <-> 9

| 韵母（v=ü） | 上排[4] | 中排[3, 2] | 下排[1, 5] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | P | H | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | K | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QK1-0000

unchanged seed QK0-0326

| 韵母（v=ü） | 上排[4] | 中排[3, 2] | 下排[1, 5] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | P | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QK1-0276

ng -> slot 8

| 韵母（v=ü） | 上排[4] | 中排[3, 2] | 下排[1, 5] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | P | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | M |
| ang / iang / uang / er | Y | J | X |
| u | E | H | N |
| i | R | F | B |
| ing / io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QS1-0614

ai -> slot 0; upper slots 0 <-> 3

| 韵母（v=ü） | 上排[1, 5] | 中排[3, 2] | 下排[4] |
|---|---|---|---|
| a / ia / iou / ou / ua / ai / uai | P | S | Z |
| en / in / uen / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| eng / ing / ueng / v | E | G | C |
| an / ian / uan / van | T | L | X |
| ang / iang / uang / er | Y | J | M |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QS1-0170

ao <-> ou

| 韵母（v=ü） | 上排[1, 5] | 中排[3, 2] | 下排[4] |
|---|---|---|---|
| a / ia / ua / ao / iao | E | S | Z |
| en / in / uen / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | X |
| ang / iang / uang / er | Y | J | M |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| iou / ou | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QS1-0576

a <-> ao; upper slots 0 <-> 9

| 韵母（v=ü） | 上排[1, 5] | 中排[3, 2] | 下排[4] |
|---|---|---|---|
| iou / ou / ao / iao | R | S | Z |
| en / in / uen / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | X |
| ang / iang / uang / er | Y | J | M |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| a / ia / ua | E | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QS1-0271

n <-> v

| 韵母（v=ü） | 上排[1, 5] | 中排[3, 2] | 下排[4] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / uen / v | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| in / vn / ai / eng / ing / uai / ueng | P | G | C |
| an / ian / uan / van | T | L | X |
| ang / iang / uang / er | Y | J | M |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QS1-0009

er -> slot 0; v -> slot 8

| 韵母（v=ü） | 上排[1, 5] | 中排[3, 2] | 下排[4] |
|---|---|---|---|
| a / ia / iou / ou / ua / er | E | S | Z |
| en / in / uen / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng | P | G | C |
| an / ian / uan / van | T | L | X |
| ang / iang / uang | Y | J | M |
| u | E | H | N |
| i | R | F | B |
| v / io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

## QS1-0000

unchanged seed QS0-0530

| 韵母（v=ü） | 上排[1, 5] | 中排[3, 2] | 下排[4] |
|---|---|---|---|
| a / ia / iou / ou / ua | E | S | Z |
| en / in / uen / vn | T | K | N |
| e / ei / ie / uei / ve | W | D | M |
| ai / eng / ing / uai / ueng / v | P | G | C |
| an / ian / uan / van | T | L | X |
| ang / iang / uang / er | Y | J | M |
| u | E | H | N |
| i | R | F | B |
| io / iong / o / ong / uo | Y | K | N |
| ao / iao | R | H | C |

首键：b→B；c→C；ch→S；d→D；f→F；g→G；h→H；j→J；k→K；l→L；m→M；n→N；p→K；q→Q；r→R；s→N；sh→P；t→T；x→X；z→Z；zero-A→R；zero-E→R；zero-O→R；zero-W→W；zero-Y→Y；zh→E

[完整审计](2026-11-13-q686-tone-regroup-audit.json)；[完整benchmark](2026-11-13-q686-tone-regroup-benchmark.json)。
