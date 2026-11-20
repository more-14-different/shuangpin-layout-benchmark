import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),home=require('../tools/search_untoned_cr7e_onsets_home'),search=require('../tools/search_untoned_cr7e_v52');
test('directional home-row proposals keep D exactly two and explicitly fund zero-initial moves',()=>{
 const {prior,seeds}=home.inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 for(const seed of [seeds[0],seeds[3]]){const rows=home.homeAllocations(seed.initialMap);assert.equal(rows.length,17);assert.equal(home.homeRetros(seed.initialMap).length,168);
  for(const r of rows){const initialMap={...r.initialMap,zh:'E',ch:'S',sh:'K'},e=search.rebuild({...template,...seed,initialMap},prior.auditInput),a=search.audit(e,prior.auditInput);assert.equal(a.valid,true);assert.equal(a.D,2);assert.ok([41,42].includes(a.M));assert.equal(a.qz,false);assert.equal(a.zq,false);assert.equal(initialMap.YU,initialMap.Y);
   if(r.mutation.includes('home Y')||r.mutation.includes('home W')){assert.equal(a.M,42);assert.equal(initialMap.A,initialMap.E);assert.equal(initialMap.E,initialMap.O);}
  }
 }
});
