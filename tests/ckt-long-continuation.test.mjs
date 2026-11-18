import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {upstreamMotor} = require('../tools/ckt_v4_model');
const {positionAwareMotor,snapshotFingerprint} = require('../tools/ckt_long_continuation');
const {physicalShape,toneKeysFromShapeKeys,shapeKeysFromToneKeys,auxiliarySemantics} = require('../tools/auxiliary_semantics');
const {captureReference}=require('../tools/audit_ckt_long_continuation');

function fixtures(keys='ABC') {
  const size=keys.length;
  const table=(dimensions,value,exceptions={})=>{
    const a=new Float32Array(size**dimensions).fill(value);
    for(const [code,v] of Object.entries(exceptions)) {
      let at=0;for(const k of code)at=at*size+keys.indexOf(k);a[at]=v;
    }
    return {shape:Array(dimensions).fill(size),base64:Buffer.from(a.buffer).toString('base64')};
  };
  const snapshot={keys,commit:'test',errorRecoveryMs:782.2,
    roles:['L2i1','L3i1','L3i2','L4i1','L4i2','L4i3'],tables:{
      L2i1:table(2,10),L3i1:table(3,15),L3i2:table(3,20),
      L4i1:table(3,10),L4i2:table(4,20,{ABCA:25}),L4i3:table(3,10,{ABC:100})}};
  const profile={version:'ckt-long-error-profile-v1',keys,snapshotFingerprint:snapshotFingerprint(snapshot),
    errorRecoveryMs:782.2,positionDelta:.8,errorTables:{L4i2:table(4,.02),L4i3:table(3,.1)}};
  return {snapshot,profile};
}

test('all two/three/four-key values and metadata are identical to the legacy model',()=>{
  const {snapshot,profile}=fixtures(),legacy=upstreamMotor(snapshot);
  for(const scale of [0,.25,.5,1])for(const monotone of [false,true]) {
    const motor=positionAwareMotor(snapshot,profile,{positionScale:scale,monotone});
    for(let length=2;length<=4;length++)for(let n=0;n<3**length;n++) {
      let code='',v=n;for(let i=0;i<length;i++){code+='ABC'[v%3];v=Math.floor(v/3)}
      assert.deepEqual(motor(code),legacy(code));
    }
  }
});

test('raw error correction and the nondecreasing guard are independent, including the corrected five-key prefix',()=>{
  const {snapshot,profile}=fixtures();
  const raw=positionAwareMotor(snapshot,profile,{positionScale:.5,monotone:false});
  const guarded=positionAwareMotor(snapshot,profile,{positionScale:.5,monotone:true});
  assert.ok(raw('AABCA').upperMs<raw('AABC').upperMs);
  assert.equal(raw('AABCA').monotoneCorrectionMs,0);
  assert.ok(guarded('AABCA').monotoneCorrectionMs>0);
  assert.equal(guarded('AABCA').upperMs,guarded('AABC').upperMs);
  assert.ok(guarded('AABCAB').upperMs>=guarded('AABCA').upperMs);
  assert.equal(guarded('AABCAB').exact,false);
  assert.equal(guarded('AABCA').rawUpperMs,raw('AABCA').upperMs);
});

test('later real positions increase error odds without changing the context baseline',()=>{
  const {snapshot,profile}=fixtures();
  const raw=positionAwareMotor(snapshot,profile,{positionScale:1,monotone:false});
  const p2=Math.fround(.02),p3=Math.fround(.1),adjust=(p,shift)=>p/(p+(1-p)*Math.exp(-shift))-p;
  assert.ok(Math.abs(raw('AABCA').positionErrorCorrectionMs-782.2*(adjust(p2,.8)+adjust(p3,.8)))<1e-10);
  assert.ok(Math.abs(raw('AABCAB').positionErrorCorrectionMs-
    782.2*(adjust(p2,.8)+adjust(p2,1.6)+adjust(p3,1.6)))<1e-10);
  assert.ok(raw('AABCA').positionErrorCorrectionMs>0);
});

test('the guard is nondecreasing on every synthetic five/six-key string',()=>{
  const {snapshot,profile}=fixtures();
  for(const scale of [0,.25,.5,1]) {
    const motor=positionAwareMotor(snapshot,profile,{positionScale:scale,monotone:true});
    for(const length of [5,6])for(let n=0;n<3**length;n++) {
      let code='',v=n;for(let i=0;i<length;i++){code+='ABC'[v%3];v=Math.floor(v/3)}
      assert.ok(motor(code).upperMs>=motor(code.slice(0,-1)).upperMs,code);
    }
  }
});

test('snapshot binding, explicit shrinkage, valid probability tables and scope are enforced',()=>{
  const {snapshot,profile}=fixtures();
  assert.throws(()=>positionAwareMotor(snapshot,profile,{}),/positionScale/);
  assert.throws(()=>positionAwareMotor(snapshot,profile,{positionScale:2}),/positionScale/);
  assert.throws(()=>positionAwareMotor({...snapshot,commit:'other'},profile,{positionScale:.5}),/match/);
  assert.throws(()=>positionAwareMotor(snapshot,{...profile,errorRecoveryMs:1},{positionScale:.5}),/match/);
  const bad=structuredClone(profile);
  bad.errorTables.L4i2.base64=Buffer.from(new Float32Array(81).fill(1.1).buffer).toString('base64');
  assert.throws(()=>positionAwareMotor(snapshot,bad,{positionScale:.5}),/probability/);
  assert.throws(()=>positionAwareMotor(snapshot,profile,{positionScale:.5})('AABCAAB'),/six/);
});

test('shape/tone semantic round trips retain literal physical auxiliaries with the corrected scorer',()=>{
  const {snapshot,profile}=fixtures('ABCEUIOV');
  const motor=positionAwareMotor(snapshot,profile,{positionScale:.5,monotone:true});
  for(const shapeKeysByMeaning of ['AEUIO','AVUIO']) {
    const toneKeysByTone=toneKeysFromShapeKeys(shapeKeysByMeaning);
    assert.equal(shapeKeysFromToneKeys(toneKeysByTone),shapeKeysByMeaning);
    assert.equal(auxiliarySemantics(toneKeysByTone).toneDigitsByShapeMeaning,'42310');
    const suffix=physicalShape('AE',toneKeysByTone);
    assert.equal(suffix,shapeKeysByMeaning.slice(0,2));
    const code='BCBC'+suffix;
    assert.ok(motor(code).upperMs>=motor(code.slice(0,-1)).upperMs);
    assert.deepEqual(motor(code),motor('BCBC'+shapeKeysFromToneKeys(toneKeysByTone).slice(0,2)));
  }
});

test('large reference capture is isolated from later layout summaries and restores callbacks after failure',()=>{
  const summarize=rows=>({count:rows.length}),external={summarize};
  const rows=Array.from({length:150000},(_,id)=>({id}));
  const captured=captureReference(()=>{
    const callback=external.summarize;callback(rows);return {summarize:callback};
  },external);
  assert.equal(captured.outcomes.length,150000);
  assert.equal(external.summarize,summarize);
  assert.equal(captured.reference.summarize,summarize);
  captured.reference.summarize([{id:'later-layout'}]);
  assert.equal(captured.outcomes.length,150000);
  assert.throws(()=>captureReference(()=>{throw Error('interrupted reference')},external),/interrupted/);
  assert.equal(external.summarize,summarize);
});
