"""Exact 0..500% six-cost policy ranking and cross-layout comparison."""
import hashlib,json,os,time
from pathlib import Path
import numpy as np
try:
 from .analyze_single_ckt_v51_aux_order import component_vector,competition_ranks,grid
except ImportError:
 from analyze_single_ckt_v51_aux_order import component_vector,competition_ranks,grid
ROOT=Path(__file__).resolve().parents[1]
DIRECTORY=ROOT/'research/.cache/untoned-2126-aux-robust-20261115'
MODES=('keytao','sanpin');TRACKS=('character','word2','word3','word4');WEIGHTS=np.array([1.,3.,1.,1.]);CHUNK=2048

def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def write(p,z):Path(p).write_text(json.dumps(z,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def vectors(row,costs):return np.array([component_vector(row['tracks'][t],costs) for t in TRACKS])
def powers(v,ref,batch):
 effective=v[:,:,0][None,:,:]+np.einsum('ba,pta->bpt',batch,v[:,:,1:],optimize=False)
 reference=ref[:,0][None,:]+batch@ref[:,1:].T
 return np.sum(WEIGHTS[None,None,:]*(effective/reference[:,None,:])**4,axis=2)
def summaries(counts,keys,n):
 top1,top3,rank_sum,worst=counts
 rows=[dict(policy=key,top1Rate=int(top1[i])/n,top3Rate=int(top3[i])/n,meanRank=int(rank_sum[i])/n,worstRank=int(worst[i])) for i,key in enumerate(keys)]
 return sorted(rows,key=lambda r:(r['meanRank'],-r['top3Rate'],-r['top1Rate'],r['worstRank'],r['policy']))
def mode_analysis(label,payload,mode,g):
 case=payload['cases'][mode]; keys=[r['policyKey'] for r in case['results']]; assert len(keys)==len(set(keys))==144
 v=np.array([vectors(r,payload['baselineCostsMs']) for r in case['results']]);ref=vectors(payload['references'][mode],payload['baselineCostsMs'])
 base=powers(v,ref,np.ones((1,6)))[0];base_scores=10*(base/6)**.25
 for i,r in enumerate(case['results']):
  for t,row in r['tracks'].items(): assert abs(sum(component_vector(row,payload['baselineCostsMs']))-row['effectiveMs'])<1e-8
 counts=[np.zeros(144,dtype=np.int64) for _ in range(4)];positive=[np.zeros(144,dtype=np.int64) for _ in range(4)];oracle=np.empty(len(g));npositive=0
 for start in range(0,len(g),CHUNK):
  batch=g[start:start+CHUNK];q=powers(v,ref,batch); ranks=competition_ranks(q);oracle[start:start+len(batch)]=q.min(axis=1)
  for destination,r in [(counts,ranks),(positive,ranks[np.all(batch>0,axis=1)])]:
   if len(r):
    destination[0]+=np.sum(r==1,axis=0);destination[1]+=np.sum(r<=3,axis=0);destination[2]+=np.sum(r,axis=0);destination[3]=np.maximum(destination[3],np.max(r,axis=0))
  npositive+=int(np.sum(np.all(batch>0,axis=1)))
  if start and start//CHUNK%160==0: print(json.dumps(dict(label=label,mode=mode,gridVerified=start+len(batch),total=len(g))),flush=True)
 ranking=summaries(counts,keys,len(g));ranking_positive=summaries(positive,keys,npositive); winner=ranking[0];runner=ranking[1];wi=keys.index(winner['policy']);ri=keys.index(runner['policy']); gaps=np.empty(len(g))
 for start in range(0,len(g),CHUNK):
  batch=g[start:start+CHUNK];q=powers(v[[wi,ri]],ref,batch); scores=10*(q/6)**.25;gaps[start:start+len(batch)]=scores[:,1]-scores[:,0]
 np.save(DIRECTORY/f'{label}.{mode}.oracle.npy',oracle)
 default_order=np.argsort(base_scores,kind='stable');robust_tracks=case['results'][wi]['tracks'];optimal_tracks=case['results'][int(default_order[0])]['tracks']
 out=dict(gridPoints=len(g),positiveGridPoints=npositive,ranking=ranking,positiveRanking=ranking_positive,winner=winner,runnerUp=runner,meanRankMargin=runner['meanRank']-winner['meanRank'],baselineRanking=[dict(policy=keys[int(i)],score=float(base_scores[i])) for i in default_order],robustBaselineScore=float(base_scores[wi]),runnerUpBaselineScore=float(base_scores[ri]),robustToRunnerBaselineGap=float(base_scores[ri]-base_scores[wi]),defaultBestGap=float(base_scores[default_order[1]]-base_scores[default_order[0]]),headToHead=dict(winnerRate=float(np.mean(gaps>1e-9)),tieRate=float(np.mean(abs(gaps)<=1e-9)),minimumGap=float(gaps.min()),medianGap=float(np.median(gaps)),meanGap=float(gaps.mean())),robustTracks=robust_tracks,defaultOptimalTracks=optimal_tracks,referenceTracks=payload['references'][mode]['tracks'])
 print(json.dumps(dict(completed=label,mode=mode,robust=winner['policy'],meanRank=winner['meanRank'],runner=runner['policy'],meanRankMargin=out['meanRankMargin'])),flush=True)
 return out

def pair_default(cases,which):
 return float(((cases['keytao'][which]**4+cases['sanpin'][which]**4)/2)**.25)
def main():
 contract=read(DIRECTORY/'contract.json')
 for file,digest in contract['sourceHashes'].items():assert sha(file)==digest,file
 g=grid(0.,5.,.5);assert len(g)==1771561
 results={}
 for label,id in contract['ids'].items():
  f=DIRECTORY/f'{label}.components.json'
  while not f.exists():time.sleep(5)
  payload=read(f);assert payload['id']==id and all(payload['cases'][m]['resultCount']==144 for m in MODES)
  cache=DIRECTORY/f'{label}.analysis.json';binding=dict(componentsSha256=sha(f),analyzerSha256=sha(__file__),helperSha256=sha(ROOT/'tools/analyze_single_ckt_v51_aux_order.py'))
  if cache.exists():
   z=read(cache);assert z['binding']==binding
  else:
   cases={m:mode_analysis(label,payload,m,g) for m in MODES}
   z=dict(id=id,label=label,binding=binding,cases=cases,robustPairScore=pair_default(cases,'robustBaselineScore'),defaultOptimalPairScore=float(((cases['keytao']['baselineRanking'][0]['score']**4+cases['sanpin']['baselineRanking'][0]['score']**4)/2)**.25))
   competitors=[]
   for mode in MODES:
    other=MODES[1-MODES.index(mode)]
    score=float(((cases[mode]['baselineRanking'][1]['score']**4+cases[other]['baselineRanking'][0]['score']**4)/2)**.25)
    competitors.append(dict(changedMode=mode,policy=cases[mode]['baselineRanking'][1]['policy'],score=score))
   z['defaultOptimalPairRunnerUp']=min(competitors,key=lambda r:r['score'])
   z['defaultOptimalPairGap']=z['defaultOptimalPairRunnerUp']['score']-z['defaultOptimalPairScore']
   write(cache,z)
  results[label]=z
 # Same cost vector and same S005 reference for every layout and both modes.
 payloads={label:read(DIRECTORY/f'{label}.components.json') for label in results}
 baseline_reference=payloads['P']['references']
 for label in results:assert payloads[label]['references']==baseline_reference
 labels=list(results);oracles={label:[np.load(DIRECTORY/f'{label}.{mode}.oracle.npy',mmap_mode='r') for mode in MODES] for label in labels}
 cross=np.zeros((len(g),len(labels)));oracle_cross=np.zeros_like(cross)
 for start in range(0,len(g),CHUNK):
  batch=g[start:start+CHUNK]
  for i,label in enumerate(labels):
   q=np.zeros(len(batch))
   for mode in MODES:
    case=results[label]['cases'][mode];v=vectors(dict(tracks=case['robustTracks']),payloads[label]['baselineCostsMs']);ref=vectors(dict(tracks=case['referenceTracks']),payloads[label]['baselineCostsMs']);q+=powers(v[None,:,:],ref,batch)[:,0]
   cross[start:start+len(batch),i]=10*(q/12)**.25
   oracle_cross[start:start+len(batch),i]=10*((oracles[label][0][start:start+len(batch)]+oracles[label][1][start:start+len(batch)])/12)**.25
 cross_results={}
 for name,scores in [('fixedRobustPolicies',cross),('pointwisePolicyOracle',oracle_cross)]:
  ranks=competition_ranks(scores);cross_results[name]=[]
  for i,label in enumerate(labels):cross_results[name].append(dict(label=label,top1Rate=float(np.mean(ranks[:,i]==1)),meanRank=float(np.mean(ranks[:,i])),worstRank=int(ranks[:,i].max()),versusAWinRate=float(np.mean(scores[:,i]<scores[:,labels.index('A')]-1e-9)),meanGapToA=float(np.mean(scores[:,i]-scores[:,labels.index('A')]))))
 output=dict(version=1,contract=contract,grid=dict(rangePercent=[0,500],stepPercent=50,coefficients=['firstAuxMs','secondAuxMs','thirdAuxMs','selectionDecisionMs','scanPerCandidateMs','pageActionMs'],points=1771561,positiveSubsetPoints=1000000),results=results,crossLayout=cross_results,defaultRobustRanking=sorted([dict(label=k,score=v['robustPairScore']) for k,v in results.items()],key=lambda r:r['score']),defaultOptimalRanking=sorted([dict(label=k,score=v['defaultOptimalPairScore']) for k,v in results.items()],key=lambda r:r['score']),scope='Finite exact policy/grid enumeration, equal grid weighting is not a measured probability distribution of user behavior. Cross-layout top1 is speed-only, not a combined ergonomic recommendation.')
 output_file=ROOT/'research/notes/2026-11-15-untoned-2126-aux-robust-comparison.json';write(output_file,output)
 print(json.dumps(dict(completed=True,defaultRobustRanking=output['defaultRobustRanking'],defaultOptimalRanking=output['defaultOptimalRanking'])),flush=True)
if __name__=='__main__':main()
