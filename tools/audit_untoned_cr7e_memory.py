"""Replay M-R2 using the original independent Python syllable inspector."""
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
REPLAY=ROOT/'research/.cache/R11_integrated_replay'
sys.path.insert(0,str(REPLAY))
import memory_r2

def main():
    file=ROOT/'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'
    payload=json.loads(file.read_text(encoding='utf-8'))
    output={'version':'untoned-cr7e-memory-r2-independent-1','results':[]}
    for row in payload['results']:
        e={**row,'capacity':[21,21]}
        result=memory_r2.audit(payload['auditInput'],e)
        actual=row['audit']
        assert (result['M'],result['ordinaryDisplacedCount'],result['branchCount'],result['unique'])==(actual['M'],actual['D'],actual['branches'],actual['unique'])
        assert result['coverage']==399
        output['results'].append({'id':row['id'],'M':result['M'],'D':result['ordinaryDisplacedCount'],'V':actual['V'],
            'unique':result['unique'],'coverage':result['coverage'],'branchCount':result['branchCount'],'firstItems':result['firstItems'],'finalItems':result['finalItems']})
    output['sources']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [file,REPLAY/'memory_r2.py',REPLAY/'audit.py',Path(__file__)]}
    dest=ROOT/'research/notes/2026-11-19-untoned-cr7e-v52-memory.json'
    dest.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps([{'id':r['id'],'M':r['M'],'D':r['D'],'unique':r['unique']} for r in output['results']]))

if __name__=='__main__':main()
