import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {HEADS,FINALS}=require('../tools/ckt_v4_scheme_fixture');
const {operations,apply}=require('../tools/search_untoned_r2_v52');
const {compileRows}=require('../tools/export_untoned_r2_v52_templates');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
const {vowelPairs}=require('../tools/search_untoned_r2_v52_vowel_pairs');

test('paired vowel-budget transfer restores the old vowel without moving any onsets',()=>{
 const s=Array.from({length:62},(_,i)=>i%26);
 for(const v of 'aeiou')s[27+FINALS.indexOf(v)]=v.toUpperCase().charCodeAt(0)-65;
 s[27+FINALS.indexOf('e')]=7;
 const pairs=vowelPairs(s);assert.equal(pairs.length,124);
 const desired=pairs.find(p=>p.state[27+FINALS.indexOf('u')]===9);
 assert.ok(desired);assert.equal(desired.state[27+FINALS.indexOf('e')],4);
 assert.deepEqual(desired.state.slice(0,27),s.slice(0,27));
 assert.equal([... 'aeiou'].filter(v=>desired.state[27+FINALS.indexOf(v)]!==v.toUpperCase().charCodeAt(0)-65).length,1);
});

test('all rhyme moves, swaps and group operations preserve the complete onset vector',()=>{
 const state=Array.from({length:62},(_,i)=>i%26),first=state.slice(0,27);
 for(const op of operations()){
  const next=apply(state,op);
  assert.deepEqual(next.slice(0,27),first,op.label);
  assert.equal(next.length,62);assert.ok(next.every(i=>i>=0&&i<26));
 }
 assert.deepEqual(state.slice(0,27),first);
});

test('colliding main codes retain separate symbolic syllables and explicit shape/tone semantics',()=>{
 const entry={initialMap:Object.fromEntries(HEADS.map(h=>[h,'B'])),finalMap:Object.fromEntries(FINALS.map(f=>[f,'A'])),codeList:['BA','BA']};
 const data={pinyin:['ba','pa']};
 const rows=[0,1].map(i=>({id:`character:${i}`,kind:'character',weight:2-i,baseLength:2,stages:[{order:2,length:2,pool:'char:base',codes:['BA']},{order:3,length:3,pool:'char:aux1',codes:['BAA']}]}));
 const out=compileRows(rows,{},data,entry);
 assert.deepEqual(out[0][4][0][2],[[0,27]]);
 assert.deepEqual(out[1][4][0][2],[[1,27]]);
 assert.equal(out[0][4][1][2][0][2],62);
 const semantics=auxiliarySemantics('IEUAO');
 assert.equal(semantics.shapeKeysByMeaning,'AEUIO');
 assert.equal(toneKeysFromShapeKeys(semantics.shapeKeysByMeaning),'IEUAO');
 assert.equal(semantics.toneDigitsByShapeMeaning,'42310');
});

test('v5.2 terminal repricing rejects unsupported long-code alternatives',()=>{
 const entry={initialMap:Object.fromEntries(HEADS.map(h=>[h,'B'])),finalMap:Object.fromEntries(FINALS.map(f=>[f,'A'])),codeList:['BA']};
 const rows=[{id:'character:0',kind:'character',weight:1,baseLength:2,stages:[{order:5,length:5,pool:'char:aux2',codes:['BAAAA','BAAAE']}]}];
 assert.throws(()=>compileRows(rows,{}, {pinyin:['ba']},entry),/long-code alternatives/);
});
