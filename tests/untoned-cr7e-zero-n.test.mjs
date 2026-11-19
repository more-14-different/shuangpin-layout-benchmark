import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url);
const {nCarrier,legal,mappingKey}=require('../tools/search_untoned_cr7e_zero_n');
const {FINALS}=require('../tools/ckt_v4_scheme_fixture');
test('zero-carrier change is exactly A/E/O R to N and preserves Y/W and consonants',()=>{
 const old={A:'R',E:'R',O:'R',Y:'Y',YU:'Y',W:'W',r:'R',n:'N',zh:'E',ch:'S',sh:'K',s:'C'};
 const next=nCarrier(old);assert.deepEqual(old.A,'R');
 for(const h of Object.keys(old))assert.equal(next[h],'AEO'.includes(h)?'N':old[h]);
 assert.equal(new Set([next.A,next.E,next.O]).size,1);
});
test('zero-carrier experiment retains all memory and double-empty constraints',()=>{
 const a={valid:true,M:41,D:2,V:5,branches:0,qz:false,zq:false};assert.ok(legal(a));
 for(const edit of [{M:43},{D:3},{branches:1},{qz:true},{zq:true},{valid:false}])assert.ok(!legal({...a,...edit}));
});
test('layout deduplication is independent of finalMap property insertion order',()=>{
 const finalMap=Object.fromEntries(FINALS.map((f,i)=>[f,String.fromCharCode(65+i%26)]));
 const reordered=Object.fromEntries(Object.entries(finalMap).reverse());assert.equal(mappingKey({finalMap}),mappingKey({finalMap:reordered}));
});
