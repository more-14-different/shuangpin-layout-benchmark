import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),drop=require('../tools/search_untoned_cr7e_dropfinal'),search=require('../tools/search_untoned_cr7e_v52');
const {FINALS}=require('../tools/ckt_v4_scheme_fixture');
const {restorations}=require('../tools/search_untoned_cr7e_restored21');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
test('evacuation covers every destination for every removed-key final without touching other finals',()=>{
 const base={ie:'Q',ua:'Q',ao:'Z',in:'G'},rows=[...drop.evacuations(base,'Q')];
 assert.equal(rows.length,400);assert.equal(new Set(rows.map(r=>r.ie+r.ua)).size,400);
 assert.ok(rows.every(r=>r.ie!=='Q'&&r.ua!=='Q'&&r.ao==='Z'&&r.in==='G'));assert.equal(base.ie,'Q');
});
test('20 final keys are explicitly admitted while old strict 21-key audit rejects them; both empty buckets still matter',()=>{
 const prior=JSON.parse(fs.readFileSync(drop.PRIOR)),data=prior.auditInput,previous=JSON.parse(fs.readFileSync(drop.PREVIOUS));
 const template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},seed=previous.baseline.one,inspect=drop.screening(data);
 let valid=0,invalid=0;for(const forbidden of ['Q','Z'])for(const finalMap of drop.evacuations(seed.finalMap,forbidden)){
  const e=search.rebuild({...template,...seed,finalMap},data),a=drop.audit(e,data,forbidden);assert.equal(Boolean(drop.legal(a)),Boolean(inspect(e,forbidden)));
  if(drop.legal(a)){valid++;assert.deepEqual(a.actual,[21,20]);assert.equal(search.audit(e,data).valid,false);assert.equal(e.initialMap.q,'Q');assert.equal(e.initialMap.z,'Z');
   const semantics=auxiliarySemantics(e.tone);assert.equal(semantics.toneKeysByTone,'IVUAO');assert.equal(semantics.shapeKeysByMeaning,'AVUIO');
   assert.equal(semantics.toneDigitsByShapeMeaning,'42310');assert.equal(toneKeysFromShapeKeys(semantics.shapeKeysByMeaning),e.tone);}
  else invalid++;
 }assert.ok(valid>0&&invalid>0);
 const finalMap={...seed.finalMap,ao:'Q'},e=search.rebuild({...template,...seed,finalMap},data),a=drop.audit(e,data,'Z');
 assert.equal(a.qz,false);assert.equal(a.zq,true);assert.equal(drop.legal(a),false);
});
test('coarse and fine mutations retain the forbidden-key restriction without altering the parent',()=>{
 for(const forbidden of ['Q','Z']){const keys=[...drop.KEYS].filter(k=>k!==forbidden),base=Object.fromEntries(FINALS.map((f,i)=>[f,keys[i%keys.length]])),before=JSON.stringify(base),rng={rng:20261123};
  for(let i=0;i<200;i++){const map=drop.mutation(base,rng,forbidden,i%2===0);assert.ok(FINALS.every(f=>keys.includes(map[f])));}
  assert.equal(JSON.stringify(base),before);
 }
});
test('restoring Q preserves learned group changes and repairs a vacated singleton when necessary',()=>{
 const previous=JSON.parse(fs.readFileSync(drop.PREVIOUS)),original=previous.target.finalMap;
 const bridge={...original,iao:'M',ua:'R',ai:'K',van:'K',er:'J',ian:'J'},before=JSON.stringify(bridge),rows=[...restorations(bridge,original,'Q')];
 const full=rows.find(r=>r.finalMap.iao==='Q'&&r.finalMap.ua==='Q'&&r.finalMap.ai==='K'&&r.finalMap.er==='J');
 assert.ok(full);assert.equal(new Set(Object.values(full.finalMap)).size,21);assert.equal(JSON.stringify(bridge),before);
 const narrow={...original,ao:'X',uai:'R'},repairs=[...restorations(narrow,original,'Z')];
 assert.ok(repairs.some(r=>r.finalMap.ao==='Z'&&new Set(Object.values(r.finalMap)).size===21));
});
