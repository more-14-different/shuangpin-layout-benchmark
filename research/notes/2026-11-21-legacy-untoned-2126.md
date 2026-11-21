# 21×26 无调 v5.1 连续研究归档

归档记录时间：2026-11-21T11:50:48.396589+08:00。本次新增归档提交，不改写历史。父提交 `5f24b30dfb1395d6f1add8035aec6dc2433319ce`；本报告首次新增的 Git 提交即归档提交。

这是 11 月 14—15 日同一条连续研究线，不是 11 月 21 日 U7E/UED 或 A 锁韵 v5.2 搜索。旧提交中的原始大日志仍可用 Git 取回；当前仅保留较好结果和验证证据。

最终可晋级最佳为 `RC26-885412fb398bd67f`，CKT **v5.1 = 9.078652093288046**；10 万次退火没有超过此前 recenter 最佳。硬合法裸最低 9.073717281392 未通过舒适性门槛，不能当作最终最佳。

约束口径：21×26；M≤40、D≤3、V≤1；Common399 唯一码、无分支、QZ/ZQ 双空桶。还需原舒适性与独立模型门槛；前沿点或裸最低不自动等于可晋级候选。toneKeysByTone=IEUAO，shapeKeysByMeaning=AEUIO；辅序未重新优化。

| 关联旧提交 | 提交时间（含时区） | 工作 |
|---|---|---|
| `494df3cb7c596dd0d5ab8644451034819b4e1bf6` | 2026-11-14T04:17:09+08:00 | research: improve untoned 21x26 under production v5.1 constraints |
| `a61e2fef3a3ecfe36a5a485918355438c1f8efff` | 2026-11-14T18:03:49+08:00 | research: close complete 21x26 double-empty neighborhoods |
| `c723e5308174181783a6036596ce0e4e09a9a396` | 2026-11-14T19:32:44+08:00 | research: probe double-empty 21x26 coupled moves and distant layouts |
| `a4223f0c3575cfaa1e1badcc1475b0b3ef775cba` | 2026-11-14T20:14:52+08:00 | research: exhaust double-empty 21x26 two-hop endpoints and audit onset tradeoffs |
| `2f19302b704180f5f0403a5b66b513705a70402b` | 2026-11-15T01:35:31+08:00 | research: close recentered double-empty 21x26 one and two-hop descent |
| `2b1aaf1210fbf12c418f3f3558934bb8e4defd21` | 2026-11-15T03:18:43+08:00 | research: evaluate bounded 21x26 three-hop coupling and six alternative centers |
| `95996193fb01449319ce1bd741bff0c242cf9bf7` | 2026-11-15T03:40:16+08:00 | research: verify three-hop tradeoffs and improve alternate 21x21 centers |
| `b031079d620a3fe541e46c030fad44364c293691` | 2026-11-15T06:35:35+08:00 | research: complete 100k unique native 21x26 coarse-fine annealing trial |

以上提交在其他历史分支，归档父提交未包含它们。逐文件 SHA-256、Git 原件匹配及原件可恢复位置见 manifest；不能将“本分支未跟踪”解释为“从未提交”。

| 阶段 | 实验开始 UTC | 实验结束 UTC | 最佳 CKT v5.1 |
|---|---|---|---|
| 2026-11-14-untoned-2126-double-empty-closure.json | 2026-11-14T09:16:42.655Z | 2026-11-14T10:00:58.316Z | 9.083773105022795 |
| 2026-11-14-untoned-2126-coupled-basin.json | 2026-11-14T11:06:46.540Z | 2026-11-14T11:29:07.141Z | 9.083773105022795 |
| 2026-11-14-untoned-2126-twohop-summary.json | 原记录未提供 | 原记录未提供 | 9.083156124582864 |
| 2026-11-15-untoned-2126-recenter-summary.json | 2026-11-14T16:58:40.291Z | 2026-11-14T17:31:58.505Z | 9.078652093288046 |
| 2026-11-15-untoned-2126-threehop-summary.json | 2026-11-14T18:42:00.793Z | 2026-11-14T18:54:02.660Z | 9.078652093288046 |
| 2026-11-15-untoned-2126-anneal-100k-summary.json | 2026-11-14T19:58:33.134Z | 2026-11-14T22:28:50.775Z | 9.078652093288046 |

UTC 加 8 小时即北京时间；文件名日期、文件 mtime、Git 提交时间分别记录，不能互当运行时间。

保留 **3442 个不同布局**，其中包括全部 **3169 个最终八轴前沿点**，以及阶段前列、声母前沿、人体工学极值与已验证代表。所存八轨评分重新校验汇总算式，所有保留布局重算 Common399 与 M/D/V；少量代表重放 native 评分的结果另存 verification。历史的全量验证保留原报告，未宣称此次重放了全部历史状态。

精选数据库：`2026-11-21-legacy-untoned-2126-selected-results.json.gz`（2,507,300 字节）。完整逐次日志、过渡路径和恢复检查点不再保留于当前数据库，无法按原随机轨迹续跑。精简 16 个发布副本、265 个本目录缓存文件，共 715.76 MiB；未动其他 worktree。

相关文件：本报告同名前缀的 manifest、selected-results 和 verification；历史各阶段 summary/verification 及 finalist 配置、研究代码和测试。
