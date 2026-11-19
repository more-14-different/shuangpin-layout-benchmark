"""Select right-pinky-preserving controls and report independently checked fronts."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

from search_toned_2126_v52_onsets import Context,State,PREFIX,ROOT
from report_toned_2126_v52 import continuous
from continuous_shuangpin import Timing

def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def write(p,v):Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf8')


def prepare():
    search=read(str(PREFIX)+'.json');assert search['complete']
    finals=read(str(PREFIX)+'-finalists.json')
    rows=list(map(json.loads,gzip.decompress(Path(str(PREFIX)+'-scores.jsonl.gz').read_bytes()).decode().splitlines()))
    original=read(ROOT/'research/notes/2026-11-19-toned-2126-v52-comparison.json')
    a=next(r for r in original['results'] if r['id']=='A');right=a['rightPinkyPeak']
    ctx=Context(ROOT.parent/'shuangpin-layout-benchmark',.085);controls=[]
    for d in [3,2]:
        for field in ['score','doubleScore']:
            pool=[r for r in rows if r['eligible'] and r['D']<=d and max(t['rightPinky'] for t in r['ergonomics'].values())<=right+1e-12]
            if not pool:continue
            value=min(pool,key=lambda r:r[field]);state=State.load(value['state']);codes=ctx.expand(state)
            ident='T2126-V52-ONSET-'+hashlib.sha256(codes.tobytes()).hexdigest()[:12]
            label='D'+str(d)+'-'+field+'-rightPinkyPreserving';controls.append(dict(label=label,id=ident,value=value))
            present=next((r for r in finals['layouts'] if r['id']==ident and r['policy']==list(state.policy)),None)
            if present:
                if label not in present['originRoutes']:present['originRoutes'].append(label)
                continue
            final_groups={f:state.partition[r] for f,r in ctx.final_roots.items()}
            finals['layouts'].append(dict(id=ident,originRoutes=[label],shapeKeysByMeaning='AEUIO',toneRowsByTone=ctx.tone_rows,
                tonedCodes=[''.join(chr(65+x) for x in code) for code in codes],finalGroups=final_groups,regionMaps=state.maps,
                firstKeys=dict(zip(ctx.names,state.first)),policy=list(state.policy),score=value['score'],doubleScore=value['doubleScore'],tracks=value['tracks'],ergonomics=value['ergonomics'],
                rhymeGroups=[dict(roots=[ctx.roots[i] for i,g in enumerate(state.partition) if g==group],finals=[f for f,g in final_groups.items() if g==group]) for group in range(10)],
                memoryLower=value['memoryLower'],memoryGuard=value['memoryGuard'],D=value['D']))
    write(str(PREFIX)+'-controls.json',dict(rightPinkyCeiling=right,selection='Best recorded eligible states under each D/objective, with native four-track right-pinky peak no greater than A; no extra search and no local-optimum claim.',results=controls))
    write(str(PREFIX)+'-finalists.json',finals);print('controls',len(controls),'total unique finalists',len(finals['layouts']))


def report():
    search=read(str(PREFIX)+'.json');finals=read(str(PREFIX)+'-finalists.json');verify=read(str(PREFIX)+'-verification.json')
    spec=read(ROOT/'research/config/toned-2126-v52-onset-atoms.json');baseline=dict(zip(spec['atomNames'],spec['baselineFirstKeys']))
    old=read(ROOT/'research/notes/2026-11-19-toned-2126-v52-comparison.json');a=next(r for r in old['results'] if r['id']=='A')
    corpus_path=ROOT/'research/config/continuous-shuangpin-5500.json';timing_path=ROOT/'research/config/continuous-motor-timing-v1.json.gz'
    corpus=read(corpus_path);timing=Timing(timing_path)
    f19=next(r for r in read(ROOT/'research/notes/2026-11-19-continuous-shuangpin-5500.json')['results'] if r['id']=='f19a0ad1dc')
    names={}
    for route in search['routes']:
        layout=next(r for r in finals['layouts'] if route['name'] in r['originRoutes']);names.setdefault(layout['id'],[]).append(route['name'])
    rows=[]
    for l in finals['layouts']:
        native=next(r for r in verify['results'] if r['id']==l['id'] and list(r['policy'].values())==l['policy']);e=native['ergonomics'];ts=e['tracks'];peak=lambda f:max(t[f] for t in ts.values())
        streams={size:continuous(corpus,l,finals['tokenKeys'],timing,corpus['sceneOrder'+size]) for size in ['5500','5000']}
        for size,s in streams.items():s['scoreF19Equals100']=100*f19[size]['msPerHan']/s['msPerHan']
        rows.append(dict(id=l['id'],originRoutes=l['originRoutes'],policy='/'.join(l['policy']),score=native['score'],doubleScore=native['doubleScore'],
            deltaDefault=native['score']-search['baseline']['score'],deltaDouble=native['doubleScore']-search['baseline']['doubleScore'],
            memory=native['memory'],firstKeys=l['firstKeys'],onsetChanges=[dict(atom=k,before=baseline[k],after=v) for k,v in l['firstKeys'].items() if v!=baseline[k]],
            leftPinkyPeak=peak('leftPinkyQAZ'),rightPinkyPeak=peak('rightPinky'),homeMinimum=min(t['home'] for t in ts.values()),
            maxFingerPeak=peak('maxFinger'),bothIndexPeak=max(t['finger'][3]+t['finger'][6] for t in ts.values()),nativeTracks=ts,cktTracks=native['tracks'],continuous=streams))
    rows.sort(key=lambda r:r['score'])
    write(str(PREFIX)+'-comparison.json',dict(version=1,baseline=search['baseline'],results=rows))
    lines=['# 21×26 CKT v5.2：声母与韵组联合搜索','',
        '结论：改变声母打开了旧固定声母长跑未覆盖的收益。M20/22不升时，D3与D2均有默认/加倍认知成本同时优于A的方案。最低CKT代表O1；优先验证的均衡代表O2（D3，双小指均低于A）和O5（D2，双小指均低于A）。',
        'O1与D2默认冠军O3在默认成本下四条字/词轨均快于A。O2/O5二字轨略回退，三/四字改善明显；主行占比和部分同指异键指标也有取舍。没有声称全指标优势或宽参数稳健第一。','',
        '从A和N12的韵布局出发，开放零声母、卷舌和普通声母的完整原子；普通声母偏移D<=3，另保留D<=2路线。统一M-T1下界<=20、保守值<=22；原生四轨终码左小指峰值<=8.5%；固定21个声键和实际10/9/7韵键。',
        'A/E/O分别允许独立移动，也允许统一移动；W/Y单列零声母；zh/ch/sh各自完整移动，不拆声母。声键域固定为BCDFGHJKLMNPQRSTVWXYZ，不占AEUIO辅键。',
        '先穷举每个种子的581个合法单步/交换/归位补偿声母端点，再从记录中的最好合格端点分别进行默认/两倍认知成本、D3/D2四路线最陡下降，联合检查声母端点、根韵迁移/互换、行内整组换键/改键和中心全部144辅序。仅删除完全重复状态，完整Common/99%词频竞赛评分，无GPU代理或抽样。',
        '归位补偿允许先退回一个普通声母或W/Y，再同时移动另一个原子；检查联合终点，不要求中间状态也满足D/M预算。实际合法音节覆盖和完整21声键域均逐状态检查。',
        f"本轮共{search['uniqueFullEvaluations']}个去重状态的完整评分（首键/根分组/行键位/辅序作为状态键），运行约{search['elapsedSeconds']:.1f}秒。各最终中心的所列完整邻域在对应D/目标下均无更优合格候选；不构成全局最优，也未穷举任意多步组合。",'',
        f"基准A：默认{search['baseline']['score']:.9f}，六项认知成本全部加倍{search['baseline']['doubleScore']:.9f}，M20/22、D3，原生左/右小指峰值{100*a['leftPinkyPeak']:.3f}%/{100*a['rightPinkyPeak']:.3f}%。",'',
        '默认成本为第一/二/三辅300/300/300ms、选重600ms、扫描50ms、翻页300ms；加倍时六项都乘2，候选和S005参考同步重算。运动成本不乘2，原语料/权重/路由固定。',
        '','|代表|来源路线|辅序|默认CKT5.2|加倍成本CKT5.2|M下/保守|D|左小指峰值|右小指峰值|','|---|---|---|---:|---:|---:|---:|---:|---:|']
    for i,r in enumerate(rows,1):
        r['label']='O'+str(i);m=r['memory'];lines.append(f"|O{i} {r['id']}|{','.join(r['originRoutes'])}|{r['policy']}|{r['score']:.9f}|{r['doubleScore']:.9f}|{m['lower']}/{m['guard']}|{m['D']}|{100*r['leftPinkyPeak']:.3f}%|{100*r['rightPinkyPeak']:.3f}%|")
    lines+=['','|代表|相对A的完整声母变化|最低主行|最大单指|双食指峰值|字/二/三/四字同指异键|连续5500字ms/字|','|---|---|---:|---:|---:|---|---:|']
    for r in rows:
        changes='；'.join(x['atom']+':'+x['before']+'→'+x['after'] for x in r['onsetChanges'])
        sf='/'.join(f"{100*r['nativeTracks'][k]['differentKeySameFingerRate']:.3f}%" for k in ['character','word2','word3','word4'])
        lines.append(f"|{r['label']}|{changes}|{100*r['homeMinimum']:.3f}%|{100*r['maxFingerPeak']:.3f}%|{100*r['bothIndexPeak']:.3f}%|{sf}|{r['continuous']['5500']['msPerHan']:.6f}|")
    lines+=['','|代表|连续5500字左小指|连续右小指|连续主行|连续双食指|连续同指异键|连续分f19=100|','|---|---:|---:|---:|---:|---:|---:|']
    for r in rows:
        s=r['continuous']['5500'];lines.append(f"|{r['label']}|{100*s['leftPinky']:.3f}%|{100*s['rightPinky']:.3f}%|{100*s['home']:.3f}%|{100*s['bothIndex']:.3f}%|{100*s['differentKeySameFingerRate']:.3f}%|{s['scoreF19Equals100']:.6f}|")
    lines+=['','所有原生负担按该行实际辅序所选终码计算，包含形辅；连续5500/5000字每字仅两声韵键，为另一个实验口径。',
        '六个最终/守门布局另各补齐144辅序。主搜索的三个不同终点在默认及加倍成本下均以12/12/24最优；守门表采用固定12/12/24便于两点比较，各点专用最优及极小辅序取舍另见-policies.json.gz。',
        '右小指不是本轮主搜索硬约束，因此最低CKT可能将负担转移给右小指。额外对已有完整评分记录选出右小指峰值不高于A的控制代表，单独标记rightPinkyPreserving；这些控制代表未声称局部最优。',
        '全部最终/控制代表均以独立原生完整JavaScript评分器重建竞赛，核对默认及加倍CKT、各词轨分量、每键负荷和M-T1账本；辅助语义AEUIO/IEUAO、42310回环不变。',
        '未修改R11 HTML或生产配置。复现：`just --justfile research/toned-2126-v52-onsets.just search`完成搜索、控制选择、辅序审计、独立验证及报告；`test`运行覆盖、预算和语义回归。']
    for ident in ['T2126-V52-ONSET-074b056780a0','T2126-V52-ONSET-cd3913bd9d82']:
        layout=next(l for l in finals['layouts'] if l['id']==ident);label=next(r['label'] for r in rows if r['id']==ident)
        lines+=['',f'## {label} 可复核韵组','',
            '|不可拆根韵成员|上排二三声|中排四声|下排一轻声|','|---|---|---|---|']
        for i,g in enumerate(layout['rhymeGroups']):
            keys=[bank[layout['regionMaps'][r][i]] for r,bank in enumerate(['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'])]
            lines.append('|'+','.join(g['roots'])+'|'+'|'.join(keys)+'|')
        lines+=['','n={in,ün}，ng={ing}，v=独立ü；完整韵母随去介音根一致移动。1407音节完整映射见-finalists.json。']
    write(str(PREFIX)+'-comparison.json',dict(version=1,baseline=search['baseline'],results=rows))
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf8');print('reported',len(rows),'finalists')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--prepare',action='store_true');args=parser.parse_args()
    prepare() if args.prepare else report()
