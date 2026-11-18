import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {upstreamMotor}=require('../tools/ckt_v4_model');
const {snapshotFingerprint}=require('../tools/ckt_long_continuation');
const {blockErrorMotor}=require('../tools/ckt_block_error');
const {toneKeysFromShapeKeys,shapeKeysFromToneKeys,physicalShape,auxiliarySemantics}=require('../tools/auxiliary_semantics');
function fixtures(keys='ABC') {
  const table=(d,v)=>({shape:Array(d).fill(keys.length),base64:Buffer.from(new Float32Array(keys.length**d).fill(v).buffer).toString('base64')});
  const roles=['L2i1','L3i1','L3i2','L4i1','L4i2','L4i3'];
  const snapshot={keys,commit:'test',errorRecoveryMs:782.2,roles,
    tables:Object.fromEntries(roles.map(r=>[r,table(r==='L2i1'?2:r==='L4i2'?4:3,200)]))};
  const profile={version:'ckt-long-error-profile-v1',keys,errorRecoveryMs:782.2,
    snapshotFingerprint:snapshotFingerprint(snapshot),
    errorTables:Object.fromEntries(roles.map(r=>[r,table(r==='L2i1'?2:r==='L4i2'?4:3,.1)]))};
  return {snapshot,profile,table};
}
test('successes multiply across a four-key prefix and a tail sharing only the anchor key',()=>{
  const {snapshot,profile}=fixtures(),m=blockErrorMotor(snapshot,profile),p=Math.fround(.1);
  assert.ok(Math.abs(m.risk('ABCAB').success-(1-p)**4)<1e-15);
  assert.ok(Math.abs(m.risk('ABCABC').success-(1-p)**5)<1e-15);
  assert.ok(m.risk('ABCAB').errorProbability>=m.risk('ABCA').errorProbability);
  assert.ok(m.risk('ABCABC').errorProbability>=m.risk('ABCA').errorProbability);
});
test('the frozen four-key summed error cost is anchored while only incremental first-error risk is charged',()=>{
  const {snapshot,profile}=fixtures(),m=blockErrorMotor(snapshot,profile),p=Math.fround(.1);
  const v=m('ABCAB'),base=upstreamMotor(snapshot)('ABCAB');
  const anchored=3*p+(1-p)**3*p;
  assert.ok(Math.abs(v.anchoredErrorCostMs-782.2*anchored)<1e-10);
  assert.ok(Math.abs(v.upperMs-(base.upperMs+782.2*(anchored-4*p)))<1e-10);
});
test('literal tail products need not be five-to-six monotone; sequential conditional tails are',()=>{
  const {snapshot,profile,table}=fixtures();
  profile.errorTables.L2i1=table(2,.2);profile.errorTables.L3i1=table(3,.01);profile.errorTables.L3i2=table(3,.01);
  const block=blockErrorMotor(snapshot,profile),seq=blockErrorMotor(snapshot,profile,{tailMode:'sequential'});
  assert.ok(block.risk('ABCABC').errorProbability<block.risk('ABCAB').errorProbability);
  assert.ok(block.risk('ABCABC').errorProbability>=block.risk('ABCA').errorProbability);
  assert.ok(seq.risk('ABCABC').errorProbability>=seq.risk('ABCAB').errorProbability);
});
test('two/three/four-key scoring metadata is unchanged and semantic shape/tone round trips retain suffix keys',()=>{
  const {snapshot,profile}=fixtures('ABCEUIOV'),base=upstreamMotor(snapshot),m=blockErrorMotor(snapshot,profile);
  for(const code of ['AB','ABC','ABCA'])assert.deepEqual(m(code),base(code));
  for(const shapeKeysByMeaning of ['AEUIO','AVUIO']) {
    const toneKeysByTone=toneKeysFromShapeKeys(shapeKeysByMeaning);
    assert.equal(shapeKeysFromToneKeys(toneKeysByTone),shapeKeysByMeaning);
    assert.equal(auxiliarySemantics(toneKeysByTone).toneDigitsByShapeMeaning,'42310');
    const suffix=physicalShape('AE',toneKeysByTone),code='BCBC'+suffix;
    assert.equal(suffix,shapeKeysByMeaning.slice(0,2));
    assert.ok(m.risk(code).errorProbability>=m.risk(code.slice(0,4)).errorProbability);
  }
});
test('missing error roles, invalid modes, altered snapshots and unsupported risk inputs fail explicitly',()=>{
  const {snapshot,profile}=fixtures();
  assert.throws(()=>blockErrorMotor(snapshot,profile,{tailMode:'other'}),/tailMode/);
  assert.throws(()=>blockErrorMotor({...snapshot,commit:'other'},profile),/match/);
  const missing=structuredClone(profile);delete missing.errorTables.L3i1;
  assert.throws(()=>blockErrorMotor(snapshot,missing),/missing/);
  const m=blockErrorMotor(snapshot,profile);
  assert.throws(()=>m.risk('ABCD'),/physical/);
  assert.throws(()=>m.risk('A'),/two to six/);
});

test('positive global increment bounds cover every synthetic five/six-key code without a cost guard',()=>{
  const {snapshot,profile}=fixtures(),m=blockErrorMotor(snapshot,profile),bounds=m.costBounds();
  assert.equal(bounds.contextsChecked,81);assert.equal(bounds.tailContextsChecked,27);
  assert.equal(bounds.certifiesNondecreasingCost,true);
  for(const length of [5,6])for(let n=0;n<3**length;n++) {
    let v=n,code='';for(let i=0;i<length;i++){code+='ABC'[v%3];v=Math.floor(v/3)}
    const minimum=length===5?bounds.fourToFiveCostLowerBoundMs:bounds.fiveToSixCostLowerBoundMs;
    assert.ok(m(code).upperMs-m(code.slice(0,-1)).upperMs>=minimum-1e-10);
  }
});
