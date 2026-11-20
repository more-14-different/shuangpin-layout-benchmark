"""Screen frozen fixed-U7E M41 states using the exact R11 20-track load matrix."""
import hashlib
import json
from pathlib import Path
import sqlite3
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-21-u7e-low-pinky'
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def main():
    cfg_path=ROOT/'research/config/u7e-fixed-gpu.json';cfg=read(cfg_path)
    meta_path=ROOT/'research/.cache/R11_integrated_replay/model_meta.json';meta=read(meta_path)
    loads_path=ROOT/'research/.cache/R11_integrated_replay/r4_token_loads.json';loads=read(loads_path)
    mass=np.asarray([loads[t]['mass'] for t in meta['tracks']]);shares=mass/mass.sum(axis=1)[:,None]
    baseline_path=Path(str(PREFIX)+'-baselines.json');baselines=read(baseline_path)
    for ref in baselines['rows']:
        mask=np.asarray([ref['initialMap'][h]=='P' for h in meta['heads']]+[ref['finalMap'][f]=='P' for f in meta['finals']]+[False]*5)
        assert abs(float((shares@mask).max())-ref['legacy']['rightPinkyMax20'])<1e-12
    policy=cfg['policies'];known={};sources={};counts=[]
    names=['2026-11-20-untoned-cr7e-u7e-deeper-v52.json','2026-11-20-untoned-cr7e-u7e-fair-restored21-v52.json','2026-11-20-untoned-cr7e-recovery-v52.json','2026-11-21-u7e-openqz-v52.json']
    for name in names:
        p=ROOT/'research/notes'/name;r=read(p);assert r.get('policy',r.get('contract',{}).get('policy'))==policy
        accepted=0
        for row in r['states'].values():
            im=row.get('initialMap',r.get('initialMap',r.get('contract',{}).get('initialMap')))
            if im!=cfg['initialMap'] or row['audit']['M']!=41 or row['audit']['actual']!=[21,21]:continue
            fm=row['finalMap'];key=''.join(fm[f] for f in cfg['finalNames'])
            known.setdefault(key,dict(id=row['id'],finalMap=fm,score=row['score'],doubledScore=row['doubledScore'],source=str(p)))
            accepted+=1
        counts.append(dict(file=name,accepted=accepted));sources[str(p)]=sha(p)
    db=ROOT/'research/.cache/u7e-fixed-gpu-20261120/search.sqlite';conn=sqlite3.connect(f'file:{db.as_posix()}?mode=ro',uri=True)
    for key,s1,s2 in conn.execute('SELECT k,score1,score2 FROM states'):
        fm=dict(zip(cfg['finalNames'],key));known.setdefault(key,dict(id='U7G-'+hashlib.sha256(bytes(cfg['initialKeys']+[ord(c)-65 for c in key])).hexdigest()[:12],finalMap=fm,score=s1,doubledScore=s2,source=str(db)))
    conn.close();rows=list(known.values());masks=np.zeros((len(rows),67));masks[:,:27]=[cfg['initialMap'][h]=='P' for h in meta['heads']]
    for i,row in enumerate(rows):masks[i,27:62]=[row['finalMap'][f]=='P' for f in cfg['finalNames']]
    tracks=masks@shares.T;selected={};frontiers=[]
    for i,row in enumerate(rows):
        row['rightPinky20']=float(tracks[i].max());row['rightPinky20Track']=meta['tracks'][int(np.argmax(tracks[i]))]
        codes={chr(cfg['initialKeys'][h]+65)+row['finalMap'][cfg['finalNames'][f]] for h,f in cfg['commonPairs']};row['qzEmpty']='QZ' not in codes;row['zqEmpty']='ZQ' not in codes
    for empty in [False,True]:
        for threshold in [.04,.04749769054254873,.05,.06,.081]:
            eligible=[r for r in rows if r['rightPinky20']<=threshold+1e-12 and (not empty or r['qzEmpty'] and r['zqEmpty'])]
            if not eligible:continue
            leaders=[]
            for axis in ['score','doubledScore']:
                best=min(eligible,key=lambda r:r[axis]);selected[best['id']]=best;leaders.append(dict(axis=axis,id=best['id'],score=best[axis],rightPinky20=best['rightPinky20']))
            frontiers.append(dict(requireEmptyBuckets=empty,threshold=threshold,eligible=len(eligible),leaders=leaders))
    for p in [Path(__file__),cfg_path,meta_path,loads_path,baseline_path,ROOT/'research/notes/2026-11-21-u7e-gpu-close-checkpoint.sqlite.gz']:
        sources[str(p)]=sha(p)
    output=dict(completed=True,initialMap=cfg['initialMap'],fixedPolicy=policy,uniqueStates=len(rows),sourceCounts=counts,referenceRightPinky20=baselines['rows'][0]['legacy']['rightPinkyMax20'],frontiers=frontiers,selected=list(selected.values()),
        scope='Exact historical 20-contract right-pinky peak, not the current CKT 8-track load. All cached scores use keytao12/231/24 sanpin12/213/23; excludes earlier incompatible policy caches. Both bucket-constrained and unconstrained tiers reported. Not a new exhaustive layout search.',sourceHashes=sources)
    Path(str(PREFIX)+'-screen.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print('Unique',len(rows))
    for tier in frontiers:print(json.dumps(tier))

if __name__=='__main__':main()
