import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const require=createRequire(import.meta.url);
const search=require('../tools/search_untoned_m40d3_v52');
const follow=require('../tools/refine_untoned_t2126_m4_v52');
const base=require('../tools/search_untoned_t2126_m4_v52');
const {HEADS,FINALS}=require('../tools/ckt_v4_scheme_fixture');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
const prefix='research/notes/2026-11-20-untoned-m40d3-v52';
const report=JSON.parse(readFileSync(prefix+'.json'));
const verified=JSON.parse(readFileSync(prefix+'-verification.json'));
const finalist=JSON.parse(readFileSync('research/config/untoned-m40d3-v52-finalist.json'));
const data={pinyin:verified.commonPinyin,base:verified.commonPinyin.map((_,i)=>[i,1])};

test('M40 D3是全程硬约束，速度改善不能豁免',()=>{
 const original=JSON.parse(readFileSync('research/config/untoned-t2126-m4-v52-finalist.json'));
 const fast=JSON.parse(readFileSync('research/config/untoned-t2126-m4-followup-finalist.json'));
 assert.deepEqual([search.memory(original).M,search.memory(original).D],[43,4]);
 assert.deepEqual([search.memory(fast).M,search.memory(fast).D],[46,6]);
 assert.equal(search.guard(original,data),false);
 assert.equal(search.guard(fast,data),false);
 const publication=JSON.parse(readFileSync('research/notes/2026-11-18-ckt-v52-all-schemes.json'));
 for(const control of report.controls){
  assert.equal(control.score,publication.schemes[control.id].v52.score);
 }
});

test('全部精确评分状态均满足M≤40、D≤3、399无重',()=>{
 const records=gunzipSync(readFileSync(prefix+'-scores.jsonl.gz')).toString().trim().split('\n').map(JSON.parse);
 assert.equal(new Set(records.map(r=>r.state)).size,records.length);
 const independent=JSON.parse(readFileSync(prefix+'-memory-verification.json'));
 assert.equal(independent.passed,true);
 assert.equal(independent.verifiedStates,records.length);
 assert.ok(independent.maximumM<=40&&independent.maximumD<=3);
 for(const row of records){
  const e=follow.expand(row.state),memory=search.memory(e);
  assert.deepEqual(memory,row.memory);
  assert.ok(memory.M<=40&&memory.D<=3,row.id);
  assert.equal(search.guard(e,data),true,row.id);
  assert.equal(base.audit(e.initialMap,e.finalMap,data).unique,399);
 }
});

test('恢复单元音原位的整键置换保留韵母共键关系',()=>{
 const fast=JSON.parse(readFileSync('research/config/untoned-t2126-m4-followup-finalist.json'));
 const repairs=search.restoreVowels(fast);assert.ok(repairs.length>0);
 for(const e of repairs){
  assert.ok([...'aeiou'].filter(f=>e.finalMap[f]===f.toUpperCase()).length>=4);
  for(const a of FINALS)for(const b of FINALS)assert.equal(e.finalMap[a]===e.finalMap[b],fast.finalMap[a]===fast.finalMap[b]);
 }
});

test('获胜布局在相同MD预算内，两点评分均低于A和C',()=>{
 assert.equal(search.guard(finalist,data),true);
 assert.deepEqual(search.memory(finalist),finalist.memory);
 assert.equal(finalist.id,verified.id);
 for(const field of ['initialMap','finalMap'])assert.deepEqual(finalist[field],report.selected[field]);
 assert.ok(verified.maximumTrackDifference<1e-7);
 const publication=JSON.parse(readFileSync('research/notes/2026-11-18-ckt-v52-all-schemes.json'));
 assert.ok(Math.abs(base.normalize(verified.modes,publication.references.v52)-verified.score)<1e-9);
 assert.ok(Math.abs(base.normalize(verified.modes,publication.references.v52,2)-verified.doubledScore)<1e-9);
 for(const rival of report.controls){assert.ok(verified.score<rival.score-1e-9);assert.ok(verified.doubledScore<rival.doubledScore-1e-9);}
});

test('语义往返保持IEUAO调序、AEUIO形序和42310',()=>{
 assert.equal(finalist.tone,finalist.toneKeysByTone);
 assert.equal(toneKeysFromShapeKeys(finalist.shapeKeysByMeaning),finalist.toneKeysByTone);
 assert.equal(finalist.toneDigitsByShapeMeaning,'42310');
 assert.deepEqual(auxiliarySemantics(finalist.tone),verified.semantics);
 assert.ok(HEADS.every(h=>/^[A-Z]$/.test(finalist.initialMap[h])));
});
