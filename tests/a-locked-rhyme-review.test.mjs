import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const search=require('../tools/search_a_locked_rhymes_v52');
const review=require('../tools/a_locked_rhyme_review');
const {a,c,initials}=search.setup();
const report={lanes:review.LANES.map(name=>({name,best:{id:'anchor-'+name,state:search.key(a.finalMap)},top:[]}))};
const setting=lane=>({lane,explorationProbability:.3,temperature:.001,minSteps:2,maxSteps:6,seedPool:12});
test('bounded strategy changes cannot introduce new lanes or relax allocation',()=>{
 const result=review.applyReview({summary:'test',strategies:review.LANES.map(setting),transfers:[]},report);
 assert.equal(result.strategies.length,4);assert.equal(result.preserveHalfDoubleEmptyBudget,true);
 assert.throws(()=>review.settings({...setting('A-regular'),temperature:9}));
 assert.throws(()=>review.settings({...setting('A-regular'),lane:'another-map'}));
 assert.throws(()=>review.settings({...setting('A-regular'),maxSteps:1}));
});
test('cross-initial transfers receive full independent target constraint audit',()=>{
 const command={summary:'transfer',strategies:[],transfers:[{sourceLane:'A-regular',sourceId:'anchor-A-regular',targetLane:'UM40-double-empty',repairOneStep:false}]};
 const result=review.applyReview(command,report);assert.equal(result.proposals.length,1);
 for(const p of result.proposals)assert.equal(search.check(initials.UM40,search.decode(p.state),c.inputs,true),true);
 assert.throws(()=>review.applyReview({...command,transfers:[{...command.transfers[0],sourceId:'fabricated'}]},report));
});
test('regular-to-double-empty transfer is rejected or repaired without changing groups or memory',()=>{
 const nonempty=search.neighbors(a.finalMap).find(r=>search.check(initials.A,r.finalMap,c.inputs)&&!search.check(initials.A,r.finalMap,c.inputs,true));assert.ok(nonempty);
 const altered=structuredClone(report);altered.lanes[0].best={id:'nonempty',state:search.key(nonempty.finalMap)};
 const t={sourceLane:'A-regular',sourceId:'nonempty',targetLane:'UM40-double-empty',repairOneStep:false};
 const raw=review.applyReview({summary:'reject',strategies:[],transfers:[t]},altered);assert.equal(raw.proposals.length,0);
 const fixed=review.applyReview({summary:'repair',strategies:[],transfers:[{...t,repairOneStep:true}]},altered);
 assert.ok(fixed.proposals.length>0);
 for(const p of fixed.proposals)assert.equal(search.check(initials.UM40,search.decode(p.state),c.inputs,true),true);
});
