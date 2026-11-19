"""Tighten memory to M19/22 or M19/21, retaining D3/D2 native constraints.

Reuse every independently audited prior onset score, then close exact joint
onset/rhyme/policy neighborhoods for default and doubled cognitive costs.
"""
import argparse
import concurrent.futures
import dataclasses
import gzip
import hashlib
import itertools
import json
from pathlib import Path
import time

from search_toned_2126_v52_onsets import Context as OnsetContext,State,ROOT,ROWS
from check_toned_2126_v52_seed_neighbors import read,sha,write

PREFIX=ROOT/'research/notes/2026-11-19-toned-2126-v52-m19'
WORK=ROOT/'research/.cache/toned-2126-v52-m19'
ARCHIVE=ROOT/'research/notes/2026-11-19-toned-2126-v52-onsets-scores.jsonl.gz'


class Context(OnsetContext):
    def __init__(self,main,pinky=.085):
        super().__init__(main,pinky);self.max_guard=22
        self.hashes.update({str(p):sha(p) for p in [__file__,ARCHIVE]})
    def valid(self,s,max_d=3):
        if not super().valid(s,max_d):return False
        m=self.memory(s)
        return m['lower']<=19 and m['guard']<=self.max_guard


def export(ctx,report,cache):
    selected=[]
    for route in report['routes']:
        if route['complete']:selected.append((route['name'],route['result']))
    # Controls are selected from complete scored states, not inferred loads.
    reference=read(ROOT/'research/notes/2026-11-19-toned-2126-v52-comparison.json')
    right=next(r for r in reference['results'] if r['id']=='A')['rightPinkyPeak'];controls=[]
    for guard,d,field in itertools.product([22,21],[3,2],['score','doubleScore']):
        pool=[v for v in cache.values() if v['eligible'] and v['D']<=d and v['memoryLower']<=19 and v['memoryGuard']<=guard and max(t['rightPinky'] for t in v['ergonomics'].values())<=right+1e-12]
        if not pool:continue
        best=min(pool,key=lambda v:v[field]);label=f'M19-{guard}-D{d}-{field}-rightPinkyPreserving'
        selected.append((label,best));controls.append(dict(label=label,state=best['state'],score=best['score'],doubleScore=best['doubleScore']))
    layouts=[]
    for label,value in selected:
        state=State.load(value['state']);codes=ctx.expand(state);ident='T2126-V52-M19-'+hashlib.sha256(codes.tobytes()).hexdigest()[:12]
        present=next((r for r in layouts if r['id']==ident and r['policy']==list(state.policy)),None)
        if present:present['originRoutes'].append(label);continue
        final_groups={f:state.partition[r] for f,r in ctx.final_roots.items()}
        layouts.append(dict(id=ident,originRoutes=[label],shapeKeysByMeaning='AEUIO',toneRowsByTone=ctx.tone_rows,
            tonedCodes=[''.join(chr(65+x) for x in row) for row in codes],finalGroups=final_groups,regionMaps=state.maps,
            firstKeys=dict(zip(ctx.names,state.first)),policy=list(state.policy),score=value['score'],doubleScore=value['doubleScore'],tracks=value['tracks'],ergonomics=value['ergonomics'],
            rhymeGroups=[dict(roots=[ctx.roots[i] for i,g in enumerate(state.partition) if g==group],finals=[f for f,g in final_groups.items() if g==group]) for group in range(10)],
            memoryLower=value['memoryLower'],memoryGuard=value['memoryGuard'],D=value['D']))
    write(Path(str(PREFIX)+'-finalists.json'),dict(tokenKeys=ctx.token_keys,layouts=layouts))
    write(Path(str(PREFIX)+'-controls.json'),dict(rightPinkyCeiling=right,results=controls,selection='Best already fully scored states within each memory/D/objective budget; right-pinky peak <=A. No new search or local-optimum claim.'))


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--workers',type=int,default=4)
    p.add_argument('--main',type=Path,default=ROOT.parent/'shuangpin-layout-benchmark');args=p.parse_args()
    WORK.mkdir(parents=True,exist_ok=True);ctx=Context(args.main);cache={}
    old=read(ROOT/'research/notes/2026-11-19-toned-2126-v52-onsets.json')
    if old['scoresSha256']!=sha(ARCHIVE):raise ValueError('import archive changed')
    for line in gzip.decompress(ARCHIVE.read_bytes()).decode().splitlines():
        value=json.loads(line);cache[State.load(value['state'])]=value
    imported=len(cache);cache_file=WORK/'scores.jsonl';output=Path(str(PREFIX)+'.json')
    report=dict(version='toned-2126-v52-m19-exact-v1',hashes=ctx.hashes,
        contract=dict(MlowerMaximum=19,MguardVariants=[22,21],Dvariants=[3,2],leftPinkyMaximum=.085,actualFirstKeys=21,rowCounts=[10,9,7],shapeKeysByMeaning='AEUIO',toneKeysByTone='IEUAO',toneDigitsByShapeMeaning='42310'),
        archiveSource=str(ARCHIVE),importedFullEvaluations=imported,routes=[],complete=False)
    if output.exists():
        previous=read(output)
        if previous['hashes']!=ctx.hashes:raise ValueError('resume fingerprint changed')
        report=previous
    if cache_file.exists():
        for line in cache_file.read_text(encoding='utf8').splitlines():
            value=json.loads(line);cache[State.load(value['state'])]=value
    stream=cache_file.open('a',encoding='utf8')
    def batch(states,pool):
        states=list(states);missing=[s for s in states if s not in cache]
        for state,value in zip(missing,pool.map(ctx.calculate,missing),strict=True):
            cache[state]=value;stream.write(json.dumps(value,separators=(',',':'))+'\n')
            if (len(cache)-imported)%200==0:stream.flush();print('new full evaluations',len(cache)-imported,flush=True)
        stream.flush();return [cache[s] for s in states]
    # Kernel/input parity with an imported state before accepting cache reuse.
    anchor=next(iter(cache));actual=ctx.calculate(anchor)
    for field in ['score','doubleScore','leftPinkyPeak']:
        if abs(actual[field]-cache[anchor][field])>1e-10:raise ValueError('import scorer changed '+field)
    started=time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for guard,max_d,objective in itertools.product([22,21],[3,2],['default','double']):
            ctx.max_guard=guard;field='score' if objective=='default' else 'doubleScore';name=f'M19-{guard}-D{max_d}-{objective}'
            route=next((r for r in report['routes'] if r['name']==name),None)
            if route and route['complete']:continue
            if route is None:
                eligible=[v for s,v in cache.items() if v['eligible'] and ctx.valid(s,max_d)]
                if not eligible:raise ValueError('no feasible archive seed '+name)
                best=min(eligible,key=lambda v:v[field]);state=State.load(best['state'])
                route=dict(name=name,MguardMaximum=guard,Dmaximum=max_d,objective=objective,
                    history=[dict(state=best['state'],score=best['score'],doubleScore=best['doubleScore'])],passes=[],complete=False);report['routes'].append(route)
            else:state=State.load(route['history'][-1]['state'])
            value=batch([state],pool)[0]
            while True:
                moves=ctx.joint_neighbors(state,max_d);values=batch(moves,pool);eligible=[v for v in values if v['eligible']]
                best=min([value]+eligible,key=lambda v:v[field]);audit=dict(anchorState=dataclasses.asdict(state),anchorObjective=value[field],neighbors=len(moves),leftPinkyRejected=sum(not v['eligible'] for v in values),bestObjective=best[field],
                    moveCounts={kind:sum(m['kind']==kind for m in moves.values()) for kind in sorted({m['kind'] for m in moves.values()})})
                route['passes'].append(audit);print(name,'pass',len(route['passes']),'best',best['score'],best['doubleScore'],'M',best['memoryLower'],best['memoryGuard'],'D',best['D'],flush=True)
                if best[field]>=value[field]-1e-10:route.update(complete=True,result=value);break
                next_state=State.load(best['state']);route['history'].append(dict(state=best['state'],score=best['score'],doubleScore=best['doubleScore'],move=moves[next_state]));state=next_state;value=best;write(output,report)
            write(output,report)
    stream.close();report.update(complete=True,newFullEvaluations=len(cache)-imported,totalCachedEvaluations=len(cache),elapsedSeconds=time.monotonic()-started,baseline=old['baseline'])
    frozen=Path(str(PREFIX)+'-scores.jsonl.gz');frozen.write_bytes(gzip.compress(cache_file.read_bytes(),mtime=0));report['scoresSha256']=sha(frozen)
    export(ctx,report,cache);write(output,report)
    print('COMPLETE',report['newFullEvaluations'],'new full scores',[(r['name'],r['result']['score'],r['result']['doubleScore']) for r in report['routes']],flush=True)


if __name__=='__main__':main()
