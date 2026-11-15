"""Readable comparison of seven layouts, their optimal policies, and robustness margins."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1];NOTES=ROOT/'research/notes';PREFIX='2026-11-15-untoned-2126-aux-robust'
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def main():
 z=read(NOTES/(PREFIX+'-comparison.json'));p=read(NOTES/(PREFIX+'-pairwise.json'));v=read(NOTES/(PREFIX+'-verification.json'));assert v['passed']
 lines=['# 21×26 无调双空：方案专属辅序与六延时稳健性比较','','七方案各自枚举形辅144套、调辅144套，共2016套原生辅序；每成员对六项独立延时运行1,771,561点完整网格。','',
 '结论：七方案的宽扰动稳健冠军均为形辅 `12/12/24`、调辅 `12/21/13`。A 的默认点最优也与稳健冠军相同，CKT仍为9.082777229838413。默认点速度第一仍为F；宽扰动速度优先改选C。A作为工效均衡候选仍有理由，但不能称为跨延时最稳健的速度首选。','',
 '## 布局和评分口径','','| 简称 | ID | 定位 |','|---|---|---|']
 names={'P':'原生产','D':'旧均衡候选','A':'此前综合首选','B':'低W/高主行','C':'速度与负载折中','F':'默认点最低CKT','M':'运动工效优先'}
 for k,id in z['contract']['ids'].items():lines.append(f'| {k} | `{id}` | {names[k]} |')
 lines+=['','沿用M-R2≤40、D≤3、V≤1、branches0、Common399完整且399码互异、QZ/ZQ双空；shapeKeysByMeaning=AEUIO，toneKeysByTone=IEUAO，42310不变。五辅物理映射固定，本轮优化的是词中取辅的字位和先后，并非重排五个物理辅键。','',
 '完整mass=.99词语料、soft-page-fill-v2、S005固定参考（形12/213/24，调12/213/23）、两成员1:1、字/二字/三字/四字1:3:1:1保持不变。每成员枚举2×6×12=144套二/三/四字词有序双字位。组合两成员共有20,736对，因公式可分离，两成员分别取最小值即为全部配对的最小值。','',
 '所有方案共享同一个公式。默认系数：一、二、三辅键各300ms，选重决策600ms，逐候选扫描50ms，翻页300ms。选重动作额外延时默认0，与选重决策乘同一发生率，非零动作延时可并入决策项。候选页6项；主网格各系数独立取0%–500%、每50%一档。另单列所有系数均正的50%–500%子网格，共1,000,000点。三辅项仍按历史六维扫描保留，候选21×26词轨仅两辅，该项主要影响S005参考，不能将三辅轴直接删掉。','',
 '```text','T(s,m,t;x) = motor(s,m,t)','             +300*x1*firstAuxRate +300*x2*secondAuxRate','             +300*x3*thirdAuxRate +600*x4*selectionRate','             +50*x5*meanRejectedCandidates +300*x6*meanPageActions','CKT(s;x) = 10 * [ Σ_m Σ_t w_t * (T(s,m,t;x)/T(S005,m,t;x))^4 / 12 ]^(1/4)','w = {字:1, 二字:3, 三字:1, 四字:1}; 默认x=(1,1,1,1,1,1)','```','',
 '稳健选择：网格平均竞争排名最低；并列依次比较Top3、Top1、最坏排名、辅序字典序。它与默认点最低CKT是不同目标。网格等权是敏感性诊断，不是用户实际延时的概率分布，也不证明连续区域最优。','',
 '## 各自最优辅序后的默认点CKT','','| 方案 | 稳健辅序CKT | 默认点最优CKT | 默认最优形/调辅序 | 最佳配对领先次佳CKT |','|---|---:|---:|---|---:|']
 for k in ['F','C','A','B','D','M','P']:
  r=z['results'][k];cases=r['cases'];pol=' / '.join(cases[m]['baselineRanking'][0]['policy'] for m in ['keytao','sanpin']);lines.append(f"| {k} | {r['robustPairScore']:.12f} | {r['defaultOptimalPairScore']:.12f} | `{pol}` | {r['defaultOptimalPairGap']:.12f} |")
 lines+=['','只有D的调辅默认点冠军为21/21/13，合成改善约0.000055134；其宽网格稳健冠军仍为12/21/13。其余六方案默认点最优与稳健冠军相同。','',
 '## 冠军和第二名余量','','下表第二名按宽网格平均排名排列；分差为第二名平均排名减冠军平均排名。第一名覆盖率允许并列，不能解释为真人获益概率。默认点次佳配对的CKT分差见上一表。','',
 '| 方案 | 成员 | 稳健冠军 | 第二名 | 冠军Top1 | 冠军平均排名 | 平均排名余量 | 冠军最坏排名 |','|---|---|---|---|---:|---:|---:|---:|']
 for k,r in z['results'].items():
  for m,c in r['cases'].items():
   a,b=c['winner'],c['runnerUp'];lines.append(f"| {k} | {'形辅' if m=='keytao' else '调辅'} | `{a['policy']}` | `{b['policy']}` | {a['top1Rate']:.4%} | {a['meanRank']:.6f} | {c['meanRankMargin']:.6f} | {a['worstRank']} |")
 lines+=['','A的形辅默认第一与第二之差为0.000715185820，调辅为0.000286521657；两成员配对的最小余量为0.000142488339，次优配对只把调辅改为21/21/13。正延时子网格里，A形辅Top1=100%，调辅Top1=86.6248%，两者稳健冠军不变。完整JSON还保留Top3、正子网格全部排名、各辅序默认CKT及冠军与稳健第二名逐点对决统计。','',
 '## 同一延时点下的布局排名','','| 方案 | 固定稳健辅序：最低CKT覆盖率 | 平均排名 | 正延时子网格：最低CKT覆盖率 | 各点重新挑辅序：最低CKT覆盖率 |','|---|---:|---:|---:|---:|']
 first={r['label']:r for r in z['crossLayout']['fixedRobustPolicies']};oracle={r['label']:r for r in z['crossLayout']['pointwisePolicyOracle']}
 for k in sorted(first,key=lambda k:first[k]['meanRank']):lines.append(f"| {k} | {first[k]['top1Rate']:.4%} | {first[k]['meanRank']:.6f} | {p['positiveSubset'][k]['top1Rate']:.4%} | {oracle[k]['top1Rate']:.4%} |")
 lines+=['','固定稳健辅序时，C逐点优于F的覆盖率80.0270%；在所有延时系数均正的子网格为88.2638%。F在默认点仍低0.000616760596，但C更适合宽延时变化下的速度目标。D逐点优于A的覆盖率82.3160%，说明A默认点领先D并不代表宽参数优势；A的运动项更低，而较高认知延时下候选路径成本会改变排名。','',
 '将六项系数同步变化，以1%步长扫描，七方案最低分的区间如下（离散采样区间，不是连续精确交点）：','','| 延时百分比 | 第一名 |','|---|---|']
 for r in p['synchronizedCostSweep']['winnerSegments']:lines.append(f"| {r['startPercent']}%–{r['endPercent']}% | {r['winner']} |")
 lines+=['','## 生产选择意见','',
 '若新的主要目标是延时大范围变化下仍有较低CKT，建议优先C，再保留F作默认速度标杆。C的W峰值5.9286%低于F的6.8216%，但C的A7E-v5约10.2983，高于A约10.2039；C和F都满足原S2当量、A7E-v4门槛。','',
 '若仍以运动工效、移手、同指连击与默认CKT综合权衡，A继续是合适的均衡候选：A的A7E-v4/v5、S2当量和同指连击明显优于C，且其声母不改。此次不足以把A宣布为全目标唯一最佳。建议A与C保留为两个生产试用方向；不因默认点几千分之一的CKT差，忽略工效取舍。B保留作低W/高主行方向，D不再是默认综合首选，但在高认知延时区间仍有竞争力。','',
 'A现有HTML辅序和9.082777229838413分数均经本轮确认，无需因本次扫描改写；本轮没有修改HTML或Rime生产配置。','','## 验证和复现','',
 f"所有2016套组件已归档；P的288套组件与历史哈希锚定材料逐字段相同。14项原词条重新构建的默认最优/稳健策略对照全部通过，最大绝对差{v['maximumFreshDifference']:.3g}。主网格逐成员完整扫描，并列竞争排名阈值沿用历史1e-9（四次幂和）；布局覆盖率也使用既有排名规则，成对胜率另以CKT差1e-9判定。",'',
 '```powershell','just untoned-aux-comparison','just untoned-aux-comparison-test','```','',
 '原实验缓存及输入材料包含绝对路径，迁移需重建或保留原路径；七份components.json.gz、comparison.json、pairwise.json、fresh.json、verification.json保留完整审计。']
 (NOTES/(PREFIX+'-comparison.md')).write_text('\n'.join(lines)+'\n',encoding='utf-8')
 print('Comparison report written')
if __name__=='__main__':main()
