"""R2 doubled-cost refinement, direct N test and word completion/ergonomics."""
import gzip
import json
from pathlib import Path

from refine_toned_2126_v52_r2 import ROOT,PREFIX,M4,State,ROWS
from check_toned_2126_v52_seed_neighbors import read,write
from continuous_shuangpin import Timing
from report_toned_2126_v52 import continuous


def main():
    search=read(str(PREFIX)+'.json');assert search['complete']
    bundle=read(str(PREFIX)+'-finalists.json');verify=read(str(PREFIX)+'-verification.json')
    policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
    old=next(l for l in read(str(M4)+'-finalists.json')['layouts'] if 'double' in l['originRoutes'])
    corpus=read(ROOT/'research/config/continuous-shuangpin-5500.json');timing=Timing();rows=[]
    for l in bundle['layouts']:
        v=next(v for v in verify['results'] if v['id']==l['id'] and list(v['policy'].values())==l['policy'])
        ts=v['ergonomics']['tracks'];peak=lambda f:max(t[f] for t in ts.values())
        rows.append(dict(id=l['id'],originRoutes=l['originRoutes'],policy=l['policy'],score=v['score'],doubleScore=v['doubleScore'],memory=v['memory'],
            gapDefault=v['score']-search['baseline']['score'],gapDouble=v['doubleScore']-search['baseline']['doubleScore'],
            improvementDoublePct=100*(1-v['doubleScore']/search['baseline']['doubleScore']),
            leftPinkyPeak=peak('leftPinkyQAZ'),rightPinkyPeak=peak('rightPinky'),homeMinimum=min(t['home'] for t in ts.values()),
            maxFingerPeak=peak('maxFinger'),bothIndexPeak=max(t['finger'][3]+t['finger'][6] for t in ts.values()),nativeTracks=ts,cktTracks=v['tracks'],
            firstChanges={k:dict(before=old['firstKeys'][k],after=value) for k,value in l['firstKeys'].items() if value!=old['firstKeys'][k]},
            finalGroupChanges={k:dict(before=old['finalGroups'][k],after=value) for k,value in l['finalGroups'].items() if value!=old['finalGroups'][k]},
            regionMapChanges=[dict(row=r,group=g,roots=l['rhymeGroups'][g]['roots'],before=ROWS[r][old['regionMaps'][r][g]],after=ROWS[r][key])
                for r,row in enumerate(l['regionMaps']) for g,key in enumerate(row) if key!=old['regionMaps'][r][g]],
            continuous5500=continuous(corpus,l,bundle['tokenKeys'],timing,corpus['sceneOrder5500']),
            changedTonedSyllables=sum(a!=b for a,b in zip(l['tonedCodes'],old['tonedCodes'],strict=True))))
    rows.sort(key=lambda r:r['doubleScore'])
    for i,r in enumerate(rows,1):r['label']='D'+str(i)
    carrier_summary=[]
    for key,screen in search['carrierScreen'].items():
        for objective,field in [('bestDefault','score'),('bestDouble','doubleScore')]:
            v=screen[objective];carrier_summary.append(dict(carrier=key,objective=objective,score=v['score'],doubleScore=v['doubleScore'],policy=v['state']['policy']))
    write(Path(str(PREFIX)+'-comparison.json'),dict(version=1,carrierScreen=carrier_summary,results=rows))
    champion=next(r for r in rows if 'double-free-carrier' in r['originRoutes'])
    fixed_n=next(r for r in rows if 'double-N-carrier' in r['originRoutes'])
    finding=('本轮未找到加倍成本分优于原R2的布局，建议保留R载体和21/12/23。' if champion['gapDouble']>=-1e-10 else
        f"本轮自由载体路线改善加倍成本{champion['improvementDoublePct']:.6f}%。")
    lines=['# R2：统一零声母载体与联动精修','',finding,
        f"直接R→N的默认/加倍={search['carrierScreen']['N']['bestDouble']['score']:.9f}/{search['carrierScreen']['N']['bestDouble']['doubleScore']:.9f}；N路线联动后={fixed_n['score']:.9f}/{fixed_n['doubleScore']:.9f}。N路线终点是er由a/n/ong组移至ang/ei组（具体以逐项码表差异为准）。",'',
        '以加倍认知成本CKT5.2为目标，默认CKT与人体工学另列。实际M≤18/21、D≤2，21首键、韵键10/9/7，上二三/中四/下一轻；左右小指不筛选。',
        f"原R2默认/加倍={search['baseline']['score']:.9f}/{search['baseline']['doubleScore']:.9f}，辅序21/12/23。本轮新增{search['newFullEvaluations']}个完整评分状态、复用{search['importedEvaluations']}个历史评分。",'',
        '完整检查统一A/E/O载体的21种首键×144辅序、载体×一个完整根韵迁移/互换、原R2的根韵×相关组换键。另从各单步操作类别选加倍完整分最佳第一跳（并额外加入N载体），检查其全部单步第二跳。',
        '主搜索自由载体与强制统一N载体两条路线共享评分档案，交叉重置，按加倍分反复完整单步下降，直至两者均局部收敛。未穷举任意两步组合、所有联动×144辅序、也未把整个联动邻域反复闭合到新终点。',
        '所有代表最终穷举144辅序、原生JS独立复核终码/每键负荷/评分/M-D-F。重码在这里按原生轨的加辅与选重频权率比较；不能直接等同于全词库裸码碰撞率。',
        '','|阶段|状态数|最好默认|最好加倍|','|---|---:|---:|---:|']
    for s in search['stages']:lines.append(f"|{s['name']}|{s['states']}|{s['bestDefault']:.9f}|{s['bestDouble']:.9f}|")
    lines+=['','|统一载体（其他布局固定原R2）|加倍最优辅序|对应默认|加倍|','|---|---|---:|---:|']
    for key,value in sorted(search['carrierScreen'].items(),key=lambda item:item[1]['bestDouble']['doubleScore']):
        r=value['bestDouble'];lines.append(f"|{key}|{'/'.join(r['state']['policy'])}|{r['score']:.9f}|{r['doubleScore']:.9f}|")
    lines+=['','|代表/路线|辅序|默认|加倍|默认/加倍变化|M下/保守/D|左/右小指峰值|最低主行|','|---|---|---:|---:|---|---|---|---:|']
    for r in rows:
        m=r['memory'];lines.append(f"|{r['label']} {','.join(r['originRoutes'])}|{'/'.join(r['policy'])}|{r['score']:.9f}|{r['doubleScore']:.9f}|{r['gapDefault']:+.9f}/{r['gapDouble']:+.9f}|{m['lower']}/{m['guard']}/{m['D']}|{100*r['leftPinkyPeak']:.3f}%/{100*r['rightPinkyPeak']:.3f}%|{100*r['homeMinimum']:.3f}%|")
    for r in rows:
        lines+=['',f"## {r['label']} {r['id']}",'',
            '相对原R2声母变化：'+json.dumps(r['firstChanges'],ensure_ascii=False)+'；韵母组属变化：'+json.dumps(r['finalGroupChanges'],ensure_ascii=False)+'；韵键变化：'+json.dumps(r['regionMapChanges'],ensure_ascii=False)+f"。共改变{r['changedTonedSyllables']}个带调音节码。",'',
            '|轨道|有效ms|运动ms|首辅率|次辅率|选重率|左/右小指|主行|同指异键|双食指|','|---|---:|---:|---:|---:|---:|---|---:|---:|---:|']
        for k in ['character','word2','word3','word4']:
            t=r['cktTracks'][k];e=r['nativeTracks'][k]
            lines.append(f"|{k}|{t['effectiveMs']:.6f}|{t['motorUpperMs']:.6f}|{100*t['firstAuxRate']:.4f}%|{100*t['secondAuxRate']:.4f}%|{100*t['selectionRate']:.5f}%|{100*e['leftPinkyQAZ']:.3f}%/{100*e['rightPinky']:.3f}%|{100*e['home']:.3f}%|{100*e['differentKeySameFingerRate']:.3f}%|{100*(e['finger'][3]+e['finger'][6]):.3f}%|")
        lines+=['',f"连续5500字声韵流：{r['continuous5500']['msPerHan']:.6f}ms/字，单列不混入原生终码指标。"]
    lines+=['','## 144辅序复核','','|代表|发布辅序|默认最优|加倍最优|发布辅序默认/加倍损失|','|---|---|---|---|---|']
    for a in policies['results']:
        r=next(r for r in rows if r['id']==a['id'] and r['policy']==a['publishedPolicy'])
        lines.append(f"|{r['label']}|{'/'.join(r['policy'])}|{'/'.join(a['bestDefault']['policy'])}={a['bestDefault']['score']:.9f}|{'/'.join(a['bestDouble']['policy'])}={a['bestDouble']['score']:.9f}|{a['defaultRegret']:.9f}/{a['doubleRegret']:.9f}|")
    lines+=['','本轮不重新声称六维宽扰动第一，HTML未改动。复现见research/toned-2126-v52-r2-refine.just。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf8');print('reported',len(rows),'R2 representatives')


if __name__=='__main__':main()
