import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),fair=require('../tools/search_untoned_cr7e_u7e_fair'),drop=require('../tools/search_untoned_cr7e_dropfinal'),search=require('../tools/search_untoned_cr7e_v52');
const {choosePathSeeds}=require('../tools/search_untoned_cr7e_u7e_fair_restored'),{mappingKey}=require('../tools/search_untoned_cr7e_coupled');
test('Q and Z retain independent leaders for both cost axes',()=>{
 const rows=[{id:'z1',forbiddenFinalKey:'Z',score:4,doubledScore:6},{id:'z2',forbiddenFinalKey:'Z',score:5,doubledScore:3},{id:'q1',forbiddenFinalKey:'Q',score:1,doubledScore:1}];
 assert.deepEqual(fair.laneLeaders(rows,'Z').map(r=>r.id),['z1','z2']);assert.deepEqual(fair.laneLeaders(rows,'Q').map(r=>r.id),['q1']);
});
test('a better historical frontier does not exclude an alternative restored center from descent',()=>{
 const original=fair.buildInputs('drop20').seeds[2],baseline={...original,id:'baseline',score:1,doubledScore:1},alternative={...original,id:'alternative',finalMap:{...original.finalMap,iong:'H'},score:2,doubledScore:.5};
 const keys=new Set([mappingKey(baseline)]),picks=choosePathSeeds([alternative,baseline],keys,'score');
 assert.deepEqual(picks.map(p=>[p.kind,p.row.id]),[['best-restored','baseline'],['alternative-center','alternative']]);
 assert.equal(choosePathSeeds([baseline,alternative],keys,'doubledScore')[0].row.id,'alternative');
});
test('original U7E layouts and descended U7E frontiers are all explicit seeds; no U7X initials enter the cache',()=>{
 const {prior,seeds,initialMap,known}=fair.buildInputs('drop20');assert.deepEqual(seeds.map(s=>s.id),['U7E-1f46d74c337f','U7E-3b1557bb9247','U7H-ba54b6e08e04','U7H-15738b341461']);
 assert.ok([...known.values()].every(r=>fair.sameInitials(r.initialMap,initialMap)));
 const inspect=drop.screening(prior.auditInput),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 for(const seed of seeds.slice(0,2))for(const forbidden of ['Q','Z']){let valid=0;
  for(const finalMap of drop.evacuations(seed.finalMap,forbidden)){const e=search.rebuild({...template,...seed,finalMap},prior.auditInput),a=drop.audit(e,prior.auditInput,forbidden);
   assert.equal(Boolean(drop.legal(a)),Boolean(inspect(e,forbidden)));if(drop.legal(a))valid++;}
  assert.equal(valid,forbidden==='Q'?380:19);
 }
});
