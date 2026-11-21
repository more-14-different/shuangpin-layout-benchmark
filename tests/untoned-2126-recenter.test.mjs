import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('recenter layout import retains tone order and its shape round-trip',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const {compactState,expandState}=require('../tools/search_untoned_2126_coupled');
  const {auxiliarySemantics}=require('../tools/auxiliary_semantics');
  const root=path.resolve(import.meta.dirname,'..');
  const finalist=path.join(root,'research/config/untoned-2126-recenter-finalist.json');
  const row=JSON.parse(fs.readFileSync(fs.existsSync(finalist)?finalist:path.join(root,'research/config/untoned-2126-twohop-finalist.json'),'utf8'));
  const decoded=expandState(compactState(row));
  assert.deepEqual(decoded.initialMap,row.initialMap);assert.deepEqual(decoded.finalMap,row.finalMap);
  assert.equal(decoded.tone,row.toneKeysByTone);assert.deepEqual(decoded.capacity,[21,26]);
  const semantics=auxiliarySemantics(decoded.tone);
  assert.equal(semantics.shapeKeysByMeaning,row.shapeKeysByMeaning);
  assert.equal(semantics.toneDigitsByShapeMeaning,row.toneDigitsByShapeMeaning);
});
test('completion verification rejects missing or nonfinite track evidence',()=>{
  const {validateTracks}=require('../tools/verify_untoned_2126_recenter.js');
  const modes=Object.fromEntries(['keytao','sanpin'].map(m=>[m,Object.fromEntries(['character','word2','word3','word4'].map(k=>[k,{count:1,totalWeight:1,effectiveMs:400}]))]));
  assert.doesNotThrow(()=>validateTracks({score:9,modes}));
  assert.throws(()=>validateTracks({modes}),/Nonfinite/i);
  assert.throws(()=>validateTracks({score:9,modes:{keytao:modes.keytao}}),/Missing/i);
  const broken=structuredClone(modes);broken.sanpin.word3.effectiveMs=NaN;
  assert.throws(()=>validateTracks({score:9,modes:broken}),/Missing|Nonfinite/i);
});
test('single-step coverage deduplicates aliases and excludes the center',()=>{
  const {enumerateSingle}=require('../tools/recenter_untoned_2126.js');
  assert.equal(typeof enumerateSingle,'function');
  const ops=[0,1,2,3],apply=(s,n)=>{const v=s.slice();if(n<3)v[n%2]^=1;return v;};
  const result=enumerateSingle(Uint8Array.of(0,0),ops,s=>s[1]===0,apply);
  assert.equal(result.stats.firstStates,2);assert.equal(result.stats.uniqueHardLegalEndpoints,1);
  assert.deepEqual([...result.endpoints.keys()],['AQA=']);
  assert.deepEqual(result.endpoints.get('AQA=').path,[0]);
});
test('winner admission skips a lower CKT that fails independent gates and records the evidence',()=>{
  const {admitWinner}=require('../tools/recenter_untoned_2126.js');
  assert.equal(typeof admitWinner,'function');
  const center={key:'c',score:9},scores=[{key:'b',score:8.8},{key:'a',score:8.7},{key:'d',score:9.1}];
  const calls=[],audit=row=>{calls.push(row.key);return {pass:row.key==='b'};};
  const result=admitWinner(center,scores,audit,x=>x.pass);
  assert.equal(result.best.key,'b');assert.deepEqual(calls,['a','b']);
  assert.deepEqual(result.audits.map(r=>r.pass),[false,true]);
  assert.equal(admitWinner(center,scores,()=>({pass:false}),x=>x.pass).best.key,'c');
});
test('score import rejects nonfinite scores, wrong physical state, and contradictory duplicate scores',()=>{
  const {insertScore}=require('../tools/recenter_untoned_2126.js');
  assert.equal(typeof insertScore,'function');
  const modes=Object.fromEntries(['keytao','sanpin'].map(m=>[m,Object.fromEntries(['character','word2','word3','word4'].map(k=>[k,{effectiveMs:400}]))]));
  const cache=new Map(),key=Buffer.alloc(62).toString('base64'),row={id:'x',key,score:9,modes};
  insertScore(cache,row,'first');insertScore(cache,{...row,id:'y'},'second');assert.equal(cache.size,1);
  assert.throws(()=>insertScore(cache,{...row,score:NaN},'bad'),/finite/i);
  assert.throws(()=>insertScore(cache,{...row,key:'bad'},'bad'),/state/i);
  assert.throws(()=>insertScore(cache,{...row,score:8},'bad'),/contradict/i);
});
