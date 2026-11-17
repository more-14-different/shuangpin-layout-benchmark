"""Verify input completeness, nominal recombination and all reported gap witnesses on CPU."""
import hashlib
import json
from pathlib import Path
import numpy as np
from full26_robust_metrics import prepare,scores

source_path=Path('research/notes/2026-11-17-toned-2126-robustness-input.json')
report_path=Path('research/notes/2026-11-17-toned-2126-robustness.json')
s=json.loads(source_path.read_text(encoding='utf8'));r=json.loads(report_path.read_text(encoding='utf8'))
assert s['complete'] and r['complete']
assert r['inputSha256']==hashlib.sha256(source_path.read_bytes()).hexdigest()
for file,h in r['analysisCodeSha256'].items():assert hashlib.sha256(Path(file).read_bytes()).hexdigest()==h,file
for file,h in s.get('additionalSourceSha256',{}).items():assert hashlib.sha256(Path(file).read_bytes()).hexdigest()==h,file
keys,a,ref,pub=prepare(s);models=[m['key'] for m in s['models']]
checked=0
def verify_gap(record,policy,competitor,optimized,champ_envelope=False):
    global checked
    assert abs(record['winRate']+record['tieRate']+record['lossRate']-1)<1e-12
    qs=list(record['gapQuantiles'].values());assert all(x<=y+1e-12 for x,y in zip(qs,qs[1:]))
    for name in ['worst','best']:
        w=record[name];v=scores(a,ref,np.array([w['multipliers']]))[0]
        candidate=float(v[0].min() if champ_envelope else v[0,keys.index(policy)])
        if competitor is None:
            other=float(min(v[i].min() if optimized else v[i,pub[i]] for i in range(1,len(models))))
        else:
            i=models.index(competitor);other=float(v[i].min() if optimized else v[i,pub[i]])
        for actual,expected in [(candidate,w['candidate']),(other,w['competitor']),(other-candidate,w['gap'])]:
            assert abs(actual-expected)<1e-10,(actual,expected)
        assert abs(w['gap']-record['gapQuantiles']['0' if name=='worst' else '1'])<1e-10
        checked+=1
for name,g in r['grids'].items():
    count=round((g['range'][1]-g['range'][0])/g['step'])+1
    assert g['points']==count**6
    assert len(g['policyRanking'])==144
    for p in g['policyRanking']:
        assert 0<=p['top1Rate']<=p['top3Rate']<=1
        assert 1<=p['meanRank']<=p['worstRank']<=144
        assert 0<=p['meanRegret']<=p['worstRegret']+1e-12
    for policy,comparisons in g['selectedPolicies'].items():
        for optimized,field in [(False,'vsPublished'),(True,'vsReoptimized')]:
            for model,record in comparisons[field].items():verify_gap(record,policy,model,optimized)
        verify_gap(comparisons['vsBestOtherPublished'],policy,None,False)
        verify_gap(comparisons['vsBestOtherReoptimized'],policy,None,True)
    for model,record in g['polishedEnvelopeVsOtherEnvelopes'].items():verify_gap(record,None,model,True,True)
    verify_gap(g['polishedEnvelopeVsBestOtherEnvelope'],None,None,True,True)
print(json.dumps(dict(passed=True,models=len(models),fullCorpusPolicyScores=len(models)*144,
    grids=len(r['grids']),gridPoints=sum(g['points'] for g in r['grids'].values()),cpuGapWitnesses=checked,
    gpuCpuMaxDifference=r['parityMaxDifference'])))
