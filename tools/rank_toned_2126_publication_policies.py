"""Rank every representative's 144 policies on the same independent cost grids."""
import argparse, hashlib, json
from pathlib import Path
import numpy as np
import cupy as cp
from analyze_single_ckt_v51_aux_order import vectors,grid,WEIGHTS,competition_ranks

p=argparse.ArgumentParser();p.add_argument('--smoke',action='store_true');args=p.parse_args()
inp=Path('research/notes/2026-11-17-toned-2126-robustness-input.json')
s=json.loads(inp.read_text(encoding='utf8'));assert s['complete']
keys=[e['policyKey'] for e in s['models'][0]['evaluations']]
assert len(keys)==len(set(keys))==144
arrays=[]
for model in s['models']:
    by={e['policyKey']:e for e in model['evaluations']};assert len(by)==144
    arrays.append([vectors(by[k],s['baselineCostsMs']) for k in keys])
a=np.array(arrays);ref=vectors({'tracks':s['reference']},s['baselineCostsMs'])
cp.get_default_memory_pool().set_limit(size=1024**3)
ga=cp.asarray(a);gr=cp.asarray(ref);gw=cp.asarray(WEIGHTS)
def cpu(points):
    eff=a[:,:,:,0][None,:,:,:]+np.tensordot(points,a[:,:,:,1:],axes=(1,3))
    den=ref[:,0][None,:]+points@ref[:,1:].T
    return 10*(np.sum(WEIGHTS*(eff/den[:,None,None,:])**4,axis=3)/WEIGHTS.sum())**.25
def gpu(points):
    v=cp.asarray(points);eff=ga[:,:,:,0][None,:,:,:]+cp.tensordot(v,ga[:,:,:,1:],axes=(1,3))
    den=gr[:,0][None,:]+v@gr[:,1:].T
    return 10*(cp.sum(gw*(eff/den[:,None,None,:])**4,axis=3)/gw.sum())**.25
kernel=cp.RawKernel(r'''
extern "C" __global__ void ranks(const double* sorted,const long long* order,short* out,int rows,int n){
 int r=blockIdx.x*blockDim.x+threadIdx.x;if(r>=rows)return;
 long long base=(long long)r*n;int rank=1;
 for(int j=0;j<n;j++){if(j && sorted[base+j]-sorted[base+j-1]>1e-9)rank=j+1;out[base+order[base+j]]=rank;}
}''','ranks')
def rank(values):
    flat=cp.ascontiguousarray(values.reshape(-1,144));order=cp.argsort(flat,axis=1)
    sorted_=cp.take_along_axis(flat,order,axis=1);out=cp.empty(flat.shape,dtype=cp.int16)
    kernel(((len(flat)+127)//128,),(128,),(sorted_,order,out,np.int32(len(flat)),np.int32(144)))
    return out.reshape(values.shape)
rng=np.random.default_rng(212617)
probe=np.vstack([np.ones(6),np.zeros(6),rng.uniform(0,10,(30,6))]);c=cpu(probe);g=cp.asnumpy(gpu(probe))
np.testing.assert_allclose(c,g,atol=1e-10,rtol=0)
np.testing.assert_array_equal(competition_ranks(c.reshape(-1,144)),cp.asnumpy(rank(gpu(probe))).reshape(-1,144))
for i,m in enumerate(s['models']):
    by={e['policyKey']:e for e in m['evaluations']}
    np.testing.assert_allclose(c[0,i],[by[k]['score'] for k in keys],atol=1e-10,rtol=0)
defs={'positive50To500':(.5,5,.5),'broad0To500':(0,5,.5),'positive100To1000':(1,10,1)}
if args.smoke:defs={'smoke':(0,2,1)}
result=dict(version=1,inputSha256=hashlib.sha256(inp.read_bytes()).hexdigest(),baselineCostsMs=s['baselineCostsMs'],
    choiceRule='lowest mean rank on positive50To500; tie-break top3/top1; fixed layouts, S005 reference recomputed',
    gpuCpuMaxDifference=float(abs(c-g).max()),grids={},selected={},complete=False)
out=Path('research/.cache/toned2126-policy-smoke.json' if args.smoke else 'research/notes/2026-11-17-toned-2126-publication-policies.json')
out.parent.mkdir(parents=True,exist_ok=True)
for name,(lo,hi,step) in defs.items():
    points=grid(lo,hi,step);n=len(points);shape=(len(s['models']),144)
    top1=cp.zeros(shape,dtype=cp.int64);top3=top1.copy();rs=top1.copy();worst=cp.zeros(shape,dtype=cp.int16)
    regret=cp.zeros(shape);max_regret=regret.copy()
    for start in range(0,n,512):
        values=gpu(points[start:start+512]);r=rank(values);delta=values-cp.min(values,axis=2)[:,:,None]
        top1+=cp.sum(r==1,axis=0);top3+=cp.sum(r<=3,axis=0);rs+=cp.sum(r,axis=0,dtype=cp.int64)
        worst=cp.maximum(worst,cp.max(r,axis=0));regret+=cp.sum(delta,axis=0);max_regret=cp.maximum(max_regret,cp.max(delta,axis=0))
        if start%262144==0:print(name,start,'/',n,flush=True)
    stats=[cp.asnumpy(x) for x in [top1,top3,rs,worst,regret,max_regret]]
    result['grids'][name]=dict(range=[lo,hi],step=step,points=n,models={})
    for i,m in enumerate(s['models']):
        rows=[dict(policy=k,top1Rate=float(stats[0][i,j]/n),top3Rate=float(stats[1][i,j]/n),meanRank=float(stats[2][i,j]/n),
             worstRank=int(stats[3][i,j]),meanRegret=float(stats[4][i,j]/n),worstRegret=float(stats[5][i,j])) for j,k in enumerate(keys)]
        rows.sort(key=lambda v:(v['meanRank'],-v['top3Rate'],-v['top1Rate'],v['policy']))
        result['grids'][name]['models'][m['key']]=dict(winner=rows[0],ranking=rows)
        if name=='positive50To500':result['selected'][m['key']]=rows[0]
        print(name,m['key'],rows[0],flush=True)
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
result['complete']=True;out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
