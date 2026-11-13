"""Collect CF1-0892 repartition frontiers and render independent full benchmarks."""
import argparse
import json
import subprocess
from prepare_toned_rhyme_neighbors import ROOT, read
from integrate_snow_jiandao_toned_r11 import macro_replay

PREFIX='research/notes/2026-11-13-cf1892-regroup'
def write(path,value):
    (ROOT/path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

def main():
    p=argparse.ArgumentParser(); p.add_argument('--collect',nargs='+'); args=p.parse_args()
    if args.collect:
        selected={}; seeds={}; audit=[]
        for name in args.collect:
            base='research/.cache/'+name
            job,scores,macro=read(base+'-job.json'),read(base+'-scores.json'),read(base+'-comfort.json')
            assert scores['completed']==scores['total']==len(job['candidates'])
            by_id={c['id']:c for c in job['candidates']}; ms={r['id']:r for r in macro}
            ranked=sorted(scores['results'],key=lambda r:r['score'])
            picks=ranked[:2]
            for threshold in [122.9586249541484,122.77842860194683]:
                eligible=[r for r in ranked if ms[r['id']]['score']>=threshold-1e-9]
                if eligible: picks.append(eligible[0])
            cheap=[r for r in ranked if by_id[r['id']]['memory']<22]
            if cheap:picks.append(cheap[0])
            cheap_balanced=[r for r in cheap if ms[r['id']]['score']>=122.9586249541484]
            if cheap_balanced:picks.append(cheap_balanced[0])
            improved=[r for r in ranked if r['score']<9.18262291254064-1e-9]
            if improved:picks.append(max(improved,key=lambda r:ms[r['id']]['score']))
            for r in picks:selected[r['id']]=(by_id[r['id']],r)
            seeds.update(job['seedScores'])
            audit.append(dict(name=name,job={k:v for k,v in job.items() if k!='fixture'},scores=scores,macro=macro))
        # Always include the unchanged CF1 anchor for precise comparison.
        original=read('research/.cache/cf1892-r0-job.json')['candidates'][0]
        selected[original['id']]=(original,dict(id=original['id'],score=9.18262291254064,memory=22))
        job.update(candidates=[v[0] for v in selected.values()],seedScores=seeds)
        write('research/.cache/cf1892-selected-job.json',job)
        write('research/.cache/cf1892-selected-scores.json',dict(completed=len(selected),total=len(selected),elapsedSeconds=0,results=[v[1] for v in selected.values()]))
        write(PREFIX+'-audit.json',dict(rounds=audit,inputSeed=read('research/.cache/cf1892-seed.json')))
        subprocess.run(['python','tools/export_toned_rhyme_neighbors.py','--job','research/.cache/cf1892-selected-job.json','--results','research/.cache/cf1892-selected-scores.json','--prefix',PREFIX,'--all'],cwd=ROOT,check=True)
        return
    report=read(PREFIX+'-benchmark.json'); macro=read('research/.cache/cf1892-macro.json'); layouts={l['id']:l for l in macro['layouts']}
    for r in report['results']:
        l=layouts[r['id']]; codes=dict(zip(l['tokenKeys'],l['tonedCodes']))
        fixture=dict(tonedCodes=[[codes.get(py+str(t)) for t in range(1,6)] for py in macro['data']['pinyin']])
        r['macro']=macro_replay(macro['data'],fixture)
    write(PREFIX+'-benchmark.json',report)
    audit=read(PREFIX+'-audit.json')['rounds']; finalists=read(PREFIX+'-finalists.json')
    lines=['# CF1-0892：不限QZ、固定低D/M的韵组重分配','',
      '结论：继续优化有效。CR0-0374保持M22/24，将CKT降到9.177899423、含标点移手升到123.269131；'
      '在此基础上将er整体并入a/ou组得到CR1-0004，M_lower降到21（guard仍24），CKT9.179866003、移手123.242416。'
      '两者都优于CF1-0892的CKT和移手分。左小指四轨峰值仅小幅下降，日常占比不变。', '',
      '最低CKT为CR1-1036的9.172683084：in/ün与ü换组，再将ao/iao的一声轻声键从C改到B；'
      '移手分降至120.883091，属于不同取舍。er→a/ou、ü→o/ong组合得到CR1-0009的M21/24、CKT9.176522935，'
      '但移手122.575518低于CF1-0892及生产M21。没有以提高记忆预算换取这些成绩。', '',
      '起点CF1-0892：D2、M_lower/M_guard=22/24、CKT9.182622913、含标点移手122.958625。'
      '声母布局固定；无韵母声调例外；不限QZ。硬预算D≤2、M_lower≤22、M_guard≤24。'
      'M_lower=5+首键位移成本+多韵根组数+各声调区合并数；guard用组内链接数替换多韵根组数。', '',
      '| 轮次 | 评分数 | 最优CKT |','|---|---:|---:|']
    for a in audit:lines.append(f"| {a['name']} | {a['scores']['total']} | {min(r['score'] for r in a['scores']['results']):.9f} |")
    lines+=['','root/key/coupled覆盖根迁移、互换、组键调整和受影响两组换键联动；erv穷举er与ü的联合归组。'
      '后继轮沿已有最优分组继续搜索。有限邻域不构成全局最优证明。移手与左小指是独立比较项，未作为全候选硬过滤条件。', '',
      '| ID | M下界/guard | CKT v5.1↓ | 含标点移手↑ | 左小指四轨峰值↓ | 日常左小指↓ | 占桶/441 |',
      '|---|---:|---:|---:|---:|---:|---:|']
    for r in report['results']:
        m=r['memory']; d=r['macro']['daily|native-punctuation']
        lines.append(f"| {r['id']} | {m['memoryLower']}/{m['memoryGuard']} | {r['ckt']['v51']['score']:.9f} | {d['score']:.6f} | {100*r['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value']:.3f}% | {100*d['finger_load'][0]/d['hits']:.3f}% | {r['inventory']['occupied']}/441 |")
    lines+=['','CR0-0000即不变的CF1-0892；SNOW-JIANDAO-TONED为生产M21。'
      '全部代表均由JS完整四轨独立重算并与Rust分数核对，形辅AVUIO、声调映射IVUAO、词辅12/213/24不变。生产布局未替换。']
    for l in finalists['layouts']:
        lines+=['','## '+l['id'],'',l['description'],'','首键：'+'；'.join(f'{a}→{k}' for a,k in l['firstKeys'].items()),'',
          '| 韵母（v=ü） | 四声 | 二三声 | 一声/轻声 |','|---|---|---|---|']
        for g in l['rhymeGroups']:
            k=g['keys'];lines.append(f"| {' / '.join(g['finals'])} | {k['upper']} | {k['home']} | {k['lower']} |")
    lines+=['','[完整搜索审计](2026-11-13-cf1892-regroup-audit.json)；[完整benchmark](2026-11-13-cf1892-regroup-benchmark.json)。']
    (ROOT/(PREFIX+'.md')).write_text('\n'.join(lines)+'\n',encoding='utf8')

if __name__=='__main__':main()
