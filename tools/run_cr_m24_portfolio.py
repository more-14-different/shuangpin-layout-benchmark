"""Portable multi-seed M24/D2 annealing; one persistent CUDA process, exact CPU audits."""
import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import random
import sqlite3
import time

from run_cr_anneal import ROOT,Engine,atomic_json,canonical,digest,lock_run,tuples,unpack,wait_resources
from search_cr_667_zero_carriers import CarrierSpace

VERSION='cr-m24-portfolio-v1'


def fits_budget(m,p):
    return m['d']<=p['maxD'] and m['m']<=p['maxM'] and m['guard']<=p['maxGuard']


def eligible(m,p):
    return (fits_budget(m,p) and m['daily']>=p['dailyFloor']-1e-9 and
        m['pinky']<=p['pinkyCeiling']+1e-12 and m['rightPinky']<=p['rightPinkyCeiling']+1e-12)


class PortfolioSpace(CarrierSpace):
    def __init__(self,folder):
        super().__init__(folder)
        if self.spec['version']!=VERSION or self.spec['memoryModel']!=self.MEMORY_MODEL:raise ValueError('wrong portable portfolio contract')
        self.indices={a['name']:i for i,a in enumerate(self.f['atoms'])}
        self.signatures={self.signature(s['state']) for s in self.spec['seeds']}

    @staticmethod
    def signature(state):
        return (tuple(state['partition']),tuple(tuple(sorted(row)) for row in state['groupKeys']))

    def memory(self,state):
        if self.signature(state) not in self.signatures:return None
        return super().memory(state)

    def mutate(self,state,rng):
        s=copy.deepcopy(state);first=s['firstKeys'];op=rng.randrange(10)
        if op in [0,2,3,4,6]:
            names=([f'zero-{n}' for n in 'AEOWY'] if op==0 else [f'zero-{n}' for n in 'AEO'] if op==2
                else ['zero-W','zero-Y'] if op==3 else ['zh','ch','sh'] if op==4
                else [a['name'] for a in self.f['atoms'] if len(a['initial'])==1 and a['initial']!='_'])
            selected=rng.sample(names,rng.randint(1,len(names))) if op in [2,3] else [rng.choice(names)]
            for name in selected:first[self.indices[name]]=rng.choice(self.allowed_first)
        elif op==1:
            target=rng.choice(self.allowed_first)
            for name in 'AEO':first[self.indices['zero-'+name]]=target
        elif op in [5,7]:
            indices=[self.indices[n] for n in ['zh','ch','sh']] if op==5 else list(range(len(first)))
            a,b=rng.sample(indices,2);first[a],first[b]=first[b],first[a]
        else:
            a,b=rng.sample(range(10),2);regions=[rng.randrange(3)] if op==8 else range(3)
            for r in regions:s['groupKeys'][r][a],s['groupKeys'][r][b]=s['groupKeys'][r][b],s['groupKeys'][r][a]
        return s

    def propose(self,state,rng,profile):
        for _ in range(256):
            s=self.mutate(state,rng)
            if rng.random()<.35:
                for _ in range(rng.randint(1,4)):s=self.mutate(s,rng)
            memory=self.memory(s)
            if memory and fits_budget(memory,profile) and self.key(s)!=self.key(state):
                memory.update(self.daily(s))
                if memory['daily']>=profile['dailyFloor']-1e-9:return s,memory
        return state,dict(self.memory(state),**self.daily(state))


FIELDS=['ckt','daily','pinky','rightPinky','m','guard','d']
def objective(m):return [m['ckt'],-m['daily'],m['pinky'],m['rightPinky'],m['m'],m['guard'],m['d']]


def update_frontier(frontier,item,limit=256):
    candidate=objective(item['metrics'])
    dominates=lambda a,b:all(x<=y for x,y in zip(a,b)) and any(x<y for x,y in zip(a,b))
    if any(r['key']==item['key'] or dominates(objective(r['metrics']),candidate) for r in frontier):return frontier
    result=[r for r in frontier if not dominates(candidate,objective(r['metrics']))]+[item]
    while len(result)>limit:
        distance=[0.0]*len(result)
        for field in FIELDS:
            order=sorted(range(len(result)),key=lambda i:result[i]['metrics'][field]);lo=result[order[0]]['metrics'][field];hi=result[order[-1]]['metrics'][field]
            if lo==hi:continue
            distance[order[0]]=distance[order[-1]]=math.inf
            for i in range(1,len(order)-1):distance[order[i]]+=(result[order[i+1]]['metrics'][field]-result[order[i-1]]['metrics'][field])/(hi-lo)
        del result[min(range(len(result)),key=lambda i:(distance[i],-result[i]['metrics']['ckt']))]
    return result


def checked_metrics(space,state,score,previous=None):
    if not all(math.isfinite(score[k]) for k in ['ckt','pinky','rightPinky']):raise ValueError('non-finite native metric')
    result=dict(space.memory(state),**space.daily(state),**score)
    if previous:
        for field in ['ckt','daily','pinky','rightPinky','m','guard','d']:
            if abs(result[field]-previous[field])>1e-9:raise ValueError('exact replay mismatch: '+field)
    return result


def export(folder,cp,space):
    layouts=[dict(row,expandedState=space.expand(row['state']),
        eligibleRoutes=[name for name,p in space.spec['profiles'].items() if eligible(row['metrics'],p)]) for row in cp['frontier']]
    status=dict(version=VERSION,round=cp['round'],evaluations=cp['evaluations'],frontier=len(layouts),
        bestByRoute={name:min((r['metrics']['ckt'] for r in layouts if eligible(r['metrics'],profile)),default=None)
            for name,profile in space.spec['profiles'].items()},
        chains=[{k:c[k] for k in ['id','family','route','steps','accepted','metrics','restarts']} for c in cp['chains']])
    atomic_json(folder/'frontier.json',dict(version=VERSION,contract=cp['contract'],round=cp['round'],layouts=layouts))
    atomic_json(folder/'status.json',status)


def source_contract(args,manifest):
    rust=ROOT/'research/ckt-v4-core';files=list((rust/'src').glob('*.rs'))+[rust/'src/bin/score-toned-stream.rs',rust/'src/cuda/rank.cu',rust/'Cargo.lock',rust/'Cargo.toml',rust/'build.rs']
    python=['run_cr_m24_portfolio.py','run_cr_anneal.py','search_cr_667_zero_carriers.py','explore_cr_stable_neighbors.py','explore_cr_frontier_followup.py']
    return dict(version=VERSION,manifest=digest(manifest),
        scorerSources=digest({p.relative_to(rust).as_posix():p.read_text(encoding='utf8') for p in files}),
        runnerSources=digest({name:(ROOT/'tools'/name).read_text(encoding='utf8') for name in python}),
        seed=args.seed,batch=args.batch,cycle=args.cycle,temp=args.temp,minTemp=args.min_temp,cacheLimit=args.cache_limit,
        restartProbabilities=dict(original=.5,sameFamily=.35,globalFrontier=.15),compositeProposalProbability=.35)


def run(args):
    args.deadline=time.monotonic()+args.hours*3600 if args.hours else math.inf
    folder=args.output.resolve();folder.mkdir(parents=True,exist_ok=True);lock=lock_run(folder);engine=None;db=None
    try:
        manifest=unpack(args.bundle,folder/'inputs');space=PortfolioSpace(folder/'inputs');contract=source_contract(args,manifest)
        db=sqlite3.connect(folder/'search.sqlite');db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA synchronous=FULL')
        db.execute('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY,state TEXT,metrics TEXT,touched INTEGER)')
        db.execute('CREATE TABLE IF NOT EXISTS checkpoint (id INTEGER PRIMARY KEY CHECK(id=1),data TEXT)')
        stored=db.execute('SELECT data FROM checkpoint WHERE id=1').fetchone();cp=json.loads(stored[0]) if stored else None
        if cp and cp['contract']!=contract:raise ValueError('resume contract changed; keep the old directory and use a new output')
        os.environ['CUDA_VISIBLE_DEVICES']=str(args.device)
        engine=Engine(args.exe.resolve(),folder/'inputs',args.backend,args.threads,args.timeout)
        seeds=[]
        for offset in range(0,len(space.spec['seeds']),args.batch):
            if not wait_resources(args,folder):return
            chunk=space.spec['seeds'][offset:offset+args.batch]
            scores=engine.score([space.expand(s['state']) for s in chunk],True)
            for s,score in zip(chunk,scores,strict=True):
                metrics=checked_metrics(space,s['state'],score,s['expected']);profile=space.spec['profiles'][s['route']]
                if not eligible(metrics,profile):raise ValueError('ineligible frozen seed '+s['id'])
                seeds.append(dict(key=space.key(s['state']),state=s['state'],metrics=metrics,origin=s['id'],family=s['family'],route=s['route']))
        print(json.dumps(dict(auditedSeeds=len(seeds),policy=space.spec['wordAuxiliaryPolicy'],profiles=space.spec['profiles'])),flush=True)
        if args.batch>len(seeds):raise ValueError('batch cannot exceed independent chains')
        rng=random.Random(args.seed)
        if cp is None:
            cp=dict(contract=contract,round=0,evaluations=0,cursor=0,chains=[dict(s,id=s['origin'],steps=0,accepted=0,restarts=0) for s in seeds],frontier=[],rng=rng.getstate())
            for row in seeds:cp['frontier']=update_frontier(cp['frontier'],row)
        else:
            rng.setstate(tuples(cp['rng']))
            for c in cp['chains']:
                if not wait_resources(args,folder):return
                m=checked_metrics(space,c['state'],engine.score([space.expand(c['state'])],True)[0],c['metrics'])
                if not eligible(m,space.spec['profiles'][c['route']]):raise ValueError('checkpoint violates chain profile')
        for row in seeds:db.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?,?)',(row['key'],canonical(row['state']),canonical(row['metrics']),cp['round']))
        db.execute('INSERT OR REPLACE INTO checkpoint VALUES(1,?)',(canonical(cp),));db.commit();export(folder,cp,space)
        if args.audit_only:return
        end=cp['round']+args.rounds if args.rounds else math.inf;last_print=0.0
        while cp['round']<end and wait_resources(args,folder):
            began=time.monotonic();pending=[]
            for i in range(args.batch):
                c=cp['chains'][(cp['cursor']+i)%len(cp['chains'])];profile=space.spec['profiles'][c['route']]
                if c['steps'] and c['steps']%args.cycle==0:
                    original=[s for s in seeds if s['origin']==c['origin']];same=[s for s in cp['frontier'] if s['family']==c['family'] and eligible(s['metrics'],profile)]
                    global_pool=[s for s in cp['frontier'] if eligible(s['metrics'],profile)];choice=rng.random()
                    pool=original if choice<.5 else same if choice<.85 and same else global_pool
                    pick=rng.choice(pool or original);c['state'],c['metrics']=pick['state'],pick['metrics'];c['key']=pick['key'];c['restarts']+=1
                state,m=space.propose(c['state'],rng,profile);key=space.key(state)
                cached=db.execute('SELECT metrics FROM cache WHERE key=?',(key,)).fetchone()
                pending.append(dict(chain=c,state=state,metrics=json.loads(cached[0]) if cached else m,key=key,cached=bool(cached)))
            missing={p['key']:p for p in pending if not p['cached']}
            if missing:
                entries=list(missing.values());scores=engine.score([space.expand(p['state']) for p in entries],cp['round']%args.verify_every==0)
                cp['evaluations']+=len(entries)
                for p,score in zip(entries,scores,strict=True):p['metrics']=checked_metrics(space,p['state'],score)
                for p in pending:
                    if not p['cached']:p['metrics']=missing[p['key']]['metrics']
            for p in pending:
                c,m=p['chain'],p['metrics'];profile=space.spec['profiles'][c['route']]
                item=dict(key=p['key'],state=p['state'],metrics=m,origin=c['origin'],family=c['family'],route=c['route'])
                # Hard load constraints also apply to every published frontier item.
                if any(eligible(m,profile) for profile in space.spec['profiles'].values()):
                    candidate_frontier=update_frontier(cp['frontier'],item)
                    if candidate_frontier is not cp['frontier']:
                        if not m['verified']:m.update(checked_metrics(space,p['state'],engine.score([space.expand(p['state'])],True)[0],m))
                        cp['frontier']=candidate_frontier
                temperature=args.temp*(args.min_temp/args.temp)**((c['steps']%args.cycle)/args.cycle);delta=m['ckt']-c['metrics']['ckt']
                if eligible(m,profile) and (delta<=0 or rng.random()<math.exp(-delta/temperature)):
                    c['state'],c['metrics']=p['state'],m;c['key']=p['key'];c['accepted']+=1
                c['steps']+=1
                db.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?,?)',(p['key'],canonical(p['state']),canonical(m),cp['round']))
            cp['round']+=1;cp['cursor']=(cp['cursor']+args.batch)%len(cp['chains']);cp['rng']=rng.getstate()
            if cp['round']%100==0:db.execute('DELETE FROM cache WHERE key IN (SELECT key FROM cache ORDER BY touched DESC LIMIT -1 OFFSET ?)',(args.cache_limit,))
            db.execute('INSERT OR REPLACE INTO checkpoint VALUES(1,?)',(canonical(cp),));db.commit();export(folder,cp,space)
            if time.monotonic()-last_print>=30:
                print(json.dumps(dict(round=cp['round'],evaluations=cp['evaluations'],bestByRoute={name:min((r['metrics']['ckt'] for r in cp['frontier'] if eligible(r['metrics'],profile)),default=None) for name,profile in space.spec['profiles'].items()})),flush=True);last_print=time.monotonic()
            sleep_until=time.monotonic()+(time.monotonic()-began)*(1/args.duty-1)
            while time.monotonic()<min(sleep_until,args.deadline) and not (folder/'STOP').exists():time.sleep(max(0,min(1,sleep_until-time.monotonic())))
    finally:
        if db:db.close()
        if engine:engine.close()
        lock.close()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bundle',type=Path,default=ROOT/'research/config/cr-m24-portfolio-inputs.zip')
    p.add_argument('--exe',type=Path,default=ROOT/'research/ckt-v4-core/target/release'/('score-toned-stream.exe' if os.name=='nt' else 'score-toned-stream'))
    p.add_argument('--output',type=Path,default=ROOT/'research/.cache/cr-m24-portfolio')
    p.add_argument('--backend',choices=['cpu','cuda'],default='cuda');p.add_argument('--batch',type=int,choices=[1,2,3,4],default=2)
    p.add_argument('--seed',type=int,default=2026111701);p.add_argument('--threads',type=int,default=2);p.add_argument('--device',type=int,default=0)
    p.add_argument('--duty',type=float,default=.25);p.add_argument('--max-temp',type=float,default=75);p.add_argument('--min-free-mb',type=float,default=1024)
    p.add_argument('--timeout',type=float,default=300);p.add_argument('--hours',type=float,default=0);p.add_argument('--rounds',type=int,default=0)
    p.add_argument('--cycle',type=int,default=5000);p.add_argument('--temp',type=float,default=.025);p.add_argument('--min-temp',type=float,default=.00002)
    p.add_argument('--verify-every',type=int,default=100);p.add_argument('--cache-limit',type=int,default=50000);p.add_argument('--audit-only',action='store_true')
    a=p.parse_args()
    if not (0<a.duty<=1 and a.threads>=1 and a.cycle>=1 and 0<a.min_temp<=a.temp and a.verify_every>=1 and a.cache_limit>=8 and a.rounds>=0 and a.hours>=0):p.error('invalid resource or annealing settings')
    try:run(a)
    except KeyboardInterrupt:print('Stopped; rerun the same command/output to replay the uncommitted batch.')


if __name__=='__main__':main()
