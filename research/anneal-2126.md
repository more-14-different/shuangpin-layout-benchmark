# 21×26 三路线长期 GPU 辅助退火

分支：`research/toned-2126-gpu-anneal`。固定三个起点：

| route | 条件 | 完整 shape-only CKT |
| --- | --- | ---: |
| keep | Q 韵空键 9/9/7，上二三/中四/下一轻 | 8.890382234262121 |
| swap | Q 韵空键 9/9/7，上四/中二三/下一轻 | 8.919768532843102 |
| full26 | 10/9/7，上二三/中四/下一轻 | 8.871530178018425 |

## 做什么

18 个去介音根韵统一分成十个非空组，可迁移、两根互换；三行整组键位可换位或改键；
144 辅序可变。随机提案包含 1/2/4/8 步联动，能跨过单步局部边界。
每条路线三条温度链（0.002/0.01/0.04 CKT），每链 2048 次提案周期退火再加热；
每 32 次尝试同路线链间交换。三个路线轮流推进，不让一条独占算力。
首键、三种声调分区、实际行键数和 AEUIO 形辅语义固定；不要求 qz 空。
每个根在所有声调使用同一组属，没有单声调例外。Q 空键路线始终检查全部合法音节。

GPU 使用 CuPy/CUDA 批量计算**筛选启发分**：带权音节双键 motor 与采样词主码碰撞。
它不是 CKT，未包括完整辅码竞争或四字词，不能单独用它评选冠军。
默认每批 64 个提案，65% 选最低启发分，35% 随机直送完整评分；后者也让辅序变异获得机会。
**完整 CPU CKT 决定每次退火接受和冠军更新**，保留原池竞争及词长平衡。
这是非对称提案的优化启发式，不声称采样 Boltzmann 稳态，也不保证全局最优。
当前未证明端到端 GPU 加速比；CPU 完整评分仍可能是主要瓶颈。

## 另一台 Windows 电脑：最短路径

依赖 Node.js 24、uv、PowerShell 7、just、CUDA 12.x 工具包和兼容 NVIDIA 驱动。
锁定 Python 3.14、NumPy 2.5.4、cupy-cuda12x 14.2.0。
只安装一种 CuPy 包。CUDA 版本不同可另建环境调整 CuPy，先通过启动自检。

1. 在干净克隆/独立工作树检出上述分支；不要覆盖其他研究线的未提交文件。
2. 从本机复制 `research/.cache/anneal-2126-bundle.zip`（约 69 MB），放到目标仓库；
   解压到 `research/.cache`，最终应有 `research/.cache/anneal-2126-bundle/manifest.json`。
   数据包包含语料、参考分数和电机表，搜索不依赖雪拼路径，也不依赖忽略的 HTML。
   ZIP 不在 Git 中，必须单独复制；不要只拉取代码就直接运行。
3. 在仓库根目录：

```powershell
just --justfile research/anneal-2126.just setup
just --justfile research/anneal-2126.just test
just --justfile research/anneal-2126.just run 24
```

没有 just 时直接执行：

```powershell
uv venv --python 3.14 .venv-anneal
uv pip install --python .venv-anneal/Scripts/python.exe -r research/anneal-2126-requirements.txt
.venv-anneal/Scripts/python.exe tools/anneal_2126.py --bundle research/.cache/anneal-2126-bundle --out research/.cache/anneal-2126-run --hours 24 --batch 64 --gpu-mb 1024 --node-mb 8192 --duty 0.45
```

相同命令自动恢复；`--hours` 是本次运行的时间预算，启动自检不计入。
Ctrl+C 会等当前完整评分返回再保存退出；也可 `just --justfile research/anneal-2126.just stop`。
用 STOP 停止后，恢复前删除你创建的 `research/.cache/anneal-2126-run/STOP` 文件。
运行输出目录有独占 run.lock；断电后先核对锁中 PID 已结束，再删除该锁。
勿并发使用同一输出目录。检查点每次完整评分后原子替换，保存随机数状态。
代码、数据包或搜索合同变化会拒绝续跑；此时用新输出目录，不篡改检查点。
允许续跑时调整 hours/steps/duty/资源上限；batch/seed/cycle/random-proposal/max-multi 固定。

RTX 3070 的默认配置仅单个 Node 评分进程、1GB CuPy 内存池、8GB Node heap 上限。
这些不是系统总内存/总显存硬限制；CUDA context 及 Node 外部内存另计。
`--duty 0.45` 是本任务主动工作/休息比例，不是 nvidia-smi 利用率限额，也不改功耗或风扇。
桌面繁忙可降低 duty 或 batch；batch 变化需新输出目录。OOM 会报错退出，不静默改算法。
显存池机制参考 [CuPy 官方说明](https://docs.cupy.dev/en/v12.3.0/user_guide/memory.html)。

## 输出与扩展实验

`best-keep.json` / `best-swap.json` / `best-full26.json`：完整码表、组属、轨道值、辅序和完整 CKT。
`checkpoint.json`：全部链与 RNG；`improvements.jsonl`：改善历史；`startup.json`：CPU/GPU 启发分自检。
不记录每个劣解，控制长期磁盘增长。保存了冠军不意味着已证明其可学习性。
默认最多十个多根组；可用 `--max-multi 6` 新开一组结构更克制的搜索（须包含所有种子）。
这不是校准后的 M。首键、调区及组数固定仍限制可达空间，不能承诺挖尽全部潜力。
长跑后建议多随机种子新开目录、比较辅序/轨道/记忆结构，再做冠军完整邻域和稳健性审计。

原评分器独立复核需要原 HTML、电机表和相同版本雪拼研究脚本，可把 best 文件带回本机：

```powershell
node tools/verify_anneal_2126.js research/.cache/anneal-2126-bundle research/.cache/anneal-2126-run/best-keep.json 'D:\C2D\Documents\rime-snow-pinyin'
```

替换 route 文件可复核其他冠军。源数据指纹变化会拒绝使用，不允许悄悄改变基线。
本机准备新包：`just --justfile research/anneal-2126.just prepare 'D:\C2D\Documents\rime-snow-pinyin'`，
须先具备忽略的 `a7_CKT_R11.html`、`tools/ckt_v4_upstream_role_tables.json`；不覆盖已有 manifest。

## 简短 prompts

**首次运行：**
“检出 research/toned-2126-gpu-anneal，阅读 research/anneal-2126.md；使用我复制的数据包，在 RTX 3070 上完成 CUDA 自检后按默认资源限制运行三路线退火 24 小时。完整 CKT 才能更新冠军，保留所有结构约束，勿修改生产方案。”

**继续：**
“按 research/anneal-2126.md 恢复同一输出目录，再跑 24 小时；不要重置 RNG 或更改搜索合同。报告三路线完整 CKT 改善及约束情况。”

**复核：**
“独立复核三个 best 文件的完整 CKT、辅序、根韵分组和 Q 空键约束；对改善冠军做完整邻域/稳健性审计。启发分不作成果依据，暂不部署。”
