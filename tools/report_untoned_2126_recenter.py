"""Publish recentered one/two-step closure with complete score and endpoint evidence."""
import base64
import gzip
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'research/.cache/untoned-2126-recenter-20261115'
NOTES = ROOT / 'research/notes'
PREFIX = '2026-11-15-untoned-2126-recenter'
HEADS = 'b p m f d t n l g k h j q x zh ch sh r z c s A E O W Y YU'.split()
FINALS = 'a ai an ang ao e ei en eng er i ia ian iang iao ie in ing iong iu o ong ou u ua uai uan uang ui un uo v van ve vn'.split()


def read(file):
    return json.loads(Path(file).read_text(encoding='utf-8'))


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def mapping(key):
    raw = base64.b64decode(key)
    return dict(zip(HEADS,(chr(65+k) for k in raw[:27]))), dict(zip(FINALS,(chr(65+k) for k in raw[27:])))


def changes(before, after, start, names):
    a,b = base64.b64decode(before),base64.b64decode(after)
    return '、'.join(f'{name}: {chr(65+a[start+i])}→{chr(65+b[start+i])}' for i,name in enumerate(names) if a[start+i] != b[start+i]) or '不变'


def main():
    checkpoint_file = DIRECTORY / 'checkpoint.json'
    saved = read(checkpoint_file)
    assert saved['completed'], 'Search incomplete'
    for file,digest in saved['sourceHashes'].items():
        assert sha(file) == digest, f'Source changed: {file}'
    verification_file = NOTES / f'{PREFIX}-verification.json'
    verification = read(verification_file)
    assert verification['passed'] and verification['checkpointSha256'] == sha(checkpoint_file)
    assert verification['fingerprint'] == saved['fingerprint']
    assert sha(saved['scoreArchive']) == saved['scoreArchiveSha256'] == verification['scoreArchiveSha256']
    scores_list = [json.loads(line) for line in gzip.decompress(Path(saved['scoreArchive']).read_bytes()).decode('utf-8').splitlines()]
    scores = {r['key']:r for r in scores_list}
    assert len(scores) == len(scores_list) == verification['uniqueScoreCoverage']
    assert all(math.isfinite(r['score']) for r in scores_list)
    manifests = []
    hard = set()
    required = {saved['seed']['key']}
    for stage in saved['stages']:
        assert stage['completed'] and sha(stage['manifestFile']) == stage['manifestSha256']
        manifest = read(stage['manifestFile'])
        manifests.append(manifest)
        assert manifest['fingerprint'] == saved['fingerprint']
        hard.update(r['key'] for r in manifest['rows'])
        required.update(r['key'] for r in manifest['rows'] if r['comfortable'])
    assert required == set(scores) and len(hard) == verification['uniqueHardLegalVerified']
    assert saved['stages'][-1]['kind'] == 'two' and saved['stages'][-1]['gain'] <= 1e-10
    assert saved['stages'][-2]['kind'] == 'one' and saved['stages'][-2]['gain'] <= 1e-10
    assert saved['stages'][-1]['anchorKey'] == saved['stages'][-2]['anchorKey'] == saved['bestKey']
    final_manifest = manifests[-1]
    final_rows = {r['key']:r for r in final_manifest['rows']}
    best = scores[saved['bestKey']]
    assert abs(best['score']-saved['bestScore']) <= 1e-10
    fresh = {r['key']:r for r in verification['results']}
    assert best['key'] in fresh and fresh[best['key']]['independentPass']
    assert all(math.isfinite(r['maximumAbsoluteDifference']) and r['maximumAbsoluteDifference']<=1e-9 for r in fresh.values())
    seed_config = read(ROOT / 'research/config/untoned-2126-twohop-finalist.json')
    seed = saved['seed']
    initial_map,final_map = mapping(best['key'])
    exports = {}
    archive_output = NOTES / f'{PREFIX}-scores.jsonl.gz'
    archive_output.write_bytes(Path(saved['scoreArchive']).read_bytes())
    exports[archive_output.name] = {'sha256':sha(archive_output),'records':len(scores),'bytes':archive_output.stat().st_size}
    for stage in saved['stages']:
        output = NOTES / f"{PREFIX}-stage-{stage['index']}-manifest.json.gz"
        output.write_bytes(gzip.compress(Path(stage['manifestFile']).read_bytes(),compresslevel=9,mtime=0))
        exports[output.name] = {'sha256':sha(output),'uncompressedSha256':stage['manifestSha256'],'bytes':output.stat().st_size}
    head_rows = [r for r in final_manifest['rows'] if r['comfortable'] and r['headChanges']]
    head_min = min(head_rows,key=lambda r:scores[r['key']]['score']) if head_rows else None
    summary = {**saved,'status':'research; production unchanged','sourceCheckpointSha256':sha(checkpoint_file),'verificationSha256':sha(verification_file),'uniqueNativeScoreCoverage':len(scores),'uniqueHardLegalMR2Verified':len(hard),'seedScore':seed['score'],'gainFromSeed':seed['score']-best['score'],'gainFromProduction':9.10299979136027-best['score'],'closedOneHop':saved['stages'][-2]['stats'],'closedTwoHop':saved['stages'][-1]['stats'],'finalHeadPerturbed':len(head_rows),'finalHeadMapCount':len({r['key'][:36] for r in head_rows}),'finalHeadMinimum':None if head_min is None else {'key':head_min['key'],'score':scores[head_min['key']]['score']},'exports':exports,'scope':'One/two-step closure at final center for the frozen operation set and all existing gates; no global or other-basin optimum claim.'}
    (NOTES / f'{PREFIX}-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    config = {'version':'untoned-2126-recenter-finalist-1','status':'research; production unchanged','id':saved['bestId'],'capacity':[21,26],'initialMap':initial_map,'finalMap':final_map,'shapeKeysByMeaning':'AEUIO','toneKeysByTone':'IEUAO','toneDigitsByShapeMeaning':'42310','shapeAuxiliaryOrder':'12/12/24','toneAuxiliaryOrder':'12/21/13','balanceContract':'soft-page-fill-v2','cktV51':best['score'],'audit':final_rows[best['key']]['audit'],'ergonomics':final_rows[best['key']]['erg'],'independent':fresh[best['key']]['independent'],'sourceHashes':saved['sourceHashes']}
    (ROOT / 'research/config/untoned-2126-recenter-finalist.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines = ['# 21×26 双空：新中心一步下降与完整两步闭包','',f"起点 `{seed_config['id']}`，CKT **{seed['score']:.12f}**；收敛点 `{saved['bestId']}`，CKT **{best['score']:.12f}**，净下降 **{seed['score']-best['score']:.12f}**。相对原生产9.102999791360下降 **{9.10299979136027-best['score']:.12f}**。",'',
    'M-R2≤40、D≤3、V≤1、无额外路由；Common399完整且399码互异，QZ/ZQ双空。shapeKeysByMeaning=AEUIO、toneKeysByTone=IEUAO、42310保持不变。完整mass=.99词语料、形辅序12/12/24、调辅序12/21/13、soft-page-fill-v2、S005参考与1:3:1:1轨权均沿用前轮。','',
    '最终态沿用原生产移手≥142.3218631169652、S2主行≥0.4391204207421518、20合同最低主行≥0.31284320948242345；代表的S2当量≤1.329390259361941、A7E-v4≤10.670635896300677。W/Y/右小指负载分别报告。','',
    '## 搜索过程与覆盖','',
    '每个新中心先完整评分所有硬约束及工效合格的一步终态，选择通过独立当量门禁的最低CKT；一步无改善后，枚举完整两步终态。两步改善后重新从一步开始，直到同一中心一步、两步均无改善。两步中间态允许违反硬约束或工效，不按单步CKT、运动代理分或Top-K缩减终态。','',
    '| 轮次 | 搜索深度 | 起点CKT | 硬合法终态 | 工效合格且全量评分 | 生成时复用 | 新评分 | 本轮最佳CKT | 净下降 |','|---|---|---:|---:|---:|---:|---:|---:|---:|']
    for stage in saved['stages']:
        st = stage['stats']
        lines.append(f"| {stage['index']} | {stage['kind']} | {stage['anchorScore']:.12f} | {st['uniqueHardLegalEndpoints']:,} | {st['comfortable']:,} | {st['previouslyScored']:,} | {st['unscored']:,} | {stage['bestScore']:.12f} | {stage['gain']:.12f} |")
    lines += ['', f"共新增 **{saved['newScores']:,}** 条八轨评分；各轮合计覆盖 **{len(scores):,}** 个不同已评分状态（包括复用），**{len(hard):,}** 个不同硬合法终态全部通过原版M-R2复审。每轮全部合格终态都有完整八轨分项；硬合法但未通过工效门槛者仅保留manifest，不作本轮CKT结论。",'',
    '## 实际改动','',
    '| 改善轮次 | 操作链 | 声母净变化 | 韵母净变化 |','|---|---|---|---|']
    for stage,manifest in zip(saved['stages'],manifests):
        if stage['gain'] <= 1e-10:
            continue
        witness = next(r for r in verification['stageReports'] if r['index']==stage['index'])
        operations = '；'.join(witness['winnerOperations'])
        lines.append(f"| {stage['index']} | {operations} | {changes(stage['anchorKey'],stage['bestKey'],0,HEADS)} | {changes(stage['anchorKey'],stage['bestKey'],27,FINALS)} |")
    lines += ['', '相对本轮起点的最终净变化：', '', f"- 声母：{changes(seed['key'],best['key'],0,HEADS)}。",f"- 韵母：{changes(seed['key'],best['key'],27,FINALS)}。",'',
    '| 指标 | 本轮起点 | 最终最佳 |','|---|---:|---:|',f"| CKT↓ | {seed['score']:.12f} | {best['score']:.12f} |"]
    for label,key in [('移手↑','mx'),('S2主行↑','homeS2'),('20合同最低主行↑','homeFloor'),('W峰值↓','wMax'),('Y峰值↓','yMax'),('右小指峰值↓','rpMax')]:
        lines.append(f"| {label} | {seed_config['ergonomics'][key]:.9f} | {final_rows[best['key']]['erg'][key]:.9f} |")
    lines += [f"| S2当量↓ | {seed_config['independent']['tracks']['S2']['e34']:.12f} | {fresh[best['key']]['independent']['tracks']['S2']['e34']:.12f} |",f"| A7E-v4↓ | {seed_config['independent']['a7eV4']:.12f} | {fresh[best['key']]['independent']['a7eV4']:.12f} |",'',
    '## 声母扰动为何改变了结论','']
    context = verification['headContext']
    old_delta = context['oldHeadSwap']['score']-context['oldCenter']['score']
    new_delta = context['newHeadSwap']['score']-context['newCenter']['score']
    lines += [f"同一个ch↔s交换，在旧中心{context['oldCenter']['score']:.12f}上得到{context['oldHeadSwap']['score']:.12f}（变化{old_delta:+.12f}）；在本轮起点{context['newCenter']['score']:.12f}上得到{context['newHeadSwap']['score']:.12f}（变化{new_delta:+.12f}）。声母与韵母布局的相互作用使收益符号改变，所以不能把旧中心的声母结论外推到新中心。旧中心数值来自源文件哈希一致的完整原生缓存，本轮接受点另经原JS新鲜复算。",'',
    f"最终中心两步空间中共有{len(head_rows)}个工效合格、改变声母的终态，覆盖{summary['finalHeadMapCount']}种声母映射。" + (f"其中最低CKT为{scores[head_min['key']]['score']:.12f}。" if head_min else ''),'',
    '## 闭包结论与证据','',
    f"最终中心在本轮固定操作集下，完整一步和完整两步均没有超过1e-10 CKT的、通过全部门禁的改善。最终两步终态集合已重新独立运行枚举并核对集合完全相等。此结论不涵盖任意两token重分配、其他盆地、不同辅序/语料或全局最优。",'',
    '评分复用只按62项声韵物理映射状态键匹配，并验证评分源码、语料、模板、二进制和旧结果归档哈希；重复缓存逐项对照八轨分项并拒绝冲突。所有新评分以追加journal保存，可恢复中断。最终导出的评分状态集合与各轮合格终态的并集完全一致。','',
    f"接受的改善点、每轮最低分及最终声母最低分均重新运行原JS八轨和原版20合同审计。新鲜比较最大差异为{max(r['maximumAbsoluteDifference'] for r in fresh.values()):.3g}。独立审计按CKT升序覆盖到第一个通过者；若无通过者，则覆盖所有低于本轮起点的终态。最终报告拒绝缺失、重复、非有限分数、未完成阶段及错误中心链。",'',
    '完整各轮manifest和八轨评分存于同名前缀gzip文件；summary.json记录SHA256和覆盖统计，verification.json保存新鲜复算结果。生产Rime仓库及部署方案保持不变。','',
    '```powershell','just untoned-2126-recenter-search 8','just untoned-2126-recenter-audit','just untoned-2126-recenter-test','```','']
    (NOTES / f'{PREFIX}.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps({'completed':True,'stages':len(saved['stages']),'newScores':saved['newScores'],'uniqueCoverage':len(scores),'best':saved['bestId'],'score':best['score'],'gain':seed['score']-best['score']}))


if __name__ == '__main__':
    main()
