"""Schedule exact local polish from genuinely new annealed root groupings."""
import dataclasses
import gzip
import json
from pathlib import Path

from search_toned_2126_um40_wide import PREFIX,PREVIOUS,WORK,State,compact,atomic_checkpoint,sha,read,score_archives


def grouping(s):
    return tuple(sorted(tuple(i for i,g in enumerate(s.partition) if g==group) for group in range(10)))


def select_novel(cache,old,field,count):
    selected=[];seen=set(old)
    for s in sorted(cache,key=lambda s:cache[s][field]):
        signature=grouping(s)
        if signature in seen:continue
        selected.append(s);seen.add(signature)
        if len(selected)>=count:break
    return selected


def main():
    output=Path(str(PREFIX)+'.json');report=read(output)
    if 'novelGroupPolish' in report:print('Novel-group polish already scheduled');return
    assert report['complete'],'complete the first wide phase before extending'
    assert not Path(str(PREFIX)+'-scores-index.json').exists(),'extend before publishing score parts'
    old=set();cache={}
    for archive in score_archives(PREVIOUS):
        with gzip.open(archive,'rt',encoding='utf8') as stream:
            for line in stream:old.add(grouping(State.load(json.loads(line)['state'])))
    log=WORK/'scores.jsonl'
    with log.open(encoding='utf8') as stream:
        for line in stream:
            v=compact(json.loads(line));cache[State.load(v['state'])]=v
    selected=[dict(objective=field,state=dataclasses.asdict(s),origin='novel-root-grouping')
        for field in ('score','doubleScore') for s in select_novel(cache,old,field,4)]
    assert selected,'no novel root groupings found'
    report['novelGroupPolish']=dict(previousRootGroupings=len(old),newRootGroupings=len({grouping(s) for s in cache}-old),
        initialWideEvaluations=report['newFullEvaluations'],additionalRoutes=len(selected),sourceSha256=sha(Path(__file__)),seeds=selected)
    report['polishSeeds'].extend(selected);report.update(complete=False,polishComplete=False)
    report['extraSourcePaths'].append('tools/extend_toned_2126_um40_wide_basins.py')
    atomic_checkpoint(output,report)
    print('Scheduled',len(selected),'new-group polish routes;',report['novelGroupPolish']['newRootGroupings'],'previously unseen groupings')


if __name__=='__main__':main()
