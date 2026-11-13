"""Publish four audited CR layouts using the complete tone-in-main contracts."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import subprocess
from pathlib import Path

from integrate_snow_jiandao_toned_r11 import ROOT, HTML, SNOW, macro_replay, patch_report, patch_selectable_ui
from shenyun_collision_benchmark import read_word_corpus, evaluate_toned_layout

SOURCE = ROOT / 'research/notes/2026-11-13-cf1892-regroup-finalists.json'
BASELINE = ROOT / 'research/.cache/ckt-v51-toned-mars10-D1-final.json'
REFERENCE = ROOT / 'research/notes/2026-11-13-cf1892-regroup-benchmark.json'
DESTINATION = ROOT / 'a7_CKT_R11_integrated_materials/cr_frontier'
LABELS = {'CR0-0374': '均衡改进', 'CR1-0004': '更低 M',
          'CR1-0009': '联合重分组', 'CR1-1036': '最低当量'}


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def make_fixture(source, baseline, decomposition, ident):
    layout = next(row for row in source['layouts'] if row['id'] == ident)
    fixture = copy.deepcopy(baseline)
    lookup = dict(zip(source['tokenKeys'], layout['tonedCodes'], strict=True))
    if len(lookup) != 1407:
        raise ValueError(f'{ident}: invalid toned inventory')
    fixture['tonedCodes'] = [[lookup.get(py + str(tone)) for tone in range(1, 6)]
                             for py in fixture['pinyin']]
    for before, after in zip(baseline['tonedCodes'], fixture['tonedCodes'], strict=True):
        if [bool(code) for code in before] != [bool(code) for code in after]:
            raise ValueError(f'{ident}: legal-tone mask changed')
    finals = {row['pinyin']: row['fullFinal'] for row in decomposition}
    fixture['rhymeAtoms'] = [dict(name='-'.join(group['roots']),
        pinyin=[index for index, py in enumerate(fixture['pinyin']) if finals.get(py) in group['finals']],
        baselineKeys=group['keys']) for group in layout['rhymeGroups']]
    members = [py for group in fixture['rhymeAtoms'] for py in group['pinyin']]
    legal = {index for index, codes in enumerate(fixture['tonedCodes']) if any(codes)}
    if len(members) != len(set(members)) or not legal <= set(members):
        raise ValueError(f'{ident}: incomplete/overlapping rhyme groups')
    for atom in fixture['atoms']:
        keys = {code[0] for py in atom['pinyin'] for code in fixture['tonedCodes'][py] if code}
        if keys != {layout['firstKeys'][atom['name']]}:
            raise ValueError(f'{ident}: onset metadata/code mismatch for {atom["name"]}')
    audit = layout['memoryAudit']
    lower = 5 + audit['ordinaryD'] + audit['sourceRhymeColumnMergeRules'] + audit['toneRegionMergeLower']
    guard = 5 + audit['ordinaryD'] + audit['sourceRhymeColumnMergeLinks'] + audit['toneRegionMergeLower']
    if (lower, guard) != (audit['memoryLower'], audit['memoryGuard']):
        raise ValueError(f'{ident}: memory formula mismatch')
    fixture['layoutId'] = ident
    fixture['expected'] = {'score': layout['rustScore']}
    fixture['publication'] = dict(id=ident, name=f'{ident} · {LABELS[ident]}', research=True,
        description=layout['description'], source=str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
        sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        memoryAudit=audit,
        memoryDefinition='M-T1 root repartition: 5 + ordinary D + multi-root group rules/links + tone-region merges',
        rhymeGroups=layout['rhymeGroups'])
    return fixture


def load_payload_module():
    # The tracked CKT corpus reader provides the exact gzip payload boundaries.
    script = "const fs=require('fs'),z=require('zlib');const s=fs.readFileSync('a7_CKT_R11.html','utf8'),at=s.indexOf('<script id=\"payload\"'),start=s.indexOf('>',at)+1,end=s.indexOf('</script>',start);fs.writeFileSync(process.argv[1],z.gunzipSync(Buffer.from(s.slice(start,end),'base64')));"
    target = DESTINATION / 'payload-input.json'
    subprocess.run(['node', '-e', script, str(target)], cwd=ROOT, check=True)
    return read(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reuse-scores', action='store_true', help='reuse the per-layout raw scores; verify anchors before publishing')
    args = parser.parse_args()
    source, baseline = read(SOURCE), read(BASELINE)
    decomposition = read(ROOT / 'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']
    references = {row['id']: row for row in read(REFERENCE)['results']}
    DESTINATION.mkdir(parents=True, exist_ok=True)
    fixtures = {}
    for ident in LABELS:
        fixture = make_fixture(source, baseline, decomposition, ident)
        fixtures[ident] = fixture
        fixture_path, native_path, columns_path = [DESTINATION / (ident + suffix) for suffix in ('.fixture.json', '.native.json', '.columns.json')]
        write(fixture_path, fixture)
        if not args.reuse_scores:
            subprocess.run(['node', '--max-old-space-size=1800', 'tools/score_snow_jiandao_toned_benchmark.js',
                '--fixture', str(fixture_path), '--output', str(native_path)], cwd=ROOT, check=True)
            subprocess.run(['node', '--max-old-space-size=2600', 'tools/score_toned_benchmark_columns.js',
                '--native', str(native_path), '--output', str(columns_path)], cwd=ROOT, check=True)
    data = load_payload_module()
    # Rebuild rather than retaining two copies of the four large filter corpora
    # during a repeat publication.
    for ident in LABELS:
        data['tonedContractBenchmark']['schemes'].get('research', {}).pop(ident, None)
    corpus = read_word_corpus([SNOW / name for name in ('snow_pinyin.base.dict.yaml', 'snow_pinyin.ext.dict.yaml', 'snow_pinyin.tencent.dict.yaml')],
        allowed_pinyin={data['pinyin'][py] for py, _ in data['base']}, preserve_tones=True)
    research = {}
    for ident, fixture in fixtures.items():
        native = read(DESTINATION / (ident + '.native.json'))
        if (native['id'] != ident or native['tonedCodes'] != fixture['tonedCodes']
                or native.get('publication') != fixture['publication']):
            raise ValueError(f'{ident}: stale score cache')
        native['columns'] = read(DESTINATION / (ident + '.columns.json'))
        codes_hash = hashlib.sha256(json.dumps(native['tonedCodes'], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
        if (native['columns'].get('version') != 'tone-in-main-column-contracts-v3'
                or native['columns'].get('nativeId') != ident or native['columns'].get('tonedCodesSha256') != codes_hash):
            raise ValueError(f'{ident}: column cache provenance mismatch; recompute without --reuse-scores')
        native['columns']['collision'] = evaluate_toned_layout(fixture, corpus)
        native['macro'] = macro_replay(data, fixture)
        reference = references[ident]
        checks = [(native['ckt']['v51']['score'], reference['ckt']['v51']['score']),
                  (native['macro']['daily|native-punctuation']['score'], reference['macro']['daily|native-punctuation']['score']),
                  (native['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value'], reference['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value'])]
        if any(abs(actual - expected) > 1e-9 for actual, expected in checks):
            raise ValueError(f'{ident}: benchmark anchor mismatch {checks}')
        if (native['memory']['lower'], native['memory']['guard']) != (fixture['publication']['memoryAudit']['memoryLower'], fixture['publication']['memoryAudit']['memoryGuard']):
            raise ValueError(f'{ident}: publication memory mismatch')
        native['publication']['validation'] = {'anchorsVerified': True, 'tolerance': 1e-9}
        research[ident] = native
        write(DESTINATION / (ident + '.benchmark.json'), native)
        print(json.dumps({'id': ident, 'M': [native['memory']['lower'], native['memory']['guard']],
            'cktV51': checks[0][0], 'daily': checks[1][0], 'leftPinky4Native': checks[2][0]}, ensure_ascii=False), flush=True)
    # Keep every computed metric under version control without the large
    # corpus/filter rows or the duplicated dictionaries in the local payload.
    audit = {ident: {name: value for name, value in native.items()
                     if name not in {'filterRows', 'tonedCodes', 'keyboards'}}
             for ident, native in research.items()}
    write(ROOT / 'research/notes/2026-11-13-cr-frontier-r11-columns.json',
          {'version': 'cr-frontier-r11-v2', 'schemes': audit})
    data['tonedContractBenchmark']['schemes'].setdefault('research', {}).update(research)
    html = patch_selectable_ui(patch_report(HTML.read_text(encoding='utf-8')))
    payload_path = DESTINATION / 'payload-output.json'
    with payload_path.open('w', encoding='utf-8', newline='\n') as stream:
        json.dump(data, stream, ensure_ascii=False, separators=(',', ':'))
    stage_path = HTML.with_name(HTML.name + '.tmp')
    # Gzip in Node avoids creating several full-size Python string copies.
    ui_path = DESTINATION / 'ui-stage.html'
    ui_path.write_text(html, encoding='utf-8', newline='\n')
    pack = "const fs=require('fs'),z=require('zlib');const [ui,payload,out]=process.argv.slice(1),s=fs.readFileSync(ui,'utf8'),at=s.indexOf('<script id=\"payload\"'),start=s.indexOf('>',at)+1,end=s.indexOf('</script>',start);fs.writeFileSync(out,s.slice(0,start)+z.gzipSync(fs.readFileSync(payload),{mtime:0}).toString('base64')+s.slice(end));"
    subprocess.run(['node', '-e', pack, str(ui_path), str(payload_path), str(stage_path)], cwd=ROOT, check=True)
    stage_path.replace(HTML)
    write(DESTINATION / 'manifest.json', {'version': 'cr-frontier-r11-v1', 'ids': list(LABELS),
        'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'htmlSha256': hashlib.sha256(HTML.read_bytes()).hexdigest()})
    print(f'Published {len(research)} CR layouts: {HTML}', flush=True)


if __name__ == '__main__':
    main()
