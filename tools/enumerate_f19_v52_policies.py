"""Factorized native v5.2 enumeration, independently checked against full JS.

Native routing has one code per stage. Frequency and stable ID order select
first choices; costs do not change routes. Character, third-word, and combined
second/fourth-word pools are independent, so 31 competitions cover 144 policies.
"""
import argparse
import concurrent.futures
import gzip
import itertools
import json
from pathlib import Path
import time

import numba
import numpy as np
from ckt_v52_toned_kernel import load_tables

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'research/.cache/f19-v52-audit'
PREFIX=ROOT/'research/notes/2026-11-19-f19-v52-production-audit'
KINDS=['character','word2','word3','word4']
FIELDS=['motorUpperMs','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions','meanKeys']


def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


@numba.njit(nogil=True)
def motor_cost(indices,length,motor,errors):
    pair=indices[0]*30+indices[1]
    if length==2:return motor[0][pair]
    if length==3:
        triple=pair*30+indices[2]
        return motor[1][triple]+motor[2][triple]
    first_triple=pair*30+indices[2]
    last_triple=(indices[length-3]*30+indices[length-2])*30+indices[length-1]
    value=motor[3][first_triple]+motor[5][last_triple]
    rolling_error=errors[3][first_triple]+errors[5][last_triple]
    for start in range(length-3):
        window=((indices[start]*30+indices[start+1])*30+indices[start+2])*30+indices[start+3]
        value+=motor[4][window];rolling_error+=errors[4][window]
    if length>4:
        first=errors[3][first_triple];middle=errors[4][first_triple*30+indices[3]]
        last=errors[5][(indices[1]*30+indices[2])*30+indices[3]]
        tail=errors[0][indices[3]*30+indices[4]] if length==5 else 1-(1-errors[1][last_triple])*(1-errors[2][last_triple])
        value+=782.2*(first+middle+last+(1-first)*(1-middle)*(1-last)*tail-rolling_error)
    return value


@numba.njit(nogil=True)
def competition(rows,physical,orders,mask,motor,errors,record_loads=False):
    bucket_codes=np.zeros(1048576,np.int64);bucket_counts=np.zeros(1048576,np.int32)
    totals=np.zeros((4,10));weights=np.zeros(4);counts=np.zeros(4,np.int64)
    indices=np.zeros(6,np.int64);key_loads=np.zeros((4,30));transitions=np.zeros((4,2))
    fingers=np.array([0,3,2,2,2,3,3,6,7,6,7,8,6,6,8,9,0,3,1,3,6,3,1,1,6,0,-1,-1,-1,-1])
    for row in rows:
        kind,weight,base_length=row[0],row[1],row[2]
        if not (mask & (1<<kind)):continue
        for j in range(base_length):indices[j]=physical[row[3+j]]
        aux_length=3 if kind==2 else 2
        for j in range(aux_length):indices[base_length+j]=row[7+orders[kind,j]]
        pool=1 if kind==0 else (2 if kind==2 else 3)
        packed=pool
        for j in range(base_length+aux_length):
            packed=packed*32+indices[j]
            if j+1>=base_length:
                slot=((packed*2654435761)^(packed>>12))&1048575
                while bucket_codes[slot]!=0 and bucket_codes[slot]!=packed:slot=(slot+1)&1048575
                bucket_codes[slot]=packed;bucket_counts[slot]+=1;rank=bucket_counts[slot]
                if rank==1 or j+1==base_length+aux_length:break
        length=j+1;aux=length-base_length
        totals[kind,0]+=weight*motor_cost(indices,length,motor,errors)
        totals[kind,1]+=weight*(aux>=1);totals[kind,2]+=weight*(aux>=2);totals[kind,3]+=weight*(aux>=3)
        totals[kind,4]+=weight*(rank>1);totals[kind,5]+=weight*(rank-1);totals[kind,6]+=weight*((rank-1)//6)
        totals[kind,7]+=weight*length
        for key in indices[:length]:
            if key==16 or key==0 or key==25:totals[kind,8]+=weight
            if key==15:totals[kind,9]+=weight
            if record_loads:key_loads[kind,key]+=weight
        if record_loads:
            transitions[kind,0]+=weight*(length-1)
            for j in range(1,length):
                if indices[j-1]!=indices[j] and fingers[indices[j-1]]==fingers[indices[j]]:
                    transitions[kind,1]+=weight
        weights[kind]+=weight;counts[kind]+=1
    return totals,weights,counts,key_loads,transitions


def physical_keys(layout,metadata):
    if len(layout['tonedCodes'])!=len(metadata['symbols']):raise ValueError('toned inventory mismatch')
    physical=np.full(80,-1,np.int64)
    for code,symbols in zip(layout['tonedCodes'],metadata['symbols'],strict=True):
        for char,symbol in zip(code,symbols,strict=True):
            value=ord(char)-65
            if physical[symbol] not in [-1,value]:raise ValueError('layout splits a frozen sound atom')
            physical[symbol]=value
    return physical


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--workers',type=int,default=4)
    args=parser.parse_args()
    candidates=read(str(PREFIX)+'-candidates.json');metadata=read(WORK/'policy-templates.json')
    if metadata['tokenKeys']!=candidates['tokenKeys']:raise ValueError('template inventory differs')
    rows=np.fromfile(WORK/'policy-templates.bin',np.int32).reshape(-1,11)
    motor=load_tables(ROOT/'tools/ckt_v4_upstream_role_tables.json','tables')
    errors=load_tables(ROOT/'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json','errorTables')
    reference=read(ROOT/'research/notes/2026-11-18-ckt-v52-all-schemes.json')['references']['v52']['keytao']
    denominators=np.array([reference[k]['effectiveMs'] for k in KINDS])
    pairs2=['12','21'];thirds=[''.join(p) for p in itertools.permutations('123')]
    pairs4=[''.join(p) for p in itertools.permutations('1234',2)]
    def orders(p2='21',p3='213',p4='14'):
        a=np.zeros((4,3),np.int64);a[0,:2]=[0,1]
        for kind,text in [(1,p2),(2,p3),(3,p4)]:a[kind,:len(text)]=[int(x)-1 for x in text]
        return a
    def part(layout,order,mask):
        totals,weights,counts=competition(rows,physical_keys(layout,metadata),order,mask,motor,errors)[:3]
        result={}
        for i,kind in enumerate(KINDS):
            if not weights[i]:continue
            values=totals[i]/weights[i]
            metric=dict(zip(FIELDS,values[:8]));metric.update(count=int(counts[i]),totalWeight=float(weights[i]),
                effectiveMs=float(values[0]+300*sum(values[1:4])+600*values[4]+50*values[5]+300*values[6]))
            result[kind]=(metric,float(totals[i,8]/totals[i,7]),float(totals[i,9]/totals[i,7]))
        return result
    def evaluate(layout):
        chars=part(layout,orders(),1)
        three={p:part(layout,orders(p3=p),4) for p in thirds}
        pairs={(p2,p4):part(layout,orders(p2=p2,p4=p4),10) for p2 in pairs2 for p4 in pairs4}
        policies=[]
        for p2,p3,p4 in itertools.product(pairs2,thirds,pairs4):
            combined={**chars,**three[p3],**pairs[p2,p4]}
            tracks={kind:combined[kind][0] for kind in KINDS}
            score=10*np.average((np.array([tracks[k]['effectiveMs'] for k in KINDS])/denominators)**4,weights=[1,3,1,1])**.25
            policies.append(dict(policy=dict(word2=p2,word3=p3,word4=p4),score=float(score),tracks=tracks,
                pinky=max(x[1] for x in combined.values()),rightPinky=max(x[2] for x in combined.values())))
        return dict(id=layout['id'],policies=policies,policyCount=144,cohortEqualityVerified=True,
                    defaultBest=min(policies,key=lambda r:r['score']))
    started=time.monotonic()
    # Compile once before releasing concurrent native work.
    part(candidates['layouts'][0],orders(),1)
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        for result in executor.map(evaluate,candidates['layouts']):
            results.append(result)
            print(result['id'],result['defaultBest']['score'],result['defaultBest']['policy'],flush=True)
    native_path=Path(str(PREFIX)+'-native-policies.json.gz')
    native=json.loads(gzip.decompress(native_path.read_bytes())) if native_path.exists() else read(ROOT/'research/.cache/f19-v52-native-checks.json')
    by_id={r['id']:r for r in results};maximum=0.
    for independent in native['results']:
        actual=by_id[independent['id']]
        native_by_policy={tuple(r['policy'][k] for k in ['word2','word3','word4']):r for r in independent['policies']}
        for a in actual['policies']:
            b=native_by_policy[tuple(a['policy'][k] for k in ['word2','word3','word4'])]
            maximum=max(maximum,abs(a['score']-b['score']))
            for kind in KINDS:
                for field in FIELDS:
                    if abs(a['tracks'][kind][field]-b['tracks'][kind][field])>1e-7:
                        raise ValueError(f'native component mismatch {actual["id"]}/{kind}/{field}')
        if abs(actual['defaultBest']['score']-independent['bestStandard']['score'])>1e-9:raise ValueError('native best mismatch')
    if maximum>1e-9:raise ValueError('native score mismatch')
    production=by_id['current-production'];policy=candidates['layouts'][-1]['wordAuxiliaryPolicy']
    actual=next(r for r in production['policies'] if r['policy']==policy)['score']
    if abs(actual-candidates['layouts'][-1]['expectedV52'])>1e-9:raise ValueError('production anchor mismatch')
    payload=dict(version='f19-v52-all-144-policies-v1',reference=dict(tracks=reference),cktVersion='v52',
        templateSha256=metadata['sha256'],elapsedSeconds=time.monotonic()-started,
        independentNativeChecks=dict(layouts=len(native['results']),policies=144*len(native['results']),maximumScoreDifference=maximum),results=results)
    target=Path(str(PREFIX)+'-policies.json.gz')
    target.write_bytes(gzip.compress((json.dumps(payload,separators=(',',':'))+'\n').encode(),mtime=0))
    print('verified',payload['independentNativeChecks'],'seconds',payload['elapsedSeconds'],flush=True)


if __name__=='__main__':main()
