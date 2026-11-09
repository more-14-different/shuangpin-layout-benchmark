# AVUIO 7:8:6 拼读 11 韵 Rust 搜索准备

日期：2026-11-10

## 固定合同

本轮把 Rust 搜索目标改到当前生产候选方向，而不是旧的 QAOPL `7:7:7` 试验：

- `shapeKeysByMeaning=AVUIO`，对应 `toneKeysByTone=IVUAO`；
- 21 个声键按物理行分为 `QWERTYP / SDFGHJKL / ZXCBNM`，即 `7:8:6`；
- 四声在上排，一、零声在下排，二、三声共享中排；
- 韵侧固定为上游启发的 11 个归一类，每个调区只在本区键内移动；
- 词辅策略固定为 `12/213/24`，不搜索 120 种形笔语义排列和 144 套词辅。

基线 `UNEVEN786-pindu11-D8-267` 的历史 ID 保留 `D8`，但由实际编码重算得到
`D=9, F=9`。其规则计数口径为 `M_lower=29, M_guard=34`，其中三调区的
11 韵归并共计 12 条 merge lower。

## Rust v2 搜索边界

`trial-toned-pareto` 现在支持三个 proposal space：

| 空间 | 一跳原子 | 数量 |
|---|---|---:|
| `first` | 55 个声介原子移到其余 20 个声键 | 1,100 |
| `rhyme` | 11 韵分别在 7、8、6 键调区内移动 | 198 |
| `joint` | 上述两者的并集 | 1,298 |

非零 `beam` 会在一跳完成后，从最低 CKT 候选出发生成兼容二跳。二跳允许
“声介＋声介”“声介＋韵”“不同调区或不同韵的韵＋韵”，禁止同一原子被改两次。
每个候选都同步报告 CKT、`M_lower/M_guard`、tone-region merge、D 和 F。

检查点会绑定布局、评分输入、种子、AVUIO 辅键语义和调区合同的哈希；改变这些
条件后不能误续跑。已验证一次新建试跑和一次断点续跑，Rust 基线
`9.589470270392194` 与 JS `9.589470270392193` 对拍到浮点尾差，增量候选也可按
指定间隔执行全量重算校验。

## 当前短程前沿

先前 120 个声介一跳候选中，最好的是零声母撮口呼原子 `_v → M`：

| 方案 | CKT v5.1 | M lower / guard | D / F |
|---|---:|---:|---:|
| 7:8:6 基线 | 9.589470270 | 29 / 34 | 9 / 9 |
| `_v → M` | **9.556498964** | 30 / 35 | 9 / 9 |
| 历史 M21 | 9.541521260 | 21（另一口径） | — |

`_v → M` 相比基线改善 `0.032971306`，但仍比历史 M21 慢 `0.014977704`。
因此它证明 AVUIO 7:8:6 的声介侧还有可见下潜空间，尚未证明能超过 M21，也不应
把前 120/1,100 个声介候选当成一跳下界。

11 韵纯移动已做小样本试跑并用 JS 独立复核；早期候选尚未优于基线。完整 198
个韵一跳仍应在长期机跑完，之后再由 joint 一跳 Pareto 产生小 beam 二跳。

## 长期机入口

```powershell
just ckt-v51-toned-avuio786-rust-trial first 120 0 5
just ckt-v51-toned-avuio786-rust-resume first 120 0 5

just ckt-v51-toned-avuio786-rust-trial rhyme 120 0 5
just ckt-v51-toned-avuio786-rust-resume rhyme 120 0 5

just ckt-v51-toned-avuio786-rust-trial joint 120 8 5
just ckt-v51-toned-avuio786-rust-resume joint 120 8 5
```

当前 runner 是确定性一跳穷举加 Pareto/beam 二跳，不是无限步模拟退火器。这个边界
更适合先充分挖掘“低 M、低 D、少量碎片”的小空间；若二跳仍显示明显下降梯度，
再把同一 move、计分、检查点合同接入长期退火。

完整候选布局在
`research/config/ckt-v51-toned-2121-pindu11-avuio786-rust-trial-finalists.json`，
JS 全量复算在
`research/notes/2026-11-10-ckt-v51-toned-2121-pindu11-avuio786-rust-trial-full.json`。
