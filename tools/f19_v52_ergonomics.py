"""Native terminal-code loads at each layout's fixed robust auxiliary policy."""
import gzip
import argparse
import json
from pathlib import Path

import numpy as np
from enumerate_f19_v52_policies import competition,physical_keys,load_tables,ROOT,WORK,PREFIX,KINDS,read

FINGER={k:i for i,keys in [(0,'QAZ'),(1,'WSX'),(2,'EDC'),(3,'RFVTGB'),(6,'YHNUJM'),(7,'IK'),(8,'OL'),(9,'P')] for k in keys}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--prefix',type=Path,default=PREFIX)
    prefix=parser.parse_args().prefix
    candidates=read(str(prefix)+'-candidates.json');audit=read(str(prefix)+'-robustness.json')
    metadata=read(WORK/'policy-templates.json');rows=np.fromfile(WORK/'policy-templates.bin',np.int32).reshape(-1,11)
    motor=load_tables(ROOT/'tools/ckt_v4_upstream_role_tables.json','tables')
    errors=load_tables(ROOT/'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json','errorTables')
    by_id={r['id']:r for r in candidates['layouts']};results=[]
    for selection in audit['results']:
        layout=by_id[selection['id']];policy=selection['selected']['policy'];orders=np.zeros((4,3),np.int64);orders[0,:2]=[0,1]
        for i,k in [(1,'word2'),(2,'word3'),(3,'word4')]:orders[i,:len(policy[k])]=[int(x)-1 for x in policy[k]]
        totals,weights,counts,loads,transitions=competition(rows,physical_keys(layout,metadata),orders,15,motor,errors,True)
        tracks={}
        for i,kind in enumerate(KINDS):
            load={chr(65+j):float(loads[i,j]/loads[i].sum()) for j in range(26)}
            group=lambda keys:sum(load[k] for k in keys)
            finger=[sum(load[k] for k in FINGER if FINGER[k]==j) for j in range(10)]
            tracks[kind]=dict(load=load,home=group('ASDFGHJKL'),leftPinkyQAZ=group('QAZ'),rightPinky=group('P'),
                indexFingerTYB=group('TYB'),maxFinger=max(finger),finger=finger,
                differentKeySameFingerRate=float(transitions[i,1]/transitions[i,0]))
        peak=lambda field: max((dict(value=v[field],track=k) for k,v in tracks.items()),key=lambda x:x['value'])
        results.append(dict(id=layout['id'],policy=policy,tracks=tracks,homeS2=tracks['character']['home'],
            homeFloor4NativeTracks=min(t['home'] for t in tracks.values()),
            leftPinkyQAZPeak4NativeTracks=peak('leftPinkyQAZ'),rightPinkyPeak4NativeTracks=peak('rightPinky'),
            maxFingerPeak4NativeTracks=peak('maxFinger'),s2DifferentKeySameFingerRate=tracks['character']['differentKeySameFingerRate']))
    payload=dict(version='f19-v52-selected-policy-ergonomics-v1',
        contract='Frequency-weighted selected terminal codes in four native tracks, including shape completion; peaks are across tracks, not one mixed stream. No old moving-hand score.',results=results)
    Path(str(prefix)+'-ergonomics.json').write_text(json.dumps(payload,indent=2)+'\n',encoding='utf-8')
    print('ergonomics layouts',len(results))


if __name__=='__main__':main()
