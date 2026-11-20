"""Fixed-UED-final annealing; persistent CUDA scorer and transactional resume."""
import argparse
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import subprocess
import time

ROOT=Path(__file__).resolve().parents[1]
CONFIG=ROOT/'research/config/u7e-fixed-gpu.json'
KINDS=['character','word2','word3','word4']
WEIGHTS=[1,3,1,1]

def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(v):return json.dumps(v,separators=(',',':'),ensure_ascii=False)
def atomic(p,value):
    p=Path(p);temp=p.with_suffix(p.suffix+'.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n');os.replace(temp,p)

class Rng:
    def __init__(self,state):self.state=state or 1
    def random(self):
        x=self.state;x^=(x<<13)&0xffffffff;x^=x>>17;x^=(x<<5)&0xffffffff;self.state=x&0xffffffff
        return self.state/4294967296
    def pick(self,items):return items[int(self.random()*len(items))]

def memory(finals,cfg):return cfg['initialMemory']+sum(chr(k+65)!=f.upper() for f,k in zip(cfg['finalNames'],finals))
def legal(finals,cfg):
    return len(finals)==35 and set(finals)==set(cfg['allowedKeys']) and memory(finals,cfg)==cfg['targetMemory'] and all((cfg['initialKeys'][h],finals[f]) not in [(16,25),(25,16)] for h,f in cfg['commonPairs'])

def mutate(finals,rng,coarse,keys):
    result=list(finals)
    for _ in range(1+int(rng.random()*3) if coarse else 1):
        a=int(rng.random()*35);b=int(rng.random()*35);op=int(rng.random()*4)
        if op==0:result[a]=rng.pick(keys)
        elif op==1:result[a],result[b]=result[b],result[a]
        elif op==2:
            ka,kb=result[a],result[b];result=[kb if k==ka else ka if k==kb else k for k in result]
        else:
            c=int(rng.random()*35);result[a],result[b],result[c]=result[c],result[a],result[b]
    return result

def scores(modes,reference):
    def effective(t,m):return t['motorUpperMs']+m*(t['effectiveMs']-t['motorUpperMs'])
    return [10*(sum(w*(effective(modes[mode][k],m)/effective(reference[mode][k],m))**4 for mode in ['keytao','sanpin'] for k,w in zip(KINDS,WEIGHTS))/12)**.25 for m in [1,2,3]]

class Campaign:
    def __init__(self,path,cfg,contract=None):
        self.cfg=cfg;self.db=sqlite3.connect(path);self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT)')
        self.db.execute('CREATE TABLE IF NOT EXISTS states(k TEXT PRIMARY KEY,data TEXT,created INTEGER,score1 REAL,score2 REAL,score3 REAL)')
        for axis in range(1,4):self.db.execute(f'CREATE INDEX IF NOT EXISTS score{axis}_idx ON states(score{axis})')
        key=hashlib.sha256(dump(contract or cfg).encode()).hexdigest()
        old=self.db.execute("SELECT v FROM meta WHERE k='contract'").fetchone()
        if old:
            if old[0]!=key:
                self.db.close()
                raise AssertionError('resume input/algorithm contract changed')
        else:
            self.db.execute('INSERT INTO meta VALUES (?,?)',('contract',key))
            seed={'finals':cfg['seedFinalKeys'],'scores':cfg['expectedSeedScores'],'id':cfg['seedId'],'verified':True}
            self.db.execute('INSERT INTO states VALUES (?,?,?,?,?,?)',(self.key(seed['finals']),dump(seed),0,*seed['scores']))
            chains=[dict(index=i,objective=2 if i<4 else 1 if i<6 else 0,rng=(20261120+104729*(i+1))&0xffffffff,current=seed,best=seed,steps=0,accepted=0,restarts=0) for i in range(8)]
            self.db.execute('INSERT INTO meta VALUES (?,?)',('state',dump(dict(chains=chains,rounds=0,evaluations=0,nextChain=0))))
            self.db.commit()
        state=json.loads(self.db.execute("SELECT v FROM meta WHERE k='state'").fetchone()[0]);self.__dict__.update(state)
    @staticmethod
    def key(finals):return ''.join(chr(k+65) for k in finals)
    def cached(self,finals):
        row=self.db.execute('SELECT data FROM states WHERE k=?',(self.key(finals),)).fetchone();return json.loads(row[0]) if row else None
    def proposal(self,chain):
        rng=Rng(chain['rng']);at=chain['steps']%1200;base=chain['current']['finals'];coarse=at<400
        restart=chain['steps']>0 and at==0
        if restart:base=chain['best']['finals'] if rng.random()<.65 else self.cfg['seedFinalKeys']
        for _ in range(20000):
            candidate=list(base)
            for _ in range(8+int(rng.random()*5) if restart else 1):candidate=mutate(candidate,rng,coarse or restart,self.cfg['allowedKeys'])
            if candidate!=chain['current']['finals'] and legal(candidate,self.cfg):
                chain['rng']=rng.state;return candidate
        raise RuntimeError('legal proposal exhausted')
    def commit(self,batch):
        with self.db:
            for chain,finals,value in batch:
                row={**value,'finals':finals};row.setdefault('id','U7G-'+hashlib.sha256(bytes(self.cfg['initialKeys']+finals)).hexdigest()[:12])
                key=self.key(finals);existed=self.db.execute('SELECT 1 FROM states WHERE k=?',(key,)).fetchone()
                if not existed:self.evaluations+=1
                self.db.execute('INSERT OR REPLACE INTO states VALUES (?,?,?,?,?,?)',(key,dump(row),self.evaluations,*row['scores']))
                rng=Rng(chain['rng']);at=chain['steps']%1200;restart=chain['steps']>0 and at==0
                temperature=.08*(.006/.08)**(at/399) if at<400 else .01*(.00003/.01)**((at-400)/799)
                axis=chain['objective'];delta=row['scores'][axis]-chain['current']['scores'][axis]
                light={k:row[k] for k in ['id','finals','scores','verified'] if k in row}
                if restart or delta<=0 or rng.random()<math.exp(-delta/temperature):chain['current']=light;chain['accepted']+=1
                if row['scores'][axis]<chain['best']['scores'][axis]:chain['best']=light
                chain['rng']=rng.state;chain['steps']+=1
                if restart:chain['restarts']+=1
            self.rounds+=1;self.nextChain=(self.nextChain+len(batch))%8
            self.db.execute('INSERT OR REPLACE INTO meta VALUES (?,?)',('state',dump({k:getattr(self,k) for k in ['chains','rounds','evaluations','nextChain']})))
            if self.evaluations and self.evaluations%1000<len(batch):
                protected={self.key(c[k]['finals']) for c in self.chains for k in ['current','best']}
                protected.add(self.key(self.cfg['seedFinalKeys']))
                for axis in range(1,4):
                    for (key,) in self.db.execute(f'SELECT k FROM states ORDER BY score{axis} LIMIT 64'):protected.add(key)
                threshold=self.evaluations-50000
                self.db.executemany('DELETE FROM states WHERE k=?',[(k,) for(k,)in self.db.execute('SELECT k FROM states WHERE created<?',(threshold,)) if k not in protected])
    def frontier(self):
        result={}
        for axis in range(1,4):result[str(axis)]=[json.loads(r[0]) for r in self.db.execute(f'SELECT data FROM states ORDER BY score{axis} LIMIT 32')]
        return result
    def close(self):self.db.close()

class Scorer:
    def __init__(self,cfg,work,backend):
        templates=work/'templates.json'
        if not templates.exists():templates.write_bytes(gzip.decompress((ROOT/cfg['templatesArchive']).read_bytes()))
        assert digest(templates)==cfg['templatesSha256']
        binary=ROOT/'research/ckt-v4-core/target/release/score-untoned-v52-cuda-stream.exe'
        env=os.environ.copy();env['RAYON_NUM_THREADS']='2'
        self.process=subprocess.Popen([str(binary),str(templates),str(ROOT/cfg['snapshot']),str(ROOT/cfg['profile']),backend],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf8',env=env,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            self.ready=self.line();assert self.ready['ready'] and self.ready['backend']==backend
        except BaseException:
            self.process.kill();self.process.wait();raise
    def line(self):
        line=self.process.stdout.readline()
        if not line:raise RuntimeError('scorer exited: '+str(self.process.poll()))
        return json.loads(line)
    def score(self,states,verify=False):
        self.process.stdin.write(dump(dict(states=states,verify=verify))+'\n');self.process.stdin.flush();result=self.line()
        assert len(result['results'])==len(states)
        for expected,row in zip(states,result['results']):
            assert row['id']==expected['id'] and len(row['scores'])==3 and all(math.isfinite(v) for v in row['scores'])
        return result
    def close(self):
        self.process.stdin.close();self.process.wait(timeout=30)

def gpu_health():
    p=subprocess.run(['nvidia-smi','--query-gpu=temperature.gpu,memory.free','--format=csv,noheader,nounits'],capture_output=True,text=True,check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    temp,free=map(int,p.stdout.splitlines()[0].split(','));return dict(temperature=temp,freeMiB=free)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=ROOT/'research/.cache/u7e-fixed-gpu-20261120');parser.add_argument('--hours',type=float,default=12);parser.add_argument('--rounds',type=int,default=0);parser.add_argument('--duty',type=float,default=.25);parser.add_argument('--batch',type=int,choices=[1,2],default=2);parser.add_argument('--backend',choices=['cpu','cuda'],default='cuda');parser.add_argument('--audit-only',action='store_true');args=parser.parse_args()
    assert 0<args.duty<=1 and args.hours>0
    work=args.output.resolve();work.mkdir(parents=True,exist_ok=True)
    import msvcrt
    lock=(work/'RUN.lock').open('a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
    try:msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
    except OSError:raise RuntimeError('another process owns this campaign')
    cfg=json.loads(CONFIG.read_text(encoding='utf8'))
    for p,h in cfg['sourceHashes'].items():assert digest(ROOT/p)==h,p
    contract=dict(config=cfg,backend=args.backend,algorithm='u7e-fixed-gpu-1',batch=args.batch,sourceHashes={str(p.relative_to(ROOT)):digest(p) for p in [Path(__file__),ROOT/'research/ckt-v4-core/src/bin/score-untoned-v52-cuda-stream.rs',ROOT/'research/ckt-v4-core/src/bin/score-untoned-v52-stream.rs',ROOT/'research/ckt-v4-core/src/cuda.rs',ROOT/'research/ckt-v4-core/src/cuda/rank.cu',ROOT/'research/ckt-v4-core/target/release/score-untoned-v52-cuda-stream.exe',ROOT/cfg['snapshot'],ROOT/cfg['profile']]})
    campaign=Campaign(work/'search.sqlite',cfg,contract);atomic(work/'contract.json',contract);scorer=None;started=time.monotonic();initial_rounds=campaign.rounds
    def status(state,**extra):
        atomic(work/'status.json',dict(state=state,pid=os.getpid(),updated=time.strftime('%Y-%m-%d %H:%M:%S'),rounds=campaign.rounds,evaluations=campaign.evaluations,elapsedThisRun=time.monotonic()-started,backend=args.backend,seed=cfg['seedId'],duty=args.duty,chains=campaign.chains,**extra))
    try:
        status('starting');scorer=Scorer(cfg,work,args.backend)
        seed=dict(id=cfg['seedId'],state=cfg['initialKeys']+cfg['seedFinalKeys'])
        audit=scorer.score([seed],True);assert audit['verified']
        if args.backend=='cuda':assert audit['cudaLaunches']>0
        for actual,expected in zip(audit['results'][0]['scores'],cfg['expectedSeedScores']):assert abs(actual-expected)<1e-9,(actual,expected)
        checked_currents={campaign.key(cfg['seedFinalKeys'])}
        for chain in campaign.chains:
            current=chain['current']
            if campaign.key(current['finals']) in checked_currents:continue
            row=scorer.score([dict(id=current['id'],state=cfg['initialKeys']+current['finals'])],True)['results'][0]
            assert all(abs(a-b)<1e-9 for a,b in zip(row['scores'],current['scores']))
            checked_currents.add(campaign.key(current['finals']))
        atomic(work/'audit.json',dict(completed=True,ready=scorer.ready,seed=audit,initialMap=cfg['initialMap'],auxiliarySemantics=cfg['auxiliarySemantics']))
        print(dump(dict(audit=True,device=scorer.ready,seedScores=audit['results'][0]['scores'])),flush=True)
        if args.audit_only:status('audited');return
        while time.monotonic()-started<args.hours*3600 and (not args.rounds or campaign.rounds-initial_rounds<args.rounds):
            if (work/'STOP').exists():status('stopped');break
            if (work/'PAUSE').exists():status('paused');time.sleep(5);continue
            health=gpu_health() if args.backend=='cuda' else {}
            if health and (health['temperature']>=75 or health['freeMiB']<1024):status('waiting_gpu',gpu=health);time.sleep(5);continue
            tick=time.monotonic();jobs=[];requests=[];pending=[]
            old_frontier=campaign.frontier();best=[old_frontier[str(i+1)][0]['scores'][i] for i in range(3)]
            for offset in range(args.batch):
                chain=campaign.chains[(campaign.nextChain+offset)%8];finals=campaign.proposal(chain);cached=campaign.cached(finals)
                if cached:jobs.append((chain,finals,cached))
                else:
                    identifier='U7G-'+hashlib.sha256(bytes(cfg['initialKeys']+finals)).hexdigest()[:12]
                    pending.append((chain,finals));requests.append(dict(id=identifier,state=cfg['initialKeys']+finals))
            if requests:
                result=scorer.score(requests,campaign.rounds%100==0)
                if args.backend=='cuda':assert result['cudaLaunches']>0
                for (chain,finals),row in zip(pending,result['results']):
                    assert all(abs(a-b)<1e-9 for a,b in zip(scores(row['modes'],cfg['referenceModes']),row['scores']))
                    if any(row['scores'][i]<best[i] for i in range(3)) and not result['verified']:
                        checked=scorer.score([dict(id=row['id'],state=cfg['initialKeys']+finals)],True)
                        assert checked['verified'] and all(abs(a-b)<1e-9 for a,b in zip(row['scores'],checked['results'][0]['scores']))
                        row=checked['results'][0];row['verified']=True
                    else:row['verified']=result['verified']
                    jobs.append((chain,finals,row))
            campaign.commit(jobs);frontier=campaign.frontier()
            if campaign.rounds==1 or campaign.rounds%20==0 or any(frontier[str(i+1)][0]['scores'][i]<best[i] for i in range(3)):
                atomic(work/'frontier.json',dict(seed=cfg['seedId'],rounds=campaign.rounds,evaluations=campaign.evaluations,initialMap=cfg['initialMap'],finalNames=cfg['finalNames'],frontiers=frontier))
            status('running',gpu=health,device=scorer.ready['device'],bestScores=[frontier[str(i+1)][0]['scores'][i] for i in range(3)])
            if campaign.rounds%20==0:print(dump(dict(rounds=campaign.rounds,evaluations=campaign.evaluations,best=[frontier[str(i+1)][0]['scores'][i] for i in range(3)])),flush=True)
            delay=(time.monotonic()-tick)*(1/args.duty-1)
            until=time.monotonic()+delay
            while time.monotonic()<until and not (work/'STOP').exists():time.sleep(min(.5,max(0,until-time.monotonic())))
        else:status('completed')
        atomic(work/'frontier.json',dict(seed=cfg['seedId'],rounds=campaign.rounds,evaluations=campaign.evaluations,initialMap=cfg['initialMap'],finalNames=cfg['finalNames'],frontiers=campaign.frontier()))
    except BaseException as error:
        status('error',error=repr(error));raise
    finally:
        if scorer:scorer.close()
        campaign.close();lock.close()

if __name__=='__main__':main()
