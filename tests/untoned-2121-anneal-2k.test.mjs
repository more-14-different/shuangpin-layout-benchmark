import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {schedule,random,proposal,dominates,archiveInsert}=require('../tools/anneal_untoned_2121_multicenter_2k');
const seed=require('../research/config/untoned-2121-local-closure-finalist.json');
const {replayMoves}=require('../tools/verify_untoned_2121_anneal_2k');
test('400 scored steps provide four 30-coarse/70-fine cycles per center',()=>{
 const phases=Array.from({length:400},(_,i)=>schedule(i));
 assert.equal(phases.filter(p=>p.phase==='coarse').length,120);
 assert.equal(phases.filter(p=>p.phase==='fine').length,280);
 assert.equal(phases.at(-1).cycle,3);
 assert.ok(phases.every(p=>p.temperature>0));
});
test('RNG and proposal generation resume exactly and do not mutate the seed',()=>{
 const a={rng:15},b={rng:15},before=JSON.stringify(seed);
 for(let i=0;i<10;i++)assert.equal(random(a),random(b));
 assert.deepEqual(proposal(seed,a,true),proposal(seed,b,true));
 assert.equal(JSON.stringify(seed),before);
});
test('archive preserves comfort tradeoffs and removes dominated layouts',()=>{
 const a={id:'a',score:9,erg:{mx:130,homeS2:.5,homeFloor:.3,rpMax:.05}};
 const b={...a,id:'b',score:8.9},c={...a,id:'c',score:9.1,erg:{...a.erg,mx:140}};
 assert.ok(dominates(b,a));assert.ok(!dominates(b,c));
 assert.deepEqual(archiveInsert([a],b).map(e=>e.id),['b']);
 assert.equal(archiveInsert([b],c).length,2);
});
test('independent transcript replay matches random coarse and fine proposals',()=>{
 const chain={rng:151115};
 for(let i=0;i<100;i++){
  const p=proposal(seed,chain,i%2===0);if(!p)continue;
  const e=replayMoves(seed,p.moves);assert.deepEqual(e.initialMap,p.row.initialMap);assert.deepEqual(e.finalMap,p.row.finalMap);
 }
});
