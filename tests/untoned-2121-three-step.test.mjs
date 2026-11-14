import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {combine}=require('../tools/probe_untoned_2121_two_step');
const {enumerateNeighborhood,layoutKey}=require('../tools/close_untoned_2121_local');
const base=require('../research/config/untoned-2121-local-closure-finalist.json');
test('O carrier, o relocation and iong relocation form three real primitive steps',()=>{
 const a={...base,initialMap:{...base.initialMap,O:'C'}};
 const b={...base,finalMap:{...base.finalMap,o:'B'}};
 const third={...base,finalMap:{...base.finalMap,iong:'H'}};
 const pair=combine(base,a,b),end=combine(base,pair,third);
 for(const [from,to] of [[base,a],[a,pair],[pair,end]])assert.ok(enumerateNeighborhood(from).some(e=>layoutKey(e)===layoutKey(to)));
 assert.equal(end.initialMap.O,'C');assert.equal(end.finalMap.o,'B');assert.equal(end.finalMap.iong,'H');
 assert.equal(base.finalMap.o,'D');
});
test('third edit cannot silently override the first or second step',()=>{
 const pair={...base,initialMap:{...base.initialMap,O:'C'},finalMap:{...base.finalMap,o:'B'}};
 assert.equal(combine(base,pair,{...base,finalMap:{...base.finalMap,o:'G'}}),null);
});
