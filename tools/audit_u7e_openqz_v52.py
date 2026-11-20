"""Independent reconstruction of fixed-U7E open-bucket search coverage."""
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-21-u7e-openqz-v52'
sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
import memory_r2

def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def neighbors(names,base):
    groups={}
    for f in names:groups.setdefault(base[f],[]).append(f)
    for i,a in enumerate(names):
        for b in names[i+1:]:
            if base[a]!=base[b]:yield {**base,a:base[b],b:base[a]}
    items=list(groups.items())
    for i,(ka,aa) in enumerate(items):
        for kb,bb in items[i+1:]:
            if len(aa)==len(bb)==1:continue
            yield {f:kb if f in aa else ka if f in bb else base[f] for f in names}
    for f in names:
        for k in 'BCDEFGHJKLMNPQRSTWXYZ':
            if k!=base[f]:yield {**base,f:k}

def main():
    report=read(str(PREFIX)+'.json');assert report['completed']
    for p,h in report['sourceHashes'].items():assert sha(p)==h,p
    cfg=read(ROOT/'research/config/u7e-fixed-gpu.json');names=cfg['finalNames']
    assert cfg['initialMap']==report['contract']['initialMap']
    pairs=cfg['commonPairs'];im=cfg['initialKeys']
    def key(fm):return ''.join(fm[f] for f in names)
    def legal(fm):return set(fm.values())==set('BCDEFGHJKLMNPQRSTWXYZ') and 6+sum(fm[f]!=f.upper() for f in names)==41
    def occupied(fm):
        codes={chr(im[h]+65)+fm[names[f]] for h,f in pairs}
        return 'QZ' in codes,'ZQ' in codes,len(codes)
    known={key(r['finalMap']):r for r in report['states'].values()};assert len(known)==len(report['states'])
    for row in known.values():
        assert legal(row['finalMap'])
        qz,zq,unique=occupied(row['finalMap'])
        a=row['audit'];assert (qz,zq,unique)==(a['qz'],a['zq'],a['unique'])
        assert a['M']==41 and a['D']==2 and a['valid'] and a['branches']==0 and a['actual']==[21,21]
    coverage=[]
    for stage in report['stages']:
        center=report['states'][stage['center']]
        candidates={key(fm):fm for fm in neighbors(names,center['finalMap']) if legal(fm)}
        assert len(candidates)==stage['legalUnique']
        assert all(k in known for k in candidates)
        added=sum(any(occupied(fm)[:2]) for fm in candidates.values())
        assert added==stage['newlyAdmittedByBucketRelaxation']
        coverage.append(dict(center=center['id'],legalUnique=len(candidates),newlyAdmitted=added,missing=0))
    assert len(report['chains'])==4 and all(c['steps']==500 for c in report['chains'])
    prior=read(ROOT/'research/notes/2026-11-19-untoned-cr7e-v52-verification.json')['auditInput']
    finalists={r['id']:r for r in [report['best1'][0],report['best2'][0]]}
    audits=[]
    for row in finalists.values():
        codes=[None]*len(prior['pinyin'])
        for (p,_),(h,f) in zip(prior['base'],pairs):codes[p]=chr(im[h]+65)+row['finalMap'][names[f]]
        audit=memory_r2.audit(prior,dict(codeList=codes,capacity=[21,21]))
        assert audit['M']==41 and audit['ordinaryDisplacedCount']==2 and audit['coverage']==399 and audit['branchCount']==0
        policy=read(str(PREFIX)+'-policy-'+row['id']+'.json');assert policy['completed']
        for p,h in policy['sourceHashes'].items():assert sha(p)==h,p
        audits.append(dict(id=row['id'],M=audit['M'],D=audit['ordinaryDisplacedCount'],coverage=audit['coverage'],unique=audit['unique'],branches=0,optimalScores=[r['score'] for r in policy['optima']]))
    files=[Path(__file__),Path(str(PREFIX)+'.json'),ROOT/'research/config/u7e-fixed-gpu.json',ROOT/'research/.cache/R11_integrated_replay/memory_r2.py',ROOT/'research/.cache/R11_integrated_replay/audit.py',*[Path(str(PREFIX)+'-policy-'+ident+'.json') for ident in finalists]]
    out=dict(completed=True,states=len(known),occupiedStates=report['newlyOccupiedStates'],coverage=coverage,annealingChains=[dict(index=c['index'],steps=c['steps'],accepted=c['accepted']) for c in report['chains']],independentMemoryAudit=audits,sourceHashes={str(p):sha(p) for p in files})
    Path(str(PREFIX)+'-verification.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(out,ensure_ascii=False))

if __name__=='__main__':main()
