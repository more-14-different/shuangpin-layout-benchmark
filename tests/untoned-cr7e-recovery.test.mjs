import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),recovery=require('../tools/anneal_untoned_cr7e_recovery');
const {FINALS}=require('../tools/ckt_v4_scheme_fixture');
const far=JSON.parse(fs.readFileSync(new URL('../research/notes/2026-11-20-untoned-cr7e-far-v52.json',import.meta.url)));
test('recovery runs ten greedy rounds before twenty monotone fine-cooling rounds',()=>{
 for(let round=0;round<10;round++)assert.deepEqual(recovery.schedule(round),{phase:'recovery',temperature:0});
 assert.equal(recovery.schedule(10).temperature,.018);
 for(let round=11;round<30;round++)assert.ok(recovery.schedule(round).temperature<recovery.schedule(round-1).temperature);
 assert.ok(Math.abs(recovery.schedule(29).temperature-.0002)<1e-12);
});
test('partition crossover preserves parent inputs and chooses whole donor groups reproducibly',()=>{
 const a=far.bestDefault[0].finalMap,b=far.bestDoubled[0].finalMap,before=JSON.stringify([a,b]);
 const first=recovery.partitionCrossover(a,b,{rng:123456}),second=recovery.partitionCrossover(a,b,{rng:123456});
 assert.deepEqual(first,second);assert.equal(JSON.stringify([a,b]),before);assert.deepEqual(Object.keys(first),FINALS);
 for(const f of FINALS)assert.ok(first[f]===a[f]||first[f]===b[f]);
 assert.equal(recovery.distance(a,a),0);assert.equal(recovery.distance(a,b),recovery.distance(b,a));
});
