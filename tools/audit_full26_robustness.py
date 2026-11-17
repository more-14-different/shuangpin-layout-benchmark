"""GPU/CPU six-cost sweep: all policies, fixed comparisons and optimized envelopes."""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from analyze_single_ckt_v51_aux_order import grid, competition_ranks, WEIGHTS, COMPONENTS
from full26_robust_metrics import prepare,scores,compare,single_policy,TOL

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input',type=Path,default=Path('research/notes/2026-11-17-toned-2126-robustness-input.json'))
    p.add_argument('--output',type=Path,default=Path('research/notes/2026-11-17-toned-2126-robustness.json'))
    p.add_argument('--backend',choices=['cuda','cpu'],default='cuda')
    p.add_argument('--chunk',type=int,default=512)
    p.add_argument('--smoke',action='store_true')
    args=p.parse_args()
    if not 1 <= args.chunk <= 2048: p.error('chunk must be 1..2048')
    source=json.loads(args.input.read_text(encoding='utf8'))
    keys,a,ref,published=prepare(source)
    models=[m['key'] for m in source['models']]
    xp=np
    if args.backend=='cuda':
        import cupy as cp
        xp=cp
        cp.get_default_memory_pool().set_limit(size=1024**3)
        rank_kernel=cp.RawKernel(r'''
        extern "C" __global__ void ranks(const double* sorted, const long long* order, short* out, int rows, int n, double tol){
          int r=blockIdx.x*blockDim.x+threadIdx.x;if(r>=rows)return;
          int rank=1;long long base=(long long)r*n;
          for(int j=0;j<n;j++){
            if(j && sorted[base+j]-sorted[base+j-1]>tol) rank=j+1;
            out[base+order[base+j]]=(short)rank;
          }
        }''','ranks')
    ga=xp.asarray(a);gr=xp.asarray(ref);gw=xp.asarray(WEIGHTS)
    host=lambda x:xp.asnumpy(x) if xp is not np else x
    def forward(points):
        b=xp.asarray(points)
        eff=ga[:,:,:,0][None,:,:,:]+xp.tensordot(b,ga[:,:,:,1:],axes=(1,3))
        denom=gr[:,0][None,:]+b@gr[:,1:].T
        return 10*(xp.sum(gw[None,None,None,:]*(eff/denom[:,None,None,:])**4,axis=3)/gw.sum())**.25
    def ranks(values):
        if xp is np:return competition_ranks(values,TOL)
        order=xp.argsort(values,axis=1);ordered=xp.take_along_axis(values,order,axis=1)
        result=xp.empty(values.shape,dtype=xp.int16)
        rank_kernel(((len(values)+127)//128,),(128,),(ordered,order,result,np.int32(len(values)),np.int32(values.shape[1]),np.float64(TOL)))
        return result
    rng=np.random.default_rng(20261117)
    probe=np.vstack([np.zeros(6),np.ones(6),rng.uniform(0,10,(30,6))])
    expected=scores(a,ref,probe);actual=host(forward(probe))
    np.testing.assert_allclose(actual,expected,rtol=0,atol=1e-10)
    np.testing.assert_array_equal(host(ranks(forward(probe)[:,0,:])),competition_ranks(expected[:,0,:],TOL))
    # Include intentionally tied arrays, independent of corpus coincidences.
    tied=np.tile(np.arange(144,dtype=float)//3,(32,1));rng.shuffle(tied,axis=1)
    np.testing.assert_array_equal(host(ranks(xp.asarray(tied))),competition_ranks(tied,TOL))
    definitions={'local50To200Step50':(.5,2,.5),'broad0To500Step50':(0,5,.5),
      'broadPositive50To500Step50':(.5,5,.5),'extreme0To1000Step100':(0,10,1),'extremePositive100To1000Step100':(1,10,1)}
    if args.smoke:definitions={'smoke':(0,2,1)}
    nominal=scores(a,ref,np.ones((1,6)))[0]
    result=dict(version='full26-six-cost-gap-1',input=str(args.input),inputSha256=hashlib.sha256(args.input.read_bytes()).hexdigest(),
      analysisCodeSha256={str(f):hashlib.sha256(f.read_bytes()).hexdigest() for f in [Path(__file__),Path(__file__).with_name('full26_robust_metrics.py'),Path(__file__).with_name('analyze_single_ckt_v51_aux_order.py')]},
      backend=args.backend,parityMaxDifference=float(np.max(np.abs(actual-expected))),coefficients=list(COMPONENTS),
      baselineCostsMs=source['baselineCostsMs'],models=models,
      scope='frozen layouts and resolved terminal outcomes; fixed 1:3:1:1 track weights; S005 reference recomputed at each cost point; no layout reoptimization',
      nominal={model:dict(publishedPolicy=keys[published[i]],publishedScore=float(nominal[i,published[i]]),
        bestPolicy=keys[int(np.argmin(nominal[i]))],bestScore=float(np.min(nominal[i]))) for i,model in enumerate(models)},
      nominalPolishedTop10=[dict(policy=keys[i],score=float(nominal[0,i]),gap=float(nominal[0,i]-nominal[0].min())) for i in np.argsort(nominal[0])[:10]],grids={},complete=False)
    def save():
        args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    for name,(lo,hi,step) in definitions.items():
        points=grid(lo,hi,step);n=len(points)
        top1=xp.zeros(144,dtype=xp.int64);top3=top1.copy();rank_sum=top1.copy();worst=xp.zeros(144,dtype=xp.int16)
        regret_sum=xp.zeros(144);regret_max=xp.zeros(144)
        envelopes=np.empty((n,len(models)));fixed=np.empty_like(envelopes)
        for start in range(0,n,args.chunk):
            v=forward(points[start:start+args.chunk]);r=ranks(v[:,0,:])
            top1+=xp.sum(r==1,axis=0);top3+=xp.sum(r<=3,axis=0);rank_sum+=xp.sum(r,axis=0,dtype=xp.int64)
            worst=xp.maximum(worst,xp.max(r,axis=0));env=xp.min(v,axis=2)
            regret=v[:,0,:]-env[:,0,None];regret_sum+=regret.sum(axis=0);regret_max=xp.maximum(regret_max,regret.max(axis=0))
            count=len(v);envelopes[start:start+count]=host(env)
            fixed[start:start+count]=host(v[:,xp.arange(len(models)),xp.asarray(published)])
            if start%(args.chunk*128)==0:print(name,start,'/',n,flush=True)
        arrays=list(map(host,[top1,top3,rank_sum,worst,regret_sum,regret_max]))
        ranking=[dict(policy=key,top1Rate=float(arrays[0][i]/n),top3Rate=float(arrays[1][i]/n),
          meanRank=float(arrays[2][i]/n),worstRank=int(arrays[3][i]),meanRegret=float(arrays[4][i]/n),worstRegret=float(arrays[5][i])) for i,key in enumerate(keys)]
        ranking.sort(key=lambda x:(x['meanRank'],-x['top3Rate'],-x['top1Rate'],x['policy']))
        winners={x['policy']:x for x in [ranking[0],max(ranking,key=lambda x:x['top1Rate']),min(ranking,key=lambda x:x['meanRegret'])]}
        winners[keys[published[0]]]=next(x for x in ranking if x['policy']==keys[published[0]])
        comparisons={}
        for key in winners:
            candidate=single_policy(a[0,keys.index(key)],ref,points)
            comparisons[key]=dict(vsPublished={model:compare(candidate,fixed[:,i],points) for i,model in enumerate(models) if i},
              vsReoptimized={model:compare(candidate,envelopes[:,i],points) for i,model in enumerate(models) if i},
              vsBestOtherPublished=compare(candidate,np.min(fixed[:,1:],axis=1),points),
              vsBestOtherReoptimized=compare(candidate,np.min(envelopes[:,1:],axis=1),points))
        result['grids'][name]=dict(range=[lo,hi],step=step,points=n,policyRanking=ranking,
          bestMeanRank=ranking[0],bestTop1=max(ranking,key=lambda x:x['top1Rate']),bestMeanRegret=min(ranking,key=lambda x:x['meanRegret']),
          selectedPolicies=comparisons,polishedEnvelopeVsOtherEnvelopes={model:compare(envelopes[:,0],envelopes[:,i],points) for i,model in enumerate(models) if i},
          polishedEnvelopeVsBestOtherEnvelope=compare(envelopes[:,0],np.min(envelopes[:,1:],axis=1),points),
          otherEnvelopeWinnerShares={model:float(np.mean(envelopes[:,i]<=np.min(envelopes[:,1:],axis=1)+TOL)) for i,model in enumerate(models) if i})
        save();print('done',name,ranking[0],flush=True)
    sensitivity=[]
    for axis,component in enumerate(COMPONENTS):
        for factor in [0,.5,1,2,5,10]:
            point=np.ones((1,6));point[0,axis]=factor
            v=scores(a,ref,point)[0];order=np.argsort(v[0]);other=v[1:].min(axis=1)
            sensitivity.append(dict(component=component,multiplier=factor,bestPolicy=keys[int(order[0])],bestScore=float(v[0,order[0]]),
              runnerUpPolicy=keys[int(order[1])],policyGap=float(v[0,order[1]]-v[0,order[0]]),
              nearestOtherModel=models[int(np.argmin(other))+1],schemeGap=float(other.min()-v[0,order[0]])))
    result['oneAtATime']=sensitivity
    result['complete']=True;save()

if __name__=='__main__':main()
