import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const require=createRequire(import.meta.url);
const search=require('../tools/refine_um40_rhymes_v52');
const md=require('../tools/search_untoned_m40d3_v52');
const base=require('../tools/search_untoned_t2126_m4_v52');
const follow=require('../tools/refine_untoned_t2126_m4_v52');
const {FINALS}=require('../tools/ckt_v4_scheme_fixture');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
const prefix='research/notes/2026-11-20-um40-fixed-initial-rhymes';
const report=JSON.parse(readFileSync(prefix+'.json'));
const checked=JSON.parse(readFileSync(prefix+'-verification.json'));
const anchor=report.anchor;
const data={pinyin:checked.commonPinyin,base:checked.commonPinyin.map((_,i)=>[i,1])};

test('紧凑冲突图与Common399完整审计一致',()=>{
 const guard=search.makeGuard(anchor,data),state=search.encode(anchor.finalMap),ops=search.operations();
 assert.equal(guard(state),true);
 assert.deepEqual(search.decode(state),anchor.finalMap);
 for(let i=0;i<ops.length;i++){
  const candidate=search.apply(state,ops[i]);
  assert.equal(guard(candidate),md.guard({...anchor,finalMap:search.decode(candidate)},data));
  const pair=search.apply(candidate,ops[(i*313+17)%ops.length]);
  assert.equal(guard(pair),md.guard({...anchor,finalMap:search.decode(pair)},data));
 }
});

test('允许暂时超M预算或重码的中间态，只检查最终端点',()=>{
 const guard=search.makeGuard(anchor,data),state=search.encode(anchor.finalMap);
 const op={kind:'token-swap',a:FINALS.indexOf('a'),b:FINALS.indexOf('e')};
 const intermediate=search.apply(state,op);assert.equal(guard(intermediate),false);
 assert.equal(guard(search.apply(intermediate,op)),true);
 const stage=report.stages.find(s=>s.kind==='exact-boundary-endpoints');
 assert.ok(stage.invalidFirstStates>0&&stage.uniqueLegalEndpoints>0);
});

test('全部归档状态的声母固定，M≤40、D=3、399无重',()=>{
 const rows=gunzipSync(readFileSync(prefix+'-scores.jsonl.gz')).toString().trim().split('\n').map(JSON.parse);
 assert.equal(new Set(rows.map(r=>r.state)).size,rows.length);
 assert.equal(report.scoreCounts.total,rows.length);
 assert.equal(report.scoreCounts.imported+report.scoreCounts.newFullDictionary,rows.length);
 const independent=JSON.parse(readFileSync(prefix+'-memory-verification.json'));
 assert.equal(independent.passed,true);assert.equal(independent.verifiedStates,rows.length);
 for(const row of rows){
  const e=follow.expand(row.state);assert.deepEqual(e.initialMap,anchor.initialMap);
  assert.equal(md.guard(e,data),true,row.id);assert.deepEqual(md.memory(e),row.memory);
 }
});

test('两点评分归一一致，最坏相对改善目标不会选择比锚点更差的方案',()=>{
 const refs=JSON.parse(readFileSync('research/notes/2026-11-18-ckt-v52-all-schemes.json')).references.v52;
 assert.ok(Math.abs(base.normalize(checked.modes,refs)-checked.score)<1e-9);
 assert.ok(Math.abs(base.normalize(checked.modes,refs,2)-checked.doubledScore)<1e-9);
 assert.ok(Math.max(checked.score/anchor.cktV52.defaultScore,checked.doubledScore/anchor.cktV52.doubledCognitiveScore)<=1+1e-12);
 assert.ok(checked.maximumTrackDifference<1e-7);
 for(const row of report.strictImprovements){assert.ok(row.score<anchor.cktV52.defaultScore);assert.ok(row.doubledScore<anchor.cktV52.doubledCognitiveScore);}
});

test('形调辅语义往返及导出布局保持一致',()=>{
 const exported=JSON.parse(readFileSync('research/config/um40-fixed-initial-rhymes-finalist.json'));
 assert.deepEqual(exported.initialMap,anchor.initialMap);
 assert.equal(exported.tone,exported.toneKeysByTone);
 assert.equal(toneKeysFromShapeKeys(exported.shapeKeysByMeaning),exported.tone);
 assert.deepEqual(auxiliarySemantics(exported.tone),checked.semantics);
 assert.equal(exported.toneDigitsByShapeMeaning,'42310');
 if(report.strictImprovements.length===0){
  assert.equal(report.resultStatus,'no-strict-two-endpoint-improvement-found');
  assert.equal(exported.status,'anchor-retained');assert.equal(exported.id,anchor.id);
  assert.deepEqual(exported.changesFromParent,[]);
 }
});
