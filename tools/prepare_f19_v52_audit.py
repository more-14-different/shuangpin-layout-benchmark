"""Select archive leaders and close neighbours for a fresh v5.2 policy audit."""
import copy
import gzip
import hashlib
import json
from pathlib import Path

from prepare_cr_m24_portfolio import make_layout
from search_cr_667_zero_carriers import CarrierSpace

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT/'research/notes/2026-11-19-f19-v52-production-audit'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def branches(value, name='root'):
    if isinstance(value, dict) and value and all(isinstance(r, dict) and 'state' in r and 'metrics' in r for r in value.values()):
        yield name, list(value.values())
    elif isinstance(value, dict):
        for key, child in value.items():
            if isinstance(child, dict):
                yield from branches(child, name+'/'+key)


def main():
    space = CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
    source = ROOT/'research/notes/2026-11-17-cr-lan-f19-stability-finalists.json'
    original = read(source)
    token_keys = original['tokenKeys']
    chosen, archives = {}, []

    def physical(state):
        return hashlib.sha256(json.dumps(space.expand(state), sort_keys=True).encode()).hexdigest()

    def add(row, origin):
        ident = physical(row['state'])
        if ident not in chosen:
            chosen[ident] = dict(row=copy.deepcopy(row), origins=[])
        chosen[ident]['origins'].append(origin)

    add(original['layouts'][0], str(source.relative_to(ROOT)))
    hashes = {str(source.relative_to(ROOT)): sha(source)}
    for path in sorted((ROOT/'research/notes').glob('*cr-*-scores.json.gz')):
        data = json.loads(gzip.decompress(path.read_bytes()))
        source_name = str(path.relative_to(ROOT)).replace('\\','/')
        hashes[source_name] = sha(path)
        for branch, rows in branches(data):
            usable = [r for r in rows if len(r['state'].get('firstKeys', [])) == 26 and
                      len(r['state'].get('partition', [])) == 18 and
                      ('cktV52' in r['metrics'] or 'ckt' in r['metrics'])]
            if not usable:
                continue
            version = 'v52' if 'cktV52' in usable[0]['metrics'] else 'v51'
            key = 'cktV52' if version == 'v52' else 'ckt'
            ordered = sorted(usable, key=lambda r: (r['metrics'][key],r['key']))
            n = 8 if 'lan-fixed-scores' in path.name or 'f19-combined' in path.name else 2
            for row in ordered[:n]:
                add(row, source_name+'#'+branch)
            archives.append(dict(file=source_name, branch=branch, states=len(usable), cktVersion=version,
                                 minimum=ordered[0]['metrics'][key], minimumKey=ordered[0]['key']))
    # Also include published finalists, irrespective of old moving-hand eligibility.
    for name in ['2026-11-16-cr-frontier-followup-finalists.json',
                 '2026-11-17-cr-m24-portfolio-finalists.json']:
        path=ROOT/'research/notes'/name
        d=read(path); hashes[str(path.relative_to(ROOT))]=sha(path)
        for row in d['layouts']:
            add(row, str(path.relative_to(ROOT)))
    path=ROOT/'research/config/cr-frontier-finalists.json'
    frontier=read(path);hashes[str(path.relative_to(ROOT))]=sha(path)
    for row in [r['item'] for r in frontier['finalists']]+frontier['top10Ckt']:
        add(row,str(path.relative_to(ROOT)))
    path=ROOT/'research/config/cr-76-aeo-v52.json'
    control=read(path)['baseline'];control['metrics']={'cktV52':control['score']}
    hashes[str(path.relative_to(ROOT))]=sha(path);add(control,str(path.relative_to(ROOT)))
    path=ROOT/'research/notes/2026-11-18-cr-retroflex-top-v52.json'
    control=next(r for r in read(path)['selected'] if r['key'].startswith('5bd306d6ca'))
    hashes[str(path.relative_to(ROOT))]=sha(path);add(control,str(path.relative_to(ROOT)))
    layouts=[]
    for selected in chosen.values():
        row=selected['row']
        layout=make_layout(space, row['state'], dict(ckt=0), token_keys, row['key'][:10])
        # Anchor values depend on the source's original auxiliary contract.
        layout.pop('rustScore')
        layout['wordAuxiliaryPolicy']=dict(word2='21',word3='213',word4='14')
        layout['sourceOrigins']=selected['origins']
        layout['historicalMetrics']=row['metrics']
        layout['constraints']=dict(pinkyCeiling=1,rightPinkyCeiling=1)
        layouts.append(layout)
    # Published original CR controls use explicit toned codes rather than state.
    path=ROOT/'research/notes/2026-11-13-cf1892-regroup-finalists.json'
    controls=read(path);hashes[str(path.relative_to(ROOT))]=sha(path)
    if controls['tokenKeys']!=token_keys:raise ValueError('original CR inventory differs')
    for row in controls['layouts']:
        if row['id'] not in ['CR0-0374','CR1-0004','CR1-0009','CR1-1036']:continue
        if any(r['tonedCodes']==row['tonedCodes'] for r in layouts):continue
        layouts.append(dict(id=row['id'],tonedCodes=row['tonedCodes'],rhymeGroups=row['rhymeGroups'],
            wordAuxiliaryPolicy=dict(word2='21',word3='213',word4='14'),
            constraints=dict(pinkyCeiling=1,rightPinkyCeiling=1),sourceOrigins=[str(path.relative_to(ROOT))]))
    # Current production native sound table, without translating its layout rules.
    native_path=ROOT/'a7_CKT_R11_integrated_materials/snow_jiandao_toned_native.json'
    native=read(native_path)
    production_tokens=[space.f['pinyin'][py]+str(tone) for py,codes in enumerate(native['tonedCodes']) for tone,code in enumerate(codes,1) if code]
    production_codes=[code for codes in native['tonedCodes'] for code in codes if code]
    if production_tokens != token_keys:
        raise ValueError('production inventory differs')
    layouts.append(dict(id='current-production',tonedCodes=production_codes,
        wordAuxiliaryPolicy=native['contract']['wordAuxiliaryPolicy'],
        constraints=dict(pinkyCeiling=1,rightPinkyCeiling=1),expectedV52=9.205692936,
        sourceOrigins=[str(native_path.relative_to(ROOT))]))
    # Publication value rounded above: use full precision.
    publication_path=ROOT/'research/notes/2026-11-18-ckt-v52-all-schemes.json'
    layouts[-1]['expectedV52']=read(publication_path)['schemes']['SNOW-JIANDAO-TONED']['v52']['score']
    hashes[str(native_path.relative_to(ROOT))]=sha(native_path)
    hashes[str(publication_path.relative_to(ROOT))]=sha(publication_path)
    payload=dict(version='f19-v52-production-audit-candidates-v1',tokenKeys=token_keys,
        firstAtomNames=original['firstAtomNames'],layouts=layouts,archiveInventory=archives,
        sourceHashes=hashes,selection='Top two per recorded search branch; top eight for f19 fixed-layout and joint regroup archives; published portfolio controls; current production. No moving-hand filter. Not an exhaustive new layout search.')
    target=Path(str(PREFIX)+'-candidates.json')
    target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('archive rows',sum(a['states'] for a in archives),'candidate layouts',len(layouts),flush=True)


if __name__=='__main__':
    main()
