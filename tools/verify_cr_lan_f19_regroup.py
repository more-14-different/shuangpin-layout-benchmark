"""Full JS competitions and independent article replay of f19 root regrouping."""
import gzip
import json
import math
from pathlib import Path
import subprocess

from regroup_cr_lan_f19_roots import PREFIX, SOURCE, OUTPUT, POLICY
from integrate_snow_jiandao_toned_r11 import ROOT, macro_replay
from run_cr_anneal import atomic_json
from search_cr_667_zero_carriers import CarrierSpace, read, sha


def main():
    html = ROOT/'a7_CKT_R11.html'
    html_hash = sha(html)
    snow = Path('D:/C2D/Documents/rime-snow-pinyin')
    paths = [html, snow/'snow_pinyin.base.dict.yaml', snow/'rime-stroke/stroke.dict.yaml']
    provenance = Path(str(PREFIX)+'-input-provenance.json')
    atomic_json(provenance, dict(sourceHashes={
        (p.relative_to(ROOT).as_posix() if p.is_relative_to(ROOT) else str(p)): sha(p) for p in paths}))
    subprocess.run(['node', '--max-old-space-size=6144', 'tools/verify_cr_stable_neighbors.js',
        '--prefix', PREFIX.relative_to(ROOT).as_posix(), '--fixed-only', '--source-auxiliary',
        provenance.relative_to(ROOT).as_posix()], cwd=ROOT, check=True)
    bundle = read(str(PREFIX)+'-finalists.json')
    native = read(str(PREFIX)+'-native.json')
    base = read(SOURCE)['layouts'][0]
    payload_path = ROOT/'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json'
    payload = read(payload_path)
    data = {k: payload[k] for k in ['pinyin', 'characters', 'macroxue']}
    del payload
    space = CarrierSpace(OUTPUT/'inputs')
    archive = PREFIX.parent/bundle['scoreArchive']['file']
    if sha(archive) != bundle['scoreArchive']['sha256']:
        raise ValueError('score archive hash mismatch')
    scored = json.loads(gzip.decompress(archive.read_bytes()))
    visited = {k for stage in bundle['stages'] for k in stage['candidateKeys']} | {base['key']}
    if set(scored) != visited or len(scored) != bundle['evaluatedStates']:
        raise ValueError('incomplete or extraneous score archive')
    for key, row in scored.items():
        state, m = row['state'], row['metrics']
        if state['firstKeys'] != base['state']['firstKeys'] or state['groupKeys'] != base['state']['groupKeys']:
            raise ValueError('archive changed frozen onsets or physical group keys')
        if space.key(state) != key or space.memory(state) != {k: m[k] for k in ['d', 'm', 'guard']}:
            raise ValueError('archive layout key or memory mismatch')
        if (m['m'] > 24 or m['guard'] > 26 or m['daily'] < base['metrics']['daily']-1e-9 or
                not all(math.isfinite(m[k]) for k in ['ckt', 'daily', 'pinky', 'rightPinky'])):
            raise ValueError('invalid archived candidate metrics')
    results = []
    for layout, n in zip(bundle['layouts'], native['results'], strict=True):
        if layout['id'] != n['id'] or layout['anchorKey'] != base['key']:
            raise ValueError('representative ID or anchor mismatch')
        if (layout['state']['firstKeys'] != base['state']['firstKeys'] or
                layout['state']['groupKeys'] != base['state']['groupKeys'] or
                layout['wordAuxiliaryPolicy'] != POLICY):
            raise ValueError('frozen onset, tone-region keys or auxiliary policy changed')
        if space.key(layout['state']) != layout['key']:
            raise ValueError('physical layout key mismatch')
        m = space.memory(layout['state'])
        if m != {k: layout['metrics'][k] for k in ['d', 'm', 'guard']}:
            raise ValueError('memory mismatch')
        if m['m'] > 24 or m['guard'] > 26 or m['d'] != 2:
            raise ValueError('memory/onset constraint mismatch')
        for field, key in [('pinky', 'leftPinkyQAZPeak4NativeTracks'), ('rightPinky', 'rightPinkyPeak4NativeTracks')]:
            value = n['fixed']['ergonomics'][key]['value']
            if abs(value-layout['metrics'][field]) > 1e-9 or value > bundle['constraints'][field+'Ceiling']+1e-12:
                raise ValueError('native load mismatch or guard violation')
        codes = dict(zip(bundle['tokenKeys'], layout['tonedCodes'], strict=True))
        encoded = dict(tonedCodes=[[codes.get(py+str(t)) for t in [1, 2, 3, 4, 5]] for py in data['pinyin']])
        macro = macro_replay(data, encoded)
        daily = macro['daily|native-punctuation']['score']
        if abs(daily-layout['metrics']['daily']) > 1e-9:
            raise ValueError('independent daily replay mismatch')
        changes = [dict(root=space.spec['roots'][i], fromGroup=a, toGroup=b)
            for i, (a, b) in enumerate(zip(base['state']['partition'], layout['state']['partition'], strict=True)) if a != b]
        results.append(dict(id=layout['id'], key=layout['key'], roles=layout['roles'],
            ckt=n['fixed']['score'], cktDelta=n['fixed']['score']-base['rustScore'],
            daily=daily, dailyDelta=daily-base['metrics']['daily'], memory=n['memory'],
            rootChanges=changes, rhymeGroups=layout['rhymeGroups'], native=n['fixed'], macro=macro))
    used = [Path(__file__), SOURCE, Path(str(PREFIX)+'-finalists.json'),
        Path(str(PREFIX)+'-native.json'), provenance, payload_path]
    if sha(html) != html_hash:
        raise ValueError('HTML changed during audit')
    atomic_json(Path(str(PREFIX)+'-verification.json'), dict(version='cr-lan-f19-root-regroup-verification-v1',
        rootInternalSplits=0, fixedOnsets=True, fixedGroupKeys=True, wordAuxiliaryPolicy=POLICY,
        evaluatedStates=len(scored), archiveSha256=sha(archive), archiveInvariantsChecked=True,
        shapeKeysByMeaning='AVUIO', toneKeysByTone='IVUAO', toneDigitsByShapeMeaning='42310',
        htmlUnchanged=True, htmlSha256=html_hash, results=results,
        sourceHashes={p.relative_to(ROOT).as_posix(): sha(p) for p in used}))
    print(json.dumps([dict(id=r['id'], ckt=r['ckt'], daily=r['daily'], changes=r['rootChanges'])
        for r in results], ensure_ascii=False))


if __name__ == '__main__':
    main()
