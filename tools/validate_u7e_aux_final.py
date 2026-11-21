"""Audit stop state, independently repeated robust grids and final HTML fields."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import psutil
from summarize_u7e_low_pinky import normalized

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-21-u7e-pinky-aux-final'


def read(p):
    return json.loads(Path(p).read_text(encoding='utf8'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def payload(p):
    text=Path(p).read_text(encoding='utf8')
    start=text.index('>',text.index('<script id="payload"'))+1
    return json.loads(gzip.decompress(base64.b64decode(text[start:text.index('</script>',start)])))


def main():
    pub,browser=read(str(PREFIX)+'-publication.json'),read(str(PREFIX)+'-browser.json')
    assert pub['completed'] and browser['completed']
    assert sha(pub['html'])==pub['htmlAfterSha256']==browser['htmlSha256']
    work=ROOT/'research/.cache/u7e-grouped-cpu-20261121'
    stopped=read(work/'status.json')
    timer=read(work/'ai-reviews/timer-status.json')
    assert stopped['state']=='stopped' and timer['state']=='stopped_by_request'
    for pid in [stopped['pid'],stopped['nativePid'],timer['pid']]:
        assert not psutil.pid_exists(pid),pid
    data=payload(pub['html'])
    before=payload(ROOT/'research/.cache/u7e-pinky-aux-final-20261121/before.html')
    entries={e['id']:e for e in data['entries']}
    old_entries={e['id']:e for e in before['entries']}
    assert len(entries)==len(data['entries'])==len(before['entries'])==pub['catalogue']
    ids=set(pub['ids'])
    for ident,entry in old_entries.items():
        if ident not in ids:
            assert entries[ident]==entry,ident
    for name in ['ckt','fairCKT','r11LoadSummaries','r11PairMetrics','macroxue','completionB','completionBFixed','completionBV2','completionBV3','completionBV4','ensemble','ensembleV2','ensembleV3','ensembleV4','ensembleV5','ensembleV6']:
        assert data[name]==before[name],name
    rows=[]
    for ident in pub['ids']:
        grid=read(str(PREFIX)+'-robustness-'+ident+'.json')
        r=read(str(PREFIX)+'-scores-'+ident+'.json')
        assert grid['completed'] and r['completed']
        assert all(len(v['top10'])==10 for modes in grid['grids'].values() for v in modes.values())
        for grid_name,modes in grid['grids'].items():
            for mode,g in modes.items():
                assert g['winner']['meanRank']<=g['runnerUp']['meanRank']
                assert g['winner']['policy']==r['selectedPolicies'][mode]
        e,p=entries[ident],entries[ident]['productionCandidateMetrics']
        assert e['codeList']==old_entries[ident]['codeList']
        assert e['initialMap']==old_entries[ident]['initialMap'] and e['finalMap']==old_entries[ident]['finalMap']
        assert e['tone']=='IVUAO' and r['auxiliarySemantics']['shapeKeysByMeaning']=='AVUIO'
        assert r['auxiliarySemantics']['toneDigitsByShapeMeaning']=='42310'
        assert p['cktV52Policies']['candidate']==p['cktV51Policies']['candidate']==r['policies']
        assert p['cktV52AuxOrderSelection']['selectedPolicies']==grid['selectedPolicies']
        assert p['cktV52AuxOrderSelection']['margins']==r['margins']
        assert p['cktV52Aggregate']==r['v52']['aggregate']
        assert p['cktV52Modes']==grid['selectedTracks']
        assert data['cktV52']['schemes'][ident]['v52']==r['v52']
        for field,value in r['v52']['aggregate'].items():
            assert abs(e['readmeBenchmarkMetrics']['aggregate'+field[0].upper()+field[1:]]-value)<1e-10
        for i,m in enumerate([1,2,3,5]):
            assert abs(normalized(r['v52']['modes'],r['referenceModes'],m)-r['costs'][i])<1e-10
        assert r['maxCanonicalTrackDifference']<1e-8
        for report in [grid,r]:
            for source,digest in report.get('sourceHashes',{}).items():
                assert sha(source)==digest,source
        rows.append(dict(id=ident,name=e['name'],selectedPolicies=r['selectedPolicies'],costs=r['costs'],policyChanged=r['policyChanged'],margins=r['margins']))
    for report in [pub,browser]:
        for source,digest in report['sourceHashes'].items():
            assert sha(source)==digest,source
    result=dict(completed=True,htmlSha256=pub['htmlAfterSha256'],miningStopped=True,aiWakeTimerStopped=True,
                exactLayoutEvaluations=sum(stopped['evaluations'].values()),rows=rows,catalogue=len(entries),
                checks=dict(otherEntriesUnchanged=True,historicalBenchmarkMapsUnchanged=True,
                            selectedRobustTracksReplayed=True,allCostColumnsIndependentlyRepriced=True,
                            pairedAuxiliarySemantics=True,browserPageErrors=browser['pageErrors']),
                sourceHashes={str(p):sha(p) for p in [Path(__file__),Path(str(PREFIX)+'-publication.json'),
                    Path(str(PREFIX)+'-browser.json'),ROOT/'research/notes/2026-11-21-u7e-grouped-cpu-stop.json',
                    ROOT/'tools/summarize_u7e_low_pinky.py',ROOT/'tools/robust_untoned_v52_policy.py',
                    ROOT/'tools/analyze_single_ckt_v51_aux_order.py']})
    Path(str(PREFIX)+'-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    lines=['# 停止挖掘及两套最终稳健辅序复核（2026-11-21）','',
           f'CPU挖掘、原生精算子进程、小时AI唤醒计时器均已退出；共精算 {result["exactLayoutEvaluations"]:,} 个新布局。检查点和STOP标记保留。','',
           '重新计算每模式144辅序，六项成本独立0.5–5倍百万场景，按平均竞争名次最小选择；另以1–10倍百万场景复查。两种网格均选出同一辅序。这里不是“固定5倍成本点最优”。','',
           '| 方案 | 键道（二/三/四字词） | 三拼（二/三/四字词） | CKT1倍 | 2倍 | 3倍 | 5倍 |',
           '|---|---|---|---:|---:|---:|---:|']
    for r in rows:
        lines.append('| '+r['id']+' | '+r['selectedPolicies']['keytao']+' | '+r['selectedPolicies']['sanpin']+' | '+' | '.join(f'{v:.9f}' for v in r['costs'])+' |')
    lines+=['','两套的最优稳健辅序均与此前一致，数值经新的完整规范回放验证；HTML写入新的网格报告、第一/第二名及差距、已复核生产属性和四倍率CKT。没有添加重复方案。','','## 主网格相对第二名的平均名次优势','',
            '| 方案 | 模式 | 第一名 | 第一名平均名次 | 第二名 | 第二名平均名次 | 差距 |','|---|---|---|---:|---|---:|---:|']
    for r in rows:
        for mode,m in r['margins']['mainPositive50To500'].items():
            lines.append(f'| {r["id"]} | {mode} | {m["winner"]["policy"]} | {m["winner"]["meanRank"]:.6f} | {m["runnerUp"]["policy"]} | {m["runnerUp"]["meanRank"]:.6f} | {m["meanRankGap"]:.6f} |')
    lines+=['','f254键道在主网格仅小幅胜出；1–10倍压力网格优势扩大。该稳健标准不表示每个成本场景都第一。','','toneKeysByTone=IVUAO；shapeKeysByMeaning=AVUIO；配对42310。辅序数字为取词中字位，与五辅字义顺序无关。','','目标：'+pub['html'],'','HTML SHA-256：'+pub['htmlAfterSha256'],'']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines),encoding='utf8',newline='\n')
    print(json.dumps(dict(completed=True,miningStopped=True,aiWakeTimerStopped=True,rows=[{k:v for k,v in r.items() if k!='margins'} for r in rows]),ensure_ascii=False))


if __name__=='__main__':
    main()
