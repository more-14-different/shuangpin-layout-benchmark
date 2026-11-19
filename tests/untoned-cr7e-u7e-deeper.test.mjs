import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{jointDisjoint,componentIds}=require('../tools/search_untoned_cr7e_u7e_deeper');
test('measured disjoint changes compose atomically and reject overlapping tokens',()=>{
 const base={ai:'K',er:'J',eng:'R',vn:'B'},a={...base,ai:'J',er:'K'},b={...base,eng:'B',vn:'R'},before=JSON.stringify(base);
 assert.deepEqual(jointDisjoint(base,a,b),{ai:'J',er:'K',eng:'B',vn:'R'});assert.equal(jointDisjoint(base,a,{...base,er:'R'}),null);
 assert.equal(jointDisjoint(base,base,b),null);assert.equal(JSON.stringify(base),before);
});
test('component beam preserves leaders from both cost axes',()=>{
 const rows=[{id:'one',score:1,doubledScore:3},{id:'two',score:3,doubledScore:1},{id:'other',score:2,doubledScore:2}];
 assert.deepEqual(componentIds(rows,1).map(r=>r.id),['one','two']);assert.equal(rows[0].id,'one');
});
