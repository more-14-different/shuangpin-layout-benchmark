"""Cost recombination of frozen full-corpus outcomes; does not re-resolve candidates."""
import numpy as np
from analyze_single_ckt_v51_aux_order import vectors, WEIGHTS, COMPONENTS

TOL = 1e-9

def prepare(source):
    if not source['complete']:
        raise ValueError('incomplete policy input')
    keys = [e['policyKey'] for e in source['models'][0]['evaluations']]
    if len(keys) != 144 or len(set(keys)) != 144:
        raise ValueError('requires all 144 distinct policies')
    arrays, published = [], []
    costs = source['baselineCostsMs']
    ref = vectors({'tracks':source['reference']},costs)
    for model in source['models']:
        by = {e['policyKey']:e for e in model['evaluations']}
        if len(model['evaluations']) != 144 or set(by) != set(keys):
            raise ValueError('model policy coverage mismatch')
        a = np.array([vectors(by[k],costs) for k in keys])
        nominal = scores(a[None,:,:,:],ref,np.ones((1,6)))[0,0]
        expected = np.array([by[k]['score'] for k in keys])
        np.testing.assert_allclose(nominal,expected,rtol=0,atol=1e-10)
        key = '/'.join(model['publishedPolicy'][kind] for kind in ('word2','word3','word4'))
        idx = keys.index(key)
        if abs(nominal[idx]-model['publishedScore']) > 1e-10:
            raise ValueError('published score/structure mismatch: '+model['key'])
        arrays.append(a);published.append(idx)
    return keys,np.array(arrays),ref,published

def scores(array,reference,points):
    effective = array[:,:,:,0][None,:,:,:] + np.tensordot(points,array[:,:,:,1:],axes=(1,3))
    denominator = reference[:,0][None,:] + points @ reference[:,1:].T
    return 10*(np.sum(WEIGHTS[None,None,None,:]*(effective/denominator[:,None,None,:])**4,axis=3)/WEIGHTS.sum())**.25

def compare(candidate,competitor,points):
    """Positive gap means candidate wins; quantiles have no probabilistic user interpretation."""
    gap=np.asarray(competitor)-np.asarray(candidate)
    low,high=int(np.argmin(gap)),int(np.argmax(gap))
    qs=[0,.01,.05,.25,.5,.75,.95,.99,1];rq=[0,.05,.5,.95,1]
    return dict(winRate=float(np.mean(gap>TOL)),tieRate=float(np.mean(np.abs(gap)<=TOL)),
      lossRate=float(np.mean(gap < -TOL)),meanGap=float(gap.mean()),
      gapQuantiles={str(q):float(v) for q,v in zip(qs,np.quantile(gap,qs))},
      relativeGapPctQuantiles={str(q):float(v) for q,v in zip(rq,np.quantile(100*gap/competitor,rq))},
      worst=dict(gap=float(gap[low]),multipliers=points[low].tolist(),candidate=float(candidate[low]),competitor=float(competitor[low])),
      best=dict(gap=float(gap[high]),multipliers=points[high].tolist(),candidate=float(candidate[high]),competitor=float(competitor[high])))

def single_policy(vector,reference,points,chunk=4096):
    result=np.empty(len(points))
    for i in range(0,len(points),chunk):
        p=points[i:i+chunk]
        effective=vector[:,0][None,:]+p@vector[:,1:].T
        denominator=reference[:,0][None,:]+p@reference[:,1:].T
        result[i:i+len(p)]=10*(np.sum(WEIGHTS*(effective/denominator)**4,axis=1)/WEIGHTS.sum())**.25
    return result
