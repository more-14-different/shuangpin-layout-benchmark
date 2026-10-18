# CKT v4 CUDA 多链与持久会话

状态：CUDA 全量评分已作为可选后端接入 Rust 退火器；explorer 可以把同一代的多条链合并为 GPU batch，并在多代之间复用语料、运动模型、CUDA plan 和显存 workspace。CPU/JS 参考实现、CKT v4 公式、提案顺序、检查点和 SQLite 探索档案契约均不因此改变。

## 启用方式

Explorer 配置中同时设置：

```json
{
  "cudaFull": true,
  "cudaBatch": true,
  "cudaBatchWindowMs": 100
}
```

`cudaBatch` 需要 `cudaFull`。示例配置仍默认关闭 CUDA，避免没有 NVIDIA CUDA 环境的机器意外进入 GPU 路径。

## 生命周期

`run_ckt_v4_explorer.ps1` 为一次 explorer 运行启动一个 `anneal-native --batch-session` 子进程。每一代仍按原顺序执行：

1. 从初始排名或上一代计划读取种子；
2. 写入该代 batch manifest；
3. 向持久 Rust 进程提交 manifest，多链并行构造候选；
4. GPU broker 按输入模式聚合候选，完成全量评分；
5. 写完各链 checkpoint/frontier log 后，Rust 返回该代完成响应；
6. planner 才把该代日志事务式导入 SQLite，并选择下一代种子。

持久会话只复用性能状态，不把未完成结果藏在进程内。进程异常退出后，已有 checkpoint、frontier log 和 SQLite 代际边界仍可检查和恢复。

同一会话要求 corpus、scheme fixture、ProjectedMotor snapshot 与 batch window 不变。Runner 在开始计算前验证模板、参考方案和初始排名方案都存在于 scheme fixture，避免到第二代才暴露无效模板。

## Batch 诊断

每代的 `anneal-batch.stdout.log` 都包含：

- batch 数、lane 数、平均/最大 lane 和 lane 直方图；
- host preparation、GPU device、host finalization 累计耗时；
- GPU 输入 entries、最小 rank finalists 及 finalist 比例；
- kernel launch 与失败数。

这些计数每代重置，CUDA plan/workspace 不重建。不要只以平均 lane 判断收益：冷启动代可能形成更宽 batch，但仍会因 plan/workspace 建立而更慢。

## 当前性能边界

当前路径把活动项构造、逐行最小 rank 选择放在 GPU；ProjectedMotor 只对最小-rank finalists 在 CPU 上计价。ProjectedMotor 已改为栈上直接展开 donor，不再为每个 finalist 分配临时容器；实测直接重算快于为数百万 finalists 做 per-batch HashMap 查询，因此 finalist 缓存已移除。

Native 生成器会在每行仍处于 CPU cache 时同步构造 CUDA 平面代码，随后各链把这份表示交给 broker。Broker 只校验 lane 长度并做连续块复制，不再串行重走全部 Row/Stage、比较静态契约和逐个提取 PackedCode。RTX 4060 Laptop、8 lanes 的实测中，host preparation 从约 200–223 ms 降到 6–9 ms；21×21 finalist batch 为 160–165 ms，21×26 为约 173 ms，且均与 CPU 结果 exact 一致。普通 `resolve_batch` 仍保留完整契约校验，平面快路径只接收 native 生成器的同拓扑数据。

目前主要剩余成本转为 host finalization（约 107–120 ms），GPU device 约 43–47 ms。后续优先方向是压缩/并行 finalist 的 ProjectedMotor 归约或进一步降低回传量，以及改进链的阶段对齐，而不是单纯延长收集窗口。

固定窗口从第一条请求开始计时。实验中的“每到一条请求就续时”虽然提高了平均 batch 宽度，却增加总等待时间，已否决。
