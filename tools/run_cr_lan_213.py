"""Fixed Lan initials, intact-root regrouping, and daily-first CKT-capped annealing."""
import argparse
import copy
import json
import math
import os
from pathlib import Path
import random
import sqlite3
import time

from run_cr_anneal import ROOT,Engine,atomic_json,canonical,digest,lock_run,tuples,unpack,wait_resources
from run_cr_m24_portfolio import update_frontier,checked_metrics
from search_cr_667_zero_carriers import CarrierSpace

VERSION='cr-lan-213-daily-v1'
OPERATORS=['root-move','root-swap','root-cycle','whole-group-swap','two-group-repartition',
           'region-key-move','region-key-swap','region-key-cycle','multi-root-regroup','region-key-shuffle']


def budget(m,p):return m['d']<=p['maxD'] and m['m']<=p['maxM'] and m['guard']<=p['maxGuard']


def loads(m,p):return m['pinky']<=p['pinkyCeiling']+1e-12 and m['rightPinky']<=p['rightPinkyCeiling']+1e-12


def production(m,p):
    return (budget(m,p) and loads(m,p) and m['ckt']<=p['cktCeiling']+1e-9 and m['daily']>=p['dailyFloor']-1e-9)


def admissible(m,p,route):
    return (budget(m,p) and loads(m,p) and m['daily']>=p['explorationDailyFloor']-1e-9 and
            m['ckt']<=p['cktCeiling']+route['cktSlack']+1e-9)


def energy(m,p,route):
    if route['kind']=='ckt':return route['penalty']*(m['ckt']-p['cktCeiling'])
    return p['dailyFloor']-m['daily']+route['penalty']*max(0,m['ckt']-p['cktCeiling'])


def retain_frontier(frontier,item,p):
    # Crowding of diagnostic tradeoffs must never evict the best capped result.
    eligible=[r for r in [*frontier,item] if production(r['metrics'],p)]
    best=max(eligible,key=lambda r:(r['metrics']['daily'],-r['metrics']['ckt']),default=None)
    result=update_frontier(frontier,item)
    if best and not any(production(r['metrics'],p) and
        (r['metrics']['daily'],-r['metrics']['ckt']) >= (best['metrics']['daily'],-best['metrics']['ckt']) for r in result):
        result=[*result,best]
    return result


class LanSpace(CarrierSpace):
    def __init__(self,folder):
        super().__init__(folder)
        if self.spec['version']!=VERSION or self.spec['wordAuxiliaryPolicy']!=dict(word2='21',word3='213',word4='14'):
            raise ValueError('wrong fixed-Lan experiment contract')
        if self.spec['memoryModel']!=self.MEMORY_MODEL:raise ValueError('wrong M-T1 model')
        self.fixed=self.spec['fixedFirstKeys'];self.constraints=self.spec['constraints']

    def memory(self,state):
        if state['firstKeys']!=self.fixed:return None
        return super().memory(state)

    def mutate(self,state,rng,op=None):
        s=copy.deepcopy(state);p=s['partition'];keys=s['groupKeys'];op=rng.randrange(len(OPERATORS)) if op is None else op
        if op==0:p[rng.randrange(18)]=rng.randrange(10)
        elif op==1:
            a,b=rng.sample(range(18),2);p[a],p[b]=p[b],p[a]
        elif op==2:
            a,b,c=rng.sample(range(18),3);p[a],p[b],p[c]=p[c],p[a],p[b]
        elif op==3:
            a,b=rng.sample(range(10),2);s['partition']=[b if g==a else a if g==b else g for g in p]
        elif op==4:
            a,b=rng.sample(range(10),2);members=[i for i,g in enumerate(p) if g in [a,b]]
            if len(members)>1:
                rng.shuffle(members);cut=rng.randrange(1,len(members))
                for i in members[:cut]:p[i]=a
                for i in members[cut:]:p[i]=b
        elif op==5:
            r=rng.randrange(3);keys[r][rng.randrange(10)]=rng.choice(self.f['toneRegions'][r]['keys'])
        elif op==6:
            a,b=rng.sample(range(10),2)
            for r in rng.sample(range(3),rng.randint(1,3)):keys[r][a],keys[r][b]=keys[r][b],keys[r][a]
        elif op==7:
            a,b,c=rng.sample(range(10),3)
            for r in rng.sample(range(3),rng.randint(1,3)):keys[r][a],keys[r][b],keys[r][c]=keys[r][c],keys[r][a],keys[r][b]
        elif op==8:
            groups=rng.sample(range(10),rng.randint(2,4));members=[i for i,g in enumerate(p) if g in groups]
            rng.shuffle(members)
            for i,g in zip(members,groups):p[i]=g
            for i in members[len(groups):]:p[i]=rng.choice(groups)
        elif op==9:
            indices=rng.sample(range(10),rng.randint(3,6))
            for r in rng.sample(range(3),rng.randint(1,3)):
                values=[keys[r][i] for i in indices];rng.shuffle(values)
                for i,value in zip(indices,values):keys[r][i]=value
        return s,OPERATORS[op]

    def propose(self,state,rng):
        original=self.key(state)
        for attempt in range(128):
            candidate=state;ops=[]
            count=rng.randint(2,6) if rng.random()<.35 else 1
            for _ in range(count):candidate,name=self.mutate(candidate,rng);ops.append(name)
            m=self.memory(candidate)
            if not m or not budget(m,self.constraints) or self.key(candidate)==original:continue
            m.update(self.daily(candidate))
            if m['daily']>=self.constraints['explorationDailyFloor']-1e-9:return candidate,m,ops,attempt+1
        return state,dict(self.memory(state),**self.daily(state)),[],128


def source_contract(args,manifest):
    rust=ROOT/'research/ckt-v4-core'
    files=list((rust/'src').glob('*.rs'))+[rust/'src/bin/score-toned-stream.rs',rust/'src/cuda/rank.cu',rust/'Cargo.lock',rust/'Cargo.toml',rust/'build.rs']
    python=['run_cr_lan_213.py','run_cr_anneal.py','run_cr_m24_portfolio.py','search_cr_667_zero_carriers.py']
    return dict(version=VERSION,manifest=digest(manifest),
        scorerSources=digest({p.relative_to(rust).as_posix():p.read_text(encoding='utf8') for p in files}),
        runnerSources=digest({p:(ROOT/'tools'/p).read_text(encoding='utf8') for p in python}),
        seed=args.seed,batch=args.batch,cycle=args.cycle,temp=args.temp,minTemp=args.min_temp,
        exchangeEvery=args.exchange_every,verifyEvery=args.verify_every,cacheLimit=args.cache_limit,
        compositeProposalProbability=.35,compositePrimitiveCount=[2,6],operators=OPERATORS)


def export(folder,cp,space):
    p=space.constraints
    solutions=[r for r in cp['frontier'] if production(r['metrics'],p)]
    best=max(solutions,key=lambda r:(r['metrics']['daily'],-r['metrics']['ckt']),default=None)
    status=dict(version=VERSION,round=cp['round'],evaluations=cp['evaluations'],accepted=sum(c['accepted'] for c in cp['chains']),
        baseline=p,bestFeasible=None if best is None else dict(key=best['key'],metrics=best['metrics']),
        feasibleFrontier=len(solutions),diagnosticFrontier=len(cp['frontier'])-len(solutions),
        exchanges=cp['exchanges'],operatorCounts=cp['operatorCounts'],stalls=cp['stalls'],
        proposalSizeCounts=cp['proposalSizeCounts'],proposalAttempts=cp['proposalAttempts'],
        chains=[{k:c[k] for k in ['id','route','steps','accepted','restarts','metrics']} for c in cp['chains']])
    rows=[dict(r,expandedState=space.expand(r['state']),productionEligible=production(r['metrics'],p)) for r in cp['frontier']]
    atomic_json(folder/'frontier.json',dict(version=VERSION,contract=cp['contract'],round=cp['round'],layouts=rows))
    atomic_json(folder/'solutions.json',dict(version=VERSION,constraints=p,round=cp['round'],layouts=[r for r in rows if r['productionEligible']]))
    atomic_json(folder/'status.json',status)


def run(args):
    args.deadline=time.monotonic()+args.hours*3600 if args.hours else math.inf
    folder=args.output.resolve();folder.mkdir(parents=True,exist_ok=True);lock=lock_run(folder);engine=None;db=None
    try:
        manifest=unpack(args.bundle,folder/'inputs');space=LanSpace(folder/'inputs');contract=source_contract(args,manifest)
        routes=space.spec['routes'];p=space.constraints
        db=sqlite3.connect(folder/'search.sqlite');db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA synchronous=FULL')
        db.execute('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY,state TEXT,metrics TEXT,touched INTEGER)')
        db.execute('CREATE TABLE IF NOT EXISTS checkpoint (id INTEGER PRIMARY KEY CHECK(id=1),data TEXT)')
        stored=db.execute('SELECT data FROM checkpoint WHERE id=1').fetchone();cp=json.loads(stored[0]) if stored else None
        if cp and cp['contract']!=contract:raise ValueError('resume contract changed; use a new output directory')
        if (folder/'STOP').exists():return
        os.environ['CUDA_VISIBLE_DEVICES']=str(args.device)
        engine=Engine(args.exe.resolve(),folder/'inputs',args.backend,args.threads,args.timeout)
        seeds=[]
        for offset in range(0,len(space.spec['seeds']),args.batch):
            if not wait_resources(args,folder):return
            chunk=space.spec['seeds'][offset:offset+args.batch]
            scores=engine.score([space.expand(s['state']) for s in chunk],True)
            for s,score in zip(chunk,scores,strict=True):
                m=checked_metrics(space,s['state'],score,s['expected'])
                if not admissible(m,p,routes[s['route']]):raise ValueError('seed violates exploration envelope '+s['id'])
                seeds.append(dict(key=space.key(s['state']),state=s['state'],metrics=m,origin=s['id'],family='fixed-lan',route=s['route']))
        rng=random.Random(args.seed)
        if cp is None:
            cp=dict(contract=contract,round=0,evaluations=0,cursor=0,chains=[dict(s,id=s['origin'],steps=0,accepted=0,restarts=0) for s in seeds],
                frontier=[],rng=rng.getstate(),exchanges=dict(attempted=0,accepted=0),operatorCounts={name:0 for name in OPERATORS},stalls=0)
            cp['proposalSizeCounts']={str(n):0 for n in range(7)};cp['proposalAttempts']=0
            for s in seeds:cp['frontier']=retain_frontier(cp['frontier'],s,p)
        else:
            rng.setstate(tuples(cp['rng']))
            for c in cp['chains']:
                if not wait_resources(args,folder):return
                c['metrics']=checked_metrics(space,c['state'],engine.score([space.expand(c['state'])],True)[0],c['metrics'])
                if not admissible(c['metrics'],p,routes[c['route']]):raise ValueError('checkpoint outside exploration envelope')
        if args.batch>len(cp['chains']):raise ValueError('batch exceeds independent chains')
        for s in seeds:db.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?,?)',(s['key'],canonical(s['state']),canonical(s['metrics']),cp['round']))
        cp['rng']=rng.getstate();db.execute('INSERT OR REPLACE INTO checkpoint VALUES(1,?)',(canonical(cp),));db.commit();export(folder,cp,space)
        if args.audit_only:return
        end=cp['round']+args.rounds if args.rounds else math.inf;last_print=0.0
        temperature=lambda c:args.temp*routes[c['route']]['temperatureScale']*(args.min_temp/args.temp)**((c['steps']%args.cycle)/args.cycle)
        while cp['round']<end and wait_resources(args,folder):
            began=time.monotonic();pending=[]
            for i in range(args.batch):
                c=cp['chains'][(cp['cursor']+i)%len(cp['chains'])];route=routes[c['route']]
                if c['steps'] and c['steps']%args.cycle==0:
                    original=[s for s in seeds if s['origin']==c['origin']]
                    good=[r for r in cp['frontier'] if production(r['metrics'],p) and admissible(r['metrics'],p,route)]
                    broad=[r for r in cp['frontier'] if admissible(r['metrics'],p,route)]
                    draw=rng.random();pool=original if draw<.4 else good if draw<.75 and good else broad
                    pick=rng.choice(pool or original);c['state'],c['metrics'],c['key']=pick['state'],pick['metrics'],pick['key'];c['restarts']+=1
                state,m,ops,attempts=space.propose(c['state'],rng);key=space.key(state)
                cp['proposalSizeCounts'][str(len(ops))]+=1;cp['proposalAttempts']+=attempts
                for op in ops:cp['operatorCounts'][op]+=1
                if not ops:cp['stalls']+=1
                cached=db.execute('SELECT metrics FROM cache WHERE key=?',(key,)).fetchone()
                pending.append(dict(chain=c,state=state,key=key,metrics=json.loads(cached[0]) if cached else m,cached=bool(cached)))
            missing={r['key']:r for r in pending if not r['cached']}
            if missing:
                entries=list(missing.values());scores=engine.score([space.expand(r['state']) for r in entries],cp['round']%args.verify_every==0)
                cp['evaluations']+=len(entries)
                for row,score in zip(entries,scores,strict=True):row['metrics']=checked_metrics(space,row['state'],score)
                for row in pending:
                    if not row['cached']:row['metrics']=missing[row['key']]['metrics']
            for row in pending:
                c,m=row['chain'],row['metrics'];route=routes[c['route']]
                item=dict(key=row['key'],state=row['state'],metrics=m,origin=c['origin'],family='fixed-lan',route=c['route'])
                if any(admissible(m,p,r) for r in routes.values()):
                    candidate=retain_frontier(cp['frontier'],item,p)
                    if candidate is not cp['frontier']:
                        if not m['verified']:m.update(checked_metrics(space,row['state'],engine.score([space.expand(row['state'])],True)[0],m))
                        cp['frontier']=candidate
                delta=energy(m,p,route)-energy(c['metrics'],p,route)
                if admissible(m,p,route) and (delta<=0 or rng.random()<math.exp(-delta/temperature(c))):
                    c['state'],c['metrics'],c['key']=row['state'],m,row['key'];c['accepted']+=1
                c['steps']+=1
                db.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?,?)',(row['key'],canonical(row['state']),canonical(m),cp['round']))
            cp['round']+=1;cp['cursor']=(cp['cursor']+args.batch)%len(cp['chains'])
            if cp['round']%args.exchange_every==0:
                order=list(range(len(cp['chains'])));rng.shuffle(order)
                for i,j in zip(order[::2],order[1::2]):
                    a,b=cp['chains'][i],cp['chains'][j];ra,rb=routes[a['route']],routes[b['route']];cp['exchanges']['attempted']+=1
                    if not (admissible(a['metrics'],p,rb) and admissible(b['metrics'],p,ra)):continue
                    log_alpha=(energy(a['metrics'],p,ra)-energy(b['metrics'],p,ra))/temperature(a)+(energy(b['metrics'],p,rb)-energy(a['metrics'],p,rb))/temperature(b)
                    if log_alpha>=0 or rng.random()<math.exp(log_alpha):
                        for key in ['state','metrics','key']:a[key],b[key]=b[key],a[key]
                        cp['exchanges']['accepted']+=1
            cp['rng']=rng.getstate()
            if cp['round']%100==0:db.execute('DELETE FROM cache WHERE key IN (SELECT key FROM cache ORDER BY touched DESC LIMIT -1 OFFSET ?)',(args.cache_limit,))
            db.execute('INSERT OR REPLACE INTO checkpoint VALUES(1,?)',(canonical(cp),));db.commit();export(folder,cp,space)
            if time.monotonic()-last_print>=30:
                status=json.loads((folder/'status.json').read_text(encoding='utf8'))
                print(json.dumps({k:status[k] for k in ['round','evaluations','bestFeasible','exchanges']}),flush=True);last_print=time.monotonic()
            until=time.monotonic()+(time.monotonic()-began)*(1/args.duty-1)
            while time.monotonic()<min(until,args.deadline) and not (folder/'STOP').exists():time.sleep(max(0,min(1,until-time.monotonic())))
    finally:
        if db:db.close()
        if engine:engine.close()
        lock.close()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bundle',type=Path,default=ROOT/'research/config/cr-lan-213-inputs.zip')
    p.add_argument('--exe',type=Path,default=ROOT/'research/ckt-v4-core/target/release'/('score-toned-stream.exe' if os.name=='nt' else 'score-toned-stream'))
    p.add_argument('--output',type=Path,default=ROOT/'research/.cache/cr-lan-213-main')
    p.add_argument('--backend',choices=['cpu','cuda'],default='cuda');p.add_argument('--batch',type=int,choices=[1,2,3,4],default=2)
    p.add_argument('--seed',type=int,default=2026111801);p.add_argument('--threads',type=int,default=2);p.add_argument('--device',type=int,default=0)
    p.add_argument('--duty',type=float,default=.25);p.add_argument('--max-temp',type=float,default=75);p.add_argument('--min-free-mb',type=float,default=1024)
    p.add_argument('--timeout',type=float,default=300);p.add_argument('--hours',type=float,default=60);p.add_argument('--rounds',type=int,default=0)
    p.add_argument('--cycle',type=int,default=5000);p.add_argument('--temp',type=float,default=2);p.add_argument('--min-temp',type=float,default=.0001)
    p.add_argument('--exchange-every',type=int,default=50);p.add_argument('--verify-every',type=int,default=100)
    p.add_argument('--cache-limit',type=int,default=50000);p.add_argument('--audit-only',action='store_true')
    a=p.parse_args()
    if not(0<a.duty<=1 and a.threads>=1 and a.cycle>=1 and 0<a.min_temp<=a.temp and a.exchange_every>=1 and a.verify_every>=1
           and a.cache_limit>=8 and a.rounds>=0 and a.hours>=0):p.error('invalid annealing or resource settings')
    run(a)


if __name__=='__main__':main()
