'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const restored=require('./search_untoned_cr7e_restored21'),drop=require('./search_untoned_cr7e_dropfinal'),search=require('./search_untoned_cr7e_v52'),{mappingKey,legal}=require('./search_untoned_cr7e_coupled');
const {enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=hashes=>{for(const[p,h]of Object.entries(hashes))assert.equal(hash(p),h,p);};
function selected(report){return [...new Map([...report.bestDefault.slice(0,2),...report.bestDoubled.slice(0,2),report.states[report.discoveryId]].filter(Boolean).map(r=>[r.id,r])).values()];}
async function main(){
 const args=process.argv.slice(2),flag=['--entry','--policy'].find(f=>args.includes(f)),id=flag?args[args.indexOf(flag)+1]:null;
 const source=read(drop.PREFIX+'.json'),prior=read(drop.PRIOR),probe=restored.discovery(source);
 const report=fs.existsSync(restored.PREFIX+'.json')?read(restored.PREFIX+'.json'):{policy:source.policy,states:{[probe.id]:probe}};
 if(!fs.existsSync(restored.PREFIX+'.json'))assert.ok(flag==='--policy'&&id===probe.id,'only the fixed discovery policy can precede the completed bridge search');
 const get=id=>{const r=report.states[id]||source.states[id]||source.seeds.find(r=>r.id===id);assert.ok(r,id);return r;};
 const template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 if(id){
  const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
  const html=path.join(ROOT,'a7_CKT_R11.html'),data=scorer.loadPayload(html),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
  assert.deepEqual(data.base,prior.auditInput.base);assert.deepEqual(data.pinyin,prior.auditInput.pinyin);
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=get(id),entry=search.rebuild({...template,...row},data),a=search.audit(entry,data);assert.ok(legal(a));assert.deepEqual(a.actual,[21,21]);
  const semantics=auxiliarySemantics(entry.tone);assert.equal(semantics.toneKeysByTone,source.contract.toneKeysByTone);assert.equal(semantics.shapeKeysByMeaning,source.contract.shapeKeysByMeaning);
  const inputs=[__filename,drop.PREVIOUS,path.join(ROOT,'tools/search_untoned_cr7e_restored21.js'),profile,html,path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/score_completion_ckt_v4.js'),path.join(ROOT,'tools/verify_untoned_cr7e_v52.js'),
   path.join(ROOT,'tools/ckt_v4_model.js'),path.join(ROOT,'tools/ckt_block_error.js'),path.join(ROOT,'tools/auxiliary_semantics.js'),
   'D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml','D:/C2D/Documents/rime-snow-pinyin/rime-stroke/stroke.dict.yaml',
   'D:/C2D/Documents/rime-snow-pinyin/scripts/research/evaluate_ckt_v4_word_aux_order.js','D:/C2D/Documents/rime-snow-pinyin/scripts/research/evaluate_ckt51_aux_order.js'];
  const reset=()=>{ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);};
  if(flag==='--entry'){
   const modes=v52.evaluateUntoned(entry,report.policy,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);
   assert.ok(Math.abs(score-row.score)<1e-9);assert.ok(Math.abs(doubledScore-row.doubledScore)<1e-9);
   const native=await require('./untoned_v52_stream_pool').pool(path.join(require('./anneal_untoned_cr7e_far').WORK,'templates.json'),1);let maxTrackDifference=0;
   try{const s=await native.score(entry);for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])for(const[f,v]of Object.entries(modes[mode][kind]))if(typeof v==='number'){
    const diff=Math.abs(v-s.modes[mode][kind][f]);assert.ok(diff<1e-8);maxTrackDifference=Math.max(maxTrackDifference,diff);}}finally{native.close();}
   const result={...row,capacity:[21,21],activePhysicalKeys:a.actual,tone:entry.tone,auxiliarySemantics:semantics,codeList:entry.codeList,modes,maxTrackDifference,
    sourceHashes:Object.fromEntries([...inputs,restored.PREFIX+'.json'].map(p=>[p,hash(p)]))};
   fs.writeFileSync(restored.PREFIX+'-replay-'+id+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({id,score,doubledScore,maxTrackDifference}));return;
  }
  ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();const cases={};
  for(const mode of ['keytao','sanpin']){ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);cases[mode]=enumerateBounded(entry,mode,ctx);ctx.motor=null;if(global.gc)global.gc();console.log(id,mode,'144 policies');}
  const out={id,initialMap:entry.initialMap,finalMap:entry.finalMap,activePhysicalKeys:a.actual,auxiliarySemantics:semantics,optimal1x:optimum(cases,prior.reference,1),optimal2x:optimum(cases,prior.reference,2),canonicalReplays:[]};
  for(const[key,policy]of new Map([out.optimal1x,out.optimal2x].map(r=>[JSON.stringify(r.policy),r.policy]))){
   const policies=Object.fromEntries(Object.entries(policy).map(([m,s])=>[m,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,s.split('/')[i]]))]));reset();
   const modes=v52.evaluateUntoned(entry,policies,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);
   if(key===JSON.stringify(out.optimal1x.policy))assert.ok(Math.abs(score-out.optimal1x.score)<1e-9);if(key===JSON.stringify(out.optimal2x.policy))assert.ok(Math.abs(doubledScore-out.optimal2x.score)<1e-9);
   out.canonicalReplays.push({policies,score,doubledScore,modes});if(global.gc)global.gc();}
  out.sourceHashes=Object.fromEntries(inputs.map(p=>[p,hash(p)]));fs.writeFileSync(restored.PREFIX+'-components-'+id+'.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference:prior.reference}))));
  fs.writeFileSync(restored.PREFIX+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,one:out.optimal1x,two:out.optimal2x}));return;
 }
 assert.ok(report.completed);check(report.sourceHashes);const known=new Map();for(const row of Object.values(report.states)){
  assert.deepEqual(row.initialMap,report.families[row.family]);const e=search.rebuild({...template,...row},prior.auditInput),a=search.audit(e,prior.auditInput);assert.ok(legal(a));assert.deepEqual(a,row.audit);const key=mappingKey(row);assert.ok(!known.has(key));known.set(key,row);}
 const coverage=[];for(const stage of report.stages){const keys=new Set();
  const proposals=stage.name==='complete bridge restorations'?stage.groups.map(g=>({center:get(g.parent),group:g,variants:restored.restorations(get(g.parent).finalMap,get(g.original).finalMap,g.forbiddenFinalKey)})):
   [{center:get(stage.center),variants:search.neighbors(get(stage.center))}];
  for(const job of proposals){let total=0,legalCount=0;for(const n of job.variants){total++;const e=search.rebuild({...template,...job.center,...n},prior.auditInput);if(!legal(search.audit(e,prior.auditInput)))continue;legalCount++;keys.add(mappingKey(e));}
   if(job.group){assert.equal(total,job.group.total);assert.equal(legalCount,job.group.legal);}}
  assert.equal(keys.size,stage.legalUnique);assert.ok([...keys].every(k=>known.has(k)));coverage.push({name:stage.name,center:stage.center,legalUnique:keys.size,missing:0});}
 for(const c of report.closure){const leader=Object.values(report.states).sort((a,b)=>a[c.axis]-b[c.axis])[0];assert.equal(c.leader,leader.id);
  const closed=report.stages.some(s=>s.name==='complete final local ring'&&s.center===leader.id);assert.equal(c.fixedPolicyOneStepClosed,closed);
  if(closed)for(const n of search.neighbors(leader)){const e=search.rebuild({...template,...leader,...n},prior.auditInput);if(legal(search.audit(e,prior.auditInput)))assert.ok(known.get(mappingKey(e))[c.axis]>=leader[c.axis]-1e-12);}}
 const rows=selected(report),out={completed:false,reference:prior.reference,auditInput:prior.auditInput,newStates:known.size,coverage,closure:report.closure,selectedIds:rows.map(r=>r.id),results:[]};
 for(const row of rows){const file=restored.PREFIX+'-replay-'+row.id+'.json';if(!fs.existsSync(file)){const p=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(p.status,0);}
  const replay=read(file);check(replay.sourceHashes);out.results.push(replay);}
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[restored.PREFIX+'.json']:hash(restored.PREFIX+'.json')};fs.writeFileSync(restored.PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({verified:out.selectedIds,newStates:known.size,coverage,closure:report.closure}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={selected};
