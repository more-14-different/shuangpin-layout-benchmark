"""Reprice robust auxiliary policies at 3x cognitive costs, with point optima."""
import concurrent.futures
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
NOTES=ROOT/'research/notes'
PREFIX=NOTES/'2026-11-20-untoned-u7r-cost3'
IDS=['U7R-143cf16e1fa2','U7R-9a7d2e90a161']
FIELDS=['firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions']
COSTS=[300,300,300,600,50,300]
WEIGHTS={'character':1,'word2':3,'word3':1,'word4':1}

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,v):Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def components(p):return json.loads(gzip.decompress(Path(p).read_bytes()))

def prepare():
    for ident in IDS:
        source=NOTES/('2026-11-20-untoned-u7r-shared-r-components-'+ident+'.json.gz')
        data=components(source)
        data.update(coefficients=FIELDS,baselineCostsMs=COSTS,sourceComponentsSha256=sha(source))
        tracks=[t for kinds in data['reference'].values() for t in kinds.values()]
        tracks += [t for case in data['cases'].values() for row in case['results'] for t in row['tracks'].values()]
        for t in tracks:
            for field in FIELDS:t.setdefault(field,0)
            assert abs(t['motorUpperMs']+sum(t[f]*c for f,c in zip(FIELDS,COSTS))-t['effectiveMs'])<1e-9
        target=Path(str(PREFIX)+'-components-'+ident+'.json.gz')
        target.write_bytes(gzip.compress(json.dumps(data,separators=(',',':')).encode(),mtime=0))

def robustness():
    def run(ident):
        source=Path(str(PREFIX)+'-components-'+ident+'.json.gz')
        output=Path(str(PREFIX)+'-robustness-'+ident+'.json')
        if output.exists() and read(output).get('completed') and read(output)['inputSha256']==sha(source):return ident
        env=os.environ.copy();env.update(OPENBLAS_NUM_THREADS='1',OMP_NUM_THREADS='1',MKL_NUM_THREADS='1')
        subprocess.run([sys.executable,'-X','utf8',str(ROOT/'tools/robust_untoned_v52_policy.py'),'--input',str(source),'--output',str(output)],cwd=ROOT,env=env,check=True)
        return ident
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for ident in executor.map(run,IDS):print('robust complete',ident,flush=True)

def fourth(tracks,reference,multiplier):
    effective=lambda t:t['motorUpperMs']+multiplier*(t['effectiveMs']-t['motorUpperMs'])
    return sum(w*(effective(tracks[k])/effective(reference[k]))**4 for k,w in WEIGHTS.items())

def score(data,policies,multiplier):
    return 10*(sum(fourth(next(r['tracks'] for r in data['cases'][m]['results'] if r['policyKey']==p),data['reference'][m],multiplier) for m,p in policies.items())/12)**.25

def report():
    rows=[];sources={};baseline_reference=None
    specs=[('U7E',41,'U7R-ba54b6e08e04'),('U7E',41,'UED-18c004bd1f31')]
    specs += [('U7R-eoR',41,ident) for ident in IDS]+[('U7R-original',42,ident) for ident in IDS]
    for family,memory,ident in specs:
        p=PREFIX if family=='U7R-eoR' else NOTES/'2026-11-20-untoned-frontiers-r11'
        source=Path(str(p)+'-components-'+ident+'.json.gz');robust_path=Path(str(p)+'-robustness-'+ident+'.json')
        data=components(source);robust=read(robust_path)
        assert robust['completed'] and robust['inputSha256']==sha(source)
        if baseline_reference is None:baseline_reference=data['reference']
        else:assert baseline_reference==data['reference']
        policies=robust['selectedPolicies']
        for mode,key in policies.items():
            selected=next(r['tracks'] for r in data['cases'][mode]['results'] if r['policyKey']==key)
            assert selected==robust['selectedTracks'][mode]
        point={m:min(case['results'],key=lambda r:fourth(r['tracks'],data['reference'][m],3))['policyKey'] for m,case in data['cases'].items()}
        stable_score=score(data,policies,3);point_score=score(data,point,3)
        assert stable_score>=point_score-1e-12
        rows.append(dict(family=family,id=ident,M=memory,robustPolicies=policies,robust1x=score(data,policies,1),robust2x=score(data,policies,2),robust3x=stable_score,optimal3x=point_score,optimal3xPolicies=point,
            robustnessCriterion=robust['criterion'],scenariosPerGrid=robust['scenariosPerGrid']))
        for file in [source,robust_path]:sources[str(file)]=sha(file)
    leaders={family:min((r for r in rows if r['family']==family),key=lambda r:r['robust3x']) for family in ['U7E','U7R-eoR','U7R-original']}
    for p in [Path(__file__),ROOT/'tools/robust_untoned_v52_policy.py',ROOT/'tools/analyze_single_ckt_v51_aux_order.py']:sources[str(p)]=sha(p)
    result=dict(completed=True,contract='CKT v5.2; 3x all six cognitive costs for candidate AND S005 reference; motor unchanged; weights 1:3:1:1; members equal. Robust policies selected once on original 0.5..5.0 independent six-axis grid, not centered again at 3x. Point-3x optima shown separately.',rows=rows,leaders=leaders,sourceHashes=sources)
    write(str(PREFIX)+'-comparison.json',result)
    print(json.dumps(result,ensure_ascii=False),flush=True)

if __name__=='__main__':
    if len(sys.argv)>1:
        {'prepare':prepare,'robust':robustness,'report':report}[sys.argv[1]]()
    else:
        prepare();robustness();report()
