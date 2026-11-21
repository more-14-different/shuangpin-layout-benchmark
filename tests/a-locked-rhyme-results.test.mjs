import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,createReadStream,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createGunzip,gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const search=require('../tools/search_a_locked_rhymes_v52');
const base=require('../tools/search_untoned_t2126_m4_v52');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const prefix='research/notes/2026-11-21-a-locked-rhymes-v52-results';
const result=read(prefix+'.json'),config=read('research/config/a-locked-rhymes-v52-finalists.json');

test('stopped run has complete counts, half double-empty allocation and preserved reviews',()=>{
 assert.equal(result.status,'stopped-by-request');assert.equal(result.exactEvaluations,43088);
 assert.equal(Object.values(result.lanes).reduce((n,l)=>n+l.evaluations,0),43088);
 const all=Object.values(result.lanes).reduce((n,l)=>n+l.seconds,0);
 const empty=Object.entries(result.lanes).filter(([name])=>name.endsWith('double-empty')).reduce((n,[,l])=>n+l.seconds,0);
 assert.ok(Math.abs(empty/all-result.doubleEmptyExactTimeShare)<1e-12);
 assert.ok(Math.abs(empty/all-.5)<.0001);
 assert.equal(result.reviews.filter(r=>r.slot.startsWith('hour-')).length,5);
 assert.equal(result.reviewSchedule.status,'stopped-by-user');
 assert.equal(result.allRowConstraintAuditPassed,true);assert.ok(result.allRowScoreMaximumDifference<1e-9);
});
test('archived representatives preserve both allowed initial maps, semantic round trips and independent memory audit',()=>{
 const {c,initials}=search.setup();assert.equal(config.entries.length,result.representativeCount);
 for(const e of config.entries){
  assert.deepEqual(e.initialMap,initials[e.initials]);assert.equal(search.check(e.initialMap,e.finalMap,c.inputs),true);
  const audit=base.audit(e.initialMap,e.finalMap,c.inputs);
  assert.equal(audit.unique,399);assert.equal(!audit.qz,e.qzEmpty);assert.equal(!audit.zq,e.zqEmpty);
  assert.equal(e.independentMemoryAudit.M,40);assert.equal(e.independentMemoryAudit.ordinaryDisplacedCount,3);
  assert.equal(e.independentMemoryAudit.branchCount,0);
  const sem=auxiliarySemantics(e.tone);assert.equal(sem.shapeKeysByMeaning,'AEUIO');
  assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),e.tone);assert.equal(sem.toneDigitsByShapeMeaning,'42310');
 }
});
test('archived best and Pareto sets retain actual score tradeoffs',()=>{
 for(const [name,lane]of Object.entries(result.lanes)){
  const best=config.entries.find(e=>e.id===lane.best.id);assert.ok(best);assert.deepEqual(best.scores,lane.best.scores);
  if(name.endsWith('double-empty'))assert.ok(best.qzEmpty&&best.zqEmpty);
  for(const row of lane.pareto)assert.ok(config.entries.some(e=>e.id===row.id));
  for(const a of lane.pareto)for(const b of lane.pareto)if(a!==b){
   const axes=['1','2','3','5'];const dominates=axes.every(k=>a.scores[k]<=b.scores[k]+1e-12)&&axes.some(k=>a.scores[k]<b.scores[k]-1e-12);
   assert.equal(dominates,false);
  }
 }
 const best=result.lanes['A-regular'].best;
 assert.ok(best.scores['1']<result.baseline.scores['1']);
 for(const k of ['2','3','5'])assert.ok(best.scores[k]>result.baseline.scores[k]);
});
test('retained archives are intact and distinguish historical evaluations from retained records',async()=>{
 for(const [file,record]of Object.entries(result.archives)){
  const compressedHash=createHash('sha256');for await(const chunk of createReadStream(file))compressedHash.update(chunk);
  assert.equal(compressedHash.digest('hex'),record.sha256,file);
  const originalHash=createHash('sha256');let lines=0;
  for await(const chunk of createReadStream(file).pipe(createGunzip())){
   originalHash.update(chunk);
   if(file.endsWith('-scores.jsonl.gz'))for(const byte of chunk)if(byte===10)lines++;
  }
  assert.equal(originalHash.digest('hex'),record.uncompressedSha256,file);
  if(file.endsWith('-scores.jsonl.gz'))assert.equal(lines,result.retention?.retainedRecords??result.exactEvaluations);
 }
});
test('compaction keeps every selected layout and drops the original resumable journal',()=>{
 if(!result.retention)return;
 assert.equal(result.retention.mode,'final-pareto-representatives-only');
 assert.equal(result.retention.retainedRecords,config.entries.length);
 assert.equal(result.retention.retainedRecords+result.retention.discardedRecords,result.exactEvaluations);
 assert.equal(result.retention.resumeOriginalTrajectoryAvailable,false);
 assert.equal(result.retention.historicalAllRowAuditPreserved,true);
 assert.ok(!Object.keys(result.archives).some(p=>p.endsWith('-checkpoint.json.gz')));
 const rows=gunzipSync(readFileSync(prefix+'-scores.jsonl.gz')).toString('utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(rows.map(r=>r.id).sort(),config.entries.map(e=>e.id).sort());
 for(const row of rows){const e=config.entries.find(e=>e.id===row.id);assert.equal(row.state,e.state);assert.deepEqual(row.scores,e.scores);}
 for(const file of ['scores.jsonl','checkpoint.json','checkpoint-before-hourly-review.json'])assert.equal(existsSync('research/.cache/a-locked-rhymes-v52-6h-20261121/'+file),false,file);
});
test('all final representatives passed independent full JS versus native v5.2 replay',()=>{
 const replay=read(prefix+'-replay.json');assert.equal(replay.passed,true);
 assert.equal(replay.representatives,config.entries.length);assert.equal(Object.keys(replay.schemes).length,config.entries.length);
 assert.equal(result.nativeReplay.passed,true);
 for(const [file,expected]of Object.entries(replay.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),expected,file);
 for(const e of config.entries){const r=replay.schemes[e.id];assert.ok(r.maximumTrackDifference<1e-8);assert.ok(r.maximumArchivedScoreDifference<1e-9);}
});
