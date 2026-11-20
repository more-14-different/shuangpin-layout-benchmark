# UM40 固定声母带调韵侧探索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 固定三个UM40共同的声母布局，优化21×26带调韵侧，比较默认和统一加倍成本是否能超过R2。

**Architecture:** 复用完整CKT5.2评分、18完整根韵/10组及10/9/7行模型。固定所有普通、卷舌及零声母。多个已审计韵侧作为起点，完整单步下降与有限二步探索，最终独立JS复算。

**Tech Stack:** Python/NumPy/Numba，既有Node原生评分器，Windows PowerShell。

**Spec:** 用户已确认“借用UM40声母，优化带调韵侧”，与本计划关联的对话约束如下。

## Global Constraints

- UM40三项声母必须逐项一致，固定原始initialMap；Y/YU统一S，A/E/O统一Y，W→J，zh→W；不把无调韵表直接充当带调韵表。
- 上二三/中四/下一轻、实际首键21、韵键10/9/7；18完整根韵分10非空组，可迁移/互换根韵与改变行键映射。
- 固定声母D=3，不继承原A的多根组数上限；18根韵/10非空组自然上界M≤22/22，报告实际M，不冒充R2的18/21、D2。
- 左右小指不设门槛；只记录。shapeKeysByMeaning=AEUIO，toneKeysByTone=IEUAO，不变量42310。
- 默认门槛8.640932204060537，加倍门槛8.234488645251973；S005同成本点重算，四轨1:3:1:1。
- 不改HTML、不部署；完整评分与搜索范围可复核，不宣称全局最优。

## Review Focus

- 三个原无调方案实际为同一声母，不能重复声称三套独立搜索。
- Y/YU到zero-Y的边界与所有1407音节首码必须一致。
- 每个合法终点均要满足实际行键覆盖，模型映射满域不能替代覆盖核查。
- 1×/2×各用自己目标辅序，最终同时列21/12/23固定辅序对照及144最优。
- 收敛只能针对已枚举单步/有限二步；不能把筛选候选或局部最优当全局结论。

### Task 1: 锁定输入与边界

- [x] tests/test_toned_2126_um40.py先写三者一致、首码固定、D3及行覆盖测试，确认新模块不存在时失败。
- [x] research/config/toned-2126-um40-initials.json冻结原三项initialMap及SHA256；tools/search_toned_2126_um40.py实现固定Context与韵侧邻域。
- [x] 运行边界测试，独立确认首码与原UM40音节映射一致。

### Task 2: 搜索与评分归档

- [x] 多个已审计韵侧种子（原六代表、M4/R1/R2/C1）移植固定声母，逐一完整评分。
- [x] 默认/加倍目标从多起点完整单步最陡下降；跨目标共享已评分档案。
- [x] 从每个最终单步操作类型选完整分最佳第一跳，枚举第二跳；只挑选定义内中心，不声称两步穷举。
- [x] 再从档案最好终点单步下降，直到各目标完整单步闭合；完整分写入可恢复JSONL及分卷gzip。

### Task 3: 最终验证与报告

- [x] 各代表全144辅序，既有原生JS适配M≤20/22、D3及固定UM40首码，复算逐轨数据/每键负荷/M账。
- [x] 新测试核查完整邻域记录、固定首码、语义回环、参考与门槛；复用旧语义和CKT5.2测试。
- [x] 报告与R2在1×/2×下的差距、实际M/D、负担/加辅/选重；若不能胜出，说明有限探索边界。
- [x] 验证、提交、git swap auto、推送，核对GitHub/Gitee提交一致。
