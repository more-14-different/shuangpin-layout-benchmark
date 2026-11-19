"""Compare M19 memory budgets with the earlier M20 fronts and original A."""
import gzip
import json
from pathlib import Path

from search_toned_2126_v52_m19 import ROOT,PREFIX
from report_toned_2126_v52 import continuous
from continuous_shuangpin import Timing

def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def pk(p):return '/'.join(p)


def main():
    search=read(str(PREFIX)+'.json');finals=read(str(PREFIX)+'-finalists.json');verify=read(str(PREFIX)+'-verification.json')
    policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
    old_prefix=ROOT/'research/notes/2026-11-19-toned-2126-v52-onsets'
    old=read(str(old_prefix)+'-comparison.json');old_audit=read(str(old_prefix)+'.json')
    a=next(r for r in read(ROOT/'research/notes/2026-11-19-toned-2126-v52-comparison.json')['results'] if r['id']=='A')
    spec=read(ROOT/'research/config/toned-2126-v52-onset-atoms.json');base=dict(zip(spec['atomNames'],spec['baselineFirstKeys']))
    corpus=read(ROOT/'research/config/continuous-shuangpin-5500.json');timing=Timing()
    f19=next(r for r in read(ROOT/'research/notes/2026-11-19-continuous-shuangpin-5500.json')['results'] if r['id']=='f19a0ad1dc')
    rows=[]
    for l in finals['layouts']:
        v=next(r for r in verify['results'] if r['id']==l['id'] and list(r['policy'].values())==l['policy'])
        ts=v['ergonomics']['tracks'];m=v['memory'];peak=lambda f:max(t[f] for t in ts.values())
        streams={size:continuous(corpus,l,finals['tokenKeys'],timing,corpus['sceneOrder'+size]) for size in ['5500','5000']}
        for size,s in streams.items():s['scoreF19Equals100']=100*f19[size]['msPerHan']/s['msPerHan']
        rows.append(dict(id=l['id'],originRoutes=l['originRoutes'],policy=pk(l['policy']),score=v['score'],doubleScore=v['doubleScore'],memory=m,
            firstKeys=l['firstKeys'],onsetChanges=[dict(atom=k,before=base[k],after=value) for k,value in l['firstKeys'].items() if value!=base[k]],
            leftPinkyPeak=peak('leftPinkyQAZ'),rightPinkyPeak=peak('rightPinky'),homeMinimum=min(t['home'] for t in ts.values()),maxFingerPeak=peak('maxFinger'),
            bothIndexPeak=max(t['finger'][3]+t['finger'][6] for t in ts.values()),nativeTracks=ts,cktTracks=v['tracks'],continuous=streams))
    rows.sort(key=lambda r:r['score'])
    for i,r in enumerate(rows,1):r['label']='M'+str(i)
    raw={r['id']:r for r in rows};old_raw={r['id']:r for r in old['results']};summaries=[]
    for route in search['routes']:
        row=next(r for r in rows if route['name'] in r['originRoutes']);field='score' if route['objective']=='default' else 'doubleScore'
        matching=next(r for r in old_audit['routes'] if r['name']==f"D{route['Dmaximum']}-{route['objective']}")
        previous=next(r for r in old['results'] if matching['name'] in r['originRoutes'])
        summaries.append(dict(route=route['name'],id=row['id'],label=row['label'],score=row['score'],doubleScore=row['doubleScore'],
            Mlower=row['memory']['lower'],Mguard=row['memory']['guard'],D=row['memory']['D'],
            comparedM20Id=previous['id'],objectiveGap=row[field]-previous[field],objectiveGapPct=100*(row[field]/previous[field]-1),
            leftPinkyPeak=row['leftPinkyPeak'],rightPinkyPeak=row['rightPinkyPeak']))
    payload=dict(version=1,baselineA=dict(score=a['score'],doubleScore=old_audit['baseline']['doubleScore'],memoryLower=20,memoryGuard=22,D=3),
        routes=summaries,results=rows)
    Path(str(PREFIX)+'-comparison.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    lines=['# 21×26 CKT v5.2：M上限再减一','',
        '分别测试M下界<=19/保守值<=22，以及下界<=19/保守值<=21。两者不是同一合同；前者可能只减少多根组的压缩规则数，后者还须减少基础关联账。D分别限制3和2，左小指原生四轨峰值<=8.5%，其余评分/键域/声调行与上轮相同。',
        'M按统一M-T1从码表推导：下界=卷舌规则+零声母载体数+D+WY移动数+去介音规则+调区合并关联+多根组数；保守值将多根组数替换为根韵合并关联数。18根/10组时后者固定8条。因此少一个多根组可使20/22变19/22，而19/21需要基础规则账再少一条。该规则账不是实测学习时长。',
        '重用上轮17,244个完整评分状态作为种子档案，再对每个预算/D/默认或加倍目标进行精确最陡下降。各轮完整枚举声母移动/交换/归位补偿、根韵迁移/互换、行键位调整和中心144辅序，不以代理分筛选。',
        '八条路线共享完整评分；随后重复交叉重置：若另一目标或预算发现更好的可行状态，即从该状态重做完整邻域下降，直到全部路线都不能被已有评分记录改善，且终点邻域闭合。避免路线执行顺序影响最终比较。',
        f"本轮新增{search['newFullEvaluations']}个完整评分状态；保留所有新评分和逐轮邻域记录。最终仅证明所列邻域/目标下局部收敛，不是所有M19布局的全局最优。",'',
        '|预算/路线|代表|默认CKT5.2|加倍成本CKT5.2|实际M下/保守|D|相对上轮M20记录差|左/右小指峰值|',
        '|---|---|---:|---:|---:|---:|---:|---|']
    for r in summaries:lines.append(f"|{r['route']}|{r['label']}|{r['score']:.9f}|{r['doubleScore']:.9f}|{r['Mlower']}/{r['Mguard']}|{r['D']}|{r['objectiveGap']:+.9f} ({r['objectiveGapPct']:+.4f}%)|{100*r['leftPinkyPeak']:.3f}%/{100*r['rightPinkyPeak']:.3f}%|")
    lines+=['',f"原A：默认{a['score']:.9f}，加倍{old_audit['baseline']['doubleScore']:.9f}，M20/22、D3。上轮O1：8.682422349/8.310808292，M20/22、D3；O3：8.726100864/8.370899457，M20/22、D2。",'',
        '这里比较有限搜索的历史记录，不是两个可行域的理论最优值。若M19新发现优于M20旧记录，它本身也满足M20约束，表示探索进入了新盆地，不能解释为收紧约束反而改善了理论最优。',
        '主搜索只限制左小指，右小指需单列。另在所有完整评分记录中选择右小指不高于A的控制代表；只作记录内筛选，没有宣称这些控制代表也局部最优。',
        '','|全部代表|来源|辅序|默认CKT|加倍CKT|M下/保守/D|左小指|右小指|最低主行|双食指峰值|',
        '|---|---|---|---:|---:|---|---:|---:|---:|---:|']
    for r in rows:
        m=r['memory'];lines.append(f"|{r['label']} {r['id']}|{','.join(r['originRoutes'])}|{r['policy']}|{r['score']:.9f}|{r['doubleScore']:.9f}|{m['lower']}/{m['guard']}/{m['D']}|{100*r['leftPinkyPeak']:.3f}%|{100*r['rightPinkyPeak']:.3f}%|{100*r['homeMinimum']:.3f}%|{100*r['bothIndexPeak']:.3f}%|")
    lines+=['','|代表|实际记忆账：普通偏移/零载体/WY移动/多根规则/多根关联|相对A声母变化|字/二/三/四字同指异键|连续5500字ms/字|',
        '|---|---|---|---|---:|']
    for r in rows:
        a_=r['memory']['audit'];ledger=f"{r['memory']['D']}/{a_['zeroCarrierRules']}/{len(a_['carrierMoves'])}/{a_['sourceRhymeColumnMergeRules']}/{a_['sourceRhymeColumnMergeLinks']}"
        changes='；'.join(x['atom']+':'+x['before']+'→'+x['after'] for x in r['onsetChanges'])
        sf='/'.join(f"{100*r['nativeTracks'][k]['differentKeySameFingerRate']:.3f}%" for k in ['character','word2','word3','word4'])
        lines.append(f"|{r['label']}|{ledger}|{changes}|{sf}|{r['continuous']['5500']['msPerHan']:.6f}|")
    lines+=['','## 全144辅序复核','',
        '|布局|当前辅序|默认专用最优|加倍专用最优|当前辅序默认/加倍损失|','|---|---|---|---|---|']
    for p in policies['results']:
        r=raw[p['id']];lines.append(f"|{r['label']}|{pk(p['publishedPolicy'])}|{pk(p['bestDefault']['policy'])}={p['bestDefault']['score']:.9f}|{pk(p['bestDouble']['policy'])}={p['bestDouble']['score']:.9f}|{p['defaultRegret']:.9f}/{p['doubleRegret']:.9f}|")
    lines+=['','全部代表及各点新辅序均以原生完整JavaScript重建评分，逐轨核对耗时、加辅/选重/扫描/翻页和每键负荷；M/D/F从码表与组属重新推导。所有指标都按实际辅序终码计算；连续声韵流另列，二者不混用。',
        '未重跑六维百万点稳健性排名，也未部署。完整码表见-finalists.json；复现使用research/toned-2126-v52-m19.just。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf8');print('reported',len(rows),'M19 representatives')


if __name__=='__main__':main()
