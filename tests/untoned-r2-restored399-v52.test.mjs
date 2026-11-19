import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const input=require('../research/config/untoned-r2-restore399-v52-input.json');
const constructions=require('../research/notes/2026-11-20-untoned-r2-399-rhyme-constructions.json');
const diverse=require('../research/notes/2026-11-20-untoned-r2-399-diverse-constructions.json');
const {rebuild,audit}=require('../tools/untoned_r2_search_metrics');
const {changes}=require('../tools/search_untoned_r2_restored399_v52');
const {applyFinals,makeFinalGuard}=require('../tools/search_untoned_r2_restored399_twohop_v52');
const {operations}=require('../tools/search_untoned_r2_v52');
const {cycleFinals,permutations3}=require('../tools/search_untoned_r2_restored399_threehop_v52');
const {loadLayoutInputs}=require('../tools/untoned_r2_search_inputs');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');

test('all constructed layouts preserve 399 unique codes within the original memory and no-branch budget',()=>{
 const data={pinyin:input.common.map(r=>r.py),base:input.common.map((r,i)=>[i,r.weight])};
 assert.equal(data.pinyin.length,399);assert.ok(constructions.candidates.length>0);
 for(const r of constructions.candidates){
  const entry=rebuild({capacity:[21,26],tone:'IEUAO',initialMap:r.initialMap,finalMap:r.finalMap,codeList:Array(399).fill('AA')},data);
  const result=audit(entry,data);
  assert.equal(result.unique,399);assert.equal(result.branches,0);assert.equal(result.qz,false);assert.equal(result.zq,false);
  assert.ok(result.M<=40&&result.D<=3&&result.V<=1&&result.valid);
  assert.deepEqual(changes(r.state,input.sourceInitialMap),{entries:6,families:4});
  const semantics=auxiliarySemantics(entry.tone);
  assert.equal(semantics.shapeKeysByMeaning,input.auxiliarySemantics.shapeKeysByMeaning);
  assert.equal(toneKeysFromShapeKeys(semantics.shapeKeysByMeaning),entry.tone);
  assert.equal(semantics.toneDigitsByShapeMeaning,'42310');
 }
});

test('distant MILP starts preserve the same unique-code and minimal-onset contract',()=>{
 const data={pinyin:input.common.map(r=>r.py),base:input.common.map((r,i)=>[i,r.weight])};
 const heads=input.heads,finals=input.finals;
 assert.equal(diverse.candidates.length,224);
 const seen=new Set();
 for(const r of diverse.candidates){
  const state=r.state,key=Buffer.from(state).toString('base64');assert.ok(!seen.has(key));seen.add(key);
  const entry=rebuild({capacity:[21,26],tone:'IEUAO',initialMap:Object.fromEntries(heads.map((h,i)=>[h,String.fromCharCode(65+state[i])])),finalMap:Object.fromEntries(finals.map((f,i)=>[f,String.fromCharCode(65+state[27+i])])),codeList:Array(399).fill('AA')},data);
  const result=audit(entry,data);
  assert.equal(result.unique,399);assert.equal(result.branches,0);assert.ok(result.valid&&!result.qz&&!result.zq&&result.M<=40&&result.D<=3&&result.V<=1);
  assert.deepEqual(changes(state,input.sourceInitialMap),{entries:6,families:4});
 }
});

test('two-hop compact legality matches the independent 399-code audit, including invalid intermediates',()=>{
 const state=constructions.candidates[0].state,heads=state.slice(0,27),original=Uint8Array.from(state.slice(27));
 const data={pinyin:input.common.map(r=>r.py),base:input.common.map((r,i)=>[i,r.weight])};
 const build=finals=>rebuild({capacity:[21,26],tone:'IEUAO',initialMap:Object.fromEntries(input.heads.map((h,i)=>[h,String.fromCharCode(65+heads[i])])),finalMap:Object.fromEntries(input.finals.map((f,i)=>[f,String.fromCharCode(65+finals[i])])),codeList:Array(399).fill('AA')},data);
 const memory=audit(build(original),data).M-input.finals.reduce((sum,f,i)=>sum+Number(String.fromCharCode(65+original[i])!==f.toUpperCase()),0);
 const guard=makeFinalGuard(heads,input.common.map(r=>r.pair),memory),a=new Uint8Array(35),b=new Uint8Array(35),ops=operations();
 let legal=0,invalid=0;
 for(let i=0;i<ops.length;i++){
  applyFinals(original,a,ops[i]);
  for(const finals of [a,applyFinals(a,b,ops[(i*37+11)%ops.length])]){
   const r=audit(build(finals),data),expected=r.valid&&r.unique===399&&!r.qz&&!r.zq&&r.M<=40&&r.D<=3&&r.V<=1&&r.branches===0&&new Set(finals).size===26;
   assert.equal(guard(finals),expected,ops[i].label);if(expected)legal++;else invalid++;
  }
 }
 assert.ok(legal>100&&invalid>100);
 assert.deepEqual([...original],state.slice(27));
});

test('three-hop cycle endpoints equal three actual primitive swaps for all six orientations',()=>{
 const original=Uint8Array.from(constructions.candidates[0].state.slice(27));
 for(const kind of ['key','token']){
  const direct=new Uint8Array(35),a=new Uint8Array(35),b=new Uint8Array(35),keys=new Set();
  for(const tail of permutations3(7,13,22)){
   const cycle=[2,...tail];cycleFinals(original,direct,cycle,kind);
   let current=original;
   for(const end of tail){const out=current===a?b:a;applyFinals(current,out,kind==='key'?{kind:'group-swap',a:2,b:end}:{kind:'swap',a:29,b:end+27});current=out;}
   assert.deepEqual([...direct],[...current]);
   keys.add(Buffer.from(direct).toString('base64'));
  }
  assert.equal(keys.size,6);
 }
});

test('minimal search inputs preserve the frozen Common399 inventory and full fallback spellings',()=>{
 const saved=loadLayoutInputs(),{data,template}=saved;
 assert.equal(saved.htmlSha256,input.sourceHashes['a7_CKT_R11.html']);
 assert.deepEqual(data.base.map(([p,weight])=>({py:data.pinyin[p],weight})),input.common.map(({py,weight})=>({py,weight})));
 assert.equal(template.codeList.length,data.pinyin.length);
 assert.deepEqual(template.initialMap,input.baselines[0].initialMap);
 assert.deepEqual(template.finalMap,input.baselines[0].finalMap);
 const rebuilt=rebuild(template,data);assert.deepEqual(rebuilt.codeList,template.codeList);
 assert.equal(audit(rebuilt,data).unique,399);
});
