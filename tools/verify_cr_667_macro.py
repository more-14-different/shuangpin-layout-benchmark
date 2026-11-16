"""Independent macro replay and before/after audit for the 667 neighborhood result."""
import hashlib
import json
from pathlib import Path

from explore_cr_667_neighbors import PREFIX,SOURCE,ANCHOR,OUTPUT,read
from integrate_snow_jiandao_toned_r11 import ROOT,macro_replay
from run_cr_anneal import atomic_json


def main():
    bundle=read(str(PREFIX)+'-finalists.json');native=read(str(PREFIX)+'-native.json')
    old=read(SOURCE)['layouts'][0];layout=bundle['layouts'][0];checked=native['results'][0]
    if not old['key'].startswith(ANCHOR) or layout['anchorKey']!=old['key']:
        raise ValueError('comparison anchor is not 667')
    if checked['id']!=layout['id'] or abs(checked['fixed']['score']-layout['rustScore'])>1e-9:
        raise ValueError('Rust/JS score mismatch')
    macro_path=OUTPUT/'macro-input.json'
    data=read(macro_path);codes=dict(zip(bundle['tokenKeys'],layout['tonedCodes'],strict=True))
    encoded=dict(tonedCodes=[[codes.get(py+str(t)) for t in [1,2,3,4,5]] for py in data['pinyin']])
    macro=macro_replay(data,encoded)
    if abs(macro['daily|native-punctuation']['score']-layout['metrics']['daily'])>1e-9:
        raise ValueError('daily replay mismatch')
    profile=layout['constraints'];metrics=layout['metrics']
    if metrics['daily']+1e-9<profile['dailyFloor'] or metrics['pinky']>profile['pinkyCeiling']+1e-12:
        raise ValueError('comfort constraint violated')
    changes=[]
    for i,name in enumerate(bundle['firstAtomNames']):
        if old['state']['firstKeys'][i]!=layout['state']['firstKeys'][i]:
            changes.append(dict(kind='first',name=name,before=old['state']['firstKeys'][i],after=layout['state']['firstKeys'][i]))
    for r in range(3):
        for g in range(10):
            a,b=old['state']['groupKeys'][r][g],layout['state']['groupKeys'][r][g]
            if a!=b:changes.append(dict(kind='rhyme',region=['upper','home','lower'][r],group=g,
                originalRoots=old['rhymeGroups'][g]['roots'],before=a,after=b))
    for i,(a,b) in enumerate(zip(old['state']['partition'],layout['state']['partition'])):
        if a!=b:changes.append(dict(kind='root',index=i,before=a,after=b))
    before_native=read(ROOT/'research/notes/2026-11-16-cr-balanced-followup-native.json')['results'][0]['selected']
    if abs(before_native['score']-old['rustScore'])>1e-9:raise ValueError('before metrics mismatch')
    paths=[Path(__file__),SOURCE,Path(str(PREFIX)+'-finalists.json'),Path(str(PREFIX)+'-native.json'),macro_path,
        Path(str(PREFIX)+'-robustness.json'),ROOT/'research/notes/2026-11-16-cr-balanced-followup-native.json',
        ROOT/'tools/integrate_snow_jiandao_toned_r11.py']
    stability=read(str(PREFIX)+'-robustness.json')['results'][0]
    if stability['id']!=layout['id'] or checked['selected']['policy']!=stability['selectedPolicy']:
        raise ValueError('selected-policy verification mismatch')
    html_path=ROOT/'a7_CKT_R11.html'
    html_hash=hashlib.sha256(html_path.read_bytes()).hexdigest()
    if html_hash!=read(ROOT/'a7_CKT_R11_integrated_materials/cr_robust_frontier/manifest.json')['htmlSha256']:
        raise ValueError('published HTML changed')
    atomic_json(Path(str(PREFIX)+'-verification.json'),dict(version='cr-667-neighbors-verification-v1',tolerance=1e-9,
        htmlSha256=html_hash,publishedHtmlUnchanged=True,stability=stability,
        centerKey=old['key'],winnerKey=layout['key'],before=old['metrics'],after=layout['metrics'],
        beforeNative=before_native,afterNative=checked['fixed'],selectedNative=checked['selected'],macro=macro,changes=changes,
        importedStates=bundle['importedStates'],newStates=bundle['newStates'],coverage=bundle['coverage'],
        sourceHashes={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}))
    print(json.dumps(dict(center=ANCHOR,winner=layout['key'][:10],before=old['rustScore'],after=layout['rustScore'],
        daily=layout['metrics']['daily'],changes=changes),ensure_ascii=False))


if __name__=='__main__':main()
