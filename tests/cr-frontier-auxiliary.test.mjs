import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {pairs,permutations,effective,sensitivityScore,chooseRobust}=require('../tools/optimize_cr_frontier_auxiliary');
test('word auxiliary search covers exactly 144 distinct legal position policies',()=>{
  const policies=pairs(2).flatMap(a=>permutations(['1','2','3']).flatMap(b=>pairs(4).map(c=>[a,b,c].join('/'))));
  assert.equal(policies.length,144);assert.equal(new Set(policies).size,144);
  assert.ok(policies.includes('12/213/24'));
  for(const policy of policies)for(const part of policy.split('/'))assert.equal(new Set(part).size,part.length);
});
test('cognitive sensitivity retains all three shape stages, scan and page costs',()=>{
  const m={motorUpperMs:100,firstAuxRate:.2,secondAuxRate:.1,thirdAuxRate:.05,
    selectionRate:.01,meanRejectedCandidates:.02,meanPageActions:.001};
  assert.equal(effective(m,300,600),212.3);
  assert.ok(Math.abs(effective(m,400,900)-effective(m,300,600)-38)<1e-10);
  const tracks=Object.fromEntries(['character','word2','word3','word4'].map(k=>[k,m]));
  assert.equal(sensitivityScore(tracks,tracks,300,600),10);
});
test('minimax regret can prefer a stable policy over a one-case champion',()=>{
  const rows=[{score:9,caseScores:[9,12]},{score:10,caseScores:[10,10]}];
  const ranked=chooseRobust(rows,[{},{}]);
  assert.equal(ranked[0].score,10);assert.ok(ranked[0].worstRegret<ranked[1].worstRegret);
});
test('exported follow-up layouts reproduce the independently derived M-T1 ledger',
  {skip:!existsSync('research/notes/2026-11-16-cr-frontier-followup-finalists.json')},()=>{
    const bundle=require('../research/notes/2026-11-16-cr-frontier-followup-finalists.json');
    const pinyin=[...new Set(bundle.tokenKeys.map(token=>token.replace(/[1-5]$/,'')))];
    const decomposition=require('../research/config/ckt-v51-toned-2121-seeds.json').decomposition;
    const {tonedMemoryAudit}=require('../tools/toned_memory_audit');
    const {toneKeysFromShapeKeys,shapeKeysFromToneKeys}=require('../tools/auxiliary_semantics');
    assert.equal(toneKeysFromShapeKeys(shapeKeysFromToneKeys('IVUAO')),'IVUAO');
    for(const layout of bundle.layouts){
      const byToken=new Map(bundle.tokenKeys.map((t,i)=>[t,layout.tonedCodes[i]]));
      const native={publication:{rhymeGroups:layout.rhymeGroups},tonedCodes:pinyin.map(py=>
        [1,2,3,4,5].map(t=>byToken.get(py+t)||null))};
      const m=tonedMemoryAudit(native,pinyin,decomposition);
      assert.deepEqual([m.lower,m.guard],[layout.memoryAudit.memoryLower,layout.memoryAudit.memoryGuard]);
      assert.equal(m.F,0);assert.ok(m.D<=2&&m.lower<=22&&m.guard<=24);
    }
  });
test('recorded auxiliary enumeration uses equal cohorts, correct normalization and a true per-layout minimum',
  {skip:!existsSync('research/notes/2026-11-16-cr-frontier-followup-auxiliary.json')},()=>{
    const report=require('../research/notes/2026-11-16-cr-frontier-followup-auxiliary.json');
    assert.equal(report.cases.length,9);
    for(const row of report.results){
      assert.equal(row.policies.length,144);assert.equal(row.cohortEqualityVerified,true);
      const eligible=row.policies.filter(p=>p.pinky<=row.pinkyCeiling+1e-12);
      assert.equal(eligible.length,row.eligiblePolicyCount);
      assert.equal(row.bestStandard.score,Math.min(...eligible.map(p=>p.score)));
      const preserving=row.policies.filter(p=>p.pinky<=row.baseline.pinky+1e-12);
      assert.equal(row.bestPinkyPreserving.score,Math.min(...preserving.map(p=>p.score)));
      const robust=chooseRobust(eligible,report.cases)[0];
      assert.deepEqual(row.bestRobust.policy,robust.policy);
      for(const p of row.policies)for(const kind of ['character','word2','word3','word4']){
        assert.equal(p.tracks[kind].count,row.baseline.tracks[kind].count);
        assert.equal(p.tracks[kind].totalWeight,row.baseline.tracks[kind].totalWeight);
      }
    }
  });
