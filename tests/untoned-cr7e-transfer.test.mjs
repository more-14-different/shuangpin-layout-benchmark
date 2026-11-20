import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),transfer=require('../tools/search_untoned_cr7e_transfer'),search=require('../tools/search_untoned_cr7e_v52'),{screening}=require('../tools/search_untoned_cr7e_coupled'),fs=require('node:fs');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
test('production and UM-inspired families stay D2 and explicitly fund the extra zero-initial mapping',()=>{
 const {prior,seeds,prod,um}=transfer.inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},inspect=screening(prior.auditInput,JSON.parse(fs.readFileSync('tools/ckt_v4_upstream_role_tables.json','utf8')));
 for(const family of transfer.families(prod,um))for(const seed of seeds)for(const n of transfer.seedVariants(family,seed)){
  const row={initialMap:family.initialMap,...n},audit=search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput);assert.equal(audit.D,2);assert.ok([41,42].includes(audit.M));assert.equal(audit.valid,true);assert.equal(audit.qz,false);assert.equal(audit.zq,false);assert.ok(transfer.allowed(row,inspect,family));if(family.pinE)assert.equal(n.finalMap.e,'E');
 }
 const sem=auxiliarySemantics(template.tone);assert.equal(sem.toneDigitsByShapeMeaning,'42310');assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),template.tone);
});
test('foreign group starts remove forbidden finals, preserve all 21 keys, and repair both forbidden buckets',()=>{
 const {prior,prod,um}=transfer.inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},inspect=screening(prior.auditInput,JSON.parse(fs.readFileSync('tools/ckt_v4_upstream_role_tables.json','utf8')));
 for(const family of transfer.families(prod,um)){const rng={rng:12345};let accepted=0;for(let i=0;i<100;i++){const finalMap=transfer.foreignMap(family,um.finalMap,rng),row={initialMap:family.initialMap,finalMap};assert.ok(Object.values(finalMap).every(k=>transfer.KEYS.includes(k)));if(!transfer.allowed(row,inspect,family))continue;
  const audit=search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput);assert.equal(audit.D,2);assert.ok([41,42].includes(audit.M));assert.deepEqual(audit.actual,[21,21]);assert.equal(audit.qz,false);assert.equal(audit.zq,false);accepted++;}assert.ok(accepted>10);}
});
