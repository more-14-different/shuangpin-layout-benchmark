import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),triple=require('../tools/search_untoned_cr7e_aeo3'),aeo=require('../tools/search_untoned_cr7e_aeo42'),search=require('../tools/search_untoned_cr7e_v52');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
test('three carriers enumerate every ordered distinct assignment and preserve non-AEO initials',()=>{
 const base={A:'R',E:'F',O:'F',q:'Q',z:'Z'},rows=[...triple.triples(base)];
 assert.equal(rows.length,21*20*19);assert.equal(new Set(rows.map(r=>r.A+r.E+r.O)).size,rows.length);
 assert.ok(rows.every(r=>new Set([r.A,r.E,r.O]).size===3&&r.q==='Q'&&r.z==='Z'));assert.equal(base.O,'F');
});
test('repairing e preserves 21 final keys and finances a third carrier with M42',()=>{
 const {prior,seeds}=triple.inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 for(const seed of seeds){const repairs=triple.repairFinalMaps(seed);assert.equal(repairs.length,27);assert.ok(repairs.some(r=>r.mutation.endsWith('group en/iu')));
  for(const repair of repairs){const initialMap={...seed.initialMap,A:'R',E:'F',O:'C'},entry=search.rebuild({...template,...seed,...repair,initialMap},prior.auditInput),audit=search.audit(entry,prior.auditInput);
   assert.equal(entry.finalMap.e,'E');assert.deepEqual(audit.actual,[21,21]);assert.equal(audit.M,42);assert.equal(audit.valid,true);assert.equal(audit.qz,false);assert.equal(audit.zq,false);assert.ok(aeo.fixedExceptAEO(initialMap,seed.initialMap));}
 }
 const semantics=auxiliarySemantics(template.tone);assert.equal(semantics.toneDigitsByShapeMeaning,'42310');assert.equal(toneKeysFromShapeKeys(semantics.shapeKeysByMeaning),template.tone);
});
test('screening retains all RFF splits and reproducible random coverage within its exact-score budget',()=>{
 const {HEADS,FINALS}=require('../tools/ckt_v4_scheme_fixture'),{mappingKey}=require('../tools/search_untoned_cr7e_coupled');
 const initialMap=Object.fromEntries(HEADS.map(h=>[h,'R'])),finalMap=Object.fromEntries(FINALS.map(f=>[f,'B']));
 const candidates=[...triple.triples(initialMap)].map((im,i)=>({initialMap:im,finalMap,proxy:i%100,miss:(i%71)/71}));
 const first=triple.choose(candidates,12345),repeat=triple.choose(candidates,12345),different=triple.choose(candidates,54321),keys=new Set(first.map(mappingKey));
 assert.equal(first.length,64);assert.equal(keys.size,64);assert.deepEqual(first.map(mappingKey),repeat.map(mappingKey));assert.notDeepEqual(first.map(mappingKey),different.map(mappingKey));
 const anchors=candidates.filter(r=>r.initialMap.A==='R'&&((r.initialMap.E==='F')!==(r.initialMap.O==='F')));assert.equal(anchors.length,38);assert.ok(anchors.every(r=>keys.has(mappingKey(r))));assert.equal(candidates.length,7980);
});
