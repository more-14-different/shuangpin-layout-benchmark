import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const input=require('../research/config/untoned-r2-restore399-v52-input.json');
const constructions=require('../research/notes/2026-11-20-untoned-r2-399-rhyme-constructions.json');
const {rebuild,audit}=require('../tools/untoned_r2_search_metrics');
const {changes}=require('../tools/search_untoned_r2_restored399_v52');
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
