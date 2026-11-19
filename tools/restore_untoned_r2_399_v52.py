"""Necessary onset lower bounds and constructive 399-unique rhyme colourings."""
from __future__ import annotations
import itertools,json,math,time,sys
from pathlib import Path
import numpy as np
from scipy.optimize import milp,Bounds,LinearConstraint
from scipy.sparse import coo_array

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'research/.cache/r2-restore399-v52'
CONFIG=ROOT/'research/config/untoned-r2-restore399-v52-input.json'
INPUT=json.loads((CONFIG if CONFIG.exists() else CACHE/'input.json').read_text(encoding='utf8'))
HEADS=INPUT['heads'];FINALS=INPUT['finals'];LETTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZ'
SOUNDS=[i for i,k in enumerate(LETTERS) if k not in 'AEIOU']
PAIRS=[tuple(r['pair']) for r in INPUT['common']]
SOURCE=[LETTERS.index(INPUT['sourceInitialMap'][h]) for h in HEADS]

class Problem:
    def __init__(self): self.cost=[];self.lo=[];self.hi=[];self.rows=[];self.lower=[];self.upper=[]
    def var(self,cost=0,lo=0,hi=1):
        i=len(self.cost);self.cost.append(cost);self.lo.append(lo);self.hi.append(hi);return i
    def add(self,row,lo=-np.inf,hi=np.inf): self.rows.append(row);self.lower.append(lo);self.upper.append(hi)
    def solve(self,seconds=60):
        rr=[];cc=[];vv=[]
        for i,row in enumerate(self.rows):
            for j,v in row.items(): rr.append(i);cc.append(j);vv.append(v)
        a=coo_array((np.array(vv,dtype=float),(np.array(rr,dtype=np.int32),np.array(cc,dtype=np.int32))),shape=(len(self.rows),len(self.cost))).tocsc()
        return milp(np.array(self.cost),integrality=np.ones(len(self.cost)),bounds=Bounds(self.lo,self.hi),constraints=LinearConstraint(a,self.lower,self.upper),options={'time_limit':seconds,'mip_rel_gap':0})

def onset_problem(metric='families',capacity=26,relax_budget=False):
    p=Problem();x={(h,k):p.var() for h in range(27) for k in SOUNDS};u={k:p.var() for k in SOUNDS};zero=p.var()
    for h in range(27):p.add({x[h,k]:1 for k in SOUNDS},1,1)
    for k in SOUNDS:p.add({x[25,k]:1,x[26,k]:-1},0,0)
    sets=[{f for h0,f in PAIRS if h0==h} for h in range(27)]
    edges=[(a,b) for a,b in itertools.combinations(range(27),2) if sets[a]&sets[b]]
    for a,b in edges:
        for k in SOUNDS:p.add({x[a,k]:1,x[b,k]:1},hi=1)
    sizes=[sum(h0==h for h0,f in PAIRS) for h in range(27)]
    for k in SOUNDS:p.add({x[h,k]:sizes[h] for h in range(27)},hi=capacity)
    ordinary=[i for i,h in enumerate(HEADS[:21]) if len(h)==1]
    identities=[x[h,LETTERS.index(HEADS[h].upper())] for h in ordinary]
    if not relax_budget:p.add({i:-1 for i in identities},hi=3-len(identities))
    for k in SOUNDS:
        for h in [21,22,23]:p.add({x[h,k]:1,u[k]:-1},hi=0)
        p.add({u[k]:1,**{x[h,k]:-1 for h in [21,22,23]}},hi=0)
    row={i:-1 for i in identities};row.update({i:1 for i in u.values()});row[x[24,22]]=-1;row[x[25,24]]=-1
    # Necessary memory floor: all single vowels and v kept on their identity.
    if not relax_budget:p.add(row,hi=40-(32+len(identities)+2))
    for h in [21,22,23]:p.add({zero:1,x[h,SOURCE[h]]:1},lo=1)
    p.add({zero:1,**{x[h,SOURCE[h]]:1 for h in [21,22,23]}},hi=3)
    if metric=='families':
        for h in [*range(21),24,25]:p.cost[x[h,SOURCE[h]]]=-1
        p.cost[zero]=1;constant=23
    else:
        for h in range(27):p.cost[x[h,SOURCE[h]]]=-1
        constant=27
    return p,x,constant,edges

def decode(result,x):return [next(k for k in SOUNDS if result.x[x[h,k]]>.5) for h in range(27)]
def counts(s):
    entries=sum(a!=b for a,b in zip(s,SOURCE));families=sum(s[h]!=SOURCE[h] for h in [*range(21),24,25])+int(any(s[h]!=SOURCE[h] for h in [21,22,23]))
    d=sum(s[i]!=LETTERS.index(h.upper()) for i,h in enumerate(HEADS[:21]) if len(h)==1)
    memory_floor=32+d+len({s[h] for h in [21,22,23]})+int(s[24]!=22)+int(s[25]!=24)
    return dict(entries=entries,families=families,D=d,memoryFloor=memory_floor)

def capacity_certificate(write=True):
    """Data-checkable 26-clique forced by any <=21-onset/<=25-final layout."""
    assert len(PAIRS)==399 and len(set(PAIRS))==399
    sets=[{f for h0,f in PAIRS if h0==h} for h in range(27)]
    ordinary=list(range(21));special=[HEADS.index(h) for h in ['j','q','x']]
    eligible=[(a,b) for a,b in itertools.combinations(ordinary,2) if not sets[a]&sets[b] and len(sets[a])+len(sets[b])<=25]
    assert {tuple(sorted((HEADS[a],HEADS[b]))) for a,b in eligible}=={('f','j'),('f','q'),('f','x')}
    y=HEADS.index('Y');assert all(sets[y]&sets[h] for h in ordinary)
    assert sets[special[0]]==sets[special[1]]==sets[special[2]]
    for name in ['A','E','W']:
        h=HEADS.index(name)
        allowed={j for j in ordinary if not sets[h]&sets[j] and len(sets[h])+len(sets[j])<=25}
        assert allowed==set(special)
        assert sets[h]&sets[y] and sets[h]&sets[HEADS.index('f')]
    assert sets[HEADS.index('W')]&sets[HEADS.index('A')]
    assert sets[HEADS.index('W')]&sets[HEADS.index('E')]
    t=sets[special[0]]
    u={FINALS.index(f) for f in ['a','ai','an','ang','ao','e','ei','en','eng','o','ou','u']}
    assert len(t)==14 and len(u)==12 and not t&u
    assert u<=sets[HEADS.index('m')]
    assert u<=set.union(*(sets[HEADS.index(h)] for h in ['f','W','A','E']))
    # With 21 ordinary heads plus a dedicated Y/YU head and <=21 keys,
    # exactly one ordinary pair must merge. Only f+j/q/x can merge. All
    # remaining f, W, A/E attachments therefore exhaust j/q/x's three slots.
    # U is a clique under m; T under j; every U-T pair conflicts via one of
    # the forced f/W/A/E + j/q/x buckets, since all three have the same T.
    certificate={'version':1,'minimumFinalKeys':26,'maximumSoundKeys':21,'assumptions':['399 common syllables as frozen','one unconditional key per canonical initial/final','Y and YU use the same initial key; zero branches'],
      'eligibleOrdinaryMergesAtCapacity25':[[HEADS[a],HEADS[b]] for a,b in eligible],
      'T14':[FINALS[f] for f in sorted(t)],'U12':[FINALS[f] for f in sorted(u)],'clique26':[FINALS[f] for f in sorted(t|u)],'pairsChecked':math.comb(26,2),
      'argument':['Y overlaps every ordinary onset and needs its own bucket.','Only f with j/q/x is a disjoint ordinary pair whose union fits 25 final keys. Exactly one such pair must merge.','A,E,W can attach only to j/q/x, and cannot attach to the one already hosting f. W conflicts with both A and E, so W occupies one remaining bucket and A/E the other.','Each of f,W,A/E is therefore merged with a member of j/q/x. Their identical 14-final sets form T.','U has 12 finals all co-occurring under m; every U final occurs under f,W,A or E. Thus U and T form a forced 26-clique.']}
    if write:(ROOT/'research/notes/2026-11-20-untoned-399-minimum26-certificate.json').write_text(json.dumps(certificate,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    return certificate

def initial_bounds():
    report={'contract':'necessary initial graph from shared canonical finals; Y/YU paired, no AEIOU initial keys, D<=3, M-R2 necessary floor<=40','metrics':{}}
    solutions={}
    for capacity,metric in itertools.product([26,25,24],['families','entries']):
        p,x,constant,edges=onset_problem(metric,capacity);r=p.solve(90)
        label=f'{capacity}-{metric}'
        if r.x is None:
            report['metrics'][label]={'capacity':capacity,'status':int(r.status),'message':r.message}
            print(json.dumps({'metric':label,**report['metrics'][label]},ensure_ascii=False),flush=True)
            if r.status!=2:raise RuntimeError(r.message)
            continue
        score=float(r.fun+constant);bound=float(r.mip_dual_bound+constant)
        report['metrics'][label]={'capacity':capacity,'status':int(r.status),'message':r.message,'objective':score,'lowerBound':bound,'gap':float(r.mip_gap),'edges':len(edges),'initialMap':{h:LETTERS[k] for h,k in zip(HEADS,decode(r,x))},'audit':counts(decode(r,x))}
        print(json.dumps({'metric':label,**report['metrics'][label]},ensure_ascii=False),flush=True)
        # Enumerate a bounded, reproducible collection at the proven minimum.
        original_cost={i:c for i,c in enumerate(p.cost) if c};p.add(original_cost,hi=round(score)-constant)
        for i in range(len(p.cost)):p.cost[i]=0
        enumerated=0;exhausted=False
        for serial in range(256 if metric=='families' and capacity==25 else 16 if metric=='families' else 4):
            state=decode(r,x);solutions[tuple(state)]={'state':state,'audit':counts(state),'metric':metric,'capacity':capacity}
            enumerated+=1
            p.add({x[h,k]:1 for h,k in enumerate(state)},hi=26)
            # Prefer small total physical-key displacement to the source; this
            # is only an enumeration tie-break, not the CKT objective.
            for (h,k),v in x.items():p.cost[v]=abs(k-SOURCE[h])*.001+(h*21+SOUNDS.index(k))*.0000001
            r=p.solve(10)
            if r.x is None:
                exhausted=r.status==2
                break
        report['metrics'][label]['enumerated']=enumerated;report['metrics'][label]['exhaustedMinimum']=exhausted
    report['solutions']=list(solutions.values())
    p,x,c,edges=onset_problem('families',24,True);r=p.solve(90)
    report['capacity24WithoutMemoryOrDFloors']={'status':int(r.status),'message':r.message,'infeasible':r.status==2}
    target=ROOT/'research/notes/2026-11-20-untoned-r2-399-onset-lower-bounds.json'
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    return report

def rhyme_problem(state,forbidden,objective='motor',relax=False):
    p=Problem();allowed=[k for k in range(26) if k not in forbidden]
    prohibited={f:set() for f in range(35)}
    for h,f in PAIRS:
        if not relax and state[h]==16:prohibited[f].add(25)
        if not relax and state[h]==25:prohibited[f].add(16)
    x={(f,k):p.var(hi=0 if k in prohibited[f] else 1) for f in range(35) for k in allowed}
    for f in range(35):p.add({x[f,k]:1 for k in allowed},1,1)
    for k in allowed:p.add({x[f,k]:1 for f in range(35)},lo=1)
    groups={k:[f for h,f in PAIRS if state[h]==k] for k in set(state)}
    for fs in groups.values():
        if len(fs)!=len(set(fs)):return None,None
        for k in allowed:p.add({x[f,k]:1 for f in fs},hi=1)
    identities=[(f,LETTERS.index(name.upper())) for f,name in enumerate(FINALS) if len(name)==1]
    if not relax:p.add({x[f,k]:-1 for f,k in identities},hi=40-counts(state)['memoryFloor']-len(identities))
    vowels=[(FINALS.index(v),LETTERS.index(v.upper())) for v in 'aeiou']
    if not relax:p.add({x[f,k]:-1 for f,k in vowels},hi=1-len(vowels))
    mass=sum(r['weight'] for r in INPUT['common']);cost=np.zeros((35,26))
    for row in INPUT['common']:
        h,f=row['pair'];cost[f]+=row['weight']/mass*np.array(INPUT['motor2'][state[h]])
    anchor=INPUT['baselines'][0]['finalMap']
    for (f,k),v in x.items():p.cost[v]=float(cost[f,k]) if objective=='motor' else float(LETTERS[k]!=anchor[FINALS[f]])+.0001*float(cost[f,k])
    return p,x

def construct_rhymes():
    bounds=json.loads((ROOT/'research/notes/2026-11-20-untoned-r2-399-onset-lower-bounds.json').read_text(encoding='utf8'))
    solutions=[s for s in bounds['solutions'] if s['audit']['families']==4 and s['audit']['entries']==6]
    report={'contract':'399 distinct main codes, M<=40 D<=3 V<=1 branches0, 4 changed onset-rule families / 6 entries versus R2, Common399 QZ/ZQ empty','candidates':[],'attempts':[]}
    for item,case in itertools.product(solutions,[('full-26',[]),('empty-Z',[25]),('empty-Q',[16])]):
        state=item['state'];p,x=rhyme_problem(state,case[1]);
        if p is None:continue
        for objective in ['motor','near-A']:
            if objective!='motor':p,x=rhyme_problem(state,case[1],objective)
            start=time.time();r=p.solve(4)
            attempt={'case':case[0],'initialMap':{h:LETTERS[k] for h,k in zip(HEADS,state)},'objective':objective,'status':int(r.status),'seconds':time.time()-start,'feasible':r.x is not None};report['attempts'].append(attempt)
            if r.x is not None:
                final=[next(k for k in range(26) if (f,k) in x and r.x[x[f,k]]>.5) for f in range(35)]
                codes=[26*state[h]+final[f] for h,f in PAIRS];assert len(set(codes))==399 and 16*26+25 not in codes and 25*26+16 not in codes
                row={'case':case[0],'state':state+final,'initialMap':attempt['initialMap'],'finalMap':{f:LETTERS[k] for f,k in zip(FINALS,final)},'onsetChanges':counts(state),'objective':objective};report['candidates'].append(row)
                print(json.dumps({'case':case[0],'feasible':True,'onsets':row['initialMap'],'objective':objective,'seconds':attempt['seconds']},ensure_ascii=False),flush=True)
            else:print(json.dumps({'case':case[0],'feasible':False,'status':r.status,'seconds':attempt['seconds']}),flush=True)
            (ROOT/'research/notes/2026-11-20-untoned-r2-399-rhyme-constructions.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    return report

def diverse_rhymes():
    bounds=json.loads((ROOT/'research/notes/2026-11-20-untoned-r2-399-onset-lower-bounds.json').read_text(encoding='utf8'))
    states=[s['state'] for s in bounds['solutions'] if s['audit']['families']==4 and s['audit']['entries']==6]
    report={'version':1,'randomSeed':202611200399,'selection':'Eight reproducible linear MILP objectives per enumerated onset map: perturbed character motor, proximity to A/C, S2 home and minimum-home-track surrogates. Full CKT follows independently; no proxy score is reported as CKT.','attempts':[],'candidates':[]}
    rng=np.random.default_rng(report['randomSeed']);seen=set();lm=INPUT['loadModel'];home=set(lm['homeKeys']);s2=lm['tracks'].index('S2')
    masses=np.array(lm['masses'])[:,27:62]
    for state in states:
        exclusions=[]
        for serial in range(8):
            p,x=rhyme_problem(state,[])
            for fset in exclusions:p.add({x[f,k]:1 for f,k in enumerate(fset)},hi=34)
            original=np.array(p.cost);matrix=original.reshape(35,26)
            spread=np.maximum(np.ptp(matrix,axis=1),.001)
            noise=rng.normal(size=(35,26))*spread[:,None]*([.1,.4,1.2][serial%3])
            home_weight=np.zeros(35)
            if serial in [2,3]:home_weight=masses[s2]*[80,180][serial-2]
            if serial in [4,5]:home_weight=masses[-1]*[150,300][serial-4]
            anchor=INPUT['baselines'][serial%2]['finalMap']
            for (f,k),v in x.items():
                if serial>=6:p.cost[v]=float(LETTERS[k]!=anchor[FINALS[f]])*(.3 if serial==6 else 2)+float(original[v])*.1+noise[f,k]*.1
                else:p.cost[v]=float(original[v])+noise[f,k]-home_weight[f]*(LETTERS[k] in home)
            start=time.time();r=p.solve(4)
            report['attempts'].append({'onsets':state,'objective':serial,'status':int(r.status),'seconds':time.time()-start})
            if r.x is not None:
                final=[next(k for k in range(26) if r.x[x[f,k]]>.5) for f in range(35)];exclusions.append(final)
                codes=[26*state[h]+final[f] for h,f in PAIRS];assert len(set(codes))==399
                key=tuple(state+final)
                if key not in seen:seen.add(key);report['candidates'].append({'case':'full-26','state':list(key),'linearObjective':serial,'onsetChanges':counts(state)})
        print(json.dumps({'onsetsFinished':len(report['attempts'])//8,'candidates':len(report['candidates'])}),flush=True)
    path=ROOT/'research/notes/2026-11-20-untoned-r2-399-diverse-constructions.json'
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');return report

if __name__=='__main__':
    if '--certificate' in sys.argv:capacity_certificate()
    elif '--diverse' in sys.argv:diverse_rhymes()
    elif '--rhymes' in sys.argv:construct_rhymes()
    else:initial_bounds()
