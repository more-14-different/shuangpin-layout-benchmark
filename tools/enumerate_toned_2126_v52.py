"""Native 21x26 shared-pool/soft-page-fill routing, compiled without proxies.

Whole three-word residuals share 4/5/6-key pools with 2/4-word rows. The
120-candidate blocks and six-slot soft page balancing match ckt_v4_model.js.
"""
import argparse
import concurrent.futures
import gzip
import hashlib
import itertools
import json
from pathlib import Path
import time

import numba
import numpy as np
from enumerate_f19_v52_policies import motor_cost, load_tables, FIELDS, KINDS

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52'
WORK=ROOT/'research/.cache/toned-2126-v52'


@numba.njit(nogil=True)
def balanced(ids,n,rows):
    result=np.empty(n,np.int64);out=0
    for offset in range(0,n,120):
        size=min(120,n-offset);remaining=ids[offset:offset+size].copy()
        while size:
            page=min(6,size);available=np.zeros(3,np.int64)
            for i in range(size):available[rows[remaining[i],0]-1]+=1
            targets=np.zeros(3,np.int64)
            for _ in range(page):
                chosen=-1
                for g in range(3):
                    if targets[g]<available[g] and (chosen<0 or targets[g]<targets[chosen]):chosen=g
                if chosen>=0:targets[chosen]+=1
            selected=np.zeros(size,np.bool_);counts=np.zeros(3,np.int64)
            for i in range(page):selected[i]=True;counts[rows[remaining[i],0]-1]+=1
            for needed in range(3):
                while counts[needed]<targets[needed]:
                    replacement=-1
                    for i in range(page,size):
                        if not selected[i] and rows[remaining[i],0]-1==needed:replacement=i;break
                    if replacement<0:break
                    displaced=-1
                    for i in range(page-1,-1,-1):
                        g=rows[remaining[i],0]-1
                        if selected[i] and counts[g]>targets[g]:displaced=i;break
                    if displaced<0:break
                    counts[rows[remaining[displaced],0]-1]-=1;counts[needed]+=1
                    selected[displaced]=False;selected[replacement]=True
            at=0
            for i in range(size):
                if selected[i]:result[out]=remaining[i];out+=1
                else:remaining[at]=remaining[i];at+=1
            size=at
    return result


@numba.njit(nogil=True)
def competition(rows,codes,orders,motor,errors):
    n=len(rows);indices=np.zeros((n,6),np.int64);finished=np.zeros(n,np.bool_)
    for i in range(n):
        kind=rows[i,0]
        if kind==0:
            t=rows[i,2];indices[i,0]=codes[t,0];indices[i,1]=codes[t,1]
            indices[i,2]=rows[i,6];indices[i,3]=rows[i,7]
        elif kind==1:
            for j in range(2):
                t=rows[i,2+j];indices[i,j*2]=codes[t,0];indices[i,j*2+1]=codes[t,1]
        else:
            for j in range(kind+1):indices[i,j]=codes[rows[i,2+j],0]
            if kind==2:indices[i,3]=codes[rows[i,4],1]
        if kind:
            indices[i,4]=rows[i,6+orders[kind,0]];indices[i,5]=rows[i,6+orders[kind,1]]
    totals=np.zeros((4,8));weights=np.zeros(4);counts=np.zeros(4,np.int64)
    next_row=np.empty(n,np.int64);visited=np.empty(n,np.int64);bucket_rows=np.empty(n,np.int64)
    for length in range(2,7):
        keys=np.zeros(1048576,np.int64);heads=np.full(1048576,-1,np.int64);tails=np.empty(1048576,np.int64);nv=0
        for i in range(n):
            kind=rows[i,0];start=2 if kind==0 else (3 if kind==2 else 4)
            if finished[i] or length<start:continue
            packed=1 if kind==0 else 2
            for j in range(length):packed=packed*32+indices[i,j]
            slot=((packed*2654435761)^(packed>>12))&1048575
            while keys[slot]!=0 and keys[slot]!=packed:slot=(slot+1)&1048575
            if keys[slot]==0:
                keys[slot]=packed;heads[slot]=i;visited[nv]=slot;nv+=1
            else:next_row[tails[slot]]=i
            tails[slot]=i;next_row[i]=-1
        for b in range(nv):
            slot=visited[b];i=heads[slot];size=0
            while i>=0:bucket_rows[size]=i;size+=1;i=next_row[i]
            # Character pools are separate and contain no word-length groups.
            word=rows[bucket_rows[0],0]!=0
            ranked=balanced(bucket_rows,size,rows) if word and length>=4 and size>1 else bucket_rows[:size]
            for rank in range(size):
                i=ranked[rank];kind=rows[i,0];last=4 if kind==0 else 6
                if rank>0 and length<last:continue
                finished[i]=True;weight=rows[i,1];aux=max(0,length-(2 if kind==0 else 4))
                totals[kind,0]+=weight*motor_cost(indices[i],length,motor,errors)
                totals[kind,1]+=weight*(aux>=1);totals[kind,2]+=weight*(aux>=2)
                totals[kind,4]+=weight*(rank>0);totals[kind,5]+=weight*rank
                totals[kind,6]+=weight*(rank//6);totals[kind,7]+=weight*length
                weights[kind]+=weight;counts[kind]+=1
    return totals,weights,counts


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--workers',type=int,default=2)
    p.add_argument('--main',type=Path,default=ROOT.parent/'shuangpin-layout-benchmark');args=p.parse_args()
    bundle=json.loads(Path(str(PREFIX)+'-candidates.json').read_text(encoding='utf8'))
    metadata=json.loads((WORK/'templates.json').read_text(encoding='utf8'))
    data=(WORK/'templates.bin').read_bytes()
    if hashlib.sha256(data).hexdigest()!=metadata['sha256']:raise ValueError('template drift')
    rows=np.frombuffer(data,np.int32).reshape(-1,10)
    motor=load_tables(ROOT/'tools/ckt_v4_upstream_role_tables.json','tables')
    errors=load_tables(args.main/'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json','errorTables')
    reference=metadata['reference']['tracks'];den=np.array([reference[k]['effectiveMs'] for k in KINDS])
    pairs=lambda n:[''.join(p) for p in itertools.permutations('1234'[:n],2)]
    policies=[dict(zip(KINDS[1:],p)) for p in itertools.product(pairs(2),pairs(3),pairs(4))]
    def evaluate(layout):
        started=time.monotonic();codes=np.array([[ord(c)-65 for c in code] for code in layout['tonedCodes']],np.int64);result=[]
        for policy in policies:
            order=np.zeros((4,2),np.int64)
            for i,k in enumerate(KINDS[1:],1):order[i]=[int(c)-1 for c in policy[k]]
            totals,weights,counts=competition(rows,codes,order,motor,errors)
            tracks={}
            for i,k in enumerate(KINDS):
                v=totals[i]/weights[i];t={f:float(x) for f,x in zip(FIELDS,v,strict=True)}
                t.update(count=int(counts[i]),totalWeight=float(weights[i]),effectiveMs=float(v[0]+300*sum(v[1:4])+600*v[4]+50*v[5]+300*v[6]));tracks[k]=t
            score=10*np.average((np.array([tracks[k]['effectiveMs'] for k in KINDS])/den)**4,weights=[1,3,1,1])**.25
            result.append(dict(policy=policy,score=float(score),tracks=tracks))
        print(layout['id'],'144 policies',round(time.monotonic()-started,2),'seconds',flush=True)
        return dict(id=layout['id'],policies=result,defaultBest=min(result,key=lambda r:r['score']),publishedAnchor=next(r for r in result if r['policy']==layout['wordAuxiliaryPolicy']))
    # Compile once, then release GIL for two bounded CPU workers.
    zero=np.zeros((4,2),np.int64);zero[:,1]=1
    competition(rows[:20],np.array([[ord(c)-65 for c in code] for code in bundle['layouts'][0]['tonedCodes']],np.int64),zero,motor,errors)
    output=Path(str(PREFIX)+'-policies.json.gz');previous=json.loads(gzip.decompress(output.read_bytes()))
    if previous['results'][0]['id']!='A':raise ValueError('requires full JavaScript A enumeration as independent anchor')
    anchor=previous['results'][0];results=[];maximum=0.;started=time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for value in pool.map(evaluate,bundle['layouts']):
            if value['id']=='A':
                for a,b in zip(value['policies'],anchor['policies'],strict=True):
                    if a['policy']!=b['policy']:raise ValueError('policy order differs')
                    maximum=max(maximum,abs(a['score']-b['score']))
                    for k in KINDS:
                        for f in a['tracks'][k]:
                            if abs(a['tracks'][k][f]-b['tracks'][k][f])>1e-7:raise ValueError('JS parity '+k+'/'+f)
                if maximum>1e-9:raise ValueError('JS score parity')
            results.append(value)
    result=dict(version='toned-2126-v52-144-policies-v1',reference=dict(tracks=reference),sourceHashes=metadata['sourceHashes'],
        templateSha256=metadata['sha256'],compiledKernelSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        independentFastJsAll144=dict(id='A',maximumScoreDifference=maximum),elapsedSeconds=time.monotonic()-started,results=results,complete=True)
    output.write_bytes(gzip.compress((json.dumps(result,separators=(',',':'))+'\n').encode(),mtime=0))
    print('complete',len(results),'layouts; maximum independent JS difference',maximum,flush=True)


if __name__=='__main__':main()
