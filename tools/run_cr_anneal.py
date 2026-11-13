"""Portable exact CR portfolio annealing. Standard-library Python + persistent Rust/CUDA.

One proposal per independent chain, never best-of-batch acceptance. SQLite commits
scores, chains, RNG and frontier together. A killed batch is replayed on resume.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import queue
import random
import sqlite3
import subprocess
import threading
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = 1

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()

def atomic_json(path, value):
    temp = path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    os.replace(temp, path)

def unpack(bundle, target):
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(bundle) as z:
        manifest = json.loads(z.read('manifest.json'))
        for name, expected in manifest['files'].items():
            if Path(name).name != name or '/' in name or '\\' in name:
                raise ValueError('bundle paths must be plain filenames')
            content = z.read(name)
            if hashlib.sha256(content).hexdigest() != expected: raise ValueError('bundle hash mismatch: '+name)
            p = target/name
            if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest() != expected: p.write_bytes(content)
    return manifest

class SearchSpace:
    def __init__(self, folder, fixed_first=False):
        self.spec = json.loads((folder/'seeds.json').read_text(encoding='utf8'))
        self.f = json.loads((folder/'fixture.json').read_text(encoding='utf8'))
        self.fixed_first = fixed_first
        self.allowed_first = self.f['soundKeys']
        module = importlib.util.spec_from_file_location('cr_moving_hand', folder/'moving_hand.py')
        self.engine = importlib.util.module_from_spec(module); module.loader.exec_module(self.engine)

    def expand(self, s):
        return dict(firstKeys=s['firstKeys'], rhymeKeys=[
            [keys[s['partition'][root]] for root in self.spec['finalRoots']] for keys in s['groupKeys']])

    def key(self, s):
        # Canonical by actual layout, not arbitrary group numbering.
        return digest([self.expand(s),self.memory(s)])

    def memory(self, s):
        p, keys, first = s['partition'], s['groupKeys'], s['firstKeys']
        if len(p)!=18 or set(p)!=set(range(10)) or len(keys)!=3 or len(first)!=len(self.f['atoms']): return None
        if any(len(row)!=10 or any(k not in self.f['toneRegions'][i]['keys'] for k in row) for i,row in enumerate(keys)): return None
        if any(k not in self.allowed_first for k in first): return None
        if self.fixed_first and first != self.spec['seeds'][0]['state']['firstKeys']: return None
        cost = sum(a['moveMemoryDelta'] for i,a in enumerate(self.f['atoms']) if first[i]!=a['baselineKey'])
        d = sum(first[i]!=a['baselineKey'] for i,a in enumerate(self.f['atoms']) if len(a['initial'])==1 and a['initial']!='_')
        merge = sum(10-len(set(row)) for row in keys)
        return dict(d=d, m=5+cost+sum(p.count(g)>1 for g in range(10))+merge, guard=5+cost+8+merge)

    def daily(self, s):
        e = self.expand(s); a,b=e['firstKeys'], e['rhymeKeys']
        seq = self.spec['dailySequence']
        strokes = ''.join(t if isinstance(t,str) else a[t[0]]+b[t[2]][t[1]] for t in seq).lower()
        m = self.engine.evaluate(strokes,len(seq))
        return dict(daily=m['score'], dailyPinky=m['finger_load'][0]/m['hits'])

    def mutate(self, state, rng):
        s = copy.deepcopy(state); p, keys, first = s['partition'],s['groupKeys'],s['firstKeys']
        touched = None
        op = rng.randrange(8 if not self.fixed_first else 6)
        if op in [0,5]:
            root = rng.randrange(18); target = rng.randrange(10)
            touched = (p[root],target); p[root]=target
        elif op == 1:
            a,b=rng.sample(range(18),2); p[a],p[b]=p[b],p[a]
        elif op == 2:
            for root in ['er','v']: p[self.spec['roots'].index(root)]=rng.randrange(10)
        elif op == 3:
            r=rng.randrange(3); keys[r][rng.randrange(10)]=rng.choice(self.f['toneRegions'][r]['keys'])
        elif op == 4:
            r=rng.randrange(3); a,b=rng.sample(range(10),2); keys[r][a],keys[r][b]=keys[r][b],keys[r][a]
        elif op == 6:
            first[rng.randrange(len(first))]=rng.choice(self.allowed_first)
        elif op == 7:
            a,b=rng.sample(range(len(first)),2); first[a],first[b]=first[b],first[a]
        if op == 5:
            a,b=touched; r=rng.randrange(3); keys[r][a],keys[r][b]=keys[r][b],keys[r][a]
        return s

    def propose(self, state, rng, profile):
        for _ in range(128):
            s=self.mutate(state,rng)
            if rng.random()<0.20:
                for _ in range(rng.randint(1,3)): s=self.mutate(s,rng)
            m=self.memory(s)
            if m and fits_budget(m,profile) and self.key(s)!=self.key(state):
                m.update(self.daily(s))
                if m['daily']>=profile['dailyFloor']: return s,m
        return state, dict(self.memory(state), **self.daily(state))

def fits_budget(m,p):
    return m['d']<=2 and m['m']<=p['maxM'] and m['guard']<=24

def eligible(m,p):
    return fits_budget(m,p) and m['daily']>=p['dailyFloor'] and m['pinky']<=p['pinkyCeiling']

def dominates(a,b):
    x=[a['ckt'],-a['daily'],a['pinky'],a['m'],a['guard'],a['d']]
    y=[b['ckt'],-b['daily'],b['pinky'],b['m'],b['guard'],b['d']]
    return all(u<=v for u,v in zip(x,y)) and any(u<v for u,v in zip(x,y))

def update_frontier(frontier, item, limit=256):
    if any(x['key']==item['key'] or dominates(x['metrics'],item['metrics']) for x in frontier): return frontier
    result=[x for x in frontier if not dominates(item['metrics'],x['metrics'])]+[item]
    # Bounded crowding reduction; every examined result also goes into SQLite.
    while len(result)>limit:
        distances=[0.0]*len(result)
        for field in ['ckt','daily','pinky','m','guard','d']:
            order=sorted(range(len(result)),key=lambda i:result[i]['metrics'][field])
            low,high=result[order[0]]['metrics'][field],result[order[-1]]['metrics'][field]
            if low==high: continue
            distances[order[0]]=distances[order[-1]]=math.inf
            for n in range(1,len(order)-1):
                distances[order[n]]+=(result[order[n+1]]['metrics'][field]-result[order[n-1]]['metrics'][field])/(high-low)
        del result[min(range(len(result)),key=lambda i:(distances[i],-result[i]['metrics']['ckt']))]
    return result

class Engine:
    def __init__(self, exe, folder, backend, threads, timeout):
        env=dict(os.environ,RAYON_NUM_THREADS=str(threads),OMP_NUM_THREADS=str(threads))
        flags=(subprocess.CREATE_NO_WINDOW|subprocess.BELOW_NORMAL_PRIORITY_CLASS) if os.name=='nt' else 0
        self.p=subprocess.Popen([str(exe),str(folder/'corpus.bin'),str(folder/'snapshot.json'),str(folder/'fixture.json'),backend],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=None,text=True,encoding='utf8',env=env,creationflags=flags)
        self.q=queue.Queue(); self.timeout=timeout
        def reader():
            for line in self.p.stdout: self.q.put(line)
            self.q.put(None)
        threading.Thread(target=reader,daemon=True).start()
        try:
            self.ready=self.receive()
            if self.ready.get('protocol')!=1: raise RuntimeError('unexpected scorer protocol')
        except BaseException:
            self.p.kill(); self.p.wait(); raise
        print(json.dumps(self.ready),flush=True)

    def receive(self):
        try: line=self.q.get(timeout=self.timeout)
        except queue.Empty: raise RuntimeError('scorer timed out; last committed checkpoint remains valid')
        if line is None: raise RuntimeError('scorer exited; see stderr')
        return json.loads(line)

    def score(self, states, verify=False):
        self.p.stdin.write(json.dumps(dict(states=states,verify=verify))+'\n'); self.p.stdin.flush()
        result=self.receive()
        if len(result['results'])!=len(states) or (verify and not result['verified']): raise RuntimeError('invalid scorer reply')
        for m in result['results']:
            if not all(math.isfinite(m[k]) for k in ['ckt','pinky']): raise RuntimeError('non-finite score')
            m['verified']=result['verified']
        return result['results']

    def close(self):
        if self.p.poll() is None:
            self.p.stdin.close()
            try: self.p.wait(timeout=5)
            except subprocess.TimeoutExpired: self.p.kill(); self.p.wait()

def lock_run(folder):
    f=(folder/'run.lock').open('a+b'); f.seek(0); f.write(b'1'); f.flush(); f.seek(0)
    try:
        if os.name=='nt':
            import msvcrt
            msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except OSError:
        f.close(); raise RuntimeError('another runner owns this output directory')
    return f

def wait_resources(args, folder):
    while True:
        if (folder/'STOP').exists() or time.monotonic()>=args.deadline: return False
        blocked=(folder/'PAUSE').exists()
        if args.backend=='cuda' and not blocked:
            flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
            raw=subprocess.check_output(['nvidia-smi','-i',str(args.device),
                '--query-gpu=temperature.gpu,memory.free','--format=csv,noheader,nounits'],text=True,creationflags=flags,timeout=15)
            temp,free=[float(x.strip()) for x in raw.strip().split(',')]
            blocked=temp>=args.max_temp or free<args.min_free_mb
        if not blocked: return True
        time.sleep(1)

def tuples(x):
    return tuple(tuples(v) for v in x) if isinstance(x,list) else x

def export(folder, cp, space):
    layouts=[]
    for item in cp['frontier']:
        s=item['state']; p=s['partition']
        groups=[dict(roots=[r for i,r in enumerate(space.spec['roots']) if p[i]==g],
                     keys={region['name']:s['groupKeys'][ri][g] for ri,region in enumerate(space.f['toneRegions'])}) for g in range(10)]
        layouts.append(dict(item, rhymeGroups=groups, expandedState=space.expand(s)))
    atomic_json(folder/'frontier.json',dict(version=VERSION,contract=cp['contract'],round=cp['round'],layouts=layouts))
    atomic_json(folder/'status.json',dict(round=cp['round'],evaluations=cp['evaluations'],
                frontier=len(layouts),bestCkt=min(x['metrics']['ckt'] for x in layouts),
                chains=[{k:c[k] for k in ['id','steps','accepted','metrics','profile']} for c in cp['chains']]))

def run(args):
    args.deadline=time.monotonic()+args.hours*3600 if args.hours else math.inf
    folder=args.output.resolve(); folder.mkdir(parents=True,exist_ok=True)
    lock=lock_run(folder); engine=None; db=None
    try:
        manifest=unpack(args.bundle,folder/'inputs'); space=SearchSpace(folder/'inputs',args.fixed_first)
        rust=ROOT/'research/ckt-v4-core'
        source_files=sorted((rust/'src').rglob('*.rs'))+[rust/'src/cuda/rank.cu',rust/'Cargo.lock']
        contract=dict(version=VERSION,manifest=digest(manifest),runner=digest(Path(__file__).read_text(encoding='utf8')),
                      scorerSources=digest({str(p.relative_to(rust)).replace('\\','/'):p.read_text(encoding='utf8') for p in source_files}),
                      seed=args.seed,fixedFirst=args.fixed_first,cycle=args.cycle,temp=args.temp,minTemp=args.min_temp,
                      dailyFloor=args.daily_floor,pinkyCeiling=args.pinky_ceiling,batch=args.batch)
        db=sqlite3.connect(folder/'search.sqlite'); db.execute('PRAGMA journal_mode=WAL'); db.execute('PRAGMA synchronous=FULL')
        db.execute('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, state TEXT, metrics TEXT, touched INTEGER)')
        db.execute('CREATE TABLE IF NOT EXISTS checkpoint (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT)')
        stored=db.execute('SELECT data FROM checkpoint WHERE id=1').fetchone()
        cp=json.loads(stored[0]) if stored else None
        if cp and cp['contract']!=contract: raise ValueError('resume contract changed; use a new output directory')
        os.environ['CUDA_VISIBLE_DEVICES']=str(args.device)
        engine=Engine(args.exe.resolve(),folder/'inputs',args.backend,args.threads,args.timeout)
        # Audit all seed scores, daily replay and load against independent JS every launch.
        seeds=[]
        for offset in range(0,len(space.spec['seeds']),args.batch):
            chunk=space.spec['seeds'][offset:offset+args.batch]
            if not wait_resources(args,folder): return
            scores=engine.score([space.expand(s['state']) for s in chunk],True)
            for seed,score in zip(chunk,scores):
                m=dict(space.memory(seed['state']),**space.daily(seed['state']),**score)
                for k in ['ckt','daily','pinky']:
                    if abs(m[k]-seed['expected'][k])>1e-8: raise RuntimeError(f'seed benchmark mismatch: {seed["id"]} {k} {m[k]} != {seed["expected"][k]}')
                seeds.append(dict(key=space.key(seed['state']),state=seed['state'],metrics=m,origin=seed['id']))
        print('Four seeds match independent CKT, daily punctuation and pinky benchmarks.',flush=True)
        rng=random.Random(args.seed)
        if cp is None:
            profiles=[dict(name='ckt',maxM=22,dailyFloor=0,pinkyCeiling=1),
                      dict(name='balanced',maxM=22,dailyFloor=args.daily_floor,pinkyCeiling=args.pinky_ceiling),
                      dict(name='m21',maxM=21,dailyFloor=0,pinkyCeiling=1)]
            chains=[dict(id=s['origin']+'/'+p['name'],origin=s['origin'],profile=p,state=s['state'],metrics=s['metrics'],steps=0,accepted=0)
                    for s in seeds for p in profiles if eligible(s['metrics'],p)]
            cp=dict(contract=contract,round=0,evaluations=0,cursor=0,chains=chains,frontier=[],rng=rng.getstate())
            for s in seeds: cp['frontier']=update_frontier(cp['frontier'],s)
        else:
            rng.setstate(tuples(cp['rng']))
            # Resumed states are never trusted solely because a checkpoint exists.
            for c in cp['chains']:
                if not wait_resources(args,folder): return
                if not eligible(c['metrics'],c['profile']): raise RuntimeError('checkpoint violates profile')
                score=engine.score([space.expand(c['state'])],True)[0]
                if abs(score['ckt']-c['metrics']['ckt'])>1e-9: raise RuntimeError('resume score mismatch')
        for s in seeds: db.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?,?)',(s['key'],canonical(s['state']),canonical(s['metrics']),cp['round']))
        db.execute('INSERT OR REPLACE INTO checkpoint VALUES(1,?)',(canonical(cp),)); db.commit(); export(folder,cp,space)
        if args.audit_only: return
        start=time.monotonic(); last_print=0; end_round=cp['round']+args.rounds if args.rounds else math.inf
        while cp['round']<end_round and (not args.hours or time.monotonic()-start<args.hours*3600):
            if not wait_resources(args,folder): break
            began=time.monotonic(); pending=[]
            for i in range(args.batch):
                c=cp['chains'][(cp['cursor']+i)%len(cp['chains'])]
                if c['steps'] and c['steps']%args.cycle==0:
                    origins=[s for s in seeds if s['origin']==c['origin'] and eligible(s['metrics'],c['profile'])]
                    pool=[s for s in cp['frontier'] if eligible(s['metrics'],c['profile'])]
                    pick=rng.choice(origins if rng.random()<0.35 or not pool else pool)
                    c['state'],c['metrics']=pick['state'],pick['metrics']
                state,m=space.propose(c['state'],rng,c['profile']); key=space.key(state)
                cached=db.execute('SELECT metrics FROM cache WHERE key=?',(key,)).fetchone()
                pending.append(dict(chain=c,state=state,metrics=json.loads(cached[0]) if cached else m,key=key,cached=bool(cached)))
            missing=[p for p in pending if not p['cached']]
            if missing:
                scores=engine.score([space.expand(p['state']) for p in missing],cp['round']%args.verify_every==0)
                cp['evaluations']+=len(missing)
                for p,m in zip(missing,scores): p['metrics'].update(m)
            for p in pending:
                c,m=p['chain'],p['metrics']
                item=dict(key=p['key'],state=p['state'],metrics=m,origin=c['origin'])
                frontier=update_frontier(cp['frontier'],item)
                if frontier is not cp['frontier']:
                    if not m['verified']:
                        checked=engine.score([space.expand(p['state'])],True)[0]
                        if abs(checked['ckt']-m['ckt'])>1e-9: raise RuntimeError('frontier score mismatch')
                        m.update(checked)
                    cp['frontier']=frontier
                temp=args.temp*(args.min_temp/args.temp)**((c['steps']%args.cycle)/args.cycle)
                delta=m['ckt']-c['metrics']['ckt']
                if eligible(m,c['profile']) and (delta<=0 or rng.random()<math.exp(-delta/temp)):
                    c['state'],c['metrics']=p['state'],m; c['accepted']+=1
                c['steps']+=1
                db.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?,?)',(p['key'],canonical(p['state']),canonical(m),cp['round']))
            cp['round']+=1; cp['cursor']=(cp['cursor']+args.batch)%len(cp['chains']); cp['rng']=rng.getstate()
            if cp['round']%100==0:
                db.execute('DELETE FROM cache WHERE key IN (SELECT key FROM cache ORDER BY touched DESC LIMIT -1 OFFSET ?)',(args.cache_limit,))
            db.execute('INSERT OR REPLACE INTO checkpoint VALUES(1,?)',(canonical(cp),)); db.commit(); export(folder,cp,space)
            if time.monotonic()-last_print>=30:
                print(json.dumps(dict(round=cp['round'],evaluations=cp['evaluations'],frontier=len(cp['frontier']),
                      bestCkt=min(s['metrics']['ckt'] for s in cp['frontier']))),flush=True); last_print=time.monotonic()
            sleep_until=time.monotonic()+(time.monotonic()-began)*(1/args.duty-1)
            while time.monotonic()<min(sleep_until,args.deadline) and not (folder/'STOP').exists(): time.sleep(max(0,min(1,sleep_until-time.monotonic())))
    finally:
        if db: db.close()  # Roll back an interrupted batch; committed RNG remains reproducible.
        if engine: engine.close()
        lock.close()

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bundle',type=Path,default=ROOT/'research/config/cr-anneal-inputs.zip')
    p.add_argument('--exe',type=Path,default=ROOT/'research/ckt-v4-core/target/release'/('score-toned-stream.exe' if os.name=='nt' else 'score-toned-stream'))
    p.add_argument('--output',type=Path,default=ROOT/'research/.cache/cr-anneal')
    p.add_argument('--backend',choices=['cpu','cuda'],default='cuda')
    p.add_argument('--batch',type=int,choices=[1,2,3,4],default=2)
    p.add_argument('--threads',type=int,default=2)
    p.add_argument('--device',type=int,default=0)
    p.add_argument('--duty',type=float,default=.25,help='active/(active+idle); not a hard GPU utilization cap')
    p.add_argument('--max-temp',type=float,default=75)
    p.add_argument('--min-free-mb',type=float,default=1024)
    p.add_argument('--timeout',type=float,default=300)
    p.add_argument('--hours',type=float,default=0)
    p.add_argument('--rounds',type=int,default=0,help='additional batches this invocation; 0 means unlimited')
    p.add_argument('--cycle',type=int,default=10000,help='proposals per chain before reheat/reseed')
    p.add_argument('--temp',type=float,default=.02)
    p.add_argument('--min-temp',type=float,default=.00002)
    p.add_argument('--seed',type=int,default=20261113)
    p.add_argument('--daily-floor',type=float,default=122.9586249541484)
    p.add_argument('--pinky-ceiling',type=float,default=.1079140049)
    p.add_argument('--verify-every',type=int,default=100)
    p.add_argument('--cache-limit',type=int,default=50000)
    p.add_argument('--fixed-first',action='store_true')
    p.add_argument('--audit-only',action='store_true')
    a=p.parse_args()
    if not (0<a.duty<=1 and a.threads>=1 and a.cycle>=1 and 0<a.min_temp<=a.temp and a.verify_every>=1
            and a.cache_limit>=4 and a.rounds>=0 and a.hours>=0): p.error('invalid resource or annealing limits')
    try: run(a)
    except KeyboardInterrupt: print('Stopped; resume with the same command/output to replay the unfinished batch.')

if __name__=='__main__': main()
