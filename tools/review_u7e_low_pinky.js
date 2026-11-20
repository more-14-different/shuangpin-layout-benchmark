'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),search=require('./search_untoned_cr7e_v52');
const {blockErrorMotor}=require('./ckt_block_error'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52');
const {policyObjects}=require('./finalize_untoned_frontiers_r11'),{summarizeCodes,aggregateCodes}=require('./compare_u7e_competing_performance'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-21-u7e-low-pinky');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),KINDS=['character','word2','word3','word4'];
async function main(){
 const action=process.argv[2],id=process.argv[3];assert.ok(['--policy','--score'].includes(action));
 const screen=read(PREFIX+'-screen.json'),baselines=read(PREFIX+'-baselines.json');let candidate,policies;
 const baseline=baselines.rows.find(r=>r.id===id);
 if(baseline)candidate={...baseline};else{candidate=screen.selected.find(r=>r.id===id);assert.ok(candidate);candidate={...candidate,initialMap:screen.initialMap};}
 const html=baselines.sourceHtml,data=scorer.loadPayload(html),entry=search.rebuild({...data.entries.find(r=>r.id==='UED-18c004bd1f31'),...candidate,tone:'IVUAO',capacity:[21,21]},data);
 const audit=search.audit(entry,data);assert.ok(audit.valid&&audit.D===2);if(!baseline){assert.equal(audit.M,41);assert.deepEqual(entry.initialMap,screen.initialMap);assert.equal(!audit.qz,candidate.qzEmpty);assert.equal(!audit.zq,candidate.zqEmpty);}
 const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile);
 const reference=v52.evaluateUntoned(data.entries.find(e=>e.id==='S005'),search.REF,null,ctx).v52;
 const reset=()=>{ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);};
 const files=[__filename,PREFIX+'-screen.json',PREFIX+'-baselines.json',html,profile,...['score_completion_ckt_v4.js','score_ckt_v52.js','ckt_v4_model.js','ckt_block_error.js','verify_untoned_cr7e_v52.js','search_untoned_cr7e_v52.js','auxiliary_semantics.js','finalize_untoned_frontiers_r11.js','compare_u7e_competing_performance.js'].map(f=>path.join(ROOT,'tools',f))];
 if(action==='--policy'){
  assert.ok(!baseline);ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();const cases={};
  for(const mode of ['keytao','sanpin']){ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);cases[mode]=enumerateBounded(entry,mode,ctx);ctx.motor=null;if(global.gc)global.gc();console.log(id,mode,144);}
  const fixed=screen.fixedPolicy,tracks=Object.fromEntries(Object.entries(fixed).map(([mode,p])=>[mode,cases[mode].results.find(r=>r.policyKey===[p.word2,p.word3,p.word4].join('/')).tracks]));
  assert.ok(Math.abs(search.normalize(tracks,reference)-candidate.score)<1e-9);assert.ok(Math.abs(search.normalize(tracks,reference,2)-candidate.doubledScore)<1e-9);
  const optima=[1,2,3].map(m=>optimum(cases,reference,m)),replays=[];
  for(const policy of new Map(optima.map(r=>[JSON.stringify(r.policy),r.policy])).values()){
   reset();const modes=v52.evaluateUntoned(entry,policyObjects(policy),null,ctx).v52;let maximum=0;
   for(const[mode,key]of Object.entries(policy))for(const[k,t]of Object.entries(cases[mode].results.find(r=>r.policyKey===key).tracks))for(const[f,v]of Object.entries(t))if(typeof v==='number'){const d=Math.abs(v-modes[mode][k][f]);assert.ok(d<1e-8);maximum=Math.max(maximum,d);}
   replays.push({policy,scores:[1,2,3].map(m=>search.normalize(modes,reference,m)),maxTrackDifference:maximum});if(global.gc)global.gc();
  }
  const coefficients=['firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions'],baselineCostsMs=[300,300,300,600,50,300];
  const all=[...Object.values(reference).flatMap(Object.values),...Object.values(cases).flatMap(c=>c.results.flatMap(r=>Object.values(r.tracks)))];
  for(const t of all){for(const f of coefficients)t[f]??=0;assert.ok(Math.abs(t.motorUpperMs+coefficients.reduce((s,f,i)=>s+t[f]*baselineCostsMs[i],0)-t.effectiveMs)<1e-9);}
  const component=PREFIX+'-components-'+id+'.json.gz';fs.writeFileSync(component,zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference,coefficients,baselineCostsMs}))));files.push(component);
  const output={completed:true,id,initialMap:entry.initialMap,finalMap:entry.finalMap,audit,codeList:entry.codeList,optima,replays,rightPinky20:candidate.rightPinky20,sourceHashes:Object.fromEntries(files.map(p=>[p,hash(p)]))};
  fs.writeFileSync(PREFIX+'-policy-'+id+'.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({id,optima}));return;
 }
 let robust;
 if(baseline)policies=baseline.productionPolicies;
 else{const p=PREFIX+'-robustness-'+id+'.json';robust=read(p);assert.ok(robust.completed);assert.equal(robust.inputSha256,hash(PREFIX+'-components-'+id+'.json.gz'));policies=policyObjects(robust.selectedPolicies);files.push(p,PREFIX+'-policy-'+id+'.json');}
 reset();const capture=[],summarize=ctx.summarize;ctx.summarize=rows=>{const value=summarize(rows);capture.push(summarizeCodes(rows));return value;};
 const modes=v52.evaluateUntoned(entry,policies,null,ctx).v52;assert.equal(capture.length,8);
 if(robust)for(const mode of ['keytao','sanpin'])for(const k of KINDS)for(const[f,v]of Object.entries(robust.selectedTracks[mode][k]))if(typeof v==='number')assert.ok(Math.abs(v-modes[mode][k][f])<1e-8);
 const codes=Object.fromEntries(['keytao','sanpin'].map((m,i)=>[m,Object.fromEntries(KINDS.map((k,j)=>[k,capture[4*i+j]]))]));
 const metaPath=path.join(ROOT,'research/.cache/R11_integrated_replay/model_meta.json'),loadPath=path.join(ROOT,'research/.cache/R11_integrated_replay/r4_token_loads.json'),meta=read(metaPath),loads=read(loadPath);
 const mapped=[...meta.heads.map(h=>entry.initialMap[h]),...meta.finals.map(f=>entry.finalMap[f]),...entry.tone],legacy=Object.fromEntries(meta.tracks.map(t=>{const mass=loads[t].mass,total=mass.reduce((a,b)=>a+b,0);return[t,mass.reduce((s,v,i)=>s+('P[]\\;\'/'.includes(mapped[i])?v:0),0)/total];}));
 const peak=Math.max(...Object.values(legacy));assert.ok(Math.abs(peak-(baseline?baseline.legacy.rightPinkyMax20:candidate.rightPinky20))<1e-12);files.push(metaPath,loadPath);
 const erg=aggregateCodes(codes),scores=[1,2,3].map(m=>search.normalize(modes,reference,m));if(baseline)assert.ok(Math.abs(scores[0]-baseline.score)<1e-9);
 const result={completed:true,id,initialMap:entry.initialMap,finalMap:entry.finalMap,audit,codeList:entry.codeList,auxiliarySemantics:auxiliarySemantics(entry.tone),policies,ckt:scores,aggregate:v52.aggregate(modes),modes,terminalCodes:codes,ergonomics:erg,legacyRightPinky:{max20:peak,track:meta.tracks.find(t=>legacy[t]===peak),byTrack:legacy},
  baselinePolicy:!!baseline,sourceHashes:Object.fromEntries(files.map(p=>[p,hash(p)]))};
 fs.writeFileSync(PREFIX+'-score-'+id+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({id,M:audit.M,scores,max20:peak,right:erg.rightPinky,peak8:erg.peaks.rightPinky.value,home:erg.home,maxFinger:erg.maxFinger}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
