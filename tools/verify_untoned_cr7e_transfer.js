'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const aeo=require('./search_untoned_cr7e_transfer'),carrier=require('./search_untoned_cr7e_aeo42'),drop=require('./search_untoned_cr7e_dropfinal'),restore=require('./search_untoned_cr7e_restored21'),search=require('./search_untoned_cr7e_v52'),fair=require('./search_untoned_cr7e_u7e_fair');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=hashes=>{for(const[p,h]of Object.entries(hashes))assert.equal(hash(p),h,p);};
const selected=aeo.selected;
async function main(){
 const report=read(aeo.PREFIX+'.json'),{prior,seeds}=aeo.inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const known=new Map(Object.values(report.states).map(r=>[mappingKey(r),r]));const byId=new Map([...known.values(),...seeds].map(r=>[r.id,r])),get=id=>{const r=byId.get(id);assert.ok(r,id);return r;};
 const args=process.argv.slice(2),flag=['--entry','--policy'].find(f=>args.includes(f)),id=flag?args[args.indexOf(flag)+1]:null;
 if(id){
  const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
  const html=path.join(ROOT,'a7_CKT_R11.html'),data=scorer.loadPayload(html),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');assert.deepEqual(data.base,prior.auditInput.base);assert.deepEqual(data.pinyin,prior.auditInput.pinyin);
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=get(id),entry=search.rebuild({...template,...row},data),domain=row.audit.actual[1],audit=domain===20?drop.audit(entry,data,'Z'):search.audit(entry,data);assert.deepEqual(audit,row.audit);assert.ok(domain===20?drop.legal(audit):legal(audit));assert.equal(audit.D<=2,true);
  const semantics=auxiliarySemantics(entry.tone);assert.equal(semantics.toneKeysByTone,'IVUAO');assert.equal(semantics.shapeKeysByMeaning,'AVUIO');
  const inputs=[__filename,path.join(ROOT,'tools/search_untoned_cr7e_transfer.js'),html,profile,...['score_ckt_v52.js','score_completion_ckt_v4.js','verify_untoned_cr7e_v52.js','ckt_v4_model.js','ckt_block_error.js','auxiliary_semantics.js'].map(p=>path.join(ROOT,'tools',p)),
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
  const out={id,family:row.family,domain,initialMap:entry.initialMap,finalMap:entry.finalMap,activePhysicalKeys:audit.actual,auxiliarySemantics:semantics,optimal1x:optimum(cases,prior.reference,1),optimal2x:optimum(cases,prior.reference,2),canonicalReplays:[]};
  for(const[key,policy]of new Map([out.optimal1x,out.optimal2x].map(r=>[JSON.stringify(r.policy),r.policy]))){const policies=Object.fromEntries(Object.entries(policy).map(([m,s])=>[m,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,s.split('/')[i]]))]));reset();
   const modes=v52.evaluateUntoned(entry,policies,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);if(key===JSON.stringify(out.optimal1x.policy))assert.ok(Math.abs(score-out.optimal1x.score)<1e-9);if(key===JSON.stringify(out.optimal2x.policy))assert.ok(Math.abs(doubledScore-out.optimal2x.score)<1e-9);out.canonicalReplays.push({policies,score,doubledScore,modes});if(global.gc)global.gc();}
  out.sourceHashes=Object.fromEntries(inputs.map(p=>[p,hash(p)]));fs.writeFileSync(aeo.PREFIX+'-components-'+id+'.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference:prior.reference}))));fs.writeFileSync(aeo.PREFIX+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,one:out.optimal1x,two:out.optimal2x}));return;
 }



 assert.ok(report.completed);check(report.sourceHashes);assert.deepEqual(report.reference,prior.reference);
 const inspect=require('./search_untoned_cr7e_coupled').screening(prior.auditInput,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),{FINALS}=require('./ckt_v4_scheme_fixture'),familyById=new Map(report.families.map(f=>[f.id,f]));
 const valid=(row,family)=>{const audit=search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput);return legal(audit)&&audit.D===2&&[41,42].includes(audit.M)&&(!family.pinE||row.finalMap.e==='E');};
 const seen=new Set();for(const row of Object.values(report.states)){const family=familyById.get(row.family);assert.ok(family);assert.deepEqual(row.initialMap,family.initialMap);const audit=search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput);assert.deepEqual(audit,row.audit);assert.ok(valid(row,family));const key=mappingKey(row);assert.ok(!seen.has(key));seen.add(key);}
 const coverage=[],union=new Set(),beforeKeys=new Set(),initialStages=report.stages.filter(s=>s.name!=='complete final leader ring');
 const min=(rows,axis)=>[...rows].sort((a,b)=>a[axis]-b[axis]||a.id.localeCompare(b.id))[0];
 for(const stage of initialStages){const family=familyById.get(stage.family),keys=new Set();
  if(stage.name==='seed transplants'){
   for(const seed of report.seeds){const base={...seed.finalMap};if(family.id.startsWith('U'))[base.ao,base.uai]=[base.uai,base.ao];const maps=[];
    if(!family.pinE)maps.push(base);else for(const repair of ['en','iu','group']){const fm={...base},old=fm.e;if(repair==='group'){for(const f of FINALS)if(f!=='e'&&fm[f]==='E')fm[f]=old;}else fm[repair]=old;fm.e='E';maps.push(fm);}
    for(const finalMap of maps){const row={initialMap:family.initialMap,finalMap};if(valid(row,family))keys.add(mappingKey(row));}}
  }else{
   assert.equal(stage.name,'foreign final centers');const base=read(aeo.UM).finalMap,rng={state:20261128+family.id.charCodeAt(0)*101+Number(family.id[1])};
   const random=()=>{let x=rng.state>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;rng.state=x>>>0;return rng.state/4294967296;};
   const candidates=new Map();let attempts=0;while(candidates.size<160&&attempts++<50000){const fm={...base};for(const f of FINALS)if('AIOUV'.includes(fm[f]))fm[f]=aeo.KEYS[Math.floor(random()*aeo.KEYS.length)];
    for(const f of FINALS)if(base[f]==='Q')fm[f]='K';else if(base[f]==='Z')fm[f]='C';fm.ia='Q';fm.uai='Z';if(family.pinE){fm.e='E';fm.a='H';}
    const row={initialMap:family.initialMap,finalMap:fm},a=inspect(row,true),key=mappingKey(row);if(a&&a.D===2&&[41,42].includes(a.M)&&(!family.pinE||fm.e==='E')&&!beforeKeys.has(key))candidates.set(key,{finalMap:fm,...a});}
   assert.equal(candidates.size,160);assert.equal(attempts,stage.attempts);const list=[...candidates.values()];assert.deepEqual(list.map(r=>r.finalMap),stage.candidateFinalMaps);
   const picks=new Map();for(const penalty of [0,150,300,600,1200])for(const r of [...list].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)).slice(0,3))picks.set(JSON.stringify(r.finalMap),r);
   while(picks.size<24){const r=list[Math.floor(random()*list.length)];picks.set(JSON.stringify(r.finalMap),r);}assert.equal(rng.state,stage.rngAfter);
   for(const r of picks.values()){const row={initialMap:family.initialMap,finalMap:r.finalMap};assert.ok(valid(row,family));keys.add(mappingKey(row));}
  }
  assert.deepEqual(keys,new Set(stage.selectedIds.map(id=>mappingKey(get(id)))));assert.equal([...keys].filter(k=>!beforeKeys.has(k)).length,stage.newExactStates);
  for(const k of keys){beforeKeys.add(k);union.add(k);}coverage.push({name:stage.name,family:stage.family,exactLayouts:keys.size,missing:0});
 }
 assert.equal(initialStages.length,2*report.families.length);
 const ownedNew=new Set();
 for(const chain of report.chains){const family=familyById.get(chain.family),trajectory=report.trajectory.filter(t=>t.chain===chain.index),restarts=[...chain.restarts];let current=get(chain.seedId),best=current,count=0,acceptedCount=0;
  const chainKeys=new Set([mappingKey(current)]),own=(r,fresh)=>{chainKeys.add(mappingKey(r));if(fresh){const k=mappingKey(r);assert.ok(!beforeKeys.has(k)&&!ownedNew.has(k));ownedNew.add(k);count++;}};
  for(const t of trajectory){const step=count,restart=restarts.find(r=>r.at===step&&!r.used);if(restart){assert.equal(restart.from,best.id);const r=get(restart.to);assert.equal(r.family,chain.family);own(r,restart.newScore);current=r;if(r[chain.objective]<best[chain.objective])best=r;restart.used=true;}
   assert.equal(t.step,step);assert.equal(t.from,current.id);const r=get(t.to);assert.equal(r.family,chain.family);const phase=aeo.schedule(step);assert.equal(t.phase,phase.phase);assert.equal(t.temperature,phase.temperature);
   const delta=r[chain.objective]-current[chain.objective],accepted=delta<=0||t.rngAfter/4294967296<Math.exp(-delta/t.temperature);assert.equal(t.accepted,accepted);own(r,t.newScore);
   if(accepted){current=r;acceptedCount++;}if(r[chain.objective]<best[chain.objective])best=r;
  }
  // A final fresh restart can consume the remaining budget before another transition.
  for(const restart of restarts.filter(r=>!r.used)){assert.equal(restart.at,count);assert.equal(restart.from,best.id);const r=get(restart.to);own(r,restart.newScore);current=r;if(r[chain.objective]<best[chain.objective])best=r;restart.used=true;}
  assert.equal(count,family.lane==='primary'?350:100);assert.equal(count,chain.newScores);assert.equal(trajectory.length,chain.transitions);assert.equal(acceptedCount,chain.accepted);assert.equal(current.id,chain.currentId);assert.equal(best.id,chain.bestId);
  for(const k of chainKeys)union.add(k);coverage.push({name:'anneal trajectory and restarts',family:family.id,chain:chain.index,exactLayouts:chainKeys.size,newScores:count,missing:0});
 }
 assert.equal(report.chains.length,2*report.families.length);assert.equal(ownedNew.size,1800);for(const k of union)beforeKeys.add(k);
 for(const stage of report.stages.filter(s=>s.name==='complete final leader ring')){const center=get(stage.center),family=familyById.get(center.family),keys=new Set();for(const n of search.neighbors(center)){const row={...center,...n};if(valid(row,family))keys.add(mappingKey(row));}
  assert.equal(keys.size,stage.legalUnique);assert.deepEqual(keys,new Set(stage.selectedIds.map(id=>mappingKey(get(id)))));assert.equal([...keys].filter(k=>!beforeKeys.has(k)).length,stage.newExactStates);
  for(const k of keys){beforeKeys.add(k);union.add(k);}coverage.push({name:stage.name,lane:stage.lane,center:center.id,exactLayouts:keys.size,missing:0});}
 assert.deepEqual(union,seen);
 const closure=report.closure.map(c=>{const rows=[...known.values()].filter(r=>familyById.get(r.family).lane===c.lane),leader=min(rows,c.axis);assert.equal(leader.id,c.leader);const family=familyById.get(leader.family),complete=report.stages.some(s=>s.name==='complete final leader ring'&&s.center===leader.id);assert.equal(complete,c.completeNeighborhoodScored);let closed=complete;
  if(complete)for(const n of search.neighbors(leader)){const row={...leader,...n};if(!valid(row,family))continue;const r=known.get(mappingKey(row));assert.ok(r);if(r[c.axis]<leader[c.axis]-1e-12)closed=false;}
  return {...c,fixedPolicyFinalOneStepClosed:closed};});
 const out={completed:false,reference:prior.reference,auditInput:prior.auditInput,newStates:seen.size,uniqueCoveredLayouts:union.size,coverage,closure,selectedIds:selected(report).map(r=>r.id),results:[]};
 for(const row of selected(report)){const file=aeo.PREFIX+'-replay-'+row.id+'.json';if(!fs.existsSync(file)){const p=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(p.status,0,row.id);}
  const replay=read(file);check(replay.sourceHashes);assert.deepEqual(replay.initialMap,row.initialMap);assert.deepEqual(replay.finalMap,row.finalMap);out.results.push(replay);}
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[aeo.PREFIX+'.json']:hash(aeo.PREFIX+'.json')};fs.writeFileSync(aeo.PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({verified:out.selectedIds,newStates:seen.size,coverage:union.size,closure}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={selected};
