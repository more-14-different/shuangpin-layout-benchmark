"""M4 refinement: complete root+key couplings and bounded exact two-hop beams.

Keep actual M<=18/21, D<=2, all 21 first keys and 10/9/7 tone rows.
Both pinkies are diagnostic only, following the user's updated constraint.
First-hop beam selection uses full CKT. No GPU proxy selection.
"""
import argparse
import concurrent.futures
import dataclasses
import gzip
import hashlib
import json
from pathlib import Path
import time

from search_toned_2126_v52_m19 import Context as MemoryContext,State,ROOT,ROWS
from check_toned_2126_v52_seed_neighbors import read,sha,write

PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52-m4-refine'
WORK=ROOT/'research/.cache/toned-2126-v52-m4-refine'
M19=ROOT/'research/notes/2026-11-19-toned-2126-v52-m19'
ARCHIVES=[ROOT/'research/notes/2026-11-19-toned-2126-v52-onsets-scores.jsonl.gz',Path(str(M19)+'-scores.jsonl.gz')]


class Context(MemoryContext):
    def __init__(self,main):
        super().__init__(main,1.);self.max_guard=21
        self.hashes.update({str(p):sha(p) for p in [__file__,Path(str(M19)+'-finalists.json'),Path(str(M19)+'-policies.json.gz')]+ARCHIVES})
    def valid(self,s,max_d=2):return super().valid(s,min(max_d,2)) and self.memory(s)['lower']<=18
    def legal(self,s):
        if not self.valid(s,2):return False
        codes=self.expand(s,check=False)
        return all(len(set(codes[self.token_rows==r,1]))==len(ROWS[r]) for r in range(3))


def root_key_pairs(ctx,s):
    """Every root transfer/swap crossed with one touched-group key change.

    The first step need not retain actual occupied-key coverage; the joint
    endpoint must. Memory/18-root partition legality cannot be repaired by a
    subsequent key change, so those checks can be performed early exactly.
    """
    partitions={}
    for a in range(18):
        for g in range(10):
            if g==s.partition[a]:continue
            p=list(s.partition);p[a]=g;t=dataclasses.replace(s,partition=tuple(p))
            if ctx.valid(t):partitions.setdefault(t,(set([s.partition[a],g]),dict(kind='root-transfer',root=a,group=g)))
        for b in range(a+1,18):
            if s.partition[a]==s.partition[b]:continue
            p=list(s.partition);p[a],p[b]=p[b],p[a];t=dataclasses.replace(s,partition=tuple(p))
            if ctx.valid(t):partitions.setdefault(t,(set([p[a],p[b]]),dict(kind='root-swap',a=a,b=b)))
    result={}
    for t,(groups,root_move) in partitions.items():
        for row in range(3):
            for a in sorted(groups):
                for b in range(10):
                    maps=[list(r) for r in t.maps];maps[row][a],maps[row][b]=maps[row][b],maps[row][a]
                    v=dataclasses.replace(t,maps=tuple(tuple(r) for r in maps))
                    if v.maps!=s.maps and ctx.legal(v):result.setdefault(v,dict(kind='root-plus-key-swap',rootMove=root_move,row=row,a=a,b=b))
                for key in range(len(ROWS[row])):
                    maps=[list(r) for r in t.maps];maps[row][a]=key
                    v=dataclasses.replace(t,maps=tuple(tuple(r) for r in maps))
                    if v.maps!=s.maps and ctx.legal(v):result.setdefault(v,dict(kind='root-plus-key-reassign',rootMove=root_move,row=row,group=a,key=key))
    return result


def export(ctx,report,cache,seed):
    choices=[('original-M4',cache[seed])]+[(r['name'],r['result']) for r in report['routes']]
    layouts=[]
    for label,value in choices:
        state=State.load(value['state']);codes=ctx.expand(state);ident='T2126-V52-M4-'+hashlib.sha256(codes.tobytes()).hexdigest()[:12]
        existing=next((r for r in layouts if r['id']==ident and r['policy']==list(state.policy)),None)
        if existing:existing['originRoutes'].append(label);continue
        finals={f:state.partition[r] for f,r in ctx.final_roots.items()}
        layouts.append(dict(id=ident,originRoutes=[label],shapeKeysByMeaning='AEUIO',toneRowsByTone=ctx.tone_rows,tonedCodes=[''.join(chr(65+x) for x in row) for row in codes],
            firstKeys=dict(zip(ctx.names,state.first)),finalGroups=finals,regionMaps=state.maps,
            rhymeGroups=[dict(roots=[ctx.roots[i] for i,g in enumerate(state.partition) if g==group],finals=[f for f,g in finals.items() if g==group]) for group in range(10)],
            policy=list(state.policy),score=value['score'],doubleScore=value['doubleScore'],tracks=value['tracks'],ergonomics=value['ergonomics'],memoryLower=value['memoryLower'],memoryGuard=value['memoryGuard'],D=value['D']))
    write(Path(str(PREFIX)+'-finalists.json'),dict(tokenKeys=ctx.token_keys,layouts=layouts))


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--workers',type=int,default=8)
    p.add_argument('--main',type=Path,default=ROOT.parent/'shuangpin-layout-benchmark');args=p.parse_args()
    WORK.mkdir(parents=True,exist_ok=True);ctx=Context(args.main);cache={}
    for archive in ARCHIVES:
        for row in map(json.loads,gzip.decompress(archive.read_bytes()).decode().splitlines()):
            row['eligible']=True;cache[State.load(row['state'])]=row
    for r in json.loads(gzip.decompress(Path(str(M19)+'-policies.json.gz').read_bytes()))['results']:
        for row in r['policies']:
            row['eligible']=True;cache[State.load(row['state'])]=row
    imported=len(cache)
    layout=next(r for r in read(str(M19)+'-finalists.json')['layouts'] if r['id']=='T2126-V52-M19-9cd540fc9f2f')
    seed=dataclasses.replace(ctx.state(layout),policy=tuple(layout['policy']));base=ctx.calculate(seed)
    for field in ['score','doubleScore']:
        if abs(base[field]-cache[seed][field])>1e-10:raise ValueError('M4 anchor changed '+field)
    output=Path(str(PREFIX)+'.json');log=WORK/'scores.jsonl'
    report=dict(version='toned-2126-v52-m4-coupled-v2',hashes=ctx.hashes,contract=dict(MlowerMaximum=18,MguardMaximum=21,Dmaximum=2,pinkyConstraint='none',leftPinkyMaximum=1.,rowCounts=[10,9,7],actualFirstKeys=21,shapeKeysByMeaning='AEUIO',toneKeysByTone='IEUAO',toneDigitsByShapeMeaning='42310'),
        baseline=base,importedEvaluations=imported,stages=[],routes=[],complete=False)
    if output.exists():
        previous=read(output)
        if previous['hashes']!=ctx.hashes:raise ValueError('source changed; refusing resume')
        report=previous
    if log.exists():
        for line in log.read_text(encoding='utf8').splitlines():
            row=json.loads(line);row['eligible']=True;cache[State.load(row['state'])]=row
    stream=log.open('a',encoding='utf8');started=time.monotonic()
    def batch(states,pool):
        states=list(states);missing=[s for s in states if s not in cache]
        for s,row in zip(missing,pool.map(ctx.calculate,missing),strict=True):
            cache[s]=row;stream.write(json.dumps(row,separators=(',',':'))+'\n')
            if (len(cache)-imported)%400==0:stream.flush();print('new full CKT scores',len(cache)-imported,flush=True)
        stream.flush();return [cache[s] for s in states]
    def stage(name,moves,pool,extra=None):
        if any(r['name']==name for r in report['stages']):return
        values=batch(moves,pool);eligible=[r for r in values if r['eligible']]
        record=dict(name=name,states=len(moves),leftPinkyAbovePreviousLimit=sum(r['leftPinkyPeak']>.085 for r in values),bestDefault=min((r['score'] for r in eligible),default=None),bestDouble=min((r['doubleScore'] for r in eligible),default=None),**(extra or {}))
        report['stages'].append(record);write(output,report);print('stage',record,flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        singles=ctx.joint_neighbors(seed,2);stage('M4-single-neighborhood',singles,pool)
        pairs=root_key_pairs(ctx,seed);stage('M4-complete-root-key-couplings',pairs,pool)
        # Two-hop search is bounded and named explicitly: exact-best first hop
        # for each move class at each of the two cost points, then all legal
        # second hops. Include temporary left-pinky violations for recovery.
        chosen={}
        for kind in sorted({m['kind'] for m in singles.values()}):
            members=[s for s,m in singles.items() if m['kind']==kind]
            for field in ['score','doubleScore']:
                s=min(members,key=lambda s:cache[s][field]);chosen.setdefault(s,[]).append(dict(kind=kind,objective=field))
        twohop={}
        for first,selection in chosen.items():
            for second,move in ctx.joint_neighbors(first,2).items():twohop.setdefault(second,dict(kind='bounded-two-hop',firstState=dataclasses.asdict(first),selection=selection,secondMove=move))
        stage('M4-bounded-two-hop',twohop,pool,dict(firstHopCenters=len(chosen),firstHopSelections=[dict(state=dataclasses.asdict(s),selection=m) for s,m in chosen.items()]))
        cycles=0
        while True:
            cycles+=1;changed=False
            for name,field,right_limit in [('default','score',1.),('double','doubleScore',1.)]:
                feasible=[r for s,r in cache.items() if ctx.valid(s) and r['eligible'] and max(t['rightPinky'] for t in r['ergonomics'].values())<=right_limit+1e-12]
                best=min(feasible,key=lambda r:r[field]);route=next((r for r in report['routes'] if r['name']==name),None)
                if route and route['complete'] and best[field]>=route['result'][field]-1e-10:continue
                changed=True
                if route is None:
                    route=dict(name=name,objective=field,rightPinkyMaximum=right_limit,history=[],passes=[],complete=False);report['routes'].append(route)
                state=State.load(best['state']);value=best;route['history'].append(dict(state=best['state'],score=best['score'],doubleScore=best['doubleScore'],move=dict(kind='shared-exact-cache-seed',cycle=cycles)))
                while True:
                    moves=ctx.joint_neighbors(state,2);values=batch(moves,pool)
                    eligible=[r for r in values if r['eligible'] and max(t['rightPinky'] for t in r['ergonomics'].values())<=right_limit+1e-12]
                    best=min([value]+eligible,key=lambda r:r[field]);route['passes'].append(dict(anchorState=dataclasses.asdict(state),anchorObjective=value[field],neighbors=len(moves),bestObjective=best[field]))
                    print('polish',name,len(route['passes']),best['score'],best['doubleScore'],flush=True)
                    if best[field]>=value[field]-1e-10:route.update(result=value,complete=True);break
                    nxt=State.load(best['state']);route['history'].append(dict(state=best['state'],score=best['score'],doubleScore=best['doubleScore'],move=moves[nxt]));state=nxt;value=best;write(output,report)
                write(output,report)
            if not changed:break
    stream.close();report.update(complete=True,recenterCycles=cycles,newFullEvaluations=len(cache)-imported,totalCachedEvaluations=len(cache),elapsedSeconds=time.monotonic()-started)
    archive=Path(str(PREFIX)+'-scores.jsonl.gz');archive.write_bytes(gzip.compress(log.read_bytes(),mtime=0));report['scoresSha256']=sha(archive)
    export(ctx,report,cache,seed);write(output,report);print('COMPLETE',report['newFullEvaluations'],'new scores',[(r['name'],r['result']['score'],r['result']['doubleScore']) for r in report['routes']],flush=True)


if __name__=='__main__':main()
