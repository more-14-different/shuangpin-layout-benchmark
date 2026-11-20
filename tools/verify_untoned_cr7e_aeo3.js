'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const aeo=require('./search_untoned_cr7e_aeo3'),carrier=require('./search_untoned_cr7e_aeo42'),drop=require('./search_untoned_cr7e_dropfinal'),restore=require('./search_untoned_cr7e_restored21'),search=require('./search_untoned_cr7e_v52'),fair=require('./search_untoned_cr7e_u7e_fair');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=hashes=>{for(const[p,h]of Object.entries(hashes))assert.equal(hash(p),h,p);};
const selected=aeo.selected;
function retainPolicy(row,reference){const outFile=aeo.PREFIX+'-policy-'+row.id+'.json';if(fs.existsSync(outFile))return;
 const folder=path.join(ROOT,'research/notes'),files=fs.readdirSync(folder).filter(n=>n.startsWith('2026-11-20-untoned-cr7e-')&&n.includes('-policy-')&&n.endsWith('.json')&&!n.includes('aeo3'));
 for(const name of files){const p=path.join(folder,name),old=read(p);if(!old.initialMap||mappingKey(old)!==mappingKey(row))continue;check(old.sourceHashes);
  for(const mult of [1,2]){const best=old['optimal'+mult+'x'],replay=old.canonicalReplays.find(r=>['keytao','sanpin'].every(m=>['word2','word3','word4'].map(k=>r.policies[m][k]).join('/')===best.policy[m]));assert.ok(replay);
   assert.ok(Math.abs(search.normalize(replay.modes,reference,mult)-best.score)<1e-9);}
  const out={...old,id:row.id,family:'U7E',activePhysicalKeys:row.audit.actual,auxiliarySemantics:auxiliarySemantics('IVUAO'),
   sourceHashes:{...old.sourceHashes,[p]:hash(p)},retainedPolicyEnumeration:{source:p,sha256:hash(p),originalId:old.id,reason:'Identical physical map and semantic pairing; archived optimal replays re-normalize to the same reference; fresh fixed-policy native/JS replay is separate.'}};
  fs.writeFileSync(outFile,JSON.stringify(out,null,2)+'\n');console.log('retained policy',row.id);return;
 }
}
async function main(){
 const report=read(aeo.PREFIX+'.json'),{prior,known,seeds}=aeo.inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const importedKeys=new Set(known.keys());for(const row of Object.values(report.states))known.set(mappingKey(row),row);const byId=new Map([...known.values(),...seeds].map(r=>[r.id,r])),get=id=>{const r=byId.get(id);assert.ok(r,id);return r;};
 const args=process.argv.slice(2),flag=['--entry','--policy'].find(f=>args.includes(f)),id=flag?args[args.indexOf(flag)+1]:null;
 if(id){
  const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
  const html=path.join(ROOT,'a7_CKT_R11.html'),data=scorer.loadPayload(html),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');assert.deepEqual(data.base,prior.auditInput.base);assert.deepEqual(data.pinyin,prior.auditInput.pinyin);
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=get(id),entry=search.rebuild({...template,...row},data),domain=row.audit.actual[1],audit=domain===20?drop.audit(entry,data,'Z'):search.audit(entry,data);assert.deepEqual(audit,row.audit);assert.ok(domain===20?drop.legal(audit):legal(audit));assert.ok(carrier.fixedExceptAEO(entry.initialMap,report.baseInitialMap));
  const semantics=auxiliarySemantics(entry.tone);assert.equal(semantics.toneKeysByTone,'IVUAO');assert.equal(semantics.shapeKeysByMeaning,'AVUIO');
  const inputs=[__filename,path.join(ROOT,'tools/search_untoned_cr7e_aeo3.js'),html,profile,...['score_ckt_v52.js','score_completion_ckt_v4.js','verify_untoned_cr7e_v52.js','ckt_v4_model.js','ckt_block_error.js','auxiliary_semantics.js'].map(p=>path.join(ROOT,'tools',p)),
   'D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml','D:/C2D/Documents/rime-snow-pinyin/rime-stroke/stroke.dict.yaml','D:/C2D/Documents/rime-snow-pinyin/scripts/research/evaluate_ckt_v4_word_aux_order.js','D:/C2D/Documents/rime-snow-pinyin/scripts/research/evaluate_ckt51_aux_order.js'];
  const reset=()=>{ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);};
  if(flag==='--entry'){
   const modes=v52.evaluateUntoned(entry,report.policy,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);assert.ok(Math.abs(score-row.score)<1e-9&&Math.abs(doubledScore-row.doubledScore)<1e-9);
   const native=await require('./untoned_v52_stream_pool').pool(path.join(require('./anneal_untoned_cr7e_far').WORK,'templates.json'),1);let maxTrackDifference=0;
   try{const s=await native.score(entry);for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])for(const[f,v]of Object.entries(modes[mode][kind]))if(typeof v==='number'){const diff=Math.abs(v-s.modes[mode][kind][f]);assert.ok(diff<1e-8,`${id}/${mode}/${kind}/${f}`);maxTrackDifference=Math.max(maxTrackDifference,diff);}}finally{native.close();}
   const out={...row,domain,capacity:[21,21],activePhysicalKeys:audit.actual,tone:entry.tone,auxiliarySemantics:semantics,codeList:entry.codeList,modes,maxTrackDifference,sourceHashes:Object.fromEntries([...inputs,aeo.PREFIX+'.json'].map(p=>[p,hash(p)]))};
   fs.writeFileSync(aeo.PREFIX+'-replay-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,score,doubledScore,maxTrackDifference}));return;
  }
  ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();const cases={};
  for(const mode of ['keytao','sanpin']){ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);cases[mode]=enumerateBounded(entry,mode,ctx);ctx.motor=null;if(global.gc)global.gc();console.log(id,mode,'144 policies');}
  const out={id,family:'U7E',domain,initialMap:entry.initialMap,finalMap:entry.finalMap,activePhysicalKeys:audit.actual,auxiliarySemantics:semantics,optimal1x:optimum(cases,prior.reference,1),optimal2x:optimum(cases,prior.reference,2),canonicalReplays:[]};
  for(const[key,policy]of new Map([out.optimal1x,out.optimal2x].map(r=>[JSON.stringify(r.policy),r.policy]))){const policies=Object.fromEntries(Object.entries(policy).map(([m,s])=>[m,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,s.split('/')[i]]))]));reset();
   const modes=v52.evaluateUntoned(entry,policies,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);if(key===JSON.stringify(out.optimal1x.policy))assert.ok(Math.abs(score-out.optimal1x.score)<1e-9);if(key===JSON.stringify(out.optimal2x.policy))assert.ok(Math.abs(doubledScore-out.optimal2x.score)<1e-9);out.canonicalReplays.push({policies,score,doubledScore,modes});if(global.gc)global.gc();}
  out.sourceHashes=Object.fromEntries(inputs.map(p=>[p,hash(p)]));fs.writeFileSync(aeo.PREFIX+'-components-'+id+'.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference:prior.reference}))));fs.writeFileSync(aeo.PREFIX+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,one:out.optimal1x,two:out.optimal2x}));return;
 }

 assert.ok(report.completed);check(report.sourceHashes);assert.deepEqual(report.reference,prior.reference);const seen=new Set();
 for(const row of Object.values(report.states)){const key=mappingKey(row);assert.ok(!seen.has(key)&&!importedKeys.has(key));seen.add(key);
  assert.ok(carrier.fixedExceptAEO(row.initialMap,report.baseInitialMap));const e=search.rebuild({...template,...row},prior.auditInput),audit=search.audit(e,prior.auditInput);assert.deepEqual(audit,row.audit);assert.ok(legal(audit));}
 const {FINALS}=require('./ckt_v4_scheme_fixture'),inspect=require('./search_untoned_cr7e_coupled').screening(prior.auditInput,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const coverage=[],union=new Set(),beforeKeys=new Set(importedKeys),repairsSeen=new Set();let generated=0,legalGenerated=0,ordinal=0;
 const independentRepairs=seed=>{const fm=seed.finalMap,groups=new Map();for(const f of FINALS){if(!groups.has(fm[f]))groups.set(fm[f],[]);groups.get(fm[f]).push(f);}
  assert.deepEqual(groups.get(fm.e),['e']);const out=[];for(const f of FINALS)if(f!=='e'&&groups.get(fm[f]).length>1)out.push({...fm,e:'E',[f]:fm.e});
  const group={...fm,e:'E'};for(const f of groups.get('E'))group[f]=fm.e;out.push(group);return [...new Map(out.map(f=>[FINALS.map(k=>f[k]).join(''),f])).values()];};
 const neighbors=center=>[...search.neighbors(center).map(n=>({initialMap:center.initialMap,...n})),...carrier.aeoNeighbors(center.initialMap,center.finalMap)];
 for(const stage of report.stages){const keys=new Set(),center=get(stage.center),accept=row=>{const e=search.rebuild({...template,...row},prior.auditInput);if(!legal(search.audit(e,prior.auditInput)))return;keys.add(mappingKey(e));};
  if(stage.name==='screened three-carrier repair'){
   const finalMap=stage.repair.finalMap,repairKey=center.id+'|'+FINALS.map(f=>finalMap[f]).join('');assert.ok(!repairsSeen.has(repairKey));repairsSeen.add(repairKey);
   assert.ok(independentRepairs(center).some(f=>FINALS.every(k=>f[k]===finalMap[k])));assert.equal(stage.randomSeed,20261125+ordinal++);
   const candidates=[];let total=0;
   for(const A of carrier.KEYS)for(const E of carrier.KEYS)for(const O of carrier.KEYS){if(A===E||E===O||A===O)continue;total++;
    const row={initialMap:{...center.initialMap,A,E,O},finalMap},proxy=inspect(row,true);if(proxy)candidates.push({...row,...proxy});}
   assert.equal(total,stage.totalAssignments);assert.equal(candidates.length,stage.legalAssignments);generated+=total;legalGenerated+=candidates.length;
   const picks=new Map(),add=r=>picks.set(mappingKey(r),r);
   for(const r of candidates)if(r.initialMap.A==='R'&&((r.initialMap.E==='F')!==(r.initialMap.O==='F')))add(r);
   for(const penalty of report.contract.proxyPenalties)for(const r of [...candidates].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)||mappingKey(a).localeCompare(mappingKey(b))).slice(0,report.contract.topPerPenalty))add(r);
   let rng=stage.randomSeed;const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)/4294967296;};
   while(picks.size<Math.min(report.contract.screenPerRepair,candidates.length))add(candidates[Math.floor(random()*candidates.length)]);
   assert.deepEqual(new Set(stage.selectedIds.map(id=>mappingKey(get(id)))),new Set(picks.keys()));
   for(const row of picks.values())accept(row);
   assert.equal(stage.controlIds.length,2);for(const [i,s]of ['RRR','RFF'].entries()){
    const row={initialMap:{...center.initialMap,A:s[0],E:s[1],O:s[2]},finalMap};assert.ok(legal(search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput)));
    assert.equal(mappingKey(get(stage.controlIds[i])),mappingKey(row));accept(row);}
   coverage.push({name:stage.name,center:center.id,repair:stage.repair.mutation,generatedAssignments:total,legalAssignments:candidates.length,exactLayouts:keys.size,missing:0});
  }else{
   assert.equal(stage.name,'complete carrier/final leader ring');for(const n of neighbors(center))accept({...center,...n});
   assert.equal(keys.size,stage.legalUnique);assert.deepEqual(keys,new Set(stage.selectedIds.map(id=>mappingKey(get(id)))));
   coverage.push({name:stage.name,center:center.id,exactLayouts:keys.size,missing:0});
  }
  assert.ok([...keys].every(k=>known.has(k)));assert.equal([...keys].filter(k=>!beforeKeys.has(k)).length,stage.newExactStates);
  const values=[...keys].map(k=>known.get(k));assert.ok(Math.abs(stage.best1x.score-Math.min(...values.map(r=>r.score)))<1e-12);assert.ok(Math.abs(stage.best2x.doubledScore-Math.min(...values.map(r=>r.doubledScore)))<1e-12);
  for(const key of keys){beforeKeys.add(key);union.add(key);}
 }
 const expectedRepairs=report.seeds.flatMap(seed=>independentRepairs(seed).map(f=>seed.id+'|'+FINALS.map(k=>f[k]).join('')));assert.deepEqual(repairsSeen,new Set(expectedRepairs));assert.ok([...seen].every(k=>union.has(k)));
 const closure=report.closure.map(c=>{
  const route=[...known.values()].filter(r=>r.audit?.actual?.[1]===21&&carrier.fixedExceptAEO(r.initialMap,report.baseInitialMap)&&aeo.carrierCount(r)===3),leader=[...route].sort((a,b)=>a[c.axis]-b[c.axis]||a.id.localeCompare(b.id))[0];assert.equal(leader.id,c.leader);
  const complete=report.stages.some(s=>s.name==='complete carrier/final leader ring'&&s.center===leader.id);assert.equal(complete,c.fixedPolicyOneStepClosed);
  let tripleClosed=complete,allClosed=complete;
  if(complete)for(const n of neighbors(leader)){const e=search.rebuild({...template,...leader,...n},prior.auditInput);if(!legal(search.audit(e,prior.auditInput)))continue;
   const r=known.get(mappingKey(e));assert.ok(r);if(r[c.axis]<leader[c.axis]-1e-12){allClosed=false;if(aeo.carrierCount(r)===3)tripleClosed=false;}}
  return {axis:c.axis,leader:leader.id,score:leader[c.axis],completeNeighborhoodScored:complete,threeCarrierOneStepClosed:tripleClosed,allCarrierCountsOneStepClosed:allClosed};
 });
 const rows=selected(report),out={completed:false,reference:prior.reference,auditInput:prior.auditInput,newStates:seen.size,coverage,uniqueCoveredLayouts:union.size,generatedCarrierAssignments:generated,legalGeneratedCarrierAssignments:legalGenerated,closure,selectedIds:rows.map(r=>r.id),results:[]};
 for(const row of rows){const file=aeo.PREFIX+'-replay-'+row.id+'.json';if(!fs.existsSync(file)){const p=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(p.status,0,row.id);}
  const replay=read(file);check(replay.sourceHashes);assert.deepEqual(replay.initialMap,row.initialMap);assert.deepEqual(replay.finalMap,row.finalMap);out.results.push(replay);retainPolicy(row,prior.reference);}
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[aeo.PREFIX+'.json']:hash(aeo.PREFIX+'.json')};fs.writeFileSync(aeo.PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({verified:out.selectedIds,newStates:seen.size,coverage:union.size,generatedCarrierAssignments:generated,legalGeneratedCarrierAssignments:legalGenerated,closure}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={selected};
