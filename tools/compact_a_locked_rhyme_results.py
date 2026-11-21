"""Retain final Pareto representatives, then remove the stopped run's bulk journal.

No search is started and Git history is never rewritten. Deletion is limited to
explicit files in this run's cache and its obsolete tracked checkpoint archive.
"""
from __future__ import annotations

import datetime
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT/'research/.cache/a-locked-rhymes-v52-6h-20261121'
PREFIX = ROOT/'research/notes/2026-11-21-a-locked-rhymes-v52-results'


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def sha(p):
    digest = hashlib.sha256()
    with Path(p).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def write(p, obj):
    Path(p).write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')


def checked_deletion_paths():
    work = WORK.resolve()
    notes = (ROOT/'research/notes').resolve()
    files = [WORK/'scores.jsonl', WORK/'checkpoint.json', WORK/'checkpoint-before-hourly-review.json',
             Path(str(PREFIX)+'-checkpoint.json.gz')]
    for file in files:
        actual = file.resolve()
        assert actual.parent == (notes if file.name.endswith('-checkpoint.json.gz') else work), actual
    return files


def main():
    summary_file = Path(str(PREFIX)+'.json')
    summary = read(summary_file)
    config = read(ROOT/'research/config/a-locked-rhymes-v52-finalists.json')
    replay = read(Path(str(PREFIX)+'-replay.json'))
    assert summary['status'] == 'stopped-by-request' and replay['passed']
    assert (WORK/'STOP').exists() and (WORK/'reviews/STOP').exists()
    selected = {e['id']:e for e in config['entries']}
    assert len(selected) == summary['representativeCount'] == 27
    for lane in summary['lanes'].values():
        assert lane['best']['id'] in selected
        assert all(row['id'] in selected for row in lane['pareto'])
        assert all(row['id'] in selected for row in lane['bestByMultiplier'].values())
    archive = Path(str(PREFIX)+'-scores.jsonl.gz')
    if summary.get('retention', {}).get('mode') == 'final-pareto-representatives-only':
        with gzip.open(archive, 'rt', encoding='utf-8') as stream:
            rows = [json.loads(line) for line in stream if line.strip()]
        assert {r['id'] for r in rows} == set(selected)
        for file in checked_deletion_paths():
            if file.exists():
                file.unlink()
        print(json.dumps({'alreadyCompacted':True,'retained':len(rows)}))
        return
    source_record = summary['archives'][archive.relative_to(ROOT).as_posix()]
    assert sha(archive) == source_record['sha256']
    retained = []; count = 0; seen = set()
    with gzip.open(archive, 'rt', encoding='utf-8') as stream:
        for line in stream:
            if not line.strip(): continue
            row = json.loads(line); count += 1
            if row['id'] not in selected: continue
            expected = selected[row['id']]
            assert row['id'] not in seen; seen.add(row['id'])
            assert row['state'] == expected['state'] and row['initials'] == expected['initials']
            assert row['scores'] == expected['scores']
            assert row['id'] in replay['schemes']
            retained.append(row)
    assert count == summary['exactEvaluations'] == 43088 and seen == set(selected)
    retained.sort(key=lambda r:r['scores']['1'])
    payload = ''.join(json.dumps(r, ensure_ascii=False, separators=(',', ':'))+'\n' for r in retained).encode('utf-8')
    before = dict(source_record)
    removed_files = []
    for file in checked_deletion_paths():
        if file.exists(): removed_files.append({'path':file.relative_to(ROOT).as_posix(),'bytes':file.stat().st_size,'sha256':sha(file)})
    temp = archive.with_name(archive.name+'.compact.tmp')
    with temp.open('wb') as stream:
        with gzip.GzipFile(filename='',fileobj=stream,mode='wb',compresslevel=9,mtime=0) as zipped:
            zipped.write(payload)
    with gzip.open(temp,'rb') as stream: assert stream.read() == payload
    temp.replace(archive)
    summary['archives'][archive.relative_to(ROOT).as_posix()] = {
        'sha256':sha(archive),'bytes':archive.stat().st_size,
        'uncompressedSha256':hashlib.sha256(payload).hexdigest(),'records':len(retained),'scope':'retained representatives only'}
    summary['archives'].pop(Path(str(PREFIX)+'-checkpoint.json.gz').relative_to(ROOT).as_posix(),None)
    summary['retention'] = {
        'mode':'final-pareto-representatives-only','retainedRecords':len(retained),'historicalExactEvaluations':count,
        'discardedRecords':count-len(retained),'resumeOriginalTrajectoryAvailable':False,
        'compactedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'selection':'Union of per-lane nondominated 1x/2x/3x/5x representatives and per-multiplier bests; all 27 independently replayed.',
        'previousFullScoreArchive':before,'removedFiles':removed_files,'gitHistoryRewritten':False,
        'historicalAllRowAuditPreserved':True}
    write(summary_file,summary)
    write(WORK/'retention.json',summary['retention'])
    write(WORK/'final-state.json',{
        'status':'stopped-and-compacted','exactEvaluations':count,'retainedRecords':len(retained),
        'resumeOriginalTrajectoryAvailable':False,'manifest':summary['searchManifest'],
        'lanes':summary['lanes'],'retention':summary['retention']})
    live = read(WORK/'live-report.json'); live['retention']=summary['retention'];write(WORK/'live-report.json',live)
    report_file = Path(str(PREFIX)+'.md');text=report_file.read_text(encoding='utf-8')
    text=text.replace('43,088 条记录均重新检查硬约束及', '精简前，43,088 条记录均重新检查硬约束及')
    text=text.replace('- 完整精算归档：`2026-11-21-a-locked-rhymes-v52-results-scores.jsonl.gz`。',
        '- 精选精算归档：`2026-11-21-a-locked-rhymes-v52-results-scores.jsonl.gz`，仅保留 27 个已复核代表。')
    text=text.replace('- 可恢复检查点：`2026-11-21-a-locked-rhymes-v52-results-checkpoint.json.gz`；恢复前须重新授权，并调整已过期截止时间。',
        '- 完整逐次日志及恢复检查点已按用户要求移除；保留汇总、冻结输入和候选，可复算候选，但不能按原随机轨迹续跑。')
    marker='## 数据精简\n\n'
    if marker not in text:
        header,body=text.split('\n\n',1)
        text=header+'\n\n'+marker+(
            '按用户要求，仅保留 **27 个较好代表**（各路线四倍率非支配集合及各倍率最佳的并集）。'
            '累计精算量仍为 **43,088 次**，不等于当前保留记录数。已移除其余 43,061 条逐次记录和完整恢复检查点；'
            '保留全部最佳值、布局、逐轨评分、独立回放验证和每小时审阅。旧 Git 提交未改写。\n\n')+body
    report_file.write_text(text,encoding='utf-8',newline='\n')
    for file in checked_deletion_paths():
        if file.exists(): file.unlink()
    print(json.dumps({'retained':len(retained),'discarded':count-len(retained),'scoreArchiveBeforeBytes':before['bytes'],
        'scoreArchiveAfterBytes':archive.stat().st_size,'deletedWorkingFilesBytes':sum(r['bytes'] for r in removed_files)},ensure_ascii=False))


if __name__=='__main__':main()
