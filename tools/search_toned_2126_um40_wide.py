"""Wide exact-scored UM40 rhyme annealing; frozen onsets, no surrogate scores."""
import argparse
import concurrent.futures
import dataclasses
import gzip
import hashlib
import itertools
import json
import math
import os
from pathlib import Path
import random
import time

from search_toned_2126_um40 import Context,State,ROOT,ROWS,PREFIX as PREVIOUS
from check_toned_2126_v52_seed_neighbors import read,write,sha
from toned_2126_v52_score_archives import score_archives

PREFIX=ROOT/'research/notes/2026-11-20-toned-2126-um40-wide'
WORK=ROOT/'research/.cache/toned-2126-um40-wide'
MUTATIONS=('root-move','root-swap','root-cycle','key-swap','key-cycle','key-reassign','policy','kick','regroup','crossover')
PAIRS=[tuple(''.join(p) for p in itertools.permutations('1234'[:n],2)) for n in (2,3,4)]


def canonical(s):
    """Label each group by its unique upper-row key; leave every code intact."""
    order=s.maps[0];inverse=[order.index(i) for i in range(10)]
    return dataclasses.replace(s,partition=tuple(order[g] for g in s.partition),
        maps=tuple(tuple(row[i] for i in inverse) for row in s.maps))


def nested_tuple(v):return tuple(nested_tuple(x) for x in v) if isinstance(v,list) else v


def atomic_checkpoint(path,value):
    temporary=path.with_name(path.name+'.tmp')
    with temporary.open('w',encoding='utf8',newline='\n') as stream:
        stream.write(json.dumps(value,ensure_ascii=False,indent=2)+'\n');stream.flush();os.fsync(stream.fileno())
    temporary.replace(path)


def recover_log(path,committed_bytes=None):
    """Keep only checkpoint-committed records; preserve any tail separately."""
    if not path.exists():
        if committed_bytes not in (None,0):raise ValueError('checkpoint score log missing')
        return []
    raw=path.read_bytes()
    if committed_bytes is None:boundary=raw.rfind(b'\n')+1
    else:
        boundary=committed_bytes
        if not 0<=boundary<=len(raw) or boundary and raw[boundary-1:boundary]!=b'\n':raise ValueError('invalid checkpoint score-log boundary')
    kept=raw[:boundary];rows=[json.loads(line) for line in kept.splitlines()]
    tail=raw[boundary:]
    if tail:
        backup=path.with_name(path.name+'.uncommitted-'+hashlib.sha256(tail).hexdigest()[:12])
        if backup.exists():assert backup.read_bytes()==tail
        else:backup.write_bytes(tail)
        path.write_bytes(kept)
    return rows


def accept(delta,temperature,u):return delta<=0 or math.log(max(u,1e-300))<-delta/temperature


def exchange(a,b,ta,tb,u):return math.log(max(u,1e-300))<min(0.,(1/ta-1/tb)*(a-b))


def compact(v):
    return dict(state=dataclasses.asdict(canonical(State.load(v['state']))),
        **{k:v[k] for k in ('score','doubleScore','memoryLower','memoryGuard','D')})


def propose(ctx,s,rng,kind=None,donor=None):
    """Draw actual legal root/key changes; retry invalid proposals, never onsets."""
    for _ in range(100):
        operation=kind or rng.choices(MUTATIONS,weights=(14,14,10,20,10,10,8,10,1,3))[0]
        part=list(s.partition);maps=[list(row) for row in s.maps];policy=list(s.policy)
        if operation=='root-move':
            a=rng.randrange(18);part[a]=rng.randrange(10)
        elif operation in ('root-swap','root-cycle'):
            indices=rng.sample(range(18),2 if operation=='root-swap' else rng.randint(3,7))
            values=[part[i] for i in indices];values=values[1:]+values[:1]
            for i,v in zip(indices,values):part[i]=v
        elif operation in ('key-swap','key-cycle'):
            row=rng.randrange(3);indices=rng.sample(range(10),2 if operation=='key-swap' else rng.randint(3,8))
            values=[maps[row][i] for i in indices];values=values[1:]+values[:1]
            for i,v in zip(indices,values):maps[row][i]=v
        elif operation=='key-reassign':
            row=rng.randrange(1,3);maps[row][rng.randrange(10)]=rng.randrange(len(ROWS[row]))
        elif operation=='policy':
            i=rng.randrange(3);policy[i]=rng.choice(PAIRS[i])
        elif operation=='regroup':
            indices=rng.sample(range(18),18);groups=list(range(10))+[rng.randrange(10) for _ in range(8)];rng.shuffle(groups)
            for i,g in zip(indices,groups):part[i]=g
        elif operation=='crossover' and donor is not None:
            if rng.random()<.5:part=list(donor.partition)
            for row in (1,2):
                if rng.random()<.65:maps[row]=list(donor.maps[row])
            if rng.random()<.5:policy=list(donor.policy)
        elif operation in ('kick','crossover'):
            # Several coupled changes may cross a single-move energy barrier.
            for _ in range(rng.randint(3,10)):
                if rng.random()<.45:
                    a,b=rng.sample(range(18),2);part[a],part[b]=part[b],part[a]
                else:
                    row=rng.randrange(3);a,b=rng.sample(range(10),2);maps[row][a],maps[row][b]=maps[row][b],maps[row][a]
        else:raise ValueError(operation)
        t=canonical(dataclasses.replace(s,partition=tuple(part),maps=tuple(tuple(row) for row in maps),policy=tuple(policy)))
        if t!=s and ctx.legal(t):return t
    raise RuntimeError('could not draw legal '+str(kind))


def distance(a,b):
    # Count root-to-physical-key differences, independent of group labels.
    return sum(a.maps[r][a.partition[i]]!=b.maps[r][b.partition[i]] for r in range(3) for i in range(18))


def diverse(cache,field,count,gap=.25):
    ordered=sorted(cache,key=lambda s:cache[s][field]);chosen=[];best=cache[ordered[0]][field]
    for s in ordered:
        if cache[s][field]>best+gap:break
        if all(distance(s,t)>=8 for t in chosen):chosen.append(s)
        if len(chosen)>=count:break
    return chosen


def elite_states(report,cache,sweep):
    if 'eliteStates' not in report or sweep%40==0:
        report['eliteStates']={f:[dataclasses.asdict(s) for s in diverse(cache,f,10)] for f in ('score','doubleScore')}
    return {f:[State.load(s) for s in states] for f,states in report['eliteStates'].items()}


def export(ctx,report,cache):
    layouts=[]
    for name,field in [('wide-default','score'),('wide-double','doubleScore')]:
        s=min(cache,key=lambda t:cache[t][field]);value=ctx.calculate(s);codes=ctx.expand(s)
        ident='T2126-UM40W-'+hashlib.sha256(codes.tobytes()).hexdigest()[:12]
        old=next((l for l in layouts if l['id']==ident and l['policy']==list(s.policy)),None)
        if old:old['originRoutes'].append(name);continue
        finals={f:s.partition[r] for f,r in ctx.final_roots.items()}
        layouts.append(dict(id=ident,originRoutes=[name],policy=list(s.policy),shapeKeysByMeaning='AEUIO',toneRowsByTone=ctx.tone_rows,
            tonedCodes=[''.join(chr(65+x) for x in row) for row in codes],firstKeys=dict(zip(ctx.names,s.first)),finalGroups=finals,regionMaps=s.maps,
            rhymeGroups=[dict(roots=[ctx.roots[i] for i,g in enumerate(s.partition) if g==group],finals=[f for f,g in finals.items() if g==group]) for group in range(10)],
            **{k:value[k] for k in ('score','doubleScore','tracks','ergonomics','memoryLower','memoryGuard','D')}))
    write(Path(str(PREFIX)+'-finalists.json'),dict(tokenKeys=ctx.token_keys,layouts=layouts))


def audit(main,workers):
    report=read(str(PREFIX)+'.json');assert report['complete'];ctx=Context(main);results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for layout in read(str(PREFIX)+'-finalists.json')['layouts']:
            center=canonical(ctx.state(layout));states=[dataclasses.replace(center,policy=p) for p in itertools.product(*PAIRS)]
            values=list(pool.map(ctx.calculate,states))
            def pick(field):
                best=min(values,key=lambda r:r[field]);return dict(policy=best['state']['policy'],score=best[field])
            default=pick('score');double=pick('doubleScore');anchor=next(r for r in values if tuple(r['state']['policy'])==tuple(layout['policy']))
            results.append(dict(id=layout['id'],originRoutes=layout['originRoutes'],publishedPolicy=layout['policy'],rightPinkyMaximum=1.,eligiblePolicies=144,
                policies=values,bestDefault=default,bestDouble=double,defaultRegret=anchor['score']-default['score'],doubleRegret=anchor['doubleScore']-double['score']))
            print('144 policies',layout['id'],default,double,flush=True)
    Path(str(PREFIX)+'-policies.json.gz').write_bytes(gzip.compress(json.dumps(dict(version=1,complete=True,newFullEvaluations=144*len(results),results=results),separators=(',',':')).encode(),mtime=0))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--workers',type=int,default=12);p.add_argument('--sweeps',type=int,default=1200);p.add_argument('--seed',type=int,default=21262026)
    p.add_argument('--main',type=Path,default=ROOT.parent/'shuangpin-layout-benchmark');p.add_argument('--audit',action='store_true');a=p.parse_args()
    if a.workers<1 or a.sweeps<1:p.error('workers and sweeps must be positive')
    if a.audit:audit(a.main,a.workers);return
    ctx=Context(a.main);WORK.mkdir(parents=True,exist_ok=True);output=Path(str(PREFIX)+'.json');log=WORK/'scores.jsonl'
    previous=read(str(PREVIOUS)+'.json');archives=score_archives(PREVIOUS)
    ctx.hashes.update({str(q):sha(q) for q in [Path(__file__),Path(str(PREVIOUS)+'.json'),Path(str(PREVIOUS)+'-scores-index.json'),*archives]})
    cache={}
    def ingest(value):
        v=compact(value);s=State.load(v['state'])
        if s in cache:
            assert abs(cache[s]['score']-v['score'])<1e-9 and abs(cache[s]['doubleScore']-v['doubleScore'])<1e-9
        cache[s]=v
    for q in archives:
        with gzip.open(q,'rt',encoding='utf8') as f:
            for line in f:ingest(json.loads(line))
    reused=len(cache)
    report=dict(version='UM40-fixed-onsets-wide-v1',complete=False,hashes=ctx.hashes,contract=previous['contract'],referenceR2=previous['referenceR2'],
        previousBest={field:min(v[field] for v in cache.values()) for field in ('score','doubleScore')},
        extraSourcePaths=['tools/search_toned_2126_um40.py','tools/search_toned_2126_um40_wide.py','research/config/toned-2126-um40-initials.json'],
        settings=dict(workers=a.workers,sweeps=a.sweeps,seed=a.seed,chainsPerObjective=12,temperatures=[.0007*100**(i/11) for i in range(12)],
            mutations=list(MUTATIONS),storage='All proposals use complete CKT5.2; archives retain state, both exact scores and M/D. Finalists independently rescore all tracks.'),
        reusedCanonicalStates=reused,sweep=0,routes=[],chains=[],annealComplete=False,polishComplete=False,history=[],rngState=None)
    rng=random.Random(a.seed)
    if output.exists():
        report=read(output)
        if report['hashes']!=ctx.hashes:raise ValueError('resume source fingerprints changed')
        if report['settings']['sweeps']!=a.sweeps or report['settings']['seed']!=a.seed:raise ValueError('resume settings changed')
        if report['complete']:print('Already complete');return
        if report['rngState'] is not None:rng.setstate(nested_tuple(report['rngState']))
    for value in recover_log(log,report.get('scoreLogBytes')):ingest(value)
    print('loaded',reused,'canonical previous states,',len(cache)-reused,'new cached states',flush=True)
    # Compile once before concurrent native calls.
    ctx.calculate(next(iter(cache)));started=time.monotonic();stream=log.open('a',encoding='utf8')
    def checkpoint():
        stream.flush();os.fsync(stream.fileno());report['scoreLogBytes']=log.stat().st_size
        report['rngState']=rng.getstate();report['newFullEvaluations']=len(cache)-reused;atomic_checkpoint(output,report)
    def batch(states,pool):
        states=list(dict.fromkeys(states));missing=[s for s in states if s not in cache]
        for s,v in zip(missing,pool.map(ctx.calculate,missing),strict=True):
            row=compact(v);assert State.load(row['state'])==s;cache[s]=row;stream.write(json.dumps(row,separators=(',',':'))+'\n')
        stream.flush()
    def descend(name,field,s,pool,final=False):
        route=next((r for r in report['routes'] if r['name']==name),None)
        if route is not None and route['complete']:return
        if route is None:
            route=dict(name=name,objective=field,complete=False,final=final,result=cache[s],passes=[]);report['routes'].append(route)
        while True:
            s=State.load(route['result']['state']);moves={canonical(t) for t in ctx.joint_neighbors(s)};moves.discard(s);batch(moves,pool)
            best=min([s,*moves],key=lambda t:cache[t][field]);route['passes'].append(dict(anchorState=dataclasses.asdict(s),neighbors=len(moves),bestObjective=cache[best][field]))
            print('polish',name,'pass',len(route['passes']),cache[best]['score'],cache[best]['doubleScore'],'new',len(cache)-reused,flush=True)
            if cache[best][field]>=cache[s][field]-1e-10:route['complete']=True;checkpoint();return
            route['result']=cache[best];checkpoint()
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
        if not report['chains']:
            for field in ('score','doubleScore'):
                seeds=diverse(cache,field,12)
                for i,t in enumerate(report['settings']['temperatures']):
                    s=seeds[i%len(seeds)]
                    if i>=6:s=propose(ctx,s,rng,kind='kick')
                    batch([s],pool);report['chains'].append(dict(objective=field,temperature=t,state=dataclasses.asdict(s),accepted=0,proposed=0))
            checkpoint()
        first_sweep=report['sweep']
        for sweep in range(first_sweep,a.sweeps):
            if report['annealComplete']:break
            elites=elite_states(report,cache,sweep)
            proposals=[]
            for i,chain in enumerate(report['chains']):
                field=chain['objective'];s=State.load(chain['state']);donor=rng.choice(elites[field])
                if sweep and sweep%200==0 and i%12>=6:s=donor
                kind='kick' if sweep and sweep%200==0 and i%12>=6 else None
                proposals.append(propose(ctx,s,rng,kind=kind,donor=donor))
            batch(proposals,pool)
            cooling=.25+.75*(1-(sweep%200)/200)
            for i,(chain,t) in enumerate(zip(report['chains'],proposals)):
                s=State.load(chain['state']);field=chain['objective'];chain['proposed']+=1
                restart=sweep and sweep%200==0 and i%12>=6
                if restart or accept(cache[t][field]-cache[s][field],chain['temperature']*cooling,rng.random()):
                    chain['state']=dataclasses.asdict(t);chain['accepted']+=1
            if sweep%10==9:
                for offset in (0,12):
                    for j in range((sweep//10)%2,11,2):
                        a1,b1=report['chains'][offset+j:offset+j+2];field=a1['objective']
                        ea=cache[State.load(a1['state'])][field];eb=cache[State.load(b1['state'])][field]
                        if exchange(ea,eb,a1['temperature']*cooling,b1['temperature']*cooling,rng.random()):a1['state'],b1['state']=b1['state'],a1['state']
            report['sweep']=sweep+1
            if (sweep+1)%20==0:
                best={f:min(v[f] for v in cache.values()) for f in ('score','doubleScore')};report['history'].append(dict(sweep=sweep+1,newStates=len(cache)-reused,**best));checkpoint()
                print('anneal',sweep+1,'/',a.sweeps,'new',len(cache)-reused,'best',best,'elapsed',round(time.monotonic()-started),flush=True)
        report['annealComplete']=True;checkpoint()
        if 'polishSeeds' not in report:
            report['polishSeeds']=[dict(objective=f,state=dataclasses.asdict(s)) for f in ('score','doubleScore') for s in diverse(cache,f,3,.12)]
            checkpoint()
        for i,seed in enumerate(report['polishSeeds']):descend('basin-'+str(i),seed['objective'],State.load(seed['state']),pool)
        # Recenter on all shared evaluations until both best endpoints close.
        while True:
            pending=False
            for field in ('score','doubleScore'):
                own=[r for r in report['routes'] if r.get('final') and r['objective']==field]
                unfinished=next((r for r in own if not r['complete']),None);s=min(cache,key=lambda t:cache[t][field])
                if unfinished:descend(unfinished['name'],field,State.load(unfinished['result']['state']),pool,True);pending=True
                elif not own or cache[s][field]<min(r['result'][field] for r in own)-1e-10:
                    descend('final-'+field+'-'+str(len(own)+1),field,s,pool,True);pending=True
            if not pending:break
        report['polishComplete']=True;checkpoint()
    stream.close();archive=Path(str(PREFIX)+'-scores.jsonl.gz');archive.write_bytes(gzip.compress(log.read_bytes(),mtime=0))
    report.update(complete=True,newFullEvaluations=len(cache)-reused,elapsedLastInvocationSeconds=time.monotonic()-started,scoresSha256=sha(archive),
        best={f:cache[min(cache,key=lambda s:cache[s][f])] for f in ('score','doubleScore')})
    export(ctx,report,cache);atomic_checkpoint(output,report)
    print('COMPLETE',report['newFullEvaluations'],{f:r[f] for f,r in report['best'].items()},flush=True)


if __name__=='__main__':main()
