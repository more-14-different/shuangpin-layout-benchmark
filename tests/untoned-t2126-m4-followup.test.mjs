import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const require=createRequire(import.meta.url);
const search=require('../tools/refine_untoned_t2126_m4_v52');
const base=require('../tools/search_untoned_t2126_m4_v52');
const {HEADS}=require('../tools/ckt_v4_scheme_fixture');
const {toneKeysFromShapeKeys,auxiliarySemantics}=require('../tools/auxiliary_semantics');
const prefix='research/notes/2026-11-20-untoned-t2126-m4-followup';
const report=JSON.parse(readFileSync(prefix+'.json'));
const checked=JSON.parse(readFileSync(prefix+'-verification.json'));
const anchor=report.anchor;
const data={pinyin:checked.commonPinyin,base:checked.commonPinyin.map((_,i)=>[i,1])};

test('声母扰动按逻辑族计数，A/E/O和Y/YU不拆分',()=>{
 assert.equal(search.initialDistance(anchor,anchor),0);
 const y={...anchor,initialMap:{...anchor.initialMap,Y:'B',YU:'B'}};
 assert.equal(search.initialDistance(y,anchor),1);
 assert.equal(search.guard(y,anchor,data),false);
 const split={...anchor,initialMap:{...anchor.initialMap,YU:'B'}};
 assert.equal(search.guard(split,anchor,data),false);
 const zero={...anchor,initialMap:{...anchor.initialMap,E:'B'}};
 assert.equal(search.guard(zero,anchor,data),false);
 const four={...anchor,initialMap:{...anchor.initialMap}};
 for(const [a,b]of [['b','n'],['zh','ch']])[four.initialMap[a],four.initialMap[b]]=[four.initialMap[b],four.initialMap[a]];
 assert.equal(search.initialDistance(four,anchor),4);
 assert.equal(search.guard(four,anchor,data),false);
});

test('声母交换允许中间态冲突，最终端点必须399无重',()=>{
 const swapped=search.initialVariants(anchor).find(r=>r.mutation==='initial families b↔n');
 assert.ok(swapped);assert.equal(search.initialDistance(swapped,anchor),2);
 assert.equal(search.guard(swapped,anchor,data),true);
 const intermediate={...anchor,initialMap:{...anchor.initialMap,b:anchor.initialMap.n}};
 assert.equal(search.guard(intermediate,anchor,data),false);
 assert.equal(search.guard(swapped,anchor,data,1),false);
});

test('每个归档候选符合399无重、21×26容量、三组声母扰动上限',()=>{
 const records=gunzipSync(readFileSync(prefix+'-scores.jsonl.gz')).toString().trim().split('\n').map(JSON.parse);
 assert.equal(records.length,report.newScores);
 assert.equal(new Set(records.map(r=>r.state)).size,records.length);
 for(const row of records){
  assert.ok(Number.isFinite(row.score)&&Number.isFinite(row.doubledScore));
  const e=search.expand(row.state);
  assert.equal(base.stateKey(e),row.state);
  assert.equal(search.initialDistance(e,anchor),row.initialDistance);
  assert.equal(search.guard(e,anchor,data),true,row.id);
 }
});

test('分别保留只改韵母和轻微改声母的改良候选，分数经独立复算',()=>{
 const publication=JSON.parse(readFileSync('research/notes/2026-11-18-ckt-v52-all-schemes.json'));
 for(const e of report.selected){
  assert.ok(e.initialDistance<=e.radius);
  if(e.radius===0)assert.deepEqual(e.initialMap,anchor.initialMap);
  assert.equal(base.audit(e.initialMap,e.finalMap,data).unique,399);
  const verified=checked.verified.find(r=>r.id===e.id);assert.ok(verified);
  assert.ok(Math.abs(base.normalize(verified.modes,publication.references.v52)-e.score)<1e-9);
  assert.ok(Math.abs(base.normalize(verified.modes,publication.references.v52,2)-e.doubledScore)<1e-9);
  assert.ok(verified.maximumTrackDifference<=1e-7);
  assert.ok(e.score<anchor.cktV52.defaultScore);
  assert.ok(e.doubledScore<anchor.cktV52.doubledCognitiveScore);
  for(const change of e.changesFromAnchor.final){
   assert.equal(change.from,anchor.finalMap[change.name]);
   assert.equal(change.to,e.finalMap[change.name]);
   assert.notEqual(change.from,change.to);
  }
 }
 const winner=report.selected.find(r=>r.radius===3);
 assert.ok(winner.score<anchor.cktV52.defaultScore);
 assert.ok(winner.doubledScore<anchor.cktV52.doubledCognitiveScore);
});

test('导出方案的物理形调辅序往返一致，且与获胜布局一致',()=>{
 const exported=JSON.parse(readFileSync('research/config/untoned-t2126-m4-followup-finalist.json'));
 const winner=report.selected.find(r=>r.radius===3);
 assert.equal(exported.tone,exported.toneKeysByTone);
 assert.equal(toneKeysFromShapeKeys(exported.shapeKeysByMeaning),exported.toneKeysByTone);
 assert.equal(exported.toneDigitsByShapeMeaning,'42310');
 assert.deepEqual(auxiliarySemantics(exported.tone),checked.semantics);
 for(const field of ['initialMap','finalMap'])assert.deepEqual(exported[field],winner[field]);
 assert.ok(HEADS.every(h=>/^[A-Z]$/.test(exported.initialMap[h])));
 assert.equal(base.audit(exported.initialMap,exported.finalMap,data).unique,399);
});
