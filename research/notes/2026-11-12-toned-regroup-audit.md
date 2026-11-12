# 无声调例外的统一韵组重分配：严格 QZ、D≤2、M 不增加

用户要求重新定义韵组成员，所有调区一致遵守新分组，再寻找合适的整组键位；不把原火星十组作为不可更改的规则。本轮与前一轮“单调区韵母例外”分开评估。

## 计费依据与搜索范围

现有 `tools/search_toned_2121_mars10_uneven_regions.js` 中，原火星韵侧计费为：去介音规则 1 + 多根韵组规则 6（lower）或合并关联 8（guard），再加三调区合并成本 9。原完整基线为 `4 + 1 + 6 + 9 = 20`，另加普通声母和零声母的移位成本。

本轮从语料分解表导出18个基础根组，`i/u/ü` 独立保留；不改变去介音规则。每个基础根组成员始终整体移动，并在三个调区使用相同的韵组归属。保留10个非空组。

```text
M_lower = 4 + firstMemoryDelta + 1 + 多根组数量 + Σ调区(10 - 使用键数)
M_guard = 4 + firstMemoryDelta + 1 + Σ组(根组数 - 1) + Σ调区(10 - 使用键数)
```

这是沿用仓库现有 provisional rule-count 口径的结构计费，不是对实际学习难度的心理测量。更复杂或不自然的组合法即使 M 相同，也未必同样易学。每个候选同时检查不超过其起点的 M_lower/M_guard；不能把新分组的 M_guard 一律写成 M_lower+2。

18个根组：`a、ai、an、ang、ao、e、ei、en、eng、er、i、n、ng、o、ong、ou、u、ü`。其中 `n={in,ün}`，`ng={ing}`；`ong={ong,iong}`，`ou={ou,iu}`。a 包含 a/ia/ua，e 包含 e/ie/üe，o 包含 o/io/uo，其他成员见入围方案的 `rhymeGroups`。

固定合同：严格全1407音节 QZ 空桶、普通声母 D≤2/F=0、7:8:6 调区、Shape-only CKT v5.1、赛道权重1:3:1:1、词辅12/213/24。`shapeKeysByMeaning=AVUIO`、`toneKeysByTone=IVUAO`、`toneDigitsByShapeMeaning=42310`。不额外要求 ZQ 为空。

两个起点：旧 `MARS10-QZEMPTY-P3-D2-M24-05`（9.195219662663，M=24/26）与 `MARS10-QZEMPTY-P3-D1-M22-03`（9.208241037887，M=22/24）。两条路线均不增加自身预算。

## 已完成的重分组实验

第一阶段472个状态：2个基准、208个整体迁移、262个两根组互换。整体迁移有13个优于各自起点，7个超过旧D2冠军；两根组互换没有改善。耗时845.9秒。

第三阶段组合15个相容的有效迁移（另加2个基准）：全部15个优于各自起点，10个超过旧D2冠军。耗时12.0秒。有效根组主要为 er 与 ü，因此组合重点是这两个根组的联合重分配。

第二阶段194个状态：对两个声母起点分别挑选最佳分数及最佳省M重分组，测试改变过成员的组与其他组在每个调区换位，共188个实际换位、4个重分组起点及2个旧基准。耗时648.4秒。188个换位均未优于所依附的新分组起点；其中3个仍优于旧火星起点。

第四阶段82个状态：从最佳组合 G2-0004 出发，测试其四个受影响组与其他组的80个合法换位，另加新旧基准。耗时281.1秒。没有进一步改进；最好的换位为9.185436711639，仍差于不换位的9.180877784342。

合计 **765个候选状态**（含基准回放，不代表765种互异编码）。本轮268个定向整组换位没有额外收益；最终最佳方案仅改变组属即可实现改进。

| 方案 | 统一重分组（所有声调） | D | M_lower / guard | JS 全量 CKT |
|---|---|---:|---:|---:|
| 旧完整火星冠军 | 无 | 2 | 24 / 26 | 9.195219662663 |
| G0-0153 | er→an组 | 2 | 24 / 26 | 9.186191132889 |
| G0-0235 | ü→o/ong组 | 2 | 24 / 26 | 9.189800701582 |
| G0-0149 | er→a/ou组 | 2 | 23 / 26 | 9.190759716444 |
| **G2-0004** | **er→an组；ü→o/ong组** | **2** | **24 / 26** | **9.180877784342** |
| G2-0002 | er→a/ou组；ü→o/ong组 | 2 | 23 / 26 | 9.185321868038 |
| G2-0013 | er→an组；ü→o/ong组 | 1 | 22 / 24 | 9.197152226232 |
| G2-0012 | er→a/ou组；ü→o/ong组 | 1 | 21 / 24 | 9.201685941418 |

G2-0004 比旧冠军降低0.014341878322（约0.1560%）。和前轮1条声调例外的9.180835779827仅差0.000042004514；和前轮2条例外、D1/M24的9.179060736207差0.001817048134。分数差别小，但分组规则和D不同，不能把这些方案说成完全等价。

## G2-0004 完整声韵布局

普通声母仅 `l→E、p→S`；其余保持字母本位。特殊族为 `zh=L、ch=K、sh=P、zero-A=N、zero-E=C、zero-O=R、zero-Y=Y、zero-W=W`。这与旧D2/M24冠军一致。

下表用常见写法：`iu=iou、ui=uei、un=uen、ü=v、ün=vn、üan=van、üe=ve`。所有行的成员在三个调区一致，没有例外。

| 韵组成员 | 四声（上排） | 二/三声（中排） | 一声/轻声（下排） |
|---|---|---|---|
| a、ia、ua、ou、iu | E | S | X |
| en、in、un、ün | T | L | N |
| e、ie、üe、ei、ui | W | D | M |
| eng、ing、ueng、ai、uai | P | G | C |
| an、ian、uan、üan、**er** | Q | K | M |
| ang、iang、uang | Y | J | C |
| u | E | H | Z |
| i | R | F | B |
| o、io、uo、ong、iong、**ü** | Y | L | N |
| ao、iao | T | H | B |

新的六个多根组为 `{a,ou}、{en,n}、{e,ei}、{eng,ng,ai}、{an,er}、{o,ong,ü}`；其余四组单根。与原分组比较，er离开i使一条合并规则消失，加入an又形成一条，净变化0；ü从已有多根组迁入另一个已有多根组，规则数量也不变。18根仍为10组，关联数仍为8。

JS分项有效耗时：单字169.052190ms、二字词446.651974ms、三字词545.942599ms、四字词511.463586ms。主要改善来自单字和二字词；综合CKT百分比不等于实际打字速度百分比。

## 复现与验证

```powershell
just ckt-v51-toned-regroup
just ckt-v51-toned-regroup-refine
just ckt-v51-toned-regroup-combine
just ckt-v51-toned-regroup-combine-refine
python -m unittest discover -s tests -p 'test_toned_rhyme*.py'
```

需要已有本地R11 HTML、语料与fixture；缺少时先用 `just ckt-v51-toned-mars10-rust-prepare`。没有改动生产布局。

验证包括6项Python测试（含此前邻域的回归检查）、3项辅助键语义测试；四阶段全部765个候选另行重算根组覆盖、跨调区组属、M_lower及M_guard。入围方案均独立JS全量复算并再次检查1407合法音节的QZ空桶。第一阶段12个、第二阶段9个、第三阶段8个、第四阶段5个入围方案均保存完整编码；四阶段Rust/JS误差均不超过1.4e-12。

- [统一重分组结果](2026-11-12-toned-regroup-results.json)、[完整入围布局](2026-11-12-toned-regroup-finalists.json)、[独立JS复算](2026-11-12-toned-regroup-js-verify.json)
- [迁移组合结果](2026-11-12-toned-regroup-combine-results.json)、[完整组合布局](2026-11-12-toned-regroup-combine-finalists.json)、[独立JS复算](2026-11-12-toned-regroup-combine-js-verify.json)
- [单迁移后换位结果](2026-11-12-toned-regroup-refine-results.json)、[完整布局](2026-11-12-toned-regroup-refine-finalists.json)、[JS复算](2026-11-12-toned-regroup-refine-js-verify.json)
- [双迁移后换位结果](2026-11-12-toned-regroup-combine-refine-results.json)、[完整布局](2026-11-12-toned-regroup-combine-refine-finalists.json)、[JS复算](2026-11-12-toned-regroup-combine-refine-js-verify.json)
- [搜索生成器](../../tools/search_toned_rhyme_regroup.py)、[分组/计费/编码检查](../../tests/test_toned_rhyme_regroup.py)

本轮尚未穷举任意多步重分组、所有韵组数或重分组与声母的联合优化。ong/iong 仅为18个单位之一，已与其他单位一样参与整体迁移/互换；固定原键位时，涉及它的最佳候选是与 n={in,ün} 交换，9.210124212883，未超过旧冠军。该结果不能证明 ong/iong 在其他重分组与键位组合下没有价值。
