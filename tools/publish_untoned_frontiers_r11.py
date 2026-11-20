"""Prepare robust auxiliary policies and full ordinary R11 columns for eight frontiers."""
import argparse
import concurrent.futures
import gzip
import hashlib
import importlib.util
import importlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-frontiers-r11'
WORK=ROOT/'research/.cache/untoned-frontiers-r11'
TARGET=Path('D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html')
RATE_FIELDS=['firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions']
COSTS=[300,300,300,600,50,300]
SPECS=[
 ('U7R-ba54b6e08e04','U7E M41 · 1倍端','u7e-deeper','recovery','U7H-ba54b6e08e04'),
 ('UED-18c004bd1f31','U7E M41 · 2倍端','u7e-deeper','u7e-deeper',None),
 ('A42-4dd4e76ccb2a','U7E拆载键 M42 · 1倍端','aeo42','aeo42',None),
 ('A42-649d42a8a8af','U7E拆载键 M42 · 2倍端','aeo42','aeo42',None),
 ('U7R-143cf16e1fa2','U7R M42 · 综合候选1','restored21','restored21',None),
 ('U7R-9a7d2e90a161','U7R M42 · 综合候选2','restored21','restored21',None),
 ('RLB-d30aab69c897','RLB M42 · 1倍速度极值 · 右小指较高','joint-v52-relabel','joint-v52-relabel',None),
 ('RLB-4b5b6d5fe2d7','RLB M42 · 2倍速度极值 · 右小指较高','joint-v52-relabel','joint-v52-relabel',None),
]
def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def prefix(phase):return ROOT/('research/notes/2026-11-20-untoned-cr7e-'+phase+('' if '-v52' in phase else '-v52'))
def check(hashes):
    for p,h in hashes.items():assert sha(p)==h,p
def load_integrator():
    archive=ROOT/'research/config/untoned-2121-reviewed-integrator.py.gz'
    raw=gzip.decompress(archive.read_bytes())
    expected=read(ROOT/'research/config/u7x-02d-r11-candidate.json')['archivedIntegratorSha256'];assert hashlib.sha256(raw).hexdigest()==expected
    modulepath=WORK/'reviewed_integrator.py';modulepath.write_bytes(raw)
    spec=importlib.util.spec_from_file_location('frontiers_reviewed_integrator',modulepath);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.ROOT=ROOT
    return module
def prepare():
    WORK.mkdir(parents=True,exist_ok=True);module=load_integrator();candidates=[];sources={};reference=None
    for ident,label,phase,components_phase,alias in SPECS:
        policy_path=Path(str(prefix(phase))+'-policy-'+ident+'.json');replay_path=Path(str(prefix(phase))+'-replay-'+ident+'.json')
        policy=read(policy_path);check(policy['sourceHashes']);replay=read(replay_path);check(replay['sourceHashes'])
        components_path=Path(str(prefix(components_phase))+'-components-'+(alias or ident)+'.json.gz');components=json.loads(gzip.decompress(components_path.read_bytes()))
        assert policy['initialMap']==replay['initialMap'] and policy['finalMap']==replay['finalMap']
        if reference is None:reference=components['reference']
        assert reference==components['reference'];assert replay['audit']['D']==2 and replay['audit']['M'] in [41,42] and not replay['audit']['qz'] and not replay['audit']['zq']
        for mode in ['keytao','sanpin']:
            assert len(components['cases'][mode]['results'])==144
            for row in components['cases'][mode]['results']:
                for track in row['tracks'].values():
                    for rate in RATE_FIELDS:track.setdefault(rate,0)
                    assert abs(track['motorUpperMs']+sum(track[k]*v for k,v in zip(RATE_FIELDS,COSTS))-track['effectiveMs'])<1e-9
        components.update(id=ident,coefficients=RATE_FIELDS,baselineCostsMs=COSTS,sourceComponentsId=alias or ident,sourceComponentsSha256=sha(components_path))
        destination=Path(str(PREFIX)+'-components-'+ident+'.json.gz');destination.write_bytes(gzip.compress(json.dumps(components,separators=(',',':')).encode(),mtime=0))
        im=policy['initialMap'];fm=policy['finalMap'];state=bytes([21,21]+[module.ALPHABET.index(im[h]) for h in module.HEADS]+[module.ALPHABET.index(fm[f]) for f in module.FINALS]+[module.ALPHABET.index(k) for k in 'IVUAO']).hex()
        candidates.append(dict(id=ident,label=label,stateKey=state,initialMap=im,finalMap=fm,M=replay['audit']['M'],policySource=str(policy_path),replaySource=str(replay_path),componentSource=str(destination),optimal1x=policy['optimal1x'],optimal2x=policy['optimal2x']))
        for p in [policy_path,replay_path,components_path,destination]:sources[str(p)]=sha(p)
    config=dict(version='untoned-frontiers-r11-candidates-1',source=dict(branch=subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip(),commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()),v51KeytaoWord3='231',v51SanpinWord4='23',candidates=candidates,sourceHashes=sources)
    Path(str(PREFIX)+'-candidates.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    if not (WORK/'main-before.html').exists():shutil.copyfile(TARGET,WORK/'main-before.html')
    shutil.copyfile(WORK/'main-before.html',WORK/'columns.html')
    print(json.dumps(dict(prepared=[r['id'] for r in candidates],htmlBeforeSha256=sha(WORK/'main-before.html'))),flush=True)
def robust():
    config=read(str(PREFIX)+'-candidates.json');check(config['sourceHashes'])
    def run(c):
        output=Path(str(PREFIX)+'-robustness-'+c['id']+'.json')
        if output.exists() and read(output).get('completed') and read(output)['inputSha256']==sha(c['componentSource']):return c['id']
        env=os.environ.copy();env.update(OPENBLAS_NUM_THREADS='1',OMP_NUM_THREADS='1',MKL_NUM_THREADS='1')
        subprocess.run([sys.executable,'-X','utf8',str(ROOT/'tools/robust_untoned_v52_policy.py'),'--input',c['componentSource'],'--output',str(output)],cwd=ROOT,env=env,check=True)
        return c['id']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for ident in executor.map(run,config['candidates']):print('robust complete',ident,flush=True)
def columns():
    config=read(str(PREFIX)+'-candidates.json');check(config['sourceHashes']);module=load_integrator()
    original=module.make_entry
    def make_entry(helper,source,split,candidate):
        entry=original(helper,source,split,candidate);entry['searchMemoryNoTone']=candidate['M'];entry['searchMetrics']['M']=candidate['M'];return entry
    module.make_entry=make_entry;module.patch_production_ui=lambda html:html
    # Historical helper discovery assumes the HTML sits at a checkout root;
    # keep the scoring page private while resolving helper code in this checkout.
    production=importlib.import_module('integrate_shenyun_21x26_production');load_module=production.load_module
    def scoped_load(name,p):
        loaded=load_module(name,p)
        if Path(p).name=='integrate_shenyun_21x21_low_miss.py':
            original_helper=loaded.load_helper;loaded.load_helper=lambda benchmark:original_helper(ROOT/'a7_CKT_R11.html')
        return loaded
    production.load_module=scoped_load
    sys.argv=[str(WORK/'reviewed_integrator.py'),'--html',str(WORK/'columns.html'),'--replay',str(ROOT/'research/.cache/R11_integrated_replay'),'--candidate-file',str(PREFIX)+'-candidates.json','--audit',str(PREFIX)+'-columns.json','--fresh']
    try:module.main()
    finally:production.load_module=load_module
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('phase',choices=['prepare','robust','columns']);args=parser.parse_args();globals()[args.phase]()
if __name__=='__main__':main()
