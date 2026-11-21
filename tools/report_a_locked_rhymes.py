"""Archive the stopped A/UM40 search, audit every score row, and write its report."""
from __future__ import annotations

import collections
import csv
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'research/.cache/a-locked-rhymes-v52-6h-20261121'
PREFIX = ROOT / 'research/notes/2026-11-21-a-locked-rhymes-v52-results'
CONFIG = ROOT / 'research/config/a-locked-rhymes-v52-finalists.json'
sys.path.insert(0, str(ROOT / 'research/.cache/R11_integrated_replay'))
from audit import split
import memory_r2


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def write(p, value):
    Path(p).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')


def sha(p):
    h = hashlib.sha256()
    with Path(p).open('rb') as f:
        for block in iter(lambda: f.read(1024*1024), b''):
            h.update(block)
    return h.hexdigest()


def pack(source, dest):
    with Path(source).open('rb') as src, Path(dest).open('wb') as stream:
        with gzip.GzipFile(filename='', fileobj=stream, mode='wb', compresslevel=9, mtime=0) as target:
            shutil.copyfileobj(src, target, 1024*1024)


def normalize(modes, refs, m):
    total = 0.
    for mode in ['keytao', 'sanpin']:
        for kind, w in [('character', 1), ('word2', 3), ('word3', 1), ('word4', 1)]:
            t, r = modes[mode][kind], refs[mode][kind]
            effective = lambda x: x['motorUpperMs']+m*(x['effectiveMs']-x['motorUpperMs'])
            total += w*(effective(t)/effective(r))**4
    return 10*(total/12)**.25


def main():
    contract = read(ROOT / 'research/.cache/untoned-t2126-m4-20261120/contract.json')
    baseline = next(e for e in contract['inputs']['entries'] if e['id'] == 'RC26-39a5bfdc045342cd')
    verified = read(ROOT / 'research/notes/2026-11-21-a-locked-rhymes-v52-verification.json')
    report, checkpoint = read(WORK / 'live-report.json'), read(WORK / 'checkpoint.json')
    assert report['status'] == checkpoint['status'] == 'stopped-by-request'
    initial_maps = verified['constraints']['allowedInitials']
    finals = ['a','ai','an','ang','ao','e','ei','en','eng','er','i','ia','ian','iang','iao','ie','in','ing','iong','iu','o','ong','ou','u','ua','uai','uan','uang','ui','un','uo','v','van','ve','vn']
    groups = verified['constraints']['groups']
    data = contract['inputs']
    syllables = [(data['pinyin'][p], *split(data['pinyin'][p], False)) for p, _ in data['base']]
    assert len(syllables) == 399
    lanes = {l['name']: l for l in report['lanes']}
    stats = {name: {'evaluations': 0, 'seconds': 0., 'best': None, 'pareto': [], 'bestByMultiplier': {}, 'lastAssignedImprovementAt': None} for name in lanes}
    selected = {}; seen = set(); max_difference = 0.; count = 0
    axes = ['1','2','3','5']
    def dominates(a,b):
        return all(a['scores'][k] <= b['scores'][k]+1e-12 for k in axes) and any(a['scores'][k] < b['scores'][k]-1e-12 for k in axes)
    def brief(row):
        return {k:row[k] for k in ['id','initials','state','scores','mutation','assignedLane','scoredAt']}
    with (WORK / 'scores.jsonl').open(encoding='utf-8') as stream:
        for line in stream:
            if not line.strip(): continue
            row = json.loads(line); count += 1
            identity = row['initials']+':'+row['state']; assert identity not in seen; seen.add(identity)
            im, fm = initial_maps[row['initials']], dict(zip(finals,row['state'],strict=True))
            assert fm['ei'] == fm['er'] == 'E' and fm['o'] == fm['uo'] == 'O'
            assert all(len({fm[f] for f in g}) == 1 for g in groups)
            assert sum(fm[f] != f.upper() for f in 'aeiou') == 1
            first = sum(im[h] != h.upper() for h in im if h not in ['A','E','O','YU'])+len({im[h] for h in ['A','E','O']})
            assert first+sum(fm[f] != f.upper() for f in finals) == 40
            assert sum(im[h] != h.upper() for h in list(im)[:21] if len(h)==1) == 3
            bins = {im[h]+fm[f] for _,h,f in syllables}; assert len(bins) == 399
            empty = 'QZ' not in bins and 'ZQ' not in bins
            assert not row['assignedLane'].endswith('double-empty') or empty
            assert row['audit']['unique'] == 399 and row['audit']['qz'] == ('QZ' in bins) and row['audit']['zq'] == ('ZQ' in bins)
            for m in [1,2,3,5]:
                difference = abs(normalize(row['modes'],contract['reference'],m)-row['scores'][str(m)])
                max_difference = max(max_difference,difference); assert difference < 1e-9
            assigned = stats[row['assignedLane']]; assigned['evaluations'] += 1; assigned['seconds'] += row['seconds']
            for name, s in stats.items():
                if name.split('-')[0] != row['initials'] or name.endswith('double-empty') and not empty: continue
                b = brief(row)
                if s['best'] is None or row['scores']['1'] < s['best']['scores']['1']:
                    s['best'] = b; s['lastAssignedImprovementAt'] = row['scoredAt']
                for k in axes:
                    if k not in s['bestByMultiplier'] or row['scores'][k] < s['bestByMultiplier'][k]['scores'][k]: s['bestByMultiplier'][k] = b
                if not any(dominates(a,b) or a['scores'] == b['scores'] for a in s['pareto']):
                    s['pareto'] = [a for a in s['pareto'] if not dominates(b,a)]+[b]
    assert count == report['exactScores'] == checkpoint['scored']
    total_seconds = sum(s['seconds'] for s in stats.values())
    empty_seconds = sum(s['seconds'] for n,s in stats.items() if n.endswith('double-empty'))
    for name,s in stats.items():
        assert s['evaluations'] == lanes[name]['evaluations']
        assert abs(s['seconds']-lanes[name]['spentSeconds']) < 1e-6
        assert s['best']['id'] == lanes[name]['best']['id']
        s['pareto'].sort(key=lambda r:r['scores']['1'])
        for row in [s['best'], *s['bestByMultiplier'].values(), *s['pareto']]: selected[row['id']] = row
    entries=[]
    for row in selected.values():
        im, fm = initial_maps[row['initials']], dict(zip(finals,row['state'],strict=True))
        codes=[]
        for i,py in enumerate(data['pinyin']):
            if not baseline['codeList'][i]: codes.append(None);continue
            h,f = split(py,False);codes.append(im[h]+fm[f])
        entry={**row,'initialMap':im,'finalMap':fm,'capacity':[21,26],'tone':'IEUAO','codeList':codes,
               'changesFromOriginalA':{f:{'from':baseline['finalMap'][f],'to':fm[f]} for f in finals if fm[f]!=baseline['finalMap'][f]}}
        memory = memory_r2.audit(data,entry)
        assert memory['M'] == 40 and memory['ordinaryDisplacedCount'] == 3 and memory['coverage'] == memory['unique'] == 399
        assert memory['branchCount'] == 0
        entry['independentMemoryAudit']={k:memory[k] for k in ['M','ordinaryDisplacedCount','coverage','unique','branchCount','firstLinks','finalLinks']}
        bins={codes[p] for p,_ in data['base']}; entry['qzEmpty']='QZ' not in bins;entry['zqEmpty']='ZQ' not in bins
        entries.append(entry)
    config={'version':'a-locked-rhymes-stopped-finalists-v1','anchorId':baseline['id'],'constraints':verified['constraints'],
            'policies':verified['constraints']['policies'],'lengthBalance':contract['lengthBalance'],
            'reference':contract['reference'],'referencePolicies':contract['inputs']['entries'][0]['productionCandidateMetrics']['cktV52Policies']['reference'],
            'entries':sorted(entries,key=lambda e:e['scores']['1'])}
    write(CONFIG,config)
    write(ROOT/'research/config/a-locked-rhymes-v52-inputs.json',{
        'version':'a-locked-rhyme-frozen-input-packet-v1','commonData':{'pinyin':data['pinyin'],'base':data['base']},
        'anchorLayout':{k:baseline[k] for k in ['id','name','initialMap','finalMap','capacity','tone','codeList']},
        'compactCorpus':read(ROOT/'research/.cache/um40-v52-compact-input.json'),
        'reference':contract['reference'],'policies':verified['constraints']['policies'],'lengthBalance':contract['lengthBalance']})
    schedule=read(WORK/'reviews/schedule.json');applied=[json.loads(line) for line in (WORK/'review-applied.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
    reviews=[]
    for run in schedule['runs']:
        if run['status']!='success':continue
        decision=run['decision'][-1] if isinstance(run['decision'],list) else run['decision']
        reviews.append({'slot':run['slot'],'time':run['time'],**read(decision)})
    resources=[json.loads(line) for line in (WORK/'resource-monitor.jsonl').read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    archives={}
    for source,suffix in [(WORK/'scores.jsonl','-scores.jsonl.gz'),(WORK/'checkpoint.json','-checkpoint.json.gz'),(WORK/'resource-monitor.jsonl','-resources.jsonl.gz')]:
        dest=Path(str(PREFIX)+suffix);pack(source,dest)
        archives[dest.relative_to(ROOT).as_posix()]={'sha256':sha(dest),'bytes':dest.stat().st_size,'uncompressedSha256':sha(source)}
    replay=Path(str(PREFIX)+'-replay.json')
    replay_doc=read(replay) if replay.exists() else None
    summary={'version':'a-locked-rhymes-stopped-results-v1','status':report['status'],'startedAt':report['startedAt'],
             'stoppedAt':report['updatedAt'],'plannedDeadline':report['deadline'], 'exactEvaluations':count,
             'baseline':{'id':baseline['id'],'scores':{str(m):normalize(contract['controls'][0]['modes'],contract['reference'],m) for m in [1,2,3,5]}},
             'constraints':verified['constraints'],'lanes':stats,'doubleEmptyExactTimeShare':empty_seconds/total_seconds,
             'allRowConstraintAuditPassed':True,'allRowScoreMaximumDifference':max_difference,
             'representativeCount':len(entries),'independentPythonMemoryAuditPassed':True,
             'nativeReplay':{'path':replay.relative_to(ROOT).as_posix(),'passed':replay_doc.get('passed',False) if replay_doc else False},
             'reviews':reviews,'appliedReviews':applied,'reviewSchedule':schedule,
             'resourceSummary':{'peakCombinedRssGB':max(x['combinedRssGB'] for x in resources),'minimumAvailableGB':min(x['availableGB'] for x in resources)},
             'archives':archives,'searchManifest':checkpoint['manifest'],'runtimeUpgrade':checkpoint.get('runtimeUpgrade'),
             'limitations':['Finite neighborhood and stochastic search; no global optimality claim.','Default-cost improvement does not imply improvement at 2x/3x/5x.','UM40 initial lanes retain original A final constraints and policies; they are not the earlier unrestricted UM40 layouts.']}
    write(Path(str(PREFIX)+'.json'),summary)
    with Path(str(PREFIX)+'.csv').open('w',encoding='utf-8-sig',newline='') as stream:
        writer=csv.writer(stream);writer.writerow(['lane','id','1x','2x','3x','5x','M','D','V','unique','QZ_empty','ZQ_empty','evaluations','exact_seconds'])
        writer.writerow(['original-A',baseline['id'],*[summary['baseline']['scores'][str(m)] for m in [1,2,3,5]],40,3,1,399,True,True,'',''])
        for name,s in stats.items():
            b=s['best'];entry=next(e for e in entries if e['id']==b['id'])
            writer.writerow([name,b['id'],*[b['scores'][str(m)] for m in [1,2,3,5]],40,3,1,399,entry['qzEmpty'],entry['zqEmpty'],s['evaluations'],s['seconds']])
    with Path(str(PREFIX)+'-candidates.csv').open('w',encoding='utf-8-sig',newline='') as stream:
        writer=csv.writer(stream);writer.writerow(['id','initials','1x','2x','3x','5x','M','D','V','unique','QZ_empty','ZQ_empty','changes_from_A'])
        for e in sorted(entries,key=lambda e:e['scores']['1']):
            writer.writerow([e['id'],e['initials'],*[e['scores'][str(m)] for m in [1,2,3,5]],40,3,1,399,e['qzEmpty'],e['zqEmpty'],
                             '; '.join(f"{f}:{v['from']}->{v['to']}" for f,v in e['changesFromOriginalA'].items())])
    lines=['# 原 A 锁定韵母分组搜索：停止归档','',
        f"任务于用户要求时停止，共完成 **{count:,} 次完整精算**。开始于北京时间 2026-11-21 05:30，停止于 11:08；原计划结束时间 11:30。",'',
        '固定条件：21×26 无调双拼；声母只取原 A 或 UM40 共同布局；D3/V1/M40；Common399 399/399 唯一码。ei/er 固定 E，o/uo 固定 O；uan/van、un/vn、iang/uang、iong/ong、ing/uai 各组不可拆。原 A 的辅序及参考合同不变，形辅／调辅各占 1:1。','',
        f"双空两组合计使用完整精算时间的 **{100*empty_seconds/total_seconds:.4f}%**。两套声母的常规与双空搜索分别保存结果。",'',
        '| 路线 | 最佳 ID | 1x | 2x | 3x | 5x |','|---|---|---:|---:|---:|---:|']
    b=summary['baseline'];lines.append('| 原 A | '+b['id']+' | '+' | '.join(f"{b['scores'][k]:.9f}" for k in axes)+' |')
    for name,s in stats.items():
        b=s['best'];lines.append('| '+name+' | '+b['id']+' | '+' | '.join(f"{b['scores'][k]:.9f}" for k in axes)+' |')
    best=stats['A-regular']['best'];entry=next(e for e in entries if e['id']==best['id']);gain=summary['baseline']['scores']['1']-best['scores']['1']
    lines+=['',f"原 A 声母的常规与双空路线得到同一个默认最佳方案 `{best['id']}`，默认分降低 {gain:.9f}（{100*gain/summary['baseline']['scores']['1']:.6f}%）。但 2x、3x、5x 均较原 A 变差，因此不构成全成本优势。UM40 声母两条路线均未超过原 A。",'',
        '相对原 A 的韵母变化：'+ '；'.join(f"{f} {v['from']}→{v['to']}" for f,v in entry['changesFromOriginalA'].items())+'。其余韵母不变；QZ/ZQ 双空。','',
        '## 高认知成本候选','',
        '以下原 A 声母候选均满足双空及全部硬约束，保留不同成本下的取舍；它们不是默认成本最佳。','',
        '| 侧重 | ID | 1x | 2x | 3x | 5x |','|---|---|---:|---:|---:|---:|']
    for label,k in [('2x 最低','2'),('3x／5x 最低','3')]:
        b=stats['A-double-empty']['bestByMultiplier'][k]
        lines.append('| '+label+' | '+b['id']+' | '+' | '.join(f"{b['scores'][x]:.9f}" for x in axes)+' |')
    lines+=['',
        f"43,088 条记录均重新检查硬约束及 1x/2x/3x/5x 合成分数，最大分数差 {max_difference:.3g}；{len(entries)} 个最终代表通过独立 Python M-R2 审计。原生逐轨回放：{'通过' if replay_doc and replay_doc.get('passed') else '见同名前缀 -replay.json，尚待生成'}。",'',
        '## 每小时审阅','',
        '05:45 首轮试运行，以及 06:31、07:31、08:32、09:32、10:31 的五次审阅均完成。审阅逐步提高组合扰动探索率，并验证跨声母迁移及双空修复。重复候选复用已有精算缓存；不能将供体分数当作目标声母下的分数。用户停止任务后取消后续审阅。','']
    for review in reviews:
        lines+=['### '+review['slot'],'',review['summary'],'']
    lines+=['## 范围与文件','',
        '搜索覆盖初始合法单原子移动／交换邻域，并扩展优秀候选邻域及随机组合扰动；不是全局穷举，不能证明全局最优。评分保持原 A 辅序，未重新优化辅序；本轮也未改写 HTML。','',
        '- 结果及非支配集合：`2026-11-21-a-locked-rhymes-v52-results.json`。',
        '- 完整精算归档：`2026-11-21-a-locked-rhymes-v52-results-scores.jsonl.gz`。',
        '- 可恢复检查点：`2026-11-21-a-locked-rhymes-v52-results-checkpoint.json.gz`；恢复前须重新授权，并调整已过期截止时间。',
        '- 最终代表完整布局：`research/config/a-locked-rhymes-v52-finalists.json`。',
        '- 冻结输入、Common399 频率及基准布局：`research/config/a-locked-rhymes-v52-inputs.json`。',
        '- 内存监控、审阅建议、应用记录和 SHA-256 见结果 JSON 及资源归档。','']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines),encoding='utf-8',newline='\n')
    print(json.dumps({'evaluations':count,'representatives':len(entries),'doubleEmptyShare':empty_seconds/total_seconds,
                      'report':str(PREFIX)+'.md','archiveBytes':{k:v['bytes'] for k,v in archives.items()}},ensure_ascii=False))


if __name__=='__main__':main()
