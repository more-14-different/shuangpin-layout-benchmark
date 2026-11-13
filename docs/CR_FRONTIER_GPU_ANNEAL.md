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
