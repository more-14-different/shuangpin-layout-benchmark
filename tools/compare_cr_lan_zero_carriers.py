"""Full benchmark comparison of f19's original and two unified A/E/O carriers."""
import argparse
import copy
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess

from integrate_cr_frontier_r11 import ROOT,HTML,SNOW,read,write,make_fixture,load_payload_module,macro_replay
from integrate_cr_lan_f19_r11 import publication_source,IDENT,LABELS,LAYOUTS
from run_cr_anneal import unpack
from search_cr_667_zero_carriers import CarrierSpace,sha
from shenyun_collision_benchmark import read_word_corpus,evaluate_toned_layout

DESTINATION=ROOT/'research/.cache/cr-lan-zero-carriers-20261118'
OUTPUT=ROOT/'research/notes/2026-11-18-cr-lan-zero-carriers.json'
VARIANTS={'A-to-C':{'zero-A':'C'},'EO-to-R':{'zero-E':'R','zero-O':'R'}}


def prepare():
    unpack(ROOT/'research/config/cr-anneal-inputs.zip',DESTINATION/'inputs')
    space=CarrierSpace(DESTINATION/'inputs');source,_=publication_source(space)
    decomposition=read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']
    original=make_fixture(source,space.f,decomposition,IDENT,labels=LABELS,source_path=LAYOUTS)
    manifest=dict(version='cr-lan-zero-carrier-comparison-input-v1',baseline=IDENT,
        htmlSha256=sha(HTML),fixedPolicy=original['publication']['wordAuxiliaryPolicy'],
        sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in [LAYOUTS,Path(__file__)]},variants=[])
    write(DESTINATION/(IDENT+'.fixture.json'),original)
    for name,changes in VARIANTS.items():
        layout=copy.deepcopy(source['layouts'][0]);state=layout['state']
        for i,atom in enumerate(space.f['atoms']):
            if atom['name'] in changes:state['firstKeys'][i]=changes[atom['name']]
        memory=space.memory(state);daily=space.daily(state)
        fixture=copy.deepcopy(original);ident=IDENT+'-'+name
        for atom in fixture['atoms']:
            if atom['name'] in changes:
                for py in atom['pinyin']:
                    fixture['tonedCodes'][py]=[changes[atom['name']]+code[1:] if code else None
                                               for code in fixture['tonedCodes'][py]]
        fixture['layoutId']=ident
        publication=fixture['publication'];publication.update(id=ident,name=ident,annealKey=space.key(state),
            annealOrigin='single zero-carrier edit of f19a0ad1dc; rhyme layout and auxiliary policy fixed',
            description=json.dumps(changes,ensure_ascii=False),
            policySelection={'candidateSet':'fixed original 21/213/14; no auxiliary-policy optimization'})
        publication.pop('validation',None);publication.pop('originalFixedPolicyScore',None)
        publication['memoryAudit'].update(zeroCarrierRules=1,memoryLower=memory['m'],memoryGuard=memory['guard'])
        write(DESTINATION/(ident+'.fixture.json'),fixture)
        manifest['variants'].append(dict(id=ident,name=name,changes=changes,key=space.key(state),
            state=state,memory=memory,daily=daily,constraints=layout['constraints']))
    write(DESTINATION/'inputs.json',manifest)
    return manifest


def score_variant(row):
    ident=row['id'];fixture=DESTINATION/(ident+'.fixture.json');native=DESTINATION/(ident+'.native.json')
    columns=DESTINATION/(ident+'.columns.json')
    subprocess.run(['node','--max-old-space-size=6144','tools/score_snow_jiandao_toned_benchmark.js',
        '--fixture',str(fixture),'--output',str(native)],cwd=ROOT,check=True)
    subprocess.run(['node','--max-old-space-size=6144','tools/score_toned_benchmark_columns.js',
        '--native',str(native),'--output',str(columns)],cwd=ROOT,check=True)


def metrics(n):
    e=n['ergonomics'];c=n['columns']
    return dict(cktV51=n['ckt']['v51']['score'],cktV5=n['ckt']['v5']['score'],
        daily=n['macro']['daily|native-punctuation']['score'],
        memoryLower=n['memory']['lower'],memoryGuard=n['memory']['guard'],D=n['memory']['D'],F=n['memory']['F'],
        occupiedBuckets=n['inventory']['occupiedBuckets'],emptyBuckets=n['inventory']['emptyBuckets'],
        leftPinky=e['leftPinkyQAZPeak4NativeTracks']['value'],rightPinky=e['rightPinkyPeak4NativeTracks']['value'],
        maxFinger=e['maxFingerPeak4NativeTracks']['value'],sameFingerS2=e['s2DifferentKeySameFingerRate'],
        homeS2=e['homeS2'],homeFloor=e['homeFloor4NativeTracks'],
        a7eV5=c['ensemble']['v5'],a7eV4=c['ensemble']['v4'],lu=c['rules']['lu']['score'],fa=c['rules']['fa']['score'])


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--prepare-only',action='store_true')
    p.add_argument('--reuse-scores',action='store_true');args=p.parse_args()
    manifest=read(DESTINATION/'inputs.json') if args.reuse_scores else prepare()
    if sha(HTML)!=manifest['htmlSha256']:raise ValueError('comparison HTML changed')
    if args.prepare_only:return
    if not args.reuse_scores:
        subprocess.run(['node','--max-old-space-size=6144','tools/prepare_cr_lan_zero_scores.js'],cwd=ROOT,check=True)
        with ThreadPoolExecutor(max_workers=2) as executor:list(executor.map(score_variant,manifest['variants']))
    data=load_payload_module(DESTINATION)
    corpus=read_word_corpus([SNOW/name for name in ('snow_pinyin.base.dict.yaml','snow_pinyin.ext.dict.yaml','snow_pinyin.tencent.dict.yaml')],
        allowed_pinyin={data['pinyin'][py] for py,_ in data['base']},preserve_tones=True)
    baseline=data['tonedContractBenchmark']['schemes']['research'][IDENT]
    report=dict(version='cr-lan-zero-carrier-comparison-v1',fixedPolicy=manifest['fixedPolicy'],
        auxiliaryPolicyReoptimized=False,htmlSha256=manifest['htmlSha256'],baseline=metrics(baseline),
        baselineBenchmark={k:v for k,v in baseline.items() if k not in {'filterRows','tonedCodes','keyboards'}},variants=[],
        sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in [Path(__file__),ROOT/'tools/prepare_cr_lan_zero_scores.js',LAYOUTS,
            ROOT/'tools/score_snow_jiandao_toned_benchmark.js',ROOT/'tools/score_toned_benchmark_columns.js']})
    baseline_tracks=baseline['ckt']['v51']['tracks']
    for row in manifest['variants']:
        ident=row['id'];fixture=read(DESTINATION/(ident+'.fixture.json'));native=read(DESTINATION/(ident+'.native.json'))
        native['columns']=read(DESTINATION/(ident+'.columns.json'))
        native['columns']['collision']=evaluate_toned_layout(fixture,corpus)
        native['macro']=macro_replay(data,fixture)
        if abs(native['macro']['daily|native-punctuation']['score']-row['daily']['daily'])>1e-9:
            raise ValueError('independent daily replay mismatch')
        for track,value in native['ckt']['v51']['tracks'].items():
            if any(value[k]!=baseline_tracks[track][k] for k in ['count','totalWeight']):
                raise ValueError('comparison cohort changed')
        m=metrics(native)
        if [m['memoryLower'],m['memoryGuard'],m['D']]!=[row['memory'][k] for k in ['m','guard','d']]:
            raise ValueError('memory mismatch')
        result=dict(row,metrics=m,delta={k:v-report['baseline'][k] for k,v in m.items()},
            passesLeft=m['leftPinky']<=row['constraints']['pinkyCeiling']+1e-12,
            passesRight=m['rightPinky']<=row['constraints']['rightPinkyCeiling']+1e-12,
            benchmark={k:v for k,v in native.items() if k not in {'filterRows','tonedCodes','keyboards'}})
        report['variants'].append(result)
        print(json.dumps({k:result[k] for k in ['name','metrics','delta','passesLeft','passesRight']},ensure_ascii=False),flush=True)
    report['htmlUnchanged']=sha(HTML)==manifest['htmlSha256']
    if not report['htmlUnchanged']:raise ValueError('HTML changed during comparison')
    write(OUTPUT,report)


if __name__=='__main__':main()
