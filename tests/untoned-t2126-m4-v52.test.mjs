import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {enumerateInitials,audit,normalize,compileRows}=require('../tools/search_untoned_t2126_m4_v52');
const {HEADS,FINALS,splitPinyin}=require('../tools/ckt_v4_scheme_fixture');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
const report=JSON.parse(readFileSync('research/notes/2026-11-20-untoned-t2126-m4-v52.json'));
const checked=JSON.parse(readFileSync('research/notes/2026-11-20-untoned-t2126-m4-v52-verification.json'));
const data={pinyin:report.commonPinyin,base:report.commonPinyin.map((_,i)=>[i,1])};

test('源布局在任意同韵同键映射下至少有32对不可消除冲突',()=>{
 const groups=new Map();
 for(const py of data.pinyin){const [h,f]=splitPinyin(py),key=report.sourceInitialMap[HEADS[h]]+':'+FINALS[f];(groups.get(key)||groups.set(key,[]).get(key)).push(py);}
 const collisions=[...groups.values()].filter(g=>g.length>1);
 assert.equal(collisions.reduce((sum,g)=>sum+g.length*(g.length-1)/2,0),32);
 assert.ok(collisions.some(g=>g.includes('cha')&&g.includes('sa')));
 assert.ok(collisions.some(g=>g.includes('chi')&&g.includes('si')));
});

test('穷举排除0至3组改动；4组恰有24种结构可行的声母布局',()=>{
 const result=enumerateInitials(report.sourceInitialMap,data);
 assert.deepEqual(result.levels,report.minimumEdits);
 assert.equal(result.solutions.length,24);
 assert.deepEqual(result.levels.map(r=>r.assignments),[0,0,0,0,24]);
 for(const solution of result.solutions){
  assert.equal(solution.changes.length,4);
  const seed=report.records.find(r=>JSON.stringify(r.initialMap)===JSON.stringify(solution.initialMap));
  assert.ok(seed);
  const a=audit(solution.initialMap,seed.finalMap,data);
  assert.equal(a.unique,399);assert.equal(a.initialKeys,21);
  assert.equal(a.reservedInitials.length,0);
  assert.ok(solution.changes.some(c=>['f','j','q','x'].includes(c.head)));
 }
});

test('已验证候选为399个不同的无调二键码；每个声韵仅有一个固定键',()=>{
 assert.equal(new Set(data.pinyin).size,399);
 for(const item of checked.verification){
  const row=report.records.find(r=>r.id===item.id);
  assert.deepEqual(audit(row.initialMap,row.finalMap,data),item.audit);
  assert.equal(item.audit.unique,399);
  assert.equal(item.audit.collisionPairs,0);
  assert.ok(HEADS.every(h=>/^[A-Z]$/.test(row.initialMap[h])));
  assert.ok(FINALS.every(f=>/^[A-Z]$/.test(row.finalMap[f])));
  assert.ok(item.maximumTrackDifference<1e-7);
 }
});

test('新评测保持IEUAO调序、AEUIO形序与42310成对语义',()=>{
 const {toneKeysByTone,shapeKeysByMeaning,toneDigitsByShapeMeaning}=report.contract;
 assert.equal(toneKeysByTone,'IEUAO');assert.equal(shapeKeysByMeaning,'AEUIO');
 assert.equal(toneDigitsByShapeMeaning,'42310');
 assert.equal(toneKeysFromShapeKeys(shapeKeysByMeaning),toneKeysByTone);
 assert.equal(auxiliarySemantics(toneKeysByTone).shapeKeysByMeaning,shapeKeysByMeaning);
 assert.equal(checked.auxiliarySemantics.toneDigitsByShapeMeaning,'42310');
 const exported=JSON.parse(readFileSync('research/config/untoned-t2126-m4-v52-finalist.json'));
 assert.equal(exported.tone,exported.toneKeysByTone);
 assert.equal(toneKeysFromShapeKeys(exported.shapeKeysByMeaning),exported.toneKeysByTone);
 assert.deepEqual(exported.initialMap,report.bestJoint[0].initialMap);
 assert.deepEqual(exported.finalMap,report.bestJoint[0].finalMap);
 assert.equal(audit(exported.initialMap,exported.finalMap,data).unique,399);
});

test('符号模板重现物理形辅键；长码多备选拒绝静默重计价',()=>{
 const e=report.records[0],entry={...e,codeList:[e.initialMap.b+e.finalMap.a]},fixture={pinyin:['ba']};
 const code=entry.codeList[0]+'A';
 const row={id:'character:0',kind:'character',weight:1,baseLength:2,stages:[{order:3,length:3,pool:'char:aux1',codes:[code]}]};
 const tokens=compileRows([row],{},fixture,entry)[0][4][0][2][0];
 assert.deepEqual(tokens,[HEADS.indexOf('b'),27+FINALS.indexOf('a'),62]);
 const bad={...row,stages:[{order:5,length:5,pool:'word:five',codes:['AAAAA','AAAAB']}]};
 assert.throws(()=>compileRows([bad],{},fixture,entry),/Long-code alternatives/);
});

test('认知成本扰动同时重计价S005、形调各半分别归一',()=>{
 const publication=JSON.parse(readFileSync('research/notes/2026-11-18-ckt-v52-all-schemes.json'));
 for(const r of [...report.controls,...checked.verification]){
  assert.ok(Math.abs(normalize(r.modes,publication.references.v52)-r.score)<1e-9);
  assert.ok(Math.abs(normalize(r.modes,publication.references.v52,2)-r.doubledScore)<1e-9);
 }
 for(const scale of [0,1,2,5])assert.equal(normalize(publication.references.v52,publication.references.v52,scale),10);
});

test('选定的最小改动布局在默认和全部认知成本加倍两点均胜过A、C',()=>{
 const best=report.bestJoint[0];
 assert.equal(best.changes.length,4);
 assert.ok(checked.verification.some(r=>r.id===best.id));
 for(const control of report.controls){
  assert.ok(best.score<control.score-1e-9);
  assert.ok(best.doubledScore<control.doubledScore-1e-9);
 }
});
