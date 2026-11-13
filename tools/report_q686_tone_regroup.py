"""Export separate tone-row contracts, then compare exact independent benchmarks."""
import argparse
import json
import subprocess
from prepare_toned_rhyme_neighbors import ROOT, read
from integrate_snow_jiandao_toned_r11 import macro_replay

PREFIX='research/notes/2026-11-13-q686-tone-regroup'
def write(path,value):
    indent=None if path.endswith('-audit.json') else 2
    (ROOT/path).write_text(json.dumps(value,ensure_ascii=False,indent=indent)+'\n',encoding='utf8')

def collect(names):
    audit=[]
    for name in names:
        base='research/.cache/'+name
        job,scores,macro=read(base+'-job.json'),read(base+'-scores.json'),read(base+'-comfort.json')
        assert scores['completed']==scores['total']==len(job['candidates'])
        by_id={c['id']:c for c in job['candidates']}; ms={r['id']:r for r in macro}
        ranked=sorted(scores['results'],key=lambda r:r['score'])
        # Preserve actual per-mode baseline scores; a swapped layout cannot use
        # its old unswapped score as a comparison baseline.
        for r in scores['results']:
            c=by_id[r['id']]
            if c['kind']=='baseline':job['seedScores'][c['anchor']]=r['score']
        picks=ranked[:2]
        baselines=[r for r in ranked if by_id[r['id']]['kind']=='baseline']
        picks += baselines
        daily_floor=min(ms[r['id']]['score'] for r in baselines)
        no_daily_loss=[r for r in ranked if ms[r['id']]['score']>=daily_floor]
        picks.append(no_daily_loss[0])
        near=[r for r in ranked if r['score']<=ranked[0]['score']+0.02]
        picks.append(max(near,key=lambda r:ms[r['id']]['score']))
        cheap=[r for r in ranked if by_id[r['id']]['memory']<23]
        if cheap:picks.append(cheap[0])
        picks=list({r['id']:r for r in picks}.values())
        audit.append(dict(name=name,job={k:v for k,v in job.items() if k!='fixture'},
                          toneRegions=job['fixture']['toneRegions'],scores=scores,macro=macro))
        job.update(candidates=[by_id[r['id']] for r in picks])
        write(base+'-selected-job.json',job)
        write(base+'-selected-scores.json',dict(completed=len(picks),total=len(picks),elapsedSeconds=0,results=picks))
        subprocess.run(['python','tools/export_toned_rhyme_neighbors.py','--job',base+'-selected-job.json',
                        '--results',base+'-selected-scores.json','--prefix',f'research/notes/2026-11-13-{name}','--all'],cwd=ROOT,check=True)
    write(PREFIX+'-audit.json',dict(rounds=audit,inputSeed=read('research/.cache/q686-seed.json')))

def render(names):
    rows={}; layouts={}
    for name in names:
        base=f'research/notes/2026-11-13-{name}'
        report=read(base+'-benchmark.json'); data=read('research/.cache/'+name+'-macro.json')
        maps={r['id']:r for r in data['layouts']}
        layouts.update({r['id']:r for r in read(base+'-finalists.json')['layouts']})
        for r in report['results']:
            l=maps[r['id']]; codes=dict(zip(l['tokenKeys'],l['tonedCodes']))
            fixture=dict(tonedCodes=[[codes.get(py+str(t)) for t in range(1,6)] for py in data['data']['pinyin']])
            r['macro']=macro_replay(data['data'],fixture)
            if r['id']!='SNOW-JIANDAO-TONED':
                assert all(code[1]!='Q' for code in codes.values())
                assert all(code[0]=='Q' for token,code in codes.items() if token.startswith('q'))
                l=layouts[r['id']]
                tone_to_keys={t:set(region['keys'])-{'Q'} for region in l['toneRegions'] for t in region['tones']}
                assert all(code[1] in tone_to_keys[int(token[-1])] for token,code in codes.items())
                r['toneRegions']=l['toneRegions']
                r['inventory']['effectiveCapacity']=420
                r['inventory']['effectiveOccupancyPercent']=100*r['inventory']['occupied']/420
                r['inventory']['effectiveEmptyCount']=420-r['inventory']['occupied']
            rows[r['id']]=r
    audit=read(PREFIX+'-audit.json')['rounds']
    write(PREFIX+'-benchmark.json',dict(results=list(rows.values()),layouts=layouts))
    best_by_mode={mode:min((r for r in rows.values() if r['id'].startswith(tag)),
                          key=lambda r:r['ckt']['v51']['score'])
                  for mode,tag in [('原调区','QK'),('互换调区','QS')]}
    signatures={json.dumps([a['toneRegions'],c['state']],sort_keys=True)
                for a in audit for c in a['job']['candidates']}
    lines=['# Q空韵6:8:6：重分组与上下排声调互换','',
      '固定QR1-0324声母布局，D2；M_lower≤23、M_guard≤25；Q仅用于声母，第二码禁Q。'
      '每个韵根的成员整体迁移，不添加韵母声调例外。两条路线键域均为WERTYP / SDFGHJKL / ZXCBNM。'
      '不额外约束QZ；ZQ因第二码禁Q而自动为空。', '',
      '原调区：上排四声、中排二三声、下排一声与轻声。互换调区：上排一声与轻声、中排二三声、下排四声。'
      '只改变主码声调区；形辅shapeKeysByMeaning=AVUIO、toneKeysByTone=IVUAO及词辅12/213/24不变。', '',
      '| 轮次 | 算子 | 上/下调区 | 评分数 | 最低CKT |','|---|---|---|---:|---:|']
    for a in audit:
        regions={r['name']:r['tones'] for r in a['toneRegions']}
        lines.append(f"| {a['name']} | {a['job']['searchArguments']['operators']} | {regions['upper']}/{regions['lower']} | {a['scores']['total']} | {min(r['score'] for r in a['scores']['results']):.9f} |")
    lines+=['',f'共评分{sum(a["scores"]["total"] for a in audit)}次，按实际调区和完整布局去重后{len(signatures)}个。'
      '有限起点与邻域搜索不构成全局最优证明。', '']
    for mode,r in best_by_mode.items():
        lines.append(f'{mode}最低CKT：{r["id"]}，{r["ckt"]["v51"]["score"]:.9f}；'
                     f'含标点移手{r["macro"]["daily|native-punctuation"]["score"]:.6f}。')
    if {'QK1-0048','QK1-0009','QK1-0434','QK1-0276'} <= rows.keys():
        lines += ['', '四个值得保留的原调区分支，都先从QR1-0324将en/in/uen/vn组的四声键T改为P，'
                  '随后分别做以下操作（各分支独立，不是逐项叠加）：', '',
                  '- QK1-0048：ü整体并入en/in/uen/vn组；本轮最低CKT，但移手低于原Q空韵基线。',
                  '- QK1-0009：er并入a/ou组，ü并入o/ong组；M下界降到22，guard仍为25。',
                  '- QK1-0434：en/in/uen/vn与ao/iao组交换中排K/H；CKT、移手和四轨左小指峰值均优于原Q空韵基线。',
                  '- QK1-0276：ing整体并入o/ong组；移手127.238509，CKT略优于原Q空韵基线，四轨左小指峰值略高。', '',
                  '原调区最优CKT仍高于生产M21；本轮没有同时胜过生产方案全部指标的候选。'
                  '上下排各6键只表示键数相等，键位成本、声调频率和碰撞组合并不相等。'
                  '互换路线尚未尝试任意大范围重排，当前结果只支持优先继续原调区路线。']
    lines+=['', '移手分采用rime-snow-pinyin README的日常纯双拼含标点口径；'
      '表中左小指负荷是按键占比，不是独立压力模型得分。', '',
      '| ID | 上排声调 | D/F | M下界/guard | CKT v5.1↓ | 含标点移手↑ | 左小指四轨峰值↓ | 日常左小指↓ | 占桶 |',
      '|---|---|---:|---:|---:|---:|---:|---:|---:|']
    for r in rows.values():
        m=r['memory']; d=r['macro']['daily|native-punctuation']; regions=r.get('toneRegions',[dict(name='upper',tones=[4])])
        upper=next(x['tones'] for x in regions if x['name']=='upper')
        lines.append(f"| {r['id']} | {upper} | {m['ordinaryD']}/{m['ordinaryF']} | {m['memoryLower']}/{m['memoryGuard']} | {r['ckt']['v51']['score']:.9f} | {d['score']:.6f} | {100*r['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value']:.3f}% | {100*d['finger_load'][0]/d['hits']:.3f}% | {r['inventory']['occupied']} |")
    lines+=['','Q空韵候选可用容量420；生产M21为441。独立JS重算核对Rust分数误差小于1e-9。'
      '原调区和互换调区使用相同合法音节清单；交换调区后，合法音节碰撞组合可能改变，不能沿用原桶计数。']
    for l in layouts.values():
        regions={r['name']:r['tones'] for r in l['toneRegions']}
        lines+=['','## '+l['id'],'',l['description'], '',
          f"| 韵母（v=ü） | 上排{regions['upper']} | 中排{regions['home']} | 下排{regions['lower']} |",'|---|---|---|---|']
        for g in l['rhymeGroups']:
            k=g['keys'];lines.append(f"| {' / '.join(g['finals'])} | {k['upper']} | {k['home']} | {k['lower']} |")
        lines+=['','首键：'+'；'.join(f'{a}→{k}' for a,k in l['firstKeys'].items())]
    lines+=['','[完整审计](2026-11-13-q686-tone-regroup-audit.json)；[完整benchmark](2026-11-13-q686-tone-regroup-benchmark.json)。']
    (ROOT/(PREFIX+'.md')).write_text('\n'.join(lines)+'\n',encoding='utf8')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--collect',action='store_true');p.add_argument('names',nargs='+');a=p.parse_args()
    if a.collect:collect(a.names)
    else:render(a.names)
