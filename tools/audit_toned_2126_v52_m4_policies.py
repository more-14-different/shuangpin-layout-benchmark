"""Exhaust all 144 policies for each M4 finalist; no pinky screening."""
import concurrent.futures
import dataclasses
import gzip
import itertools
import json
from pathlib import Path

from refine_toned_2126_v52_m4 import Context,State,ROOT,PREFIX,ARCHIVES,M19
from check_toned_2126_v52_seed_neighbors import read,write


def main():
    search=read(str(PREFIX)+'.json');assert search['complete']
    source=read(str(PREFIX)+'-finalists.json');ctx=Context(ROOT.parent/'shuangpin-layout-benchmark')
    cache={}
    for archive in ARCHIVES+[Path(str(PREFIX)+'-scores.jsonl.gz')]:
        with gzip.open(archive,'rt',encoding='utf8') as stream:
            for line in stream:
                row=json.loads(line);row['eligible']=True;cache[State.load(row['state'])]=row
    for result in json.loads(gzip.decompress(Path(str(M19)+'-policies.json.gz').read_bytes()))['results']:
        for row in result['policies']:
            row['eligible']=True;cache[State.load(row['state'])]=row
    pairs=lambda n:map(''.join,itertools.permutations('1234'[:n],2))
    policies=list(itertools.product(pairs(2),pairs(3),pairs(4)))
    results=[];new=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for layout in source['layouts']:
            center=dataclasses.replace(ctx.state(layout),policy=tuple(layout['policy']))
            states=[dataclasses.replace(center,policy=p) for p in policies]
            missing=[s for s in states if s not in cache];new+=len(missing)
            for s,row in zip(missing,pool.map(ctx.calculate,missing),strict=True):cache[s]=row
            rows=[cache[s] for s in states];right=1.
            eligible=[r for r in rows if r['eligible'] and max(t['rightPinky'] for t in r['ergonomics'].values())<=right+1e-12]
            def pick(field):
                best=min(eligible,key=lambda r:r[field]);return dict(policy=best['state']['policy'],score=best[field])
            anchor=cache[center];default=pick('score');double=pick('doubleScore')
            results.append(dict(id=layout['id'],originRoutes=layout['originRoutes'],publishedPolicy=layout['policy'],
                rightPinkyMaximum=right,eligiblePolicies=len(eligible),policies=rows,bestDefault=default,bestDouble=double,
                defaultRegret=anchor['score']-default['score'],doubleRegret=anchor['doubleScore']-double['score']))
            print(layout['id'],layout['originRoutes'],default,double,flush=True)
    output=dict(version=1,complete=True,newFullEvaluations=new,results=results)
    Path(str(PREFIX)+'-policies.json.gz').write_bytes(gzip.compress((json.dumps(output,separators=(',',':'))+'\n').encode(),mtime=0))


if __name__=='__main__':main()
