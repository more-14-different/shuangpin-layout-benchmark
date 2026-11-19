"""Exact onset/rhyme coadaptation under M20/22, D3 or D2, left pinky8.5%.

Movable complete ordinary initials, zh/ch/sh, zero A/E/O/W/Y. Include both
unified AEO and independent zero carriers. Compensated proposals restore an
ordinary/W/Y unit before moving another unit, without intermediate D inflation.
Default and doubled six cognitive costs are independent objectives.
"""
import argparse
import concurrent.futures
import dataclasses
import gzip
import itertools
import json
from pathlib import Path
import time

import numpy as np
from check_toned_2126_v52_seed_neighbors import Context as RhymeContext,State as RhymeState,neighbors as rhyme_neighbors,read,sha,write,ROWS
from analyze_single_ckt_v51_aux_order import vectors,score_at

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52-onsets'
WORK=ROOT/'research/.cache/toned-2126-v52-onsets'
SPEC=ROOT/'research/config/toned-2126-v52-onset-atoms.json'


@dataclasses.dataclass(frozen=True)
class State:
    first:tuple
    partition:tuple
    maps:tuple
    policy:tuple=('12','12','24')

    @classmethod
    def load(cls,s):return cls(tuple(s['first']),tuple(s['partition']),tuple(tuple(r) for r in s['maps']),tuple(s['policy']))


class Context(RhymeContext):
    def __init__(self,main,pinky):
        super().__init__(main,pinky);self.spec=read(SPEC);self.names=self.spec['atomNames']
        self.token_atoms=np.array(self.spec['tokenAtoms'],np.int64);self.keys=self.spec['allowedFirstKeys']
        self.aeo=tuple(self.names.index('zero-'+c) for c in 'AEO')
        self.units=[(i,) for i in range(26)]+[self.aeo]
        self.ordinary=[i for i,a in enumerate(self.names) if len(a)==1]
        self.wy=[self.names.index('zero-'+c) for c in 'WY']
        self.hashes.update({str(p):sha(p) for p in [__file__,SPEC]})
    def state(self,layout):
        r=super().state(layout);first=tuple(layout['tonedCodes'][next(i for i,a in enumerate(self.spec['tokenAtoms']) if a==j)][0] for j in range(26))
        return State(first,r.partition,r.maps,r.policy)
    def memory(self,s):
        d=sum(s.first[i]!=self.names[i].upper() for i in self.ordinary)
        wy=sum(s.first[i]!=self.names[i][-1] for i in self.wy)
        zero=len({s.first[i] for i in self.aeo})
        groups=sum(s.partition.count(g)>1 for g in range(10))
        return dict(D=d,lower=8+zero+d+wy+groups,guard=16+zero+d+wy,zeroCarrierRules=zero,carrierMoveRules=wy)
    def valid(self,s,max_d=3):
        m=self.memory(s)
        return (len(s.first)==26 and set(s.first)==set(self.keys) and len(s.partition)==18 and set(s.partition)==set(range(10)) and
                all(len(row)==10 and set(row)==set(range(len(ROWS[i]))) for i,row in enumerate(s.maps)) and
                m['D']<=max_d and m['lower']<=20 and m['guard']<=22)
    def expand(self,s,check=True):
        codes=super().expand(s,check=check);codes[:,0]=np.array([ord(c)-65 for c in s.first],np.int64)[self.token_atoms]
        return codes
    def calculate(self,s):
        value=super().calculate(s);m=self.memory(s)
        from rank_cr_toned_stable_policies import COSTS
        value.update(doubleScore=float(score_at(vectors(value,COSTS)[None,:,:],self.ref,np.full(6,2.))[0]),memoryLower=m['lower'],memoryGuard=m['guard'],D=m['D'],memoryComponents=m)
        return value
    def onset_neighbors(self,s,max_d=3):
        found={}
        def add(first,move):
            t=dataclasses.replace(s,first=tuple(first))
            if t!=s and t not in found and self.valid(t,max_d):found[t]=move
        def assign(first,unit,key):
            for i in unit:first[i]=key
        for unit in self.units:
            for key in self.keys:
                if all(s.first[i]==key for i in unit):continue
                first=list(s.first);assign(first,unit,key);add(first,dict(kind='onset-move',atoms=[self.names[i] for i in unit],key=key))
        for a,b in itertools.combinations(self.units,2):
            if set(a)&set(b):continue
            if len({s.first[i] for i in a})!=1 or len({s.first[i] for i in b})!=1:continue
            ka,kb=s.first[a[0]],s.first[b[0]]
            if ka==kb:continue
            first=list(s.first);assign(first,a,kb);assign(first,b,ka)
            add(first,dict(kind='onset-swap',a=[self.names[i] for i in a],b=[self.names[i] for i in b]))
        for i in self.ordinary+self.wy:
            home=self.names[i].upper() if i in self.ordinary else self.names[i][-1]
            if s.first[i]==home:continue
            for unit in self.units:
                if i in unit:continue
                for key in self.keys:
                    first=list(s.first);first[i]=home;assign(first,unit,key)
                    add(first,dict(kind='restore-plus-onset',restore=self.names[i],atoms=[self.names[j] for j in unit],key=key))
        return found
    def joint_neighbors(self,s,max_d=3):
        found=self.onset_neighbors(s,max_d)
        # Generic neighbor generator's six-multiroot cap is relaxed below when
        # an onset restoration frees M. Regenerate root moves without that cap.
        r=RhymeState(s.partition,s.maps,s.policy)
        for t,move in rhyme_neighbors(r).items():
            v=dataclasses.replace(s,partition=t.partition,maps=t.maps,policy=t.policy)
            if self.valid(v,max_d):found.setdefault(v,move)
        for a in range(18):
            for group in range(10):
                part=list(s.partition);part[a]=group;v=dataclasses.replace(s,partition=tuple(part))
                if v!=s and self.valid(v,max_d):found.setdefault(v,dict(kind='root-transfer',root=a,group=group))
            for b in range(a+1,18):
                part=list(s.partition);part[a],part[b]=part[b],part[a];v=dataclasses.replace(s,partition=tuple(part))
                if v!=s and self.valid(v,max_d):found.setdefault(v,dict(kind='root-swap',a=a,b=b))
        for row in range(3):
            for a in range(10):
                for key in range(len(ROWS[row])):
                    maps=[list(r) for r in s.maps];maps[row][a]=key;v=dataclasses.replace(s,maps=tuple(tuple(r) for r in maps))
                    if v!=s and self.valid(v,max_d):found.setdefault(v,dict(kind='key-reassign',row=row,group=a,key=key))
                for b in range(a+1,10):
                    maps=[list(r) for r in s.maps];maps[row][a],maps[row][b]=maps[row][b],maps[row][a];v=dataclasses.replace(s,maps=tuple(tuple(r) for r in maps))
                    if v!=s and self.valid(v,max_d):found.setdefault(v,dict(kind='key-swap',row=row,a=a,b=b))
        pairs=lambda n:map(''.join,itertools.permutations('1234'[:n],2))
        for policy in itertools.product(pairs(2),pairs(3),pairs(4)):
            v=dataclasses.replace(s,policy=policy)
            if v!=s and self.valid(v,max_d):found.setdefault(v,dict(kind='policy',policy=policy))
        valid={}
        for t,move in found.items():
            codes=self.expand(t,check=False)
            if all(len(set(codes[self.token_rows==r,1]))==len(ROWS[r]) for r in range(3)):valid[t]=move
        return valid


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--workers',type=int,default=4)
    p.add_argument('--main',type=Path,default=ROOT.parent/'shuangpin-layout-benchmark');args=p.parse_args()
    WORK.mkdir(parents=True,exist_ok=True);ctx=Context(args.main,.085);cache_file=WORK/'scores.jsonl';output=Path(str(PREFIX)+'.json')
    report=dict(version='toned-2126-v52-onset-joint-v1',hashes=ctx.hashes,contract=dict(Mlower=20,Mguard=22,Dmaximum=3,preferredD=2,leftPinkyMaximum=.085,actualFirstKeys=21,rowCounts=[10,9,7],shapeKeysByMeaning='AEUIO',toneKeysByTone='IEUAO',toneDigitsByShapeMeaning='42310'),screening=[],routes=[],complete=False)
    if output.exists():
        previous=read(output)
        if previous['hashes']!=ctx.hashes:raise ValueError('resume fingerprints changed')
        report=previous
    cache={}
    if cache_file.exists():
        for line in cache_file.read_text(encoding='utf8').splitlines():
            v=json.loads(line);cache[State.load(v['state'])]=v
    stream=cache_file.open('a',encoding='utf8')
    def batch(states,pool):
        states=list(states);missing=[s for s in states if s not in cache]
        for s,v in zip(missing,pool.map(ctx.calculate,missing),strict=True):
            cache[s]=v;stream.write(json.dumps(v,separators=(',',':'))+'\n')
            if len(cache)%200==0:stream.flush();print('full CKT evaluations',len(cache),flush=True)
        stream.flush();return [cache[s] for s in states]
    a=ctx.state(ctx.source['A']);warm=ctx.calculate(a)
    if abs(warm['score']-8.844991233827653)>1e-9:raise ValueError('baseline changed')
    started=time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        if not report['screening']:
            for seed in ['A','N12']:
                s=ctx.state(ctx.source[seed]);moves=ctx.onset_neighbors(s);values=batch([s]+list(moves),pool)
                record=dict(seed=seed,legalOnsetEndpoints=len(moves),eligible=sum(v['eligible'] for v in values),moveCounts={kind:sum(m['kind']==kind for m in moves.values()) for kind in sorted({m['kind'] for m in moves.values()})})
                report['screening'].append(record);print('screen',record,flush=True)
            write(output,report)
        # Independently retain best endpoints for both D limits and objectives.
        for max_d,objective in itertools.product([3,2],['default','double']):
            name='D'+str(max_d)+'-'+objective
            route=next((r for r in report['routes'] if r['name']==name),None)
            if route and route['complete']:continue
            field='score' if objective=='default' else 'doubleScore'
            if route is None:
                eligible=[v for v in cache.values() if v['eligible'] and v['D']<=max_d]
                if not eligible:raise ValueError('no eligible onset seed '+name)
                best=min(eligible,key=lambda v:v[field]);s=State.load(best['state'])
                route=dict(name=name,objective=objective,Dmaximum=max_d,history=[dict(state=best['state'],score=best['score'],doubleScore=best['doubleScore'])],passes=[],complete=False);report['routes'].append(route)
            else:s=State.load(route['history'][-1]['state'])
            v=batch([s],pool)[0]
            while True:
                moves=ctx.joint_neighbors(s,max_d);values=batch(moves,pool);eligible=[x for x in values if x['eligible']]
                best=min([v]+eligible,key=lambda x:x[field]);audit=dict(anchorState=dataclasses.asdict(s),anchorObjective=v[field],neighbors=len(moves),leftPinkyRejected=sum(not x['eligible'] for x in values),bestObjective=best[field],moveCounts={kind:sum(m['kind']==kind for m in moves.values()) for kind in sorted({m['kind'] for m in moves.values()})})
                route['passes'].append(audit);print(name,'pass',len(route['passes']),'neighbors',len(moves),'best',best['score'],best['doubleScore'],'D',best['D'],flush=True)
                if best[field]>=v[field]-1e-10:route.update(complete=True,result=v);break
                t=State.load(best['state']);route['history'].append(dict(state=best['state'],score=best['score'],doubleScore=best['doubleScore'],move=moves[t]));s=t;v=best;write(output,report)
            write(output,report)
    stream.close();report.update(complete=True,uniqueFullEvaluations=len(cache),elapsedSeconds=time.monotonic()-started,baseline=dict(score=warm['score'],doubleScore=warm['doubleScore']))
    frozen=Path(str(PREFIX)+'-scores.jsonl.gz');frozen.write_bytes(gzip.compress(cache_file.read_bytes(),mtime=0));report['scoresSha256']=sha(frozen);write(output,report)
    finalists=[]
    for route in report['routes']:
        v=route['result'];s=State.load(v['state']);codes=ctx.expand(s);ident='T2126-V52-ONSET-'+__import__('hashlib').sha256(codes.tobytes()).hexdigest()[:12]
        if any(r['id']==ident and r['policy']==list(s.policy) for r in finalists):continue
        final_groups={f:s.partition[r] for f,r in ctx.final_roots.items()}
        finalists.append(dict(id=ident,originRoutes=[r['name'] for r in report['routes'] if r['result']['state']==v['state']],
            shapeKeysByMeaning='AEUIO',toneRowsByTone=ctx.tone_rows,tonedCodes=[''.join(chr(65+x) for x in code) for code in codes],finalGroups=final_groups,regionMaps=s.maps,
            firstKeys=dict(zip(ctx.names,s.first)),policy=list(s.policy),score=v['score'],doubleScore=v['doubleScore'],tracks=v['tracks'],ergonomics=v['ergonomics'],
            rhymeGroups=[dict(roots=[ctx.roots[i] for i,g in enumerate(s.partition) if g==group],finals=[f for f,g in final_groups.items() if g==group]) for group in range(10)],memoryLower=v['memoryLower'],memoryGuard=v['memoryGuard'],D=v['D']))
    write(Path(str(PREFIX)+'-finalists.json'),dict(tokenKeys=ctx.token_keys,layouts=finalists))
    print('COMPLETE',report['uniqueFullEvaluations'],'evaluations',[(r['name'],r['result']['score'],r['result']['doubleScore'],r['result']['D']) for r in report['routes']],flush=True)


if __name__=='__main__':main()
