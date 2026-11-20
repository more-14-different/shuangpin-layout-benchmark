'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),search=require('./search_untoned_cr7e_v52');
const {blockErrorMotor}=require('./ckt_block_error'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52');
const {policyObjects}=require('./finalize_untoned_frontiers_r11'),{summarizeCodes,aggregateCodes}=require('./compare_u7e_competing_performance'),{auxiliarySemantics}=require('./auxiliary_semantics');
const {PREFIX,BASE,rightLoads,WORK}=require('./explore_u7e_pinky_descent');
const ROOT=path.resolve(__dirname,'..'),MULT=[1,2,3,5],KINDS=['character','word2','word3','word4'];
const {read,hash}=require('./u7e_pinky_descent_io');
async function main(){
 const action=process.argv[2],id=process.argv[3];assert.ok(['--policy','--score'].includes(action));
 const report=read(PREFIX+'.json'),fragments=[];
 for(const file of ['linked','rescue','composed'].map(s=>PREFIX+'-'+s+'.json').filter(p=>fs.existsSync(p)||fs.existsSync(p+'.gz'))){const fragment=read(file);if(!fragment.completed){assert.equal(action,'--policy','finish searches before final scoring');continue;}fragments.push(file);assert.equal(fragment.sourceHashes[PREFIX+'.json'],hash(PREFIX+'.json'));for(const[k,v]of Object.entries(fragment.states))if(report.states[k]){assert.deepEqual(report.states[k].finalMap,v.finalMap);assert.deepEqual(report.states[k].modes,v.modes);}Object.assign(report.states,fragment.states);Object.assign(report.sourceHashes,fragment.sourceHashes);}
 const baseline=read(BASE),row=report.states[id];assert.ok(report.completed&&row&&row.feasible);
 for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(hash(p),h,p);
 const html='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html',data=scorer.loadPayload(html),entry=search.rebuild({...data.entries.find(r=>r.id==='UED-18c004bd1f31'),...row,initialMap:report.initialMap,tone:'IVUAO',capacity:[21,21]},data);
 const audit=search.audit(entry,data);assert.deepEqual(audit,row.audit);assert.deepEqual(entry.initialMap,baseline.initialMap);assert.ok(audit.valid&&audit.M===41&&audit.D===2&&!audit.qz&&!audit.zq);
 const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),reference=v52.evaluateUntoned(data.entries.find(r=>r.id==='S005'),search.REF,null,ctx).v52;
 assert.deepEqual(reference,report.reference);
 const reset=()=>{ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);};
 const files=[__filename,PREFIX+'.json',...fragments,BASE,html,profile,...['explore_u7e_pinky_descent.js','u7e_pinky_descent_io.js','score_completion_ckt_v4.js','score_ckt_v52.js','ckt_v4_model.js','ckt_block_error.js','verify_untoned_cr7e_v52.js','search_untoned_cr7e_v52.js','auxiliary_semantics.js','finalize_untoned_frontiers_r11.js','compare_u7e_competing_performance.js'].map(f=>path.join(ROOT,'tools',f))];
 if(action==='--policy'){
  ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();const cases={};
  for(const mode of ['keytao','sanpin']){ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);cases[mode]=enumerateBounded(entry,mode,ctx);ctx.motor=null;if(global.gc)global.gc();console.log(id,mode,144);}
  const selected=Object.fromEntries(Object.entries(report.policies).map(([m,p])=>[m,cases[m].results.find(r=>r.policyKey===[p.word2,p.word3,p.word4].join('/')).tracks]));
  for(let i=0;i<MULT.length;i++)assert.ok(Math.abs(search.normalize(selected,reference,MULT[i])-row.scores[i])<1e-9);
  const optima=MULT.map(multiplier=>({multiplier,...optimum(cases,reference,multiplier)})),replays=[];
  for(const policy of new Map(optima.map(r=>[JSON.stringify(r.policy),r.policy])).values()){
   reset();const modes=v52.evaluateUntoned(entry,policyObjects(policy),null,ctx).v52;let maximum=0;
   for(const[m,p]of Object.entries(policy))for(const[k,t]of Object.entries(cases[m].results.find(r=>r.policyKey===p).tracks))for(const[f,v]of Object.entries(t))if(typeof v==='number'){const difference=Math.abs(v-modes[m][k][f]);assert.ok(difference<1e-8);maximum=Math.max(maximum,difference);}
   replays.push({policy,scores:MULT.map(m=>search.normalize(modes,reference,m)),maxTrackDifference:maximum});if(global.gc)global.gc();
  }
  const coefficients=['firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions'],baselineCostsMs=[300,300,300,600,50,300];
  for(const t of [...Object.values(reference).flatMap(Object.values),...Object.values(cases).flatMap(c=>c.results.flatMap(r=>Object.values(r.tracks)))]){for(const f of coefficients)t[f]??=0;assert.ok(Math.abs(t.motorUpperMs+coefficients.reduce((s,f,i)=>s+t[f]*baselineCostsMs[i],0)-t.effectiveMs)<1e-9);}
  const component=PREFIX+'-components-'+id+'.json.gz';fs.writeFileSync(component,zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference,coefficients,baselineCostsMs}))));files.push(component);
  fs.writeFileSync(PREFIX+'-policy-'+id+'.json',JSON.stringify({completed:true,id,initialMap:entry.initialMap,finalMap:entry.finalMap,audit,codeList:entry.codeList,optima,replays,sourceHashes:Object.fromEntries(files.map(p=>[p,hash(p)]))},null,2)+'\n');console.log(JSON.stringify({id,optima}));return;
 }
 const robustPath=PREFIX+'-robustness-'+id+'.json',robust=read(robustPath);assert.ok(robust.completed);assert.equal(robust.inputSha256,hash(PREFIX+'-components-'+id+'.json.gz'));files.push(robustPath,PREFIX+'-policy-'+id+'.json');
 const policies=policyObjects(robust.selectedPolicies);reset();const capture=[],summarize=ctx.summarize;ctx.summarize=rows=>{const result=summarize(rows);capture.push(summarizeCodes(rows));return result;};
 const modes=v52.evaluateUntoned(entry,policies,null,ctx).v52;assert.equal(capture.length,8);
 for(const m of ['keytao','sanpin'])for(const k of KINDS)for(const[f,v]of Object.entries(robust.selectedTracks[m][k]))if(typeof v==='number')assert.ok(Math.abs(v-modes[m][k][f])<1e-8);
 const codes=Object.fromEntries(['keytao','sanpin'].map((m,i)=>[m,Object.fromEntries(KINDS.map((k,j)=>[k,capture[4*i+j]]))])),erg=aggregateCodes(codes),loads=rightLoads(entry.finalMap,entry.initialMap,modes,read(path.join(WORK,'contract.json')).tokenMass);
 assert.ok(Math.abs(loads.mixed-erg.rightPinky)<1e-12);assert.ok(Math.abs(loads.peak-erg.peaks.rightPinky.value)<1e-12);for(const m of ['keytao','sanpin'])for(const k of KINDS)assert.ok(Math.abs(loads.byTrack[m+'/'+k]-erg.byTrack[m][k].rightPinky)<1e-12);
 const scores=MULT.map(m=>search.normalize(modes,reference,m)),feasible=erg.rightPinky<=report.contract.rightPinkyMixedMax+1e-12&&erg.peaks.rightPinky.value<=report.contract.rightPinkyPeak8Max+1e-12&&row.rightPinky20<=report.contract.rightPinkyHistorical20Max+1e-12;
 const result={completed:true,id,initialMap:entry.initialMap,finalMap:entry.finalMap,codeList:entry.codeList,audit,auxiliarySemantics:auxiliarySemantics(entry.tone),policies,costMultipliers:MULT,ckt:scores,modes,aggregate:v52.aggregate(modes),terminalCodes:codes,ergonomics:erg,rightPinky20:row.rightPinky20,feasible,sourceHashes:Object.fromEntries(files.map(p=>[p,hash(p)]))};
 fs.writeFileSync(PREFIX+'-score-'+id+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({id,feasible,scores,mixed:erg.rightPinky,peak8:erg.peaks.rightPinky.value,rightPinky20:row.rightPinky20,maxFinger:erg.maxFinger}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
