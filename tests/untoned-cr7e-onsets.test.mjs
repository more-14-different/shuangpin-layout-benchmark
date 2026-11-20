import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),onsets=require('../tools/search_untoned_cr7e_onsets'),search=require('../tools/search_untoned_cr7e_v52');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
test('the D budget is reassigned atomically: b/n replaces the old k/s displacements',()=>{
 const {prior,seeds}=onsets.inputs(),seed=seeds[0],template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},rows=onsets.ordinaryAllocations(seed.initialMap);
 assert.equal(rows.length,154);assert.equal(new Set(rows.map(r=>JSON.stringify(r.initialMap))).size,154);
 const swap=rows.find(onsets.isBN);assert.ok(swap);assert.equal(swap.initialMap.k,'K');assert.equal(swap.initialMap.s,'S');assert.equal(seed.initialMap.k,'P');assert.equal(seed.initialMap.s,'C');
 const audit=search.audit(search.rebuild({...template,...seed,...swap},prior.auditInput),prior.auditInput);assert.equal(audit.D,2);assert.equal(audit.M,41);assert.deepEqual(audit.actual,[21,21]);assert.equal(audit.qz,false);assert.equal(audit.zq,false);
 const naive={...seed.initialMap,b:'N',n:'B'},bad=search.audit(search.rebuild({...template,...seed,initialMap:naive},prior.auditInput),prior.auditInput);assert.equal(bad.D,4);
 const sem=auxiliarySemantics(template.tone);assert.equal(sem.toneDigitsByShapeMeaning,'42310');assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),template.tone);
});
test('restoring U7X ordinary initials needs an E-key carrier repair to retain 21 actual first keys',()=>{
 const {prior,seeds}=onsets.inputs(),seed=seeds.find(r=>r.id==='U7R-143cf16e1fa2'),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},initialMap=onsets.ordinaryAllocations(seed.initialMap).find(onsets.isBN).initialMap;
 const audit=im=>search.audit(search.rebuild({...template,...seed,initialMap:im},prior.auditInput),prior.auditInput);assert.deepEqual(audit(initialMap).actual,[20,21]);
 const repaired=onsets.retroRepairs(initialMap);assert.equal(repaired.length,3);assert.ok(repaired.every(im=>audit(im).valid&&audit(im).D===2&&audit(im).M===42));
 const variants=onsets.bnRetroflexVariants(seed.initialMap);assert.equal(variants.length,18);assert.equal(new Set(variants.map(im=>[im.zh,im.ch,im.sh].join(''))).size,18);assert.ok(variants.every(im=>audit(im).valid&&onsets.isBN({initialMap:im})));
});
