# Astra 主导的：双拼布局 Benchmark + 多轮优化 · NF3 阶段

**314 个普通声母单首键候选，另列 1 个键道原作基线；五类键域，一套可复查的码表、测评合同与闭合记录。**

[简体中文](#简体中文) · [English](#english) · [繁體中文](#繁體中文) · [下载 Release](https://gitee.com/xie-chenzhu/shuangpin-layout-benchmark/releases/latest)

<a id="简体中文"></a>
## 简体中文

### 项目回答什么

本项目把双拼布局放在同一码表、语料、成本模型和编码合同中比较，并公开每轮搜索的种子、约束与结果。它起于一个具体问题：**普通声母的第一键能否固定，而无需根据韵母回看决定？**

NF3 当前给出：

| 项目 | 冻结结果 |
|---|---:|
| NF 单首键候选 | 314 |
| 原作比较基线 | 1（S005 · 冰雪键道双拼） |
| 普通声母规则 | 21 个普通声母各固定一个首键 |
| 键域 | 21×21、23×23、21×26、25×30、26×26 |
| common 音节 | 399；完整码表另含扩展音节，共 421 项 |
| 语料 | 8,105 单字；92,233 二字词并集 |
| NF3 父种 / 发布端点 | 49 / 38 |
| NF3 邻域动作检查 / 完整条件评分 | 71,507,052 / 71,226 |

### 从 PR1 到 NF3

| 阶段 | 活动项 | 做了什么 |
|---|---:|---|
| PR1 历史快照 | 258 | 汇集传统方案、结构投影与低记忆搜索端点 |
| NF1 | 237 | 保留 221 项，移出 37 项条件首键方案，加入 16 项单首键重建 |
| NF2 | 276 | 从 42 个分档父种搜索首键载体组换位与三循环，加入 39 项，并统一复算 LU-v1r |
| NF3 | 314 | 从 49 个父种联合变异声键与韵键，加入 38 项，完成七类有限邻域闭合 |

这条路线的主题是 **“双拼布局：无尽的前沿”**。小鹤、自然码、声笔、键道、首道与廿六双拼构成传统来源种子；廿六双拼的原版及 AEUIO/AVUIO 改版也带来 21×26 键域。每轮端点既是成果，也是下一轮的种子。页面同时记录“唯有源头活水来”的群聊立项时间线、各代种子的启发来源和变异方向。

### 已探索区域与开放方向

NF3 固定父种实际记忆项 M、逻辑声韵分组、重码桶、五辅键集合与顺序，检查：

1. 第一码、第二码各自的两交换与三循环；
2. 声韵各换一对的原子联动；
3. 围绕 zh/ch/sh 或零声母载体的第一码四循环与双交换。

| 键域 | 父种 | 有改善 | 发布端点 | 最佳 CKT 降幅 | 最佳 v5 降幅 |
|---|---:|---:|---:|---:|---:|
| 21×21 | 11 | 9 | 7 | 12.38% | 8.36% |
| 23×23 | 9 | 9 | 9 | 3.87% | 1.80% |
| 21×26 | 12 | 11 | 10 | 15.79% | 7.87% |
| 25×30 | 9 | 6 | 5 | 1.71% | 1.14% |
| 26×26 | 8 | 7 | 7 | 2.60% | 1.28% |

开放方向包括第二码四循环及更长循环、五组以上联动、五辅集合或顺序重选、逻辑声韵重新分组、新的条件编码语法，以及面向其他用户群体的 CKT 模型。

### 21×21 / AVUIO 示例

`NF3-21X21-M40-44` 是 21×21、AVUIO、M=40 的非支配候选之一：裸二键唯一 378/399，CKT-S2 71.705 ms/项，补全 CKT 81.719 ms/项，A7E-v5 10.5962，A7E-v4 10.8854，LU-v1r 78.43。

同键域还保留偏向综合分、裸码速度、唯一性或记忆量的其他端点。先按使用结构筛选，再同时看 M、补全 CKT、v5/v4 和规则审计。

### 键道原作与单首键重建

`S005` 从 PR1 冻结快照恢复为原作比较基线，保留 ch/zh 条件首键、完整主码和当时的同口径成绩；`S005-NF` 是本项目在相同语料、模型与合同下制作的普通声母单首键派生版。原作基线参与表格对比，不进入 NF 候选前沿授标。

| 方案 | 角色 | M | 裸二键唯一 | CKT-S2 ms | 补全 CKT ms | A7E-v5 | A7E-v4 | LU |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| S005 | 原作基线；ch/zh 条件首键 | 40 | 372/399 | 82.0288 | 90.1489 | 11.3770 | 10.7329 | 78.90 |
| S005-NF | 项目派生；普通声母单首键 | 38 | 357/399 | 82.2352 | 108.3288 | 11.4985 | 10.8097 | 82.29 |

### 如何阅读和复现

1. 从 [Releases](https://gitee.com/xie-chenzhu/shuangpin-layout-benchmark/releases/latest) 下载 `a7_CKT_NF3_closure.html`，用现代浏览器离线打开。
2. “选型总览”查看少量代表；“对比评测”查看筛选后的完整表；“方案详情”查看键盘图与逐音节码表。
3. “方法与词典 → 阅读指南”查看四条时间线、探索地图、NF3 闭合记录和逐方案父子差值。
4. 下载 `NF3_neighbourhood_repro.zip`，按包内 `README.md` 复放搜索过程、独立复算与浏览器检查。

发布证据：[冻结摘要](docs/snapshot.json) · [NF3 审校](docs/review.md) · [来源索引](docs/sources.md) · [机器审计](docs/release-audit.json)

### 人与 AI

AI 负责高维候选生成、筛选、复算和一致性检查；人类提出问题、定义公平口径与约束、核查来源、解释边界，并承担发布与维护责任。方案署名应如实记录协作与维护关系。公开环境和闭合记录，使后来者可以携带其他 AI 复核、换目标并继续向前。

### 版本与权利

本仓库发布自有说明与审校材料；大型 HTML、复现包和结果 JSON 作为 Release assets 分发。位图仅供本地审校，不上传至 GitHub 或 Gitee；SVG 仍可按需发布。外部模型、配置、词库及方案名称遵循各自来源与许可，详见[来源索引](docs/sources.md)。

---

<a id="english"></a>
## English

### Scope

This project compares double-pinyin layouts under shared code tables, corpora, cost models, and encoding contracts. NF3 contains **314 layouts in which each of the 21 ordinary initials has one fixed first key**, across five keyboard domains, plus the restored `S005` original KeyTao/Snow baseline for like-for-like comparison.

| Stage | Active layouts | Result |
|---|---:|---|
| PR1 historical snapshot | 258 | Imported and generated seeds |
| NF1 | 237 | Kept 221, retired 37 conditional-first-key entries, added 16 reconstructions |
| NF2 | 276 | Searched 42 stratified seeds and added 39 carrier-swap endpoints |
| NF3 | 314 | Searched 49 parents jointly on both code positions and added 38 certified endpoints |

NF3 records 71,507,052 neighbourhood move checks and 71,226 full conditional evaluations. Its certificates cover first/second-key transpositions and 3-cycles, atomic paired transpositions, and selected first-key 4-cycles/double transpositions around zh/ch/sh or zero-onset carriers.

The open frontier includes longer second-key cycles, changes involving five or more groups, auxiliary-set/order redesign, logical repartitioning, new conditional grammars, and CKT models for other user populations.

The historical lineage includes Flypy, Ziranma, Shengbi, KeyTao, Shoudao, and Lishi26 (廿六双拼). `S005` keeps its original conditional ch/zh first-key branches and frozen scores; it is displayed beside `S005-NF` but excluded from the NF single-onset frontier awards.

### Use

1. Download `a7_CKT_NF3_closure.html` from [Releases](https://gitee.com/xie-chenzhu/shuangpin-layout-benchmark/releases/latest) and open it locally.
2. Use Selection for shortlists, Benchmark for full filtered tables, and Scheme for keyboards and exact syllable codes.
3. Open Methods → Reading guide for the project, chat-origin, seed, metric, and explored-region records.
4. Use `NF3_neighbourhood_repro.zip` for executable replay and independent verification.

Evidence: [snapshot](docs/snapshot.json) · [review](docs/review.md) · [sources](docs/sources.md) · [release audit](docs/release-audit.json)

AI performs large-scale generation, screening, recomputation, and consistency checks. Humans formulate the problem, set fair metrics and constraints, verify sources, interpret the evidence, and own publication and maintenance responsibility. Reproducible artifacts let future researchers continue with other models and objectives.

---

<a id="繁體中文"></a>
## 繁體中文

### 範圍

本專案在共同碼表、語料、成本模型與編碼合約下比較雙拼佈局。NF3 收錄 **314 個普通聲母單首鍵候選**，涵蓋 21×21、23×23、21×26、25×30、26×26 五類鍵域，另列 `S005` 鍵道原作基線作同口徑比較。

| 階段 | 活動方案 | 成果 |
|---|---:|---|
| PR1 歷史快照 | 258 | 匯集來源方案與搜尋端點 |
| NF1 | 237 | 保留 221 項，移出 37 項條件首鍵方案，加入 16 項重建 |
| NF2 | 276 | 搜尋 42 個分檔父種，加入 39 項聲鍵載體變異端點 |
| NF3 | 314 | 搜尋 49 個父種的聲韻聯動鄰域，加入 38 項端點 |

NF3 保存 71,507,052 次鄰域動作檢查及 71,226 次完整條件評分。已覆蓋聲鍵／韻鍵兩交換與三循環、聲韻各換一對的原子聯動，以及圍繞 zh/ch/sh 或零聲母載體的聲鍵四循環與雙交換。

開放方向包括更長的韻鍵循環、五組以上聯動、五輔集合或順序重選、邏輯聲韻重新分組、新條件編碼語法，以及面向其他使用者群體的 CKT 模型。

傳統來源種子包括小鶴、自然碼、聲筆、鍵道、首道與廿六雙拼。`S005` 保留原作 ch/zh 條件首鍵及凍結成績，與 `S005-NF` 並列展示，但不參與 NF 單首鍵前沿授標。

### 使用與復現

1. 從 [Releases](https://gitee.com/xie-chenzhu/shuangpin-layout-benchmark/releases/latest) 下載 `a7_CKT_NF3_closure.html` 並離線開啟。
2. 「選型總覽」提供少量代表；「對比評測」提供完整篩選表；「方案詳情」提供鍵盤圖及逐音節碼表。
3. 「方法與詞典 → 閱讀指南」提供四條時間線、探索地圖、NF3 證書與父子差值。
4. `NF3_neighbourhood_repro.zip` 提供可執行復放與獨立核驗。

證據：[凍結摘要](docs/snapshot.json) · [NF3 審校](docs/review.md) · [來源索引](docs/sources.md) · [機器審計](docs/release-audit.json)

AI 承擔高維候選生成、篩選、複算與一致性檢查；人類提出問題、定義公平口徑與約束、核查來源、解釋證據，並承擔發佈與維護責任。公開環境與證書，讓後來者能攜帶其他 AI 繼續推進。
