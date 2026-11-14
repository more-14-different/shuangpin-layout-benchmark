"""Export bounded three-operation and alternative-center research with explicit coverage."""
import base64
import gzip
import json
import math
from pathlib import Path
from verify_untoned_2126_recenter_memory import ROOT, HEADS, FINALS, sha

DIRECTORY=ROOT/'research/.cache/untoned-2126-threehop-20261115'
NOTES=ROOT/'research/notes'
PREFIX='2026-11-15-untoned-2126-threehop'


def read(file):
    return json.loads(Path(file).read_text(encoding='utf-8'))


def changes(before,after,start,names):
    a,b=base64.b64decode(before),base64.b64decode(after)
    return '、'.join(f'{n}: {chr(65+a[start+i])}→{chr(65+b[start+i])}' for i,n in enumerate(names) if a[start+i]!=b[start+i]) or '不变'


def main():
    file=DIRECTORY/'checkpoint.json'
    saved=read(file)
    assert saved['completed'] and saved['finalClosed']
    for source,digest in saved['sourceHashes'].items():
        assert sha(source)==digest, f'Source changed: {source}'
    verification_file=NOTES/f'{PREFIX}-verification.json'
    verification=read(verification_file)
    assert verification['passed'] and verification['checkpointSha256']==sha(file)
    assert verification['fingerprint']==saved['fingerprint']
    assert sha(saved['scoreArchive'])==saved['scoreArchiveSha256']==verification['scoreArchiveSha256']
    rows=[json.loads(line) for line in gzip.decompress(Path(saved['scoreArchive']).read_bytes()).decode().splitlines()]
    scores={r['key']:r for r in rows}
    assert len(scores)==len(rows)==verification['uniqueScoreCoverage']
    assert all(math.isfinite(r['score']) for r in rows)
    required={saved['start']['key'],*(c['key'] for c in saved['centers'])}
    hard=set()
    manifests=[]
    exports={}
    for stage in saved['stages']:
        assert stage['completed'] and sha(stage['manifestFile'])==stage['manifestSha256']
        m=read(stage['manifestFile']);manifests.append(m)
        hard.update(r['key'] for r in m['rows'])
        required.update(r['key'] for r in m['rows'] if r['comfortable'])
        output=NOTES/f"{PREFIX}-stage-{stage['index']}-manifest.json.gz"
        output.write_bytes(gzip.compress(Path(stage['manifestFile']).read_bytes(),compresslevel=9,mtime=0))
        exports[output.name]={'sha256':sha(output),'uncompressedSha256':stage['manifestSha256'],'bytes':output.stat().st_size}
    assert required==set(scores) and len(hard)==verification['uniqueHardLegalVerified']
    output=NOTES/f'{PREFIX}-scores.jsonl.gz';output.write_bytes(Path(saved['scoreArchive']).read_bytes())
    exports[output.name]={'sha256':sha(output),'records':len(scores),'bytes':output.stat().st_size}
    start=saved['start'];best=scores[saved['bestKey']]
    assert abs(best['score']-saved['bestScore'])<=1e-10
    fresh={r['key']:r for r in verification['results']}
    assert best['key'] in fresh and fresh[best['key']]['independentPass']
    assert all(math.isfinite(r['maximumAbsoluteDifference']) and r['maximumAbsoluteDifference']<=1e-9 for r in fresh.values())
    best_meta=next(r for m in reversed(manifests) for r in m['rows'] if r['key']==best['key'])
    raw=base64.b64decode(best['key'])
    config={'version':'untoned-2126-threehop-finalist-1','status':'research; production unchanged','id':saved['bestId'],'capacity':[21,26],'initialMap':dict(zip(HEADS,(chr(65+k) for k in raw[:27]))),'finalMap':dict(zip(FINALS,(chr(65+k) for k in raw[27:]))),'shapeKeysByMeaning':'AEUIO','toneKeysByTone':'IEUAO','toneDigitsByShapeMeaning':'42310','shapeAuxiliaryOrder':'12/12/24','toneAuxiliaryOrder':'12/21/13','balanceContract':'soft-page-fill-v2','cktV51':best['score'],'audit':best_meta['audit'],'ergonomics':best_meta['erg'],'independent':fresh[best['key']]['independent'],'sourceHashes':saved['sourceHashes']}
    (ROOT/'research/config/untoned-2126-threehop-finalist.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    summary={**saved,'sourceCheckpointSha256':sha(file),'verificationSha256':sha(verification_file),'uniqueScoreCoverage':len(scores),'uniqueHardLegalMR2Verified':len(hard),'gainFromStart':start['score']-best['score'],'exports':exports,'scope':'Complete third-operation extensions of 40 selected two-operation bridges plus 1,000,000 deterministic sampled triples, six bounded alternative-center one-hop descents, and final one-hop closure; not exhaustive three-hop or global optimization.'}
    (NOTES/f'{PREFIX}-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    root=manifests[0];st=root['stats'];head_rows=[r for r in root['rows'] if r['comfortable'] and r['headChanges']]
    head_min=min((scores[r['key']]['score'] for r in head_rows),default=None)
    genuine=[r for r in root['rows'] if r['comfortable'] and r['outsideOriginalTwoHop']]
    genuine_min=min((scores[r['key']]['score'] for r in genuine),default=None)
    lines=['# 21×26 双空：三步联动与其他中心探索','',f"起点CKT **{start['score']:.12f}**；本轮通过全部门禁的最佳 `{saved['bestId']}` 为 **{best['score']:.12f}**，净下降 **{start['score']-best['score']:.12f}**。",'',
    'M-R2≤40、D≤3、V≤1、无额外路由；Common399全覆盖、399码互异、QZ/ZQ双空。shapeKeysByMeaning=AEUIO、toneKeysByTone=IEUAO、42310、辅序12/12/24与12/21/13、soft-page-fill-v2、完整mass=.99词语料、S005参考和轨权均不变。移手、S2主行、20合同最低主行及独立S2当量/A7E-v4仍按原生产下界/上界验收。','',
    '## 三步覆盖','',
    f"从当前完整两步集合选择32个工效合格桥接点和8个暂时未达到工效门槛的硬合法桥接点，全部补齐第三步；桥接点按各声母映射最低CKT、低CKT、工效极值和固定种子多样性选择。桥接点不局限于单步可达状态，第三步不按代理分或Top-K筛选。另抽样1,000,000组三操作序列，中间态不设硬约束或工效门禁。",'',
    '| 覆盖项 | 数量 |','|---|---:|',f"| 桥接点 | {st['bridges']} |",f"| 结构化第三步操作 | {st['structured']['thirdOperationsVisited']:,} |",f"| 固定种子抽样三操作序列 | {st['sampled']['sampledTriples']:,} |",f"| 合并去重后硬合法终态 | {st['hardLegal']:,} |",f"| 工效合格且完整评分 | {st['comfortable']:,} |",f"| 合格池中改变声母 | {len(head_rows):,} |",f"| 存在已观察的硬违规中间态路径：硬合法池 | {st['observedIllegalIntermediate']:,} |",f"| 合格池中不在原中心两步终态集合 | {len(genuine):,} |",'',
    f"三步池最低CKT为{saved['stages'][0]['rawMinimum']:.12f}；不在原两步集合中的合格终态最低为{genuine_min:.12f}；改变声母的合格终态最低为{head_min:.12f}。这些数值仅覆盖本轮生成池，不代表完整三步空间的最小值。",'',
    '## 六个其他中心','',
    '其他起点从既有同口径记录中选取，均在原中心完整两步终态集合之外，且至少6个声韵token的物理映射不同。选择考虑不同声母、较低CKT、较高移手/主行、历史较远记录和物理差异。距离不能证明统计独立盆地。每轮评分该中心全部硬合法且工效合格的一步邻居；允许起点当量不合格，但下降后接受点必须通过全部门禁。每条路径最多8轮，触限者不宣称闭包。','',
    '| 中心 | 初始CKT | 距原中心token数 | 轮数 | 终点CKT | 一步闭包 | 初始独立门禁 |','|---|---:|---:|---:|---:|---|---|']
    for c in saved['centers']:
        lines.append(f"| {c['index']} | {c['score']:.12f} | {c['distance']} | {c['round']} | {scores[c['currentKey']]['score']:.12f} | {c['oneHopClosed']} | {c['initialPass']} |")
    lines+=['','## 最佳方案与取舍','',f"相对本轮起点声母变化：{changes(start['key'],best['key'],0,HEADS)}。",f"相对本轮起点韵母变化：{changes(start['key'],best['key'],27,FINALS)}。",'','| 指标 | 起点 | 本轮最佳 |','|---|---:|---:|',f"| CKT↓ | {start['score']:.12f} | {best['score']:.12f} |"]
    start_config=read(ROOT/'research/config/untoned-2126-recenter-finalist.json')
    for label,key in [('移手↑','mx'),('S2主行↑','homeS2'),('20合同最低主行↑','homeFloor'),('W峰值↓','wMax'),('Y峰值↓','yMax'),('右小指峰值↓','rpMax')]:
        lines.append(f"| {label} | {start_config['ergonomics'][key]:.9f} | {best_meta['erg'][key]:.9f} |")
    lines += [f"| S2当量↓ | {start_config['independent']['tracks']['S2']['e34']:.12f} | {fresh[best['key']]['independent']['tracks']['S2']['e34']:.12f} |",f"| A7E-v4↓ | {start_config['independent']['a7eV4']:.12f} | {fresh[best['key']]['independent']['a7eV4']:.12f} |",'','## 阶段明细','','| 阶段 | 类型 | 起点CKT | 合格评分 | 新评分 | 本阶段最佳CKT |','|---|---|---:|---:|---:|---:|']
    for s in saved['stages']:
        lines.append(f"| {s['label']} | {s['kind']} | {s['anchorScore']:.12f} | {s['total']} | {s['stats']['unscored']} | {s['bestScore']:.12f} |")
    lines+=['','## 核验与结论边界','',f"新增{saved['newScores']:,}条完整八轨评分，保存{len(scores):,}个不同评分状态；{len(hard):,}个硬合法终态全部通过原版M-R2审计。三步桥接选择、固定种子采样和各轮一步集合全部重新生成，核对终态集合完全一致；每条操作路径均重放。评分与缓存绑定完整依赖和SHA256，重复状态逐项对照八轨分项。",'',
    f"原JS新鲜复算{len(fresh)}个起点、接受点或路径终点，并重做20合同审计；八轨最大数值差异{max(r['maximumAbsoluteDifference'] for r in fresh.values()):.3g}。最终代表已完成完整一步闭包。该试验没有搜透三步，也没有证明所有其他中心的两步收敛；若刷新低点，其新两步空间仍需另行核验。",'',
    '全部操作路径、桥接理由、中心来源、独立门禁和八轨分项见summary、verification及同名前缀gzip归档。Rime仓库及生产部署未改。','','```powershell','just untoned-2126-threehop-search 12','just untoned-2126-threehop-audit','just untoned-2126-threehop-test','```','']
    (NOTES/f'{PREFIX}.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps({'completed':True,'best':saved['bestId'],'score':best['score'],'gain':start['score']-best['score'],'newScores':saved['newScores'],'stages':len(saved['stages']),'scoreCoverage':len(scores)}))


if __name__=='__main__':
    main()
