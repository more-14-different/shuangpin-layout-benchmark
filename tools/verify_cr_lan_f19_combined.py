"""Independent JS, memory, article and archive checks for joint f19 searches."""
import gzip
import json
import math
from pathlib import Path
import subprocess

from search_cr_lan_f19_combined import PREFIX, OUTPUT, SOURCE, POLICY, same_key_multisets
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
    bundle, native = (read(str(PREFIX)+suffix) for suffix in ['-finalists.json', '-native.json'])
    base = read(SOURCE)['layouts'][0]
    space = CarrierSpace(OUTPUT/'inputs')
    archive = PREFIX.parent/bundle['scoreArchive']['file']
    if sha(archive) != bundle['scoreArchive']['sha256']:
        raise ValueError('score archive hash mismatch')
    scored = json.loads(gzip.decompress(archive.read_bytes()))
    visited = set(bundle['importedKeys']) | {k for stage in bundle['stages'] for k in stage['candidateKeys']}
    if set(scored) != visited or len(scored) != bundle['evaluatedStates']:
        raise ValueError('archive coverage mismatch')
    for key, row in scored.items():
        state, m = row['state'], row['metrics']
        if not same_key_multisets(state, base['state']) or space.key(state) != key:
            raise ValueError('archive violated frozen onsets/key multiset or physical ID')
        if space.memory(state) != {k: m[k] for k in ['d', 'm', 'guard']}:
            raise ValueError('archive memory mismatch')
        if (m['m'] > 24 or m['guard'] > 26 or m['d'] != 2 or
                m['daily'] < base['metrics']['daily']-1e-9 or
                not all(math.isfinite(m[k]) for k in ['ckt', 'daily', 'pinky', 'rightPinky'])):
            raise ValueError('invalid archived metrics')
    payload_path = ROOT/'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json'
    payload = read(payload_path)
    data = {k: payload[k] for k in ['pinyin', 'characters', 'macroxue']}
    del payload
    results = []
    for layout, n in zip(bundle['layouts'], native['results'], strict=True):
        if layout['id'] != n['id'] or layout['anchorKey'] != base['key']:
            raise ValueError('representative ID/anchor mismatch')
        if not same_key_multisets(layout['state'], base['state']) or layout['wordAuxiliaryPolicy'] != POLICY:
            raise ValueError('representative changed frozen contract')
        for field, key in [('pinky', 'leftPinkyQAZPeak4NativeTracks'), ('rightPinky', 'rightPinkyPeak4NativeTracks')]:
            value = n['fixed']['ergonomics'][key]['value']
            if abs(value-layout['metrics'][field]) > 1e-9 or value > bundle['constraints'][field+'Ceiling']+1e-12:
                raise ValueError('native load mismatch or ceiling exceeded')
        codes = dict(zip(bundle['tokenKeys'], layout['tonedCodes'], strict=True))
        encoded = dict(tonedCodes=[[codes.get(py+str(t)) for t in [1, 2, 3, 4, 5]] for py in data['pinyin']])
        macro = macro_replay(data, encoded)
        daily = macro['daily|native-punctuation']['score']
        if abs(daily-layout['metrics']['daily']) > 1e-9:
            raise ValueError('independent article replay mismatch')
        root_changes = [dict(root=space.spec['roots'][i], fromGroup=a, toGroup=b)
            for i, (a, b) in enumerate(zip(base['state']['partition'], layout['state']['partition'], strict=True)) if a != b]
        key_changes = [dict(group=g, toneRegion=space.f['toneRegions'][r]['name'], before=a, after=b)
            for r, (old, new) in enumerate(zip(base['state']['groupKeys'], layout['state']['groupKeys'], strict=True))
            for g, (a, b) in enumerate(zip(old, new, strict=True)) if a != b]
        results.append(dict(id=layout['id'], key=layout['key'], roles=layout['roles'],
            ckt=n['fixed']['score'], cktDelta=n['fixed']['score']-base['rustScore'],
            daily=daily, dailyDelta=daily-base['metrics']['daily'], memory=n['memory'],
            rootChanges=root_changes, groupKeyChanges=key_changes, rhymeGroups=layout['rhymeGroups'],
            native=n['fixed'], macro=macro))
    if sha(html) != html_hash:
        raise ValueError('published HTML changed')
    used = [Path(__file__), SOURCE, Path(str(PREFIX)+'-finalists.json'),
        Path(str(PREFIX)+'-native.json'), provenance, payload_path]
    atomic_json(Path(str(PREFIX)+'-verification.json'), dict(version='cr-lan-f19-combined-verification-v1',
        evaluatedStates=len(scored), newStates=bundle['newStates'], archiveSha256=sha(archive),
        archiveInvariantsChecked=True, fixedOnsets=True, fixedToneRegionKeyMultisets=True,
        rootInternalSplits=0, wordAuxiliaryPolicy=POLICY, shapeKeysByMeaning='AVUIO',
        toneKeysByTone='IVUAO', toneDigitsByShapeMeaning='42310', htmlUnchanged=True,
        htmlSha256=html_hash, results=results,
        sourceHashes={p.relative_to(ROOT).as_posix(): sha(p) for p in used}))
    print(json.dumps([dict(id=r['id'], roles=r['roles'], ckt=r['ckt'], daily=r['daily'])
        for r in results], ensure_ascii=False))


if __name__ == '__main__':
    main()
