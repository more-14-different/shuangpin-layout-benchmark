"""Summarize fully verified three-hop and other-center bounded experiments."""
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NOTES=ROOT/'research/notes'
def read(name):return json.loads((NOTES/name).read_text(encoding='utf-8'))
def digest(name):return hashlib.sha256((NOTES/name).read_bytes()).hexdigest()

def main():
    three=read('2026-11-15-untoned-2121-three-step.json')
    tv=read('2026-11-15-untoned-2121-three-step-verification.json')
    tm=read('2026-11-15-untoned-2121-three-step-memory-audit.json')
    other=read('2026-11-15-untoned-2121-other-centers.json')
    ov=read('2026-11-15-untoned-2121-other-centers-verification.json')
    om=read('2026-11-15-untoned-2121-other-centers-memory-audit.json')
    assert three['completed'] and other['completed']
    assert tv['sourceSha256']==tm['sourceSha256']==digest('2026-11-15-untoned-2121-three-step.json')
    assert ov['sourceSha256']==om['sourceSha256']==digest('2026-11-15-untoned-2121-other-centers.json')
    assert len(three['results'])==tv['pathsVerified']==len(tm['results'])==160
    assert ov['pathsVerified']==sum(len(f['results']) for f in other['families'])==72
    assert len(om['results'])==75
    tb=min(three['results'],key=lambda e:e['score']);ta=next(e for e in tv['independent'] if e['id']==tb['id'])
    two=three['twoStepBest'];twoa=next(e for e in tv['independent'] if e['id']==two['id'])
    steps=next(e['actualSteps'] for e in tm['results'] if e['id']==tb['id'])
    selected=[]
    for f in other['families']:
        best=min(f['results'],key=lambda e:e['score']);a=next(e for e in ov['results'] if e['center']==f['id'] and e['id']==best['id'])
        baseline=next(e for e in ov['results'] if e['center']==f['id'] and e['id']==f['baseline']['id'])
        selected.append(dict(center=f['id'],baseline=baseline,best=best,independent=a['independent']))
    mappings=[]
    for e in selected:
        row=e['best'];mapping={k:row[k] for k in ['id','capacity','initialMap','finalMap','audit','score','erg','mutation']}
        mapping.update(parent=e['center'],toneKeysByTone='IVUAO',shapeKeysByMeaning='AVUIO',toneDigitsByShapeMeaning='42310',status='bounded 24-neighbor research screen; not locally closed')
        mappings.append(mapping)
    practical_family=next(f for f in other['families'] if f['id']=='CROSS-12')
    practical=next(e for e in practical_family['results'] if e['mutation']=='finalMap:move o(G)→D')
    practical_a=next(e['independent'] for e in ov['results'] if e['id']==practical['id'])
    mappings.append(dict(practical,toneKeysByTone='IVUAO',shapeKeysByMeaning='AVUIO',toneDigitsByShapeMeaning='42310',status='research ergonomic representative; not locally closed'))
    (ROOT/'research/config/untoned-2121-other-center-finalists-20261115.json').write_text(json.dumps(dict(layouts=mappings),indent=2))
    lines=['# 无调21×21：三步定向与其他中心探索', '',
        '三步定向验证160个状态，没有低于两步最低点9.525454565824509。',
        f"三步最低为 **{tb['score']:.15f}**，但它的工效显著优于两步极端速度点，值得保留为取舍点。", '',
        '| 方案 | CKT v5.1↓ | 移手分↑ | S2主行↑ | 20合同主行下限↑ | 系列当量v4↓ |', '|---|---:|---:|---:|---:|---:|']
    for label,row,a in [('两步速度最低',two,twoa),('三步本轮最低',tb,ta)]:
        lines.append(f"| {label} | {row['score']:.12f} | {row['erg']['mx']:.6f} | {row['erg']['homeS2']*100:.6f}% | {row['erg']['homeFloor']*100:.6f}% | {a['a7eV4']:.12f} |")
    lines+=['',f"三步点相对两步最低点，CKT仅高{tb['score']-two['score']:.12f}；移手增加{tb['erg']['mx']-two['erg']['mx']:.6f}，当量降低{twoa['a7eV4']-ta['a7eV4']:.6f}。", '',
        '## 三步路径和范围', '', '本轮三步最低点从原一步局部最优9.527272693117506出发：', '']
    lines += [f'{i+1}. `{s}`' for i,s in enumerate(steps)]
    lines += ['', '两步中间点为9.528973111046405，第三步零声母迁移后降到9.525486572545312；路径中允许暂时退步。',
        '这不是“上一轮两步最低点直接加第三步”得到的方案，属于另一条三步路径。', '',
        f"从36个低代价一步入口、已测160个两步父状态共尝试{three['screen']['attempted']}次接续；排除token编辑冲突{three['screen']['conflicts']}次，排除不属于真实单步算子的接续{three['screen']['invalidStep']}次，去重后{three['screen']['uniquePool']}个合法终态。",
        '事先选定160个评分，覆盖两步最低点的全部31个可接续、互不冲突的第三步变化，另取共享键位、低预测代价及工效修复代表。',
        f"其中{sum(e['reused'] for e in three['results'])}个复用绑定输入合同的既有完整评分；其余重新评分。{sum(e['score']<three['base']['score']-1e-10 for e in three['results'])}个低于旧一步中心，0个低于两步最低点。", '',
        '这不是三步全穷举，也不证明9.52545456在所有三步路径内最优；尤其不覆盖重叠token的接续、更大退步入口和未选样终态。', '',
        '## 其他中心：每个24个近邻', '',
        '| 中心 | 原CKT | 本轮最低CKT | 最后一步 | 移手分↑ | S2主行↑ | 当量v4↓ |', '|---|---:|---:|---|---:|---:|---:|']
    for e in selected:
        row=e['best'];lines.append(f"| {e['center']} | {e['baseline']['score']:.12f} | {row['score']:.12f} | {row['mutation']} | {row['erg']['mx']:.6f} | {row['erg']['homeS2']*100:.6f}% | {e['independent']['a7eV4']:.12f} |")
    lines += ['', f"三个中心合计72个近邻，{sum(e['score']<f['baseline']['score']-1e-10 for f in other['families'] for e in f['results'])}个改善各自CKT。基线均以固定生产辅序重新复现。",
        '对每个中心枚举合法邻域，再事先挑选24个：低双拼运动耗时、接近基线运动耗时、声母变化、高移手和整组变化。',
        '运动指标仅作选样，不代替完整CKT评分。未扫描所有邻居，不能声明这些中心局部最优。', '',
        '各中心最低点与本轮前基线的变化：', '']
    for e in selected:
        row=e['best'];b=e['baseline'];lines.append(f"- {e['center']}：CKT {row['score']-b['score']:+.9f}；移手 {row['erg']['mx']-b['erg']['mx']:+.6f}；S2主行 {(row['erg']['homeS2']-b['erg']['homeS2'])*100:+.6f}个百分点；当量 {e['independent']['a7eV4']-b['independent']['a7eV4']:+.9f}。")
    lines += ['', '这轮更有价值的发现是可迁移的零声母O:R→C：在两个人体工学中心保留原有键频负荷与移手指标，降低CKT。',
        '历史端点的o:B→J也改善多个指标，但必须保留各维度实测取舍，不能据单一CKT排名淘汰其他方案。', '',
        '### 额外保留的实用折中点', '',
        f"CROSS-12上的`o:G→D`不是该中心CKT最低点，但更值得保留为综合候选：CKT **{practical['score']:.12f}**、移手 **{practical['erg']['mx']:.6f}**、当量 **{practical_a['a7eV4']:.12f}**。",
        '相对原CROSS-12，CKT、移手和当量同时改善，S2主行和小指峰值保持；20合同主行下限在浮点精度内相同。',
        '不能仅按每个中心的最低CKT保留一枚方案。它与零声母迁移点代表不同取舍，映射都已单独存档。', '',
        '## 审计与后续', '',
        f"三步160条完整路径均重新用冻结算子枚举器核验，160个终态通过原始memory_r2.py复审；{len(tv['fresh'])}个关键点全新上下文复算；{len(tv['independent'])}个代表独立20合同审计。",
        f"其他中心3个基线和72个候选共75项通过原始记忆审计；72条一步路径全部复核；{len(ov['results'])}个代表全新CKT与20合同审计。",
        '12项路径、算子覆盖、映射往返与辅助语义测试通过。',
        '全程M≤42、D≤2、V≤5、实际21×21、无额外路由、QZ/ZQ双空桶；唯一码不设下限。',
        'toneKeysByTone=IVUAO、shapeKeysByMeaning=AVUIO、形义序声调数字42310。固定生产辅序与固定S005锚点，尚未重选候选专属稳健辅序。', '',
        '建议下一阶段转向综合Pareto前沿及候选专属辅序复核，重点保留9.539058、9.543783这类高移手取舍点；纯速度研究可暂缓扩大深度。',
        '当前新点尚无局部最优证书，生产Rime未修改。', '',
        '```powershell', 'node tools/probe_untoned_2121_three_step.js','python -X utf8 tools/report_untoned_2121_three_step.py','node tools/verify_untoned_2121_three_step.js',
        'node tools/probe_untoned_2121_other_centers.js','python -X utf8 tools/audit_untoned_2121_other_centers.py','node tools/verify_untoned_2121_other_centers.js','python -X utf8 tools/report_untoned_2121_multicenter.py','```', '',
        '所有逐状态结果、路径、八轨分量及审计位于同目录对应three-step和other-centers前缀JSON；映射另存research/config。',
        '依赖本机R11 HTML、冻结replay和Rime语料；输入与评分源哈希绑定，支持同合同恢复。', '']
    (NOTES/'2026-11-15-untoned-2121-multicenter.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps(dict(threeStates=160,otherCandidates=72,bestThree=tb['score'],otherBest=[e['best']['score'] for e in selected])))

if __name__=='__main__':main()
