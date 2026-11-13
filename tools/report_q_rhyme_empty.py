"""Export Q-empty-rhyme search leaders and report their exact benchmark."""
import argparse
import json
import subprocess
from prepare_toned_rhyme_neighbors import ROOT, read
from integrate_snow_jiandao_toned_r11 import macro_replay

PREFIX='research/notes/2026-11-13-q-rhyme-empty'

def write(path,data):
    (ROOT/path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

def main():
    p=argparse.ArgumentParser(); p.add_argument('--collect',nargs='+'); a=p.parse_args()
    if a.collect:
        candidates=[]; scores=[]; seeds={}; audit=[]
        for name in a.collect:
            prefix='research/.cache/'+name
            j,s,m=read(prefix+'-job.json'),read(prefix+'-scores.json'),read(prefix+'-comfort.json')
            assert s['completed']==s['total']==len(j['candidates'])
            by_id={c['id']:c for c in j['candidates']}; macro={r['id']:r for r in m}
            ranked=sorted(s['results'],key=lambda r:r['score'])
            picks=ranked[:2]
            # Keep a high-moving-hand alternative without a very large CKT loss.
            near=[r for r in ranked if r['score'] < ranked[0]['score']+0.02]
            picks.append(max(near,key=lambda r:macro[r['id']]['score']))
            d1=[r for r in ranked if by_id[r['id']]['ordinaryD']<=1]
            if d1: picks.append(d1[0])
            for r in picks:
                if r['id'] not in {c['id'] for c in candidates}:
                    candidates.append(by_id[r['id']]); scores.append(r)
            seeds.update(j['seedScores'])
            seed_file=j.get('searchArguments',{}).get('seed_file')
            audit.append(dict(name=name,job={k:v for k,v in j.items() if k!='fixture'},scores=s,macro=m,
                              inputSeeds=read(seed_file) if seed_file else None))
        j.update(candidates=candidates,seedScores=seeds)
        write('research/.cache/q-rhyme-selected-job.json',j)
        write('research/.cache/q-rhyme-selected-scores.json',dict(completed=len(scores),total=len(scores),elapsedSeconds=0,results=scores))
        write(PREFIX+'-audit.json',audit)
        subprocess.run(['python','tools/export_toned_rhyme_neighbors.py','--job','research/.cache/q-rhyme-selected-job.json','--results','research/.cache/q-rhyme-selected-scores.json','--prefix',PREFIX,'--all'],cwd=ROOT,check=True)
        return
    report=read(PREFIX+'-benchmark.json'); data=read('research/.cache/q-rhyme-macro.json')
    maps={r['id']:r for r in data['layouts']}; finalists=read(PREFIX+'-finalists.json')
    for row in report['results']:
        layout=maps[row['id']]; codes=dict(zip(layout['tokenKeys'],layout['tonedCodes']))
        fixture=dict(tonedCodes=[[codes.get(py+str(t)) for t in range(1,6)] for py in data['data']['pinyin']])
        row['macro']=macro_replay(data['data'],fixture)
        if row['id']!='SNOW-JIANDAO-TONED':
            assert all(c[1]!='Q' for c in codes.values())
            assert all(c[0]=='Q' for t,c in codes.items() if t.startswith('q'))
            row['inventory']['capacityActive']=420
            row['inventory']['occupancyActivePercent']=100*row['inventory']['occupied']/420
    write(PREFIX+'-benchmark.json',report)
    audit=read(PREFIX+'-audit.json')
    rows=report['results']; baseline=rows[0]; best=min(rows[1:],key=lambda r:r['ckt']['v51']['score'])
    lines=['# Q空韵、不空声：6:8:6探索','',
      '结论：本轮Q空韵改善了日常移手与左小指负担，但最低CKT仍高于原M21，未实现三项同时改善。'
      '最低CKT代表QR1-0324相对原M21的CKT升约0.681%、含标点移手分升约1.892%；'
      '四轨左小指峰值由10.809%降至9.123%，日常左小指占比由7.120%降至4.979%。', '',
      'Q保持第一码q声母，全部1407个合法带调音节的第二码均不使用Q。'
      '第二码键域WERTYP / SDFGHJKL / ZXCBNM，第一码仍21键；有效容量21×20=420，原21×21画布仍为441。'
      'Q未改作辅助键；形辅AVUIO、声调映射IVUAO及12/213/24合同不变。无韵母声调例外。', '',
      f"完成{sum(x['scores']['total'] for x in audit)}次完整CKT评分（包含重复基线），预算D≤2、M_lower≤23。"
      f"本轮最低CKT为{best['ckt']['v51']['score']:.9f}，原M21为{baseline['ckt']['v51']['score']:.9f}。"
      '这是有限起点与邻域探索，不是全局最优证明。', '',
      '清空Q韵键使上排10组最多使用6键，最少合并数由3变4；直接清空时M_lower和M_guard各增加1，仍按原规则计费。', '',
      '| 方案 | D | M下界/guard | CKT v5.1↓ | 含标点移手↑ | 左小指四轨峰值↓ | 日常左小指↓ | 占桶 | 有效容量占比 |',
      '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for r in rows:
        m=r['memory']; b=r['inventory']; daily=r['macro']['daily|native-punctuation']; capacity=441 if r==baseline else 420
        lines.append(f"| {r['id']} | {m['ordinaryD']} | {m['memoryLower']}/{m['memoryGuard']} | {r['ckt']['v51']['score']:.9f} | {daily['score']:.6f} | {100*r['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value']:.3f}% | {100*daily['finger_load'][0]/daily['hits']:.3f}% | {b['occupied']} | {100*b['occupied']/capacity:.2f}% |")
    lines+=['','QZ不必为空：它是Q声母＋Z韵键；ZQ以及所有以Q为第二码的桶必空。', '',
      '与上一轮QZ单空方案CQ0-0181比较：后者D2/M23/guard26、CKT9.193022283、移手124.652453、'
      '四轨左小指8.980%、日常左小指6.794%。因此Q空韵在日常左小指上减负更多，'
      '但四轨峰值和CKT没有优于该QZ单空方案。上述差异是整套方案比较，不是孤立移除Q的因果效应。', '', '## 声韵布局']
    for l in finalists['layouts']:
        lines+=['','### '+l['id'],'','首键：'+'；'.join(f'{a}→{k}' for a,k in l['firstKeys'].items()),'',
          '| 韵母（v=ü） | 四声 | 二三声 | 一声/轻声 |','|---|---|---|---|']
        for g in l['rhymeGroups']:
            k=g['keys']; lines.append(f"| {' / '.join(g['finals'])} | {k['upper']} | {k['home']} | {k['lower']} |")
    lines+=['','[完整审计](2026-11-13-q-rhyme-empty-audit.json)保存各轮起点、算子、状态、评分和日常回放；'
            '[完整benchmark](2026-11-13-q-rhyme-empty-benchmark.json)保存四轨负载与选重数据。代表方案由独立JS完整重算。']
    (ROOT/(PREFIX+'.md')).write_text('\n'.join(lines)+'\n',encoding='utf8')

if __name__=='__main__':main()
