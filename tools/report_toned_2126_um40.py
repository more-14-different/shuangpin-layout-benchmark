"""Fixed UM40 onset toned exploration against R2 at 1x and 2x cognition."""
import gzip
import json
from pathlib import Path
from search_toned_2126_um40 import ROOT,PREFIX,ROWS
from check_toned_2126_v52_seed_neighbors import read,write
from report_toned_2126_v52 import continuous
from continuous_shuangpin import Timing


def main():
    search=read(str(PREFIX)+'.json');assert search['complete']
    bundle=read(str(PREFIX)+'-finalists.json');verified=read(str(PREFIX)+'-verification.json')
    policies=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
    corpus=read(ROOT/'research/config/continuous-shuangpin-5500.json');timing=Timing();rows=[]
    for l in bundle['layouts']:
        v=next(v for v in verified['results'] if v['id']==l['id'] and list(v['policy'].values())==l['policy'])
        ts=v['ergonomics']['tracks'];peak=lambda f:max(t[f] for t in ts.values())
        audit=next(p for p in policies['results'] if p['id']==l['id'] and p['publishedPolicy']==l['policy'])
        fixed=next(p for p in audit['policies'] if p['state']['policy']==['21','12','23'])
        rows.append(dict(id=l['id'],originRoutes=l['originRoutes'],policy=l['policy'],score=v['score'],doubleScore=v['doubleScore'],memory=v['memory'],
            gapDefault=v['score']-search['referenceR2']['score'],gapDouble=v['doubleScore']-search['referenceR2']['doubleScore'],
            ownBestDefault=audit['bestDefault'],ownBestDouble=audit['bestDouble'],samePolicyAsR2=dict(policy=['21','12','23'],score=fixed['score'],doubleScore=fixed['doubleScore']),
            leftPinkyPeak=peak('leftPinkyQAZ'),rightPinkyPeak=peak('rightPinky'),homeMinimum=min(t['home'] for t in ts.values()),
            maxFingerPeak=peak('maxFinger'),bothIndexPeak=max(t['finger'][3]+t['finger'][6] for t in ts.values()),nativeTracks=ts,cktTracks=v['tracks'],
            continuous5500=continuous(corpus,l,bundle['tokenKeys'],timing,corpus['sceneOrder5500']),
            firstKeys=l['firstKeys'],rhymeGroups=[dict(roots=g['roots'],finals=g['finals'],keys=[ROWS[r][l['regionMaps'][r][i]] for r in range(3)]) for i,g in enumerate(l['rhymeGroups'])]))
    rows.sort(key=lambda r:r['score'])
    for i,r in enumerate(rows,1):r['label']='U'+str(i)
    default=min(rows,key=lambda r:r['ownBestDefault']['score']);double=min(rows,key=lambda r:r['ownBestDouble']['score'])
    r2_path=ROOT/'research/notes/2026-11-19-toned-2126-v52-m4-refine-verification.json'
    r2=next(r for r in read(r2_path)['results'] if r['id']=='T2126-V52-M4-ec60a3637a99' and list(r['policy'].values())==['21','12','23'])
    ref=search['referenceR2'];result=dict(version=1,referenceR2=ref,defaultWinner=default['id'],doubleWinner=double['id'],
        referenceR2Native=dict(tracks=r2['tracks'],ergonomics=r2['ergonomics'],memory=r2['memory']),
        defaultGatePassed=default['ownBestDefault']['score']<ref['score'],doubleGatePassed=double['ownBestDouble']['score']<ref['doubleScore'],results=rows)
    write(Path(str(PREFIX)+'-comparison.json'),result)
    lines=['# 固定UM40声母的21×26带调韵侧探索','',
        f"默认最好{default['ownBestDefault']['score']:.9f}（{'胜过' if result['defaultGatePassed'] else '未胜过'}R2 {ref['score']:.9f}）；加倍最好{double['ownBestDouble']['score']:.9f}（{'胜过' if result['doubleGatePassed'] else '未胜过'}R2 {ref['doubleScore']:.9f}）。",'',
        '三个无调UM40的声母布局完全相同，因此本轮是同一固定声母布局下的带调韵侧搜索；不是保留原无调编码，亦不是三套不同声母的独立实验。',
        '固定普通/卷舌/零声母，包括q→F、x→Y、s→Q、zh→W、ch→X、sh→V、A/E/O→Y、W→J、Y/YU→S。韵侧采用18完整根韵、10非空组，上二三/中四/下一轻、韵键10/9/7。',
        '固定UM40声母D=3，不额外限制多根组数；18完整根韵分10组最多8个多根组，该模型自然上界M≤22/22，实际M从码表重推。不是R2的M18/21、D2合同。左右小指不设上限。',
        f"新增{search['newFullEvaluations']}个完整CKT5.2评分状态，{len(search['seedScores'])}个不同种子状态；无代理分选优。S005同成本点重算，四轨1:3:1:1，形辅AEUIO↔IEUAO，42310不变量。",'',
        '从多个历史布局移植韵侧后分别完整单步下降。单步包括完整根韵迁移/互换、行键位交换/重分配及144辅序；所有首码锁定。',
        '进一步在各目标当前最佳终点，从每种操作类型选择完整分最佳的第一跳，检查其全部合法第二跳；这是有界两步搜索，未穷举所有第一跳。之后交叉重置并单步下降直至两个目标的终点邻域均闭合。',
        '没有穷举所有韵分组/任意多步扰动、没有允许拆分完整根韵或改变声调行数。因此未找到不能证明固定声母全局不可能获胜。',
        '','|代表|路线|辅序|默认CKT5.2|加倍CKT5.2|相对R2默认/加倍差|实际M下/保守/D|左/右小指峰值|最低主行|',
        '|---|---|---|---:|---:|---|---|---|---:|']
    for r in rows:
        m=r['memory'];lines.append(f"|{r['label']}|{','.join(r['originRoutes'])}|{'/'.join(r['policy'])}|{r['score']:.9f}|{r['doubleScore']:.9f}|{r['gapDefault']:+.9f}/{r['gapDouble']:+.9f}|{m['lower']}/{m['guard']}/{m['D']}|{100*r['leftPinkyPeak']:.3f}%/{100*r['rightPinkyPeak']:.3f}%|{100*r['homeMinimum']:.3f}%|")
    lines+=['','与R2逐轨对照（UM取本轮加倍目标代表，各自声明辅序；有效耗时均按默认认知参数显示）：','',
        '|轨道|UM默认有效ms|R2默认有效ms|UM/R2首辅率|UM/R2次辅率|UM/R2选重率|','|---|---:|---:|---|---|---|']
    for kind,t in double['cktTracks'].items():
        b=r2['tracks'][kind]
        lines.append(f"|{kind}|{t['effectiveMs']:.6f}|{b['effectiveMs']:.6f}|{100*t['firstAuxRate']:.3f}%/{100*b['firstAuxRate']:.3f}%|{100*t['secondAuxRate']:.3f}%/{100*b['secondAuxRate']:.3f}%|{100*t['selectionRate']:.4f}%/{100*b['selectionRate']:.4f}%|")
    for r in rows:
        lines+=['',f"## {r['label']} {r['id']}",'',
            '同R2辅序21/12/23的默认/加倍：'+f"{r['samePolicyAsR2']['score']:.9f}/{r['samePolicyAsR2']['doubleScore']:.9f}。",'',
            '|轨道|有效ms|运动ms|首辅率|次辅率|选重率|左/右小指|主行|同指异键|双食指|','|---|---:|---:|---:|---:|---:|---|---:|---:|---:|']
        for k in ['character','word2','word3','word4']:
            t=r['cktTracks'][k];e=r['nativeTracks'][k]
            lines.append(f"|{k}|{t['effectiveMs']:.6f}|{t['motorUpperMs']:.6f}|{100*t['firstAuxRate']:.4f}%|{100*t['secondAuxRate']:.4f}%|{100*t['selectionRate']:.5f}%|{100*e['leftPinkyQAZ']:.3f}%/{100*e['rightPinky']:.3f}%|{100*e['home']:.3f}%|{100*e['differentKeySameFingerRate']:.3f}%|{100*(e['finger'][3]+e['finger'][6]):.3f}%|")
        lines+=['','|完整根韵组|上二三|中四|下一轻|','|---|---|---|---|']
        for g in r['rhymeGroups']:lines.append('|'+','.join(g['roots'])+'|'+'|'.join(g['keys'])+'|')
        lines+=['',f"连续5500字纯声韵流{r['continuous5500']['msPerHan']:.6f}ms/字；与原生终码指标分列。"]
    lines+=['','## 各自144辅序复核','','|代表|默认最优辅序/分|加倍最优辅序/分|','|---|---|---|']
    for r in rows:lines.append(f"|{r['label']}|{'/'.join(r['ownBestDefault']['policy'])} / {r['ownBestDefault']['score']:.9f}|{'/'.join(r['ownBestDouble']['policy'])} / {r['ownBestDouble']['score']:.9f}|")
    lines+=['','原生JavaScript独立重建全部发布终码、核对逐轨与逐键负荷，按原UM40首码逐音节核查，记忆账重新推导。未做六维宽成本稳健排名、未改HTML。复现见research/toned-2126-um40.just。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf8');print('reported',len(rows),'UM40-toned representatives')


if __name__=='__main__':main()
