"""Freeze the production 5500-Han corpus and pinned per-interval timing tables.

Reads the production repository; never writes to it. Replay word boundaries are
annotations only. All schemes share one frozen pronunciation and segmentation.
"""
import argparse
import base64
import collections
import gzip
import hashlib
import json
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'research/config'
LABEL = '冰雪健道（QZ-e8f37a 21×21）'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value, compressed=False):
    raw = (json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n').encode('utf-8')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(raw, mtime=0) if compressed else raw)


def han(char):
    return '\u4e00' <= char <= '\u9fff'


def aligned_line(original, replay):
    # The renderer measures Han/punctuation as two display columns, Latin as one.
    positions, chars, column = {}, [], 0
    for char in original:
        if not char.isspace():
            positions[column] = len(chars)
            chars.append(char)
        column += 2 if han(char) or char in '，。；：！？、“”‘’（）《》【】' else 1
    starts = []
    for match in re.finditer(r'\S+', replay):
        if match.start() not in positions:
            raise ValueError('replay code does not align to a source character')
        starts.append(positions[match.start()])
    starts.append(len(chars))
    words = [''.join(chars[a:b]) for a, b in zip(starts, starts[1:])]
    if ''.join(words) != ''.join(chars):
        raise ValueError('incomplete replay segmentation')
    return words


def prepare_corpus(snow, source, inputs):
    data, fixture, seeds = read(source), read(inputs/'fixture.json'), read(inputs/'seeds.json')
    readings = {}
    for char, py, tone, weight, _ in sorted(data['characters'], key=lambda x: -x[3]):
        readings.setdefault(char, (data['pinyin'][py], tone))
    pinyin_atoms = {fixture['pinyin'][p]: i for i, a in enumerate(fixture['atoms']) for p in a['pinyin']}
    pinyin_finals = {fixture['pinyin'][p]: i for i, a in enumerate(fixture['rhymeAtoms']) for p in a['pinyin']}
    report_path = snow/'reports/5000字_十四方案最优切分实测结果.json'
    report = read(report_path)['schemes']['qz-shape']
    scenes, hashes = [], {str(source): sha(source), str(report_path): sha(report_path)}
    directory = snow/'reports/十篇五百字_十四方案逐键对齐回放'
    for file in sorted(directory.glob('篇*.md')):
        lines = file.read_text(encoding='utf-8').splitlines()
        sentences = []
        for i, line in enumerate(lines):
            if not line.startswith('原文       '):
                continue
            replay = next(x for x in lines[i+1:i+16] if x.startswith(LABEL+' '))
            words = aligned_line(line[len('原文       '):], replay[len(LABEL)+1:])
            tokens = []
            for word in words:
                if not all(han(c) for c in word):
                    if any(han(c) for c in word):
                        raise ValueError('mixed Han/punctuation token')
                    tokens.append(dict(text=word, syllables=None))
                    continue
                syllables = []
                for char in word:
                    py, tone = readings[char]
                    if py not in pinyin_atoms or py not in pinyin_finals or tone not in range(1, 6):
                        raise ValueError('uncovered reading: '+char+py)
                    syllables.append([py, tone])
                tokens.append(dict(text=word, syllables=syllables))
            sentences.append(tokens)
        count = sum(len(t['syllables'] or []) for line in sentences for t in line)
        if count != 500:
            raise ValueError(f'{file.name}: expected 500 Han, got {count}')
        lengths = collections.Counter(min(len(t['syllables']), 5) for line in sentences for t in line if t['syllables'])
        article = report['articles'][len(scenes)]
        if [lengths[i] for i in range(1, 6)] != [article['tokenCounts'][k] for k in ['c1','c2','c3','c4','c5plus']]:
            raise ValueError('word boundaries disagree with benchmark totals')
        scenes.append(dict(id=article['id'], title=article['title'], genre=article['genre'], sentences=sentences))
        hashes[str(file)] = sha(file)
    if len(scenes) != 10:
        raise ValueError('expected ten source articles')
    payload = dict(version='continuous-shuangpin-5500-corpus-v1',
        sourceHashes=hashes, referenceSegmentation='qz-shape historical fourteen-scheme replay',
        readingPolicy='Frozen R11 highest-frequency character reading, shared by all layouts; no contextual polyphone correction.',
        encoding=dict(pinyinAtoms=pinyin_atoms, pinyinFinals=pinyin_finals,
            finalRoots=seeds['finalRoots'], toneRegions={str(t): i for i, r in enumerate(fixture['toneRegions']) for t in r['tones']}),
        scenes=scenes, sceneOrder5500=list(range(1,11))+[10], sceneOrder5000=list(range(1,11)),
        note='The standalone 500-Han scenario repeats article 10. Five-plus-character words remain in the full corpus. Punctuation separates Han runs; it is not a scored key.')
    write(DEST/'continuous-shuangpin-5500.json', payload)
    print('frozen corpus: 5500 Han; 11000 sound keys; all replay word counts verified')


def prepare_tables(profile_path):
    snapshot_path = ROOT/'tools/ckt_v4_upstream_role_tables.json'
    snapshot, profile = read(snapshot_path), read(profile_path)
    # Bind the reconstructed error side to the exact frozen equivalent tables.
    digest = hashlib.sha256((snapshot['keys']+'\0'+snapshot['commit']+'\0').encode())
    for role in snapshot['roles']:
        digest.update((role+'\0').encode())
        digest.update(base64.b64decode(snapshot['tables'][role]['base64']))
    if digest.hexdigest() != profile['snapshotFingerprint'] or snapshot['errorRecoveryMs'] != profile['errorRecoveryMs']:
        raise ValueError('error profile belongs to a different motor snapshot')
    tables = {}
    for role, table in snapshot['tables'].items():
        expected = np.frombuffer(base64.b64decode(table['base64']), dtype='<f4')
        errors = np.frombuffer(base64.b64decode(profile['errorTables'][role]['base64']), dtype='<f4')
        timing = np.asarray(expected.astype(float)-profile['errorRecoveryMs']*errors.astype(float), dtype='<f4')
        if not np.all(np.isfinite(timing)) or np.any(timing <= 0):
            raise ValueError('nonpositive or invalid inferred timing')
        tables[role] = dict(shape=table['shape'], base64=base64.b64encode(timing.tobytes()).decode())
    write(DEST/'continuous-motor-timing-v1.json.gz', dict(version='continuous-motor-timing-v1',
        keys=snapshot['keys'], upstream=snapshot['upstream'], upstreamCommit=snapshot['commit'],
        snapshotSha256=sha(snapshot_path), errorProfileSha256=sha(profile_path), errorProfileFit=profile['fit'],
        interpretation='Experimental timing-only reconstruction: frozen native equivalent minus rebuilt pinned XGB error probability times recovery time. Continuous use is a local-context extrapolation, not a measured long-string model.',
        startupMs=0, tables=tables), compressed=True)
    print('frozen positive timing-only tables: all six native interval roles')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snow', type=Path, default=Path('D:/C2D/Documents/rime-snow-pinyin'))
    parser.add_argument('--source', type=Path, default=ROOT/'research/.cache/R11_integrated_replay/source.json')
    parser.add_argument('--inputs', type=Path, default=ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
    parser.add_argument('--error-profile', type=Path, default=ROOT/'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')
    args = parser.parse_args()
    prepare_corpus(args.snow, args.source, args.inputs)
    prepare_tables(args.error_profile)
