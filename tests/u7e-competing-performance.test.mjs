import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),metrics=require('../tools/compare_u7e_competing_performance');
test('code loads and pair denominators retain weight rather than averaging code percentages',()=>{
 const r=metrics.summarizeCodes([{weight:3,code:'QA',rank:1},{weight:1,code:'PPPP',rank:2}]);
 assert.equal(r.meanKeys,2.5);assert.equal(r.meanPairs,1.5);assert.equal(r.rankMass[2],.25);
 const e=metrics.ergonomic(r);assert.equal(e.leftPinky,.6);assert.equal(e.rightPinky,.4);
 assert.equal(e.differentKeySameFinger,.5);assert.equal(e.sameFinger,1);
});
test('word2 and word4 shared pool loses a winner that is first in its intrinsic bucket',()=>{
 const row=(id,kind,weight,code)=>({id,kind,weight,stages:[{pool:'word:four',codes:[code]}]});
 const two=row('two','word2',3,'BCDE'),four=row('four','word4',4,'BCDE');
 assert.equal(metrics.baseBuckets([two]).byKind.word2.nonFirstRate,0);
 const joint=metrics.baseBuckets([two,four]);assert.equal(joint.byKind.word2.nonFirstRate,1);
 assert.equal(joint.byKind.word4.nonFirstRate,0);assert.equal(joint.byKind.word2.crossLengthBuckets,1);
});
test('bijective code relabeling preserves collision partition while split/merge changes it',()=>{
 const rows=['QQ','QQ','ZZ'].map((code,i)=>({id:String(i),kind:'character',weight:i+1,stages:[{pool:'char:base',codes:[code]}]}));
 const base=metrics.baseBuckets(rows);const renamed=rows.map(r=>({...r,stages:[{pool:'char:base',codes:[r.stages[0].codes[0]==='QQ'?'CC':'XX']}]}));
 assert.equal(metrics.baseBuckets(renamed).partitionSha256,base.partitionSha256);
 renamed[1].stages[0].codes=['XX'];assert.notEqual(metrics.baseBuckets(renamed).partitionSha256,base.partitionSha256);
});
