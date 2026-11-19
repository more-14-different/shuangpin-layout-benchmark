'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const fair=require('./search_untoned_cr7e_u7e_fair'),drop=require('./search_untoned_cr7e_dropfinal'),restore=require('./search_untoned_cr7e_restored21'),search=require('./search_untoned_cr7e_v52');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=hashes=>{for(const[p,h]of Object.entries(hashes))assert.equal(hash(p),h,p);};
function selected(report){return [...new Map(report.lanes.flatMap(l=>[...l.best1x,...l.best2x]).map(r=>[r.id,r])).values()];}
function retainPolicy(prefix,row,reference,toneKeysByTone){
 const policyFile=prefix+'-policy-'+row.id+'.json';if(fs.existsSync(policyFile))return;
 const historical=[];
 for(const name of ['blocks','crosswide','multiblock']){const p=path.join(ROOT,`research/notes/2026-11-20-untoned-cr7e-${name}-v52-summary.json`),r=read(p);for(const e of r.results)historical.push([path.join(ROOT,`research/notes/2026-11-20-untoned-cr7e-${name}-v52-policy-${e.id}.json`),p]);}
 const oldDrop=read(drop.PREFIX+'-summary.json');for(const e of oldDrop.results.filter(r=>r.family==='U7E'))historical.push([drop.PREFIX+'-policy-'+e.id+'.json',drop.PREFIX+'-summary.json']);
 const other=fair.prefix('drop20');if(prefix!==other){const p=other+'-verification.json';if(fs.existsSync(p))for(const e of read(p).results)historical.push([other+'-policy-'+e.id+'.json',p]);}
 for(const[p,summary]of historical){if(!fs.existsSync(p))continue;const earlier=read(p);if(mappingKey(earlier)!==mappingKey(row))continue;check(earlier.sourceHashes);
  // Every source uses the same frozen reference; this phase's default-policy replay remains fresh.
  const sourceReport=summary.endsWith('-verification.json')?read(summary):read(summary.replace(/-summary\.json$/,'.json'));assert.deepEqual(sourceReport.reference,reference);
  const out={...earlier,id:row.id,family:'U7E',activePhysicalKeys:row.audit.actual,auxiliarySemantics:auxiliarySemantics(toneKeysByTone),
   retainedPolicyEnumeration:{source:p,sha256:hash(p),originalId:earlier.id,reason:'Identical physical maps, traditional candidate pools, reference and auxiliary semantics; retain complete enumeration. Default-policy replay is fresh.'}};
  out.sourceHashes={...earlier.sourceHashes,[p]:hash(p),[summary]:hash(summary)};fs.writeFileSync(policyFile,JSON.stringify(out,null,2)+'\n');console.log('retained policy',row.id);return;
 }
}
async function main(){
 const args=process.argv.slice(2),phase=args.includes('--phase')?args[args.indexOf('--phase')+1]:'drop20';assert.ok(['drop20','restored21'].includes(phase));
 const prefix=fair.prefix(phase),report=read(prefix+'.json'),{prior,known,seeds}=fair.buildInputs(phase),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 for(const row of Object.values(report.states))known.set(mappingKey(row),row);const byId=new Map([...known.values(),...seeds].map(r=>[r.id,r])),get=id=>{const r=byId.get(id);assert.ok(r,id);return r;};
 const flag=['--entry','--policy'].find(f=>args.includes(f)),id=flag?args[args.indexOf(flag)+1]:null;
 if(id){
  const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
  const html=path.join(ROOT,'a7_CKT_R11.html'),data=scorer.loadPayload(html),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
  assert.deepEqual(data.base,prior.auditInput.base);assert.deepEqual(data.pinyin,prior.auditInput.pinyin);
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=get(id),entry=search.rebuild({...template,...row},data),audit=phase==='drop20'?drop.audit(entry,data,row.forbiddenFinalKey):search.audit(entry,data);
  assert.ok(phase==='drop20'?drop.legal(audit):legal(audit));assert.deepEqual(audit.actual,report.contract.activePhysicalKeys);assert.ok(fair.sameInitials(row.initialMap,report.initialMap));
  const semantics=auxiliarySemantics(entry.tone);assert.equal(semantics.toneKeysByTone,report.contract.toneKeysByTone);assert.equal(semantics.shapeKeysByMeaning,report.contract.shapeKeysByMeaning);
  const inputs=[__filename,path.join(ROOT,'tools/search_untoned_cr7e_u7e_fair.js'),...(phase==='restored21'?[path.join(ROOT,'tools/search_untoned_cr7e_u7e_fair_restored.js')]:[]),html,profile,
   ...['score_ckt_v52.js','score_completion_ckt_v4.js','verify_untoned_cr7e_v52.js','ckt_v4_model.js','ckt_block_error.js','auxiliary_semantics.js'].map(p=>path.join(ROOT,'tools',p)),
   'D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml','D:/C2D/Documents/rime-snow-pinyin/rime-stroke/stroke.dict.yaml',
   'D:/C2D/Documents/rime-snow-pinyin/scripts/research/evaluate_ckt_v4_word_aux_order.js','D:/C2D/Documents/rime-snow-pinyin/scripts/research/evaluate_ckt51_aux_order.js'];
  const reset=()=>{ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);};
  if(flag==='--entry'){
   const modes=v52.evaluateUntoned(entry,report.policy,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);assert.ok(Math.abs(score-row.score)<1e-9&&Math.abs(doubledScore-row.doubledScore)<1e-9);
   const native=await require('./untoned_v52_stream_pool').pool(path.join(require('./anneal_untoned_cr7e_far').WORK,'templates.json'),1);let maxTrackDifference=0;
   try{const s=await native.score(entry);for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])for(const[f,v]of Object.entries(modes[mode][kind]))if(typeof v==='number'){
    const diff=Math.abs(v-s.modes[mode][kind][f]);assert.ok(diff<1e-8,`${id}/${mode}/${kind}/${f}`);maxTrackDifference=Math.max(maxTrackDifference,diff);}}finally{native.close();}
   const out={...row,phase,family:'U7E',capacity:[21,21],activePhysicalKeys:audit.actual,audit,tone:entry.tone,auxiliarySemantics:semantics,codeList:entry.codeList,modes,maxTrackDifference,
    sourceHashes:Object.fromEntries([...inputs,prefix+'.json'].map(p=>[p,hash(p)]))};fs.writeFileSync(prefix+'-replay-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,score,doubledScore,maxTrackDifference}));return;
  }
  ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();const cases={};
  for(const mode of ['keytao','sanpin']){ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);cases[mode]=enumerateBounded(entry,mode,ctx);ctx.motor=null;if(global.gc)global.gc();console.log(id,mode,'144 policies');}
  const out={id,phase,family:'U7E',initialMap:entry.initialMap,finalMap:entry.finalMap,activePhysicalKeys:audit.actual,auxiliarySemantics:semantics,optimal1x:optimum(cases,prior.reference,1),optimal2x:optimum(cases,prior.reference,2),canonicalReplays:[]};
  for(const[key,policy]of new Map([out.optimal1x,out.optimal2x].map(r=>[JSON.stringify(r.policy),r.policy]))){const policies=Object.fromEntries(Object.entries(policy).map(([m,s])=>[m,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,s.split('/')[i]]))]));reset();
   const modes=v52.evaluateUntoned(entry,policies,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);
   if(key===JSON.stringify(out.optimal1x.policy))assert.ok(Math.abs(score-out.optimal1x.score)<1e-9);if(key===JSON.stringify(out.optimal2x.policy))assert.ok(Math.abs(doubledScore-out.optimal2x.score)<1e-9);
   out.canonicalReplays.push({policies,score,doubledScore,modes});if(global.gc)global.gc();}
  out.sourceHashes=Object.fromEntries(inputs.map(p=>[p,hash(p)]));fs.writeFileSync(prefix+'-components-'+id+'.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference:prior.reference}))));
  fs.writeFileSync(prefix+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,one:out.optimal1x,two:out.optimal2x}));return;
 }
 assert.ok(report.completed);check(report.sourceHashes);assert.deepEqual(report.reference,prior.reference);
 const oldKeys=new Set(fair.buildInputs(phase).known.keys());for(const row of Object.values(report.states)){assert.ok(!oldKeys.has(mappingKey(row)));assert.ok(fair.sameInitials(row.initialMap,report.initialMap));
  const e=search.rebuild({...template,...row},prior.auditInput),audit=phase==='drop20'?drop.audit(e,prior.auditInput,row.forbiddenFinalKey):search.audit(e,prior.auditInput);assert.deepEqual(audit,row.audit);assert.ok(phase==='drop20'?drop.legal(audit):legal(audit));}
 const coverage=[],coveredUnion=new Set();
 for(const stage of report.stages){const keys=new Set(),jobs=stage.name==='complete bridge restorations'?stage.groups.map(g=>({center:get(g.parent),group:g,variants:restore.restorations(get(g.parent).finalMap,get(g.original).finalMap,g.forbiddenFinalKey)})):
   [{center:get(stage.center),variants:stage.name==='complete direct evacuation'?[...drop.evacuations(get(stage.center).finalMap,stage.forbiddenFinalKey)].map(finalMap=>({finalMap})):search.neighbors(get(stage.center))}];
  for(const job of jobs){let total=0,valid=0;for(const n of job.variants){total++;const e=search.rebuild({...template,...job.center,...n},prior.auditInput),audit=phase==='drop20'?drop.audit(e,prior.auditInput,stage.forbiddenFinalKey):search.audit(e,prior.auditInput);
    if(!(phase==='drop20'?drop.legal(audit):legal(audit)))continue;valid++;keys.add(mappingKey(e));}
   if(job.group){assert.equal(total,job.group.total);assert.equal(valid,job.group.legal);}else if(stage.name==='complete direct evacuation'){assert.equal(total,stage.total);assert.equal(valid,stage.legal);}}
  if(stage.legalUnique!==undefined)assert.equal(keys.size,stage.legalUnique);assert.ok([...keys].every(k=>known.has(k)),'missing scored candidate');
  if(stage.best1x){const values=[...keys].map(k=>known.get(k));assert.ok(Math.abs(stage.best1x.score-Math.min(...values.map(r=>r.score)))<1e-12);assert.ok(Math.abs(stage.best2x.doubledScore-Math.min(...values.map(r=>r.doubledScore)))<1e-12);}
  for(const key of keys)coveredUnion.add(key);coverage.push({name:stage.name,center:stage.center,forbiddenFinalKey:stage.forbiddenFinalKey,legalUnique:keys.size,missing:0});}
 for(const trajectory of report.restoredPaths){let current=trajectory.seedId;
  for(const step of trajectory.steps){assert.equal(step.from,current);const stage=report.stages.find(s=>s.name==='complete final local ring'&&s.center===current);assert.ok(stage);
   const best=trajectory.axis==='score'?stage.best1x:stage.best2x;assert.equal(step.to,best.id);const improves=best[trajectory.axis]<get(current)[trajectory.axis]-1e-12;assert.equal(improves,step.improves);if(improves)current=best.id;}
  assert.equal(current,trajectory.currentId);if(trajectory.closed)assert.equal(trajectory.steps.at(-1).improves,false);
 }
 for(const c of report.closure){const rows=[...known.values()].filter(r=>r.audit?.actual?.[1]===(phase==='drop20'?20:21)&&(phase!=='drop20'||r.forbiddenFinalKey===c.forbiddenFinalKey)),leader=rows.sort((a,b)=>a[c.axis]-b[c.axis])[0];assert.equal(leader.id,c.leader);
  const stage=report.stages.find(s=>s.center===leader.id&&s.name.includes('ring'));assert.equal(Boolean(stage),c.fixedPolicyOneStepClosed);
  if(stage)for(const n of search.neighbors(leader)){const e=search.rebuild({...template,...leader,...n},prior.auditInput),a=phase==='drop20'?drop.audit(e,prior.auditInput,c.forbiddenFinalKey):search.audit(e,prior.auditInput);
   if(phase==='drop20'?drop.legal(a):legal(a))assert.ok(known.get(mappingKey(e))[c.axis]>=leader[c.axis]-1e-12);}}
 const rows=selected(report),out={completed:false,phase,reference:prior.reference,auditInput:prior.auditInput,newStates:Object.keys(report.states).length,coverage,uniqueCoveredLayouts:coveredUnion.size,closure:report.closure,selectedIds:rows.map(r=>r.id),results:[]};
 for(const row of rows){const file=prefix+'-replay-'+row.id+'.json';if(!fs.existsSync(file)){const p=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--phase',phase,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(p.status,0,row.id);}
  const replay=read(file);check(replay.sourceHashes);assert.deepEqual(replay.initialMap,row.initialMap);assert.deepEqual(replay.finalMap,row.finalMap);out.results.push(replay);retainPolicy(prefix,row,prior.reference,report.contract.toneKeysByTone);}
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[prefix+'.json']:hash(prefix+'.json')};fs.writeFileSync(prefix+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({phase,verified:out.selectedIds,newStates:out.newStates,closure:out.closure}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={selected};
