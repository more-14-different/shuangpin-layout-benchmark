"""Close R1's full single, root+key and onset+root neighborhoods at default CKT.

Keep M<=18/21, D<=2, 21 first keys and 10/9/7 tone rows. Pinkies are
diagnostic only. Each compound endpoint receives the complete CPU CKT score.
Compound changes use the current policy; center policy enumeration is complete.
"""
import argparse
import concurrent.futures
import dataclasses
import gzip
import hashlib
import json
from pathlib import Path
import time

from refine_toned_2126_v52_m4 import Context,State,ROOT,ROWS,M19,ARCHIVES as OLD_ARCHIVES,root_key_pairs,PREFIX as M4
from search_toned_2126_v52_onsets import Context as OnsetContext
from check_toned_2126_v52_seed_neighbors import read,write,sha

PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52-r1-coupled'
WORK=ROOT/'research/.cache/toned-2126-v52-r1-coupled'
ARCHIVES=OLD_ARCHIVES+[Path(str(M4)+'-scores.jsonl.gz')]


def root_changes(s):
    """All intact-root transfers/swaps with ten nonempty groups, before M cap."""
    result={}
    for a in range(18):
        for g in range(10):
            p=list(s.partition);p[a]=g;p=tuple(p)
            if p!=s.partition and set(p)==set(range(10)):
                result.setdefault(p,dict(kind='root-transfer',root=a,group=g))
        for b in range(a+1,18):
            p=list(s.partition);p[a],p[b]=p[b],p[a];p=tuple(p)
            if p!=s.partition:result.setdefault(p,dict(kind='root-swap',a=a,b=b))
    return result


class OnsetBudgetView:
    """Relax only lower-M for intermediate first-key changes.

    A root transfer can repair one excessive multiroot rule. It cannot repair
    first-key coverage, D or the guard ledger. The inherited loose lower<=20
    includes every potentially repairable intermediate (at most lower=19).
    """
    def __init__(self,ctx):self.ctx=ctx
    def __getattr__(self,name):return getattr(self.ctx,name)
    def valid(self,s,max_d=2):
        return OnsetContext.valid(self.ctx,s,max_d) and self.ctx.memory(s)['guard']<=21


def onset_root_pairs(ctx,s):
    firsts=OnsetContext.onset_neighbors(OnsetBudgetView(ctx),s,2)
    roots=root_changes(s);result={}
    for first,onset_move in firsts.items():
        for partition,root_move in roots.items():
            t=dataclasses.replace(first,partition=partition)
            if ctx.legal(t):result.setdefault(t,dict(kind='onset-plus-root',onsetMove=onset_move,rootMove=root_move))
    return result


def neighborhoods(ctx,s):
    singles=ctx.joint_neighbors(s,2);root_key=root_key_pairs(ctx,s);onset_root=onset_root_pairs(ctx,s)
    combined=dict(singles)
    for moves in [root_key,onset_root]:
        for t,move in moves.items():combined.setdefault(t,move)
    return combined,dict(single=len(singles),rootKey=len(root_key),onsetRoot=len(onset_root),union=len(combined))


def load_cache():
    cache={}
    for archive in ARCHIVES:
        with gzip.open(archive,'rt',encoding='utf8') as stream:
            for line in stream:
                row=json.loads(line);row['eligible']=True;cache[State.load(row['state'])]=row
    for prefix in [M19,M4]:
        for a in json.loads(gzip.decompress(Path(str(prefix)+'-policies.json.gz').read_bytes()))['results']:
            for row in a['policies']:
                row['eligible']=True;cache[State.load(row['state'])]=row
    return cache


def export(ctx,report):
    choices=[('original-R1',report['baseline']),('default',report['routes'][0]['result'])];layouts=[]
    for label,value in choices:
        s=State.load(value['state']);codes=ctx.expand(s)
        ident='T2126-V52-R1-'+hashlib.sha256(codes.tobytes()).hexdigest()[:12]
        same=next((l for l in layouts if l['id']==ident and l['policy']==list(s.policy)),None)
        if same:same['originRoutes'].append(label);continue
        finals={f:s.partition[r] for f,r in ctx.final_roots.items()}
        layouts.append(dict(id=ident,originRoutes=[label],policy=list(s.policy),shapeKeysByMeaning='AEUIO',toneRowsByTone=ctx.tone_rows,
            tonedCodes=[''.join(chr(65+x) for x in row) for row in codes],firstKeys=dict(zip(ctx.names,s.first)),finalGroups=finals,regionMaps=s.maps,
            rhymeGroups=[dict(roots=[ctx.roots[i] for i,g in enumerate(s.partition) if g==group],finals=[f for f,g in finals.items() if g==group]) for group in range(10)],
            **{k:value[k] for k in ['score','doubleScore','tracks','ergonomics','memoryLower','memoryGuard','D']}))
    write(Path(str(PREFIX)+'-finalists.json'),dict(tokenKeys=ctx.token_keys,layouts=layouts))


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--workers',type=int,default=8)
    p.add_argument('--main',type=Path,default=ROOT.parent/'shuangpin-layout-benchmark');args=p.parse_args()
    output=Path(str(PREFIX)+'.json');WORK.mkdir(parents=True,exist_ok=True)
    ctx=Context(args.main);ctx.hashes.update({str(f):sha(f) for f in [Path(__file__),Path(str(M4)+'-finalists.json'),Path(str(M4)+'-policies.json.gz')]+ARCHIVES})
    cache=load_cache();imported=len(cache)
    layout=next(l for l in read(str(M4)+'-finalists.json')['layouts'] if 'default' in l['originRoutes'])
    seed=dataclasses.replace(ctx.state(layout),policy=tuple(layout['policy']));base=ctx.calculate(seed)
    for field in ['score','doubleScore']:
        if abs(base[field]-cache[seed][field])>1e-10:raise ValueError('R1 replay changed '+field)
    report=dict(version='r1-complete-coupled-v1',hashes=ctx.hashes,contract=dict(MlowerMaximum=18,MguardMaximum=21,Dmaximum=2,
        pinkyConstraint='none',leftPinkyMaximum=1.,rowCounts=[10,9,7],actualFirstKeys=21,shapeKeysByMeaning='AEUIO',toneKeysByTone='IEUAO',toneDigitsByShapeMeaning='42310'),
        extraSourcePaths=['tools/refine_toned_2126_v52_r1_coupled.py','tools/report_toned_2126_v52_r1_coupled.py'],baseline=base,
        importedEvaluations=imported,routes=[dict(name='default',objective='score',result=base,history=[],passes=[],complete=False)],complete=False)
    if output.exists():
        previous=read(output)
        if previous['hashes']!=ctx.hashes:raise ValueError('source changed; refusing resume')
        report=previous
        if report['complete']:print('Already complete',report['routes'][0]['result']['score']);return
    log=WORK/'scores.jsonl'
    if log.exists():
        for line in log.read_text(encoding='utf8').splitlines():
            row=json.loads(line);cache[State.load(row['state'])]=row
    write(output,report);started=time.monotonic();stream=log.open('a',encoding='utf8')
    def batch(states,pool):
        missing=[s for s in states if s not in cache]
        print('batch endpoints',len(states),'new',len(missing),flush=True)
        for s,row in zip(missing,pool.map(ctx.calculate,missing),strict=True):
            cache[s]=row;stream.write(json.dumps(row,separators=(',',':'))+'\n')
            if (len(cache)-imported)%400==0:stream.flush();print('new full scores',len(cache)-imported,flush=True)
        stream.flush();return [cache[s] for s in states]
    route=report['routes'][0]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        while True:
            anchor=State.load(route['result']['state']);value=route['result']
            moves,counts=neighborhoods(ctx,anchor);print('coupled round',len(route['passes'])+1,counts,'anchor',value['score'],flush=True)
            batch(moves,pool)
            best=min((r for s,r in cache.items() if ctx.valid(s)),key=lambda r:r['score'])
            route['passes'].append(dict(anchorState=dataclasses.asdict(anchor),anchorObjective=value['score'],counts=counts,bestObjective=best['score']))
            if best['score']>=value['score']-1e-10:
                route['complete']=True;break
            route['history'].append(dict(state=best['state'],score=best['score'],doubleScore=best['doubleScore'],source=moves.get(State.load(best['state']),dict(kind='shared-cache'))))
            value=best
            # Close cheap full singles before the next complete compound pass.
            while True:
                state=State.load(value['state']);singles=ctx.joint_neighbors(state,2)
                values=batch(singles,pool);best=min([value]+values,key=lambda r:r['score'])
                print('single polish',best['score'],best['doubleScore'],flush=True)
                if best['score']>=value['score']-1e-10:break
                route['history'].append(dict(state=best['state'],score=best['score'],doubleScore=best['doubleScore'],source=singles[State.load(best['state'])]));value=best
            route['result']=value;write(output,report)
    stream.close();archive=Path(str(PREFIX)+'-scores.jsonl.gz');archive.write_bytes(gzip.compress(log.read_bytes(),mtime=0))
    report.update(complete=True,newFullEvaluations=len(cache)-imported,totalCachedEvaluations=len(cache),elapsedLastInvocationSeconds=time.monotonic()-started,scoresSha256=sha(archive))
    export(ctx,report);write(output,report);print('COMPLETE',report['newFullEvaluations'],route['result']['score'],route['result']['doubleScore'],flush=True)


if __name__=='__main__':main()
