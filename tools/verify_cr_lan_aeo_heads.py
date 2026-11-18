"""Independent native, memory and article audit of unified-AEO movable-head layouts."""
import gzip
import json
import math
from pathlib import Path
import subprocess

import search_cr_lan_aeo_heads as a
from integrate_snow_jiandao_toned_r11 import macro_replay


def main():
    html = a.ROOT/'a7_CKT_R11.html'
    html_hash = a.sha(html)
    snow = Path('D:/C2D/Documents/rime-snow-pinyin')
    inputs = [html, snow/'snow_pinyin.base.dict.yaml', snow/'rime-stroke/stroke.dict.yaml']
    provenance = Path(str(a.PREFIX)+'-input-provenance.json')
    a.atomic_json(provenance, dict(sourceHashes={
        (p.relative_to(a.ROOT).as_posix() if p.is_relative_to(a.ROOT) else str(p)): a.sha(p) for p in inputs}))
    subprocess.run(['node', '--max-old-space-size=6144', 'tools/verify_cr_stable_neighbors.js',
        '--prefix', a.PREFIX.relative_to(a.ROOT).as_posix(), '--fixed-only', '--source-auxiliary',
        provenance.relative_to(a.ROOT).as_posix()], cwd=a.ROOT, check=True)
    bundle, native = (a.read(str(a.PREFIX)+s) for s in ['-finalists.json', '-native.json'])
    base = next(r for r in a.read(a.SOURCE)['layouts'] if r['key'] == bundle['contract']['baselineKey'])
    space = a.CarrierSpace(a.OUTPUT/'inputs')
    units = a.onset_units(space.f)
    archive = a.PREFIX.parent/bundle['scoreArchive']['file']
    if a.sha(archive) != bundle['scoreArchive']['sha256']:
        raise ValueError('score archive hash mismatch')
    scored = json.loads(gzip.decompress(archive.read_bytes()))
    visited = {k for stage in bundle['stages'] for k in stage['candidateKeys']}
    if set(scored) != visited or len(scored) != bundle['evaluatedStates']:
        raise ValueError('archive coverage mismatch')
    controls = set(bundle['controlKeys'])
    for key, row in scored.items():
        state, m = row['state'], row['metrics']
        if len({state['firstKeys'][i] for i in units[0]}) != 1:
            raise ValueError('archive split the AEO entrance')
        if any(sorted(x) != sorted(y) for x, y in zip(state['groupKeys'], base['state']['groupKeys'], strict=True)):
            raise ValueError('archive changed tone-region key counts')
        if space.key(state) != key or space.memory(state) != {k: m[k] for k in ['d', 'm', 'guard']}:
            raise ValueError('archive ID or memory mismatch')
        if (m['d'] > 4 or m['m'] > 24 or m['guard'] > 26 or
                (key not in controls and m['daily'] < 128-1e-9) or
                not all(math.isfinite(m[k]) for k in ['ckt', 'daily', 'pinky', 'rightPinky'])):
            raise ValueError('invalid archived metrics')
    payload_path = a.ROOT/'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json'
    payload = a.read(payload_path)
    data = {k: payload[k] for k in ['pinyin', 'characters', 'macroxue']}
    del payload
    results = []
    for layout, n in zip(bundle['layouts'], native['results'], strict=True):
        if layout['id'] != n['id'] or layout['wordAuxiliaryPolicy'] != a.POLICY:
            raise ValueError('representative ID or policy mismatch')
        first = layout['state']['firstKeys']
        if not layout['reference'] and len({first[i] for i in units[0]}) != 1:
            raise ValueError('representative split AEO')
        if any(role.startswith('primary_') for role in layout['roles']) and layout['metrics']['d'] > base['metrics']['d']:
            raise ValueError('primary representative increased D')
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
        changes = [dict(atom=atom['name'], before=old, after=new)
            for atom, old, new in zip(space.f['atoms'], base['state']['firstKeys'], first, strict=True) if old != new]
        results.append(dict(id=layout['id'], key=layout['key'], roles=layout['roles'], reference=layout['reference'],
            aeoKey=None if layout['reference'] else first[units[0][0]],
            ckt=n['fixed']['score'], cktDelta=n['fixed']['score']-base['rustScore'],
            daily=daily, dailyDelta=daily-base['metrics']['daily'], memory=n['memory'],
            onsetChanges=changes, rhymeGroups=layout['rhymeGroups'], native=n['fixed'], macro=macro))
    if a.sha(html) != html_hash:
        raise ValueError('published HTML changed')
    used = [Path(__file__), a.SOURCE, Path(str(a.PREFIX)+'-finalists.json'), Path(str(a.PREFIX)+'-native.json'), provenance, payload_path]
    a.atomic_json(Path(str(a.PREFIX)+'-verification.json'), dict(version='cr-lan-aeo-heads-verification-v1',
        evaluatedStates=len(scored), archiveSha256=a.sha(archive), archiveInvariantsChecked=True,
        aeoUnified=True, preferredD=base['metrics']['d'], shapeKeysByMeaning='AVUIO', toneKeysByTone='IVUAO',
        toneDigitsByShapeMeaning='42310', rootInternalSplits=0, htmlUnchanged=True, htmlSha256=html_hash,
        results=results, sourceHashes={p.relative_to(a.ROOT).as_posix(): a.sha(p) for p in used}))
    print(json.dumps([dict(id=r['id'], roles=r['roles'], aeo=r['aeoKey'], ckt=r['ckt'],
        daily=r['daily'], D=r['memory']['D']) for r in results], ensure_ascii=False))


if __name__ == '__main__':
    main()
