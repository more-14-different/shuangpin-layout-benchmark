# CKT v4 CUDA 全量解析原型

状态：实验性、默认不编译，已经以显式开关接入退火和 explorer。CPU 参考实现仍是唯一的回归真值；当前适合独立分支上的小型试验，不建议直接替换长期生产任务。

## 原型边界

CUDA 原型加速全量评分中的候选桶排序和终止名次解析：

1. Rust 按当前布局生成约 28.96 万行模式记录；
2. Rust 为每个活动阶段生成 `(pool, code, row-priority)` 紧凑项；
3. CUDA 使用 64-bit key 排序及 segmented inclusive scan 求出精确名次；
4. Rust 使用原有 `ProjectedMotor`、`f64` 汇总和认知参数生成最终分数。

因此 GPU 不参与浮点累加，不会因 RTX 3070/4060 较弱的 FP64 吞吐改变 CKT v4 数值。原型会逐个比较 CPU/GPU 的完整 `Outcome` 数组和 `Summary`，任一处不同即失败。

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
  "cudaFull": true
}
```

`tools/run_ckt_v4_explorer.ps1` 会自动带 `--features cuda` 构建并为每条链增加 `--cuda-full`。示例配置默认仍为 `false`，避免普通机器意外要求 CUDA 工具链。

仅运行需要真实 CUDA 设备的回归测试：

```powershell
cargo test --release --features cuda --manifest-path research/ckt-v4-core/Cargo.toml cuda::tests::reusable_plan_matches_cpu_after_codes_change -- --ignored --exact
```

不带 `--features cuda` 的现有构建和测试完全不依赖 CUDA。

## 距离 GPU 主导仍缺什么

1. 把活动项构造、每行最优阶段选择和部分整数归约迁入 GPU；单纯合批 rank 已证实没有稳定收益。
2. 在上述 CPU 开销迁移后再评估多链 batch；单候选增量本身仍不适合 GPU。
3. 最终 `f64` 汇总保留 CPU 精确路径作真值。
4. 在 RTX 3070 目标机复跑 resolver、完整退火以及显存/功耗基准，再决定合理的并发链数和 batch 大小。
5. 长期任务保留 CPU fallback，并设置非零 `verifyEvery`，周期性用 CPU 全量评分抽查 GPU 路径。

因此当前最经济的使用方式是：CPU 继续处理被增量解析器命中的局部变更，CUDA 处理不得不全量重算的候选；下一阶段应先减少 resolver 的 CPU 构造与最终化，再考虑多链 batch。

## 持久显存与 8-lane batch 试验

2026-10-18 增加了按 `CudaResolvePlan` 持有的显存工作区：容量只增长，后续候选复用，不再在五个阶段中反复 `cudaMalloc/cudaFree`。真实两步退火、每步 CPU 全量核验通过。冷/热单候选测试中，第一个 mode 的冷调用包含 CUDA context 初始化，表观提升为 1.45–1.54×；排除该因素后，Sanpin 冷/热约为 1.00–1.07×。它适合保留以降低抖动和分配风险，但不是主要吞吐来源。

同一静态行/阶段契约内的 8 个候选还可以把同一 stage order 合成一次排序，候选 lane 通过高位 group key 严格隔离。CPU、逐候选 GPU、首次 batch 和预热 batch 的完整 outcomes 均逐项一致。混合 S005、21×21 与 21×26 的首次试跑被契约检查在第一个拓扑差异处拒绝；调度器因此必须先按静态契约分组，不能只按 mode 分组。

| 口径 | Keytao batch / 逐候选 | Sanpin batch / 逐候选 | kernel launches |
|---|---:|---:|---:|
| 21×21（3 个真实方案循环成 8 lane） | 0.84× | 1.08× | 40 → 5 |
| 21×26（3 个真实方案循环成 8 lane） | 1.04× | 0.90× | 40 → 5 |

重复单一方案的补充轮落在 0.91–1.15×，同样没有稳定收益。batch 后 GPU 排序/传输仅约 31–50 ms，完整 resolver 的主要时间已经是 Rust 活动项构造、逐行最终选择和内存流量；简单扩大排序批次反而损害缓存局部性。因此当前只保留 batch 作为精确实验接口和基准，不接入生产 annealer。若继续探索，必须把活动项构造和每行最终选择一并迁到 GPU，才可能获得结构性收益。

## 验算层级

GPU 结果不能再由同一个 GPU kernel 充当独立真值。当前建议：

1. 日常长期计算使用 CUDA 全量解析，并由 Rust CPU `verifyEvery` 周期抽查；
2. Rust CPU resolver 是运行时精确真值，速度足以承担低频抽查；
3. JS 参考只在评分公式、语料导出、排序规则或数据契约变化时做跨实现回归，并对发布版本做抽样审计。

Rust CPU 已有与冻结 JS 参考逐项一致的自动测试。每几步启动 JS 会重复解析大体量对象、跨进程读写数据，成本和工程复杂度明显高于所得保障；把 JS 迁到 GPU 也不会形成独立验证，因为最终仍会依赖另一套新 kernel。现阶段没有这个性价比。
