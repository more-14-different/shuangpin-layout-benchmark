# CROSS-14 后续下潜

本轮最低为 `untoned-cross14-moves / CROSS-2`：在 CROSS-14 上仅将
`iong:H→N`，CKT v5.1 从 9.53949338419025 降到 9.539430449667533。
改善 0.000062934522717，约 0.00066%。幅度很小，不能据此宣称实际输入速度可感知提升。

| 指标 | 原 CROSS-14 | iong→N |
|---|---:|---:|
| CKT v5.1 ↓ | 9.53949338419025 | 9.539430449667533 |
| 日常移手分 ↑ | 135.42261566944472 | 135.42261566944472 |
| S2 主行 ↑ | 52.4198605% | 52.3855889% |
| 系列当量 v4 ↓ | 10.801892544199747 | 10.80212776249386 |
| S2 异键同指率 ↓ | 3.6929834% | 3.6929834% |

两者构成取舍：新点 CKT 更低，原点主行和当量略好。新点保持 M-R2=42、
D=2、V=5、无额外路由、399 音节覆盖、346 个唯一码及 QZ/ZQ 双空桶。
辅助语义仍为 toneKeysByTone=IVUAO、shapeKeysByMeaning=AVUIO、形义声调数字42310。
没有修改 Rime 生产布局。

## 本轮范围和结论

- 从 CROSS-14 生成 597 个合规交换候选，预筛后复算 34 个（含底座），未改善。
- 精确评分 Metropolis 32 步，随机种子1415，允许 QZ/ZQ 占桶；接受过
  Q/R 整组交换及 uai/vn 交换的暂时退步，未找到优于底座的点。
- 对 er、iong、van、vn、ve、v、ua、uang、ia 单韵母迁移进行筛选。
  最终有174个合规迁移；两阶段筛选累计复算41个迁移和底座。
  第一阶段额外要求唯一码不少于生产版，第二阶段移除该非记忆门槛。
- 唯一低于底座的已测迁移是 iong→N。高频韵母向运动耗时低的键聚集，
  常因候选竞争而恶化完整 CKT；运动耗时不能单独作为下降目标。

本轮不构成全部174个迁移的穷举，更不构成全局最优证明。评分固定生产辅序，
没有逐方案重新选择稳健辅序。移手分不变仅指所用日常语料指标。

42 个迁移布局由原 Python M-R2 实现独立核验；底座及优胜点经原
Engine7/CKTEngine 的20合同重放。结果文件：

- `2026-11-14-untoned-cross14-r1-neighbors.json`：交换筛选。
- `2026-11-14-untoned-cross14-anneal-neighbors.json`：接受/拒绝轨迹。
- `2026-11-14-untoned-cross14-moves.json`：迁移布局及完整评分。
- `2026-11-14-untoned-cross14-moves-independent-audit.json`：当量及20合同。
- `2026-11-14-untoned-cross14-moves-memory-audit.json`：原始记忆核验。

复现依赖现有本地 R11 HTML、冻结 replay 与 Rime 语料：

```powershell
node tools/descend_cross14_moves.js
node tools/audit_untoned_v51_finalists.js research/notes/2026-11-14-untoned-cross14-moves.json
```

输出缓存校验 HTML 哈希，输入/评分模型变化时应使用新输出路径或重新生成缓存。
