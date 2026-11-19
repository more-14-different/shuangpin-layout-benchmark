"""A proposal ranker only: every accepted research score comes from the exact scorer."""
import hashlib
import json
import sys
from pathlib import Path
import numpy as np

KEYS='BCDEFGHJKLMNPQRSTWXYZ'
PAIRS=np.triu_indices(35,1)

def features(rows):
    keys=np.asarray([[KEYS.index(k) for k in r['keys']] for r in rows],dtype=np.int16)
    onehot=np.eye(21,dtype=np.float32)[keys].reshape(len(rows),-1)
    paired=(keys[:,PAIRS[0]]==keys[:,PAIRS[1]]).astype(np.float32)
    scalars=np.asarray([[r['proxy'],r['miss']] for r in rows],dtype=np.float32)
    return np.concatenate([onehot,paired,scalars],axis=1)

def ridge(x,y,weight,alpha):
    center=np.average(y,axis=0,weights=weight)
    weighted=x*weight[:,None]
    matrix=x.T@weighted
    matrix.flat[::len(matrix)+1]+=alpha
    coefficients=np.linalg.solve(matrix,x.T@((y-center)*weight[:,None]))
    return coefficients,center

def fit(path):
    rows=json.loads(Path(path).read_text(encoding='utf-8'))
    x=features(rows);y=np.asarray([[r['score'],r['doubledScore']] for r in rows])
    # A deterministic holdout diagnoses prediction error; it never certifies a candidate.
    hold=np.asarray([int(hashlib.sha256(r['keys'].encode()).hexdigest()[:8],16)%5==0 for r in rows])
    mean=x.mean(axis=0);scale=np.maximum(x.std(axis=0),.05)
    x=((x-mean)/scale).astype(np.float64)
    delta=np.minimum(np.min(y-y.min(axis=0),axis=1),.6)
    weight=.05+np.exp(-delta/.08)
    coefficients,center=ridge(x[~hold],y[~hold],weight[~hold],4.)
    predicted=x[hold]@coefficients+center;error=np.abs(predicted-y[hold]);low=y[hold,0]<np.quantile(y[:,0],.25)
    metrics=dict(rows=len(rows),holdout=int(hold.sum()),mae=error.mean(axis=0).tolist(),
        lowerQuartileMAE=error[low].mean(axis=0).tolist(),numpy=np.__version__,features=x.shape[1],model='three weighted ridge regressions; no score authority')
    models=[ridge(x,y,.05+np.exp(-delta/band),alpha) for band,alpha in [(.08,4.),(.16,12.),(.32,32.)]]
    return (mean,scale,models),metrics

def main():
    model,metrics=fit(sys.argv[1]);print(json.dumps(dict(ready=True,metrics=metrics)),flush=True)
    for line in sys.stdin:
        job=json.loads(line)
        if job.get('refit'):
            model,metrics=fit(job['refit']);print(json.dumps(dict(refitted=True,metrics=metrics)),flush=True);continue
        mean,scale,models=model
        x=(features(job['rows'])-mean)/scale
        samples=np.asarray([x@coefficients+center for coefficients,center in models])
        print(json.dumps(dict(prediction=samples.mean(axis=0).tolist(),uncertainty=samples.std(axis=0).tolist())),flush=True)

if __name__=='__main__':main()
