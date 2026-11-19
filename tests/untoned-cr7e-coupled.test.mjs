import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const coupled=require('../tools/search_untoned_cr7e_coupled');
const search=require('../tools/search_untoned_cr7e_v52');
const extension=require('../tools/extend_untoned_cr7e_coupled');
const verified=JSON.parse(fs.readFileSync(new URL('../research/notes/2026-11-19-untoned-cr7e-v52-verification.json',import.meta.url)));
const seed={...verified.results.find(r=>r.id==='U7E-1f46d74c337f'),capacity:[21,21]};
const snapshot=JSON.parse(fs.readFileSync(new URL('../tools/ckt_v4_upstream_role_tables.json',import.meta.url)));
test('full mapping dedup distinguishes onset perturbations with identical finals',()=>{
 assert.notEqual(coupled.mappingKey(seed),coupled.mappingKey({...seed,initialMap:{...seed.initialMap,s:'S'}}));
});
test('initial perturbations preserve the Y/YU route and source map',()=>{
 const before=JSON.stringify(seed),neighbors=coupled.initialNeighbors(seed);
 assert.ok(neighbors.length>900);
 for(const r of neighbors){assert.equal(r.initialMap.Y,r.initialMap.YU);assert.deepEqual(r.finalMap,seed.finalMap);}
 assert.equal(JSON.stringify(seed),before);
});
test('fast screening agrees with canonical 399-syllable audit on onset and final mutations',()=>{
 const inspect=coupled.screening(verified.auditInput,snapshot);
 const rows=[...coupled.initialNeighbors(seed),...search.neighbors(seed).map(r=>({...r,initialMap:seed.initialMap}))];
 let accepted=0;
 for(const row of rows){
  const entry=search.rebuild({...seed,...row},verified.auditInput),audit=search.audit(entry,verified.auditInput),fast=inspect(row,true);
  assert.equal(Boolean(fast),coupled.legal(audit),row.mutation);
  if(fast){accepted++;assert.equal(fast.M,audit.M);assert.equal(fast.D,audit.D);assert.equal(fast.V,audit.V);assert.ok(Number.isFinite(fast.proxy)&&Number.isFinite(fast.miss));}
 }
 assert.ok(accepted>1100);
});
test('axis merge rejects conflicts and preserves compatible independent initial changes',()=>{
 const base={p:'P',k:'P',sh:'K',O:'R'};
 assert.deepEqual(extension.mergeChanges(base,{...base,k:'K',p:'K',sh:'P'},{...base,O:'Q'}),{p:'K',k:'K',sh:'P',O:'Q'});
 assert.equal(extension.mergeChanges(base,{...base,O:'Q'},{...base,O:'F'}),null);
});
test('measured axis shortlist retains leaders of both cost settings',()=>{
 const rows=[{...seed,id:'one',score:1,doubledScore:3},{...seed,id:'two',initialMap:{...seed.initialMap,O:'Q'},score:3,doubledScore:1}];
 assert.deepEqual(extension.topBoth(rows,1).map(r=>r.id),['one','two']);
});
test('split zero carriers and a different pair of displaced ordinary initials keep the same memory contract',()=>{
 const inspect=coupled.screening(verified.auditInput,snapshot);
 const entry=search.rebuild({...seed,initialMap:{...seed.initialMap,p:'C',k:'K',sh:'P',s:'K',O:'Q'}},verified.auditInput);
 const audit=search.audit(entry,verified.auditInput),fast=inspect(entry);
 assert.ok(coupled.legal(audit));assert.equal(fast.M,42);assert.equal(fast.M,audit.M);assert.equal(fast.D,2);
 const tooMany=search.rebuild({...entry,initialMap:{...entry.initialMap,l:'E'}},verified.auditInput);
 assert.equal(coupled.legal(search.audit(tooMany,verified.auditInput)),false);assert.equal(inspect(tooMany),null);
});
