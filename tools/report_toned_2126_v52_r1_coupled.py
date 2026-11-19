"""Report default-cost R1 compound closure and its ergonomic tradeoffs."""
import gzip
import json
from pathlib import Path

from refine_toned_2126_v52_r1_coupled import ROOT,PREFIX,M4,ROWS,State
from toned_2126_v52_score_archives import score_archives
from check_toned_2126_v52_seed_neighbors import read,write
from report_toned_2126_v52 import continuous
from continuous_shuangpin import Timing


def main():
    search=read(str(PREFIX)+'.json');assert search['complete']
    bundle=read(str(PREFIX)+'-finalists.json');verified=read(str(PREFIX)+'-verification.json')
    policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
    old=next(l for l in read(str(M4)+'-finalists.json')['layouts'] if 'default' in l['originRoutes'])
    corpus=read(ROOT/'research/config/continuous-shuangpin-5500.json');timing=Timing();rows=[]
    for l in bundle['layouts']:
        v=next(v for v in verified['results'] if v['id']==l['id'] and list(v['policy'].values())==l['policy'])
        ts=v['ergonomics']['tracks'];peak=lambda f:max(t[f] for t in ts.values())
        rows.append(dict(id=l['id'],originRoutes=l['originRoutes'],policy=l['policy'],score=v['score'],doubleScore=v['doubleScore'],memory=v['memory'],
            gapDefault=v['score']-search['baseline']['score'],improvementDefaultPct=100*(1-v['score']/search['baseline']['score']),
            gapDouble=v['doubleScore']-search['baseline']['doubleScore'],leftPinkyPeak=peak('leftPinkyQAZ'),rightPinkyPeak=peak('rightPinky'),
            homeMinimum=min(t['home'] for t in ts.values()),maxFingerPeak=peak('maxFinger'),bothIndexPeak=max(t['finger'][3]+t['finger'][6] for t in ts.values()),
            nativeTracks=ts,cktTracks=v['tracks'],continuous={size:continuous(corpus,l,bundle['tokenKeys'],timing,corpus['sceneOrder'+size]) for size in ['5500','5000']},
            firstChanges={k:dict(before=old['firstKeys'][k],after=value) for k,value in l['firstKeys'].items() if value!=old['firstKeys'][k]},
            finalGroupChanges={k:dict(before=old['finalGroups'][k],after=value) for k,value in l['finalGroups'].items() if value!=old['finalGroups'][k]},
            changedTokenCount=sum(a!=b for a,b in zip(l['tonedCodes'],old['tonedCodes'],strict=True)),
            rhymeGroups=[dict(group=g,roots=group['roots'],keys=[ROWS[row][l['regionMaps'][row][g]] for row in range(3)]) for g,group in enumerate(l['rhymeGroups'])]))
    rows.sort(key=lambda r:r['score'])
    for i,r in enumerate(rows,1):r['label']='C'+str(i)
    champ=next(r for r in rows if 'default' in r['originRoutes'])
    baseline_state=State.load(search['baseline']['state']);best_new_by_change={}
    for archive in score_archives(PREFIX):
        with gzip.open(archive,'rt',encoding='utf8') as stream:
            for line in stream:
                value=json.loads(line);state=State.load(value['state'])
                changed=[name for name in ['first','partition','maps','policy'] if getattr(state,name)!=getattr(baseline_state,name)]
                key='+'.join(changed) or 'none'
                if key not in best_new_by_change or value['score']<best_new_by_change[key]['score']:
                    best_new_by_change[key]={k:value[k] for k in ['state','score','doubleScore','memoryLower','memoryGuard','D']}
    write(Path(str(PREFIX)+'-comparison.json'),dict(version=1,bestNewByChangedComponents=best_new_by_change,results=rows))
    lines=['# R1：完整联动邻域继续精修','',
        f"原R1默认/加倍CKT5.2={search['baseline']['score']:.9f}/{search['baseline']['doubleScore']:.9f}。本轮终点={champ['score']:.9f}/{champ['doubleScore']:.9f}，默认改善{champ['improvementDefaultPct']:.6f}%。",'',
        f"新增{search['newFullEvaluations']}个完整评分状态，复用{search['importedEvaluations']}个历史评分；完整联动轮数{len(search['routes'][0]['passes'])}。各代表144辅序穷举及原生JavaScript终码/运动/认知/逐键负荷/M账复核均已完成。",'',
        '固定实际M≤18/21、D≤2、21首键、上/中/下10/9/7，上二三/中四/下一轻。左右小指仅记录，不筛选；没有增设主行约束。',
        '本轮只优化默认CKT5.2；加倍成本为诊断列，不宣称同时最优。完整枚举每个中心：单步邻域（含144辅序）、一个完整根韵迁移/互换与涉及被改组的一个行键交换/重分配、一个声母移动/交换/归位补偿与一个完整根韵迁移/互换。',
        '声母与根韵组合允许中间态M下界暂时超限、由另一操作补偿，终点必须满足全部约束。根韵与键位组合允许中间态实际韵键覆盖暂时不足、终点恢复覆盖。',
        '联动候选保持当前中心辅序；未对每个候选乘以144辅序。每轮选择最好完整评分记录，先做单步下降，再从新中心完整复查两类联动，直到三类邻域都不能改善默认分。',
        '这是定义邻域下的局部闭合；尚未穷举任意两次换键、多根多键同时重排、所有联动×144辅序或全局布局。','',
        '|轮|中心默认CKT|单步|根韵+键位|声母+根韵|去重合计|最好记录|','|---|---:|---:|---:|---:|---:|---:|']
    for i,p in enumerate(search['routes'][0]['passes'],1):
        c=p['counts'];lines.append(f"|{i}|{p['anchorObjective']:.9f}|{c['single']}|{c['rootKey']}|{c['onsetRoot']}|{c['union']}|{p['bestObjective']:.9f}|")
    lines+=['','按与原R1的实际差异分类的新评分最佳记录（不等同操作路径；不包含复用的历史评分）：','',
        '|变化分量|最好默认CKT|对应加倍CKT|相对原R1默认差|','|---|---:|---:|---:|']
    for key,value in sorted(best_new_by_change.items()):lines.append(f"|{key}|{value['score']:.9f}|{value['doubleScore']:.9f}|{value['score']-search['baseline']['score']:+.9f}|")
    lines+=['','|代表|来源|辅序|默认CKT|加倍CKT|M下/保守/D|左/右小指峰值|最低主行|双食指峰值|',
        '|---|---|---|---:|---:|---|---|---:|---:|']
    for r in rows:
        m=r['memory'];lines.append(f"|{r['label']}|{','.join(r['originRoutes'])}|{'/'.join(r['policy'])}|{r['score']:.9f}|{r['doubleScore']:.9f}|{m['lower']}/{m['guard']}/{m['D']}|{100*r['leftPinkyPeak']:.3f}%/{100*r['rightPinkyPeak']:.3f}%|{100*r['homeMinimum']:.3f}%|{100*r['bothIndexPeak']:.3f}%|")
    for r in rows:
        lines += ['',f"## {r['label']} {r['id']}",'',
            '相对原R1声母变化：'+json.dumps(r['firstChanges'],ensure_ascii=False)+'；韵母组属变化：'+json.dumps(r['finalGroupChanges'],ensure_ascii=False)+f"；改变{r['changedTokenCount']}个带调音节码。",'',
            '|轨道|有效ms|运动ms|第一/二辅率|左/右小指|主行|同指异键|双食指|','|---|---:|---:|---|---|---:|---:|---:|']
        for kind in ['character','word2','word3','word4']:
            t=r['cktTracks'][kind];e=r['nativeTracks'][kind]
            lines.append(f"|{kind}|{t['effectiveMs']:.6f}|{t['motorUpperMs']:.6f}|{100*t['firstAuxRate']:.3f}%/{100*t['secondAuxRate']:.3f}%|{100*e['leftPinkyQAZ']:.3f}%/{100*e['rightPinky']:.3f}%|{100*e['home']:.3f}%|{100*e['differentKeySameFingerRate']:.3f}%|{100*(e['finger'][3]+e['finger'][6]):.3f}%|")
        lines+=['',f"连续5500字纯声韵流：{r['continuous']['5500']['msPerHan']:.6f}ms/字，与原生终码负荷分列。",'',
            '根韵n代表in/ün，ng代表ing，v代表独立ü；其余去介音归属见完整码表。','',
            '|根韵组|上二三|中四|下一轻|','|---|---|---|---|']
        for g in r['rhymeGroups']:lines.append('|'+','.join(g['roots'])+'|'+'|'.join(g['keys'])+'|')
    lines+=['','## 辅序复核','','|代表|发布辅序|默认最优|加倍最优|发布辅序默认/加倍损失|','|---|---|---|---|---|']
    for a in policies['results']:
        r=next(r for r in rows if r['id']==a['id'] and r['policy']==a['publishedPolicy'])
        lines.append(f"|{r['label']}|{'/'.join(r['policy'])}|{'/'.join(a['bestDefault']['policy'])}={a['bestDefault']['score']:.9f}|{'/'.join(a['bestDouble']['policy'])}={a['bestDouble']['score']:.9f}|{a['defaultRegret']:.9f}/{a['doubleRegret']:.9f}|")
    lines+=['','未重新进行六维大范围成本稳健性排名。复现见research/toned-2126-v52-r1-coupled.just；完整码表、评分记录与独立复核均保留于本报告同前缀文件。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf8');print('reported',len(rows),'R1 coupled representatives')


if __name__=='__main__':main()
