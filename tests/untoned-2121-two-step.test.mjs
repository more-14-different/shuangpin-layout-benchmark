import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {combine}=require('../tools/probe_untoned_2121_two_step');
const {enumerateNeighborhood,layoutKey}=require('../tools/close_untoned_2121_local');
const base=require('../research/config/untoned-2121-local-closure-finalist.json');
test('disjoint sound and rhyme changes form an actual two-hop path and preserve inputs',()=>{
 const before=JSON.stringify(base),a={...base,initialMap:{...base.initialMap,O:'C'}},b={...base,finalMap:{...base.finalMap,iong:'H'}};
 const c=combine(base,a,b);
 assert.equal(c.initialMap.O,'C');assert.equal(c.finalMap.iong,'H');assert.equal(JSON.stringify(base),before);
 assert.ok(enumerateNeighborhood(base).some(e=>layoutKey(e)===layoutKey(a)));
 assert.ok(enumerateNeighborhood(a).some(e=>layoutKey(e)===layoutKey(c)));
});
test('conflicting token edits cannot masquerade as two independent changes',()=>{
 const a={...base,finalMap:{...base.finalMap,iong:'H'}},b={...base,finalMap:{...base.finalMap,iong:'M'}};
 assert.equal(combine(base,a,b),null);
});
