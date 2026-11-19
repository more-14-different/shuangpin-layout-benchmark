"""Recover published representative states by exact canonical hash, never by score."""
import copy
import itertools
import json
from pathlib import Path

from prepare_f19_v52_audit import read,sha,ROOT
from prepare_cr_m24_portfolio import make_layout
from search_cr_667_zero_carriers import CarrierSpace

PREFIX=ROOT/'research/notes/2026-11-19-lan213-v52-followup'
OLD=ROOT/'research/notes/2026-11-19-f19-v52-production-audit'


def main():
    report_path=ROOT/'research/notes/2026-11-19-cr-lan-213-report.json'
    report=read(report_path);old=read(str(OLD)+'-candidates.json')
    space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs')
    anchor=next(r for r in old['layouts'] if r['id']=='f19a0ad1dc')['state']
    targets={r['key']:r for r in report['paretoFrontier']}
    for route in report['bestByRoute'].values():
        for row in [route['champion']]+route.get('runnerUps',[]):
            key=row.get('fullKey',row['key'])
            if len(key)==64:targets.setdefault(key,row)
            else:
                known=next((x['key'] for x in old['layouts'] if x.get('key','').startswith(key)),None)
                if known:targets.setdefault(known,row)
    recovered={};attempts=0
    def check(state,description):
        nonlocal attempts
        attempts+=1
        if not space.memory(state):return
        key=space.key(state)
        if key in targets and key not in recovered:
            recovered[key]=dict(state=copy.deepcopy(state),description=description)
    for row in old['layouts']:
        if 'state'in row:check(row['state'],'already published full layout')
    # The remote report also names a seed already committed with its full state.
    seed_path=ROOT/'research/notes/2026-11-17-cr-lan-fixed-policy-finalists.json'
    for row in read(seed_path)['layouts']:
        if row['key'].startswith('41d057044e'):
            targets.setdefault(row['key'],dict(key=row['key'],ckt=9.127405541323036,m=24))
            check(row['state'],'previously committed full fixed-Lan seed')
    # Enumerate the exact small edits named in the committed report. Hashes
    # identify the group when a prose note says only E->Y or R->P.
    for home,bottom in itertools.product(['S','H','J'],[False,True]):
        state=copy.deepcopy(anchor);state['groupKeys'][1][0]=home
        if bottom:state['groupKeys'][2][0],state['groupKeys'][2][8]=state['groupKeys'][2][8],state['groupKeys'][2][0]
        check(state,f'home group0={home}; bottom X/Z swap={bottom}')
        for region in range(3):
            for group in range(10):
                for key in space.f['toneRegions'][region]['keys']:
                    variant=copy.deepcopy(state);variant['groupKeys'][region][group]=key
                    check(variant,f'home group0={home}; bottom swap={bottom}; region{region} group{group}>{key}')
        for e_group in [i for i,k in enumerate(state['groupKeys'][0]) if k=='E']:
            for r_group in [i for i,k in enumerate(state['groupKeys'][0]) if k=='R']:
                variant=copy.deepcopy(state);variant['groupKeys'][0][e_group]='Y';variant['groupKeys'][0][r_group]='P'
                check(variant,f'home group0={home}; bottom swap={bottom}; upper E[{e_group}]>Y,R[{r_group}]>P')
        for root in range(18):
            for group in range(10):
                variant=copy.deepcopy(state);variant['partition'][root]=group
                check(variant,f'home group0={home}; bottom swap={bottom}; root{root}>group{group}')
    layouts=copy.deepcopy(old['layouts']);physical={tuple(r['tonedCodes']) for r in layouts}
    evidence=[]
    for key,item in recovered.items():
        if key==report['baseline']['key']:continue
        metrics=space.memory(item['state'])
        layout=make_layout(space,item['state'],dict(ckt=0),old['tokenKeys'],key[:10]);layout.pop('rustScore')
        layout.update(wordAuxiliaryPolicy=dict(word2='21',word3='213',word4='14'),
            constraints=dict(pinkyCeiling=1,rightPinkyCeiling=1),sourceOrigins=[str(report_path.relative_to(ROOT))],
            recoveredByCanonicalHash=True)
        original=targets[key]
        if 'm'in original and metrics['m']!=original['m']:raise ValueError('memory mismatch')
        if tuple(layout['tonedCodes']) not in physical:
            layouts.append(layout);physical.add(tuple(layout['tonedCodes']))
        evidence.append(dict(key=key,id=key[:10],sourceV51=original.get('ckt'),memory=metrics,
            description=item['description'],state=item['state']))
    payload={**old,'version':'lan213-v52-representative-followup-v1','layouts':layouts,
        'sourceHashes':{**old['sourceHashes'],str(report_path.relative_to(ROOT)):sha(report_path)},
        'representativeRecovery':dict(sourceCommit='91e3605',attempts=attempts,recovered=evidence,
            missingParetoKeys=[key for key in targets if key not in recovered],
            scope='Only committed representative descriptions recovered by exact canonical hash; no claim to having replayed the remote 92k cache.')}
    # "current-production" in the old cohort names the historical baseline.
    # Reconstruct its declared finals from the archived independent M audit,
    # not today's production groups (which have since switched to f19).
    previous=read(str(OLD)+'-verification.json')
    groups=next(r for r in previous['memories'] if r['id']=='current-production')['audit']['groups']
    decomposition=read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']
    production=next(r for r in layouts if r['id']=='current-production')
    production['rhymeGroups']=[dict(finals=sorted({r['fullFinal'] for r in decomposition if
        (r['fullFinal'] if r['rhymeBody']=='_' else r['rhymeBody']) in g['roots']}),
        keys=dict(zip(['upper','home','lower'],g['keys']))) for g in groups]
    payload['productionBaselineFrozen']=True
    payload['productionBaselineMeaning']='current-production ID retained for compatibility: historical pre-f19 frozen baseline, not the current deployed layout.'
    Path(str(PREFIX)+'-candidates.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('representatives',len(evidence),'combined layouts',len(layouts),'recovered',[(x['id'],x['description']) for x in evidence],flush=True)


if __name__=='__main__':main()
