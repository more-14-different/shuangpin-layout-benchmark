'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),search=require('./search_untoned_cr7e_v52');
const {blockErrorMotor}=require('./ckt_block_error'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52'),{policyObjects}=require('./finalize_untoned_frontiers_r11');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-21-u7e-gpu-close');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const inputPath=PREFIX+'-review-input.json.gz',input=JSON.parse(zlib.gunzipSync(fs.readFileSync(inputPath))),cfg=input.config;
 const row=input.frontier.find(r=>r.id==='U7G-87a5d1a954d2');assert.ok(row);
 const html='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html',data=scorer.loadPayload(html),profile=path.join(ROOT,cfg.profile);
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),reference=v52.evaluateUntoned(data.entries.find(r=>r.id==='S005'),search.REF,null,ctx).v52;
 const entry=search.rebuild({...data.entries.find(r=>r.id===cfg.seedId),id:row.id,initialMap:cfg.initialMap,finalMap:Object.fromEntries(cfg.finalNames.map((f,i)=>[f,String.fromCharCode(row.finals[i]+65)]))},data);
 const audit=search.audit(entry,data);assert.ok(audit.valid&&audit.M===41&&audit.D===2&&!audit.qz&&!audit.zq);
 const cases={};ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();
 for(const mode of ['keytao','sanpin']){ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);cases[mode]=enumerateBounded(entry,mode,ctx);ctx.motor=null;if(global.gc)global.gc();console.log(mode,144);}
 const optima=[1,2,3].map(m=>optimum(cases,reference,m)),replays=[];
 const fixed=Object.fromEntries(Object.entries(cfg.policies).map(([m,p])=>[m,[p.word2,p.word3,p.word4].join('/')]));
 for(const policy of new Map([fixed,...optima.map(p=>p.policy)].map(p=>[JSON.stringify(p),p])).values()){
  ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
  const modes=v52.evaluateUntoned(entry,policyObjects(policy),null,ctx).v52;let maxTrackDifference=0;
  for(const[m,key]of Object.entries(policy)){const expected=cases[m].results.find(r=>r.policyKey===key).tracks;
   for(const[k,t]of Object.entries(expected))for(const[f,v]of Object.entries(t))if(typeof v==='number'){const diff=Math.abs(modes[m][k][f]-v);assert.ok(diff<1e-8);maxTrackDifference=Math.max(maxTrackDifference,diff);}}
  const scores=[1,2,3].map(m=>search.normalize(modes,reference,m));if(JSON.stringify(policy)===JSON.stringify(fixed))scores.forEach((s,i)=>assert.ok(Math.abs(s-row.scores[i])<1e-9));
  replays.push({policy,scores,maxTrackDifference,modes});if(global.gc)global.gc();
 }
 const fields=['firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions'],costs=[300,300,300,600,50,300];
 for(const caseRow of Object.values(cases))for(const r of caseRow.results)for(const track of Object.values(r.tracks)){
  for(const f of fields)track[f]??=0;assert.ok(Math.abs(track.effectiveMs-track.motorUpperMs-fields.reduce((s,f,i)=>s+track[f]*costs[i],0))<1e-9);
 }
 const components=PREFIX+'-components.json.gz';fs.writeFileSync(components,zlib.gzipSync(Buffer.from(JSON.stringify({id:entry.id,cases,reference,coefficients:fields,baselineCostsMs:costs}))));
 const files=[__filename,inputPath,html,profile,components,...['score_completion_ckt_v4.js','score_ckt_v52.js','ckt_v4_model.js','ckt_block_error.js','verify_untoned_cr7e_v52.js','search_untoned_cr7e_v52.js'].map(f=>path.join(ROOT,'tools',f))];
 const output={completed:true,id:entry.id,initialMap:entry.initialMap,finalMap:entry.finalMap,codeList:entry.codeList,audit,fixedScores:row.scores,optima,replays,sourceHashes:Object.fromEntries(files.map(p=>[p,hash(p)]))};
 fs.writeFileSync(PREFIX+'-policy.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({id:row.id,optima}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
