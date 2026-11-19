"""Report verified M4 refinement, explicit changes and native ergonomics."""
import gzip
import json
from pathlib import Path

from refine_toned_2126_v52_m4 import ROOT,PREFIX,M19,ROWS,ARCHIVES
from check_toned_2126_v52_seed_neighbors import read,write
from report_toned_2126_v52 import continuous
from continuous_shuangpin import Timing

KINDS=['character','word2','word3','word4']


def main():
    search=read(str(PREFIX)+'.json');bundle=read(str(PREFIX)+'-finalists.json')
    verify=read(str(PREFIX)+'-verification.json')
    audit=json.loads(gzip.decompress(Path(str(PREFIX)+'-policies.json.gz').read_bytes()))
    old=next(l for l in read(str(M19)+'-finalists.json')['layouts'] if l['id']=='T2126-V52-M19-9cd540fc9f2f')
    reopened={}
    def retain_historical(r):
        if r['memoryLower']>18 or r['memoryGuard']>21 or r['D']>2:return
        for field in ['score','doubleScore']:
            if field not in reopened or r[field]<reopened[field][field]:reopened[field]=r
    for archive in ARCHIVES:
        with gzip.open(archive,'rt',encoding='utf8') as stream:
            for line in stream:retain_historical(json.loads(line))
    for a in json.loads(gzip.decompress(Path(str(M19)+'-policies.json.gz').read_bytes()))['results']:
        for r in a['policies']:retain_historical(r)
    corpus=read(ROOT/'research/config/continuous-shuangpin-5500.json');timing=Timing();rows=[]
    for l in bundle['layouts']:
        v=next(v for v in verify['results'] if v['id']==l['id'] and list(v['policy'].values())==l['policy'])
        ts=v['ergonomics']['tracks'];peak=lambda f:max(t[f] for t in ts.values())
        delta={}
        for row_index,row in enumerate(l['regionMaps']):
            for group,key in enumerate(row):
                if key!=old['regionMaps'][row_index][group]:delta[f'{row_index}:{group}']=dict(before=old['regionMaps'][row_index][group],after=key)
        rows.append(dict(id=l['id'],originRoutes=l['originRoutes'],policy=l['policy'],score=v['score'],doubleScore=v['doubleScore'],memory=v['memory'],
            gapDefault=v['score']-search['baseline']['score'],gapDouble=v['doubleScore']-search['baseline']['doubleScore'],
            improvementDefaultPct=100*(1-v['score']/search['baseline']['score']),improvementDoublePct=100*(1-v['doubleScore']/search['baseline']['doubleScore']),
            leftPinkyPeak=peak('leftPinkyQAZ'),rightPinkyPeak=peak('rightPinky'),homeMinimum=min(t['home'] for t in ts.values()),
            maxFingerPeak=peak('maxFinger'),bothIndexPeak=max(t['finger'][3]+t['finger'][6] for t in ts.values()),
            nativeTracks=ts,cktTracks=v['tracks'],continuous={size:continuous(corpus,l,bundle['tokenKeys'],timing,corpus['sceneOrder'+size]) for size in ['5500','5000']},
            firstChanges={k:dict(before=old['firstKeys'][k],after=value) for k,value in l['firstKeys'].items() if value!=old['firstKeys'][k]},
            rootChanges={root:dict(before=old['finalGroups'][root],after=group) for root,group in l['finalGroups'].items() if group!=old['finalGroups'][root]},
            regionMapChanges=delta,changedTokenCount=sum(a!=b for a,b in zip(old['tonedCodes'],l['tonedCodes'],strict=True)),
            rhymeGroups=[dict(group=g,roots=group['roots'],keys=[ROWS[row][l['regionMaps'][row][g]] for row in range(3)]) for g,group in enumerate(l['rhymeGroups'])]))
    rows.sort(key=lambda r:r['score'])
    for i,r in enumerate(rows,1):r['label']='R'+str(i)
    write(Path(str(PREFIX)+'-comparison.json'),dict(version=1,reopenedHistoricalBest=reopened,results=rows))
    default=next(r for r in rows if 'default' in r['originRoutes']);double=next(r for r in rows if 'double' in r['originRoutes'])
    lines=['# M4：保持实际 M≤18/21、D≤2 的联动精修','',
        f"默认目标终点{default['label']}：{default['score']:.9f}（比原M4下降{default['improvementDefaultPct']:.4f}%）；加倍目标终点{double['label']}：{double['doubleScore']:.9f}（下降{double['improvementDoublePct']:.4f}%）。",'',
        f"取消小指阈值后，历史评分中已有默认{reopened['score']['score']:.9f}、加倍{reopened['doubleScore']['doubleScore']:.9f}的可行记录。新精修在这两个历史记录之上另改善默认{reopened['score']['score']-default['score']:.9f}、加倍{reopened['doubleScore']['doubleScore']-double['doubleScore']:.9f}；不把解除筛选条件带来的全部差额算作新搜索收益。",'',
        '原 M4：默认 CKT5.2=8.688491920，加倍认知成本=8.326630263，辅序12/12/23。分数越低越好。',
        '约束：21个实际首键，韵键上/中/下10/9/7，上二三声/中四声/下一轻。按用户最新指示，左右小指均不参与筛选或排序，仅记录指标。M是规则记忆账下界/保守值，不是实测学习时长。',
        f"本轮新增{search['newFullEvaluations']}个完整评分状态，复用{search['importedEvaluations']}个历史评分。最终复核{len(audit['results'])}个代表各144种辅序，额外需要新增{audit['newFullEvaluations']}次评分（其余复用完整评分档案）。",'',
        '完整枚举 M4 的单步邻域，以及一个根韵迁移/互换与一个涉及被改组的行键换位/重分配的联动。后一枚举允许第一步暂时丢失实际韵键覆盖，但联合终点必须满足全部约束。',
        '随后对每种单步操作，分别取默认/加倍完整分数最好的第一跳，检查其全部合法第二跳。只选少量第一跳，未穷举所有两步组合；M/D预算中途仍受限。',
        '默认、加倍目标共享档案（包括历史上因左小指超过8.5%而淘汰的记录），交叉重置并反复单步下降，直至记录内无更优可行种子且各终点单步邻域闭合。',
        '','|阶段|状态数|左小指超过旧8.5%线（保留）|最好默认|最好加倍|','|---|---:|---:|---:|---:|']
    for s in search['stages']:lines.append(f"|{s['name']}|{s['states']}|{s['leftPinkyAbovePreviousLimit']}|{s['bestDefault']:.9f}|{s['bestDouble']:.9f}|")
    lines+=['','|代表/路线|辅序|默认CKT|加倍CKT|相对M4默认/加倍差|M下/保守/D|左/右小指峰值|最低主行|双食指峰值|',
        '|---|---|---:|---:|---|---|---|---:|---:|']
    for r in rows:
        m=r['memory'];lines.append(f"|{r['label']} {','.join(r['originRoutes'])}|{'/'.join(r['policy'])}|{r['score']:.9f}|{r['doubleScore']:.9f}|{r['gapDefault']:+.9f}/{r['gapDouble']:+.9f}|{m['lower']}/{m['guard']}/{m['D']}|{100*r['leftPinkyPeak']:.3f}%/{100*r['rightPinkyPeak']:.3f}%|{100*r['homeMinimum']:.3f}%|{100*r['bothIndexPeak']:.3f}%|")
    lines+=['','## 实际变化与逐轨指标','',
        '下表根韵符号沿用搜索原子：n代表in/ün，ng代表ing，v代表独立ü；其余韵母的去介音归属见-finalists.json中的finals。上/中/下三个键按二三声/四声/一轻排列。','']
    for r in rows:
        lines += [f"### {r['label']} {r['id']}",'',
            '相对原M4的声母变化：'+json.dumps(r['firstChanges'],ensure_ascii=False)+'；韵母组属变化：'+json.dumps(r['rootChanges'],ensure_ascii=False)+'；行键映射变化(0上/1中/2下，索引见完整码表)：'+json.dumps(r['regionMapChanges'],ensure_ascii=False)+f"。改变{r['changedTokenCount']}个带调音节码。",'',
            '|轨道|CKT有效ms|运动ms|第一/二辅率|选重率|左/右小指|同指异键|主行|双食指|','|---|---:|---:|---|---:|---|---:|---:|---:|']
        for kind in KINDS:
            t=r['cktTracks'][kind];e=r['nativeTracks'][kind]
            lines.append(f"|{kind}|{t['effectiveMs']:.6f}|{t['motorUpperMs']:.6f}|{100*t['firstAuxRate']:.3f}%/{100*t['secondAuxRate']:.3f}%|{100*t['selectionRate']:.4f}%|{100*e['leftPinkyQAZ']:.3f}%/{100*e['rightPinky']:.3f}%|{100*e['differentKeySameFingerRate']:.3f}%|{100*e['home']:.3f}%|{100*(e['finger'][3]+e['finger'][6]):.3f}%|")
        lines+=['',f"连续5500字纯声韵流：{r['continuous']['5500']['msPerHan']:.6f}ms/字；不混入原生终码指标。",'',
            '|根韵组|上排二三声|中排四声|下排一轻|','|---|---|---|---|']
        for group in r['rhymeGroups']:lines.append('|'+','.join(group['roots'])+'|'+'|'.join(group['keys'])+'|')
        lines.append('')
    lines+=['## 144辅序复核','','|代表|固定辅序|默认最优|加倍最优|固定辅序损失 默认/加倍|','|---|---|---|---|---|']
    for a in audit['results']:
        r=next(r for r in rows if r['id']==a['id'] and r['policy']==a['publishedPolicy']);lines.append(f"|{r['label']}|{'/'.join(a['publishedPolicy'])}|{'/'.join(a['bestDefault']['policy'])}={a['bestDefault']['score']:.9f}|{'/'.join(a['bestDouble']['policy'])}={a['bestDouble']['score']:.9f}|{a['defaultRegret']:.9f}/{a['doubleRegret']:.9f}|")
    lines+=['','所有发布代表及其默认/加倍最佳辅序均由原生JavaScript独立重建终码竞争，核对完整评分、逐轨指标、每键负荷，并从码表重新推导M/D/F。只比较默认和统一加倍两个成本点；未重新审计六维大范围稳健性。',
        '有限联动搜索与单步收敛不能证明全局最优；没有部署或修改R11 HTML。完整码表见同前缀-finalists.json，复现见research/toned-2126-v52-m4-refine.just。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf8');print('reported',len(rows),'M4 representatives')


if __name__=='__main__':main()
