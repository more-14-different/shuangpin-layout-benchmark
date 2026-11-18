"""Continuous sound-key timing on the frozen production 5500-Han corpus.

Each Han contributes exactly two keys. Word boundaries annotate intervals;
punctuation and original line ends terminate runs. No auxiliary/selection keys,
word-start penalties, error losses, or synthetic first-key costs are included.
"""
import argparse
import array
import base64
import collections
import gzip
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT/'research/config/continuous-shuangpin-5500.json'
TIMING = ROOT/'research/config/continuous-motor-timing-v1.json.gz'
OUTPUT = ROOT/'research/notes/2026-11-19-continuous-shuangpin-5500.json'
EDGE_TYPES = ('withinSyllable', 'withinWordAcrossSyllables', 'acrossWords')


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def interval_contexts(code):
    """Exactly N-1 native interval roles; central windows never overlap costs."""
    n = len(code)
    if n < 2:
        return
    if n == 2:
        yield 0, 'L2i1', code
    elif n == 3:
        yield 0, 'L3i1', code
        yield 1, 'L3i2', code
    else:
        yield 0, 'L4i1', code[:3]
        for i in range(1, n-2):
            yield i, 'L4i2', code[i-1:i+3]
        yield n-2, 'L4i3', code[-3:]


class Timing:
    def __init__(self, path=TIMING):
        payload = json.loads(gzip.decompress(Path(path).read_bytes()))
        self.metadata = {k: v for k, v in payload.items() if k != 'tables'}
        self.keys = payload['keys']
        self.index = {k: i for i, k in enumerate(self.keys)}
        self.tables = {}
        for role, table in payload['tables'].items():
            values = array.array('f')
            values.frombytes(base64.b64decode(table['base64']))
            if sys.byteorder != 'little':
                values.byteswap()
            if len(values) != len(self.keys)**len(table['shape']):
                raise ValueError('invalid timing table dimensions')
            self.tables[role] = values

    def interval(self, role, context):
        index = 0
        for key in context:
            index = index*len(self.keys)+self.index[key]
        return float(self.tables[role][index])


def encode_syllable(state, encoding, py, tone):
    first = encoding['pinyinAtoms'][py]
    final = encoding['pinyinFinals'][py]
    region = encoding['toneRegions'][str(tone)]
    root = encoding['finalRoots'][final]
    code = state['firstKeys'][first]+state['groupKeys'][region][state['partition'][root]]
    if len(code) != 2 or not all('A' <= key <= 'Z' for key in code):
        raise ValueError('syllable must produce exactly two sound keys')
    return code


def corpus_runs(corpus, state, order):
    """Owners are (syllable ID, word ID); every punctuation token splits a run."""
    scenes = {s['id']: s for s in corpus['scenes']}
    for scene_id in order:
        for sentence in scenes[scene_id]['sentences']:
            code, owners, syllable_id = '', [], 0
            for word_id, token in enumerate(sentence):
                if token['syllables'] is None:
                    if code:
                        yield scene_id, code, owners
                    code, owners = '', []
                    continue
                for py, tone in token['syllables']:
                    code += encode_syllable(state, corpus['encoding'], py, tone)
                    owners.extend([(syllable_id, word_id)]*2)
                    syllable_id += 1
            if code:
                yield scene_id, code, owners


def edge_type(a, b):
    return 'withinSyllable' if a[0] == b[0] else ('withinWordAcrossSyllables' if a[1] == b[1] else 'acrossWords')


def evaluate(corpus, state, timing, order):
    edges = {key: dict(intervals=0, timingMs=0.) for key in EDGE_TYPES}
    roles = collections.Counter()
    scene_ms = collections.defaultdict(float)
    han_count = run_count = 0
    independent_ms = 0.
    for scene, code, owners in corpus_runs(corpus, state, order):
        han_count += len(code)//2
        run_count += 1
        for j in range(0, len(code), 2):
            independent_ms += timing.interval('L2i1', code[j:j+2])
        for i, role, context in interval_contexts(code):
            value = timing.interval(role, context)
            item = edges[edge_type(owners[i], owners[i+1])]
            item['intervals'] += 1
            item['timingMs'] += value
            roles[role] += 1
            scene_ms[scene] += value
    total_ms = sum(item['timingMs'] for item in edges.values())
    if sum(roles.values()) != 2*han_count-run_count:
        raise ValueError('lost or duplicated key interval')
    return dict(han=han_count, soundKeys=2*han_count, runs=run_count,
        intervals=sum(roles.values()), timingMs=total_ms, msPerHan=total_ms/han_count,
        independentSyllableMsPerHan=independent_ms/han_count,
        edges=edges, nativeRoles=dict(roles), sceneTimingMs=dict(scene_ms))


def corpus_statistics(corpus, order):
    counts, transitions = collections.Counter(), collections.Counter()
    scenes = {s['id']: s for s in corpus['scenes']}
    for scene_id in order:
        for sentence in scenes[scene_id]['sentences']:
            previous = None
            for token in sentence:
                if token['syllables'] is None:
                    previous = None
                    continue
                length = len(token['syllables'])
                counts[str(min(length, 5))] += 1
                if previous is not None:
                    transitions[f'{min(previous,5)}>{min(length,5)}'] += 1
                previous = length
    four_total = sum(counts[str(i)] for i in range(1, 5))
    return dict(wordCounts=dict(counts), sharesWithinLengths1to4={str(i): counts[str(i)]/four_total for i in range(1,5)},
        adjacentWordLengthCounts=dict(sorted(transitions.items())),
        twoThenTwoShare=transitions['2>2']/sum(transitions.values()))


def default_layouts():
    # Historical metrics are retained as evidence, never silently overwritten.
    layouts = {}
    def add(row, source, ident=None):
        key = ident or row['key'][:10]
        layouts[key] = dict(id=key, state=row['state'], source=source,
            historicalMetrics=row.get('metrics', {}))
    file = 'research/notes/2026-11-17-cr-lan-fixed-finalists.json'
    add(next(r for r in read(ROOT/file)['layouts'] if r['key'].startswith('f19')), file)
    file = 'research/config/cr-76-aeo-v52.json'
    add(read(ROOT/file)['baseline'], file, '76f30871bf')
    for file in ['research/notes/2026-11-18-cr-pair-group-swaps-v52.json',
                 'research/notes/2026-11-19-cr-six-root-regroup-v52.json']:
        for row in read(ROOT/file)['selected']:
            add(row, file)
    return list(layouts.values())


def build_report(corpus_path=CORPUS, timing_path=TIMING):
    corpus, timing = read(corpus_path), Timing(timing_path)
    layouts = default_layouts()
    results = []
    for layout in layouts:
        row = {k: v for k, v in layout.items() if k != 'state'}
        row['5500'] = evaluate(corpus, layout['state'], timing, corpus['sceneOrder5500'])
        row['5000'] = evaluate(corpus, layout['state'], timing, corpus['sceneOrder5000'])
        results.append(row)
    reference = next(r for r in results if r['id'] == 'f19a0ad1dc')
    for row in results:
        for size in ['5500', '5000']:
            row[size]['scoreF19Equals100'] = 100*reference[size]['msPerHan']/row[size]['msPerHan']
    results.sort(key=lambda r: r['5500']['msPerHan'])
    return dict(version='continuous-shuangpin-5500-v1-experimental',
        definition='Each Han is exactly two sound keys. Sum every native interval once using L4i2 centrally and native boundary roles at Han-run ends. Punctuation/line ends split runs. No word resets, error losses, or startup penalty.',
        corpusSha256=sha(corpus_path), timingSha256=sha(timing_path), timingModel=timing.metadata,
        referenceId=reference['id'], scoreDefinition='100 * f19 msPerHan / candidate msPerHan; higher is better; primary physical quantity is msPerHan',
        sourceHashes={p: sha(ROOT/p) for p in sorted({r['source'] for r in results})},
        corpusStatistics5500=corpus_statistics(corpus, corpus['sceneOrder5500']),
        corpusStatistics5000=corpus_statistics(corpus, corpus['sceneOrder5000']), results=results)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    report = build_report()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    for row in report['results']:
        print(row['id'], f"{row['5500']['msPerHan']:.6f} ms/Han", f"score {row['5500']['scoreF19Equals100']:.6f}")
