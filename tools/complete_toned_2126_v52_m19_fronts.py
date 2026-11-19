"""Recenter all eight budgets on each other's discoveries until closed.

A default-cost route must not retain a worse solution merely because a later
doubled-cost route discovers a new basin. Share exact scores and revisit any
route whose incumbent is beaten by a recorded feasible state.
"""
import concurrent.futures
import dataclasses
import gzip
import json
from pathlib import Path
import time

from search_toned_2126_v52_m19 import Context,State,ROOT,PREFIX,WORK,ARCHIVE,export
from check_toned_2126_v52_seed_neighbors import read,write,sha


def main():
    ctx=Context(ROOT.parent/'shuangpin-layout-benchmark');report=read(str(PREFIX)+'.json');assert report['complete']
    if ctx.hashes!=report['hashes']:raise ValueError('source changed')
    cache={}
    cache_file=WORK/'scores.jsonl'
    for raw in [gzip.decompress(ARCHIVE.read_bytes()).decode(),cache_file.read_text(encoding='utf8')]:
        for row in map(json.loads,raw.splitlines()):cache[State.load(row['state'])]=row
    ctx.calculate(next(iter(cache)));stream=cache_file.open('a',encoding='utf8');started=time.monotonic();before=len(cache)
    def batch(states,pool):
        states=list(states);missing=[s for s in states if s not in cache]
        for state,value in zip(missing,pool.map(ctx.calculate,missing),strict=True):
            cache[state]=value;stream.write(json.dumps(value,separators=(',',':'))+'\n')
        stream.flush();return [cache[s] for s in states]
    cycles=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        while True:
            cycles+=1;changed=False
            for route in report['routes']:
                ctx.max_guard=route['MguardMaximum'];d=route['Dmaximum'];field='score' if route['objective']=='default' else 'doubleScore'
                best=min((r for s,r in cache.items() if r['eligible'] and ctx.valid(s,d)),key=lambda r:r[field])
                if best[field]>=route['result'][field]-1e-10:continue
                changed=True;state=State.load(best['state']);value=best
                route['history'].append(dict(state=best['state'],score=best['score'],doubleScore=best['doubleScore'],move=dict(kind='cross-objective-recenter',cycle=cycles)))
                while True:
                    moves=ctx.joint_neighbors(state,d);values=batch(moves,pool)
                    best=min([value]+[v for v in values if v['eligible']],key=lambda r:r[field])
                    route['passes'].append(dict(anchorState=dataclasses.asdict(state),anchorObjective=value[field],neighbors=len(moves),leftPinkyRejected=sum(not v['eligible'] for v in values),bestObjective=best[field],
                        recenterCycle=cycles,moveCounts={kind:sum(m['kind']==kind for m in moves.values()) for kind in sorted({m['kind'] for m in moves.values()})}))
                    print('recenter',route['name'],'best',best['score'],best['doubleScore'],'new',len(cache)-before,flush=True)
                    if best[field]>=value[field]-1e-10:route['result']=value;break
                    next_state=State.load(best['state']);route['history'].append(dict(state=best['state'],score=best['score'],doubleScore=best['doubleScore'],move=moves[next_state]));state=next_state;value=best
            if not changed:break
    stream.close();report.update(newFullEvaluations=len(cache)-report['importedFullEvaluations'],totalCachedEvaluations=len(cache))
    report['crossObjectiveRecenter']=dict(cycles=cycles,newFullEvaluations=len(cache)-before,elapsedSeconds=time.monotonic()-started,sourceSha256=sha(__file__),criterion='Repeat all routes until no fully scored feasible state improves any incumbent, and every final incumbent has a complete exact joint neighborhood.')
    frozen=Path(str(PREFIX)+'-scores.jsonl.gz');frozen.write_bytes(gzip.compress(cache_file.read_bytes(),mtime=0));report['scoresSha256']=sha(frozen)
    export(ctx,report,cache)
    controls=read(str(PREFIX)+'-controls.json')
    for row in controls['results']:
        row['id']='T2126-V52-M19-'+__import__('hashlib').sha256(ctx.expand(State.load(row['state'])).tobytes()).hexdigest()[:12]
    write(Path(str(PREFIX)+'-controls.json'),controls)
    write(Path(str(PREFIX)+'.json'),report);print('RECENTER COMPLETE',report['crossObjectiveRecenter'],flush=True)


if __name__=='__main__':main()
