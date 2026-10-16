# 发布审计资料

- `snapshot.json`、`review.md`、`release-audit.json`、`sources.md`：已发布 NF3 的冻结证据，保留原文件名与内容，避免破坏历史引用。
- `R11_release-audit.json`：当前 R11 离线页的文件、方案保留和浏览器验证记录。
- `CKT_v4_SPEC.md`：CKT v4 的联合候选池、21×21/四码顶编码合约、物理/认知分层公式与发布门槛。
- `CKT_v4_CORPUS_AUDIT.json`：冰雪 base/ext/Tencent 的冻结哈希、词长规模与累计频率质量审计。
- `CKT_v4_PROTOTYPE_RESULTS.json`：S005、21×26、21×28 与 25×30 代表方案的 99% 频率质量原型验证结果；不是最终全方案排名。
- `CKT_v4_VALIDATION.md`：本轮缺陷复现、上游重建、34 键域、代表跑分、联合池影响和测试结论。
- `CKT_v4_RUST_KERNEL.md`：Rust 紧凑 CPU 参考内核、增量联合池、JS 逐项/真实四轨一致性及 GPU 接入门槛。
- `CKT_v4_BINARY_FORMAT.md`：阶段 2 的分块紧凑真实夹具、来源哈希、稳定枚举和复现方法。
- `CKT_v4_NATIVE_CORPUS.md`：阶段 3 的共享语料、独立方案状态、Rust 原生行生成和倒排增量更新。
- `CKT_v4_ANNEALING.md`：阶段 4 的 67 维规则状态、分尺寸 Common399 约束、约束感知提案、增量/全量混合退火和检查点。

可重复生成的截图、浏览器输出和完整研究环境不进入 Git；R11 完整复现材料保留在本地忽略目录 `a7_CKT_R11_integrated_materials/`。
