"""Publish the exactly-100000-new-layout bounded coarse/fine annealing experiment."""
import base64
import gzip
import hashlib
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DIRECTORY=ROOT/'research/.cache/untoned-2126-anneal-100k-20261115'
NOTES=ROOT/'research/notes'
PREFIX='2026-11-15-untoned-2126-anneal-100k'
HEADS='b p m f d t n l g k h j q x zh ch sh r z c s A E O W Y YU'.split()
FINALS='a ai an ang ao e ei en eng er i ia ian iang iao ie in ing iong iu o ong ou u ua uai uan uang ui un uo v van ve vn'.split()


def read(file):
    return json.loads(Path(file).read_text(encoding='utf-8'))


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def mapping(key):
    raw=base64.b64decode(key)
    return dict(zip(HEADS,(chr(65+k) for k in raw[:27]))),dict(zip(FINALS,(chr(65+k) for k in raw[27:])))


def changes(before,after,offset,names):
    a,b=base64.b64decode(before),base64.b64decode(after)
    return '、'.join(f'{name}: {chr(65+a[offset+i])}→{chr(65+b[offset+i])}' for i,name in enumerate(names) if a[offset+i]!=b[offset+i]) or '不变'


def main():
    checkpoint_file=DIRECTORY/'checkpoint.json'
    saved=read(checkpoint_file)
    assert saved['completed'] and saved['totalNew']==saved['options']['newFullScores']==100000 and saved['pending'] is None
    for file,digest in saved['sourceHashes'].items():
        assert sha(file)==digest, f'Source changed: {file}'
    verification_file=NOTES/f'{PREFIX}-verification.json'
    verification=read(verification_file)
    assert verification['passed'] and verification['checkpointSha256']==sha(checkpoint_file)
    assert verification['newUniqueFullScores']==100000 and verification['fingerprint']==saved['fingerprint']
    journal_file=DIRECTORY/'scores.jsonl'
    assert sha(journal_file)==saved['scoreJournalSha256']==verification['journalSha256']
    rows=[json.loads(line) for line in journal_file.read_text(encoding='utf-8').splitlines() if line]
    scores={r['key']:r for r in rows}
    assert len(rows)==len(scores)==100000 and all(math.isfinite(r['score']) for r in rows)
    assert sum(r['phase']=='coarse' for r in rows)==saved['coarseNew']
    assert sum(r['phase']=='fine' for r in rows)==saved['fineNew']
    fresh={r['key']:r for r in verification['results']}
    assert saved['bestKey'] in fresh and fresh[saved['bestKey']]['independentPass']
    assert all(math.isfinite(r['maximumAbsoluteDifference']) and r['maximumAbsoluteDifference']<=1e-9 for r in fresh.values())
    exports={}
    combined_digest=hashlib.sha256()
    with journal_file.open('rb') as source:
        for part in range(10):
            journal_export=NOTES/f'{PREFIX}-scores-part-{part:02d}.jsonl.gz'
            part_digest=hashlib.sha256()
            with journal_export.open('wb') as target, gzip.GzipFile(filename='',mode='wb',fileobj=target,compresslevel=9,mtime=0) as zipped:
                for _ in range(10000):
                    line=source.readline()
                    assert line.endswith(b'\n'), 'Incomplete score shard'
                    combined_digest.update(line)
                    part_digest.update(line)
                    zipped.write(line)
            exports[journal_export.name]={'sha256':sha(journal_export),'uncompressedSha256':part_digest.hexdigest(),'records':10000,'bytes':journal_export.stat().st_size}
        assert source.read()==b'', 'Unexpected extra score rows'
    assert combined_digest.hexdigest()==saved['scoreJournalSha256'], 'Combined exported journal differs'
    campaigns=[]
    for campaign in [*saved['campaigns'],*([saved['fineCampaign']] if saved['fineCampaign'] else [])]:
        assert sha(campaign['manifestFile'])==campaign['manifestSha256']
        campaigns.append({'id':campaign['id'],'manifestSha256':campaign['manifestSha256'],'manifest':read(campaign['manifestFile'])})
    campaign_export=NOTES/f'{PREFIX}-fine-manifests.json.gz'
    campaign_export.write_bytes(gzip.compress(json.dumps({'version':1,'fingerprint':saved['fingerprint'],'campaigns':campaigns},separators=(',',':')).encode(),compresslevel=9,mtime=0))
    exports[campaign_export.name]={'sha256':sha(campaign_export),'campaigns':len(campaigns),'bytes':campaign_export.stat().st_size}
    start=read(ROOT/'research/config/untoned-2126-recenter-finalist.json')
    winner=fresh[saved['bestKey']]
    assert abs(winner['native']['score']-saved['bestScore'])<=1e-10
    initial_map,final_map=mapping(saved['bestKey'])
    best_row=scores.get(saved['bestKey'])
    config={'version':'untoned-2126-anneal-100k-finalist-1','status':'research; production unchanged','id':saved['bestId'],'capacity':[21,26],'initialMap':initial_map,'finalMap':final_map,'shapeKeysByMeaning':'AEUIO','toneKeysByTone':'IEUAO','toneDigitsByShapeMeaning':'42310','shapeAuxiliaryOrder':'12/12/24','toneAuxiliaryOrder':'12/21/13','balanceContract':'soft-page-fill-v2','cktV51':saved['bestScore'],'audit':best_row['audit'] if best_row else start['audit'],'ergonomics':winner['erg'],'independent':winner['independent'],'sourceHashes':saved['sourceHashes']}
    (ROOT/'research/config/untoned-2126-anneal-100k-finalist.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    frontier=[]
    for row in saved['frontier']:
        h,f=mapping(row['key'])
        frontier.append({**row,'initialMap':h,'finalMap':f,'independentPass':fresh.get(row['key'],{}).get('independentPass'),'independent':fresh.get(row['key'],{}).get('independent')})
    frontier_export=NOTES/f'{PREFIX}-frontier.json.gz'
    frontier_export.write_bytes(gzip.compress(json.dumps({'version':1,'fingerprint':saved['fingerprint'],'scope':'Native CKT, moving hand, S2 home, minimum20 home, W/Y/right-pinky peaks, and native character motor diagnostic. Missing independent audit does not imply admission.','rows':frontier},separators=(',',':')).encode(),compresslevel=9,mtime=0))
    exports[frontier_export.name]={'sha256':sha(frontier_export),'layouts':len(frontier),'bytes':frontier_export.stat().st_size}
    comfortable=[r for r in rows if all(r['erg'][k]>=floor-1e-12 for k,floor in [('mx',142.3218631169652),('homeS2',.4391204207421518),('homeFloor',.31284320948242345)])]
    elapsed_sum=sum(r['seconds'] for r in rows)
    hard_minimum=min(rows,key=lambda r:r['score'])
    comfortable_minimum=min(comfortable,key=lambda r:r['score']) if comfortable else None
    proposal_counts={kind:sum(r['proposalKind']==kind for r in rows) for kind in sorted({r['proposalKind'] for r in rows})}
    summary={**saved,'checkpointSha256':sha(checkpoint_file),'verificationSha256':sha(verification_file),'gainFromPreviousBest':start['cktV51']-saved['bestScore'],'comfortableNewStates':len(comfortable),'newHeadMapCount':len({r['key'][:36] for r in rows}),'proposalKindCounts':proposal_counts,'hardLegalMinimum':{'key':hard_minimum['key'],'score':hard_minimum['score'],'erg':hard_minimum['erg']},'acceptedUphillMoves':sum(r['accepted'] and r['energyAfter']>r['energyBefore'] for r in rows),'summedScoringWallSeconds':elapsed_sum,'medianScoringWallSeconds':sorted(r['seconds'] for r in rows)[len(rows)//2],'exports':exports,'scope':'Exactly 100000 novel full native scores under a bounded heuristic annealing schedule; not exhaustive closure or a global-optimum proof.'}
    summary['newComfortMinimum']={k:comfortable_minimum[k] for k in ['key','score','erg']} if comfortable_minimum else None
    (NOTES/f'{PREFIX}-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    cycles={}
    for r in rows:
        c=cycles.setdefault(r['cycle'],{'coarse':0,'fine':0,'accepted':0,'comfortable':0,'rawMinimum':float('inf')})
        c[r['phase']]+=1;c['accepted']+=int(r['accepted'])
        if all(r['erg'][k]>=floor-1e-12 for k,floor in [('mx',142.3218631169652),('homeS2',.4391204207421518),('homeFloor',.31284320948242345)]):
            c['comfortable']+=1;c['rawMinimum']=min(c['rawMinimum'],r['score'])
    lines=['# 21×26 双空：10万次新增完整评分的粗细交替退火','',f"完成 **100,000个此前未评分的不同布局**，各自完整计算原生八轨。原最低点{start['cktV51']:.12f}；本轮通过全部生产门禁的最低点 `{saved['bestId']}` 为 **{saved['bestScore']:.12f}**，净下降 **{start['cktV51']-saved['bestScore']:.12f}**。",'',
    'M-R2≤40、D≤3、V≤1、无额外路由、Common399全覆盖且399码互异、QZ/ZQ双空；shapeKeysByMeaning=AEUIO、toneKeysByTone=IEUAO、42310、形辅序12/12/24、调辅序12/21/13、soft-page-fill-v2、完整mass=.99词语料及S005参考均固定。生产部署未改。','',
    '## 预算与探索口径','',
    f"10万预算仅统计新的不同状态的完整八轨评分；导入的{verification['previouslyScoredStatesExcluded']:,}个已评状态、重复提案及最终原JS复算不计入。粗搜新增{saved['coarseNew']:,}次，细搜新增{saved['fineNew']:,}次，合计恰好100,000次。",'',
    f"新增状态涉及{summary['newHeadMapCount']:,}套不同的声母映射（含零声母入口），接受了{summary['acceptedUphillMoves']:,}次探索能量上坡移动；{len(comfortable):,}个新状态满足移手及两种主行下界，最终保留{len(frontier):,}个多维前沿点。声母映射数量并不表示穷尽了声母空间。",'',
    '16条路径交替进行每轮约6,500次粗搜和3,500次细搜。粗搜采用2/3/4/8步复合扰动；其中一部分路径不检查中间态硬约束，其余采用硬合法随机步行。最终被完整评分的状态全部满足硬约束。工效可暂时低于生产，以软罚引导修复。温度周期性下降并重热，部分路线重启到种子或前沿；新状态过滤与复合提案不对称，因此这是启发式退火，不宣称玻尔兹曼平稳分布。','',
    '探索能量分别偏重速度、均衡、主行、移手和W负载。原生CKT列从未加上这些权重。均衡路线使用原生字轨运动耗时作辅助诊断，它不等同于S2或20合同A7E。前沿保留CKT、移手、两种主行、W/Y/右小指峰值与字轨运动耗时的取舍。最终生产候选仍须满足原移手/主行下界及独立S2当量、A7E-v4上界。','',
    f"细搜完成{len(saved['campaigns'])}个完整一步邻域活动；最后预算用尽时未完成的活动为{saved['fineCampaign']['id'] if saved['fineCampaign'] else '无'}。完成的活动依据各自探索能量选点，并非都按最低CKT下降。达到10万后停止，不追加评分去宣称最终邻域闭包。",'',
    '| 轮次 | 新粗搜 | 新细搜 | 接受的粗搜移动 | 工效合格新点 | 本轮工效合格最低CKT（未必过独立门禁） |','|---|---:|---:|---:|---:|---:|']
    for cycle,c in cycles.items():
        value=f"{c['rawMinimum']:.12f}" if math.isfinite(c['rawMinimum']) else '无'
        lines.append(f"| {cycle} | {c['coarse']} | {c['fine']} | {c['accepted']} | {c['comfortable']} | {value} |")
    lines+=['','## 最佳方案与独立复算代表','','| 代表 | CKT | 移手 | S2主行 | 最低主行 | W峰值 | S2当量 | A7E-v4 | A7E-v5 | 全部门禁 |','|---|---:|---:|---:|---:|---:|---:|---:|---:|---|']
    for r in verification['results']:
        e,a=r['erg'],r['independent']
        display_id=r['id']
        if r['reason']=='current production reference': display_id='SNOW-SHENYUN-21X26-D3V1-BALANCED'
        if r['reason']=='balanced production challenger reference': display_id=read(ROOT/'research/config/untoned-2126-double-empty-closure-finalist.json')['id']
        lines.append(f"| {r['reason']} · `{display_id}` | {r['native']['score']:.12f} | {e['mx']:.6f} | {e['homeS2']:.6%} | {e['homeFloor']:.6%} | {e['wMax']:.6%} | {a['tracks']['S2']['e34']:.9f} | {a['a7eV4']:.9f} | {a['a7eV5']:.9f} | {r['allGatesPass']} |")
    lines+=['','两个参考方案沿用其历史ID；复算JSON中的RC26编号按物理布局生成，映射和评分相同。独立门槛为S2当量≤1.329390259361941、A7E-v4≤10.670635896300677，另须满足移手≥142.3218631169652、S2主行≥43.91204207421518%、最低主行≥31.284320948242345%。']
    if summary['gainFromPreviousBest']<=1e-10:
        lines+=['','## 本轮判断','',
        '这10万次没有找到任何满足移手与两种主行下界、同时低于旧最佳CKT的新点，因此在原独立门槛下也没有最低CKT改善。它提高了现有盆地及本次远跳范围内继续下探收益有限的证据强度，不证明全局最优。','',
        '维持此前选择：综合考虑CKT、A7E-v4/v5与W峰值时，优先DE26-e53e454ffc9a作为生产替换候选；只追求门槛内最低CKT时，保留RC26-885412fb398bd67f。新增低W、主行和移手极值代表多数未通过A7E-v4门槛；也有运动指标更好的合格代表，但其CKT接近原生产，仅作为另一种取舍保留。未独立审计的其他前沿点不自动获得生产资格。','',
        '不建议立刻把同一调度原样放大到百万次。若继续投入，优先针对低分点的移手、最低主行或独立当量越界做定向修复，并更换种子或扰动机制；更长的同类运行仍可能有收益，但本轮没有观察到值得立即扩量的最低CKT收益。']
    start_key=saved['seeds'][0]
    lines+=['',f"相对上一最低点的声母变化：{changes(start_key,saved['bestKey'],0,HEADS)}。",f"相对上一最低点的韵母变化：{changes(start_key,saved['bestKey'],27,FINALS)}。",'',
    '独立当量审计覆盖所有低于旧最佳且通过移手/主行的状态的CKT升序前缀，直到首个通过者；若无通过者则审计全部改善状态。这能确定本轮生产门禁内的最低CKT，但不把其余前沿点自动视为生产合格。缺少独立审计的前沿映射在机器归档中明确标记。','',
    '## 验证与复现','',
    f"全部100,000个新状态重新通过原版memory_r2.py审计；逐条重放操作路径、核对完整硬约束和工效数值、温度、探索能量、接受决定、粗细预算、细搜邻域和前沿集合。检查旧状态未混入预算、无重复、无非有限八轨数值。原JS重新计算{len(fresh)}个代表，最大差异{max(r['maximumAbsoluteDifference'] for r in fresh.values()):.3g}，并重做20合同审计。",'',
    '检查点在评分前保存待处理批次，评分采用追加journal，恢复时重放尚未提交的决定。本轮恢复未提交批次时保持16个评分进程，不调低进程数。所有输入、代码、模板、评分二进制与旧归档均绑定SHA256。完整10万条八轨结果、操作路径和接受信息分为10个scores-part-00至09.jsonl.gz，每片恰好10,000条；各片解压后按顺序连接的SHA256等于原始journal。细搜完整manifest打包存档；frontier.json.gz保留前沿映射。','',
    '冻结模板和检查点保留原实验目录D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark的绝对路径；整轮审计在该目录完成。跨目录迁移不是本轮已验证能力，恢复应使用原实验路径并通过哈希检查。','',
    '```powershell','just untoned-2126-anneal-100k 16','just untoned-2126-anneal-100k-audit','just untoned-2126-anneal-100k-test','```','']
    (NOTES/f'{PREFIX}.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps({'completed':True,'newUniqueFullScores':100000,'best':saved['bestScore'],'gain':start['cktV51']-saved['bestScore'],'frontier':len(frontier),'exports':exports}))


if __name__=='__main__':
    main()
