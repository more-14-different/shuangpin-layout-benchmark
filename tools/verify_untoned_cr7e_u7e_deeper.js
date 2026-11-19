'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const deeper=require('./search_untoned_cr7e_u7e_deeper'),drop=require('./search_untoned_cr7e_dropfinal'),restore=require('./search_untoned_cr7e_restored21'),search=require('./search_untoned_cr7e_v52'),fair=require('./search_untoned_cr7e_u7e_fair');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=hashes=>{for(const[p,h]of Object.entries(hashes))assert.equal(hash(p),h,p);};
function selected(report){return [...new Map([...report.lanes.flatMap(l=>[...l.best1x,...l.best2x]),...report.bestNew].map(r=>[r.id,r])).values()];}
function retainPolicy(row,reference){const outFile=deeper.PREFIX+'-policy-'+row.id+'.json';if(fs.existsSync(outFile))return;
 const folder=path.join(ROOT,'research/notes'),files=fs.readdirSync(folder).filter(n=>n.startsWith('2026-11-20-untoned-cr7e-')&&n.includes('-policy-')&&n.endsWith('.json')&&!n.includes('u7e-deeper'));
 for(const name of files){const p=path.join(folder,name),old=read(p);if(!old.initialMap||mappingKey(old)!==mappingKey(row))continue;check(old.sourceHashes);
  for(const mult of [1,2]){const best=old['optimal'+mult+'x'],replay=old.canonicalReplays.find(r=>['keytao','sanpin'].every(m=>['word2','word3','word4'].map(k=>r.policies[m][k]).join('/')===best.policy[m]));assert.ok(replay);
   assert.ok(Math.abs(search.normalize(replay.modes,reference,mult)-best.score)<1e-9);}
  const out={...old,id:row.id,family:'U7E',activePhysicalKeys:row.audit.actual,auxiliarySemantics:auxiliarySemantics('IVUAO'),
   sourceHashes:{...old.sourceHashes,[p]:hash(p)},retainedPolicyEnumeration:{source:p,sha256:hash(p),originalId:old.id,reason:'Identical physical map and semantic pairing; archived optimal replays re-normalize to the same reference; fresh fixed-policy native/JS replay is separate.'}};
  fs.writeFileSync(outFile,JSON.stringify(out,null,2)+'\n');console.log('retained policy',row.id);return;
 }
}
async function main(){
 const report=read(deeper.PREFIX+'.json'),{prior,known,seeds}=deeper.inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const importedKeys=new Set(known.keys());for(const row of Object.values(report.states))known.set(mappingKey(row),row);const byId=new Map([...known.values(),...seeds].map(r=>[r.id,r])),get=id=>{const r=byId.get(id);assert.ok(r,id);return r;};
 const args=process.argv.slice(2),flag=['--entry','--policy'].find(f=>args.includes(f)),id=flag?args[args.indexOf(flag)+1]:null;
 if(id){
  const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
  const html=path.join(ROOT,'a7_CKT_R11.html'),data=scorer.loadPayload(html),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');assert.deepEqual(data.base,prior.auditInput.base);assert.deepEqual(data.pinyin,prior.auditInput.pinyin);
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=get(id),entry=search.rebuild({...template,...row},data),domain=row.audit.actual[1],audit=domain===20?drop.audit(entry,data,'Z'):search.audit(entry,data);assert.deepEqual(audit,row.audit);assert.ok(domain===20?drop.legal(audit):legal(audit));assert.ok(fair.sameInitials(entry.initialMap,report.initialMap));
  const semantics=auxiliarySemantics(entry.tone);assert.equal(semantics.toneKeysByTone,'IVUAO');assert.equal(semantics.shapeKeysByMeaning,'AVUIO');
  const inputs=[__filename,path.join(ROOT,'tools/search_untoned_cr7e_u7e_deeper.js'),html,profile,...['score_ckt_v52.js','score_completion_ckt_v4.js','verify_untoned_cr7e_v52.js','ckt_v4_model.js','ckt_block_error.js','auxiliary_semantics.js'].map(p=>path.join(ROOT,'tools',p)),
   'D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml','D:/C2D/Documents/rime-snow-pinyin/rime-stroke/stroke.dict.yaml','D:/C2D/Documents/rime-snow-pinyin/scripts/research/evaluate_ckt_v4_word_aux_order.js','D:/C2D/Documents/rime-snow-pinyin/scripts/research/evaluate_ckt51_aux_order.js'];
  const reset=()=>{ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);};
  if(flag==='--entry'){
   const modes=v52.evaluateUntoned(entry,report.policy,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);assert.ok(Math.abs(score-row.score)<1e-9&&Math.abs(doubledScore-row.doubledScore)<1e-9);
   const native=await require('./untoned_v52_stream_pool').pool(path.join(require('./anneal_untoned_cr7e_far').WORK,'templates.json'),1);let maxTrackDifference=0;
   try{const s=await native.score(entry);for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])for(const[f,v]of Object.entries(modes[mode][kind]))if(typeof v==='number'){const diff=Math.abs(v-s.modes[mode][kind][f]);assert.ok(diff<1e-8,`${id}/${mode}/${kind}/${f}`);maxTrackDifference=Math.max(maxTrackDifference,diff);}}finally{native.close();}
   const out={...row,domain,capacity:[21,21],activePhysicalKeys:audit.actual,tone:entry.tone,auxiliarySemantics:semantics,codeList:entry.codeList,modes,maxTrackDifference,sourceHashes:Object.fromEntries([...inputs,deeper.PREFIX+'.json'].map(p=>[p,hash(p)]))};
   fs.writeFileSync(deeper.PREFIX+'-replay-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,score,doubledScore,maxTrackDifference}));return;
  }
  ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();const cases={};
  for(const mode of ['keytao','sanpin']){ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);cases[mode]=enumerateBounded(entry,mode,ctx);ctx.motor=null;if(global.gc)global.gc();console.log(id,mode,'144 policies');}
  const out={id,family:'U7E',domain,initialMap:entry.initialMap,finalMap:entry.finalMap,activePhysicalKeys:audit.actual,auxiliarySemantics:semantics,optimal1x:optimum(cases,prior.reference,1),optimal2x:optimum(cases,prior.reference,2),canonicalReplays:[]};
  for(const[key,policy]of new Map([out.optimal1x,out.optimal2x].map(r=>[JSON.stringify(r.policy),r.policy]))){const policies=Object.fromEntries(Object.entries(policy).map(([m,s])=>[m,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,s.split('/')[i]]))]));reset();
   const modes=v52.evaluateUntoned(entry,policies,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);if(key===JSON.stringify(out.optimal1x.policy))assert.ok(Math.abs(score-out.optimal1x.score)<1e-9);if(key===JSON.stringify(out.optimal2x.policy))assert.ok(Math.abs(doubledScore-out.optimal2x.score)<1e-9);out.canonicalReplays.push({policies,score,doubledScore,modes});if(global.gc)global.gc();}
  out.sourceHashes=Object.fromEntries(inputs.map(p=>[p,hash(p)]));fs.writeFileSync(deeper.PREFIX+'-components-'+id+'.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference:prior.reference}))));fs.writeFileSync(deeper.PREFIX+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,one:out.optimal1x,two:out.optimal2x}));return;
 }
 assert.ok(report.completed);check(report.sourceHashes);assert.deepEqual(report.reference,prior.reference);const seen=new Set();
 for(const row of Object.values(report.states)){const key=mappingKey(row);assert.ok(!seen.has(key)&&!importedKeys.has(key));seen.add(key);assert.ok(fair.sameInitials(row.initialMap,report.initialMap));const e=search.rebuild({...template,...row},prior.auditInput),audit=row.domain===20?drop.audit(e,prior.auditInput,'Z'):search.audit(e,prior.auditInput);assert.deepEqual(audit,row.audit);assert.ok(row.domain===20?drop.legal(audit):legal(audit));}
 const coverage=[],union=new Set();
 for(const stage of report.stages){const keys=new Set();
  const accept=row=>{const e=search.rebuild({...template,...row},prior.auditInput),a=stage.domain===20?drop.audit(e,prior.auditInput,'Z'):search.audit(e,prior.auditInput);if(stage.domain===20?drop.legal(a):legal(a)){keys.add(mappingKey(e));return true;}return false;};
  if(stage.name==='restorations after Z descent'){
   for(const g of stage.groups){let total=0,valid=0;for(const n of restore.restorations(get(g.parent).finalMap,get(g.original).finalMap,'Z')){total++;if(accept({...get(g.parent),...n}))valid++;}assert.equal(total,g.total);assert.equal(valid,g.legal);}
  }else if(stage.name==='measured disjoint joint changes'){
   const center=get(stage.center),beam=stage.componentIds.map(get),componentKeys=new Set(search.neighbors(center).map(n=>mappingKey({...center,...n})));let pairs=0,disjoint=0,valid=0;
   const expectedBeam=new Map();for(const n of search.neighbors(center)){const e=search.rebuild({...template,...center,...n},prior.auditInput);if(legal(search.audit(e,prior.auditInput)))expectedBeam.set(mappingKey(e),known.get(mappingKey(e)));}
   assert.deepEqual(deeper.componentIds([...expectedBeam.values()]).map(r=>r.id),stage.componentIds);
   for(const c of beam)assert.ok(componentKeys.has(mappingKey(c)));
   for(let a=0;a<beam.length;a++)for(let b=a+1;b<beam.length;b++){pairs++;const fm=deeper.jointDisjoint(center.finalMap,beam[a].finalMap,beam[b].finalMap);if(!fm)continue;disjoint++;if(accept({...center,finalMap:fm}))valid++;}
   assert.equal(pairs,stage.pairs);assert.equal(disjoint,stage.disjoint);assert.equal(valid,stage.legalPairs);
   for(const c of stage.combinations){const fm=deeper.jointDisjoint(center.finalMap,get(c.components[0]).finalMap,get(c.components[1]).finalMap);assert.deepEqual(fm,get(c.id).finalMap);}
  }else{const center=get(stage.center);for(const n of search.neighbors(center))accept({...center,...n});}
  assert.equal(keys.size,stage.legalUnique);assert.ok([...keys].every(k=>known.has(k)),'missing exact candidate');if(stage.best1x){const rows=[...keys].map(k=>known.get(k));assert.ok(Math.abs(Math.min(...rows.map(r=>r.score))-stage.best1x.score)<1e-12);assert.ok(Math.abs(Math.min(...rows.map(r=>r.doubledScore))-stage.best2x.doubledScore)<1e-12);}
  for(const k of keys)union.add(k);coverage.push({name:stage.name,center:stage.center,domain:stage.domain,legalUnique:keys.size,missing:0});
 }
 for(const p of report.paths){let current=p.seedId;for(const step of p.steps){assert.equal(step.from,current);const s=report.stages.find(s=>s.name==='open 21-key path ring'&&s.center===current);assert.ok(s);const best=p.axis==='score'?s.best1x:s.best2x;assert.equal(step.to,best.id);const improves=best[p.axis]<get(current)[p.axis]-1e-12;assert.equal(step.improves,improves);if(improves)current=best.id;}assert.equal(current,p.currentId);if(p.closed)assert.equal(p.steps.at(-1).improves,false);}
 for(const c of report.closure){const leader=[...known.values()].filter(r=>r.audit?.actual?.[1]===c.domain&&(c.domain!==20||r.forbiddenFinalKey==='Z')).sort((a,b)=>a[c.axis]-b[c.axis])[0];assert.equal(leader.id,c.leader);const closed=report.stages.some(s=>s.name.includes('ring')&&s.center===leader.id);assert.equal(closed,c.fixedPolicyOneStepClosed);
  if(closed)for(const n of search.neighbors(leader)){const e=search.rebuild({...template,...leader,...n},prior.auditInput),a=c.domain===20?drop.audit(e,prior.auditInput,'Z'):search.audit(e,prior.auditInput);if(c.domain===20?drop.legal(a):legal(a))assert.ok(known.get(mappingKey(e))[c.axis]>=leader[c.axis]-1e-12);}}
 const rows=selected(report),out={completed:false,reference:prior.reference,auditInput:prior.auditInput,newStates:seen.size,coverage,uniqueCoveredLayouts:union.size,closure:report.closure,selectedIds:rows.map(r=>r.id),results:[]};
 for(const row of rows){const file=deeper.PREFIX+'-replay-'+row.id+'.json';if(!fs.existsSync(file)){const p=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(p.status,0,row.id);}
  const replay=read(file);check(replay.sourceHashes);assert.deepEqual(replay.initialMap,row.initialMap);assert.deepEqual(replay.finalMap,row.finalMap);out.results.push(replay);retainPolicy(row,prior.reference);}
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[deeper.PREFIX+'.json']:hash(deeper.PREFIX+'.json')};fs.writeFileSync(deeper.PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({verified:out.selectedIds,newStates:seen.size,coverage:union.size,closure:out.closure}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={selected};
