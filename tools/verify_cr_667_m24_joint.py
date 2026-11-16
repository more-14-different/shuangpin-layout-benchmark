"""Independent JS terminal competition, M-T1, two pinkies and macro replay."""
import json
from pathlib import Path
import subprocess

from search_cr_667_m24_joint import PREFIX,SOURCE,read,sha
from integrate_snow_jiandao_toned_r11 import ROOT,macro_replay
from run_cr_anneal import atomic_json


def main():
    html=ROOT/'a7_CKT_R11.html';published=read(ROOT/'a7_CKT_R11_integrated_materials/cr_production5/manifest.json')
    if sha(html)!=published['htmlSha256']:raise ValueError('HTML changed since publication')
    paths=[html,Path('D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml'),
        Path('D:/C2D/Documents/rime-snow-pinyin/rime-stroke/stroke.dict.yaml')]
    provenance=Path(str(PREFIX)+'-input-provenance.json')
    atomic_json(provenance,dict(sourceHashes={
        (p.relative_to(ROOT).as_posix() if p.is_relative_to(ROOT) else str(p)):sha(p) for p in paths}))
    subprocess.run(['node','--max-old-space-size=6144','tools/verify_cr_stable_neighbors.js','--prefix',
        PREFIX.relative_to(ROOT).as_posix(),'--fixed-only','--source-auxiliary',provenance.relative_to(ROOT).as_posix()],
        cwd=ROOT,check=True)
    bundle=read(str(PREFIX)+'-finalists.json');native=read(str(PREFIX)+'-native.json');old=read(SOURCE)['layouts'][0]
    data_path=ROOT/'a7_CKT_R11_integrated_materials/cr_production5/payload-input.json'
    full=read(data_path);data={k:full[k] for k in ['pinyin','characters','macroxue']};del full
    results=[]
    for layout,n in zip(bundle['layouts'],native['results'],strict=True):
        if layout['id']!=n['id'] or layout['anchorKey']!=old['key']:raise ValueError('wrong representative')
        if n['memory']['lower']>24 or n['memory']['guard']>26 or n['memory']['D']>2:raise ValueError('memory or ordinary D over budget')
        e=n['fixed']['ergonomics'];p=layout['constraints']
        for field,key in [('pinky','leftPinkyQAZPeak4NativeTracks'),('rightPinky','rightPinkyPeak4NativeTracks')]:
            if abs(e[key]['value']-layout['metrics'][field])>1e-9:raise ValueError('native '+field+' mismatch')
        fits=e['leftPinkyQAZPeak4NativeTracks']['value']<=p['pinkyCeiling']+1e-12 and e['rightPinkyPeak4NativeTracks']['value']<=p['rightPinkyCeiling']+1e-12
        if fits!=layout['constraintsSatisfied']:raise ValueError('wrong constraint status')
        if any(role.startswith('best_qualified') for role in layout['roles']) and not fits:raise ValueError('ineligible winner')
        if layout['state']['partition']!=old['state']['partition']:raise ValueError('group membership changed')
        if any(sorted(a)!=sorted(b) for a,b in zip(layout['state']['groupKeys'],old['state']['groupKeys'])):
            raise ValueError('whole-group permutation violated')
        codes=dict(zip(bundle['tokenKeys'],layout['tonedCodes'],strict=True))
        encoded=dict(tonedCodes=[[codes.get(py+str(t)) for t in [1,2,3,4,5]] for py in data['pinyin']])
        macro=macro_replay(data,encoded)
        if abs(macro['daily|native-punctuation']['score']-layout['metrics']['daily'])>1e-9:raise ValueError('daily mismatch')
        first=[dict(atom=name,before=old['firstKeys'][name],after=key)
            for name,key in layout['firstKeys'].items() if key!=old['firstKeys'][name]]
        groups=[dict(region=i,group=j,before=a,after=b) for i,(before,after) in enumerate(zip(old['state']['groupKeys'],layout['state']['groupKeys']))
            for j,(a,b) in enumerate(zip(before,after)) if a!=b]
        results.append(dict(id=layout['id'],roles=layout['roles'],key=layout['key'],score=n['fixed']['score'],
            memory=n['memory'],native=n['fixed'],macro=macro,firstChanges=first,groupKeyChanges=groups,constraintsSatisfied=fits))
    used=[Path(__file__),SOURCE,Path(str(PREFIX)+'-finalists.json'),Path(str(PREFIX)+'-native.json'),provenance,data_path]
    atomic_json(Path(str(PREFIX)+'-verification.json'),dict(version='cr-667-m24-d2-joint-verification-v1',
        centerKey=old['key'],htmlUnchanged=sha(html)==published['htmlSha256'],htmlSha256=sha(html),
        rootInternalSplits=0,results=results,sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in used}))
    print(json.dumps([dict(roles=r['roles'],key=r['key'][:10],score=r['score'],M=[r['memory']['lower'],r['memory']['guard']],
        daily=r['macro']['daily|native-punctuation']['score'],qualified=r['constraintsSatisfied']) for r in results]))


if __name__=='__main__':main()
