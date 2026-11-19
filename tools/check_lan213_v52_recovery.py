"""Reproduce the remote representatives' v5.1 scores and canonical state hashes."""
import argparse
import json
from pathlib import Path

import numpy as np
from enumerate_f19_v52_policies import competition,physical_keys,load_tables,read,ROOT,WORK
from search_cr_667_zero_carriers import CarrierSpace

PREFIX=ROOT/'research/notes/2026-11-19-lan213-v52-followup'


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--prefix',type=Path,default=PREFIX)
    prefix=parser.parse_args().prefix
    data=read(str(prefix)+'-candidates.json');meta=read(WORK/'policy-templates.json')
    rows=np.fromfile(WORK/'policy-templates.bin',np.int32).reshape(-1,11)
    motor=load_tables(ROOT/'tools/ckt_v4_upstream_role_tables.json','tables')
    zero=tuple(np.zeros_like(x) for x in motor)
    ref=read(ROOT/'research/notes/2026-11-18-ckt-v52-all-schemes.json')['references']['v51']['keytao']
    denominators=np.array([ref[k]['effectiveMs'] for k in ['character','word2','word3','word4']])
    orders=np.array([[0,1,0],[1,0,0],[1,0,2],[0,3,0]],np.int64)
    space=CarrierSpace(ROOT/'research/.cache/cr-lan-fixed-20261117/inputs');results=[]
    for evidence in data['representativeRecovery']['recovered']:
        layout=next(r for r in data['layouts'] if r['id']==evidence['id'])
        if space.key(layout['state'])!=evidence['key']:raise ValueError('canonical hash mismatch')
        totals,weights,*_=competition(rows,physical_keys(layout,meta),orders,15,motor,zero)
        values=totals/weights[:,None]
        effective=values[:,0]+300*values[:,1:4].sum(axis=1)+600*values[:,4]+50*values[:,5]+300*values[:,6]
        score=float(10*np.average((effective/denominators)**4,weights=[1,3,1,1])**.25)
        delta=score-evidence['sourceV51']
        # One source table is rounded to six decimals; all full-precision rows
        # must match tightly, rather than extending that tolerance to all rows.
        tolerance=5.1e-7 if evidence['id']=='0ca4838ebd' else 1e-9
        if abs(delta)>tolerance:raise ValueError('source v5.1 score mismatch '+layout['id'])
        result=dict(id=layout['id'],canonicalKey=space.key(layout['state']),publishedV51=evidence['sourceV51'],
            replayedV51=score,difference=delta,memory=space.memory(layout['state']),dailyReplay=space.daily(layout['state']))
        results.append(result)
        print(layout['id'],score,'delta',delta,flush=True)
    Path(str(prefix)+'-recovery.json').write_text(json.dumps(dict(results=results,
        scope='Hash-recovered committed representatives. Original fixed 21/213/14 v5.1 scores reproduced; only the rounded 0ca source uses half-last-decimal tolerance.'),indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':main()
