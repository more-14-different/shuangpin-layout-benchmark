"""Frozen UM40 onsets, full CKT5.2 rhyme-only descent and bounded two hops."""
import argparse
import concurrent.futures
import dataclasses
import gzip
import hashlib
import json
from pathlib import Path
import time

from search_toned_2126_v52_onsets import Context as OnsetContext,State,ROOT,ROWS
from check_toned_2126_v52_seed_neighbors import read,write,sha

PREFIX=ROOT/'research/notes/2026-11-20-toned-2126-um40'
WORK=ROOT/'research/.cache/toned-2126-um40'
CONFIG=ROOT/'research/config/toned-2126-um40-initials.json'
M4=ROOT/'research/notes/2026-11-19-toned-2126-v52-m4-refine'
C1=ROOT/'research/notes/2026-11-19-toned-2126-v52-r1-coupled'


class Context(OnsetContext):
    def __init__(self,main):
        super().__init__(main,1.)
        self.onset_source=read(CONFIG);im=self.onset_source['initialMap']
        if im['Y']!=im['YU']:raise ValueError('UM40 Y/YU cannot be imported as one zero-Y atom')
        self.fixed_first=tuple(im[n[-1] if n.startswith('zero-') else n] for n in self.names)
        self.hashes.update({str(p):sha(p) for p in [CONFIG,Path(__file__)]})
    def state(self,layout):return dataclasses.replace(super().state(layout),first=self.fixed_first,policy=tuple(layout.get('policy',('12','12','24'))))
    def valid(self,s,max_d=3):
        # No inherited lower-M=20 restriction: the user freezes onsets, not
        # the number of multiroot groups. 18 roots / 10 groups naturally give
        # at most eight multiroot groups, so both ledger bounds stay <=22.
        m=self.memory(s)
        return (s.first==self.fixed_first and set(s.first)==set(self.keys) and len(s.partition)==18 and set(s.partition)==set(range(10))
            and all(len(row)==10 and set(row)==set(range(len(ROWS[i]))) for i,row in enumerate(s.maps))
            and m['D']==3 and m['guard']==22 and m['lower']<=22)
    def onset_neighbors(self,s,max_d=3):return {}
    def legal(self,s):
        if not self.valid(s):return False
        codes=self.expand(s,check=False)
        return all(len(set(codes[self.token_rows==r,1]))==len(ROWS[r]) for r in range(3))


def select_final_route(routes,field,best):
    """Resume unfinished closure and never recycle a completed route name."""
    own=[r for r in routes if r.get('final') and r['objective']==field]
    pending=next((r for r in own if not r['complete']),None)
    if pending:return pending['name'],pending['result']
    if own and best[field]>=min(r['result'][field] for r in own)-1e-10:return None
    sequence=len(own)+1;names={r['name'] for r in routes}
    while f'final-{field}-{sequence}' in names:sequence+=1
    return f'final-{field}-{sequence}',best


def export(ctx,report):
    layouts=[]
    choices=[('best-initial-seed-default',min(report['seedScores'],key=lambda r:r['score'])),
             ('best-initial-seed-double',min(report['seedScores'],key=lambda r:r['doubleScore']))]
    choices += [(route['name'],route['result']) for route in report['routes'] if route.get('final')]
    for label,value in choices:
        s=State.load(value['state']);codes=ctx.expand(s);ident='T2126-UM40-'+hashlib.sha256(codes.tobytes()).hexdigest()[:12]
        old=next((l for l in layouts if l['id']==ident and l['policy']==list(s.policy)),None)
        if old:old['originRoutes'].append(label);continue
        finals={f:s.partition[r] for f,r in ctx.final_roots.items()}
        layouts.append(dict(id=ident,originRoutes=[label],policy=list(s.policy),shapeKeysByMeaning='AEUIO',toneRowsByTone=ctx.tone_rows,
            tonedCodes=[''.join(chr(65+x) for x in row) for row in codes],firstKeys=dict(zip(ctx.names,s.first)),finalGroups=finals,regionMaps=s.maps,
            rhymeGroups=[dict(roots=[ctx.roots[i] for i,g in enumerate(s.partition) if g==group],finals=[f for f,g in finals.items() if g==group]) for group in range(10)],
            **{k:value[k] for k in ['score','doubleScore','tracks','ergonomics','memoryLower','memoryGuard','D']}))
    write(Path(str(PREFIX)+'-finalists.json'),dict(tokenKeys=ctx.token_keys,layouts=layouts))


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--workers',type=int,default=12)
    p.add_argument('--main',type=Path,default=ROOT.parent/'shuangpin-layout-benchmark');a=p.parse_args()
    WORK.mkdir(parents=True,exist_ok=True);ctx=Context(a.main);cache={};output=Path(str(PREFIX)+'.json');log=WORK/'scores.jsonl'
    seeds={}
    for name,layout in ctx.source.items():
        s=ctx.state(layout)
        if ctx.legal(s):seeds.setdefault(s,[]).append(name)
    for prefix in [M4,C1]:
        path=Path(str(prefix)+'-finalists.json');ctx.hashes[str(path)]=sha(path)
        for l in read(path)['layouts']:
            s=ctx.state(l)
            if ctx.legal(s):seeds.setdefault(s,[]).append(l['id'])
    report=dict(version='UM40-fixed-onsets-toned-v1',complete=False,hashes=ctx.hashes,
        contract=dict(fixedInitialMap=ctx.onset_source['initialMap'],fixedFirstKeys=ctx.fixed_first,MlowerMaximum=22,MguardMaximum=22,Dmaximum=3,
            leftPinkyMaximum=1.,pinkyConstraint='none',rowCounts=[10,9,7],actualFirstKeys=21,shapeKeysByMeaning='AEUIO',toneKeysByTone='IEUAO',toneDigitsByShapeMeaning='42310'),
        referenceR2=dict(id='T2126-V52-M4-ec60a3637a99',policy=['21','12','23'],score=8.640932204060537,doubleScore=8.234488645251973),
        extraSourcePaths=['tools/search_toned_2126_um40.py','research/config/toned-2126-um40-initials.json'],seedScores=[],stages=[],routes=[])
    if output.exists():
        report=read(output)
        if report['hashes']!=ctx.hashes:raise ValueError('source changed')
        if report['complete']:print('Already complete');return
    if log.exists():
        for line in log.read_text(encoding='utf8').splitlines():
            value=json.loads(line);cache[State.load(value['state'])]=value
    started=time.monotonic();stream=log.open('a',encoding='utf8')
    def batch(states,pool):
        missing=[s for s in states if s not in cache]
        print('batch',len(states),'new',len(missing),flush=True)
        for s,v in zip(missing,pool.map(ctx.calculate,missing),strict=True):
            cache[s]=v;stream.write(json.dumps(v,separators=(',',':'))+'\n')
            if len(cache)%400==0:stream.flush();print('exact scores',len(cache),flush=True)
        stream.flush();return [cache[s] for s in states]
    def descend(name,field,center,pool,final=False):
        route=next((r for r in report['routes'] if r['name']==name),None)
        if route and route['complete']:return route
        if route is None:
            route=dict(name=name,objective=field,passes=[],history=[],complete=False,final=final,result=center);report['routes'].append(route)
        value=route['result']
        while True:
            state=State.load(value['state']);moves=ctx.joint_neighbors(state);values=batch(moves,pool)
            best=min([value]+values,key=lambda r:r[field]);route['passes'].append(dict(anchorState=value['state'],anchorObjective=value[field],neighbors=len(moves),bestObjective=best[field]))
            print('polish',name,best['score'],best['doubleScore'],flush=True)
            if best[field]>=value[field]-1e-10:route.update(complete=True,result=value);break
            route['history'].append(dict(move=moves[State.load(best['state'])],score=best['score'],doubleScore=best['doubleScore']));value=best;route['result']=value;write(output,report)
        write(output,report);return route
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
        batch(seeds,pool)
        report['seedScores']=[dict(cache[s],origins=names) for s,names in seeds.items()];write(output,report)
        # Independent locally converged basins: top two per endpoint plus two
        # distant rhyme partitions among the full-score seeds (at most six).
        chosen={}
        for field in ['score','doubleScore']:
            for v in sorted(report['seedScores'],key=lambda r:r[field])[:2]:chosen.setdefault(State.load(v['state']),[]).append(field)
        for v in sorted(report['seedScores'],key=lambda r:r['score']):
            s=State.load(v['state'])
            if len(chosen)>=4:break
            if all(s.partition!=t.partition for t in chosen):chosen[s]=['partition-diversity']
        for i,s in enumerate(chosen):
            for field in ['score','doubleScore']:descend(f'seed-{i}-{field}',field,cache[s],pool)
        if not any(s['name']=='bounded-two-hop' for s in report['stages']):
            twohop={};centers={}
            for field in ['score','doubleScore']:
                best=min(cache.values(),key=lambda r:r[field]);s=State.load(best['state']);moves=ctx.joint_neighbors(s);batch(moves,pool)
                for kind in sorted({m['kind'] for m in moves.values()}):
                    first=min((t for t,m in moves.items() if m['kind']==kind),key=lambda t:cache[t][field])
                    centers.setdefault(first,[]).append(dict(kind=kind,objective=field))
            for first,selection in centers.items():
                for t,move in ctx.joint_neighbors(first).items():twohop.setdefault(t,dict(firstState=dataclasses.asdict(first),selection=selection,secondMove=move))
            values=batch(twohop,pool);report['stages'].append(dict(name='bounded-two-hop',centers=len(centers),states=len(twohop),bestDefault=min(r['score'] for r in values),bestDouble=min(r['doubleScore'] for r in values)))
            write(output,report)
        # Cross-objective recenter until both terminal single neighborhoods and
        # all shared full-score records are closed for the respective endpoint.
        while True:
            changed=False
            for field in ['score','doubleScore']:
                best=min(cache.values(),key=lambda r:r[field]);decision=select_final_route(report['routes'],field,best)
                if decision is None:continue
                changed=True;name,center=decision;descend(name,field,center,pool,True)
            if not changed:break
    stream.close();archive=Path(str(PREFIX)+'-scores.jsonl.gz');archive.write_bytes(gzip.compress(log.read_bytes(),mtime=0))
    report.update(complete=True,newFullEvaluations=len(cache),elapsedLastInvocationSeconds=time.monotonic()-started,scoresSha256=sha(archive))
    export(ctx,report);write(output,report)
    print('COMPLETE',len(cache),[(r['name'],r['result']['score'],r['result']['doubleScore']) for r in report['routes'] if r.get('final')],flush=True)


if __name__=='__main__':main()
