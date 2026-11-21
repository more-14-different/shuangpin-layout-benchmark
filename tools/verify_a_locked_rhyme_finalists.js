'use strict';
// Verify archived representatives only; this does not resume the search.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const search=require('./search_a_locked_rhymes_v52'),base=require('./search_untoned_t2126_m4_v52');
const v52=require('./score_ckt_v52'),{auxiliarySemantics,toneKeysFromShapeKeys}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-21-a-locked-rhymes-v52-results');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const file=path.join(ROOT,'research/config/a-locked-rhymes-v52-finalists.json'),config=read(file);
 const {c,initials}=search.setup(),data=read(path.join(ROOT,'research/.cache/um40-v52-compact-input.json'));
 const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile);
 const refs=v52.evaluateUntoned(data.entries.find(e=>e.id==='S005'),config.referencePolicies,null,ctx).v52;
 for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4']){
  assert.ok(Math.abs(refs[mode][kind].effectiveMs-config.reference[mode][kind].effectiveMs)<1e-8);
  assert.ok(Math.abs(refs[mode][kind].motorUpperMs-config.reference[mode][kind].motorUpperMs)<1e-8);
 }
 const worker=base.launch();await worker.ready;
 const audit={version:'a-locked-rhyme-finalists-independent-replay-v1',passed:false,representatives:config.entries.length,
  sourceHashes:Object.fromEntries([file,__filename,path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/ckt_v4_model.js'),
    path.join(ROOT,'tools/auxiliary_semantics.js'),profile].map(p=>[path.relative(ROOT,p).replaceAll('\\','/'),hash(p)])),schemes:{}};
 try{
  for(const e of config.entries){
   assert.deepEqual(e.initialMap,initials[e.initials]);assert.equal(search.check(e.initialMap,e.finalMap,c.inputs),true);
   const sem=auxiliarySemantics(e.tone);assert.equal(sem.shapeKeysByMeaning,'AEUIO');assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),e.tone);
   const native=await worker.score(e),js=v52.evaluateUntoned(e,config.policies,config.lengthBalance,ctx).v52;
   let trackMax=0,scoreMax=0;
   for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4']){
    const a=js[mode][kind],b=native.modes[mode][kind];assert.equal(a.count,b.count);
    for(const f of ['motorUpperMs','effectiveMs','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions','meanKeys','totalWeight'])trackMax=Math.max(trackMax,Math.abs(a[f]-b[f]));
   }
   assert.ok(trackMax<1e-8,e.id+' native/full JS mismatch');
   const scores={};
   for(const m of [1,2,3,5]){
    scores[m]=base.normalize(js,refs,m);const delta=Math.abs(scores[m]-e.scores[m]);scoreMax=Math.max(scoreMax,delta);
    assert.ok(delta<1e-9,e.id+' archived score differs');
   }
   audit.schemes[e.id]={scores,maximumTrackDifference:trackMax,maximumArchivedScoreDifference:scoreMax,
     memoryAudit:e.independentMemoryAudit,qzEmpty:e.qzEmpty,zqEmpty:e.zqEmpty,auxiliarySemantics:sem};
   fs.writeFileSync(PREFIX+'-replay.json',JSON.stringify(audit,null,2)+'\n');
   console.log(JSON.stringify({id:e.id,verified:Object.keys(audit.schemes).length,total:config.entries.length,score:scores[1],rssGB:process.memoryUsage().rss/2**30}));
   if(global.gc)global.gc();
  }
  audit.passed=true;fs.writeFileSync(PREFIX+'-replay.json',JSON.stringify(audit,null,2)+'\n');
 }finally{worker.child.stdin.end();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
