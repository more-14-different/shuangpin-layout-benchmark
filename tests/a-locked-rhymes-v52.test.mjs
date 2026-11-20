import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const s=require('../tools/search_a_locked_rhymes_v52');
const base=require('../tools/search_untoned_t2126_m4_v52');
const md=require('../tools/search_untoned_m40d3_v52');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
const {c,a,initials}=s.setup();

test('both allowed initial maps preserve baseline D/V/M and 399 unique, including double-empty anchor',()=>{
 for(const im of Object.values(initials)){
  assert.equal(s.check(im,a.finalMap,c.inputs,true),true);
  const audit=base.audit(im,a.finalMap,c.inputs);
  assert.equal(audit.unique,399);assert.equal(audit.qz,false);assert.equal(audit.zq,false);
  assert.equal(md.memory({initialMap:im,finalMap:a.finalMap}).M,40);
 }
});
test('all one-atom moves and swaps respect fixed keys, groups and independent full audit',()=>{
 for(const im of Object.values(initials)){
  const all=s.neighbors(a.finalMap),seen=new Set();let accepted=0;
  for(const row of all){
   const fm=row.finalMap,k=s.key(fm);assert.equal(seen.has(k),false);seen.add(k);
   assert.deepEqual(s.decode(k),fm);
   if(!s.check(im,fm,c.inputs))continue;
   accepted++;
   assert.equal(base.audit(im,fm,c.inputs).unique,399);
   const m=md.memory({initialMap:im,finalMap:fm});assert.equal(m.M,40);assert.equal(m.D,3);
   assert.equal([...'aeiou'].filter(f=>fm[f]!==f.toUpperCase()).length,1);
   for(const group of s.GROUPS)assert.ok(group.every(f=>fm[f]===fm[group[0]]));
   assert.equal(fm.ei,'E');assert.equal(fm.er,'E');assert.equal(fm.o,'O');assert.equal(fm.uo,'O');
   if(s.check(im,fm,c.inputs,true)){const audit=base.audit(im,fm,c.inputs);assert.equal(audit.qz,false);assert.equal(audit.zq,false);}
  }
  assert.ok(accepted>100);
 }
});
test('native replay matches full JS under unchanged original A policies and auxiliary semantic round trip',()=>{
 const v=JSON.parse(readFileSync('research/notes/2026-11-21-a-locked-rhymes-v52-verification.json','utf8'));
 assert.ok(Math.abs(v.anchorScore-9.086538431214596)<1e-9);
 assert.deepEqual(v.constraints.policies,base.POLICY);
 assert.equal(v.findings.length,2);
 for(const row of v.findings)assert.ok(row.jsNativeMaximumDifference<1e-8);
 const sem=auxiliarySemantics(a.tone);assert.equal(sem.shapeKeysByMeaning,'AEUIO');
 assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),a.tone);assert.equal(sem.toneDigitsByShapeMeaning,'42310');
});
