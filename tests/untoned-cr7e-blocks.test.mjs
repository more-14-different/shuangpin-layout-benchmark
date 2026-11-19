import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{assignments}=require('../tools/search_untoned_cr7e_blocks');
test('block enumeration includes merges, splits, and distant joint changes without changing the backbone',()=>{
 const base={in:'G',ui:'G',un:'B',ve:'K',vn:'B',a:'L'},before=JSON.stringify(base);
 const rows=[...assignments(base,['in','ui','un','ve','vn'],'BEGKRT')];
 assert.equal(rows.length,7776);assert.equal(new Set(rows.map(r=>['in','ui','un','ve','vn'].map(f=>r[f]).join(''))).size,7776);
 assert.ok(rows.some(r=>r.in==='B'&&r.ui==='B'&&r.un==='G'&&r.ve==='G'&&r.vn==='K'));
 assert.ok(rows.some(r=>['in','ui','un','ve','vn'].every(f=>r[f]==='R')));
 for(const r of rows)assert.equal(r.a,'L');assert.equal(JSON.stringify(base),before);
 assert.notEqual(rows[0],rows[1]);
});
