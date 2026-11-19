'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {normalize}=require('./search_untoned_cr7e_v52');
const ROOT=path.resolve(__dirname,'..'),prefix=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52');
const file=prefix+'-verification.json',out=JSON.parse(fs.readFileSync(file));
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const id of ['OC21-e1f155973380','U7E-1f46d74c337f','U7E-3b1557bb9247']){
 const input=prefix+'-policy-'+id+'.json',job=JSON.parse(fs.readFileSync(input));
 const row=out.results.find(r=>r.id===id);assert.deepEqual(row.initialMap,job.initialMap);assert.deepEqual(row.finalMap,job.finalMap);
 const expected=crypto.createHash('sha256').update(JSON.stringify([row.id,row.initialMap,row.finalMap,row.modes,out.reference])).digest('hex');
 assert.equal(expected,job.nativeInputFingerprint);
 row.optimal1x=job.optimal1x;row.optimal2x=job.optimal2x;
 (out.policyJobHashes??={})[path.relative(ROOT,input).replaceAll('\\','/')]=digest(input);
}
for(const row of out.results){
 assert.ok(row.maxTrackDifference<1e-8);
 assert.ok(Math.abs(normalize(row.modes,out.reference)-row.score)<1e-9);
 assert.ok(Math.abs(normalize(row.modes,out.reference,2)-row.doubledScore)<1e-9);
 if(!row.id.startsWith('U7E-')||['U7E-1f46d74c337f','U7E-3b1557bb9247'].includes(row.id)){
  assert.ok(row.optimal1x.score<=row.score+1e-10);assert.ok(row.optimal2x.score<=row.doubledScore+1e-10);
 }
}
out.completed=true;
out.sourceHashes=Object.fromEntries([__filename,file.replace('-verification',''),path.join(ROOT,'tools/verify_untoned_cr7e_v52.js'),
 path.join(ROOT,'research/ckt-v4-core/src/bin/score-untoned-v52-stream.rs'),path.join(ROOT,'research/.cache/untoned-cr7e-v52-20261119/templates.json'),
 path.join(ROOT,'research/.cache/untoned-cr7e-v52-20261119/native-verification-checkpoint.json'),
 path.join(ROOT,'research/.cache/untoned-cr7e-v52-20261119/native-verification-source.js'),
 'D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark-2121-2k/research/notes/2026-11-14-untoned-2121-local-closure.json'].map(p=>[p,digest(p)]));
fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out.results.map(({id,score,doubledScore,optimal1x,optimal2x,audit})=>({id,score,doubledScore,optimal1x,optimal2x,audit}))));
