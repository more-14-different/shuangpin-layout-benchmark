"""Independently replay fixed-policy root regroup representatives without publishing."""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

from regroup_cr_667_roots import PREFIX,SOURCE,read
from integrate_snow_jiandao_toned_r11 import ROOT,macro_replay
from run_cr_anneal import atomic_json


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    html=ROOT/'a7_CKT_R11.html';published=read(ROOT/'a7_CKT_R11_integrated_materials/cr_production5/manifest.json')
    if sha(html)!=published['htmlSha256']:raise ValueError('HTML no longer matches the current publication')
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
    with zipfile.ZipFile(ROOT/'research/config/cr-anneal-inputs.zip') as zipped:
        roots=json.loads(zipped.read('seeds.json'))['roots']
    results=[]
    for layout,n in zip(bundle['layouts'],native['results'],strict=True):
        if layout['id']!=n['id'] or layout['anchorKey']!=old['key']:raise ValueError('wrong verification representative')
        if layout['firstKeys']!=old['firstKeys']:raise ValueError('onset changed during regrouping')
        if n['memory']['lower']>22 or n['memory']['guard']>24:raise ValueError('memory increased')
        codes=dict(zip(bundle['tokenKeys'],layout['tonedCodes'],strict=True))
        encoded=dict(tonedCodes=[[codes.get(py+str(t)) for t in [1,2,3,4,5]] for py in data['pinyin']])
        macro=macro_replay(data,encoded)
        if abs(macro['daily|native-punctuation']['score']-layout['metrics']['daily'])>1e-9:raise ValueError('daily mismatch')
        changes=[]
        for i,(a,b) in enumerate(zip(old['state']['partition'],layout['state']['partition'])):
            if a!=b:
                changes.append(dict(rootIndex=i,root=roots[i],fromGroup=a,toGroup=b))
        results.append(dict(id=layout['id'],role=layout['role'],key=layout['key'],score=n['fixed']['score'],
            memory=n['memory'],native=n['fixed'],macro=macro,rootChanges=changes,groups=layout['rhymeGroups']))
    used=[Path(__file__),SOURCE,Path(str(PREFIX)+'-finalists.json'),Path(str(PREFIX)+'-native.json'),provenance,data_path]
    atomic_json(Path(str(PREFIX)+'-verification.json'),dict(version='cr-667-root-regroup-verification-v1',
        centerKey=old['key'],htmlUnchanged=sha(html)==published['htmlSha256'],htmlSha256=sha(html),
        rootInternalSplits=0,results=results,sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in used}))
    print(json.dumps([dict(role=r['role'],key=r['key'][:10],score=r['score'],M=[r['memory']['lower'],r['memory']['guard']],
        daily=r['macro']['daily|native-punctuation']['score'],roots=r['rootChanges']) for r in results],ensure_ascii=False))


if __name__=='__main__':main()
