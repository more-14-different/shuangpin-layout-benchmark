"""Complete all 144 policies for each final or right-pinky-control layout."""
import concurrent.futures
import dataclasses
import gzip
import itertools
import json
from pathlib import Path

from search_toned_2126_v52_onsets import Context,State,ROOT,PREFIX


def main():
    read=lambda p:json.loads(Path(p).read_text(encoding='utf8'))
    source=read(str(PREFIX)+'-finalists.json');ctx=Context(ROOT.parent/'shuangpin-layout-benchmark',.085)
    raw=gzip.decompress(Path(str(PREFIX)+'-scores.jsonl.gz').read_bytes()).decode()
    cache={State.load(r['state']):r for r in map(json.loads,raw.splitlines())}
    controls=read(str(PREFIX)+'-controls.json');controlled={r['id'] for r in controls['results']}
    right=controls['rightPinkyCeiling'];results=[]
    pairs=lambda n:map(''.join,itertools.permutations('1234'[:n],2))
    policies=list(itertools.product(pairs(2),pairs(3),pairs(4)))
    ctx.calculate(ctx.state(source['layouts'][0]))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for layout in source['layouts']:
            center=ctx.state(layout);states=[dataclasses.replace(center,policy=p) for p in policies]
            missing=[s for s in states if s not in cache]
            for s,row in zip(missing,pool.map(ctx.calculate,missing),strict=True):cache[s]=row
            rows=[cache[s] for s in states]
            eligible=[r for r in rows if r['eligible'] and (layout['id'] not in controlled or max(t['rightPinky'] for t in r['ergonomics'].values())<=right+1e-12)]
            pick=lambda field:dict(policy=min(eligible,key=lambda r:r[field])['state']['policy'],score=min(eligible,key=lambda r:r[field])[field])
            anchor=next(r for r in rows if r['state']['policy']==layout['policy'])
            results.append(dict(id=layout['id'],eligiblePolicies=len(eligible),policies=rows,bestDefault=pick('score'),bestDouble=pick('doubleScore'),
                publishedPolicy=layout['policy'],defaultRegret=anchor['score']-pick('score')['score'],doubleRegret=anchor['doubleScore']-pick('doubleScore')['score']))
            print(layout['id'],'default',results[-1]['bestDefault'],'double',results[-1]['bestDouble'],flush=True)
    Path(str(PREFIX)+'-policies.json.gz').write_bytes(gzip.compress((json.dumps(dict(version=1,complete=True,results=results),separators=(',',':'))+'\n').encode(),mtime=0))


if __name__=='__main__':main()
