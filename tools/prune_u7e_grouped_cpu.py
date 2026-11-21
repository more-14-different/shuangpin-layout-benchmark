"""Prune only the explicitly stopped U7E campaign; preserve useful fronts and resume anchors."""
import argparse
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import zlib
import psutil

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'research/.cache/u7e-grouped-cpu-20261121'
REPORT=ROOT/'research/notes/2026-11-21-u7e-grouped-cpu-compaction.json'


def read(p):
    return json.loads(Path(p).read_text(encoding='utf8'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def dominates(a,b):
    va,vb=tuple(a['scores'])+(a['M'],),tuple(b['scores'])+(b['M'],)
    return all(x<=y for x,y in zip(va,vb)) and any(x<y for x,y in zip(va,vb))


def pareto(rows):
    front=[]
    for row in sorted(rows,key=lambda r:(r['M'],*r['scores'],r['key'])):
        if any(dominates(previous,row) for previous in front):
            continue
        front=[previous for previous in front if not dominates(row,previous)]
        front.append(row)
    return front


def select(rows,state,cfg,reported_ids=(),top_n=100,tier_n=40,preference_n=20):
    by_key={r['key']:r for r in rows}
    reasons={}
    tiers={}

    def protect(key,reason):
        if key in by_key:
            reasons.setdefault(key,set()).add(reason)

    def take(label,eligible,n):
        keys=set()
        for axis in range(4):
            for row in sorted(eligible,key=lambda r:(r['scores'][axis],r['key']))[:n]:
                keys.add(row['key'])
                protect(row['key'],label)
        tiers[label]=len(keys)

    for lane in ['strict','open']:
        eligible=[r for r in rows if not r['broken'] and (lane=='open' or r['emptyBuckets'])]
        take(lane+': top100 per CKT axis',eligible,top_n)
        front=pareto(eligible)
        for row in front:
            protect(row['key'],lane+': all nondominated CKT1/2/3/5 and memory points')
        tiers[lane+': Pareto']=len(front)
        for memory in [40,41]:
            subset=[r for r in eligible if r['M']==memory]
            take(f'{lane}: M{memory} top40 per axis',subset,tier_n)
            low=[r for r in subset if r['rightPinkyMixed']<=cfg['rightPinkyCaps']['mixed']+1e-12
                 and r['rightPinkyPeak8']<=cfg['rightPinkyCaps']['peak8']+1e-12]
            take(f'{lane}: M{memory} low-pinky top40 per axis',low,tier_n)
            for preferred in [False,True]:
                take(f'{lane}: M{memory} ei/er-at-E={preferred} top20 per axis',
                     [r for r in subset if r['eiErAtE']==preferred],preference_n)
    seed=''.join(chr(k+65) for k in cfg['seedFinalKeys'])
    assert seed in by_key,'seed missing before compaction'
    protect(seed,'baseline control')
    wanted=set(reported_ids)
    for row in rows:
        if row['id'] in wanted:
            protect(row['key'],'previously reported frontier')
    for lane,chains in state['chains'].items():
        for chain in chains:
            for field in ['current','best']:
                key=chain[field]['key']
                assert key in by_key,(lane,chain['index'],field)
                protect(key,f'resume {lane} chain{chain["index"]} {field}')
        for item in state['queues'][lane]:
            key=''.join(chr(k+65) for k in item['finals'])
            protect(key,f'pending {lane} migration/probe cached anchor')
    return reasons,tiers


def prune_transaction(db,keep_keys,metadata):
    """Caller holds the campaign lock and an exclusive database transaction."""
    before=db.execute('SELECT COUNT(*) FROM states').fetchone()[0]
    db.execute('CREATE TEMP TABLE retained_keys(k TEXT PRIMARY KEY)')
    db.executemany('INSERT INTO retained_keys VALUES (?)',[(k,) for k in sorted(keep_keys)])
    actual=db.execute('SELECT COUNT(*) FROM states WHERE k IN (SELECT k FROM retained_keys)').fetchone()[0]
    assert actual==len(keep_keys),'retained key missing; abort before deletion'
    db.execute('DELETE FROM states WHERE NOT EXISTS (SELECT 1 FROM retained_keys WHERE retained_keys.k=states.k)')
    after=db.execute('SELECT COUNT(*) FROM states').fetchone()[0]
    assert after==len(keep_keys)
    db.execute('INSERT OR REPLACE INTO meta VALUES (?,?)',('compaction',json.dumps(metadata,separators=(',',':'))))
    assert db.execute('PRAGMA integrity_check').fetchall()==[('ok',)]
    return before-after


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    work=WORK.resolve()
    db_path=(work/'search.sqlite').resolve()
    assert db_path.parent==work and db_path.name=='search.sqlite'
    assert (work/'STOP').exists() and (work/'ai-reviews/STOP').exists()
    status,timer=read(work/'status.json'),read(work/'ai-reviews/timer-status.json')
    assert status['state']=='stopped' and timer['state']=='stopped_by_request'
    for r in [status,timer]:
        for field in ['pid','nativePid']:
            pid=r.get(field)
            if pid and psutil.pid_exists(pid):
                p=psutil.Process(pid)
                assert not any(word in ' '.join(p.cmdline()) for word in
                               ['run_u7e_grouped_cpu.py','schedule_u7e_hourly_review.py','score-untoned-v52-stream']), 'campaign process still active'
    lock=(work/'campaign.lock').open('r+b')
    if os.name=='nt':
        import msvcrt
        lock.seek(0)
        msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
    db=sqlite3.connect(db_path,timeout=10)
    cfg_path=ROOT/'research/config/u7e-grouped-cpu.json'
    final_path=ROOT/'research/notes/2026-11-21-u7e-grouped-cpu-final.json'
    cfg,final=read(cfg_path),read(final_path)
    try:
        previous=db.execute("SELECT v FROM meta WHERE k='compaction'").fetchone()
        if previous:
            meta=json.loads(previous[0])
            assert db.execute('SELECT COUNT(*) FROM states').fetchone()[0]==meta['retainedRows'], 'campaign resumed; archive it before pruning again'
            assert db.execute('PRAGMA integrity_check').fetchall()==[('ok',)]
            print(json.dumps(dict(alreadyCompacted=True,retainedRows=meta['retainedRows'],databaseBytes=db_path.stat().st_size),ensure_ascii=False))
            return
        db.execute('BEGIN EXCLUSIVE')
        original_meta=dict(db.execute('SELECT k,v FROM meta').fetchall())
        state=json.loads(original_meta['state'])
        records=db.execute('SELECT k,data FROM states').fetchall()
        rows=[]
        blob_hashes={}
        for key,blob in records:
            row=json.loads(zlib.decompress(blob))
            assert row['key']==key and len(row['scores'])==4 and all(math.isfinite(v) for v in row['scores'])
            rows.append(row)
            blob_hashes[key]=hashlib.sha256(blob).hexdigest()
        count=len(rows)
        assert count==state['samples']+1==final['runtime']['totalCachedIncludingControl']
        reported=set(final['finalists'])
        for p in sorted((work/'reviews').glob('hour-*.json')):
            for lane in read(p)['lanes'].values():
                reported.update(r['id'] for r in lane['leaders'] if r)
        reasons,tiers=select(rows,state,cfg,reported)
        retained=[r for r in rows if r['key'] in reasons]
        protected_ids={r['id'] for r in retained}
        assert reported<=protected_ids,'reported candidate would be lost'
        metadata=dict(version=1,compactedAt=datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
                      originalRows=count,retainedRows=len(retained),deletedRows=count-len(retained),
                      originalHistoricalEvaluations=state['samples'],historicalCountersUnchanged=True,
                      historicalFinalReport=str(final_path),historicalFinalReportSha256=sha(final_path),
                      note='Retained cache only; absence no longer proves a layout was never evaluated. '
                           'Original exhaustive replay audit remains in the immutable pre-compaction report.')
        bytes_before=db_path.stat().st_size
        if not args.apply:
            db.rollback()
            print(json.dumps(dict(dryRun=True,rowsBefore=count,rowsAfter=len(retained),tiers=tiers),ensure_ascii=False,indent=2))
            return
        removed=prune_transaction(db,set(reasons),metadata)
        for key,blob in db.execute('SELECT k,data FROM states'):
            assert hashlib.sha256(blob).hexdigest()==blob_hashes[key],key
        for key,value in original_meta.items():
            assert db.execute('SELECT v FROM meta WHERE k=?',(key,)).fetchone()[0]==value
        db.commit()
        db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        db.execute('VACUUM')
        db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        assert db.execute('PRAGMA integrity_check').fetchall()==[('ok',)]
        assert db.execute('SELECT COUNT(*) FROM states').fetchone()[0]==len(retained)
        assert db.execute('PRAGMA freelist_count').fetchone()[0]==0
        bytes_after=db_path.stat().st_size
        result=dict(completed=True,**metadata,databasePath=str(db_path),bytesBefore=bytes_before,bytesAfter=bytes_after,
                    bytesSaved=bytes_before-bytes_after,tiers=tiers,
                    checks=dict(allReportedCandidatesRetained=True,allCktMemoryParetoPointsRetained=True,
                                allRetainedBlobsUnchanged=True,originalResumeMetaUnchanged=True,
                                sqliteIntegrity='ok',vacuumCompleted=True,fullDatabaseBackupCreated=False),
                    retained=[dict(id=r['id'],key=r['key'],scores=r['scores'],M=r['M'],emptyBuckets=r['emptyBuckets'],
                                   rightPinkyMixed=r['rightPinkyMixed'],rightPinkyPeak8=r['rightPinkyPeak8'],
                                   reasons=sorted(reasons[r['key']]),blobSha256=blob_hashes[r['key']])
                              for r in sorted(retained,key=lambda r:(r['scores'][0],r['key']))],
                    sourceHashes={str(p):sha(p) for p in [Path(__file__),cfg_path,final_path]})
        REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
        text=['# U7E小时实验数据库精简','',
              f'原 {count:,} 条，保留 {len(retained):,} 条，删除 {removed:,} 条。',
              f'数据库 {bytes_before/2**20:.3f} MiB → {bytes_after/2**20:.3f} MiB，释放 {(bytes_before-bytes_after)/2**20:.3f} MiB。','',
              '保留策略：两线每个CKT倍率前100名；各M40/M41层前40名；低右小指层前40名；ei/er是否在E分层前20名；'
              '完整CKT1/2/3/5＋记忆Pareto前沿；基线；全部已报告候选；各退火链的current/best和待迁移缓存引用。合并后去重。','',
              '数据库仍保留每个入选布局的完整八轨精算数据，记录内容逐字节未变。原meta状态、计数和随机数断点均保留，额外增加compaction元数据。',
              '精简后不再能用缓存缺失判断“从未算过”，也不能重新验证已删除的全量状态；精简前34758条全量审计及最终报告保持不变。'
              '原final-report配方依赖完整历史数据库，精简后应查阅已归档报告和本精简清单。','',
              '事务内检查保留集合和历史引用，提交后VACUUM并通过integrity_check。没有另留完整大型数据库副本。'
              '数据库及WAL/SHM仍不入Git；仅提交本工具、测试和小型保留清单。','']
        REPORT.with_suffix('.md').write_text('\n'.join(text),encoding='utf8',newline='\n')
        print(json.dumps({k:v for k,v in result.items() if k not in ['retained','sourceHashes','tiers']},ensure_ascii=False,indent=2))
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()
        lock.close()


if __name__=='__main__':
    main()
