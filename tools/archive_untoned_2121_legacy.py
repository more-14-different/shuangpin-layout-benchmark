"""Archive the completed historical 2k run, distinguishing its local 204-score pilot."""
from __future__ import annotations

import base64
import json
import subprocess
from pathlib import Path

from legacy_research_archive import ROOT, base_manifest, digest, git, provenance, read, write

PREFIX = 'research/notes/2026-11-21-legacy-untoned-2121'
SOURCE = 'research/notes/2026-11-15-untoned-2121-anneal-2k.json'
REF = 'e133b51'
HEADS = 'b p m f d t n l g k h j q x zh ch sh r z c s A E O W Y YU'.split()
FINALS = 'a ai an ang ao e ei en eng er i ia ian iang iao ie in ing iong iu o ong ou u ua uai uan uang ui un uo v van ve vn'.split()


def main():
    assert not (ROOT / (PREFIX + '-manifest.json')).exists(), 'Already archived; use the verifier.'
    manifest = base_manifest('untoned-21x21-v5.1-five-center-2k', ['387008a', 'f745bd0', '9599619', REF])
    originals = [p for p in git('ls-files', '--others', '--exclude-standard').decode().splitlines()
                 if '2121' in p and not p.startswith('tools/archive_')]
    manifest['originalFiles'] = [provenance(p) for p in originals]
    pilot = read(SOURCE)
    payload = git('show', f'{REF}:{SOURCE}')
    full = json.loads(payload)
    assert not pilot['completed'] and full['completed']
    assert sum(c['newScores'] for c in pilot['chains']) == 204
    assert all(c['newScores'] == 400 for c in full['chains'])
    assert full['trajectory'][:len(pilot['trajectory'])] == pilot['trajectory']
    assert pilot['fingerprint'] == full['calibration']['pilotFingerprint']
    assert full['calibration']['afterNewScores'] == 204
    manifest['pilotContinuationEvidence'] = {
        'localSource':SOURCE, 'localSourceSha256':digest((ROOT / SOURCE).read_bytes()),
        'localCompleted':False, 'localNewScores':204, 'localStates':len(pilot['states']),
        'localTrajectory':len(pilot['trajectory']), 'trajectoryIsExactPrefix':True,
        'pilotFingerprintMatchesHistoricalCalibration':True,
        'calibration':full['calibration'], 'historicalCompleted':True, 'historicalNewScores':2000,
        'historicalStates':len(full['states']), 'historicalTrajectory':len(full['trajectory']),
        'sourceCommit':manifest['relatedCommits'][-1], 'historicalSourceSha256':digest(payload),
        'historicalSourceBytes':len(payload),
        'runTimestamps':'No started/updated timestamp fields in this database; 2026-11-15 is the artifact date. Do not substitute mtime or commit time.'}
    restored = []
    dependencies = ['tools/close_untoned_2121_local.js',
        'tools/verify_untoned_2121_anneal_2k.js', 'tools/summarize_untoned_2121_anneal_2k.py',
        'research/config/untoned-2121-local-closure-finalist.json',
        'research/config/untoned-2121-local-closure-seed.json',
        'research/config/untoned-2121-anneal-2k-finalists-20261115.json',
        'research/notes/2026-11-15-untoned-2121-anneal-2k-summary.json',
        'research/notes/2026-11-15-untoned-2121-anneal-2k-finalists.json',
        'research/notes/2026-11-15-untoned-2121-anneal-2k-memory-audit.json',
        'research/notes/2026-11-15-untoned-2121-anneal-2k-verification.json']
    for p in dependencies:
        assert not (ROOT / p).exists(), p
        (ROOT / p).write_bytes(git('show', f'{REF}:{p}'))
        restored.append(provenance(p, [REF]))
    for p in ['tools/anneal_untoned_2121_multicenter_2k.js',
              'tools/report_untoned_2121_anneal_2k.py', 'tests/untoned-2121-anneal-2k.test.mjs']:
        assert p in originals
        (ROOT / p).write_bytes(git('show', f'{REF}:{p}'))
        restored.append(provenance(p, [REF]))
    manifest['restoredFiles'] = restored
    manifest['codeSnapshotResolution'] = 'Record the earlier local code hashes, then use completed-run source/tests from e133b51 (relocated paths, stronger audit and transcript test).'
    transcript = subprocess.run(['node', '-e',
        "const r=JSON.parse(require('node:fs').readFileSync(0,'utf8'));"
        "console.log(JSON.stringify(require('./tools/verify_untoned_2121_anneal_2k').validateTrajectory(r)));"],
        input=payload, capture_output=True, cwd=ROOT, check=True)
    manifest['fullHistoricalTranscriptRechecked'] = json.loads(transcript.stdout)
    summary = read('research/notes/2026-11-15-untoned-2121-anneal-2k-summary.json')
    assert summary['sourceSha256'] == digest(payload)
    assert len(full['states']) == 2006 and len(full['archive']) == 97
    new_rows = [r for r in full['states'].values() if r.get('newScore')]
    assert len(new_rows) == 2000
    selected = {}

    def take(row, reason):
        row = dict(row)
        k = base64.b64encode(bytes(ord(row[field][n])-65 for field,names in
                                 [('initialMap',HEADS),('finalMap',FINALS)] for n in names)).decode()
        # Use the authoritative full-score record when available (frontier rows are condensed).
        exact = full['states'][row['id']]
        target = selected.setdefault(k, {k:v for k,v in exact.items() if k not in
                                        ['tone','seconds','scoredByChain','newScore']})
        target.update({'key':k, 'toneKeysByTone':'IVUAO', 'shapeKeysByMeaning':'AVUIO'})
        reasons = target.setdefault('selectionReasons', [])
        if reason not in reasons:
            reasons.append(reason)

    for row in full['archive']:
        take(row, 'final five-axis Pareto frontier')
    for row in full['states'].values():
        if not row.get('newScore'):
            take(row, 'historical baseline or seed')
    take(min(new_rows, key=lambda r:r['score']), 'best novel CKT')
    verified = read('research/notes/2026-11-15-untoned-2121-anneal-2k-verification.json')
    for row in verified['results']:
        take(full['states'][row['id']], 'historical independent/native verification representative')
    retained = sorted(selected.values(), key=lambda r:r['score'])
    manifest.update({'scoreVersion':'v5.1, not v5.2', 'historicalNewScores':2000,
        'historicalTotalStates':2006, 'historicalFinalParetoCount':97,
        'retainedRecords':len(retained), 'database':PREFIX + '-selected-results.json.gz',
        'selection':'All 97 final five-axis Pareto points, all historical baselines/seeds, best novel score and the 16 historical verification representatives.',
        'resumeOriginalTrajectoryAvailable':False,
        'sourceRecovery':f'git show {REF}:{SOURCE}',
        'databaseCleanupScope':'The local 204-score pilot database is replaced by selected completed-run results. Predecessor closure caches and other worktrees are outside this 2k run and are untouched.'})
    write(manifest['database'], {'version':1, 'scoreVersion':'v5.1', 'rows':retained})
    db = ROOT / manifest['database']
    manifest.update({'databaseSha256':digest(db.read_bytes()), 'databaseBytes':db.stat().st_size})
    write(PREFIX + '-manifest.json', manifest)
    subprocess.run(['node', 'tools/verify_legacy_untoned_archive.js', PREFIX + '-manifest.json'], cwd=ROOT, check=True)
    # Keep an explicit redirect instead of an apparently complete but truncated search ledger.
    write(SOURCE, {'version':'compacted-legacy-results-pointer-v1', 'status':'completed-historical-run-compacted',
        'historicalNewScores':2000, 'localPilotNewScores':204, 'completedSourceCommit':manifest['relatedCommits'][-1]['commit'],
        'database':manifest['database'], 'manifest':PREFIX + '-manifest.json',
        'resumeOriginalTrajectoryAvailable':False})
    lines = ['# 21×21 无调 v5.1 五中心 2,000 次退火归档', '',
        f"归档记录时间：{manifest['archivedAt']}；新增归档提交，不改写历史。父提交 `{manifest['archiveParentCommit']}`；本报告首次新增的 Git 提交即归档提交。", '',
        '**这是同一场实验的试跑与后续完成版。** 当前目录原文件仅有 204 次新评分、210 个状态，completed=false；旧提交 `e133b51328bcbc29311eaf49f19f3536ed81f7dc` 已完成五条链各 400 次，共 2,000 次新评分、2,006 个状态。', '',
        '核对依据：本地 210 条 trajectory 与完成版的前 210 条逐项相等；本地 fingerprint 与完成版 calibration.pilotFingerprint 相同；完成版记录 afterNewScores=204。温度从粗 0.018→0.004 / 细 0.003→0.00015，校准为粗 0.10→0.025 / 细 0.012→0.00015；这次归档没有重跑、补算或修改温度。', '',
        '历史运行时间没有 started/updated 字段，不能编造开始/结束时间；实验文件日期为 2026-11-15。以下是可核实的旧提交时间（均带时区），不是推定的运行起止时间。', '',
        '| 关联旧提交 | 提交时间 | 工作 |', '|---|---|---|']
    for c in manifest['relatedCommits']:
        lines.append(f"| `{c['commit']}` | {c['committerTime']} | {c['subject']} |")
    lines += ['', '这些提交来自其他历史分支，未包含在本次归档父提交中；逐文件原件关系与 SHA-256 见 manifest。', '',
        '约束：21×21、M≤42、D≤2、V≤5、无分支、QZ/ZQ 双空桶；本实验允许 Common399 音节之间重码，不是 399 唯一码实验。toneKeysByTone=IVUAO，shapeKeysByMeaning=AVUIO；固定原辅序。', '',
        '**已知最佳仍为 `T21-e7cb5915032e`，CKT v5.1 = 9.525454565824509。** 2,000 个新状态的最佳 `A2K-6817a085561c5e6a` 为 9.527239472384586，没有超过已知最佳。历史总结记录 97 个五轴前沿点（92 个新状态），其中 73 个新状态未被历史库严格支配。', '',
        f"当前保留 **{len(retained)} 个布局**（全部 97 个最终前沿、历史基线/种子、最佳新状态及 16 个历史验证代表），精选数据库 **{db.stat().st_size:,} 字节**。原 204 次试跑数据库改为明确的归档指针；完整 2,000 次日志仍可通过上述旧提交恢复，当前精简库不能按原随机轨迹续跑。", '',
        '归档时重新校验全部保留布局的编码、M/D/V、双空桶、辅键语义及已有八轨评分的 v5.1 汇总算式。原 16 个代表的独立/native 验证和原始 memory audit 按旧提交原字节保留；此次没有重新运行这 16 个代表的评分器。旧历史验证与本次保留集复核分开记录。', '',
        '此次只处理这场 2k 实验；前置 closure 研究缓存、其他 worktree 与 11 月 21 日 U7E/UED 文件不在清理范围。', '']
    (ROOT / (PREFIX + '.md')).write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps({'retained':len(retained), 'databaseBytes':db.stat().st_size,
                      'pilotTrajectoryMatchesCompletedPrefix':True}))


if __name__ == '__main__':
    main()
