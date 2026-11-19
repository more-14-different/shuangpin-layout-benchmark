import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{crossMoves}=require('../tools/search_untoned_cr7e_crosswide');
test('cross-block proposals change exactly one final per block and include new-key combinations',()=>{
 const base={in:'G',ui:'G',iu:'E',v:'T',a:'L'},before=JSON.stringify(base);
 const left=['in','ui'],right=['iu','v'],keys='BEGHKNRT',rows=[...crossMoves(base,left,right,keys)];
 assert.equal(rows.length,196);assert.equal(new Set(rows.map(r=>[r.in,r.ui,r.iu,r.v].join(''))).size,196);
 for(const row of rows){assert.equal(left.filter(f=>row[f]!==base[f]).length,1);assert.equal(right.filter(f=>row[f]!==base[f]).length,1);assert.equal(row.a,'L');}
 assert.ok(rows.some(r=>r.in==='H'&&r.v==='N'));assert.equal(JSON.stringify(base),before);
});
