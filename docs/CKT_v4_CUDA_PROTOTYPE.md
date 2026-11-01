# CKT v4 CUDA 全量解析原型

状态：实验性、默认不编译，已经以显式开关接入退火和 explorer。CPU 参考实现仍是唯一的回归真值；当前适合独立分支上的小型试验，不建议直接替换长期生产任务。

## 原型边界

CUDA 原型现在加速全量评分中的活动项构造、候选桶排序、阶段推进和逐行最优选择：

1. Rust 按当前布局生成约 28.96 万行模式记录；
2. `CudaResolvePlan` 将行、阶段、槽位和 order 索引拓扑一次上传并常驻显存；
3. 每个候选只扁平上传 code bits；
4. CUDA 根据设备端 active-stage 状态构造 `(lane, pool, code, row-priority)`，用排序和 segmented inclusive scan 求精确名次；
5. CUDA 按行选择最小 rank，推进未终止行，并把终止行的最小-rank code 压缩成 finalists；
6. Rust 只对 finalists 运行原有 `ProjectedMotor` tie-break，再用原有 `f64` 汇总和认知参数生成最终分数。

默认路径不在 GPU 上计算、比较或累加浮点评分，因此不会因 RTX 3070/4060 较弱的 FP64 吞吐改变 CKT v4 数值。保留的全槽位 cost A/B 路径也只比较 CPU 已算出的 `f64`。原型会逐个比较 CPU/GPU 的完整 `Outcome` 数组和 `Summary`，任一处不同即失败。

静态 `CudaResolvePlan` 保存只依赖语料行 ID、权重和阶段拓扑的优先级；同一模式的后续退火布局可复用。每次复用仍检查行契约，防止把计划用于不同语料或拓扑。GPU 结果可以直接初始化 `IncrementalResolver`，其 CPU 碰撞成员索引推迟到首次真正采用小增量路径时才构建。

## 本机首轮结果

测试设备为 RTX 4060 Laptop 8 GiB，不是目标机的 RTX 3070。CUDA 12.5，Windows WDDM。三种布局、Keytao/Sanpin 两个模式共比较 1,737,879 行，所有结果逐项一致。

| 指标 | 结果 |
|---|---:|
| CPU resolver 总耗时 | 5325.4 ms |
| CUDA resolver 总耗时（复用计划、已预热） | 1554.8 ms |
| resolver 加速 | 3.43× |
| 单模式 CUDA 内核/传输部分 | 11.9–27.8 ms |
| 单模式端到端 CUDA resolver | 187.1–299.1 ms |
| 单模式 CPU resolver | 725.2–1040.1 ms |
| 一次性计划构建 | 208.9–369.8 ms |

这里的 3.43× 只覆盖 `resolve`，不是完整退火步。语料生成仍需约 189–348 ms；人体工学诊断、SQLite、提案和休眠也没有移入 GPU。因此不能把 3.43× 直接当作整轮提速。

## 完整退火 A/B

使用同一个 21×26 强 CKT v4 种子、同一个随机种子和参数，运行 5 步且 5 次均进入全量重算；关闭周期抽查以免把 CPU 检查时间算入 GPU 路径。两条路径生成的 frontier 与 checkpoint 哈希完全相同。

| 指标 | CPU（惰性成员索引） | CUDA | 加速 |
|---|---:|---:|---:|
| 退火程序报告耗时 | 15.2 s | 11.3 s | 1.35× |
| 进程墙钟时间 | 19.096 s | 15.439 s | 1.24× |

这说明当前实现已经有端到端收益，但还不是“GPU 主导”：它仍按单候选、单模式、五阶段依次提交，且行生成与最终选择/汇总在 CPU 上。本机是 RTX 4060 Laptop 8 GiB、Windows WDDM；目标 RTX 3070 的收益必须在目标机复测，不能从桌面/移动型号名直接外推。

## 21×21 / 21×26 小批量成熟度轮

2026-10-18 分别从按 CKT v4 排序的 8 个强种子运行一个 generation，每链 6 步；每 2 步写 checkpoint，每 3 步以 CPU 全量真值核对。两轮均完成，所有链的 stderr 为空，SQLite `integrity_check` 为 `ok`，完成后原地复跑没有重复导入或改变数据库大小。

| 口径 | 链/步 | CUDA 全量 / CPU 增量 | 接受 | 无效尝试 | 归档状态 | 初始最佳 → 本轮最佳 |
|---|---:|---:|---:|---:|---:|---:|
| 21×21 | 8 / 48 | 47 / 1 | 13 | 3 | 56 | 9.557550040 → 9.523734378 |
| 21×26 | 8 / 48 | 48 / 0 | 12 | 10 | 56 | 9.015631865 → 9.008910816 |

规划器在两种口径中都产出 8 个下一代种子，覆盖本轮最佳 CKT、M、D、V、右小指、主行、移动手和稀疏新区域；两轮均没有触发疑似新盆地人工复核。21×21 最佳来自原 rank 2 种子的第 6 步，21×26 最佳来自原 rank 2 种子的第 4 步。

这轮确认了小批量搜索、CPU 精度抽查、checkpoint、SQLite 长期档案、幂等恢复与下一代选种可以连贯工作。runner 构建改为 quiet，避免 `cc` 对 Windows `nvcc` 家族探测的非故障警告污染无人值守日志；退火日志会明确记录 `full-backend=cuda` 或 `cpu`，便于事后审计。

## 运行

需要 NVIDIA 驱动、CUDA Toolkit、`nvcc` 和可用的 MSVC host compiler：

```powershell
just ckt-v4-cuda-benchmark
```

直接对一次退火启用 GPU 全量解析：

```powershell
cargo run --release --features cuda --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- <原有参数> --cuda-full
```

长期 explorer 在独立配置副本中设置：

```json
{
  "cudaFull": true,
  "cudaBatch": true,
  "cudaBatchWindowMs": 100
}
```

`tools/run_ckt_v4_explorer.ps1` 会自动带 `--features cuda` 构建并为每条链增加 `--cuda-full`；`cudaBatch=true` 时，一代的未完成链写入一个 manifest 并由单进程共享 GPU broker 调度。两个示例配置默认仍关闭 CUDA，避免普通机器意外要求 CUDA 工具链。

仅运行需要真实 CUDA 设备的回归测试：

```powershell
cargo test --release --features cuda --manifest-path research/ckt-v4-core/Cargo.toml cuda::tests::reusable_plan_matches_cpu_after_codes_change -- --ignored --exact
```

不带 `--features cuda` 的现有构建和测试完全不依赖 CUDA。

## 距离 GPU 主导仍缺什么

1. finalist batch 已接入多链 explorer；单候选增量仍不适合 GPU，broker 只合并同静态拓扑、同 mode 的全量请求。
2. host 契约校验和 code 扁平化已合并成一次遍历；进一步减少分配需要引入可复用 host staging buffer，收益应先在 RTX 3070 实测。
3. 最终 `ProjectedMotor` 和 `f64` 汇总保留 CPU 精确路径作真值。
4. 在 RTX 3070 目标机复跑 resolver、完整退火以及显存/功耗基准，再决定合理的并发链数、100 ms 收集窗是否合适，以及每个 worktree 的资源配额。
5. 长期任务保留 CPU fallback，并设置非零 `verifyEvery`，周期性用 CPU 全量评分抽查 GPU 路径。

因此当前最经济的使用方式是：CPU 继续处理被增量解析器命中的局部变更，CUDA finalists 处理不得不全量重算的候选；多链调度器则尽量把同契约、同 mode 候选合成 batch。完整 `ProjectedMotor` GPU 化已不再是近期首选，因为 finalists 保留 CPU 浮点真值的同时已消除了约三分之二的 motor 输入。

### 多链 explorer 接入

2026-10-18 增加 `anneal-native --batch-manifest` 和 explorer 的 `cudaBatch` 调度。每条链仍有独立 RNG、checkpoint、frontier 与避重视图；共享的只读语料、方案 fixture 和同一个 `ProjectedMotor` 由进程内各链复用，GPU broker 独占 CUDA plan/工作区。实跑曾捕获扩展键 donor 经 `HashMap` 随机次序累加导致的 1 ULP 差异；二进制头解析现在保留来源 JSON 的 donor 顺序，batch 内再共享同一个 motor，保证 broker 选择、链内 CPU 校验和独立进程重跑使用同一浮点真值。

本机 RTX 4060 Laptop 以 4 条强种子、每链 2 步、每步 CPU 全量核验做小型试跑：

| 口径 | 串行逐链 | 单进程多链 batch | 加速 | 精确性 | batch 占用 |
|---|---:|---:|---:|---|---|
| 21×21 | 39.38 s | 15.10 s | 2.61× | 4/4 checkpoint 的 score/layout/RNG 完全相同 | 24 lanes / 6 batches，mean 4.00 |
| 21×26 | 46.75 s | 15.12 s | 3.09× | 4/4 checkpoint 的 score/layout/RNG 完全相同 | 24 lanes / 12 batches，mean 2.00 |

这组数字包含 CPU 语料生成、参考评分和并发链收益，不是纯 GPU kernel 加速。短链会因各链生成时间不同而出现 singleton；100 ms 只是本机小试的稳妥默认值，目标 RTX 3070 应根据 `mean-lanes`、长期功耗和墙钟时间重新调参。runner 的一代两链端到端 smoke 也已完成：batch manifest、独立 checkpoint/frontier、SQLite 事务规划和 `integrity_check=ok` 全部通过。

## 持久显存与 8-lane batch 试验

2026-10-18 增加了按 `CudaResolvePlan` 持有的显存工作区：容量只增长，后续候选复用，不再在五个阶段中反复 `cudaMalloc/cudaFree`。真实两步退火、每步 CPU 全量核验通过。冷/热单候选测试中，第一个 mode 的冷调用包含 CUDA context 初始化，表观提升为 1.45–1.54×；排除该因素后，Sanpin 冷/热约为 1.00–1.07×。它适合保留以降低抖动和分配风险，但不是主要吞吐来源。

同一静态行/阶段契约内的 8 个候选还可以把同一 stage order 合成一次排序，候选 lane 通过高位 group key 严格隔离。CPU、逐候选 GPU、首次 batch 和预热 batch 的完整 outcomes 均逐项一致。混合 S005、21×21 与 21×26 的首次试跑被契约检查在第一个拓扑差异处拒绝；调度器因此必须先按静态契约分组，不能只按 mode 分组。

| 口径 | Keytao batch / 逐候选 | Sanpin batch / 逐候选 | kernel launches |
|---|---:|---:|---:|
| 21×21（3 个真实方案循环成 8 lane） | 0.84× | 1.08× | 40 → 5 |
| 21×26（3 个真实方案循环成 8 lane） | 1.04× | 0.90× | 40 → 5 |

重复单一方案的补充轮落在 0.91–1.15×，同样没有稳定收益。batch 后 GPU 排序/传输仅约 31–50 ms，完整 resolver 的主要时间已经是 Rust 活动项构造、逐行最终选择和内存流量；简单扩大排序批次反而损害缓存局部性。因此当前只保留 batch 作为精确实验接口和基准，不接入生产 annealer。若继续探索，必须把活动项构造和每行最终选择一并迁到 GPU，才可能获得结构性收益。

### 活动项与逐行选择迁入 GPU 后

2026-10-18 完成下一阶段融合路径。设备端持有静态行/阶段/槽位拓扑和 active-stage 状态，逐 order 构造活动 key、排序求 rank、逐行 tie-break 并推进阶段；host 不再构造每轮 active entry 元数据，也不再接收中间 rank 数组。旧 rank-only 路径仍保留在 benchmark 中作同机 A/B。

8-lane 结果如下，均为 3 个真实强方案循环组成 batch；`device` 包含 code/cost 上传、五次排序与最终 outcome 下载。所有 CPU、旧 CUDA、新 CUDA outcomes 均逐项一致。

| 口径 | mode | 逐候选 fused | 旧 rank-only batch | 新 fused batch | 相对旧 batch | device | host prepare/finalize |
|---|---|---:|---:|---:|---:|---:|---:|
| 21×21 | Keytao | 1902.2 ms | 1460.8 ms | 904.0 ms | 1.62× | 52.0 ms | 785.4 / 58.2 ms |
| 21×21 | Sanpin | 1715.6 ms | 1387.2 ms | 874.8 ms | 1.59× | 57.2 ms | 759.3 / 52.3 ms |
| 21×26 | Keytao | 2623.0 ms | 2294.7 ms | 1639.5 ms | 1.40× | 63.5 ms | 1490.9 / 67.9 ms |
| 21×26 | Sanpin | 2374.2 ms | 1542.4 ms | 1077.8 ms | 1.43× | 59.6 ms | 958.2 / 50.1 ms |

这次 batch 已从“不稳定持平”变为结构性正收益，五阶段提交仍是 40 → 5。batch 内使用面向 `PackedCode` 的快速 cost cache：21×21 的约 695 万槽位收敛为约 51–54 万个唯一 code，21×26 的约 754 万槽位收敛为约 88–94 万个唯一 code。单候选不启用该 cache，避免大量唯一 code 使哈希成本反超直接计算。

全槽位 cost 的单候选 fused 通常比旧 rank-only 慢约 7–36%，因为它为全部静态槽位预先计算 motor cost，而旧路径只为到达终止选择的活动 code 算 cost。这一版本保留为 `resolve_fused` / `resolve_batch_costs`，用于 A/B 和回归，不再作为默认 dispatch。

### 最小-rank finalists 压缩

下一阶段没有把 `ProjectedMotor` 浮点公式复制到 GPU，而是采用更保守的 exact 路径：GPU 对终止行标记全部最小-rank code，用 `thrust::copy_if` 在显存中压缩成 slot 索引；CPU 只对压缩后的 finalists 调用原版 `ProjectedMotor`。因此不需要回传全部 rank 或 flag，也不产生第二套 FP64 真值。

真实方案中 finalist 数几乎等于行数：每个约 28.96 万行的候选只有 28.96–28.98 万 finalists，而静态槽位为 86.89–94.23 万。8-lane 的约 695–754 万槽位最终压缩为约 231.7–231.8 万 finalists；batch 内再按 `PackedCode` 缓存 motor cost。

| 口径 | mode | 单候选 rank-only | 单候选 finalists | 8-lane 旧 rank-only | 8-lane finalists | 单候选提升 | batch 提升 |
|---|---|---:|---:|---:|---:|---:|---:|
| 21×21 | Keytao | 151–166 ms | 79–99 ms | 1413 ms | 611 ms | 1.67–1.91× | 2.31× |
| 21×21 | Sanpin | 184–200 ms | 93–121 ms | 1411 ms | 559 ms | 1.57–2.15× | 2.52× |
| 21×26 | Keytao | 156–201 ms | 80–117 ms | 1511 ms | 641 ms | 1.50–1.96× | 2.36× |
| 21×26 | Sanpin | 172–207 ms | 88–102 ms | 1561 ms | 617 ms | 1.85–2.17× | 2.53× |

单候选 finalists 相对纯 CPU resolver 为 5.87–8.09×。8-lane 的设备阶段约 42 ms，剩余主要是 host 契约/扁平化准备约 265–267 ms，以及含 motor cache 和 outcome 构造的最终化约 300–323 ms。默认 `resolve` 与 `resolve_batch` 现在都走 finalists；旧 rank-only 和全槽位 cost 路径继续保留，以便 fallback 和性能回归。

## 验算层级

GPU 结果不能再由同一个 GPU kernel 充当独立真值。当前建议：

1. 日常长期计算使用 CUDA 全量解析，并由 Rust CPU `verifyEvery` 周期抽查；
2. Rust CPU resolver 是运行时精确真值，速度足以承担低频抽查；
3. JS 参考只在评分公式、语料导出、排序规则或数据契约变化时做跨实现回归，并对发布版本做抽样审计。

Rust CPU 已有与冻结 JS 参考逐项一致的自动测试。每几步启动 JS 会重复解析大体量对象、跨进程读写数据，成本和工程复杂度明显高于所得保障；把 JS 迁到 GPU 也不会形成独立验证，因为最终仍会依赖另一套新 kernel。现阶段没有这个性价比。
