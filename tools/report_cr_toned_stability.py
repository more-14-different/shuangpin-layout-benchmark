"""Explain stable-policy choices, second-place gaps, and the exact publication contract."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-16-cr-toned-stable-policies'


def key(policy):
    return '/'.join(policy[k] for k in ['word2','word3','word4'])


def main():
    report=json.loads(PREFIX.with_suffix('.json').read_text(encoding='utf8'))
    rows={r['id'].rsplit('-',1)[-1]:r for r in report['results']}
    order=['f0ae939a38','3d3dcbafc0','0a4ee7fb52','29ce221cfe']
    lines=['# 四种 CR 带调方案：大范围词辅序稳定性与第二名差距','',
        '固定声韵布局、AVUIO 纯形辅、toneKeysByTone=IVUAO（42310），完整枚举二／三／四字词的 '
        '2×6×12=144 套合法位置辅序。不额外使用旧小指上限排除辅序；最终小指、补码与热力图按实际所选终码重算。','',
        '六项默认认知成本依次为首辅300、次辅300、三辅300、选重600、扫描50、翻页300 ms。'
        '六项系数相互独立，使用仓库原稳健分析的竞争排名约定：','',
        '| 网格 | 每系数档数 | 参数组合数 |','|---|---:|---:|']
    for name,g in report['grids'].items():
        lines.append(f"| {g['minimum']*100:g}%–{g['maximum']*100:g}%，步长{g['step']*100:g}% | "
                     f"{round((g['maximum']-g['minimum'])/g['step']+1)} | {g['points']:,} |")
    lines += ['', '四网格存在重叠，分别统计后等权合成平均竞争排名；不能把它们的点数之和称作独立随机实验次数。'
        '平均排名越低越优；平局依次比较 Top-3、Top-1、最坏排名和辅序字典序。'
        '四个方案在四个网格中的平均排名第一均一致，汇总结果没有因网格大小而改变首选。','',
        '## 发布辅序与第二名','',
        '| 布局 | 稳健首选 | 默认 CKT v5.1↓ | 综合第二名 | 第二名默认 CKT | 默认分差（第二−首选） | 相对分差 | 平均排名差（第二−首选） |',
        '|---|---|---:|---|---:|---:|---:|---:|']
    for ident in order:
        r=rows[ident]
        lines.append(f"| {ident} | {key(r['selectedPolicy'])} | {r['selectedScore']:.9f} | {key(r['runnerPolicy'])} | "
            f"{r['runnerScore']:.9f} | {r['defaultScoreGap']:.9f} | {r['defaultRelativeGap']*100:.6f}% | {r['meanRankGap']:.6f} |")
    lines += ['', '**默认 CKT 的预留差距都很小，约 0.00018–0.00072（约0.002%–0.008%）。**'
        '这属于模型内的微小领先，不能据此推导同等幅度的真实输入速度优势。'
        '平均排名差衡量参数扰动中的相对稳定性，与默认 CKT 差不是同一单位。','',
        '## 稳定性边界','',
        '| 布局 | 网格 | 首选平均排名 | Top-1比例 | Top-3比例 | 最坏排名 | 相对固定综合第二名的最小CKT差 | 第二名反超比例 |',
        '|---|---|---:|---:|---:|---:|---:|---:|']
    for ident in order:
        r=rows[ident];p=key(r['selectedPolicy'])
        for name,g in r['grids'].items():
            spec=report['grids'][name];winner=next(x for x in g['ranking']if x['policy']==p);margin=g['selectedVsRunner']
            lines.append(f"| {ident} | {spec['minimum']*100:g}%–{spec['maximum']*100:g}% | {winner['meanRank']:.6f} | "
                f"{winner['top1Rate']*100:.3f}% | {winner['top3Rate']*100:.3f}% | {winner['worstRank']} | "
                f"{margin['minGap']:.9f} | {margin['runnerWins']*100:.3f}% |")
    lines += ['', '结论：`f0ae939a38` 与 `29ce221cfe` 的相对排名领先较明显，严格正成本网格下对固定综合第二名始终领先；'
        '含零成本的极端边界仍可反超。`0a4ee7fb52` 也较稳定，但没有处处有效的严格差距。'
        '`3d3dcbafc0` 的 Top-1 比例明显较低，即使在严格正成本网格也有大量反超，'
        '因此应称为“平均排名最优”，不应说成任何罚时下都最优。','',
        '## 稳健首选与默认点最优的区别','',
        '| 布局 | 默认点最低辅序 | 默认点最低 CKT | 采用稳健辅序的默认分数代价 | 所选辅序小指四轨峰值 |',
        '|---|---|---:|---:|---:|']
    for ident in order:
        r=rows[ident];best=r['defaultTop10'][0]
        lines.append(f"| {ident} | {key(best['policy'])} | {best['score']:.9f} | "
            f"{r['selectedScore']-best['score']:.9f} | {r['selectedPinky']*100:.4f}% |")
    lines += ['', '这里按用户要求发布稳定性首选。两种日常方案的稳健辅序未必是默认参数下的最低分；'
        '参考 S005 始终固定12/213/24，每个参数点同步调整参考的认知成本，不对参考重新优化辅序。','',
        '## 公式与保持项','',
        '各轨有效耗时 = 运动耗时 + a1×首辅率 + a2×次辅率 + a3×三辅率 + τ×选重率 '
        '+ s×平均扫描候选数 + p×平均翻页次数。', '',
        'CKT v5.1 = 10×[Σ w轨×(有效耗时候选/有效耗时S005)^4 / 6]^(1/4)，w=(1,3,1,1)。'
        '所有辅序保持相同语料、频率排序、候选池、路由及逐词长权重总量。'
        '此实验改变认知成本，不重选候选路由、不改变字词频率，也不等同于用户打字实测。','',
        'M-T1 声韵记忆账不变；辅序自身的学习成本不在该账内。'
        '历史 CKT v5 保留原12/21/24任务；A7E、固定辅映射及各代消歧表保留各列的历史合同，'
        '适用原生辅序的列、CKT v5.1、生产属性、终码、负荷与热力图使用新辅序。','',
        '## R11 接入','',
        '- 新增 `CR-GPU-f0ae939a38`、`CR-GPU-3d3dcbafc0`、`CR-GPU-0a4ee7fb52`。',
        '- `CR-GPU-29ce221cfe` 保持原 ID 覆盖更新，声韵主码不变；其他既有方案保留。',
        '- 详情页显示实际词辅序、四网格稳定性、综合第二名、默认 CKT 差及平均排名差。',
        '- 完整逐列数值在 `2026-11-16-cr-stable-r11-columns.json`；大网格完整144项排名在同名 JSON。',
        '- `just cr-toned-stability` 重算大网格；`just cr-stable-benchmark` 重算原生及逐列数值并写入本地 HTML。',
        '- `just cr-stable-benchmark-test` 检查排名、策略语义、导入完整性及页面联动。']
    PREFIX.with_suffix('.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print('Wrote',PREFIX.with_suffix('.md'))


if __name__=='__main__':
    main()
