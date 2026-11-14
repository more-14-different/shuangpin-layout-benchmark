"""Export complete fixed-anchor two-operation coverage, scores, and onset tradeoffs."""
import base64
import gzip
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTES = ROOT / 'research/notes'
PREFIX = '2026-11-14-untoned-2126-twohop'
HEADS = 'b p m f d t n l g k h j q x zh ch sh r z c s A E O W Y YU'.split()
FINALS = 'a ai an ang ao e ei en eng er i ia ian iang iao ie in ing iong iu o ong ou u ua uai uan uang ui un uo v van ve vn'.split()


def read(file):
    return json.loads(Path(file).read_text(encoding='utf-8'))


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def changes(key, anchor, start, names):
    raw = base64.b64decode(key)
    return '、'.join(f'{name}: {chr(65+anchor[start+i])}→{chr(65+raw[start+i])}' for i,name in enumerate(names) if raw[start+i] != anchor[start+i]) or '不变'


def nondominated(rows, anchor):
    def vector(r):
        e = r['erg']
        return [r['score'],-e['mx'],-e['homeS2'],-e['homeFloor'],e['rpMax'],e['wMax'],e['yMax']]
    pool = [anchor] + rows
    vectors = [vector(r) for r in pool]
    return [row['id'] for i,row in enumerate(pool) if not any(all(a <= b+1e-12 for a,b in zip(v,vectors[i])) and any(a < b-1e-12 for a,b in zip(v,vectors[i])) for j,v in enumerate(vectors) if j != i)]


def main():
    directory = ROOT / 'research/.cache/untoned-2126-twohop-exhaustive'
    progress_file, manifest_file, journal_file = [directory / name for name in ['progress.json','manifest.json','scores.jsonl']]
    progress, manifest = read(progress_file), read(manifest_file)
    assert progress['completed'] and progress['scoringComplete']
    assert progress['manifestSha256'] == sha(manifest_file) and progress['journalSha256'] == sha(journal_file)
    for file, expected in manifest['sourceHashes'].items():
        assert sha(file) == expected, f'Source changed: {file}'
    verification_file = NOTES / f'{PREFIX}-verification.json'
    verification = read(verification_file)
    assert verification['passed'] and verification['progressSha256'] == sha(progress_file)
    scores = [json.loads(line) for line in journal_file.read_text(encoding='utf-8').splitlines() if line]
    rows = {r['id']:r for r in manifest['rows']}
    scored = {r['id']:r for r in scores}
    expected = {r['id'] for r in manifest['rows'] if r['comfortable']}
    assert len(scores) == len(scored) == len(expected) == progress['completedScores'] == progress['total']
    assert set(scored) == expected
    assert all(math.isfinite(r['score']) for r in scores)
    assert all(math.isfinite(r['maximumAbsoluteDifference']) and math.isfinite(r['native']['score']) for r in verification['results'])
    assert all(r['key'] == rows[r['id']]['key'] and r['fingerprint'] == manifest['fingerprint'] for r in scores)
    head_file = NOTES / '2026-11-14-untoned-2126-head-perturbations.json'
    head_audit = read(head_file)
    assert sha(head_file) == verification['headVerificationSha256']
    independent = {r['id']:r for r in head_audit['rows']}
    heads = [{**r,'score':scored[r['id']]['score']} for r in rows.values() if r['comfortable'] and r['headChanges']]
    seed = read(ROOT / 'research/config/untoned-2126-double-empty-closure-finalist.json')
    anchor = base64.b64decode(manifest['anchorState'])
    best = next(r for r in scores if r['key'] == progress['bestKey'])
    best_row = rows[best['id']]
    assert abs(best['score'] - progress['bestScore']) < 1e-10
    fresh = {r['id']:r for r in verification['results']}
    raw = min(scores,key=lambda r:r['score'])
    assert raw['id'] in fresh and abs(raw['score'] - fresh[raw['id']]['native']['score']) < 1e-10
    if progress['bestId'] != seed['id']:
        assert best['id'] in fresh
        best_independent = fresh[best['id']]['independent']
    else:
        best_independent = seed['independent']
    baseline_independent = progress['baselineIndependent']
    assert best_independent['a7eV4'] <= baseline_independent['a7eV4']+1e-12
    assert best_independent['tracks']['S2']['e34'] <= baseline_independent['tracks']['S2']['e34']+1e-12
    exports = {}
    for source, name in [(manifest_file,f'{PREFIX}-manifest.json.gz'),(journal_file,f'{PREFIX}-scores.jsonl.gz')]:
        output = NOTES / name
        output.write_bytes(gzip.compress(source.read_bytes(),compresslevel=9,mtime=0))
        exports[name] = {'sha256':sha(output),'uncompressedSha256':sha(source),'bytes':output.stat().st_size}
    groups = {}
    for row in heads:
        groups.setdefault(row['key'][:36],[]).append(row)
    head_groups = []
    for group in groups.values():
        r = min(group,key=lambda r:r['score'])
        head_groups.append({'initialChanges':changes(r['key'],anchor,0,HEADS),'count':len(group),'minimumCKT':r['score'],'id':r['id'],'independentPass':independent.get(r['id'],{}).get('independentPass')})
    frontier = nondominated(heads,{'id':seed['id'],'score':seed['cktV51'],'erg':seed['ergonomics']})
    # Preserve usable multi-objective starting layouts for later searches.
    frontier_layouts = []
    head_by_id = {r['id']:r for r in heads}
    for identifier in frontier:
        if identifier == seed['id']:
            frontier_layouts.append({'id':seed['id'],'key':manifest['anchorState'],'initialMap':seed['initialMap'],'finalMap':seed['finalMap'],'cktV51':seed['cktV51'],'ergonomics':seed['ergonomics'],'independentPass':True,'independent':seed['independent']})
            continue
        row = head_by_id[identifier]
        state = base64.b64decode(row['key'])
        frontier_layouts.append({'id':identifier,'key':row['key'],'initialMap':dict(zip(HEADS,(chr(65+k) for k in state[:27]))),'finalMap':dict(zip(FINALS,(chr(65+k) for k in state[27:]))),'cktV51':row['score'],'ergonomics':row['erg'],'independentPass':independent.get(identifier,{}).get('independentPass'),'independent':independent.get(identifier,{}).get('independent')})
    (ROOT / 'research/config/untoned-2126-head-pareto-seeds.json').write_text(json.dumps({'version':1,'scope':'Seven-metric head-perturbation frontier including anchor; null independentPass means not independently audited.','capacity':[21,26],'shapeKeysByMeaning':'AEUIO','toneKeysByTone':'IEUAO','toneDigitsByShapeMeaning':'42310','fingerprint':manifest['fingerprint'],'layouts':frontier_layouts},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    summary = {'version':1,'completed':True,'scope':'Exhaustive endpoints of two operations from one frozen anchor, with exact hard and comfort gates; not a global or unrestricted two-token optimum.','fingerprint':manifest['fingerprint'],'sourceHashes':manifest['sourceHashes'],'stats':manifest['stats'],'scoresVerified':len(scores),'allHardLegalMR2Verified':verification['witnessesVerified'],'bestId':progress['bestId'],'bestScore':progress['bestScore'],'gainFromAnchor':seed['cktV51']-best['score'],'rawMinimum':{'id':raw['id'],'key':raw['key'],'score':raw['score']},'nativeImprovingComfortEndpoints':progress['improvements'],'bestIndependent':best_independent,'improvementAudits':progress['independent'],'headMapGroups':sorted(head_groups,key=lambda r:r['minimumCKT']),'headSevenMetricFrontier':frontier,'headIndependentScope':head_audit['selection'],'headRepresentativesAudited':len(independent),'headRepresentativesPassing':sum(r['independentPass'] for r in independent.values()),'exports':exports,'freshVerificationSha256':sha(verification_file),'memoryVerificationSha256':verification['memoryVerificationSha256'],'headVerificationSha256':verification['headVerificationSha256'],'scopeUnscored':'Hard-legal endpoints failing any of the three original production comfort floors have no CKT claim in this run.'}
    (NOTES / f'{PREFIX}-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    state = base64.b64decode(best['key'])
    config = {'version':'untoned-2126-twohop-finalist-1','status':'research; production unchanged','id':progress['bestId'],'capacity':[21,26],'initialMap':dict(zip(HEADS,(chr(65+k) for k in state[:27]))),'finalMap':dict(zip(FINALS,(chr(65+k) for k in state[27:]))),'shapeKeysByMeaning':'AEUIO','toneKeysByTone':'IEUAO','toneDigitsByShapeMeaning':'42310','shapeAuxiliaryOrder':'12/12/24','toneAuxiliaryOrder':'12/21/13','balanceContract':'soft-page-fill-v2','cktV51':best['score'],'audit':best_row['audit'],'ergonomics':best_row['erg'],'independent':best_independent,'sourceHashes':manifest['sourceHashes']}
    (ROOT / 'research/config/untoned-2126-twohop-finalist.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    stats = manifest['stats']
    lines = ['# 21×26 双空：固定锚点的完整两步终态搜索','',f"起点 `{seed['id']}` CKT **{seed['cktV51']:.12f}**；最终通过全部门禁的最佳 `{progress['bestId']}` 为 **{best['score']:.12f}**，下降 **{seed['cktV51']-best['score']:.12f}**。原生产为9.102999791360，净下降{9.10299979136027-best['score']:.12f}。",'',
    '## 覆盖与约束','',
    'M-R2≤40、D≤3、V≤1、无额外路由；Common399完整且399个码互异，QZ/ZQ双空。形辅shapeKeysByMeaning=AEUIO、声调toneKeysByTone=IEUAO、42310不变。CKT v5.1采用完整mass=.99词语料，形辅序12/12/24、调辅序12/21/13、soft-page-fill-v2、S005固定参考与1:3:1:1轨权。','',
    '最终态必须达到原生产移手、S2主行、20合同最小主行下界。低于起点CKT的终态从最低分起逐一复核S2当量和A7E-v4，直到找到通过者；因此未独立审计的更高CKT终态不能推翻最终最小值。W/Y/右小指峰值为取舍维度，不擅自添加硬上限。','',
    '| 覆盖项 | 数量 |','|---|---:|',
    f"| 原子操作 | {stats['primitiveOperations']:,} |",f"| 去掉原地操作后的不同第一步状态 | {stats['firstStates']:,} |",f"| 访问的有序两操作组合 | {stats['orderedPairsVisited']:,} |",f"| 硬约束合法路径，去重前 | {stats['hardLegalPathsBeforeDedup']:,} |",f"| 不同硬约束合法终态 | {stats['uniqueHardLegalEndpoints']:,} |",f"| 通过三个最终工效下界、全部完成八轨CKT | {len(scores):,} |",f"| 存在硬约束违规中间态路径 | {stats['viaIllegalIntermediate']:,} |",f"| 只能经硬约束违规中间态到达 | {stats['onlyViaIllegalIntermediate']:,} |",f"| CKT低于起点的工效合格终态 | {progress['improvements']:,} |",'',
    '操作包含声母/韵母token交换、物理键组交换、单token迁移、键组迁移，以及A/E/O、Y/YU零声母家族迁移。第一步不检查硬约束或工效，不按代理分或随机抽样缩减最终合格池。原地第二步保留，所以单步及锚点本身也在终态集合。多个路径到达同一布局只评分一次。','',
    '本轮计入过去已评分状态；先前“7,396个”指去掉旧缓存后新增的工效合格终态。本轮7,621个统一重新评分，不依赖旧缓存分数替代。','',
    '未通过三个最终工效下界的硬合法终态保留在完整manifest中，但没有本轮CKT结论。搜透指上述操作集、固定锚点、固定语料与门禁下的全部终态；不代表任意两token重分配、其他盆地或全局最优。','',
    '## 最佳方案','', '| 指标 | 起点 | 两步最佳 |','|---|---:|---:|',f"| CKT↓ | {seed['cktV51']:.12f} | {best['score']:.12f} |"]
    for label,key in [('移手↑','mx'),('S2主行↑','homeS2'),('20合同最小主行↑','homeFloor'),('W峰值↓','wMax'),('Y峰值↓','yMax'),('右小指峰值↓','rpMax')]:
        lines.append(f"| {label} | {seed['ergonomics'][key]:.9f} | {best_row['erg'][key]:.9f} |")
    lines.append(f"| S2当量↓ | {seed['independent']['tracks']['S2']['e34']:.12f} | {best_independent['tracks']['S2']['e34']:.12f} |")
    lines.append(f"| A7E-v4↓ | {seed['independent']['a7eV4']:.12f} | {best_independent['a7eV4']:.12f} |")
    lines += ['',f"声母变化：{changes(best['key'],anchor,0,HEADS)}。",f"韵母变化：{changes(best['key'],anchor,27,FINALS)}。",'',f"最低原始工效合格CKT为 `{raw['id']}`：{raw['score']:.12f}。S2当量/A7E-v4复核结果见summary.json和verification.json。",'',
    '## 声母扰动的实际发现','',
    f"硬合法终态中{stats['hardLegalHeadPerturbed']:,}个改变声母，工效合格者{len(heads)}个，覆盖{len(groups)}种不同于起点的声母映射，其中纯声母终态{stats['comfortablePureHead']}个。全部{len(heads)}个都有完整八轨CKT。最低为{min(r['score'] for r in heads):.12f}，比起点高{min(r['score'] for r in heads)-seed['cktV51']:.12f}；因此本轮不存在降低CKT的声母终态，即使不再叠加当量门禁也不成立。",'',
    '| 声母映射变化 | 工效合格终态数 | 本组最低CKT | 代表当量门禁 |','|---|---:|---:|---|']
    for group in summary['headMapGroups']:
        lines.append(f"| {group['initialChanges']} | {group['count']} | {group['minimumCKT']:.12f} | {group['independentPass']} |")
    if best['score'] < seed['cktV51']-1e-10:
        witness = verification['bestOperationWitness']
        interaction = ['最佳两步操作链为：'+'；'.join(r['label'] for r in witness)+'。', '']
        if all(r['historicalNativeScore'] is not None for r in witness):
            forecast = sum(r['historicalNativeScore'] for r in witness)-seed['cktV51']
            interaction += ['分别从锚点单独做这两个操作，既有原生评分为'+'、'.join(f"{r['historicalNativeScore']:.12f}" for r in witness)+f"；按单步加性预测为{forecast:.12f}，实际联动为{best['score']:.12f}。如果仅保留加性预测低于锚点的候选，就会漏掉本次收益；完整两步评分发现了这种相互作用。", '']
        index = lines.index('## 声母扰动的实际发现')
        lines[index:index] = interaction
    lines += ['', '声母和韵母联动仍能换来其他维度的改善。下表为全部331个工效合格声母终态的各维度极值；当量门禁为原版20合同独立复核，未通过者仅作取舍证据。','',
    '| 极值维度 | 数值 | CKT | 声母变化 | 韵母变化 | S2当量与A7E-v4均通过 |','|---|---:|---:|---|---|---|']
    for label,key,descending in [('最低CKT','score',False),('最高移手','mx',True),('最高S2主行','homeS2',True),('最高主行下界','homeFloor',True),('最低W峰值','wMax',False),('最低Y峰值','yMax',False),('最低右小指峰值','rpMax',False)]:
        r = sorted(heads,key=lambda r:((r['score'] if key=='score' else r['erg'][key])*(-1 if descending else 1),r['score']))[0]
        value = r['score'] if key=='score' else r['erg'][key]
        assert r['id'] in independent
        lines.append(f"| {label} | {value:.9f} | {r['score']:.12f} | {changes(r['key'],anchor,0,HEADS)} | {changes(r['key'],anchor,27,FINALS)} | {independent[r['id']]['independentPass']} |")
    lines += ['',f"取CKT、移手、S2主行、最小主行、W/Y/右小指共七维，加入当前锚点后得到{len(frontier)}个非支配点（包含锚点与否见summary中的ID列表）。此处的七维前沿不宣称所有点通过当量门禁。{len(independent)}个代表额外完成原版20合同复核，包括每种声母映射的最低CKT、各维度极值和纯声母终态。完整映射另存research/config/untoned-2126-head-pareto-seeds.json，可作为后续更远搜索的起点；本轮没有从这些点另开搜索。",'',
    '## 评分核验与复现','',
    '批量评分器从原JS导出物理行模板，复用Rust原生运动内核；完整保留竞争池、UTF-16 ID同权排序、逐层退出、AAA三字早期池、混合词长填页与候选选择费用。33个已有原JS候选的八轨全部数值字段逐项对照，最大差异1.78×10⁻¹⁵。最终最低分及声母代表重新运行原JS八轨评分，具体差异记录在verification.json。','',
    f"所有{stats['uniqueHardLegalEndpoints']:,}个硬合法终态均重新通过原版memory_r2.py复审；全部两操作路径见证已重放。评分覆盖校验要求manifest合格ID集合与journal完全相等，并拒绝重复、外来和非有限分数。源文件、模板、二进制、状态和结果均绑定SHA256；中断后按同口径journal恢复。",'',
    '完整manifest和八轨结果分别保存在同名前缀的manifest.json.gz、scores.jsonl.gz；无损gzip，SHA256及统计在summary.json。生产Rime仓库和部署方案均未修改。','',
    '```powershell','just untoned-2126-twohop-prepare','just untoned-2126-twohop-search 4','just untoned-2126-twohop-audit','just untoned-2126-twohop-test','```','']
    (NOTES / f'{PREFIX}.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps({'scored':len(scores),'hardLegal':len(rows),'best':progress['bestId'],'score':best['score'],'headPerturbed':len(heads),'exports':exports}))


if __name__ == '__main__':
    main()
