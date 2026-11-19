'use strict';
// Replay the selected policy using the canonical contract-preserving scorer.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model');
const {blockErrorMotor}=require('./ckt_block_error');
const {normalize}=require('./search_untoned_cr7e_v52');
const ROOT=path.resolve(__dirname,'..'),prefix=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52');
const verification=JSON.parse(fs.readFileSync(prefix+'-verification.json'));
assert.ok(verification.completed);
const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),results=[];
for(const row of verification.results.filter(r=>r.id.startsWith('U7E-')&&r.optimal1x)){
 assert.deepEqual(row.optimal1x.policy,row.optimal2x.policy);
 const policies=Object.fromEntries(Object.entries(row.optimal1x.policy).map(([mode,key])=>[mode,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,key.split('/')[i]]))]));
 ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
 ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
 const modes=v52.evaluateUntoned({...row,capacity:[21,21]},policies,null,ctx).v52;
 const score=normalize(modes,verification.reference),doubledScore=normalize(modes,verification.reference,2);
 assert.ok(Math.abs(score-row.optimal1x.score)<1e-9);assert.ok(Math.abs(doubledScore-row.optimal2x.score)<1e-9);
 results.push({id:row.id,policies,score,doubledScore,modes});console.log(row.id,score,doubledScore);
 if(global.gc)global.gc();
}
const out={version:'untoned-cr7e-optimal-policy-canonical-replay-1',results,sourceHashes:Object.fromEntries([__filename,prefix+'-verification.json',profile].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))};
fs.writeFileSync(prefix+'-optimal-replay.json',JSON.stringify(out,null,2)+'\n');
