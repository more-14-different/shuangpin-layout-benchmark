"""Complete all 144 policies for each final or right-pinky-control layout."""
import concurrent.futures
import dataclasses
import gzip
import itertools
import json
from pathlib import Path

from search_toned_2126_v52_m19 import Context,State,ROOT,PREFIX,ARCHIVE


def main():
    read=lambda p:json.loads(Path(p).read_text(encoding='utf8'))
    source=read(str(PREFIX)+'-finalists.json');ctx=Context(ROOT.parent/'shuangpin-layout-benchmark',.085)
    raw=gzip.decompress(ARCHIVE.read_bytes()).decode()+gzip.decompress(Path(str(PREFIX)+'-scores.jsonl.gz').read_bytes()).decode()
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
            # A screened control is not a closed search center. If one policy
            # improves both tested cost points, publish that actual policy.
            item=results[-1]
            if layout['id'] in controlled and list(item['bestDefault']['policy'])==list(item['bestDouble']['policy']):
                best=next(r for r in eligible if list(r['state']['policy'])==list(item['bestDefault']['policy']))
                if best['score']<=anchor['score']+1e-10 and best['doubleScore']<=anchor['doubleScore']+1e-10:
                    layout.update(policy=list(best['state']['policy']),score=best['score'],doubleScore=best['doubleScore'],tracks=best['tracks'],ergonomics=best['ergonomics'])
                    item.update(publishedPolicy=layout['policy'],defaultRegret=best['score']-item['bestDefault']['score'],doubleRegret=best['doubleScore']-item['bestDouble']['score'])
            print(layout['id'],'default',results[-1]['bestDefault'],'double',results[-1]['bestDouble'],flush=True)
    Path(str(PREFIX)+'-finalists.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    Path(str(PREFIX)+'-policies.json.gz').write_bytes(gzip.compress((json.dumps(dict(version=1,complete=True,results=results),separators=(',',':'))+'\n').encode(),mtime=0))


if __name__=='__main__':main()
