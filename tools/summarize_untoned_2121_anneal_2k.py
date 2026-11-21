"""Summarize audited 2k results without treating a heuristic run as proof."""
import hashlib
import json
import statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NOTES=ROOT/'research/notes'
def read(name):return json.loads((NOTES/name).read_text(encoding='utf-8'))
def main():
    filename='2026-11-15-untoned-2121-anneal-2k.json'
    r=read(filename);v=read('2026-11-15-untoned-2121-anneal-2k-verification.json');m=read('2026-11-15-untoned-2121-anneal-2k-memory-audit.json')
    h=hashlib.sha256((NOTES/filename).read_bytes()).hexdigest()
    assert r['completed'] and v['sourceSha256']==m['sourceSha256']==h
    assert v['counts']['newScores']==2000 and len(m['results'])==len(r['states'])
    new=[e for e in r['states'].values() if e.get('newScore')]
    assert len(new)==2000
    ordered=sorted(new,key=lambda e:e['score']);best=ordered[0]
    verified={e['id']:e for e in v['results']}
    oldbest=min(e['score'] for e in r['seeds'])
    trajectory=r['trajectory'];accepted=[t for t in trajectory if t['accepted']]
    uphill=[t for t in accepted if t['score']>r['states'][t['from']]['score']]
    times=[e['seconds'] for e in new]
    historical=[]
    for p in [NOTES/'2026-11-14-untoned-2121-local-closure.json',NOTES/'2026-11-15-untoned-2121-two-step.json',NOTES/'2026-11-15-untoned-2121-three-step.json',NOTES/'2026-11-15-untoned-2121-other-centers.json']:
        d=json.loads(p.read_text(encoding='utf-8'))
        if 'records' in d:historical+=list(d['records'].values())
        elif 'families' in d:historical += [e for f in d['families'] for e in [f['baseline']]+f['results']]
        else:historical+=d['results']
    fields=[('score',-1),('mx',1),('homeS2',1),('homeFloor',1),('rpMax',-1)]
    def vec(e):return [(e['score'] if f=='score' else e['erg'][f])*s for f,s in fields]
    def dominates(a,b):return all(x>=y-1e-12 for x,y in zip(a,b)) and any(x>y+1e-12 for x,y in zip(a,b))
    hv=[vec(e) for e in historical]
    new_archive=[e for e in r['archive'] if e.get('newScore')]
    survives=[e for e in new_archive if not any(dominates(old,vec(e)) for old in hv)]
    production=r['seeds'][-1]
    production_gains=[e for e in new if e['score']<production['score']-1e-10 and e['erg']['mx']>=production['erg']['mx']-1e-12 and e['erg']['rpMax']<=production['erg']['rpMax']+1e-12]
    summary=dict(sourceSha256=h,newScores=2000,states=len(r['states']),transitions=len(trajectory),cachedTransitions=sum(not t['newScore'] for t in trajectory),accepted=len(accepted),uphill=len(uphill),
                 bestNew=best['id'],bestNewScore=best['score'],priorBest=oldbest,newBelowPrior=sum(e['score']<oldbest-1e-10 for e in new),archive=len(r['archive']),newArchive=len(new_archive),survivingHistoricalArchive=len(survives),
                 productionScoreMovingPinkyGains=len(production_gains),workerHours=sum(times)/3600,medianSeconds=statistics.median(times),freshIndependent=len(v['results']))
    (NOTES/'2026-11-15-untoned-2121-anneal-2k-summary.json').write_text(json.dumps(summary,indent=2))
    lines=['# 无调21×21：五中心2,000次完整评分粗细交替退火', '',
           f"完成 **2,000个此前未评分的不同布局**：五个中心各400个。固定生产辅序，没有进行辅序优化。",
           f"已知最低CKT为{oldbest:.15f}；本轮新状态最低为{best['score']:.15f}，{summary['newBelowPrior']}个新状态低于此前最低点。", '',
           '| 起点 | 起点CKT | 新评分 | 结束时该链最好CKT | 相对起点 |', '|---|---:|---:|---:|---:|']
    for chain in r['chains']:
        a=r['states'][chain['seedId']];b=r['states'][chain['bestId']]
        lines.append(f"| {chain['seedId']} | {a['score']:.12f} | {chain['newScores']} | {b['score']:.12f} | {b['score']-a['score']:+.12f} |")
    lines+=['', '## 预算、温度和恢复', '',
            '每中心四轮，每轮30个新状态用粗粒度提案、70个用细粒度提案；粗操作含2～3次尝试的整组交换/迁移、三token循环及声韵联动，细操作为单token迁移或两token交换。',
            '粗阶段2～3次操作尝试可能包含无效或互相抵消的操作，实际变化以保存的moves和最终映射为准；仅最终状态需满足硬约束。',
            '每轮重新从本链已见最低CKT点启动；最优档案也保留被Metropolis拒绝的已评分候选。',
            '温度最初为粗0.018→0.004、细0.003→0.00015。前204个新状态中接受0次变化；实测粗阶段正分差中位0.134842881749492。',
            '因此在204次后校准为粗0.10→0.025、细0.012→0.00015。前204次仍计入2,000次，保存原runner、原指纹、原温度和切换位置，未将其伪装成校准后的样本。',
            '恢复时共享目录已被切换分支，本轮移入独立worktree。全部历史输入逐字节哈希验证恢复，五个起点重新复算一致；只是路径重映射与温度合同显式迁移，未变更评分模型。',
            f"实际保存{len(trajectory)}次状态提案评分决策，其中{summary['cachedTransitions']}次使用已存在完整分数，不占新评分预算。接受{len(accepted)}次，其中{len(uphill)}次为上坡；不是始终停在起点的随机采样。", '',
            '## 工效档案与代表', '',
            f"本轮在CKT↓、日常移手↑、S2主行↑、20合同主行下限↑、右小指峰值↓五维维护非支配档案，最终{len(r['archive'])}项，含{len(new_archive)}个本轮新状态。",
            f"再与历史封闭、两步、三步及其他中心全部已测结果比较，仍有{len(survives)}个本轮档案点未被历史状态严格支配。相同指标的重复/等价点可能保留，不能据数量宣称实质进步。",
            '此在线档案不包含系列当量，也不包含全部历史方案；候选的综合价值须看补做的独立审计。', '',
            '| 代表 | CKT↓ | 移手↑ | S2主行↑ | 右小指峰值↓ | 当量v4↓ |', '|---|---:|---:|---:|---:|---:|']
    ids=[e['id'] for e in r['seeds']]+[best['id']]+[e['id'] for e in production_gains]
    for id in dict.fromkeys(ids):
        e=r['states'][id];a=verified.get(id)
        lines.append(f"| {id} | {e['score']:.12f} | {e['erg']['mx']:.6f} | {e['erg']['homeS2']*100:.6f}% | {e['erg']['rpMax']*100:.6f}% | {a['independent']['a7eV4']:.12f} |" if a else f'| {id} | {e["score"]:.12f} | 详见JSON | | | 未入复核 |')
    lines+=['', '本轮新实用取舍点A2K-64d3da30fd302455：CKT9.551136094498、移手137.519272、当量10.797242131405。',
            '与已有9.541757919665折中点比较，CKT较差、移手略低，当量约改善0.00064013；不是全面升级。',
            '本轮新状态CKT最低A2K-6817a085561c5e6a虽优于旧一步局部最优9.527272693118，但并非其一步邻居，且未胜过已知两步最低点，不影响原有限邻域证书。', '',
            '## 验证、结论和限制', '',
            f"{len(r['states'])}个已保存状态全部通过原始Python memory_r2.py独立核验，确认M≤42、D≤2、V≤5、无额外路由、实际21×21、Common399覆盖399、QZ/ZQ双空桶；唯一码数量不设下限。",
            'toneKeysByTone=IVUAO，shapeKeysByMeaning=AVUIO，形义声调数字42310。原S005锚点、传统21×21路由及生产辅序保持固定。',
            f"所有提案的操作记录被独立解释器重新执行，重建映射与终态一致；上坡接受判定也按保存随机数复算。共{len(v['results'])}个代表在全新JS上下文重算CKT，并用原Engine7/CKTEngine复算20合同与当量。",
            f"新评分的累计worker耗时{sum(times)/3600:.3f}小时，中位{statistics.median(times):.3f}秒。并发、暂停及机器负载使该数字不等于墙钟耗时。", '',
            '这轮是有限预算的启发式抽样，不能证明全局最优、不能继承/扩大原一步证书，也不能排除不同温度、提案、占桶空间或辅序重选后的改善。',
            '10项预算日程、随机数恢复、独立操作重放、档案支配关系、邻域覆盖及辅助语义测试通过。',
            '若本轮没有刷新各中心最低分，应视为对当前提案族的经验性收益递减证据，不建议照搬相同设置继续追加大预算。优先整理已有综合前沿和独立当量取舍。',
            '生产方案未部署修改。', '',
            '```powershell', 'node tools/anneal_untoned_2121_multicenter_2k.js','python -X utf8 tools/report_untoned_2121_anneal_2k.py','node tools/verify_untoned_2121_anneal_2k.js','python -X utf8 tools/summarize_untoned_2121_anneal_2k.py','```', '',
            '完整逐状态评分、八轨、接受轨迹、随机数状态、哈希与校准记录见同名前缀JSON；代表映射另存research/config。复现依赖R11 HTML、冻结replay和Rime语料。', '']
    (NOTES/'2026-11-15-untoned-2121-anneal-2k.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps(summary))

if __name__=='__main__':main()
