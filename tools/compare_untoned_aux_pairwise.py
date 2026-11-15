"""Pairwise layout comparisons under identical cost vectors; supplement main frozen analysis."""
import json
from pathlib import Path
import numpy as np
from analyze_untoned_aux_comparison import DIRECTORY,ROOT,MODES,CHUNK,read,write,vectors,powers
from analyze_single_ckt_v51_aux_order import grid,competition_ranks

def main():
 z=read(ROOT/'research/notes/2026-11-15-untoned-2126-aux-robust-comparison.json');labels=list(z['results']);g=grid(0.,5.,.5);payload={k:read(DIRECTORY/f'{k}.components.json') for k in labels}
 scores=np.empty((len(g),len(labels)))
 for start in range(0,len(g),CHUNK):
  batch=g[start:start+CHUNK]
  for i,label in enumerate(labels):
   q=np.zeros(len(batch))
   for mode in MODES:
    c=z['results'][label]['cases'][mode];v=vectors(dict(tracks=c['robustTracks']),payload[label]['baselineCostsMs']);ref=vectors(dict(tracks=c['referenceTracks']),payload[label]['baselineCostsMs']);q+=powers(v[None,:,:],ref,batch)[:,0]
   scores[start:start+len(batch),i]=10*(q/12)**.25
 positive=np.all(g>0,axis=1);ranks=competition_ranks(scores)
 out={'pairs':{},'positiveSubset':{label:dict(top1Rate=float(np.mean(ranks[positive,i]==1)),meanRank=float(np.mean(ranks[positive,i]))) for i,label in enumerate(labels)}}
 for a,b in [('C','F'),('A','D'),('A','C'),('A','F')]:
  gaps=scores[:,labels.index(b)]-scores[:,labels.index(a)]
  out['pairs'][a+'-vs-'+b]=dict(firstWinsRate=float(np.mean(gaps>1e-9)),firstWinsPositiveRate=float(np.mean(gaps[positive]>1e-9)),minimumSecondMinusFirst=float(gaps.min()),maximumSecondMinusFirst=float(gaps.max()),meanSecondMinusFirst=float(gaps.mean()))
 # All six cost multipliers equal: 0..500%, step 1%.
 multipliers=np.arange(501)[:,None]*np.ones((1,6))*.01;synchronized=np.zeros((501,len(labels)))
 for i,label in enumerate(labels):
  q=np.zeros(501)
  for mode in MODES:
   c=z['results'][label]['cases'][mode];v=vectors(dict(tracks=c['robustTracks']),payload[label]['baselineCostsMs']);ref=vectors(dict(tracks=c['referenceTracks']),payload[label]['baselineCostsMs']);q+=powers(v[None,:,:],ref,multipliers)[:,0]
  synchronized[:,i]=10*(q/12)**.25
 winners=np.argmin(synchronized,axis=1);segments=[];start=0
 for j in range(1,502):
  if j==501 or winners[j]!=winners[start]:
   segments.append(dict(startPercent=start,endPercent=j-1,winner=labels[int(winners[start])]))
   start=j
 out['synchronizedCostSweep']=dict(rangePercent=[0,500],stepPercent=1,winnerSegments=segments,notContinuousThresholdProof=True)
 write(ROOT/'research/notes/2026-11-15-untoned-2126-aux-robust-pairwise.json',out);print(json.dumps(out))
if __name__=='__main__':main()
