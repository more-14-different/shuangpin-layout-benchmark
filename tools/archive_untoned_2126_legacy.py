"""Keep legacy 21x26 Pareto results and verification, compact duplicate databases."""
from __future__ import annotations

import base64
import gzip
import heapq
import json
from pathlib import Path

from legacy_research_archive import ROOT, base_manifest, digest, git, inventory_cache, provenance, read, remove_checked, write

PREFIX = 'research/notes/2026-11-21-legacy-untoned-2126'
REFS = ['494df3c', 'a61e2fe', 'c723e53', 'a4223f0', '2f19302', '2b1aaf1', '9599619', 'b031079']
HEADS = 'b p m f d t n l g k h j q x zh ch sh r z c s A E O W Y YU'.split()
FINALS = 'a ai an ang ao e ei en eng er i ia ian iang iao ie in ing iong iu o ong ou u ua uai uan uang ui un uo v van ve vn'.split()
NOTES = ROOT / 'research/notes'


def key(row):
    if row.get('key'):
        return row['key']
    return base64.b64encode(bytes(ord(row[field][name]) - 65 for field, names in
                                 [('initialMap', HEADS), ('finalMap', FINALS)] for name in names)).decode()


def rows(path):
    with gzip.open(path, 'rt', encoding='utf-8') as stream:
        for line in stream:
            if line.strip():
                yield json.loads(line)


def main():
    assert not (ROOT / (PREFIX + '-manifest.json')).exists(), 'Already archived; use the verifier.'
    manifest = base_manifest('untoned-21x26-v5.1-continuous-descent', REFS)
    original = [Path(p) for p in git('ls-files', '--others', '--exclude-standard').decode().splitlines()
                if ('2126' in p and '2121' not in p and not p.startswith('tools/archive_')) or any(s in p for s in
                ['untoned-v51-stream', 'untoned_v51_stream', 'untoned-production-v51',
                 'untoned_production_v51', 'export_untoned_v51_templates', 'untoned-double-empty-closure'])]
    manifest['originalFiles'] = [provenance(p) for p in original]
    selected = {}
    fields = ['id', 'score', 'modes', 'audit', 'erg', 'characterMotor', 'independent', 'independentPass',
              'initialMap', 'finalMap', 'capacity', 'tone', 'toneKeysByTone', 'shapeKeysByMeaning']

    def take(row, source, reason):
        if not isinstance(row, dict) or 'score' not in row:
            return
        k = key(row)
        target = selected.setdefault(k, {'key': k, 'sources': [], 'selectionReasons': []})
        for field in fields:
            if row.get(field) is not None:
                if field == 'score' and field in target:
                    assert abs(row[field] - target[field]) < 1e-9
                target[field] = row[field]
        if source not in target['sources']:
            target['sources'].append(source)
        if reason not in target['selectionReasons']:
            target['selectionReasons'].append(reason)

    small_databases = []
    stages = []
    for basename in ['2026-11-14-untoned-2126-double-empty-closure.json',
                     '2026-11-14-untoned-2126-coupled-basin.json']:
        path = NOTES / basename
        data = read(path)
        records = list(data['records'].values())
        for r in sorted(records, key=lambda r: r['score'])[:20]:
            take(r, basename, 'stage top 20 CKT')
        for r in records:
            if r.get('independent'):
                take(r, basename, 'independently audited representative')
        for axis in ['mx', 'homeS2', 'homeFloor', 'rpMax', 'wMax', 'yMax']:
            eligible = [r for r in records if axis in r.get('erg', {})]
            if eligible:
                take(min(eligible, key=lambda r:r['erg'][axis]), basename, f'{axis} minimum')
                take(max(eligible, key=lambda r:r['erg'][axis]), basename, f'{axis} maximum')
        take(data['seed'], basename, 'stage seed')
        small_databases.append((path, data))
        stages.append({k:data[k] for k in ['started', 'updated', 'bestId', 'bestScore', 'completed', 'scope'] if k in data}
                      | {'file':basename, 'historicalRecords':len(records)})
    for basename in ['2026-11-14-untoned-2126-twohop-summary.json',
                     '2026-11-15-untoned-2126-recenter-summary.json',
                     '2026-11-15-untoned-2126-threehop-summary.json',
                     '2026-11-15-untoned-2126-anneal-100k-summary.json']:
        data = read(NOTES / basename)
        stages.append({k:data[k] for k in ['started', 'updated', 'bestId', 'bestScore', 'completed', 'scope', 'scoresVerified', 'newScores', 'totalNew'] if k in data}
                      | {'file':basename})
        for r in data.get('headSevenMetricFrontier', []):
            take(r, basename, 'saved head-layout Pareto frontier')
    frontier_file = NOTES / '2026-11-15-untoned-2126-anneal-100k-frontier.json.gz'
    frontier = read(frontier_file)
    for r in frontier['rows']:
        take(r, frontier_file.name, 'final eight-axis Pareto frontier')
    verification_file = NOTES / '2026-11-15-untoned-2126-anneal-100k-verification.json'
    verification = read(verification_file)
    assert verification['passed'] and verification['newUniqueFullScores'] == 100000
    for r in verification['results']:
        take({'key':r['key'], 'id':r['id'], **r['native']}, verification_file.name, 'historical fresh native replay')
    score_files = sorted(NOTES.glob('*untoned-2126-*-scores*.jsonl.gz'))
    counts = {}
    for path in score_files:
        # Bounded top-N extraction; no full 100k journal is loaded in memory.
        top = heapq.nsmallest(20, rows(path), key=lambda r:r['score'])
        for r in top:
            take(r, path.name, 'archive top 20 CKT')
        counts[path.name] = 0
        for r in rows(path):
            counts[path.name] += 1
            if r['key'] in selected:
                take(r, path.name, 'full eight-track score for retained layout')
    # Earlier rows can become selected by a later archive. Fill their tracks in a second pass.
    for path in score_files:
        for r in rows(path):
            if r['key'] in selected and 'modes' not in selected[r['key']]:
                take(r, path.name, 'full eight-track score for retained layout')
    for r in selected.values():
        state = base64.b64decode(r['key'])
        assert len(state) == 62 and max(state) < 26
        r['initialMap'] = dict(zip(HEADS, (chr(v+65) for v in state[:27])))
        r['finalMap'] = dict(zip(FINALS, (chr(v+65) for v in state[27:])))
        r['capacity'] = [21, 26]
        r['toneKeysByTone'] = 'IEUAO'
        r['shapeKeysByMeaning'] = 'AEUIO'
        r.pop('tone', None)
    retained = sorted(selected.values(), key=lambda r:r['score'])
    # Discard only duplicates/bulk sources that have a byte-verified historical recovery blob.
    obsolete = [i for i in manifest['originalFiles'] if i['path'].endswith('.gz') and
                ('-scores' in i['path'] or '-manifest' in i['path'] or '-frontier' in i['path'])]
    assert all(i.get('matchingCommit') for i in obsolete), 'A bulk source lacks a historical recovery copy'
    cache_dirs = ['untoned-2126-anneal-100k-20261115', 'untoned-2126-coupled-basin',
                  'untoned-2126-double-empty-closure', 'untoned-2126-double-empty-closure-incomplete-v1',
                  'untoned-2126-recenter-20261115', 'untoned-2126-threehop-20261115',
                  'untoned-2126-twohop-exhaustive']
    cache_files = inventory_cache(cache_dirs)
    manifest.update({'stages':stages, 'historicalScoreArchiveRows':counts,
        'retainedRecords':len(retained), 'retainedFinalParetoRecords':len(frontier['rows']),
        'selection':'All saved final eight-axis Pareto rows; head-layout Pareto rows; top 20 per stage/archive; ergonomic extrema; independent-audit and fresh-replay representatives; stage seeds.',
        'scoreVersion':'v5.1, not v5.2', 'historicalVerification':str(verification_file.relative_to(ROOT).as_posix()),
        'removedBulkSources':obsolete, 'removedCacheFiles':cache_files,
        'resumeOriginalTrajectoryAvailable':False,
        'sourceRecovery':'git show <originalFiles.matchingCommit.commit>:<path>; text may differ only in CRLF/LF when marked.',
        'database':'selected-results.json.gz contains only selected results, not all historical evaluations.',
        'validation':'Run node tools/verify_legacy_untoned_archive.js <manifest>; old all-row verification is preserved separately and is not claimed as a new full replay.'})
    manifest['database'] = PREFIX + '-selected-results.json.gz'
    write(manifest['database'], {'version':1, 'scoreVersion':'v5.1', 'rows':retained})
    manifest['databaseSha256'] = digest((ROOT / manifest['database']).read_bytes())
    manifest['databaseBytes'] = (ROOT / manifest['database']).stat().st_size
    write(PREFIX + '-manifest.json', manifest)
    # Validate all selected layouts and score arithmetic before deleting any sources.
    import subprocess
    subprocess.run(['node', 'tools/verify_legacy_untoned_archive.js', PREFIX + '-manifest.json'], cwd=ROOT, check=True)
    for path, data in small_databases:
        before_count = len(data['records'])
        data['records'] = {k:r for k,r in data['records'].items() if key(r) in selected}
        data['retention'] = {'scope':'selected results only', 'historicalRecords':before_count,
                             'retainedRecords':len(data['records']), 'manifest':PREFIX + '-manifest.json',
                             'resumeOriginalTrajectoryAvailable':False}
        write(path, data)
    for path in NOTES.glob('*untoned-2126-*-summary.json'):
        data = read(path)
        data['retention'] = {'manifest':PREFIX + '-manifest.json',
                             'legacyExports':'Historical hashes/counts; bulk exports are now recoverable from the original Git commits, not these paths.',
                             'database':manifest['database'], 'resumeOriginalTrajectoryAvailable':False}
        write(path, data)
    old_report = NOTES / '2026-11-15-untoned-2126-anneal-100k.md'
    old_report.write_text('> 2026-11-21 归档说明：下文为历史报告；完整日志与恢复检查点已精简。当前保留集及来源提交见 [归档报告](2026-11-21-legacy-untoned-2126.md)。\n\n' + old_report.read_text(encoding='utf-8'), encoding='utf-8')
    lines = ['# 21×26 无调 v5.1 连续研究归档', '',
        f"归档记录时间：{manifest['archivedAt']}。本次新增归档提交，不改写历史。父提交 `{manifest['archiveParentCommit']}`；本报告首次新增的 Git 提交即归档提交。", '',
        '这是 11 月 14—15 日同一条连续研究线，不是 11 月 21 日 U7E/UED 或 A 锁韵 v5.2 搜索。旧提交中的原始大日志仍可用 Git 取回；当前仅保留较好结果和验证证据。', '',
        '最终可晋级最佳为 `RC26-885412fb398bd67f`，CKT **v5.1 = 9.078652093288046**；10 万次退火没有超过此前 recenter 最佳。硬合法裸最低 9.073717281392 未通过舒适性门槛，不能当作最终最佳。', '',
        '约束口径：21×26；M≤40、D≤3、V≤1；Common399 唯一码、无分支、QZ/ZQ 双空桶。还需原舒适性与独立模型门槛；前沿点或裸最低不自动等于可晋级候选。toneKeysByTone=IEUAO，shapeKeysByMeaning=AEUIO；辅序未重新优化。', '',
        '| 关联旧提交 | 提交时间（含时区） | 工作 |', '|---|---|---|']
    for c in manifest['relatedCommits']:
        lines.append(f"| `{c['commit']}` | {c['committerTime']} | {c['subject']} |")
    lines += ['', '以上提交在其他历史分支，归档父提交未包含它们。逐文件 SHA-256、Git 原件匹配及原件可恢复位置见 manifest；不能将“本分支未跟踪”解释为“从未提交”。', '',
              '| 阶段 | 实验开始 UTC | 实验结束 UTC | 最佳 CKT v5.1 |', '|---|---|---|---|']
    for s in stages:
        lines.append(f"| {s['file']} | {s.get('started','原记录未提供')} | {s.get('updated','原记录未提供')} | {s.get('bestScore','')} |")
    lines += ['', 'UTC 加 8 小时即北京时间；文件名日期、文件 mtime、Git 提交时间分别记录，不能互当运行时间。', '',
        f"保留 **{len(retained)} 个不同布局**，其中包括全部 **{len(frontier['rows'])} 个最终八轴前沿点**，以及阶段前列、声母前沿、人体工学极值与已验证代表。所存八轨评分重新校验汇总算式，所有保留布局重算 Common399 与 M/D/V；少量代表重放 native 评分的结果另存 verification。历史的全量验证保留原报告，未宣称此次重放了全部历史状态。", '',
        f"精选数据库：`{Path(manifest['database']).name}`（{manifest['databaseBytes']:,} 字节）。完整逐次日志、过渡路径和恢复检查点不再保留于当前数据库，无法按原随机轨迹续跑。精简 {len(obsolete)} 个发布副本、{len(cache_files)} 个本目录缓存文件，共 {(sum(r['bytes'] for r in obsolete+cache_files))/1024**2:.2f} MiB；未动其他 worktree。", '',
        '相关文件：本报告同名前缀的 manifest、selected-results 和 verification；历史各阶段 summary/verification 及 finalist 配置、研究代码和测试。', '']
    (ROOT / (PREFIX + '.md')).write_text('\n'.join(lines), encoding='utf-8')
    remove_checked(obsolete + cache_files)
    for name in cache_dirs:
        write('research/.cache/' + name + '/retention.json', {'manifest':PREFIX + '-manifest.json', 'searchStopped':True, 'resumeOriginalTrajectoryAvailable':False})
    print(json.dumps({'retained':len(retained), 'databaseBytes':manifest['databaseBytes'],
                      'removedBytes':sum(r['bytes'] for r in obsolete+cache_files)}))


if __name__ == '__main__':
    main()
