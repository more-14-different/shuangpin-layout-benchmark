# CR 四种子长期 GPU 退火

分支：`research/cr-frontier-gpu-anneal`。入口：`tools/run_cr_anneal.ps1`。
四个种子是 CR0-0374、CR1-0004、CR1-0009、CR1-1036；最低参考 CKT 为 9.17268308356451。
冻结输入包 `research/config/cr-anneal-inputs.zip` 已随 Git 保存，包括原生语料、评分参数、完整韵母 fixture、四种子、含标点日常序列和带许可证的移动手评分器。
目标机器无需原电脑的 HTML、词典目录或 `.cache`。准备工具只供维护者重新冻结输入，目标机器不运行它。

## Win11 / RTX 3070 / 64GB

需要 Python 3.10+、Rust/Cargo、CUDA Toolkit（nvcc）、NVIDIA 驱动及 MSVC C++ build tools；均须可从当前 shell 调用。
在仓库根目录运行，推荐 PowerShell 7：

```powershell
pwsh -File tools/run_cr_anneal.ps1 -Mode Audit -Output research/.cache/cr-check
pwsh -File tools/run_cr_anneal.ps1 -Mode Smoke -Output research/.cache/cr-smoke -Duty 0.25
pwsh -File tools/run_cr_anneal.ps1 -Output research/.cache/cr-main -Duty 0.25
```

最后一条无限运行。原命令再次运行自动续跑，不能删除输出目录来“修复”续跑错误。
默认单个持久 GPU 进程、batch=2、CPU Rayon 线程=2、计算/空闲占空比=25%，GPU 温度≥75°C 或空闲显存<1024MiB 时等待。
占空比是程序的主动工作/等待时间比例，不是硬性的 GPU 利用率或功耗上限；短暂峰值仍可能较高。
排名/候选决胜在 CUDA 上执行，语料编码、移动手、模型汇总和核验仍使用 CPU；不保证每台 GPU 都比原 CPU 增量搜索快。
启动/续跑的精确审计是短时连续工作；长期循环按占空比等待。温控等待、PAUSE、STOP 均不会增加退火步数。
`-Hours 12` 限制本次运行时间；`-Rounds 100` 仅增加100个批次；中断最多等一个在途评分请求完成，故时间限制不是硬实时截止。

```powershell
# 暂停（保留进程），继续时移除 PAUSE；停止时创建 STOP。
New-Item -ItemType File research/.cache/cr-main/PAUSE
Remove-Item -LiteralPath research/.cache/cr-main/PAUSE
New-Item -ItemType File research/.cache/cr-main/STOP
# 停止后，移除 STOP，再用原命令续跑。
Remove-Item -LiteralPath research/.cache/cr-main/STOP
```

Ctrl+C 或断电也可从最后提交批次恢复。不要同时用两个进程写同一个输出目录；进程锁会阻止这种情况。

## 搜索范围与方向

固定主码调区：四声上排、二三声中排、一声/轻声下排。固定形辅 AVUIO、toneKeysByTone=IVUAO、词辅12/213/24。
不限 QZ，不强制 Q 空韵；18个韵根整体归入10个非空组，不引入声调专属韵母例外，普通声母 F=0。
所有候选硬限 D≤2、M_lower≤22、M_guard≤24；M21链进一步要求 M_lower≤21。

| 链 | 目标 | 启用种子 |
|---|---|---|
| ckt | 在预算内降低完整四轨 CKT | 四个全部 |
| balanced | CKT退火，同时日常含标点移手≥122.9586249541484、四轨左小指峰值≤10.79140049% | CR0-0374、CR1-0004 |
| m21 | M_lower≤21 下继续降低 CKT | CR1-0004、CR1-0009 |

默认共8条独立链，轮流交给同一个 GPU 小批量评分，不是8个并行占用 GPU 的进程。
每条链每次提出一个候选并独立按温度接受；不会从一批候选中先挑最低者再冒充普通退火。
所有评分结果参与 CKT、移手、左小指、D、M下界、M_guard 的非支配前沿维护，因此移手不退步的方案不会被单一最低 CKT 覆盖。

算子包括：韵根迁移、根互换、er/ü联合归组、韵组换键/换位、根迁移与相关韵组换键联动、声母移键/互换，以及20%概率的多步组合扰动。
组合只验证最终布局，允许跨过单步不满足预算的中间状态。
默认允许调整首键，但依然执行 D/M预算；`-FixedFirst` 可单独跑固定声母的控制路线。
每链10000步从0.02冷却到0.00002后重热，以35%概率回到该链原种子，其余从符合本链约束的前沿取种。
这是带重热、重启和不对称提案的优化启发式，不是用于估计分布的严格 MCMC；没有“潜力已经挖尽”的有限终止保证。

建议先连续运行默认路线；需要更多独立探索时，停止它，再换随机种子和新输出目录轮流跑，避免在3070上同时启动多个 GPU进程：

```powershell
pwsh -File tools/run_cr_anneal.ps1 -Output research/.cache/cr-fixed -Seed 20261114 -FixedFirst
pwsh -File tools/run_cr_anneal.ps1 -Output research/.cache/cr-restart -Seed 20261115
```

不要主动提高 D/M 预算。需改变温度、周期、种子、批量或约束时，用新输出目录；占空比、线程数、温控、运行时长可以在续跑时调整。
额外选项见 `python tools/run_cr_anneal.py --help`。Windows入口先构建CUDA版本，Linux也可用 `just --justfile research/cr-anneal.just run`。

## 精度、恢复与输出

- 启动时四个种子全部进行 CUDA/CPU 逐条 outcome 一致性核验，再核对已独立 JS 审计的 CKT、移手、左小指峰值。
- 默认每100批次抽查 CUDA/CPU；每个新入选前沿必须通过 CPU 核验；续跑时重新核验每条链的当前 CKT。
- SQLite一个事务保存缓存、链、完整 RNG 状态和前沿；未完成批次回滚并重放。SHA-256约束冻结输入、运行参数和评分/调度源码。
- `search.sqlite` 是恢复真值；缓存默认保留最近50000个状态，文件页复用。前沿最多256项，以多目标拥挤距离裁剪，因此导出是有限代表集，并非所有历史非支配点。
- `status.json` 是进度；`frontier.json` 是经CPU核验的代表方案，含每项指标、完整状态、展开韵母按键和韵根分组。JSON输出采用原子替换，可随时读取。
- `dailyPinky` 是含标点日常按键占比；`pinky` 是完整四轨Q/A/Z负荷占比的最大值，二者不能混用。

完整验证最终新冠军时，再导入现有 JS benchmark 或制作报告；不要直接修改生产布局。

## 给目标机器的简短 prompts

本机验证（2026-11-13，Win11 / RTX4060 Laptop 8GB / CUDA12.5）：6项搜索与恢复测试、3项辅助键语义测试通过；
四种子CUDA/CPU逐outcome核验以及独立JS参考指标全部通过；真实CUDA先跑12批再恢复5批，累计34个新候选，
覆盖短周期重热与25%占空比。最后13个前沿代表均经CPU核验，最低CKT仍为9.172683083564511。
PowerShell的Build/Audit入口实跑通过。短测没有证明吞吐优势，也没有产生低于原种子的CKT冠军；目标3070应先做同样审计。

**首次启动：**
> 在 shuangpin-layout-benchmark 的 research/cr-frontier-gpu-anneal 分支，按 docs/CR_FRONTIER_GPU_ANNEAL.md 为 RTX3070/64GB/Win11 先做 Audit 和 Smoke，通过后启动默认长期 CUDA 退火。保持 D≤2、M≤22/24，默认资源限制；保留断点，不改生产布局。检查后报告实际 GPU、种子复核及输出目录。

**续跑与汇报：**
> 继续 CR 四种子 GPU 退火：检查已有 status.json/search.sqlite，保持原参数和输出目录恢复，不重置断点。比较最低CKT、移手不退步、M21三条前沿，给出新优胜者及相对四种子的变化；没有改善就如实报告。

**另开独立方向：**
> 按 CR_FRONTIER_GPU_ANNEAL.md 先停止当前进程，再以新随机种子和新输出目录轮流探索固定声母与联合声母两条路线，保持原D/M预算与资源限制；不可同时开多个GPU进程，不覆盖旧结果。

## 60 小时结果的有限后续探索（2026-11-16）

`11baa8e` 的三种代表经一步邻域、抽样组合、短退火继续检查，约束保持 D≤2、
M≤22/24（高日常路线 M≤21/24），并保护其原日常分与左小指上限。
在 1,453 个去重状态中，均衡路线取得 9.127050251，高日常路线取得
9.168184965 / 日常130.272304，另保留日常130.786233的取舍。
原辅序 12/213/24 下，最低 CKT 纪录仍为 9.121110147。

额外枚举每布局 144 种纯形辅顺序后，原冠军采用21/231/14取得9.113794320，
但小指峰值略增；采用21/213/14可得9.115761216且小指峰值不增。
九种认知参数扰动及原生全语料复核见
[完整后续报告](../research/notes/2026-11-16-cr-frontier-followup.md)。
这些是有限搜索结果，不是全局最优证据；未改生产布局。

复现入口：`just cr-frontier-followup research/.cache/cr-frontier-followup-replay`、
`just cr-frontier-followup-auxiliary`、`just cr-frontier-followup-report`。
使用不同新目录做独立实验；已有目录保存跨阶段缓存，重新运行搜索阶段会追加一轮。
本轮使用两个低优先级 CPU 增量评分进程及一个串行完整核验进程，无需重启原GPU退火。

## 新稳健辅序下的三路线精修（2026-11-16）

将已发布的0a4ee7fb52、3d3dcbafc0、29ce221cfe作为新起点，在各自稳定辅序下
重新检查单步、近优组合、韵根与键位联动及跨路线布局。共保存3,216个布局×辅序
评分条目；跨辅序只传递声韵布局，分数按目标路线重新计算。

固定当前辅序时，0a路线得到795c0eee49：CKT9.159766006、日常131.157665；
3d路线得到6a384d9d0d：CKT9.158771740、日常130.602062，二者均M21/24。
最低CKT路线仍为29ce221cfe、9.113794320。新布局再次枚举144辅序及四个六维
认知成本网格，结果、其他人体工学取舍和核验见
[本轮研究报告](../research/notes/2026-11-16-cr-stable-neighbors.md)。
重选稳健辅序后三者均为21/231/14；795c0eee49的CKT为9.159565262，但其辅序
四网格首选不一致、平均排名仅领先第二0.119899。6a384d9d0d四网格首选一致，
平均排名领先第二1.938022；不能把默认单点最低分与宽网格稳健首选混用。
候选保存在研究档案中，本轮没有修改R11页面。

新机器先`just cr-stable-neighbors-build`，随后可用
`just cr-stable-neighbors local`、`polish`、`coupled`、`transfer`追加阶段；
`just cr-stable-neighbors export`导出，`just cr-stable-neighbors-auxiliary`重算辅序，
`just cr-stable-neighbors-report`独立核验并出报告。
阶段的候选ID、实际评分状态、约束、词辅序专属语料哈希和输入来源随JSON及gzip保存。
默认最多8个低优先级增量进程；`--workers`可调1至16，不改变目标或抽样。

## f0ae939a38 单独精修（2026-11-16）

单独以已发布的21/231/14为目标，起点CKT9.122664475500086，日常分下限
126.23457023071755，四轨左小指上限9.032422256373%，D≤2、M≤22/24。
本轮不传入其他路线的布局。除单步及组合搜索外，增加`beam`阶段：按CKT选择
当前中心最接近的三个已评分单步邻居，完整展开下一步，所有终点仍检查原预算和日常下限，
入选者完整复算小指。这样能发现一项改动补偿另一项改动日常损失的两步路径。

入口为`just cr-balanced-followup local`、`just cr-balanced-followup beam`、
`just cr-balanced-followup polish`、`just cr-balanced-followup coupled 0 12`。
最后一条用12个低优先级分片检查该中心由现有组合算子生成的全部合规候选；
它不代表所有可能的多步组合。`just cr-balanced-followup export`将档案写入独立的
`research/notes/2026-11-16-cr-balanced-followup-*`，
`just cr-balanced-followup-auxiliary`枚举144辅序及四个六维成本网格，
`just cr-balanced-followup-verify`独立重建终码、记忆账及日常回放。
子集导出必须指定独立前缀，避免覆盖前三路线的研究档案。

六个搜索阶段共评分2,949个去重状态，起点和两个优胜布局经完整Rust评分。
固定21/231/14时，最优为`667610a3fc`：CKT由9.122664476降至9.120831894，
减少0.001832582；日常分由126.234570升至126.582914，M22/24、D2、
四轨左小指峰值9.0324%保持不变。最后271个单步邻居未再改进。
这只是有限邻域探索，未证明更远的多步路径没有收益。

相对f0的变化为ai/in/uai/ün组下排B→C、ing四声区Y→E、ing二三声区H→G，
以及a/ia/ua组二三声区J→H；首键与18根分组不变。
中间布局`fab751bbbe`采用同一辅序时，CKT9.121859934、日常126.757985，
是日常分更高的取舍，完整状态保留在评分档案中。
主代表及所有阶段见
[布局档案](../research/notes/2026-11-16-cr-balanced-followup-finalists.json)，
其他原生指标、成本排名与独立核验分别位于同前缀的`-auxiliary.json`、
`-robustness.json`、`-native.json`、`-verification.json`。

全144辅序重算后，默认最低分与四网格稳健首选仍为21/231/14，四网格首选一致。
四网格等权Top1比例96.501%，平均排名领先第二名2.175688；第二名21/231/12的
默认CKT高0.000706673（原f0的对应差为0.000549014）。这个绝对差仍很小，
四网格一致也不意味着每个参数点都第一。

| 原生终码指标 | 原f0 | 667610a3fc |
|---|---:|---:|
| 最大单指峰值%↓ | 28.4775 | 28.0861 |
| 单字异键同指率%↓ | 5.5277 | 5.3508 |
| 右小指峰值%↓ | 7.4627 | 7.4682 |
| 四轨基准排下限%↑ | 34.9349 | 34.9349 |
| 加权平均码长↓ | 3.770904624 | 3.770137221 |
| 加权选重率%↓ | 0.20629 | 0.20388 |

加权纯运动上界从343.230632ms微升至343.316522ms；完整认知成本计入后的加权
有效时间从425.868974ms降至425.707929ms。右小指与纯运动项有小幅取舍，
不能把CKT下降描述成所有列都改善。以上均为冻结评测环境中的模型结果。
本轮保留为研究候选，没有修改R11页面。

## f0 原始中心的921候选补齐（2026-11-17）

固定原始`f0ae939a38`中心、21/231/14辅序及其原有日常、小指和M约束，
重新构造当时的921个合规组合候选，将240/921补齐为921/921。
复用已有328个评分（含原抽样240个），新增评分593个；候选集合包含一项与起点等价的提案。
优胜选择仅允许这个固定候选集合与起点。

补齐后仍未低于f0的CKT **9.122664475500086**。
最接近的非起点候选为`e01427fb31`，CKT9.123626931643825，
比起点高0.000962456；其日常分126.890553是另一种取舍。
本次覆盖范围就是原始921集合，没有增加新的联合算子或展开其他中心。

`just cr-f0-origin-complete`复现定点补齐，`just cr-f0-origin-verify`独立全量JS核对
固定辅序得分、纯形辅语义和记忆账。原始中心与当前CPU评分重新校准，分片逐一校验锚点。
全部候选ID、原240抽样、来源哈希、复用/新增分界、覆盖完成标志及状态见
[补齐档案](../research/notes/2026-11-17-cr-f0-origin-completion-finalists.json)，
完整评分与独立核验分别为同前缀的`-scores.json.gz`和`-native.json`。
