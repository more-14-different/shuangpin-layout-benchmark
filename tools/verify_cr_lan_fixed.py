"""Independent full JS, M-T1, macro and invariant word3 checks for fixed Lan onsets."""
import argparse
import json
from pathlib import Path
import subprocess

from explore_cr_lan_fixed import PREFIX,SOURCE,read,sha,ROOT
from integrate_snow_jiandao_toned_r11 import macro_replay
from run_cr_anneal import atomic_json


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--policy-replay',action='store_true');args=parser.parse_args()
    prefix=Path(str(PREFIX)+'-policy') if args.policy_replay else PREFIX
    html=ROOT/'a7_CKT_R11.html'
    publication=Path('D:/C2D/Documents/rime-snow-pinyin/config/snow-zhudao-mapping.json')
    expected_html=read(publication)['sourceSha256']
    if sha(html)!=expected_html:raise ValueError('HTML differs from current production publication provenance')
    paths=[html,Path('D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml'),Path('D:/C2D/Documents/rime-snow-pinyin/rime-stroke/stroke.dict.yaml')]
    provenance=Path(str(prefix)+'-input-provenance.json')
    atomic_json(provenance,dict(sourceHashes={(p.relative_to(ROOT).as_posix() if p.is_relative_to(ROOT) else str(p)):sha(p) for p in paths}))
    subprocess.run(['node','--max-old-space-size=6144','tools/verify_cr_stable_neighbors.js','--prefix',prefix.relative_to(ROOT).as_posix(),
        '--fixed-only','--source-auxiliary',provenance.relative_to(ROOT).as_posix()],cwd=ROOT,check=True)
    if not args.policy_replay:subprocess.run(['node','--max-old-space-size=6144','tools/audit_cr_lan_word3.js',prefix.relative_to(ROOT).as_posix()],cwd=ROOT,check=True)
    bundle=read(str(prefix)+'-finalists.json');native=read(str(prefix)+'-native.json')
    data_path=ROOT/'a7_CKT_R11_integrated_materials/cr_production5/payload-input.json'
    full=read(data_path);data={k:full[k] for k in ['pinyin','characters','macroxue']};del full
    results=[]
    for layout,n in zip(bundle['layouts'],native['results'],strict=True):
        if layout['state']['firstKeys']!=bundle['contract']['fixedFirstKeys']:raise ValueError('fixed initial map changed')
        if n['memory']['lower']>24 or n['memory']['guard']>26 or n['memory']['D']!=2:raise ValueError('memory/D contract mismatch')
        for field,key in [('pinky','leftPinkyQAZPeak4NativeTracks'),('rightPinky','rightPinkyPeak4NativeTracks')]:
            if abs(n['fixed']['ergonomics'][key]['value']-layout['metrics'][field])>1e-9:raise ValueError('native '+field+' mismatch')
        codes=dict(zip(bundle['tokenKeys'],layout['tonedCodes'],strict=True))
        encoded=dict(tonedCodes=[[codes.get(py+str(t)) for t in [1,2,3,4,5]] for py in data['pinyin']]);macro=macro_replay(data,encoded)
        if abs(macro['daily|native-punctuation']['score']-layout['metrics']['daily'])>1e-9:raise ValueError('macro mismatch')
        results.append(dict(id=layout['id'],key=layout['key'],roles=layout['roles'],score=n['fixed']['score'],
            macro=macro,memory=n['memory'],ergonomics=n['fixed']['ergonomics'],qualifiedProfiles=layout['qualifiedProfiles']))
    used=[Path(__file__),ROOT/'tools/audit_cr_lan_word3.js',Path(str(prefix)+'-finalists.json'),Path(str(prefix)+'-native.json'),
        Path(str(PREFIX)+'-word3-invariance.json'),data_path]
    atomic_json(Path(str(prefix)+'-verification.json'),dict(version='cr-lan-fixed-verification-v1',results=results,
        htmlUnchanged=sha(html)==expected_html,htmlSha256=sha(html),
        publicationReference=dict(file=str(publication),sha256=sha(publication)),
        sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in used}))
    print(json.dumps([dict(id=r['id'],score=r['score'],daily=r['macro']['daily|native-punctuation']['score']) for r in results]))


if __name__=='__main__':main()
