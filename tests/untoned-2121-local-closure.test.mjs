import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {enumerateNeighborhood,layoutKey,validateCheckpoint}=require('../tools/close_untoned_2121_local');
const seed=require('../research/config/untoned-2121-local-closure-seed.json');
const {HEADS,FINALS}=require('../tools/ckt_v4_scheme_fixture');
test('declared primitive neighborhood covers every single move and token transposition',()=>{
 const rows=enumerateNeighborhood(seed),keys=new Set(rows.map(layoutKey));
 assert.equal(keys.size,rows.length);assert.ok(!keys.has(layoutKey(seed)));
 for(const [field,tokens] of [['initialMap',HEADS],['finalMap',FINALS]]){
  for(const token of tokens)for(const key of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){
   if(seed[field][token]===key)continue;
   assert.ok(keys.has(layoutKey({...seed,[field]:{...seed[field],[token]:key}})),`${field}:${token}->${key}`);
  }
  for(let i=0;i<tokens.length;i++)for(let j=i+1;j<tokens.length;j++){
   const a=tokens[i],b=tokens[j];if(seed[field][a]===seed[field][b])continue;
   assert.ok(keys.has(layoutKey({...seed,[field]:{...seed[field],[a]:seed[field][b],[b]:seed[field][a]}})));
  }
 }
});
test('resume rejects changed score contracts',()=>{
 assert.throws(()=>validateCheckpoint({version:1,fingerprint:'old'},'new'));
 assert.doesNotThrow(()=>validateCheckpoint({version:1,fingerprint:'same'},'same'));
});
test('same-key groups cover every whole-group move and transposition',()=>{
 const keys=new Set(enumerateNeighborhood(seed).map(layoutKey));
 for(const [field,tokens] of [['initialMap',HEADS],['finalMap',FINALS]]){
  const groups=Object.entries(Object.groupBy(tokens,t=>seed[field][t]));
  for(const [from,group] of groups){
   if(group.length<2)continue;
   for(const to of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){
    if(from===to)continue;
    const map={...seed[field]};group.forEach(t=>map[t]=to);
    assert.ok(keys.has(layoutKey({...seed,[field]:map})),`${field} group ${from}->${to}`);
   }
  }
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
   const [a,as]=groups[i],[b,bs]=groups[j],map={...seed[field]};
   as.forEach(t=>map[t]=b);bs.forEach(t=>map[t]=a);
   assert.ok(keys.has(layoutKey({...seed,[field]:map})));
  }
 }
});
