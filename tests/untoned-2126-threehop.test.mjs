import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('verification rejects equal-length but different endpoint sets',()=>{
  const {sameSet}=require('../tools/verify_untoned_2126_threehop');
  assert.doesNotThrow(()=>sameSet(new Set(['a','b']),new Set(['b','a']),'coverage'));
  assert.throws(()=>sameSet(new Set(['a','b']),new Set(['a','c']),'coverage'),/coverage/);
});
test('bridge layout boundary preserves the tone and shape semantic pairing',()=>{
  const fs=require('node:fs'),{compactState,expandState}=require('../tools/search_untoned_2126_coupled');
  const {auxiliarySemantics}=require('../tools/auxiliary_semantics');
  const row=JSON.parse(fs.readFileSync(new URL('../research/config/untoned-2126-recenter-finalist.json',import.meta.url),'utf8'));
  const roundtrip=expandState(compactState(row)),semantics=auxiliarySemantics(roundtrip.tone);
  assert.deepEqual(roundtrip.initialMap,row.initialMap);assert.deepEqual(roundtrip.finalMap,row.finalMap);
  assert.equal(semantics.shapeKeysByMeaning,row.shapeKeysByMeaning);assert.equal(semantics.toneDigitsByShapeMeaning,'42310');
});
test('third-step expansion preserves all endpoints and does not mutate Buffer-backed bridges',()=>{
  const {extendBridges}=require('../tools/explore_untoned_2126_threehop.js');
  assert.equal(typeof extendBridges,'function');
  const bridge={key:Buffer.from([1,0]).toString('base64'),path:[0,1]},ops=[0,1];
  const apply=(s,n)=>{const v=s.slice();v[n]^=1;return v;};
  const result=extendBridges([bridge],ops,()=>true,apply);
  assert.equal(result.stats.thirdOperationsVisited,2);
  assert.deepEqual([...result.endpoints.keys()].sort(),['AAA=','AQE=']);
  assert.deepEqual(result.endpoints.get('AQE=').path,[0,1,1]);
  assert.equal(bridge.key,Buffer.from([1,0]).toString('base64'));
});
test('sampled triples permit illegal intermediate states and are deterministic',()=>{
  const {sampleTriples}=require('../tools/explore_untoned_2126_threehop.js');
  assert.equal(typeof sampleTriples,'function');
  const ops=[0,1],apply=(s,n)=>{const v=s.slice();v[n]^=1;return v;};
  const guard=s=>s[0]===1;
  const a=sampleTriples(Uint8Array.of(0,0),ops,guard,80,123,apply);
  const b=sampleTriples(Uint8Array.of(0,0),ops,guard,80,123,apply);
  assert.deepEqual([...a.endpoints],[...b.endpoints]);
  assert.equal(a.stats.sampledTriples,80);assert.ok(a.endpoints.size>0);
  assert.ok([...a.endpoints.values()].every(r=>r.path.length===3));
  assert.ok([...a.endpoints.values()].some(r=>r.illegalIntermediate));
});
