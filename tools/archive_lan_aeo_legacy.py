"""Archive the duplicate LAN/AEO snapshot and compact its bulky replay outputs."""
from __future__ import annotations

import gzip
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

from legacy_research_archive import ROOT, base_manifest, digest, git, provenance, read, remove_checked, write

PREFIX = 'research/notes/2026-11-21-legacy-lan-aeo'
CACHE = ROOT / 'research/.cache/lan-aeo-all-20261118'
OLD = 'research/notes/2026-11-18-lan-aeo-all.json'
TONED = 'research/notes/2026-11-18-lan-aeo-toned.json'
UNTONED = 'research/notes/2026-11-18-lan-aeo-untoned.json'
COMPARISON = 'research/notes/2026-11-18-lan-aeo-comparison.json'


def variants(blob):
    yield 'bytes', blob
    yield 'LF', blob.replace(b'\r\n', b'\n')
    yield 'CRLF', blob.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')


def source_proof(path, expected):
    file = (ROOT / path).resolve()
    item = {'source':path, 'recordedSha256':expected}
    if file.exists():
        data = file.read_bytes()
        item['currentSha256'] = digest(data)
        for form, blob in variants(data):
            if digest(blob) == expected:
                return item | {'status':'current-source', 'byteForm':form}
    result = subprocess.run(['git', '-C', str(file.parent), 'rev-parse', '--show-toplevel'], capture_output=True)
    if result.returncode == 0:
        repo = Path(result.stdout.decode().strip())
        relative = file.relative_to(repo).as_posix()
        commits = subprocess.check_output(['git', '-C', str(repo), 'log', '--all', '--format=%H', '--', relative]).decode().splitlines()
        for commit in commits:
            result = subprocess.run(['git', '-C', str(repo), 'show', commit + ':' + relative], capture_output=True)
            if result.returncode:
                continue
            for form, blob in variants(result.stdout):
                if digest(blob) == expected:
                    date = subprocess.check_output(['git', '-C', str(repo), 'show', '-s', '--format=%aI%n%cI%n%s', commit]).decode('utf-8').strip().split('\n')
                    return item | {'status':'historical-git-source', 'repository':str(repo), 'path':relative,
                                   'commit':commit, 'authorTime':date[0], 'committerTime':date[1],
                                   'subject':date[2], 'byteForm':form}
    return item | {'status':'historical-source-unavailable',
                   'limitation':'Recorded raw input hash cannot be reproduced from the current file or available Git history. Fixed effective policies and output tracks remain in the canonical report; this is not a fresh full source replay.'}


def main():
    assert not (ROOT / (PREFIX + '-manifest.json')).exists(), 'Already archived.'
    manifest = base_manifest('LAN-AEO-finite-carrier-enumeration-v5.1', ['3022345', 'a2a9e2f'])
    before = read(OLD)
    toned, untoned, comparison = read(TONED), read(UNTONED), read(COMPARISON)
    assert before['families'] == toned['families']
    ignored = ['completed','htmlUnchanged','sourceHashes']
    assert {k:v for k,v in toned.items() if k not in ignored} == {k:v for k,v in before.items() if k not in ignored}
    assert toned['completed'] and untoned['completed']
    domains = {'original', *comparison['soundKeys']}
    for f in comparison['families']:
        assert len(f['rows']) == 22 and {r['target'] for r in f['rows']} == domains
    manifest['duplicateSnapshot'] = provenance(OLD)
    manifest['duplicateSnapshot'].update({'canonicalFile':TONED, 'familiesExactlyEqual':True,
        'objectEqualExceptCompletionAndSourceHashes':True,
        'missingCanonicalFields':['completed','htmlUnchanged'],
        'originalSourceHashes':before['sourceHashes'],
        'sourceHashDifferences':[{'path':p,'intermediate':before['sourceHashes'].get(p),'completed':toned['sourceHashes'].get(p)}
            for p in sorted(set(before['sourceHashes'])|set(toned['sourceHashes']))
            if before['sourceHashes'].get(p)!=toned['sourceHashes'].get(p)]})
    canonical = [TONED, UNTONED, COMPARISON,
        'research/notes/2026-11-18-lan-aeo-comparison.csv',
        'research/notes/2026-11-18-lan-aeo-toned-columns.json',
        'research/notes/2026-11-18-lan-aeo-untoned-columns.json',
        'research/notes/2026-11-18-cr-lan-zero-carriers.json']
    manifest['canonicalFiles'] = [provenance(p, ['a2a9e2f']) for p in canonical]
    assert all(r.get('matchingCommit') for r in manifest['canonicalFiles'])
    # Preserve effective source contracts; mark drift instead of overwriting old hashes.
    proofs = {}
    for name, data in [(TONED,toned),(UNTONED,untoned),(COMPARISON,comparison)]:
        for path, expected in data['sourceHashes'].items():
            pair = (path,expected)
            if pair not in proofs:
                proofs[pair] = source_proof(path, expected) | {'reportedIn':[]}
            proofs[pair]['reportedIn'].append(name)
    manifest['sourceHashProofs'] = list(proofs.values())
    manifest['unavailableHistoricalSources'] = [r for r in proofs.values() if r['status']=='historical-source-unavailable']
    # Keep the entire small finite enumeration (44 rows), plus compact selected native outputs.
    selected_native = []
    removed = [manifest['duplicateSnapshot']]
    for file in sorted(CACHE.rglob('*.native.json')):
        assert file.resolve().is_relative_to(CACHE.resolve())
        original = read(file)
        compact = {k:v for k,v in original.items() if k != 'filterRows'}
        target = next(v for v in comparison['tonedSelectedColumns']['variants'] if v['id']==original['id'])
        for field in ['contract','memory','inventory','ckt','ergonomics']:
            assert compact[field] == target['benchmark'][field], field
        selected_native.append({'sourcePath':file.relative_to(ROOT).as_posix(),
            'sourceSha256':digest(file.read_bytes()), 'removedField':'filterRows',
            'removedRowCount':len(original['filterRows']), 'benchmark':compact})
        removed.append({'path':file.relative_to(ROOT).as_posix(),'bytes':file.stat().st_size,'sha256':digest(file.read_bytes())})
    assert len(selected_native)==3
    native_file = PREFIX + '-selected-native.json.gz'
    write(native_file, {'version':1, 'scope':'All original native fields except the bulky per-candidate filterRows table.', 'rows':selected_native})
    # Compress the frozen old payload, retaining its full bytes for future replay.
    payload = CACHE / 'toned-full/payload-input.json'
    frozen = payload.with_suffix('.json.gz')
    with payload.open('rb') as source, frozen.open('wb') as target:
        with gzip.GzipFile(fileobj=target, mode='wb', filename='', mtime=0, compresslevel=6) as packed:
            shutil.copyfileobj(source,packed,1024*1024)
    import hashlib
    def file_digest(file, zipped=False):
        h=hashlib.sha256()
        with (gzip.open(file,'rb') if zipped else file.open('rb')) as stream:
            for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
        return h.hexdigest()
    assert file_digest(payload) == file_digest(frozen,True)
    manifest['frozenPayload'] = {'path':frozen.relative_to(ROOT).as_posix(),
        'bytes':frozen.stat().st_size,'sha256':file_digest(frozen),
        'uncompressedSha256':file_digest(payload),'uncompressedBytes':payload.stat().st_size,
        'tracked':False,'purpose':'Full old payload input retained compressed in this run cache, not reconstructed from current HTML.'}
    removed.append({'path':payload.relative_to(ROOT).as_posix(),'bytes':payload.stat().st_size,'sha256':file_digest(payload)})
    # Duplicated binary inputs are removed only after exact equality to the tracked ZIP.
    zip_path = ROOT / 'research/config/cr-anneal-inputs.zip'
    with zipfile.ZipFile(zip_path) as bundle:
        for dirname in ['toned-inputs', 'toned-full/inputs']:
            for file in sorted((CACHE / dirname).iterdir()):
                if file.is_file() and file.name in bundle.namelist() and file.read_bytes() == bundle.read(file.name):
                    removed.append({'path':file.relative_to(ROOT).as_posix(),'bytes':file.stat().st_size,
                        'sha256':digest(file.read_bytes()),'recovery':f'research/config/cr-anneal-inputs.zip::{file.name}'})
    manifest.update({'retainedEnumerationRows':44, 'retainedSelectedNativeOutputs':3,
        'selectedNativeFile':native_file,'selectedNativeSha256':digest((ROOT/native_file).read_bytes()),
        'selectedNativeBytes':(ROOT/native_file).stat().st_size,'removedFiles':removed,
        'cacheBytesFreed':sum(r['bytes'] for r in removed)-frozen.stat().st_size,
        'selection':'Keep all 21 carrier endpoints plus original for both families; selected full-column audits and compact native outputs. A finite complete enumeration is more useful than discarding losing endpoints.',
        'runTimes':'No started/updated fields in canonical enumeration. Artifact date is 2026-11-18; related commit author/committer times are recorded independently.',
        'resumeOriginalTrajectoryAvailable':False,
        'testAdaptation':'Historical source hash assertions accept verified Git originals and explicitly record unavailable raw input; original hashes are not changed. Output/cohort/winner/selected-column assertions remain.'})
    write(PREFIX + '-manifest.json',manifest)
    subprocess.run(['python','-m','unittest','discover','-s','tests','-p','test_lan_aeo_comparison.py'],cwd=ROOT,check=True)
    manifest['validationResults'] = {'pythonTestsPassed':3,'pythonTestsFailed':0,
        'enumerationRows':44,'canonicalDuplicateEquality':True,'selectedNativeContractsEqual':True,
        'frozenPayloadLosslessCompressionVerified':True,'unavailableHistoricalSourceCount':len(manifest['unavailableHistoricalSources'])}
    write(PREFIX + '-manifest.json',manifest)
    lines = ['# LAN/AEO 有调与无调载体枚举归档', '',
        f"归档记录时间：{manifest['archivedAt']}。新增归档提交，不改写历史；父提交 `{manifest['archiveParentCommit']}`。本报告首次新增的 Git 提交即归档提交。", '',
        '未跟踪的 `2026-11-18-lan-aeo-all.json` 是同场实验的中间副本：families 与已提交的 toned 完成版逐项相等。它缺少 completed/htmlUnchanged，来源脚本哈希也有差异（枚举脚本版本、production search 与 scheme fixture 的来源清单变动）；原清单及差异逐项保存在 manifest。因此只移除重复候选数据，保留来源差异及原有规范结果。', '',
        '| 关联旧提交 | 提交时间 | 工作 |', '|---|---|---|']
    for c in manifest['relatedCommits']:
        lines.append(f"| `{c['commit']}` | {c['committerTime']} | {c['subject']} |")
    lines += ['', '上述提交已经包含在本次归档父提交中。实验文件日期为 2026-11-18；原文件没有运行开始/结束时间字段，不能把 Git 时间或文件 mtime 当成运行起止时间。', '',
        '保留有调/无调各 21 个统一 A/E/O 载体端点和 original 基线，共 **44 行**，以及原 CSV、选定端点的完整列指标与验证输出。两类所有搬迁端点的 CKT v5.1 都高于其 original 基线；有调搬迁端点中 C 最低，无调中 R 最低。枚举结果依然完整，没有将不满足门槛的端点冒充有效候选。', '',
        f"额外保留 **3 个精选 native 输出**（{manifest['selectedNativeBytes']:,} 字节 gzip），只删除庞大的 filterRows 逐候选表，其余字段完整保留。旧 payload 输入无损压缩为缓存中的 `{frozen.relative_to(ROOT).as_posix()}`（{frozen.stat().st_size:,} 字节）；逐字节校验解压后 SHA-256 一致。重复 binary 输入与已跟踪 `cr-anneal-inputs.zip` 原字节核对后清理。净释放约 **{manifest['cacheBytesFreed']/1024**2:.2f} MiB**。", '',
        '源文件审计区分：当前原件、仅换行转换、其他历史提交原件，以及确实找不到的历史输入。外部 Rime 仓库仅作只读核验，没有修改或提交。固定辅序与实际生效 policy 保留在原结果中；辅键语义按原 contract 的 toneKeysByTone / shapeKeysByMeaning 读取，不重新优化。', '',
        f"**复现范围限制：{len(manifest['unavailableHistoricalSources'])} 个历史原始输入未能从当前文件或现有 Git 历史取回。** 见下表；旧 SHA-256 保留，不改成当前值。本次验证输出数据、同等语料覆盖、完整枚举、精选重放列与冻结输入压缩，不宣称用当前源配置完整重跑了旧实验。", '',
        '| 未能取回的历史输入 | 当时 SHA-256 |', '|---|---|']
    for r in manifest['unavailableHistoricalSources']:
        lines.append(f"| `{r['source']}` | `{r['recordedSha256']}` |")
    lines += ['', '3 项 Python 验证通过。所有旧提交、逐文件 SHA-256、删除清单、输入来源核验及源仓库提交时间见同前缀 manifest；规范枚举与原报告保持原内容。', '']
    (ROOT/(PREFIX+'.md')).write_text('\n'.join(lines),encoding='utf-8')
    remove_checked(removed)
    write(CACHE/'retention.json',{'manifest':PREFIX+'-manifest.json','searchStopped':True,
        'canonicalComparison':COMPARISON,'selectedNativeFile':native_file,'frozenPayload':manifest['frozenPayload']})
    print(json.dumps({'retainedRows':44,'nativeOutputs':3,'freedBytes':manifest['cacheBytesFreed'],
                      'unavailableHistoricalSourceCount':len(manifest['unavailableHistoricalSources'])}))


if __name__=='__main__':
    main()
