"""Readable comparison and continuous sound-stream ergonomics from frozen inputs."""
import collections
import csv
import gzip
import hashlib
import json
from pathlib import Path

from continuous_shuangpin import Timing,interval_contexts,edge_type

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52'
KINDS=['character','word2','word3','word4']
FINGERS={k:i for i,keys in [(0,'QAZ'),(1,'WSX'),(2,'EDC'),(3,'RTFGVB'),(6,'YUHJNM'),(7,'IK'),(8,'OL'),(9,'P')] for k in keys}


def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def pk(p):return '/'.join(p[k] for k in KINDS[1:])


def continuous(corpus,layout,token_keys,timing,order):
    codes=dict(zip(token_keys,layout['tonedCodes'],strict=True));scenes={s['id']:s for s in corpus['scenes']}
    runs=[]
    for scene_id in order:
        for sentence in scenes[scene_id]['sentences']:
            code='';owners=[];syllable=0
            for word,token in enumerate(sentence):
                if token['syllables'] is None:
                    if code:runs.append((code,owners))
                    code='';owners=[];continue
                for py,tone in token['syllables']:
                    code+=codes[py+str(tone)];owners.extend([(syllable,word)]*2);syllable+=1
            if code:runs.append((code,owners))
    total=0.;edges=collections.defaultdict(lambda:dict(intervals=0,timingMs=0.))
    loads=collections.Counter();same=0;hand=0;repeats=0;count=0
    for code,owners in runs:
        loads.update(code)
        for i,role,context in interval_contexts(code):
            value=timing.interval(role,context);total+=value
            e=edges[edge_type(owners[i],owners[i+1])];e['intervals']+=1;e['timingMs']+=value
        for a,b in zip(code,code[1:]):
            count+=1;same+=a!=b and FINGERS[a]==FINGERS[b];repeats+=a==b
            hand+=(a in 'QWERTASDFGZXCVB')==(b in 'QWERTASDFGZXCVB')
    keys=sum(loads.values());load={k:loads[k]/keys for k in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}
    group=lambda ks:sum(load[k] for k in ks)
    han=keys//2
    assert count==keys-len(runs)
    return dict(han=han,soundKeys=keys,runs=len(runs),intervals=count,timingMs=total,msPerHan=total/han,
        load=load,leftPinky=group('QAZ'),rightPinky=group('P'),home=group('ASDFGHJKL'),
        leftIndex=group('RTFGVB'),rightIndex=group('YUHJNM'),bothIndex=group('RTFGVBYUHJNM'),
        leftHand=group('QWERTASDFGZXCVB'),differentKeySameFingerRate=same/count,sameHandRate=hand/count,
        repeatKeyRate=repeats/count,edges=dict(edges))


def main():
    bundle=read(str(PREFIX)+'-candidates.json');audit=read(str(PREFIX)+'-robustness.json');verified=read(str(PREFIX)+'-verification.json')
    corpus_path=ROOT/'research/config/continuous-shuangpin-5500.json';timing_path=ROOT/'research/config/continuous-motor-timing-v1.json.gz'
    corpus=read(corpus_path);timing=Timing(timing_path);rows=[];by_id={r['id']:r for r in audit['results']}
    average={r['id']:r['selected'] for r in audit['averageRegretSelections']}
    memories={r['id']:r for r in verified['memories']};native={r['id']:r for r in verified['results'] if 'averagePositiveRegret' in r['selectionRules']}
    decomposition={d['pinyin']:d['fullFinal'] for d in read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']}
    baseline=read(ROOT/'research/notes/2026-11-19-continuous-shuangpin-5500.json')
    ref=next(r for r in baseline['results'] if r['id']=='f19a0ad1dc')
    for layout in bundle['layouts']:
        r=by_id[layout['id']];n=native[layout['id']];tracks=n['ergonomics']['tracks'];m=memories[layout['id']]
        peak=lambda key:max(t[key] for t in tracks.values())
        streams={size:continuous(corpus,layout,bundle['tokenKeys'],timing,corpus['sceneOrder'+size]) for size in ['5500','5000']}
        for size,s in streams.items():s['scoreF19Equals100']=100*ref[size]['msPerHan']/s['msPerHan']
        selection=average[layout['id']]
        rows.append(dict(id=layout['id'],name=layout['name'],policy=pk(selection['policy']),score=n['score'],
            defaultBestScore=r['defaultBest']['score'],defaultBestPolicy=pk(r['defaultBest']['policy']),
            worstOwnPolicyRegret=selection['worstRegret'],minimaxPolicy=pk(r['selected']['policy']),minimaxScore=r['selected']['defaultScore'],minimaxWorstRegret=r['selected']['worstRegret'],Mlower=m['lower'],Mguard=m['guard'],D=m['D'],F=m['F'],
            V=sum(any(decomposition[t[:-1]]==v and code[1]!=v.upper() for t,code in zip(bundle['tokenKeys'],layout['tonedCodes'],strict=True)) for v in 'aeiou'),
            leftPinkyPeak=peak('leftPinkyQAZ'),rightPinkyPeak=peak('rightPinky'),homeMinimum=min(t['home'] for t in tracks.values()),
            homeS2=tracks['character']['home'],maxFingerPeak=peak('maxFinger'),leftIndexPeak=peak('leftIndex'),rightIndexPeak=peak('rightIndex'),bothIndexPeak=peak('bothIndex'),
            nativeTracks=tracks,cktTracks=n['tracks'],aggregate=n['aggregate'],continuous=streams))
    rows.sort(key=lambda r:r['score'])
    payload=dict(version=1,continuousCorpusSha256=hashlib.sha256(corpus_path.read_bytes()).hexdigest(),continuousTimingSha256=hashlib.sha256(timing_path.read_bytes()).hexdigest(),
        nativeContract='Four native tone-in-main tracks, selected terminal codes including shape completion, own fixed minimum positive-grid average-regret policy. Peaks across tracks.',
        continuousContract='Frozen 5500/5000 Han, exactly two sound keys per Han, no completion or selection; punctuation splits runs. Experimental local timing model; f19=100.',results=rows)
    Path(str(PREFIX)+'-comparison.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    columns=['id','name','policy','score','defaultBestPolicy','defaultBestScore','worstOwnPolicyRegret','minimaxPolicy','minimaxScore','minimaxWorstRegret','Mlower','Mguard','D','F','V','leftPinkyPeak','rightPinkyPeak','homeMinimum','homeS2','maxFingerPeak','leftIndexPeak','rightIndexPeak','bothIndexPeak']
    with Path(str(PREFIX)+'-comparison.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=columns);writer.writeheader();writer.writerows({k:r[k] for k in columns} for r in rows)
    lines=['# A 精修：CKT v5.2 辅序与六成本稳健性审计','',
        '结论：A在默认参数下仍第一，建议保留12/12/24。但不能认定宽参数域唯一冠军：只对旧六代表优势稳定，加入精修近邻后温和范围内也出现反超。',
        'N12是低认知成本/词输入倾向的竞争者；N15是高认知成本竞争者，但原生终码左小指峰值明显较高。辅序稳定性与布局排名稳定性分别判断。','',
        '固定25个21×26布局，各重算144种辅序；另接入已独立审计的63个21×21布局及各自144辅序。未进行新的布局搜索。',
        '','六成本基准为第一/二/三辅300/300/300ms、选重600ms、扫描50ms、翻页300ms。词长权重1:3:1:1。每点同步重算S005参考分母。',
        '主网格0–5倍、步长0.5；极端网格0–10倍、步长1，各1,771,561点。正成本子集各1,000,000点；温和0.5–2倍子集4096点。',
        '主表采用两网格正成本子集等权平均相对损失最小的固定辅序；另列两完整网格最坏相对损失最小的纯minimax辅序。两者均相对布局自身144辅序逐点最优值。',
        '','|布局|固定稳健辅序|默认CKT5.2|默认最优辅序|M下/保守|D/F|最坏自身辅序损失|','|---|---|---:|---|---:|---|---:|']
    for r in rows:lines.append(f"|{r['id']} {r['name']}|{r['policy']}|{r['score']:.9f}|{r['defaultBestPolicy']}|{r['Mlower']}/{r['Mguard']}|{r['D']}/{r['F']}|{100*r['worstOwnPolicyRegret']:.6f}%|")
    lines+=['','|布局|平均损失最小辅序|纯minimax辅序|后者默认CKT|后者最坏损失|','|---|---|---|---:|---:|']
    for r in rows:lines.append(f"|{r['id']}|{r['policy']}|{r['minimaxPolicy']}|{r['minimaxScore']:.9f}|{100*r['minimaxWorstRegret']:.6f}%|")
    lines+=['','A固定主表平均稳健辅序，以下余量=最强对手CKT−A CKT，正值为A领先；对手逐点最优是更强比较。',
        '','|竞争集|网格/子集|对手辅序|A严格第一占比|最差名次|最小余量|中位余量|','|---|---|---|---:|---:|---:|---:|']
    for scope,grids in audit['averageRegretCrossLayoutComparisons'].items():
        for grid,modes in grids.items():
            for mode,subsets in modes.items():
                for subset in ['positive','moderate']:
                    v=subsets[subset];lines.append(f"|{scope}|{grid}/{subset}|{mode}|{v['wins']*100:.4f}%|{v['worstRank']}|{v['minGap']:+.9f}|{v['medianGap']:+.9f}|")
    lines+=['','|布局|左小指峰值|右小指峰值|最低主行|单指峰值|左食指峰值|右食指峰值|双食指峰值|','|---|---:|---:|---:|---:|---:|---:|---:|']
    for r in rows:lines.append('|'+r['id']+'|'+ '|'.join(f"{100*r[k]:.3f}%" for k in ['leftPinkyPeak','rightPinkyPeak','homeMinimum','maxFingerPeak','leftIndexPeak','rightIndexPeak','bothIndexPeak'])+'|')
    lines+=['','|布局|字/二/三/四字CKT5.2有效毫秒|平均终码键数|第一/第二辅率|选重率|','|---|---|---:|---|---:|']
    for r in rows:
        ms='/'.join(f"{r['cktTracks'][k]['effectiveMs']:.6f}" for k in KINDS);a=r['aggregate']
        lines.append(f"|{r['id']}|{ms}|{a['meanKeys']:.6f}|{a['firstAuxRate']*100:.4f}%/{a['secondAuxRate']*100:.4f}%|{a['selectionRate']*100:.4f}%|")
    lines+=['','|布局|单字/二/三/四字终码同指异键|连续5500字ms/字↓|连续分f19=100↑|连续同指异键|','|---|---|---:|---:|---:|']
    for r in rows:
        s=r['continuous']['5500'];sf='/'.join(f"{100*r['nativeTracks'][k]['differentKeySameFingerRate']:.3f}%" for k in KINDS)
        lines.append(f"|{r['id']}|{sf}|{s['msPerHan']:.6f}|{s['scoreF19Equals100']:.6f}|{100*s['differentKeySameFingerRate']:.3f}%|")
    lines+=['','网格占比不是现实人群胜率；未证明连续参数域或全布局空间最优。M为统一M-T1规则/关联计数，不是实测学习难度。原生终码与连续声韵流是不同合同。',
        '',f"验证：编译枚举与独立准备式JS对A全部144辅序一致；完整原生JS另核对{verified['independentFullChecks']}个布局/辅序，最大分差{verified['maximumScoreDifference']:.3g}。逐个重新推导M/D，核对形调语义回环。",
        '','复跑：`just --justfile research/toned-2126-v52.just audit`；缓存准备和命令见同justfile。所有生成数据保存在本目录同前缀文件。未改R11 HTML或生产配置。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print('wrote comparison for',len(rows),'layouts')


if __name__=='__main__':main()
