import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const compare=require('../tools/compare_um40_ergonomics_collisions');
const {HEADS,FINALS}=require('../tools/ckt_v4_scheme_fixture');
const {toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
const report=JSON.parse(readFileSync('research/notes/2026-11-20-um40-ergonomics-collisions.json'));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('R11矩阵负荷重现冻结的两个基准，不混用主行下限定义',()=>{
 const fixture=JSON.parse(readFileSync('research/.cache/ckt-v4-ergonomics.json'));
 for(const expected of Object.values(fixture.expected)){
  const layout=expected.layout;
  const entry={initialMap:Object.fromEntries(HEADS.map((h,i)=>[h,layout[i]])),finalMap:Object.fromEntries(FINALS.map((f,i)=>[f,layout[27+i]])),tone:layout.slice(62).join('')};
  const result=compare.legacyLoads(entry,fixture,report.contracts.legacyTrackWeights);
  const loads=expected.loads;
  for(const [actual,reference]of [['homeS2','home_s2'],['homeC4','home_c4'],['homeWX','home_wx'],['homeFloorCW','home_floor'],['rightPinkyPeak20','rp_max'],['WPeak20','w_max'],['YPeak20','y_max']])near(result.summary[actual],loads[reference]);
 }
});

test('主码重码参与率与首选损失率分别计算',()=>{
 const rows=[{weight:10,stages:[{codes:['AB']}]},{weight:3,stages:[{codes:['AB']}]},{weight:7,stages:[{codes:['CD']}]}];
 const result=compare.rawCollisions(rows);
 assert.equal(result.uniqueCodes,2);assert.equal(result.collisionBuckets,1);
 near(result.affectedRate,13/20);near(result.firstChoiceLossRate,3/20);
});

test('三字词AAA后进入第四码不计为加辅，最终选重单独计数',()=>{
 const rows=[{id:'a',stages:[{length:3}]},{id:'b',stages:[{length:3}]}];
 const result=compare.terminalStats(rows,[{id:'a',weight:3,code:'ABCD',auxCount:0,rank:1,motorUpperMs:100},{id:'b',weight:1,code:'ABCDE',auxCount:1,rank:2,motorUpperMs:110}]);
 near(result.firstMainLossRate,1);near(result.needsAuxRate,.25);near(result.selectionRate,.25);
 near(Object.values(result.load).reduce((a,b)=>a+b,0),1);
});

test('五方案语料、形调语义、M/D和独立主码重码口径一致',()=>{
 assert.equal(report.results.length,5);
 assert.equal(toneKeysFromShapeKeys(report.contracts.auxiliarySemantics.shapeKeysByMeaning),report.contracts.auxiliarySemantics.toneKeysByTone);
 assert.equal(report.contracts.auxiliarySemantics.toneDigitsByShapeMeaning,'42310');
 for(const row of report.results){
  assert.equal(row.memory.M,40);assert.equal(row.memory.D,3);
  assert.equal(row.pinyinAudit.unique,399);assert.equal(row.pinyinAudit.collisionPairs,0);
  for(const kind of ['character','word2','word3','word4']){
   near(row.collisions[kind].rawFirstChoiceLossRate,report.results[0].collisions[kind].rawFirstChoiceLossRate);
   near(row.collisions[kind].rawAffectedRate,report.results[0].collisions[kind].rawAffectedRate);
   for(const mode of ['keytao','sanpin'])assert.equal(row.native.modes[mode][kind].count,report.results[0].native.modes[mode][kind].count);
  }
 }
});

test('实际终码的负荷与频率归一，峰值是同轨组和而非逐键峰值之和',()=>{
 for(const row of report.results){
  const n=row.native.aggregate,l=row.legacyLoads;
  near(n.leftHand+n.rightHand,1);near(n.bothIndex,n.leftIndex+n.rightIndex);
  for(const mode of Object.values(row.native.modes))for(const track of Object.values(mode)){
   near(Object.values(track.load).reduce((a,b)=>a+b,0),1);
   near(Object.values(track.lengthDistribution).reduce((a,b)=>a+b,0),1);
   near(track.leftHand+track.rightHand,1);
  }
  near(l.summary.leftPinkyPeak20,Math.max(...Object.values(l.tracks).map(t=>t.leftPinky)));
  near(l.summary.bothIndexPeak20,Math.max(...Object.values(l.tracks).map(t=>t.leftIndex+t.rightIndex)));
  near(l.summary.homeWeighted20,Object.entries(report.contracts.legacyTrackWeights).reduce((s,[name,w])=>s+w*l.tracks[name].home,0));
 }
});

test('两点评分精确重现A/C与三个已选候选',()=>{
 const publication=JSON.parse(readFileSync('research/notes/2026-11-18-ckt-v52-all-schemes.json'));
 for(const r of report.results.slice(0,2))near(r.cktV52.score,publication.schemes[r.id].v52.score);
 const prior=JSON.parse(readFileSync('research/notes/2026-11-20-um40-fixed-initial-rhymes.json'));
 for(const r of report.results.slice(2)){
  const expected=[prior.selected,...prior.bestDefault,...prior.bestDoubled].find(e=>e.id===r.id);
  near(r.cktV52.score,expected.score);near(r.cktV52.doubledScore,expected.doubledScore);
 }
});
