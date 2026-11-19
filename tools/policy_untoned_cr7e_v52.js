'use strict';
// Independent per-layout policy job; bounded memory and no shared mutations.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model');
const {blockErrorMotor}=require('./ckt_block_error');
const {enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52');
const ROOT=path.resolve(__dirname,'..');
const args=Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith('--')).map(a=>{const i=process.argv.indexOf(a);return[a.slice(2),process.argv[i+1]];}));
const input=JSON.parse(fs.readFileSync(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json')));
const verified=input.results.find(r=>r.id===args.id);assert.ok(verified,'native-verified layout required');
const entry={...verified,capacity:[21,21]};
const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile);
ctx.next=null;ctx.legacy=null;ctx.scorer=scorer;ctx.model=model;
const cases={};
for(const mode of ['keytao','sanpin']){
 ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
 cases[mode]=enumerateBounded(entry,mode,ctx);console.log(args.id,mode,cases[mode].results.length);
 ctx.motor=null;if(global.gc)global.gc();
}
const output={id:entry.id,initialMap:entry.initialMap,finalMap:entry.finalMap,
 optimal1x:optimum(cases,input.reference,1),optimal2x:optimum(cases,input.reference,2),
 nativeInputFingerprint:crypto.createHash('sha256').update(JSON.stringify([entry.id,entry.initialMap,entry.finalMap,entry.modes,input.reference])).digest('hex'),
 sourceHashes:Object.fromEntries([__filename,path.join(ROOT,'tools/verify_untoned_cr7e_v52.js'),profile].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))};
const dest=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-policy-'+entry.id+'.json');
fs.writeFileSync(dest,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
