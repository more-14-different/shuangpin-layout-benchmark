# LAN/AEO 有调与无调载体枚举归档

归档记录时间：2026-11-21T12:03:02.427389+08:00。新增归档提交，不改写历史；父提交 `3d8cb5ab1d3563ac0eb5b43cf3511eb66f032c1b`。本报告首次新增的 Git 提交即归档提交。

未跟踪的 `2026-11-18-lan-aeo-all.json` 是同场实验的中间副本：families 与已提交的 toned 完成版逐项相等。它缺少 completed/htmlUnchanged，来源脚本哈希也有差异（枚举脚本版本、production search 与 scheme fixture 的来源清单变动）；原清单及差异逐项保存在 manifest。因此只移除重复候选数据，保留来源差异及原有规范结果。

| 关联旧提交 | 提交时间 | 工作 |
|---|---|---|
| `302234592ea08959fcd9578ebc06df42b85b5682` | 2026-11-18T01:19:13+08:00 | feat(research): compare unified AEO carriers for fixed Lan f19 |
| `a2a9e2ff700a5f08430c7aa6655e5b7125e0ae18` | 2026-11-18T01:39:19+08:00 | feat(research): exhaust AEO carriers for toned and production Lan layouts |

上述提交已经包含在本次归档父提交中。实验文件日期为 2026-11-18；原文件没有运行开始/结束时间字段，不能把 Git 时间或文件 mtime 当成运行起止时间。

保留有调/无调各 21 个统一 A/E/O 载体端点和 original 基线，共 **44 行**，以及原 CSV、选定端点的完整列指标与验证输出。两类所有搬迁端点的 CKT v5.1 都高于其 original 基线；有调搬迁端点中 C 最低，无调中 R 最低。枚举结果依然完整，没有将不满足门槛的端点冒充有效候选。

额外保留 **3 个精选 native 输出**（26,545 字节 gzip），只删除庞大的 filterRows 逐候选表，其余字段完整保留。旧 payload 输入无损压缩为缓存中的 `research/.cache/lan-aeo-all-20261118/toned-full/payload-input.json.gz`（116,460,156 字节）；逐字节校验解压后 SHA-256 一致。重复 binary 输入与已跟踪 `cr-anneal-inputs.zip` 原字节核对后清理。净释放约 **393.94 MiB**。

源文件审计区分：当前原件、仅换行转换、其他历史提交原件，以及确实找不到的历史输入。外部 Rime 仓库仅作只读核验，没有修改或提交。固定辅序与实际生效 policy 保留在原结果中；辅键语义按原 contract 的 toneKeysByTone / shapeKeysByMeaning 读取，不重新优化。

**复现范围限制：1 个历史原始输入未能从当前文件或现有 Git 历史取回。** 见下表；旧 SHA-256 保留，不改成当前值。本次验证输出数据、同等语料覆盖、完整枚举、精选重放列与冻结输入压缩，不宣称用当前源配置完整重跑了旧实验。

| 未能取回的历史输入 | 当时 SHA-256 |
|---|---|
| `D:/C2D/Documents/rime-snow-pinyin/snow_jiandao.schema.yaml` | `9b097d410b6272f6569e18f1def9debc3d5aac01aa291b64a09ebac35da28a0d` |

3 项 Python 验证通过。所有旧提交、逐文件 SHA-256、删除清单、输入来源核验及源仓库提交时间见同前缀 manifest；规范枚举与原报告保持原内容。
