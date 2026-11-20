"""Publish the independently verified wide UM40 toned rhyme experiment."""
import gzip
from pathlib import Path
import json

from search_toned_2126_um40_wide import PREFIX,PREVIOUS,ROOT,ROWS
from check_toned_2126_v52_seed_neighbors import read,write,sha


def main():
    search=read(str(PREFIX)+'.json');assert search['complete']
    bundle=read(str(PREFIX)+'-finalists.json');verified=read(str(PREFIX)+'-verification.json')
    audit=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
    old=read(str(PREVIOUS)+'-comparison.json');ref=search['referenceR2']
    r2=old['referenceR2Native'];rows=[]
    for l in bundle['layouts']:
        v=next(v for v in verified['results'] if v['id']==l['id'] and list(v['policy'].values())==l['policy'])
        policies=next(p for p in audit['results'] if p['id']==l['id']);same=next(p for p in policies['policies'] if p['state']['policy']==ref['policy'])
        rows.append(dict(v,ownBestDefault=policies['bestDefault'],ownBestDouble=policies['bestDouble'],
            samePolicyAsR2=dict(policy=ref['policy'],score=same['score'],doubleScore=same['doubleScore']),
            gapDefault=v['score']-ref['score'],gapDouble=v['doubleScore']-ref['doubleScore'],rhymeGroups=l['rhymeGroups'],regionMaps=l['regionMaps']))
    result=dict(version=1,referenceR2=ref,previousBest=search['previousBest'],
        defaultGatePassed=min(r['ownBestDefault']['score'] for r in rows)<ref['score'],
        doubleGatePassed=min(r['ownBestDouble']['score'] for r in rows)<ref['doubleScore'],results=rows,
        sourceHashes={str(q):sha(q) for q in [Path(__file__),Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json'),Path(str(PREFIX)+'-policies.json.gz'),Path(str(PREVIOUS)+'-comparison.json')]})
    write(Path(str(PREFIX)+'-comparison.json'),result)
    best={f:min(r[f] for r in rows) for f in ('score','doubleScore')}
    lines=['# 固定 UM40 声母：大范围带调韵侧扰动','',
        f"默认最好 **{best['score']:.9f}**，加倍最好 **{best['doubleScore']:.9f}**；R2 对应为 **{ref['score']:.9f} / {ref['doubleScore']:.9f}**。",'',
        f"在上一轮 {search['reusedCanonicalStates']:,} 个状态基础上，新增 **{search['newFullEvaluations']:,} 个完整 CKT5.2 评分状态**。",
        f"24 条链（默认/加倍各12个温度），{search['settings']['sweeps']} 轮；温度0.0007–0.07，每200轮冷却周期和高温链重启，每10轮尝试相邻温度交换。",
        '混合根韵迁移、交换、3–7根循环，行内键位交换、3–8组循环、重分配合并键，辅序改变，3–10次耦合扰动，随机重新分组及跨候选分组/行映射组合。',
        '按上排实际键规范化组号以消除等价状态；规范化保留全部1407个带调音节编码。随后精修多个不同物理键位终点，并将两个目标各自完整单步邻域闭合。',
        '所有提案用完整词字竞争及完整CKT5.2评分，不用代理分。新评分档案紧凑保存状态、默认/加倍分、M/D；代表方案重新生成完整逐轨及人体工学数据，再由原生JavaScript独立验证。',
        '冻结三个UM40共同的所有声母；上二三/中四/下一轻、10/9/7，18完整根韵分10个非空组；D3，M自然上限22/22，不限制左右小指。形辅AEUIO、声调辅键IEUAO，42310配对不变。',
        '该搜索包含跨组迁移和同一行键位调整，但不拆分完整根韵、不改变行划分，未穷举所有组合；未找到不等于全局不可能。辅序为对应成本点最优，未做宽扰动稳健排名。','',
        '|方案|辅序|默认CKT5.2|加倍CKT5.2|M下/保守|D|','|---|---|---:|---:|---|---:|',
        f"|R2|{'/'.join(ref['policy'])}|{ref['score']:.9f}|{ref['doubleScore']:.9f}|18/21|2|"]
    for r in rows:
        m=r['memory'];lines.append(f"|{','.join(r['originRoutes'])}|{'/'.join(r['policy'].values())}|{r['score']:.9f}|{r['doubleScore']:.9f}|{m['lower']}/{m['guard']}|{m['D']}|")
    lines+=['',f"相对上一轮：默认 {best['score']-search['previousBest']['score']:+.9f}，加倍 {best['doubleScore']-search['previousBest']['doubleScore']:+.9f}。",
        f"相对R2：默认 {best['score']-ref['score']:+.9f}（{100*(best['score']/ref['score']-1):+.3f}%），加倍 {best['doubleScore']-ref['doubleScore']:+.9f}（{100*(best['doubleScore']/ref['doubleScore']-1):+.3f}%）。"]
    representative=min(rows,key=lambda r:r['doubleScore'])
    lag=sorted(((k,t['effectiveMs']-r2['tracks'][k]['effectiveMs']) for k,t in representative['tracks'].items()),key=lambda item:item[1],reverse=True)
    lag=[(k,delta) for k,delta in lag if delta>0]
    if lag:
        lines+=['','以加倍目标代表的默认有效耗时看，主要落后轨道为'+ '、'.join(f'{k}（+{delta:.3f}ms）' for k,delta in lag[:2])+'。',
            '这些轨道的运动、首辅、次辅与选重率逐项列于下表；固定声母决定了三四字词主码的大部分结构，韵侧扰动只能调整其中的韵码和跨词长竞争。']
    if search.get('reviewMigration'):
        lines+=['',f"续跑记录：第{search['reviewMigration']['sweep']}轮后升级检查点格式，保留{search['reviewMigration']['retainedNewExactStates']}条已完成评分并刷新一次精英候选；之后持久化精英集合、随机状态与日志提交边界。"]
    if search.get('novelGroupPolish'):
        n=search['novelGroupPolish']
        lines+=['',f"补充探索：初轮结束时新增{n['initialWideEvaluations']}个评分状态，其中有{n['newRootGroupings']}种上一轮档案未出现的根韵分组。分别沿默认/加倍目标选4个未见过的分组继续完整单步下降，共{n['additionalRoutes']}条路线；两目标可以选到同一分组。"]
    for r in rows:
        lines+=['',f"## {r['id']}",'',
            f"对应成本点144辅序：默认 {'/'.join(r['ownBestDefault']['policy'])} / {r['ownBestDefault']['score']:.9f}；加倍 {'/'.join(r['ownBestDouble']['policy'])} / {r['ownBestDouble']['score']:.9f}。",
            f"统一用R2辅序21/12/23时：{r['samePolicyAsR2']['score']:.9f} / {r['samePolicyAsR2']['doubleScore']:.9f}。",'',
            '|轨道|有效ms（默认）|R2有效ms|运动ms|首辅率|次辅率|选重率|左小指|右小指|主行|同指异键|双食指|',
            '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
        for k,t in r['tracks'].items():
            e=r['ergonomics']['tracks'][k]
            lines.append(f"|{k}|{t['effectiveMs']:.6f}|{r2['tracks'][k]['effectiveMs']:.6f}|{t['motorUpperMs']:.6f}|{100*t['firstAuxRate']:.4f}%|{100*t['secondAuxRate']:.4f}%|{100*t['selectionRate']:.5f}%|{100*e['leftPinkyQAZ']:.3f}%|{100*e['rightPinky']:.3f}%|{100*e['home']:.3f}%|{100*e['differentKeySameFingerRate']:.3f}%|{100*(e['finger'][3]+e['finger'][6]):.3f}%|")
        lines+=['','|根韵组|上二三|中四|下一轻|','|---|---|---|---|']
        for i,g in enumerate(r['rhymeGroups']):lines.append('|'+','.join(g['roots'])+'|'+'|'.join(ROWS[rw][r['regionMaps'][rw][i]] for rw in range(3))+'|')
    lines+=['','复现：`just --justfile research/toned-2126-um40-wide.just search`。12线程、低优先级；检查点保留随机状态、链当前位置及已评分记录。不修改HTML。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print('wide report',best,'gates',result['defaultGatePassed'],result['doubleGatePassed'])


if __name__=='__main__':main()
