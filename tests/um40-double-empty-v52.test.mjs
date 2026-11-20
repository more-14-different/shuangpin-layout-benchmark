import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const require=createRequire(import.meta.url);
const search=require('../tools/search_um40_double_empty_v52');
const base=require('../tools/search_untoned_t2126_m4_v52');
const md=require('../tools/search_untoned_m40d3_v52');
const follow=require('../tools/refine_untoned_t2126_m4_v52');
const rhymes=require('../tools/refine_um40_rhymes_v52');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
const prefix='research/notes/2026-11-20-um40-double-empty-v52';
const report=JSON.parse(readFileSync(prefix+'.json'));
const checked=JSON.parse(readFileSync(prefix+'-verification.json'));
const independent=JSON.parse(readFileSync(prefix+'-memory-verification.json'));
const data={pinyin:checked.commonPinyin,base:checked.commonPinyin.map((_,i)=>[i,1])};
const anchor=report.anchors[0];

test('三个原布局ZQ均有zen，双空是强制准入条件',()=>{
 for(const e of report.anchors){
  assert.deepEqual(search.buckets(e,data),{QZ:[],ZQ:['zen']});
  assert.equal(md.guard(e,data),true);
  assert.equal(search.guard(e,data,anchor),false);
 }
});

test('紧凑双空冲突图与完整审计一致，声母共键硬冲突不能被掩盖',()=>{
 for(const e of [anchor,...report.selected]){
  const compact=search.compactGuard(e,data),state=rhymes.encode(e.finalMap),ops=rhymes.operations();
  for(let i=0;i<ops.length;i++){
   const s=rhymes.apply(state,ops[i]);
   assert.equal(compact(s),search.guard({...e,finalMap:rhymes.decode(s)},data),e.id+'/'+i);
  }
 }
 const impossible={...anchor,initialMap:{...anchor.initialMap,ch:anchor.initialMap.s}};
 assert.equal(search.compactGuard(impossible,data)(rhymes.encode(impossible.finalMap)),false);
});

test('归档全部布局符合M40 D3、399无重、QZ/ZQ双空及声母扰动上限',()=>{
 const rows=gunzipSync(readFileSync(prefix+'-scores.jsonl.gz')).toString().trim().split('\n').map(JSON.parse);
 assert.equal(new Set(rows.map(r=>r.state)).size,rows.length);
 assert.equal(rows.length,independent.verifiedStates);
 assert.equal(rows.length,report.scoreCounts.total);
 assert.equal(independent.passed,true);assert.equal(independent.allQZEmpty,true);assert.equal(independent.allZQEmpty,true);
 for(const row of rows){
  const e=follow.expand(row.state);
  assert.equal(search.guard(e,data,anchor),true,row.id);
  assert.deepEqual(search.buckets(e,data),{QZ:[],ZQ:[]});
  assert.deepEqual(md.memory(e),row.memory);
 }
});

test('独立重建评分与默认、同步加倍两点一致，固定声母备选单列',()=>{
 const refs=JSON.parse(readFileSync('research/notes/2026-11-18-ckt-v52-all-schemes.json')).references.v52;
 for(const e of report.selected){
  const v=checked.checked.find(r=>r.id===e.id);assert.ok(v);
  assert.ok(v.maximumTrackDifference<1e-7);
  assert.ok(Math.abs(base.normalize(v.modes,refs)-e.score)<1e-9);
  assert.ok(Math.abs(base.normalize(v.modes,refs,2)-e.doubledScore)<1e-9);
  assert.deepEqual(v.buckets,{QZ:[],ZQ:[]});
  if(e.kind==='fixed-initials')assert.deepEqual(e.initialMap,anchor.initialMap);
 }
});

test('导出方案按声调顺序解释tone，形调往返仍为42310',()=>{
 const e=JSON.parse(readFileSync('research/config/um40-double-empty-v52-finalist.json'));
 assert.equal(e.tone,e.toneKeysByTone);
 assert.equal(toneKeysFromShapeKeys(e.shapeKeysByMeaning),e.toneKeysByTone);
 assert.equal(e.toneDigitsByShapeMeaning,'42310');
 assert.deepEqual(auxiliarySemantics(e.tone),checked.semantics);
 assert.equal(e.audit.qz,false);assert.equal(e.audit.zq,false);
 assert.deepEqual(e.buckets,{QZ:[],ZQ:[]});
 const winner=report.selected.find(e=>e.kind==='up-to-two-initial-families');
 assert.equal(e.id,winner.id);assert.deepEqual(e.initialMap,winner.initialMap);assert.deepEqual(e.finalMap,winner.finalMap);
});
