"""Measure UED robust-policy margins on the already recomputed million grids."""
import gzip
import hashlib
import json
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-21-ued-robust-review'
COMPONENTS=ROOT/'research/notes/2026-11-20-untoned-frontiers-r11-components-UED-18c004bd1f31.json.gz'
ORIGINAL=ROOT/'research/notes/2026-11-20-untoned-frontiers-r11-robustness-UED-18c004bd1f31.json'
KINDS=['character','word2','word3','word4']
WEIGHTS=np.asarray([1,3,1,1])
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def main():
    data=json.loads(gzip.decompress(COMPONENTS.read_bytes()));grid_path=Path(str(PREFIX)+'-grid.json');grid=read(grid_path)
    original=read(ORIGINAL);assert grid['completed'] and grid['inputSha256']==sha(COMPONENTS)
    assert grid['grids']==original['grids'] and grid['selectedPolicies']==original['selectedPolicies']
    fields=data['coefficients'];costs=data['baselineCostsMs']
    vector=lambda t:np.asarray([t['motorUpperMs']]+[t[f]*c for f,c in zip(fields,costs)])
    vec={mode:{row['policyKey']:np.asarray([vector(row['tracks'][k]) for k in KINDS]) for row in case['results']} for mode,case in data['cases'].items()}
    reference={mode:np.asarray([vector(data['reference'][mode][k]) for k in KINDS]) for mode in vec}
    def fourth(v,ref,multipliers):
        return sum(WEIGHTS[i]*((v[i,0]+multipliers@v[i,1:])/(ref[i,0]+multipliers@ref[i,1:]))**4 for i in range(4))
    results={}
    for name,step in [('mainPositive50To500',.5),('extremePositive100To1000',1.)]:
        results[name]={}
        for mode,ranking in grid['grids'][name].items():
            winner=ranking['winner'];runner=ranking['runnerUp'];gaps=np.empty(1000000);min_point=None
            for start in range(0,1000000,65536):
                stop=min(start+65536,1000000);q=np.arange(start,stop);factors=np.empty((len(q),6))
                for axis in range(5,-1,-1):factors[:,axis]=(q%10+1)*step;q//=10
                wscore=10*(fourth(vec[mode][winner['policy']],reference[mode],factors)/6)**.25
                rscore=10*(fourth(vec[mode][runner['policy']],reference[mode],factors)/6)**.25
                gaps[start:stop]=rscore-wscore
                index=int(np.argmin(rscore-wscore))
                if min_point is None or float(gaps[start+index])<min_point['gap']:
                    min_point=dict(gap=float(gaps[start+index]),multipliers=factors[index].tolist(),winnerScore=float(wscore[index]),runnerScore=float(rscore[index]))
            point=[]
            for m in [1,2,3]:
                factors=np.full((1,6),m);a=float((10*(fourth(vec[mode][winner['policy']],reference[mode],factors)/6)**.25)[0]);b=float((10*(fourth(vec[mode][runner['policy']],reference[mode],factors)/6)**.25)[0])
                point.append(dict(multiplier=m,winnerScore=a,runnerScore=b,gap=b-a,relativePercent=100*(b-a)/a))
            results[name][mode]=dict(winner=winner,runnerUp=runner,meanRankGap=runner['meanRank']-winner['meanRank'],
                pairwiseWinnerRate=float(np.mean(gaps>1e-9)),pairwiseTieRate=float(np.mean(np.abs(gaps)<=1e-9)),pairwiseLossRate=float(np.mean(gaps < -1e-9)),
                cktGapQuantiles=dict(zip(['minimum','p05','median','p95','maximum'],map(float,np.quantile(gaps,[0,.05,.5,.95,1])))),meanCktGap=float(np.mean(gaps)),worstPairwisePoint=min_point,uniformCostPoints=point)
    combinations=[]
    for multiplier in [1,2,3]:
        factors=np.full((1,6),multiplier)
        ranked={mode:sorted([(key,float(fourth(v,reference[mode],factors)[0])) for key,v in policies.items()],key=lambda x:x[1]) for mode,policies in vec.items()}
        all_scores=[(10*((a[1]+b[1])/12)**.25,a[0],b[0]) for a in ranked['keytao'] for b in ranked['sanpin']];all_scores.sort()
        a,b=all_scores[:2];combinations.append(dict(multiplier=multiplier,winner=dict(score=a[0],keytao=a[1],sanpin=a[2]),runnerUp=dict(score=b[0],keytao=b[1],sanpin=b[2]),gap=b[0]-a[0],relativePercent=100*(b[0]-a[0])/a[0]))
    files=[Path(__file__),COMPONENTS,ORIGINAL,grid_path,ROOT/'tools/robust_untoned_v52_policy.py',ROOT/'tools/analyze_single_ckt_v51_aux_order.py']
    result=dict(completed=True,id='UED-18c004bd1f31',criterion=grid['criterion'],scenarioAxes=fields,baselineCostsMs=costs,scenariosPerGrid=1000000,selectedPolicies=grid['selectedPolicies'],grids=results,jointUniformPointTop2=combinations,
        interpretation='Robust winners/runners ranked separately per member. CKT gaps here are member-normalized scores unless explicitly in jointUniformPointTop2; joint table enumerates all 144x144 policies only at uniform 1/2/3 cost points. Gaps positive favor robust winner. Grid competitor is its fixed robust runner, not every scenario own second-best.',
        sourceHashes={str(p):sha(p) for p in files})
    Path(str(PREFIX)+'-margins.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    for name,modes in results.items():
        for mode,r in modes.items():print(name,mode,'rankGap',r['meanRankGap'],'winnerTop1',r['winner']['top1Rate'],'pairwiseWin',r['pairwiseWinnerRate'],'point1Gap',r['uniformCostPoints'][0]['gap'],'gapQuantiles',r['cktGapQuantiles'])
    print('joint',json.dumps(combinations))

if __name__=='__main__':main()
