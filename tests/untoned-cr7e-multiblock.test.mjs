import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),m=require('../tools/anneal_untoned_cr7e_multiblock'),{FINALS}=require('../tools/ckt_v4_scheme_fixture');
test('measured block crossover carries multiple changes from both parents and preserves the backbone',()=>{
 const base={in:'G',ui:'G',iu:'E',v:'T',a:'L'},a={...base,in:'B',ui:'K',a:'X'},b={...base,iu:'R',v:'B',a:'Y'};
 assert.deepEqual(m.combineBlocks(base,a,b,['in','ui'],['iu','v']),{in:'B',ui:'K',iu:'R',v:'B',a:'L'});assert.equal(base.a,'L');
});
test('multi-final jumps always change at least two finals per block without changing fixed outside finals',()=>{
 const base=Object.fromEntries(FINALS.map((f,i)=>[f,m.KEYS[i%m.KEYS.length]])),before=JSON.stringify(base),rng={rng:20261120};
 for(let i=0;i<200;i++){const r=m.multiMove(base,rng);assert.ok(m.distance(r,base,m.LEFT)>=2);assert.ok(m.distance(r,base,m.RIGHT)>=2);
  for(const f of FINALS.filter(f=>!m.VARIABLE.includes(f)))assert.equal(r[f],base[f]);}
 assert.equal(JSON.stringify(base),before);assert.equal(m.schedule(7).phase,'fixed-backbone');assert.equal(m.schedule(8).phase,'released-backbone');
});
test('component beams only retain compatible backbones with genuinely multi-final changes',()=>{
 const base=Object.fromEntries(FINALS.map(f=>[f,'B'])),mk=(id,changes,score)=>({id,finalMap:{...base,...changes},score,doubledScore:score});
 const rows=[mk('one',{in:'G'},1),mk('outside',{in:'G',ui:'G',a:'H'},0),mk('two',{in:'G',ui:'K'},3),mk('other',{in:'K',ui:'G'},4)];
 assert.deepEqual(m.componentBeam(rows,{finalMap:base},['in','ui'],1).map(r=>r.id),['two']);
});
