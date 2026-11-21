"""Provenance and bounded cleanup helpers for the November legacy archives.

These commands archive existing evidence; they never start a search or rewrite Git.
"""
from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ZONE = dt.timezone(dt.timedelta(hours=8))


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def now():
    return dt.datetime.now(ZONE).isoformat()


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def read(path):
    path = ROOT / path
    if path.suffix == '.gz':
        with gzip.open(path, 'rt', encoding='utf-8-sig') as stream:
            return json.load(stream)
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, obj):
    path = ROOT / path
    payload = (json.dumps(obj, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if path.suffix == '.gz':
        payload = gzip.compress(payload, compresslevel=9, mtime=0)
    path.write_bytes(payload)


def commit_info(ref):
    fields = git('show', '-s', '--format=%H%n%aI%n%cI%n%s', ref).decode('utf-8').strip().split('\n')
    return dict(zip(['commit', 'authorTime', 'committerTime', 'subject'], fields)) | {
        'ancestorOfArchiveParent': subprocess.run(
            ['git', 'merge-base', '--is-ancestor', ref, 'HEAD'], cwd=ROOT,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0}


def provenance(path, preferred=()):
    """Compare actual Git blobs, allowing only CRLF/LF normalization for text."""
    path = Path(path).as_posix()
    file = ROOT / path
    payload = file.read_bytes()
    item = {'path': path, 'bytes': len(payload), 'sha256': digest(payload),
            'fileMtime': dt.datetime.fromtimestamp(file.stat().st_mtime, ZONE).isoformat(),
            'fileMtimeIsExperimentTime': False}
    commits = list(preferred) + git('log', '--all', '--format=%H', '--', path).decode().splitlines()
    for ref in dict.fromkeys(commits):
        result = subprocess.run(['git', 'show', f'{ref}:{path}'], cwd=ROOT, capture_output=True)
        if result.returncode:
            continue
        blob = result.stdout
        exact = blob == payload
        normalized = not path.endswith('.gz') and blob.replace(b'\r\n', b'\n') == payload.replace(b'\r\n', b'\n')
        if exact or normalized:
            item.update({'matchingCommit': commit_info(ref), 'gitBlobSha256': digest(blob),
                         'match': 'bytes' if exact else 'CRLF/LF-only'})
            return item
    item['match'] = 'no-matching-historical-blob'
    return item


def inventory_cache(directories):
    """Only bulk journals/checkpoints/manifests inside explicitly named cache dirs."""
    result = []
    cache = (ROOT / 'research/.cache').resolve()
    for name in directories:
        base = (cache / name).resolve()
        assert base.parent == cache and base.is_dir(), base
        for file in sorted(base.rglob('*')):
            if not file.is_file():
                continue
            n = file.name.lower()
            bulk = ('checkpoint' in n or 'manifest' in n or 'scores' in n or
                    n in {'refined.json', 'refined-before-cache-bridge-fix.json', 'progress.json'})
            if bulk:
                assert file.resolve().is_relative_to(base), file
                payload = file.read_bytes()
                result.append({'path': file.relative_to(ROOT).as_posix(), 'bytes': len(payload),
                               'sha256': digest(payload)})
    return result


def remove_checked(items):
    for item in items:
        file = (ROOT / item['path']).resolve()
        assert file.is_relative_to(ROOT.resolve()) and file.is_file(), file
        assert digest(file.read_bytes()) == item['sha256'], file
        file.unlink()


def base_manifest(route, refs):
    return {'version': 1, 'route': route, 'archivedAt': now(),
            'archiveParentCommit': git('rev-parse', 'HEAD').decode().strip(),
            'archiveCommitResolution': 'git log --diff-filter=A --format=%H -- <this manifest path>',
            'gitHistoryRewritten': False, 'searchRestarted': False,
            'relatedCommits': [commit_info(ref) for ref in refs],
            'timeConvention': 'ISO 8601; run times retain UTC Z; author/committer and archive times include offset. File mtime is not a run timestamp.'}
