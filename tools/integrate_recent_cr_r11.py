"""Publish representative tradeoffs from the recent v5.2 refinement rounds."""
import argparse
import copy
import gzip
import hashlib
import json
import subprocess
from pathlib import Path

from integrate_cr_frontier_r11 import ROOT,HTML,SNOW,read,write,make_fixture,load_payload_module
from integrate_snow_jiandao_toned_r11 import macro_replay
from shenyun_collision_benchmark import read_word_corpus,evaluate_toned_layout

DESTINATION=ROOT/'a7_CKT_R11_integrated_materials/recent_cr_v52'
PREFIX=ROOT/'research/notes/2026-11-19-recent-cr-r11'
ROUTES={
    '1f9e267cd2':('认知成本加倍性能 · 右小指取舍','1f9-remove-p'),
    '17983edeb8':('低右小指 · 默认性能','1f9-remove-p'),
    '7af2f757e3':('低右小指 · 默认/加倍折中','cd3-refinement'),
    'bd4d24d64d':('低右小指 · 较低单指峰值','cd3-refinement'),
    'cd3cc7adfe':('低右小指 · 低选重/同指异键','cd3-refinement'),
    '7e650f7a4c':('M21 · 默认/加倍综合改良','7e-refinement'),
    'f89a91f7a5':('M21 · 更低右小指','1f9-remove-p'),
    '9de677753b':('M22 · 低右小指负荷','1f9-remove-p'),
}


def run(*args):subprocess.run(args,cwd=ROOT,check=True)
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def prepare():
    DESTINATION.mkdir(parents=True,exist_ok=True)
    labels={};layouts=[];tokens=None;provenance={}
    for ident,(route,round_name) in ROUTES.items():
        prefix=ROOT/('research/notes/2026-11-19-'+round_name)
        candidates=read(str(prefix)+'-candidates.json');robust=read(str(prefix)+'-robustness.json')
        verified=read(str(prefix)+'-verification.json')
        policies=json.loads(gzip.decompress(Path(str(prefix)+'-policies.json.gz').read_bytes()))
        if sha(str(prefix)+'-policies.json.gz')!=robust['sourceSha256']:raise ValueError('policy archive changed')
        layout=copy.deepcopy(next(r for r in candidates['layouts'] if r['id']==ident))
        memory=next(r for r in verified['memories'] if r['id']==ident)
        result=next(r for r in robust['results'] if r['id']==ident)
        selected=result['selected'];policy=next(r for r in policies['results'] if r['id']==ident)['policies'][selected['policyIndex']]
        native=next(r for r in verified['results'] if r['id']==ident and r['policy']==selected['policy'])
        if abs(policy['score']-native['score'])>1e-9:raise ValueError('native score differs')
        if tokens is None:tokens=candidates['tokenKeys']
        if tokens!=candidates['tokenKeys']:raise ValueError('incompatible legal inventory')
        public_id='CR-REF-'+ident;labels[public_id]='带调键道 · '+route
        layout.update(id=public_id,annealKey=layout['key'],origin='recent v5.2 research refinement',
            description=route+'；各自六成本宽域最小最大相对遗憾辅序；旧移手不参与筛选',
            wordAuxiliaryPolicy=selected['policy'],rustScore=0,nativeScore=0,
            memoryAudit=dict(copy.deepcopy(memory['audit']),ordinaryD=memory['D'],ordinaryF=memory['F'],
                memoryLower=memory['lower'],memoryGuard=memory['guard']),memoryDefinition=memory['definition'],
            policySelection=dict(version='recent-cr-v52-minimax-regret-v1',selectedPolicy=selected['policy'],
                selectedV52=policy['score'],worstRelativeRegret=selected['worstRegret'],meanRelativeRegret=selected['meanRegret'],
                grids=selected['grids'],selectionRule=robust['robustSelection'],enumeratedPolicies=144,
                source=str(prefix.relative_to(ROOT)).replace('\\','/'),route=route))
        layout['recentRefinement']=dict(originalId=ident,route=route,expectedV52=policy['score'],
            referenceV52=policies['reference']['tracks'],expectedTracksV52=native['tracks'],memory=memory,
            expectedErgonomics=native['ergonomics'])
        layouts.append(layout)
        for suffix in ['-candidates.json','-robustness.json','-policies.json.gz','-verification.json']:
            path=Path(str(prefix)+suffix);provenance[path.relative_to(ROOT).as_posix()]=sha(path)
    source=dict(version='recent-cr-r11-source-v1',tokenKeys=tokens,layouts=layouts,labels=labels,sourceHashes=provenance,
        selection='Representative practical route tradeoffs, not a claim that every tiny ergonomic difference deserves a row. M21/high-cost, M22 default/high-cost/low-collision, and lower-right-pinky routes are retained; superseded 9f is omitted. No old moving-hand objective.')
    write(Path(str(PREFIX)+'-source.json'),source)
    baseline=read(ROOT/'research/.cache/ckt-v51-toned-mars10-D1-final.json')
    decomposition=read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']
    for layout in layouts:
        fixture=make_fixture(source,baseline,decomposition,layout['id'],labels=labels,source_path=Path(str(PREFIX)+'-source.json'))
        fixture['publication']['recentRefinement']=layout['recentRefinement']
        write(DESTINATION/(layout['id']+'.fixture.json'),fixture)
    run('node','--max-old-space-size=6144','tools/recent_cr_r11.js','prepare')


def finish_metrics():
    source=read(Path(str(PREFIX)+'-source.json'));data=load_payload_module(DESTINATION)
    corpus=read_word_corpus([SNOW/name for name in ['snow_pinyin.base.dict.yaml','snow_pinyin.ext.dict.yaml','snow_pinyin.tencent.dict.yaml']],
        allowed_pinyin={data['pinyin'][py] for py,_ in data['base']},preserve_tones=True)
    for layout in source['layouts']:
        ident=layout['id'];native=read(DESTINATION/(ident+'.native.json'));fixture=read(DESTINATION/(ident+'.fixture.json'))
        if native['publication']!=fixture['publication']:raise ValueError('stale native artifact '+ident)
        native['columns']=read(DESTINATION/(ident+'.columns.json'))
        native['columns']['collision']=evaluate_toned_layout(fixture,corpus)
        native['macro']=macro_replay(data,fixture)
        write(DESTINATION/(ident+'.benchmark.json'),native)
        print(ident,'collision and frozen legacy macro replay complete',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--reuse-scores',action='store_true')
    parser.add_argument('--prepared',action='store_true',help='continue after --prepare-only without recomputing native anchors')
    parser.add_argument('--prepare-only',action='store_true');args=parser.parse_args()
    if not args.reuse_scores and not args.prepared:prepare()
    if args.prepare_only:return
    if not args.reuse_scores:
        for ident in read(Path(str(PREFIX)+'-source.json'))['labels']:
            run('node','--max-old-space-size=6144','tools/score_snow_jiandao_toned_benchmark.js',
                '--fixture',str(DESTINATION/(ident+'.fixture.json')),'--output',str(DESTINATION/(ident+'.native.json')))
            run('node','--max-old-space-size=6144','tools/score_toned_benchmark_columns.js',
                '--native',str(DESTINATION/(ident+'.native.json')),'--output',str(DESTINATION/(ident+'.columns.json')))
    finish_metrics()
    run('node','--max-old-space-size=8192','tools/recent_cr_r11.js','publish')
    run('node','tools/sync_keymap_link_colors.js','--check')


if __name__=='__main__':main()
