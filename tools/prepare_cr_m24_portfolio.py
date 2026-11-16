"""Freeze session representatives for portable M24/D2 multi-seed annealing."""
import argparse
import copy
import hashlib
import itertools
import json
from pathlib import Path
import zipfile

from run_cr_anneal import ROOT,Engine,atomic_json,unpack
from search_cr_667_zero_carriers import CarrierSpace
from explore_cr_stable_neighbors import adapt_shape_corpus

PREFIX=ROOT/'research/notes/2026-11-17-cr-m24-portfolio'
BUNDLE=ROOT/'research/config/cr-m24-portfolio-inputs.zip'
WORK=ROOT/'research/.cache/cr-m24-portfolio-preparation'
POLICY=dict(word2='21',word3='231',word4='14')
CONSTRAINTS=dict(maxD=2,maxM=24,maxGuard=26,pinkyCeiling=.09032422256372921,rightPinkyCeiling=.07468205050495597)
ROUTES=dict(speed=dict(dailyFloor=119.46664129382486),balanced=dict(dailyFloor=126.23457023071755),daily=dict(dailyFloor=130.0))
# Closely related champions are deliberate controls, not separate distant basins.
CHOICES=[
    ('29ce221cfe','2026-11-16-cr-stable-neighbors','speed','speed','lowest session CKT'),
    ('795c0eee49','2026-11-16-cr-stable-neighbors','daily','daily','highest daily score'),
    ('6a384d9d0d','2026-11-16-cr-stable-neighbors','daily','daily','lower-CKT daily alternative'),
    ('87de6cc69c','2026-11-17-cr-667-neighbors','balanced','balanced','M22 balanced champion'),
    ('0cfbd2058b','2026-11-17-cr-667-m24-d2-joint','zero-split','balanced','zero-O split; M23'),
    ('e63c8224a7','2026-11-17-cr-667-root-regroup','regroup','balanced','uniform whole-root regroup alternative'),
    ('971fbdef9a','2026-11-17-cr-667-m24-d2-joint','zero-retro','balanced','W and retroflex relocation with zero-O split; M24'),
    ('f0ae939a38','2026-11-16-cr-frontier-followup','balanced-ancestor','balanced','older balanced center before 667 polishing'),
]


def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def make_layout(space,state,metrics,token_keys,ident):
    f=space.f;expanded=space.expand(state)
    decomposition=read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']
    finals={r['pinyin']:r['fullFinal'] for r in decomposition}
    first={py:i for i,a in enumerate(f['atoms']) for py in a['pinyin']}
    final={py:i for i,a in enumerate(f['rhymeAtoms']) for py in a['pinyin']}
    region={t:i for i,r in enumerate(f['toneRegions']) for t in r['tones']}
    pairs=[(py,t) for py,codes in enumerate(f['tonedCodes']) for t,code in enumerate(codes,1) if code]
    if [f['pinyin'][py]+str(t) for py,t in pairs]!=token_keys:raise ValueError('token ordering changed')
    groups=[]
    for g in range(10):
        pys=[py for i,a in enumerate(f['rhymeAtoms']) if state['partition'][space.spec['finalRoots'][i]]==g for py in a['pinyin']]
        groups.append(dict(roots=[r for i,r in enumerate(space.spec['roots']) if state['partition'][i]==g],
            finals=sorted({finals[f['pinyin'][py]] for py in pys}),
            keys={r['name']:state['groupKeys'][i][g] for i,r in enumerate(f['toneRegions'])}))
    return dict(id=ident,key=space.key(state),state=state,metrics=metrics,rustScore=metrics['ckt'],
        wordAuxiliaryPolicy=POLICY,rhymeGroups=groups,
        firstKeys={a['name']:state['firstKeys'][i] for i,a in enumerate(f['atoms'])},
        tonedCodes=[expanded['firstKeys'][first[py]]+expanded['rhymeKeys'][region[t]][final[py]] for py,t in pairs])


def distances(space,a,b):
    x,y=(space.expand(s) for s in [a,b])
    onset=sum(i!=j for i,j in zip(x['firstKeys'],y['firstKeys']))
    rhyme=sum(i!=j for u,v in zip(x['rhymeKeys'],y['rhymeKeys']) for i,j in zip(u,v))
    pairs=sum((a['partition'][i]==a['partition'][j])!=(b['partition'][i]==b['partition'][j]) for i,j in itertools.combinations(range(18),2))
    # Physical expanded cells and root co-membership ignore arbitrary group IDs.
    return dict(onsetAtoms=onset,rhymeFinalRegionCells=rhyme,rootCoMembershipPairs=pairs,
        normalized=.35*onset/len(x['firstKeys'])+.5*rhyme/sum(map(len,x['rhymeKeys']))+.15*pairs/153)


def prepare():
    WORK.mkdir(parents=True,exist_ok=True);unpack(ROOT/'research/config/cr-anneal-inputs.zip',WORK/'inputs')
    corpus=WORK/'inputs/corpus.bin';adapted,adapter=adapt_shape_corpus(corpus.read_bytes(),POLICY);corpus.write_bytes(adapted)
    space=CarrierSpace(WORK/'inputs');original=copy.deepcopy(space.spec)
    token_keys=read(ROOT/'research/notes/2026-11-17-cr-667-m24-d2-joint-finalists.json')['tokenKeys']
    selections=[];sources=set()
    for key,source,family,route,reason in CHOICES:
        path=ROOT/('research/notes/'+source+'-finalists.json');sources.add(path)
        item=next(r for r in read(path)['layouts'] if r['key'].startswith(key));state=copy.deepcopy(item['state'])
        if space.key(state)!=item['key']:raise ValueError('seed physical/memory key changed: '+key)
        if abs(space.daily(state)['daily']-item['metrics']['daily'])>1e-9:raise ValueError('seed daily replay changed: '+key)
        selections.append(dict(id=key,key=item['key'],state=state,family=family,route=route,reason=reason,
            source=path.relative_to(ROOT).as_posix(),oldPolicy=item.get('wordAuxiliaryPolicy',dict(word2='12',word3='213',word4='24'))))
    engine=Engine(ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe',WORK/'inputs','cpu',2,300)
    try:
        layouts=[]
        for s in selections:
            m=dict(space.memory(s['state']),**space.daily(s['state']),**engine.score([space.expand(s['state'])],True)[0])
            if not (m['d']<=2 and m['m']<=24 and m['guard']<=26 and m['daily']>=ROUTES[s['route']]['dailyFloor']-1e-9 and
                    m['pinky']<=CONSTRAINTS['pinkyCeiling']+1e-12 and m['rightPinky']<=CONSTRAINTS['rightPinkyCeiling']+1e-12):
                raise ValueError('ineligible seed '+s['id']+': '+json.dumps(m))
            s['expected']=m
            layouts.append(make_layout(space,s['state'],m,token_keys,'CRP-'+s['id']))
            print(json.dumps(dict(id=s['id'],route=s['route'],metrics=m)),flush=True)
    finally:engine.close()
    matrix=[[distances(space,a['state'],b['state']) for b in selections] for a in selections]
    source_hashes={p.relative_to(ROOT).as_posix():sha(p) for p in sorted(sources)}
    atomic_json(Path(str(PREFIX)+'-finalists.json'),dict(version='cr-m24-portfolio-seeds-v1',
        tokenKeys=token_keys,firstAtomNames=[a['name'] for a in space.f['atoms']],layouts=layouts,
        constraints=CONSTRAINTS,routes=ROUTES,selections=selections,distanceMatrix=matrix,
        distanceDefinition='0.35 onset atom fraction + 0.50 expanded rhyme/final/tone-region cell fraction + 0.15 root co-membership pair fraction; diversity heuristic, not an ergonomic score',
        corpusAdapter=adapter,sourceHashes=source_hashes))


def freeze():
    data=read(str(PREFIX)+'-finalists.json');native=read(str(PREFIX)+'-native.json')
    if len(data['layouts'])!=len(native['results']):raise ValueError('missing independent seed audits')
    for layout,result in zip(data['layouts'],native['results'],strict=True):
        if layout['id']!=result['id']:raise ValueError('audit ID mismatch')
        for key,field in [('pinky','leftPinkyQAZPeak4NativeTracks'),('rightPinky','rightPinkyPeak4NativeTracks')]:
            if abs(layout['metrics'][key]-result['fixed']['ergonomics'][field]['value'])>1e-9:raise ValueError('pinky audit mismatch')
    original=read(WORK/'inputs/seeds.json')
    profiles={name:dict(CONSTRAINTS,**route,name=name) for name,route in ROUTES.items()}
    spec=dict(version='cr-m24-portfolio-v1',roots=original['roots'],finalRoots=original['finalRoots'],
        dailySequence=original['dailySequence'],seeds=data['selections'],profiles=profiles,
        wordAuxiliaryPolicy=POLICY,shapeKeysByMeaning='AVUIO',toneKeysByTone='IVUAO',toneDigitsByShapeMeaning='42310',
        memoryModel=CarrierSpace.MEMORY_MODEL,groupMode='whole-group-exchange',
        independentAudit=dict(file=Path(str(PREFIX)+'-native.json').name,sha256=sha(str(PREFIX)+'-native.json')),
        distanceMatrix=data['distanceMatrix'])
    files={name:(WORK/'inputs'/name).read_bytes() for name in ['fixture.json','corpus.bin','snapshot.json','moving_hand.py','MOVING_HAND_LICENSE']}
    files['seeds.json']=json.dumps(spec,ensure_ascii=False,separators=(',',':')).encode()
    manifest=dict(version='cr-m24-portfolio-v1',files={name:hashlib.sha256(value).hexdigest() for name,value in files.items()},
        auditSha256=spec['independentAudit']['sha256'],sourceBundleSha256=sha(ROOT/'research/config/cr-anneal-inputs.zip'))
    files['manifest.json']=json.dumps(manifest,ensure_ascii=False,indent=2).encode()
    with zipfile.ZipFile(BUNDLE,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name,value in sorted(files.items()):
            info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,value)
    atomic_json(Path(str(PREFIX)+'-bundle.json'),dict(bundle=BUNDLE.relative_to(ROOT).as_posix(),sha256=sha(BUNDLE),
        size=BUNDLE.stat().st_size,seeds=[dict(id=s['id'],family=s['family'],route=s['route'],metrics=s['expected']) for s in spec['seeds']],
        manifest=manifest))
    print(json.dumps(dict(bundle=str(BUNDLE),sha256=sha(BUNDLE),seeds=len(spec['seeds']))))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--freeze',action='store_true');a=p.parse_args()
    freeze() if a.freeze else prepare()
