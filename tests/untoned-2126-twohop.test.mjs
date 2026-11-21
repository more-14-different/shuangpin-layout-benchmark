import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('replaying saved base64 state does not mutate its Buffer across witness checks',()=>{
  const {replayWitness}=require('../tools/verify_untoned_2126_twohop.js');
  assert.equal(typeof replayWitness,'function');
  const {operations}=require('../tools/search_untoned_2126_coupled.js'),ops=operations();
  const path=[ops.findIndex(o=>o.kind==='token-move'&&o.indices.length===1&&o.indices[0]===0&&o.to===1),ops.findIndex(o=>o.kind==='token-move'&&o.indices.length===1&&o.indices[0]===27&&o.to===2)];
  const anchor=Buffer.alloc(62),before=Buffer.from(anchor),result=replayWitness(anchor,ops,path);
  assert.deepEqual(anchor,before);assert.equal(result[0],1);assert.equal(result[27],2);
  assert.deepEqual(replayWitness(anchor,ops,path),result);
});
test('physical templates retain semantic auxiliary suffixes when onsets and finals move',()=>{
  const {compileRows}=require('../tools/export_untoned_v51_templates.js');
  const {HEADS,FINALS,ALPHABET}=require('../tools/ckt_v4_scheme_fixture.js');
  const {auxiliarySemantics}=require('../tools/auxiliary_semantics.js');
  const initialMap=Object.fromEntries(HEADS.map(h=>[h,'B'])),finalMap=Object.fromEntries(FINALS.map(f=>[f,'A']));
  const entry={initialMap,finalMap,codeList:['BA'],tone:'IEUAO'};
  const rows=[{id:'c:甲:0',kind:'character',weight:1,baseLength:2,stages:[{order:2,length:2,pool:'char:base',codes:['BA']},{order:4,length:4,pool:'char:aux2',codes:['BAAE']}]}];
  const [row]=compileRows(rows,{}, {pinyin:['ba']},entry);
  const layout=[...HEADS.map(h=>initialMap[h]),...FINALS.map(f=>finalMap[f])];
  layout[HEADS.indexOf('b')]='T';layout[27+FINALS.indexOf('a')]='N';
  assert.equal(row[4][1][2][0].map(t=>t<62?layout[t]:ALPHABET[t-62]).join(''),'TNAE');
  assert.equal(auxiliarySemantics('IEUAO').shapeKeysByMeaning,'AEUIO');
});
test('two-hop enumeration crosses an illegal first step and preserves distinct endpoint coverage',()=>{
  const {enumerateTwoStep}=require('../tools/exhaust_untoned_2126_twohop.js');
  assert.equal(typeof enumerateTwoStep,'function');
  const ops=[0,1,2];
  const apply=(s,i)=>{const v=s.slice();v[i%2]^=1;return v;};
  const guard=s=>s[0]===s[1];
  const result=enumerateTwoStep(Uint8Array.of(0,0),ops,guard,apply);
  assert.equal(result.stats.firstStates,2);
  assert.equal(result.stats.orderedPairsVisited,6);
  assert.deepEqual([...result.endpoints.keys()].sort(),['AAA=','AQE=']);
  assert.equal(result.endpoints.get('AQE=').viaIllegalIntermediate,true);
  assert.equal(result.endpoints.get('AQE=').viaLegalIntermediate,false);
});
test('coverage rejects omitted, duplicated and foreign scores even when counts match',()=>{
  const {validateCoverage}=require('../tools/exhaust_untoned_2126_twohop.js');
  assert.equal(typeof validateCoverage,'function');
  assert.doesNotThrow(()=>validateCoverage(['a','b'],[{id:'a',score:9},{id:'b',score:8}]));
  assert.throws(()=>validateCoverage(['a','b'],[{id:'a',score:9},{id:'a',score:8}]),/duplicate/i);
  assert.throws(()=>validateCoverage(['a','b'],[{id:'a',score:9},{id:'c',score:8}]),/foreign|missing/i);
  assert.throws(()=>validateCoverage(['a','b'],[{id:'a',score:9}]),/missing/i);
  assert.throws(()=>validateCoverage(['a'],[{id:'a',score:NaN}]),/finite/i);
});
