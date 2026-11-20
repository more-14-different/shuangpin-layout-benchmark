import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),aeo=require('../tools/search_untoned_cr7e_aeo42'),search=require('../tools/search_untoned_cr7e_v52'),{auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
test('AEO enumeration includes every shared key and two-carrier partition without changing other initials',()=>{
 const base={A:'R',E:'R',O:'R',q:'Q',z:'Z',n:'N'},rows=[...aeo.carriers(base)];const expected=21+3*21*20;
 assert.equal(rows.length,expected);assert.equal(new Set(rows.map(r=>r.A+r.E+r.O)).size,expected);
 assert.ok(rows.some(r=>r.A==='N'&&r.E==='N'&&r.O==='N'));assert.ok(rows.some(r=>r.A==='R'&&r.E==='N'&&r.O==='N'));
 assert.ok(rows.some(r=>r.A==='R'&&r.E==='C'&&r.O==='C'));assert.ok(rows.some(r=>r.A==='C'&&r.E==='C'&&r.O==='R'));assert.ok(rows.some(r=>r.A==='C'&&r.E==='R'&&r.O==='C'));
 assert.ok(rows.every(r=>r.q==='Q'&&r.z==='Z'&&r.n==='N'&&new Set([r.A,r.E,r.O]).size<=2));assert.equal(base.A,'R');
});
test('shared migration costs no extra M, splitting into two carriers costs exactly one; semantics round trip remains intact',()=>{
 const {prior,known}=aeo.inputs(),seed=[...known.values()].find(r=>r.id==='U7R-ba54b6e08e04');assert.ok(seed);
 const template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},material=im=>search.rebuild({...template,...seed,initialMap:im},prior.auditInput),a=search.audit(material(seed.initialMap),prior.auditInput);
 const moved=search.audit(material({...seed.initialMap,A:'N',E:'N',O:'N'}),prior.auditInput),split=search.audit(material({...seed.initialMap,A:'R',E:'N',O:'N'}),prior.auditInput);
 assert.equal(a.M,41);assert.equal(moved.M,41);assert.equal(split.M,42);assert.deepEqual(split.actual,[21,21]);assert.ok(aeo.fixedExceptAEO({...seed.initialMap,A:'N'},seed.initialMap));assert.equal(aeo.fixedExceptAEO({...seed.initialMap,n:'R'},seed.initialMap),false);
 const semantics=auxiliarySemantics(template.tone);assert.equal(semantics.toneKeysByTone,'IVUAO');assert.equal(semantics.shapeKeysByMeaning,'AVUIO');assert.equal(semantics.toneDigitsByShapeMeaning,'42310');assert.equal(toneKeysFromShapeKeys(semantics.shapeKeysByMeaning),template.tone);
});
test('a joint final repair can fund three distinct AEO carriers within M42 without changing non-AEO initials',()=>{
 const {prior,known}=aeo.inputs(),seed=[...known.values()].find(r=>r.id==='U7R-ba54b6e08e04'),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const initialMap={...seed.initialMap,A:'R',E:'N',O:'C'},naive=search.rebuild({...template,...seed,initialMap},prior.auditInput);
 assert.equal(search.audit(naive,prior.auditInput).M,43);
 const finalMap={...seed.finalMap,e:seed.finalMap.en,en:seed.finalMap.e},repaired=search.rebuild({...naive,finalMap},prior.auditInput),audit=search.audit(repaired,prior.auditInput);
 assert.equal(audit.M,42);assert.equal(audit.valid,true);assert.equal(audit.qz,false);assert.equal(audit.zq,false);assert.deepEqual(audit.actual,[21,21]);
 assert.ok(aeo.fixedExceptAEO(initialMap,seed.initialMap));
});
