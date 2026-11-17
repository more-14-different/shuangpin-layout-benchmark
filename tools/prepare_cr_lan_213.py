"""Freeze diverse fixed-Lan rhyme seeds and the independent 213 native corpus."""
import argparse
import copy
import gzip
import json
from pathlib import Path
import zipfile
import hashlib

from run_cr_anneal import ROOT,Engine,unpack,atomic_json
from run_cr_lan_213 import VERSION,LanSpace,admissible,production
from search_cr_667_zero_carriers import CarrierSpace,read,sha
from explore_cr_stable_neighbors import adapt_shape_corpus
from prepare_cr_m24_portfolio import make_layout,distances
from replay_cr_lan_policies import substitute

WORK=ROOT/'research/.cache/cr-lan-213-preparation'
PREFIX=ROOT/'research/notes/2026-11-18-cr-lan-213'
BUNDLE=ROOT/'research/config/cr-lan-213-inputs.zip'
POLICY=dict(word2='21',word3='213',word4='14')
ROUTES={
    'tight':dict(kind='daily',penalty=600,cktSlack=.015,temperatureScale=.35),
    'near':dict(kind='daily',penalty=300,cktSlack=.03,temperatureScale=.7),
    'moderate':dict(kind='daily',penalty=100,cktSlack=.08,temperatureScale=1),
    'wide':dict(kind='daily',penalty=30,cktSlack=.15,temperatureScale=2),
    'daily':dict(kind='daily',penalty=10,cktSlack=.15,temperatureScale=3),
    'ckt':dict(kind='ckt',penalty=200,cktSlack=.15,temperatureScale=1.5),
}


def prepare():
    WORK.mkdir(parents=True,exist_ok=True);unpack(ROOT/'research/config/cr-anneal-inputs.zip',WORK/'inputs')
    corpus=WORK/'inputs/corpus.bin';content,adapter=adapt_shape_corpus(corpus.read_bytes(),POLICY);corpus.write_bytes(content)
    space=CarrierSpace(WORK/'inputs')
    baseline_file=ROOT/'research/notes/2026-11-17-cr-lan-f19-stability-finalists.json';base=read(baseline_file)['layouts'][0]
    fixed=base['state']['firstKeys']
    constraints=dict(base['constraints'],cktCeiling=base['rustScore'],dailyFloor=base['metrics']['daily'],
        explorationDailyFloor=119.46664129382486)
    old_file=ROOT/'research/notes/2026-11-17-cr-lan-fixed-finalists.json';old=read(old_file)
    archive_file=old_file.parent/old['scoreArchive']['file']
    if sha(archive_file)!=old['scoreArchive']['sha256']:raise ValueError('fixed-Lan archive changed')
    audit_file=ROOT/'research/notes/2026-11-17-cr-lan-fixed-word3-invariance.json';audit=read(audit_file)
    candidates=[]
    for row in json.loads(gzip.decompress(archive_file.read_bytes()))['lan'].values():
        if row['state']['firstKeys']!=fixed:raise ValueError('non-Lan onset state in archive')
        m=substitute(row['metrics'],audit,'213')
        if space.key(row['state'])!=row['key']:raise ValueError('layout/memory key mismatch')
        if admissible(m,constraints,ROUTES['wide']):candidates.append(dict(row,metrics=m))
    center=next(r for r in candidates if r['key']==base['key'])
    if abs(center['metrics']['ckt']-base['rustScore'])>1e-9:raise ValueError('213 baseline changed')
    selected=[center]
    def add(row):
        if row['key'] not in {s['key'] for s in selected}:selected.append(row)
    add(min(candidates,key=lambda r:(abs(r['metrics']['daily']-127.67937561742104),r['metrics']['ckt'])))
    add(max(candidates,key=lambda r:(r['metrics']['daily'],-r['metrics']['ckt'])))
    add(min((r for r in candidates if r['metrics']['m']<=23),key=lambda r:r['metrics']['ckt']))
    while len(selected)<8:
        pool=[r for r in candidates if r['key'] not in {s['key'] for s in selected}]
        add(max(pool,key=lambda r:(min(distances(space,r['state'],s['state'])['normalized'] for s in selected),-r['metrics']['ckt'])))
    # Select a permissible fixed route for every spatially distinct seed.
    selections=[];layouts=[]
    engine=Engine(ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe',WORK/'inputs','cpu',2,300)
    try:
        for i,row in enumerate(selected):
            state=row['state'];m=dict(space.memory(state),**space.daily(state),**engine.score([space.expand(state)],True)[0])
            for field in ['ckt','daily','pinky','rightPinky']:
                if abs(m[field]-row['metrics'][field])>1e-9:raise ValueError('seed direct native replay mismatch '+field)
            preferred=['tight','moderate','daily','near','wide','wide','ckt','moderate'][i]
            route=preferred if admissible(m,constraints,ROUTES[preferred]) else 'wide'
            if not admissible(m,constraints,ROUTES[route]):raise ValueError('seed outside route envelope')
            ident='LAN213-'+row['key'][:10]
            s=dict(id=ident,key=row['key'],state=state,route=route,expected=m,family='fixed-lan')
            selections.append(s);layout=make_layout(space,state,m,read(baseline_file)['tokenKeys'],ident)
            layout['wordAuxiliaryPolicy']=POLICY;layouts.append(layout)
            print(json.dumps(dict(id=ident,route=route,metrics=m)),flush=True)
    finally:engine.close()
    # Additional hot/cold independent replicas ensure several penalties start at f19.
    for route in ['near','ckt','wide','daily']:
        s=copy.deepcopy(selections[0]);s.update(id=s['id']+'-'+route,route=route);selections.append(s)
    atomic_json(Path(str(PREFIX)+'-finalists.json'),dict(version=VERSION,tokenKeys=read(baseline_file)['tokenKeys'],
        firstAtomNames=[a['name'] for a in space.f['atoms']],layouts=layouts,selections=selections,
        fixedFirstKeys=fixed,constraints=constraints,routes=ROUTES,corpusAdapter=adapter,
        candidatePool=len(candidates),rootInternalSplits=0,
        distanceMatrix=[[distances(space,a['state'],b['state']) for b in selected] for a in selected],
        sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in [baseline_file,old_file,archive_file,audit_file,Path(__file__)]}))
    html='a7_CKT_R11.html';snow=Path('D:/C2D/Documents/rime-snow-pinyin')
    atomic_json(Path(str(PREFIX)+'-provenance.json'),dict(sourceHashes={p:sha(ROOT/p) if not Path(p).is_absolute() else sha(p)
        for p in [html,str(snow/'snow_pinyin.base.dict.yaml'),str(snow/'rime-stroke/stroke.dict.yaml')]}))


def freeze():
    data=read(str(PREFIX)+'-finalists.json');native=read(str(PREFIX)+'-native.json')
    if len(native['results'])!=len(data['layouts']):raise ValueError('missing full JS seed audits')
    for layout,n in zip(data['layouts'],native['results'],strict=True):
        if layout['id']!=n['id'] or abs(n['fixed']['score']-layout['rustScore'])>1e-9:raise ValueError('seed audit mismatch')
        for field,key in [('pinky','leftPinkyQAZPeak4NativeTracks'),('rightPinky','rightPinkyPeak4NativeTracks')]:
            if abs(n['fixed']['ergonomics'][key]['value']-layout['metrics'][field])>1e-9:raise ValueError('seed load mismatch')
    original=read(WORK/'inputs/seeds.json')
    spec=dict(version=VERSION,roots=original['roots'],finalRoots=original['finalRoots'],dailySequence=original['dailySequence'],
        fixedFirstKeys=data['fixedFirstKeys'],constraints=data['constraints'],routes=ROUTES,seeds=data['selections'],
        wordAuxiliaryPolicy=POLICY,memoryModel=CarrierSpace.MEMORY_MODEL,rootInternalSplits=0,
        shapeKeysByMeaning='AVUIO',toneKeysByTone='IVUAO',toneDigitsByShapeMeaning='42310',
        independentAudit=dict(file=Path(str(PREFIX)+'-native.json').name,sha256=sha(str(PREFIX)+'-native.json')))
    files={name:(WORK/'inputs'/name).read_bytes() for name in ['fixture.json','corpus.bin','snapshot.json','moving_hand.py','MOVING_HAND_LICENSE']}
    files['seeds.json']=json.dumps(spec,ensure_ascii=False,separators=(',',':')).encode()
    manifest=dict(version=VERSION,files={n:hashlib.sha256(b).hexdigest() for n,b in files.items()},
        sourceBundleSha256=sha(ROOT/'research/config/cr-anneal-inputs.zip'),seedAuditSha256=spec['independentAudit']['sha256'])
    files['manifest.json']=json.dumps(manifest,ensure_ascii=False,indent=2).encode()
    with zipfile.ZipFile(BUNDLE,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name,value in sorted(files.items()):
            info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,value)
    atomic_json(Path(str(PREFIX)+'-bundle.json'),dict(bundle=BUNDLE.relative_to(ROOT).as_posix(),sha256=sha(BUNDLE),size=BUNDLE.stat().st_size,
        manifest=manifest,seeds=[dict(id=s['id'],route=s['route'],key=s['key'],metrics=s['expected']) for s in spec['seeds']]))
    print('Frozen fixed-Lan 213 bundle:',BUNDLE,sha(BUNDLE))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--freeze',action='store_true');a=p.parse_args()
    freeze() if a.freeze else prepare()
