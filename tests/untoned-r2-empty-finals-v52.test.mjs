import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {matches,repairSeeds,CASES}=require('../tools/search_untoned_r2_v52_empty_finals');

test('empty Q means the final slot only; empty QZ requires both final slots absent',()=>{
 const state=Array.from({length:62},(_,i)=>i<27?i%26:(i-27)%26);
 for(let i=27;i<62;i++)if(state[i]===16)state[i]=0;
 assert.equal(matches(state,CASES[0]),true);
 assert.equal(matches(state,CASES[1]),false);
 assert.ok(state.slice(0,27).includes(16));
 for(let i=27;i<62;i++)if(state[i]===25)state[i]=1;
 assert.equal(matches(state,CASES[0]),false,'exact 25-key comparison excludes an extra empty Z');
 assert.equal(matches(state,CASES[1]),true);
});

test('rhyme repair independently splits shared forbidden keys and leaves all onsets intact',()=>{
 const state=Array.from({length:62},(_,i)=>i<27?i%26:(i-27)%26);
 state[60]=16; // second Q; H is still present at another final slot
 const snapshot=state.slice(),indices=[43,60];
 for(const c of CASES){
  const repaired=repairSeeds(state,c);assert.ok(repaired.length>25);
  assert.equal(new Set(repaired.map(s=>Buffer.from(s).toString('base64'))).size,repaired.length);
  for(const s of repaired){assert.deepEqual(s.slice(0,27),state.slice(0,27));assert.ok(matches(s,c));}
  assert.ok(repaired.some(s=>s[indices[0]]!==s[indices[1]]),'shared Q rhymes can use distinct destinations');
 }
 assert.deepEqual(state,snapshot);
});
