import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
const {mergeTrack}=require('../tools/enumerate_um40_v52_policies_fast');
const {scoreModes}=require('../tools/score_ckt_v52');
const {IDS}=require('../tools/um40_r11');
const tail=require('../tools/um40_policy_tail'),model=require('../tools/ckt_v4_model');
const file='research/notes/2026-11-21-um40-v52-policies.json';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} vs ${b}`);

test('prefix/tail merge preserves total frequency, counts and six cognitive components',()=>{
  const summary=(weight,motor)=>({count:weight,totalWeight:weight,motorUpperMs:motor,firstAuxRate:.2,
    secondAuxRate:.1,thirdAuxRate:0,selectionRate:.1,meanRejectedCandidates:.2,meanPageActions:0,meanKeys:4.3});
  const m=mergeTrack(summary(1,100),summary(3,200));
  assert.equal(m.count,4);assert.equal(m.totalWeight,4);near(m.motorUpperMs,175);
  near(m.effectiveMs,175+300*.2+300*.1+600*.1+50*.2);
});

test('numeric bucket length balancing matches native pages, ties and 120-row chunks',()=>{
  for(const n of [1,2,5,6,7,50,119,120,121,200,355]){
    const rows=Array.from({length:n},(_,i)=>({id:i,text:'字'.repeat(2+(i*17+i%5)%3)}));
    const groups=rows.map(r=>r.text.length-2);
    assert.deepEqual(tail.balanced(rows.map(r=>r.id),groups),model.lengthBalanceRows(rows,{pageSize:6,maximumCandidates:120}).map(r=>r.id));
  }
});

test('numeric bucket residual routes reproduce full JS ranks and v5.2 costs',()=>{
  const kinds=['word2','word3','word4'],tails={};
  const motor=code=>({upperMs:[...code].reduce((s,c)=>s+c.charCodeAt(0),0)});
  for(let k=0;k<3;k++)tails[kinds[k]]=new Map(['12','21'].map((order,o)=>[order,Array.from({length:143},(_,i)=>{
    const c5='AAAA'+String.fromCharCode(65+(i+o*k)%3),c6=c5+String.fromCharCode(65+(i*3+o)%5);
    return {id:kinds[k]+':'+i,text:'字'.repeat(k+2),kind:kinds[k],weight:100-i%40,baseLength:4,
      stages:[{order:5,length:5,pool:'word:five',codes:[c5]},{order:6,length:6,pool:'word:six',codes:[c6]}]};
  })]));
  const resolve=tail.prepare(tails,{next:motor});
  for(const word2 of ['12','21'])for(const word3 of ['12','21'])for(const word4 of ['12','21']){
    const policy={word2,word3,word4},actual=resolve(policy);
    const rows=kinds.flatMap(kind=>tails[kind].get(policy[kind]));
    const outcomes=model.resolveCompetition(rows,{motorCost:motor,lengthBalance:{minimumInputLength:4,pageSize:6,maximumCandidates:120}});
    for(const kind of kinds){
      const selected=outcomes.filter(r=>r.kind===kind),weight=selected.reduce((s,r)=>s+r.weight,0);
      const mean=f=>selected.reduce((s,r)=>s+r.weight*f(r),0)/weight;
      near(actual[kind].motorUpperMs,mean(r=>r.motorUpperMs));near(actual[kind].meanKeys,mean(r=>r.codeLength));
      near(actual[kind].firstAuxRate,1);near(actual[kind].secondAuxRate,mean(r=>r.codeLength===6));
      near(actual[kind].selectionRate,mean(r=>r.rank>1));near(actual[kind].meanRejectedCandidates,mean(r=>r.rank-1));
      near(actual[kind].meanPageActions,mean(r=>Math.floor((r.rank-1)/6)));
    }
  }
});

test('all three layouts enumerate 144 policies per mode and reproduce published v5.2',()=>{
  const p=read(file),published=read('research/notes/2026-11-20-um40-r11-publication.json').scores;
  assert.deepEqual(Object.keys(p.schemes).sort(),IDS.slice().sort());
  for(const id of IDS){
    const layout=p.schemes[id],sem=auxiliarySemantics(layout.semantics.toneKeysByTone);
    assert.deepEqual(sem,layout.semantics);
    assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),sem.toneKeysByTone);
    assert.equal(sem.toneDigitsByShapeMeaning,'42310');
    for(const [mode,doc] of Object.entries(layout.cases)){
      assert.equal(doc.results.length,144);assert.equal(new Set(doc.results.map(r=>r.policyKey)).size,144);
      assert.ok(doc.factorizationVerified.fullChecks>=3);assert.equal(doc.publishedPolicyReplayVerified,true);
      const key=Object.values(layout.publishedPolicies[mode]).join('/');
      const current=doc.results.find(r=>r.policyKey===key);
      for(const kind of ['character','word2','word3','word4'])near(current.tracks[kind].effectiveMs,published[id].v52.modes[mode][kind].effectiveMs);
      for(const r of doc.results)near(r.score,scoreModes({[mode]:r.tracks},p.references));
    }
  }
});

test('complete grid rankings, current-policy positions and runner-up gaps are consistent',()=>{
  const p=read(file),a=read('research/notes/2026-11-21-um40-v52-policy-robustness.json');
  assert.equal(a.enumerationSha256,createHash('sha256').update(readFileSync(file)).digest('hex'));
  for(const id of IDS)for(const mode of ['keytao','sanpin'])for(const grid of ['main','extreme']){
    const doc=a.schemes[id].cases[mode][grid];
    for(const part of ['all','positive']){
      const v=doc[part];assert.equal(v.points,part==='all'?11**6:10**6);
      assert.equal(v.ranking.length,144);
      assert.deepEqual(v.winner,v.ranking[0]);assert.deepEqual(v.runnerUp,v.ranking[1]);
      const expectedWinner=mode==='keytao'?'12/21/14':'12/21/13';
      assert.equal(v.winner.policy,expectedWinner);
      const minimaxException=id==='UM40-8acdbdac3fad'&&mode==='sanpin'&&grid==='extreme'&&part==='positive';
      assert.equal(v.minimaxWinner.policy,minimaxException?'21/21/13':expectedWinner);
      near(v.meanRankGap,v.runnerUp.meanRank-v.winner.meanRank);
      assert.ok(v.meanRankGap>=0);
      const current=v.ranking[v.currentPositionByMeanRank-1];assert.deepEqual(v.current,current);
      assert.equal(current.policy,Object.values(p.schemes[id].publishedPolicies[mode]).join('/'));
      for(const r of v.ranking){assert.ok(r.meanRank>=1&&r.meanRank<=144);assert.ok(r.top1Rate>=0&&r.top1Rate<=1);assert.ok(r.top3Rate>=r.top1Rate);}
      const g=v.winnerRunnerGap;near(g.winnerBeatsRunnerRate+g.tieRate+g.runnerBeatsWinnerRate,1);
      assert.ok(g.minGap<=g.medianGap&&g.medianGap<=g.maxGap);
    }
  }
});
