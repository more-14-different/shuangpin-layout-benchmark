"""Bounded exact v5.2 closure of A and N12, without repeating old annealing.

Two fixed objectives: default cognitive costs and all cognitive costs halved.
Every pass enumerates intact-root transfers/swaps, within-row group-key moves
and swaps, and all 144 policies at the center. All accepted states obey the
same 18 roots / 10 groups / 10:9:7 rows, M<=20/22 and native left pinky<=8.5%.
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

import numpy as np
from toned_2126_v52_load_kernel import competition_with_loads
from enumerate_f19_v52_policies import load_tables,FIELDS,KINDS
from analyze_single_ckt_v51_aux_order import vectors,score_at
from rank_cr_toned_stable_policies import COSTS

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'research/notes/2026-11-19-toned-2126-v52'
PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52-seed-neighbors'
WORK=ROOT/'research/.cache/toned-2126-v52-seed-neighbors'
ROWS=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM']


def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,v):Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def policy_key(p):return '/'.join(p)


@dataclasses.dataclass(frozen=True)
class State:
    partition:tuple
    maps:tuple
    policy:tuple=('12','12','24')

    @classmethod
    def load(cls,s):return cls(tuple(s['partition']),tuple(tuple(r) for r in s['maps']),tuple(s['policy']))


def valid(s):
    if len(s.partition)!=18 or set(s.partition)!=set(range(10)):return False
    if sum(s.partition.count(g)>1 for g in range(10))>6:return False
    return all(len(row)==10 and set(row)==set(range(len(ROWS[i]))) for i,row in enumerate(s.maps))


def neighbors(s):
    found={}
    def add(t,move):
        if t!=s and valid(t) and t not in found:found[t]=move
    for a in range(18):
        for group in range(10):
            p=list(s.partition);p[a]=group;add(dataclasses.replace(s,partition=tuple(p)),dict(kind='root-transfer',root=a,group=group))
        for b in range(a+1,18):
            p=list(s.partition);p[a],p[b]=p[b],p[a];add(dataclasses.replace(s,partition=tuple(p)),dict(kind='root-swap',a=a,b=b))
    for row in range(3):
        for a in range(10):
            for key in range(len(ROWS[row])):
                maps=[list(r) for r in s.maps];maps[row][a]=key
                add(dataclasses.replace(s,maps=tuple(tuple(r) for r in maps)),dict(kind='key-reassign',row=row,group=a,key=key))
            for b in range(a+1,10):
                maps=[list(r) for r in s.maps];maps[row][a],maps[row][b]=maps[row][b],maps[row][a]
                add(dataclasses.replace(s,maps=tuple(tuple(r) for r in maps)),dict(kind='key-swap',row=row,a=a,b=b))
    pairs=lambda n:map(''.join,itertools.permutations('1234'[:n],2))
    for p in itertools.product(pairs(2),pairs(3),pairs(4)):add(dataclasses.replace(s,policy=p),dict(kind='policy',policy=p))
    return found


class Context:
    def __init__(self,main,pinky):
        self.bundle=read(str(BASE)+'-candidates.json');self.token_keys=self.bundle['tokenKeys'];self.pinky=pinky
        inv=read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')
        decomposition={d['pinyin']:d for d in inv['decomposition']}
        root_of=lambda d:d['fullFinal'] if d['rhymeBody']=='_' else d['rhymeBody']
        self.roots=sorted({root_of(d) for d in inv['decomposition']})
        self.final_roots={d['fullFinal']:self.roots.index(root_of(d)) for d in inv['decomposition']}
        self.token_roots=np.array([self.roots.index(root_of(decomposition[t[:-1]])) for t in self.token_keys],np.int64)
        self.source={r['id']:r for r in self.bundle['layouts']};a=self.source['A'];n=self.source['N12']
        if any(x[0]!=y[0] for x,y in zip(a['tonedCodes'],n['tonedCodes'],strict=True)):raise ValueError('onset layout differs')
        self.first=np.array([ord(c[0])-65 for c in a['tonedCodes']],np.int64)
        self.tone_rows=a['toneRowsByTone'];self.token_rows=np.array([self.tone_rows[t[-1]] for t in self.token_keys])
        template=ROOT/'research/.cache/toned-2126-v52/templates.bin';meta=read(template.with_suffix('.json'))
        if meta['sha256']!=sha(template):raise ValueError('frozen template changed')
        self.rows=np.fromfile(template,np.int32).reshape(-1,10)
        tables=ROOT/'tools/ckt_v4_upstream_role_tables.json';errors=main/'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'
        self.motor=load_tables(tables,'tables');self.errors=load_tables(errors,'errorTables')
        policies=json.loads(gzip.decompress(Path(str(BASE)+'-policies.json.gz').read_bytes()))
        self.reference=policies['reference'];self.ref=vectors(self.reference,COSTS)
        self.hashes={str(p):sha(p) for p in [__file__,ROOT/'tools/toned_2126_v52_load_kernel.py',ROOT/'tools/enumerate_toned_2126_v52.py',ROOT/'tools/enumerate_f19_v52_policies.py',template,tables,errors,Path(str(BASE)+'-candidates.json'),Path(str(BASE)+'-policies.json.gz')]}
        self.cache={}
    def state(self,layout):
        p=tuple(next(g for g,x in enumerate(layout['rhymeGroups']) if root in x['roots']) for root in self.roots)
        return State(p,tuple(tuple(row) for row in layout['regionMaps']))
    def expand(self,s,check=True):
        part=np.array(s.partition);maps=np.array(s.maps)
        second=np.array([ord(ROWS[r][maps[r,part[root]]])-65 for r,root in zip(self.token_rows,self.token_roots,strict=True)])
        if check and any(len(set(second[self.token_rows==r]))!=len(ROWS[r]) for r in range(3)):raise ValueError('actual legal coverage changed')
        return np.column_stack([self.first,second]).astype(np.int64)
    def calculate(self,s):
        codes=self.expand(s);orders=np.array([[0,1]]+[[int(c)-1 for c in p] for p in s.policy],np.int64)
        totals,weights,counts,loads,transitions=competition_with_loads(self.rows,codes,orders,self.motor,self.errors)
        tracks={};ergonomics={}
        for i,k in enumerate(KINDS):
            v=totals[i]/weights[i];tracks[k]={f:float(x) for f,x in zip(FIELDS,v,strict=True)}
            tracks[k].update(count=int(counts[i]),totalWeight=float(weights[i]),effectiveMs=float(v[0]+300*sum(v[1:4])+600*v[4]+50*v[5]+300*v[6]))
            load=loads[i]/loads[i].sum();group=lambda keys:float(sum(load[ord(c)-65] for c in keys))
            finger=[group(keys) for keys in ['QAZ','WSX','EDC','RTFGVB','YUHJNM','IK','OL','P']]
            ergonomics[k]=dict(load={chr(65+j):float(v) for j,v in enumerate(load)},leftPinky=group('QAZ'),rightPinky=group('P'),home=group('ASDFGHJKL'),maxFinger=max(finger),leftIndex=finger[3],rightIndex=finger[4],bothIndex=finger[3]+finger[4],differentKeySameFingerRate=float(transitions[i,1]/transitions[i,0]))
        vec=vectors(dict(tracks=tracks),COSTS)
        standard=float(score_at(vec[None,:,:],self.ref,np.ones(6))[0]);half=float(score_at(vec[None,:,:],self.ref,np.full(6,.5))[0])
        left=max(t['leftPinky'] for t in ergonomics.values())
        return dict(state=dataclasses.asdict(s),score=standard,halfScore=half,tracks=tracks,ergonomics=ergonomics,
            leftPinkyPeak=left,eligible=left<=self.pinky+1e-12,memoryLower=14+sum(s.partition.count(g)>1 for g in range(10)),memoryGuard=22)


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--workers',type=int,default=4)
    p.add_argument('--pinky',type=float,default=.085);p.add_argument('--main',type=Path,default=ROOT.parent/'shuangpin-layout-benchmark')
    args=p.parse_args();WORK.mkdir(parents=True,exist_ok=True);ctx=Context(args.main,args.pinky)
    output=Path(str(PREFIX)+'.json');cache_path=WORK/'scores.jsonl'
    report=dict(version='toned-2126-v52-seed-exact-neighbors-v1',hashes=ctx.hashes,contract=dict(shapeKeysByMeaning='AEUIO',toneKeysByTone='IEUAO',toneDigitsByShapeMeaning='42310',rootNames=ctx.roots,rowCounts=[10,9,7],memoryLowerMaximum=20,memoryGuardMaximum=22,leftPinkyMaximum=args.pinky,firstKeysFrozen=True),routes=[],complete=False)
    if output.exists():
        old=read(output)
        if old['hashes']!=ctx.hashes or old['contract']!=report['contract']:raise ValueError('resume inputs changed')
        report=old
    if cache_path.exists():
        for line in cache_path.read_text(encoding='utf8').splitlines():
            row=json.loads(line);ctx.cache[State.load(row['state'])]=row
    stream=cache_path.open('a',encoding='utf8')
    def evaluate_many(states,pool):
        missing=[s for s in states if s not in ctx.cache]
        for s,row in zip(missing,pool.map(ctx.calculate,missing),strict=True):
            ctx.cache[s]=row;stream.write(json.dumps(row,separators=(',',':'))+'\n')
            if len(ctx.cache)%100==0:stream.flush();print('exact evaluations',len(ctx.cache),flush=True)
        stream.flush()
        return [ctx.cache[s] for s in states]
    # Compilation and anchor parity precede concurrent scoring.
    warm=ctx.calculate(ctx.state(ctx.source['A']))
    anchor=json.loads(gzip.decompress(Path(str(BASE)+'-policies.json.gz').read_bytes()))
    prior=next(r for r in anchor['results'] if r['id']=='A')['defaultBest']
    if abs(warm['score']-prior['score'])>1e-9:raise ValueError('A CKT v5.2 anchor mismatch')
    prior_loads=read(str(BASE)+'-verification.json')['results']
    for ident in ['A','N12']:
        state=ctx.state(ctx.source[ident]);actual=ctx.calculate(state)
        previous=next(r for r in prior_loads if r['id']==ident and r['policy']==dict(zip(KINDS[1:],state.policy)))
        for k in KINDS:
            for f,v in actual['ergonomics'][k]['load'].items():
                if abs(v-previous['ergonomics']['tracks'][k]['load'][f])>1e-12:raise ValueError('anchor terminal load mismatch')
    started=time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for seed,objective in itertools.product(['A','N12'],['default','half']):
            name=seed+'-'+objective
            previous=next((r for r in report['routes'] if r['name']==name),None)
            if previous and previous['complete']:continue
            route=previous or dict(name=name,seed=seed,objective=objective,history=[],passes=[],complete=False)
            if previous is None:report['routes'].append(route)
            state=State.load(route['history'][-1]['state']) if route['history'] else ctx.state(ctx.source[seed])
            value=evaluate_many([state],pool)[0];field='score' if objective=='default' else 'halfScore'
            if not route['history']:route['history'].append(dict(state=dataclasses.asdict(state),score=value['score'],halfScore=value['halfScore']))
            while True:
                structural=neighbors(state);options={}
                for candidate,move in structural.items():
                    codes=ctx.expand(candidate,check=False)
                    if all(len(set(codes[ctx.token_rows==r,1]))==len(ROWS[r]) for r in range(3)):options[candidate]=move
                states=list(options);values=evaluate_many(states,pool)
                eligible=[r for r in values if r['eligible']];best=min([value]+eligible,key=lambda r:r[field])
                audit=dict(anchorState=dataclasses.asdict(state),anchorObjective=value[field],neighbors=len(options),legalCoverageRejected=len(structural)-len(options),pinkyRejected=sum(not r['eligible'] for r in values),
                    moveCounts={k:sum(m['kind']==k for m in options.values()) for k in sorted({m['kind'] for m in options.values()})},bestObjective=best[field])
                route['passes'].append(audit);print(name,'pass',len(route['passes']),audit,flush=True)
                if best[field]>=value[field]-1e-10:
                    route.update(complete=True,result=value);break
                next_state=State.load(best['state']);move=options[next_state]
                route['history'].append(dict(state=dataclasses.asdict(next_state),score=best['score'],halfScore=best['halfScore'],move=move));state=next_state;value=best
                write(output,report)
            write(output,report)
    stream.close();report.update(complete=True,uniqueFullEvaluations=len(ctx.cache),elapsedSeconds=time.monotonic()-started)
    frozen=Path(str(PREFIX)+'-scores.jsonl.gz');frozen.write_bytes(gzip.compress(cache_path.read_bytes(),mtime=0));report['scoresSha256']=sha(frozen)
    write(output,report)
    # Export full encodings for independent original JS verification, not state-only claims.
    layouts=[]
    for route in report['routes']:
        value=route['result'];s=State.load(value['state']);codes=ctx.expand(s)
        ident='T2126-V52-LOCAL-'+hashlib.sha256(codes.tobytes()).hexdigest()[:12]
        if any(l['id']==ident and l['policy']==list(s.policy) for l in layouts):continue
        final_groups={f:s.partition[r] for f,r in ctx.final_roots.items()}
        layouts.append(dict(id=ident,originRoutes=[r['name'] for r in report['routes'] if r['result']['state']==value['state']],
            shapeKeysByMeaning='AEUIO',toneRowsByTone=ctx.tone_rows,tonedCodes=[''.join(chr(65+x) for x in row) for row in codes],
            finalGroups=final_groups,regionMaps=s.maps,rhymeGroups=[dict(roots=[ctx.roots[i] for i,g in enumerate(s.partition) if g==group],finals=[f for f,g in final_groups.items() if g==group]) for group in range(10)],
            policy=list(s.policy),score=value['score'],halfScore=value['halfScore'],tracks=value['tracks'],ergonomics=value['ergonomics'],memoryLower=value['memoryLower'],memoryGuard=value['memoryGuard']))
    write(Path(str(PREFIX)+'-finalists.json'),dict(tokenKeys=ctx.token_keys,layouts=layouts))
    print('COMPLETE',report['uniqueFullEvaluations'],'evaluations',[(r['name'],r['result']['score'],r['result']['halfScore']) for r in report['routes']],flush=True)


if __name__=='__main__':main()
