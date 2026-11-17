import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url);
const toned=require('../tools/score_toned_2121_ckt_v51');
const prefix='research/notes/2026-11-17-cr-lan-fixed';
test('native 2121 word3 rows are invariant under arbitrary rhyme changes with fixed onset and auxiliary policy',()=>{
  const bundle={tokenKeys:['jian4','dao1','lan2']};
  const data={pinyin:['jian','dao','lan'],shapes:{snowshape:{甲:'A',乙:'E',丙:'U'}}};
  const words={word3:[{text:'甲乙丙',py:[0,1,2],tones:[4,1,2],weight:5}]};
  const a={tonedCodes:['JQ','DZ','EN']},b={tonedCodes:['JP','DX','EG']};
  assert.equal(toned.buildWordRows(a,bundle,data,words,'IVUAO','word3','231').length,1);
  assert.deepEqual(toned.buildWordRows(a,bundle,data,words,'IVUAO','word3','231'),
    toned.buildWordRows(b,bundle,data,words,'IVUAO','word3','231'));
  b.tonedCodes[0]='KQ';
  assert.notDeepEqual(toned.buildWordRows(a,bundle,data,words,'IVUAO','word3','231'),
    toned.buildWordRows(b,bundle,data,words,'IVUAO','word3','231'));
});
test('all independently verified fixed-Lan representatives retain fixed onsets, derived M and word3 invariant',
  {skip:!existsSync(prefix+'-native.json')},()=>{
    const b=JSON.parse(readFileSync(prefix+'-finalists.json','utf8')),n=JSON.parse(readFileSync(prefix+'-native.json','utf8'));
    assert.equal(b.contract.maxD,2);assert.equal(b.rootInternalSplits,0);
    assert.equal(n.shapeKeysByMeaning,'AVUIO');assert.equal(n.toneKeysByTone,'IVUAO');
    for(const layout of b.layouts){
      assert.deepEqual(layout.state.firstKeys,b.contract.fixedFirstKeys);
      const actual=n.results.find(r=>r.id===layout.id);
      assert.deepEqual([actual.memory.D,actual.memory.lower,actual.memory.guard],[2,layout.metrics.m,layout.metrics.guard]);
      assert.ok(Math.abs(actual.fixed.ergonomics.tracks.word3.leftPinkyQAZ-.09060178865841471)<1e-12);
      assert.ok(Math.abs(actual.fixed.score-layout.rustScore)<1e-9);
    }
  });
test('auxiliary-order replay winners preserve the original two pinky guards and full independent CKT',
  {skip:!existsSync(prefix+'-policy-verification.json')},()=>{
    const b=JSON.parse(readFileSync(prefix+'-policy-finalists.json','utf8'));
    const n=JSON.parse(readFileSync(prefix+'-policy-native.json','utf8'));
    const audit=JSON.parse(readFileSync(prefix+'-word3-invariance.json','utf8'));
    assert.equal(audit.word3OrderAudit.length,6);
    assert.ok(audit.minimumWord3LeftAcrossSixOrders<audit.strictLeftCeiling);
    assert.equal(audit.comparison2126.productionSourceHashMatches,true);
    assert.deepEqual(b.constrainedWord3Dominance.dominantOrders,['213']);
    const best=audit.word3OrderAudit.find(r=>r.order==='213');
    for(const order of ['123','132']){
      const other=audit.word3OrderAudit.find(r=>r.order===order);
      for(const field of b.constrainedWord3Dominance.componentFields)assert.ok(best.metric[field]<=other.metric[field]+1e-12);
    }
    for(const layout of b.layouts){
      assert.deepEqual(layout.state.firstKeys,b.contract.fixedFirstKeys);
      assert.deepEqual([layout.wordAuxiliaryPolicy.word2,layout.wordAuxiliaryPolicy.word4],['21','14']);
      assert.ok(['123','132','213'].includes(layout.wordAuxiliaryPolicy.word3));
      const actual=n.results.find(r=>r.id===layout.id),e=actual.fixed.ergonomics;
      assert.ok(Math.abs(actual.fixed.score-layout.rustScore)<1e-9);
      assert.ok(e.leftPinkyQAZPeak4NativeTracks.value<=b.profiles.speed.pinkyCeiling+1e-12);
      assert.ok(e.rightPinkyPeak4NativeTracks.value<=b.profiles.speed.rightPinkyCeiling+1e-12);
      assert.deepEqual([actual.memory.lower,actual.memory.guard],[layout.metrics.m,layout.metrics.guard]);
    }
  });
