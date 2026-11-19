"""Refine R2 at doubled cognitive costs, with explicit unified zero carriers.

Actual M<=18/21, D<=2, 21 first keys, 10/9/7 tone rows; pinkies diagnostic.
Exhaust carrier x 144 policies and carrier x one root transfer/swap at R2.
Also check R2's root/key compounds and a bounded two-hop neighborhood. Close
full single neighborhoods for the best free carrier and N-carrier results.
"""
import argparse
import concurrent.futures
import dataclasses
import gzip
import hashlib
import itertools
import json
from pathlib import Path
import time

from refine_toned_2126_v52_r1_coupled import Context,State,ROOT,ROWS,PREFIX as R1,load_cache as old_cache,root_changes
from refine_toned_2126_v52_m4 import PREFIX as M4,root_key_pairs
from toned_2126_v52_score_archives import score_archives
from check_toned_2126_v52_seed_neighbors import read,write,sha

PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52-r2-refine'
WORK=ROOT/'research/.cache/toned-2126-v52-r2-refine'


def load_cache():
    cache=old_cache()
    for archive in score_archives(R1):
        with gzip.open(archive,'rt',encoding='utf8') as stream:
            for line in stream:
                row=json.loads(line);row['eligible']=True;cache[State.load(row['state'])]=row
    for result in json.loads(gzip.decompress(Path(str(R1)+'-policies.json.gz').read_bytes()))['results']:
        for row in result['policies']:cache[State.load(row['state'])]=row
    return cache


def carrier_state(ctx,s,key):
    first=list(s.first)
    for i in ctx.aeo:first[i]=key
    return dataclasses.replace(s,first=tuple(first))


def carrier_policy_moves(ctx,s):
    pairs=lambda n:map(''.join,itertools.permutations('1234'[:n],2))
    policies=list(itertools.product(pairs(2),pairs(3),pairs(4)));moves={}
    for key in ctx.keys:
        t=carrier_state(ctx,s,key)
        for policy in policies:
            v=dataclasses.replace(t,policy=policy)
            if ctx.legal(v):moves[v]=dict(kind='unified-carrier-plus-policy',key=key,policy=policy)
    return moves


def carrier_root_moves(ctx,s):
    roots={s.partition:dict(kind='unchanged-root-partition'),**root_changes(s)};moves={}
    for key in ctx.keys:
        t=carrier_state(ctx,s,key)
        for partition,move in roots.items():
            v=dataclasses.replace(t,partition=partition)
            if ctx.legal(v):moves[v]=dict(kind='unified-carrier-plus-root',key=key,rootMove=move)
    return moves


def export(ctx,report):
    choices=[('original-R2',report['baseline']),('N-carrier-best-policy-only',report['carrierScreen']['N']['bestDouble'])]
    choices += [(r['name'],r['result']) for r in report['routes']]
    layouts=[]
    for label,value in choices:
        s=State.load(value['state']);codes=ctx.expand(s);ident='T2126-V52-R2-'+hashlib.sha256(codes.tobytes()).hexdigest()[:12]
        same=next((l for l in layouts if l['id']==ident and l['policy']==list(s.policy)),None)
        if same:same['originRoutes'].append(label);continue
        finals={f:s.partition[r] for f,r in ctx.final_roots.items()}
        layouts.append(dict(id=ident,originRoutes=[label],policy=list(s.policy),shapeKeysByMeaning='AEUIO',toneRowsByTone=ctx.tone_rows,
            tonedCodes=[''.join(chr(65+x) for x in row) for row in codes],firstKeys=dict(zip(ctx.names,s.first)),finalGroups=finals,regionMaps=s.maps,
            rhymeGroups=[dict(roots=[ctx.roots[i] for i,g in enumerate(s.partition) if g==group],finals=[f for f,g in finals.items() if g==group]) for group in range(10)],
            **{k:value[k] for k in ['score','doubleScore','tracks','ergonomics','memoryLower','memoryGuard','D']}))
    write(Path(str(PREFIX)+'-finalists.json'),dict(tokenKeys=ctx.token_keys,layouts=layouts))


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--workers',type=int,default=8)
    p.add_argument('--main',type=Path,default=ROOT.parent/'shuangpin-layout-benchmark');a=p.parse_args()
    WORK.mkdir(parents=True,exist_ok=True);ctx=Context(a.main);cache=load_cache();imported=len(cache)
    paths=[Path(__file__),Path(str(M4)+'-finalists.json'),Path(str(R1)+'-scores-index.json')]+score_archives(R1)
    ctx.hashes.update({str(f):sha(f) for f in paths})
    layout=next(l for l in read(str(M4)+'-finalists.json')['layouts'] if 'double' in l['originRoutes'])
    seed=dataclasses.replace(ctx.state(layout),policy=tuple(layout['policy']));base=ctx.calculate(seed)
    for field in ['score','doubleScore']:
        if abs(base[field]-cache[seed][field])>1e-10:raise ValueError('R2 replay drift '+field)
    output=Path(str(PREFIX)+'.json');log=WORK/'scores.jsonl'
    report=dict(version='r2-unified-carrier-coupled-v1',complete=False,hashes=ctx.hashes,
        contract=dict(MlowerMaximum=18,MguardMaximum=21,Dmaximum=2,pinkyConstraint='none',leftPinkyMaximum=1.,rowCounts=[10,9,7],actualFirstKeys=21,
            shapeKeysByMeaning='AEUIO',toneKeysByTone='IEUAO',toneDigitsByShapeMeaning='42310'),baseline=base,
        extraSourcePaths=['tools/refine_toned_2126_v52_r2.py','tools/report_toned_2126_v52_r2.py'],importedEvaluations=imported,stages=[],routes=[],carrierScreen={})
    if output.exists():
        report=read(output)
        if report['hashes']!=ctx.hashes:raise ValueError('source changed')
        if report['complete']:print('Already complete');return
    if log.exists():
        for line in log.read_text(encoding='utf8').splitlines():
            r=json.loads(line);cache[State.load(r['state'])]=r
    started=time.monotonic();stream=log.open('a',encoding='utf8');write(output,report)
    def batch(moves,pool):
        missing=[s for s in moves if s not in cache];print('batch',len(moves),'new',len(missing),flush=True)
        for s,row in zip(missing,pool.map(ctx.calculate,missing),strict=True):
            cache[s]=row;stream.write(json.dumps(row,separators=(',',':'))+'\n')
            if (len(cache)-imported)%400==0:stream.flush();print('new exact',len(cache)-imported,flush=True)
        stream.flush();return [cache[s] for s in moves]
    def stage(name,moves,pool,extra=None):
        if any(r['name']==name for r in report['stages']):return
        values=batch(moves,pool)
        result=dict(name=name,states=len(moves),bestDefault=min(r['score'] for r in values),bestDouble=min(r['doubleScore'] for r in values),**(extra or {}))
        report['stages'].append(result);write(output,report);print('stage',result,flush=True)
    def feasible(s,r,route):
        return ctx.valid(s) and (route['name']!='double-N-carrier' or all(s.first[i]=='N' for i in ctx.aeo))
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
        screen=carrier_policy_moves(ctx,seed);stage('R2-all-unified-carriers-all-144-policies',screen,pool)
        for key in ctx.keys:
            values=[cache[s] for s in screen if all(s.first[i]==key for i in ctx.aeo)]
            if not values:continue
            report['carrierScreen'][key]=dict(bestDefault=min(values,key=lambda r:r['score']),bestDouble=min(values,key=lambda r:r['doubleScore']))
        write(output,report)
        for key in ['R','N']:
            result=report['carrierScreen'][key]['bestDouble'];print('CARRIER',key,result['score'],result['doubleScore'],result['state']['policy'],flush=True)
        singles=ctx.joint_neighbors(seed,2);stage('R2-single-neighborhood',singles,pool)
        stage('R2-carrier-plus-one-root-change',carrier_root_moves(ctx,seed),pool)
        stage('R2-root-plus-related-key-change',root_key_pairs(ctx,seed),pool)
        chosen={}
        for kind in sorted({move['kind'] for move in singles.values()}):
            members=[s for s,m in singles.items() if m['kind']==kind]
            first=min(members,key=lambda s:cache[s]['doubleScore']);chosen.setdefault(first,[]).append(kind)
        chosen.setdefault(carrier_state(ctx,seed,'N'),[]).append('explicit-N-carrier')
        twohop={}
        for first,kinds in chosen.items():
            for second,move in ctx.joint_neighbors(first,2).items():twohop.setdefault(second,dict(kind='bounded-two-hop',firstState=dataclasses.asdict(first),selection=kinds,secondMove=move))
        stage('R2-bounded-two-hop-double-objective',twohop,pool,dict(centers=len(chosen),centerStates=[dict(state=dataclasses.asdict(s),selection=k) for s,k in chosen.items()]))
        while True:
            changed=False
            for name in ['double-free-carrier','double-N-carrier']:
                route=next((r for r in report['routes'] if r['name']==name),None)
                if route is None:
                    route=dict(name=name,objective='doubleScore',passes=[],history=[],complete=False);report['routes'].append(route)
                value=min((r for s,r in cache.items() if feasible(s,r,route)),key=lambda r:r['doubleScore'])
                if route['complete'] and value['doubleScore']>=route['result']['doubleScore']-1e-10:continue
                changed=True
                route['history'].append(dict(state=value['state'],score=value['score'],doubleScore=value['doubleScore'],move=dict(kind='shared-exact-cache-seed')))
                while True:
                    s=State.load(value['state']);moves=ctx.joint_neighbors(s,2);batch(moves,pool)
                    options=[cache[t] for t in moves if feasible(t,cache[t],route)]
                    best=min([value]+options,key=lambda r:r['doubleScore'])
                    route['passes'].append(dict(anchorState=value['state'],anchorDoubleScore=value['doubleScore'],neighbors=len(moves),eligibleNeighbors=len(options),bestDoubleScore=best['doubleScore']))
                    print('polish',name,best['score'],best['doubleScore'],flush=True)
                    if best['doubleScore']>=value['doubleScore']-1e-10:route.update(result=value,complete=True);break
                    route['history'].append(dict(state=best['state'],score=best['score'],doubleScore=best['doubleScore'],move=moves[State.load(best['state'])]));value=best;write(output,report)
                write(output,report)
            if not changed:break
    stream.close();archive=Path(str(PREFIX)+'-scores.jsonl.gz');archive.write_bytes(gzip.compress(log.read_bytes(),mtime=0))
    report.update(complete=True,newFullEvaluations=len(cache)-imported,totalCachedEvaluations=len(cache),elapsedLastInvocationSeconds=time.monotonic()-started,scoresSha256=sha(archive))
    export(ctx,report);write(output,report);print('COMPLETE',report['newFullEvaluations'],[(r['name'],r['result']['score'],r['result']['doubleScore']) for r in report['routes']],flush=True)


if __name__=='__main__':main()
