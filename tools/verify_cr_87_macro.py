"""Full daily replay and explicit tradeoffs for the bounded 87 search."""
import hashlib
import json
from pathlib import Path

from explore_cr_87_neighbors import PREFIX,SOURCE,ANCHOR,OUTPUT,BUDGET,read
from integrate_snow_jiandao_toned_r11 import ROOT,macro_replay
from run_cr_anneal import atomic_json


def main():
    bundle=read(str(PREFIX)+'-finalists.json');native=read(str(PREFIX)+'-native.json')
    robust=read(str(PREFIX)+'-robustness.json');previous=read(SOURCE)['layouts'][0]
    before=read(ROOT/'research/notes/2026-11-17-cr-667-neighbors-native.json')['results'][0]['fixed']
    if not previous['key'].startswith(ANCHOR) or abs(before['score']-previous['rustScore'])>1e-9:
        raise ValueError('before comparison must use 87')
    if bundle['newStates']>BUDGET:raise ValueError('state budget exceeded')
    by_id={r['id']:r for r in native['results']};ranks={r['id']:r for r in robust['results']}
    if set(by_id)!=set(ranks) or len(by_id)!=len(bundle['layouts']):raise ValueError('incomplete native or stability results')
    macro_path=OUTPUT/'macro-input.json';data=read(macro_path);results=[]
    for layout in bundle['layouts']:
        checked=by_id[layout['id']];rank=ranks[layout['id']]
        if layout['anchorKey']!=previous['key']:raise ValueError('wrong representative baseline')
        if abs(checked['fixed']['score']-layout['rustScore'])>1e-9:raise ValueError('Rust/JS score mismatch')
        if checked['selected']['policy']!=rank['selectedPolicy']:raise ValueError('stability selection mismatch')
        codes=dict(zip(bundle['tokenKeys'],layout['tonedCodes'],strict=True))
        encoded=dict(tonedCodes=[[codes.get(py+str(t)) for t in [1,2,3,4,5]] for py in data['pinyin']])
        macro=macro_replay(data,encoded);m=layout['metrics'];profile=layout['constraints']
        if abs(macro['daily|native-punctuation']['score']-m['daily'])>1e-9:raise ValueError('daily replay mismatch')
        if m['daily']+1e-9<profile['dailyFloor'] or m['pinky']>profile['pinkyCeiling']+1e-12:
            raise ValueError('comfort constraint violated')
        if layout['role']=='daily_recovery_under_anchor_ckt' and (
                m['ckt']>previous['rustScore']+1e-10 or m['daily']+1e-9<previous['metrics']['daily']):
            raise ValueError('recovery candidate violates its declared objective')
        changes=[]
        for i,name in enumerate(bundle['firstAtomNames']):
            a,b=previous['state']['firstKeys'][i],layout['state']['firstKeys'][i]
            if a!=b:changes.append(dict(kind='first',name=name,before=a,after=b))
        for r in range(3):
            for g in range(10):
                a,b=previous['state']['groupKeys'][r][g],layout['state']['groupKeys'][r][g]
                if a!=b:changes.append(dict(kind='rhyme',region=['upper','home','lower'][r],
                    originalRoots=previous['rhymeGroups'][g]['roots'],before=a,after=b))
        for i,(a,b) in enumerate(zip(previous['state']['partition'],layout['state']['partition'])):
            if a!=b:changes.append(dict(kind='root',index=i,before=a,after=b))
        e0,e1=before['ergonomics'],checked['fixed']['ergonomics']
        changes_ergonomics={k:e1[k]['value']-e0[k]['value'] for k in [
            'maxFingerPeak4NativeTracks','leftPinkyQAZPeak4NativeTracks','rightPinkyPeak4NativeTracks']}
        changes_ergonomics['s2DifferentKeySameFingerRate']=e1['s2DifferentKeySameFingerRate']-e0['s2DifferentKeySameFingerRate']
        results.append(dict(id=layout['id'],key=layout['key'],role=layout['role'],before=previous['metrics'],after=m,
            beforeNative=before,fixed=checked['fixed'],selected=checked['selected'],stability=rank,macro=macro,
            changes=changes,ergonomicDeltas=changes_ergonomics))
    html=ROOT/'a7_CKT_R11.html';html_hash=hashlib.sha256(html.read_bytes()).hexdigest()
    if html_hash!=read(ROOT/'a7_CKT_R11_integrated_materials/cr_robust_frontier/manifest.json')['htmlSha256']:
        raise ValueError('published HTML changed')
    paths=[Path(__file__),SOURCE,Path(str(PREFIX)+'-finalists.json'),Path(str(PREFIX)+'-native.json'),
        Path(str(PREFIX)+'-robustness.json'),macro_path,
        ROOT/'research/notes/2026-11-17-cr-667-neighbors-native.json',ROOT/'tools/integrate_snow_jiandao_toned_r11.py']
    atomic_json(Path(str(PREFIX)+'-verification.json'),dict(version='cr-87-neighbors-verification-v1',tolerance=1e-9,
        centerKey=previous['key'],publishedHtmlUnchanged=True,htmlSha256=html_hash,
        importedStates=bundle['importedStates'],newStates=bundle['newStates'],budget=BUDGET,coverage=bundle['coverage'],
        sourceHashes={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},results=results))
    print(json.dumps([dict(role=r['role'],key=r['key'][:10],before=r['before']['ckt'],after=r['after']['ckt'],
        daily=r['after']['daily'],changes=r['changes']) for r in results],ensure_ascii=False))


if __name__=='__main__':main()
