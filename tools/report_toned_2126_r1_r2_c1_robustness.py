"""Explain grid-specific winners and pair margins without rerunning policy ranks."""
import gzip
import json
from pathlib import Path
from audit_toned_2126_r1_r2_c1_robustness import PREFIX,ROOT,SOURCES,REFERENCE,COSTS,read,key,pair_gaps,vectors,grid


def main():
    report=read(str(PREFIX)+'.json');assert report['complete']
    source={r['id']:r for p in SOURCES for r in json.loads(gzip.decompress(p.read_bytes()))['results']}
    reference=vectors(dict(tracks=read(REFERENCE)['references']['v52']['keytao']),COSTS)
    rows=[]
    for r in report['results']:
        rankings=r['grids']['main']['positive']['ranking']
        rows.append(dict(label=r['label'],published=r['publishedPolicy'],publishedOverallPosition=1+next(i for i,v in enumerate(rankings) if v['policy']==r['publishedPolicy']),
            selected=r['selectedPolicy'],runner=r['runnerPolicy'],selectedDefault=r['selectedDefaultScore'],meanRankGap=r['meanRankGap'],
            selectedMeanRank=r['selected']['meanRank'],runnerMeanRank=r['runner']['meanRank']))
    c=next(r for r in report['results'] if r['label']=='C1');by={key(r):r for r in source[c['id']]['policies']}
    comparisons={}
    for name,points,ranking in [('moderate',grid(.5,2,.5),c['grids']['main']['moderate']['ranking']),
        ('mainPositive',grid(.5,5,.5),c['grids']['main']['positive']['ranking']),
        ('extremePositive',grid(1,10,1),c['grids']['extreme']['positive']['ranking'])]:
        first,second=ranking[:2]
        comparisons[name]=dict(first=first,second=second,meanRankGap=second['meanRank']-first['meanRank'],
            defaultFirst=by[first['policy']]['score'],defaultSecond=by[second['policy']]['score'],
            gaps=pair_gaps(by[first['policy']],by[second['policy']],reference,points,8192)['all'])
    output=dict(version=1,sourceReportSha256=__import__('hashlib').sha256(Path(str(PREFIX)+'.json').read_bytes()).hexdigest(),
        mainComparison=rows,C1RangeComparisons=comparisons,htmlChanged=False)
    Path(str(PREFIX)+'-findings.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    lines=['# R1/R2/C1 辅序：宽扰动审计结论','',
        '页面原辅序不是全部由宽扰动选出：R1、C1是默认成本点最优，R2是统一加倍点最优。',
        '本次沿用既有21×26发布定义，六项成本独立0.5–5倍/步长0.5，以144辅序的平均竞争排名选第一；百万点均匀等权。左右小指不筛选，S005同点重算。','',
        '|方案|HTML当前|当前综合排名|宽扰动第一|第二|第一/二平均名次|差|','|---|---|---:|---|---|---|---:|']
    for r in rows:lines.append(f"|{r['label']}|{r['published']}|{r['publishedOverallPosition']}|{r['selected']}|{r['runner']}|{r['selectedMeanRank']:.6f}/{r['runnerMeanRank']:.6f}|{r['meanRankGap']:.6f}|")
    lines+=['','C1按不同范围分别选出的固定第一/二；gap=第二分数−第一分数，负值代表第二反超。','',
        '|范围|第一|第二|平均名次差|第一胜第二比例|gap中位|gap最小|gap最大|','|---|---|---|---:|---:|---:|---:|---:|']
    for name,r in comparisons.items():
        p=r['gaps'];lines.append(f"|{name}|{r['first']['policy']}|{r['second']['policy']}|{r['meanRankGap']:.6f}|{100*p['firstWins']:.4f}%|{p['medianGap']:+.9f}|{p['minGap']:+.9f}|{p['maxGap']:+.9f}|")
    lines+=['','C1在主宽网格第一相对第二没有全域正余量，最小gap为负；不能宣称处处第一或有稳定安全间隔。平均排名优势与CKT绝对优势不是同一量纲。',
        '温和范围0.5–2倍仍是页面当前12/12/23第一。主宽网格改用21/12/23，默认CKT由8.627569388微升至8.628002157（差+0.000432769）；百万点中相对全部144辅序的第一覆盖率61.7035%，不是100%。',
        '极端正成本1–10倍的平均名次第一为21/21/14，但四宽网格等权平均名次，以及两正成本宽网格等权平均相对损失，均仍以21/12/23第一。各网格的分布权重与优化准则应先约定，再解释“稳健第一”。',
        'HTML保持本次审计前的辅序与benchmark，没有静默改为另一辅序。完整144排名见主JSON，按范围独立选择的gap见本说明同名JSON。']
    Path(str(PREFIX)+'-findings.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print(json.dumps(output,ensure_ascii=False))


if __name__=='__main__':main()
