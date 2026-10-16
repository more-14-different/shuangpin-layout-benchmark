# CKT v4 第六阶段：精确前沿归档格式

日期：2026-10-16

## 角色边界

前沿归档保存 CKT v4、M、D、V 之间的非支配候选，但不改变退火接受概率。
Metropolis 能量仍只有 CKT v4；M/D/V 只有在命令行显式设置上限时才是硬护栏，
否则只是归档和比较维度。这样不会用一个未声明的混合权重偏袒某个键盘口径。

退火器在线只保存当前/最佳状态和至多四个单指标诊断 leader。候选历史通过
`FrontierLogWriter` 逐行追加到磁盘，writer 不持有历史向量；精确 Pareto 归并在
独立进程中离线完成。

## JSONL v1

日志首行是 `ckt-v4-frontier-log-1` header，绑定：

- 语料质量阈值及 HTML、冰雪基础词表、笔画表来源哈希；
- 方案 HTML 哈希和方案 ID；
- M/D/V 护栏（包括未启用的 `null`）；
- 提案策略 `regular-compound-v1`；
- 固定指标模式 `cktV4/memory/displacedInitials/displacedVowels`。

其后每行是一个完整 `point`，包含未舍入的四指标、完整 `RegularLayout` 和迭代号。
每行写入换行后立即 flush。`--record accepted` 记录初态和被 Metropolis 接受的状态；
`--record leaders` 还允许被拒候选在刷新某个在线单指标 leader 时入档。后者仍不影响
退火链本身。

示例：

```powershell
cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml `
  --bin anneal-native -- `
  research/.cache/ckt-v4-native-corpus.bin `
  research/.cache/ckt-v4-schemes.json `
  tools/ckt_v4_upstream_role_tables.json `
  SNF4-M36-AE-07 --steps 100 --duty-ms 5 `
  --checkpoint research/checkpoints/21x26-v9.json `
  --frontier-log research/checkpoints/21x26-frontier.jsonl `
  --record leaders

cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml `
  --bin merge-frontier -- `
  research/checkpoints/21x26-frontier.jsonl `
  research/checkpoints/21x26-frontier.json
```

`just ckt-v4-frontier-smoke` 执行一条真实 21×26 候选链并归并；生成物位于已忽略的
`research/checkpoints/`。

## 精确支配与稳定顺序

四项全部最小化。A 支配 B 当且仅当 A 四项均不大于 B，并至少一项严格小于。
比较直接使用有限的原始 `f64` CKT 值和整数 M/D/V，展示舍入不参与判定；NaN 和
无穷在写日志或归并时都会拒绝。

指标完全相等的不同布局只保留规范布局字节更小者。规范顺序依次编码容量、27 个
声母键、35 个韵母键、5 个辅码键，最后才以 ID 作元数据决胜。最终输出先按完整
四指标字典序，再按规范布局排序，所以输入次序、崩溃重放和 hash-map 顺序都不会
改变结果字节。

同一布局若重复出现，只保留指标更优的记录；指标和布局均相同则保留更早迭代。

## 崩溃恢复

恢复打开日志时会流式检查 header 和已有完整行，不把历史加载进退火器。若最后一行
没有换行，则视为断电/终止时的未完成写入：重新追加前截断到最后一个完整边界，
离线读取时报告 `truncatedTail=true` 并保留此前记录。任何已换行的坏 JSON、错误
record kind、非有限指标或 provenance 不一致都视为损坏，不做静默修复。

崩溃后重复写入同一完整 point 是允许的。离线恢复按精确序列化内容去重并报告
`deduplicatedRecords`；连续 40 条与分成 17+23 条写入的日志已验证产生逐字节一致
的前沿 JSON。

## 低内存证据

```powershell
just ckt-v4-frontier-memory-smoke
```

本机冒烟连续追加 2,048 个 point，日志增长到 763,734 字节；writer 报告
`retainedHistory=0`，离线精确前沿为 1 个成员。这个测试断言“日志增长而 writer
历史常驻量不增长”，不把某一次进程 RSS 当作跨机器阈值。目标 R7 59xx / 64 GiB
台式机的长跑 RSS、吞吐和推荐并发数仍须在该机器上实测后记录。
