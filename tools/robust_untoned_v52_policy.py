"""Exact mean-rank robustness of all 144 policies on independent six-cost grids."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import numpy as np
from analyze_single_ckt_v51_aux_order import competition_ranks

KINDS=['character','word2','word3','word4']
WEIGHTS=[1,3,1,1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    raw=args.input.read_bytes()
    data=json.loads(gzip.decompress(raw))
    rates=data['coefficients'];costs=np.asarray(data['baselineCostsMs'])
    vector=lambda t:np.asarray([t['motorUpperMs']]+[t[k]*c for k,c in zip(rates,costs)])
    out=dict(version='untoned-v52-mean-rank-robustness-1',id=data['id'],inputSha256=hashlib.sha256(raw).hexdigest(),
        criterion='main positive 50%-500% six independent cognitive-cost multipliers; minimum mean competition rank, then Top3, Top1, worst rank, policy key',
        scenariosPerGrid=1000000,grids={},selectedPolicies={},selectedTracks={})
    for name,step in [('mainPositive50To500',.5),('extremePositive100To1000',1.)]:
        result={}
        for mode,case in data['cases'].items():
            rows=case['results'];count=len(rows);keys=[r['policyKey'] for r in rows]
            reference=np.asarray([vector(data['reference'][mode][k]) for k in KINDS])
            factors=[]
            for kind in KINDS:
                unique=[];indices=[]
                for row in rows:
                    v=vector(row['tracks'][kind]);key=tuple(v)
                    if key not in unique:unique.append(key)
                    indices.append(unique.index(key))
                factors.append((np.asarray(unique),np.asarray(indices)))
            rank_sum=np.zeros(count,np.int64);top1=np.zeros(count,np.int64);top3=np.zeros(count,np.int64);worst=np.zeros(count,np.int16)
            for start in range(0,10**6,8192):
                q=np.arange(start,min(start+8192,10**6));grid=np.empty((len(q),6))
                for axis in range(5,-1,-1):grid[:,axis]=((q%10)+1)*step;q//=10
                fourth=np.zeros((len(grid),count))
                for i,(v,indices) in enumerate(factors):
                    effective=v[:,0][None,:]+grid@v[:,1:].T
                    den=reference[i,0]+grid@reference[i,1:]
                    fourth+=WEIGHTS[i]*((effective/den[:,None])**4)[:,indices]
                scores=10*(fourth/6)**.25
                ranks=competition_ranks(scores)
                rank_sum+=ranks.sum(axis=0);top1+=(ranks==1).sum(axis=0);top3+=(ranks<=3).sum(axis=0);worst=np.maximum(worst,ranks.max(axis=0))
            ranking=sorted([dict(policy=keys[i],meanRank=float(rank_sum[i]/10**6),top1Rate=float(top1[i]/10**6),top3Rate=float(top3[i]/10**6),worstRank=int(worst[i])) for i in range(count)],
                key=lambda r:(r['meanRank'],-r['top3Rate'],-r['top1Rate'],r['worstRank'],r['policy']))
            result[mode]=dict(winner=ranking[0],runnerUp=ranking[1],top10=ranking[:10])
            if name=='mainPositive50To500':
                selected=ranking[0]['policy'];out['selectedPolicies'][mode]=selected
                out['selectedTracks'][mode]=next(r['tracks'] for r in rows if r['policyKey']==selected)
            print(name,mode,ranking[0],flush=True)
        out['grids'][name]=result
        args.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    out['completed']=True
    args.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')

if __name__=='__main__':main()
