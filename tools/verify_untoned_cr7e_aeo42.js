'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const aeo=require('./search_untoned_cr7e_aeo42'),drop=require('./search_untoned_cr7e_dropfinal'),restore=require('./search_untoned_cr7e_restored21'),search=require('./search_untoned_cr7e_v52'),fair=require('./search_untoned_cr7e_u7e_fair');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=hashes=>{for(const[p,h]of Object.entries(hashes))assert.equal(hash(p),h,p);};
function selected(report){return [...new Map([...report.bestDefault.slice(0,2),...report.bestDoubled.slice(0,2)].map(r=>[r.id,r])).values()];}
function retainPolicy(row,reference){const outFile=aeo.PREFIX+'-policy-'+row.id+'.json';if(fs.existsSync(outFile))return;
 const folder=path.join(ROOT,'research/notes'),files=fs.readdirSync(folder).filter(n=>n.startsWith('2026-11-20-untoned-cr7e-')&&n.includes('-policy-')&&n.endsWith('.json')&&!n.includes('aeo42'));
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
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=get(id),entry=search.rebuild({...template,...row},data),domain=row.audit.actual[1],audit=domain===20?drop.audit(entry,data,'Z'):search.audit(entry,data);assert.deepEqual(audit,row.audit);assert.ok(domain===20?drop.legal(audit):legal(audit));assert.ok(aeo.fixedExceptAEO(entry.initialMap,report.baseInitialMap));
  const semantics=auxiliarySemantics(entry.tone);assert.equal(semantics.toneKeysByTone,'IVUAO');assert.equal(semantics.shapeKeysByMeaning,'AVUIO');
  const inputs=[__filename,path.join(ROOT,'tools/search_untoned_cr7e_aeo42.js'),html,profile,...['score_ckt_v52.js','score_completion_ckt_v4.js','verify_untoned_cr7e_v52.js','ckt_v4_model.js','ckt_block_error.js','auxiliary_semantics.js'].map(p=>path.join(ROOT,'tools',p)),
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
 for(const row of Object.values(report.states)){const key=mappingKey(row);assert.ok(!seen.has(key)&&!importedKeys.has(key));seen.add(key);assert.ok(aeo.fixedExceptAEO(row.initialMap,report.baseInitialMap));
  const e=search.rebuild({...template,...row},prior.auditInput),audit=search.audit(e,prior.auditInput);assert.deepEqual(audit,row.audit);assert.ok(legal(audit));}
 const coverage=[],union=new Set(),beforeKeys=new Set(importedKeys);
 for(const stage of report.stages){const keys=new Set(),center=get(stage.center),accept=row=>{const e=search.rebuild({...template,...row},prior.auditInput);if(!legal(search.audit(e,prior.auditInput)))return false;keys.add(mappingKey(e));return true;};
  if(stage.name==='complete AEO sweep'){
   let total=0;for(const initialMap of aeo.carriers(center.initialMap)){total++;accept({...center,initialMap});}assert.equal(total,stage.total);
   const n=get(stage.sharedN.id);assert.deepEqual(n.finalMap,center.finalMap);assert.ok(['A','E','O'].every(h=>n.initialMap[h]==='N'));assert.equal(n.audit.M,41);
   const shared=[...keys].map(k=>known.get(k)).filter(r=>new Set(['A','E','O'].map(h=>r.initialMap[h])).size===1);assert.ok(Math.abs(stage.sharedBest.score-Math.min(...shared.map(r=>r.score)))<1e-12);
  }else if(stage.name==='joint memory repair'){
   const pool=new Set();for(const n of search.neighbors(center))for(const m of aeo.aeoNeighbors(center.initialMap,n.finalMap)){
    const e=search.rebuild({...template,initialMap:m.initialMap,finalMap:n.finalMap},prior.auditInput);if(legal(search.audit(e,prior.auditInput)))pool.add(mappingKey(e));}
   const novel=[...pool].filter(k=>!beforeKeys.has(k));assert.equal(novel.length,stage.legalNovelUnique);
   assert.equal(stage.selectedIds.length,Math.min(60,novel.length));for(const id of stage.selectedIds){const key=mappingKey(get(id));assert.ok(pool.has(key)&&!beforeKeys.has(key));keys.add(key);}
  }else{
   for(const n of [...search.neighbors(center).map(n=>({initialMap:center.initialMap,...n})),...aeo.aeoNeighbors(center.initialMap,center.finalMap)])accept({...center,...n});
  }
  if(stage.legalUnique!==undefined)assert.equal(keys.size,stage.legalUnique);assert.ok([...keys].every(k=>known.has(k)),'missing exact candidate');
  assert.equal([...keys].filter(k=>!beforeKeys.has(k)).length,stage.newExactStates,'stage new-state accounting');
  if(stage.best1x){const values=[...keys].map(k=>known.get(k));assert.ok(Math.abs(stage.best1x.score-Math.min(...values.map(r=>r.score)))<1e-12);assert.ok(Math.abs(stage.best2x.doubledScore-Math.min(...values.map(r=>r.doubledScore)))<1e-12);}
  for(const key of keys){beforeKeys.add(key);union.add(key);}coverage.push({name:stage.name,center:stage.center,exactLayouts:keys.size,missing:0});
 }
 assert.ok([...seen].every(k=>union.has(k)),'new state outside recorded stages');
 for(const c of report.closure){const values=[...known.values()].filter(r=>r.audit?.actual?.[1]===21&&aeo.fixedExceptAEO(r.initialMap,report.baseInitialMap)),leader=values.sort((a,b)=>a[c.axis]-b[c.axis])[0];assert.equal(leader.id,c.leader);
  const closed=report.stages.some(s=>s.name.includes('leader ring')&&s.center===leader.id);assert.equal(closed,c.fixedPolicyOneStepClosed);
  if(closed)for(const n of [...search.neighbors(leader).map(n=>({initialMap:leader.initialMap,...n})),...aeo.aeoNeighbors(leader.initialMap,leader.finalMap)]){
   const e=search.rebuild({...template,...leader,...n},prior.auditInput);if(legal(search.audit(e,prior.auditInput)))assert.ok(known.get(mappingKey(e))[c.axis]>=leader[c.axis]-1e-12);}}
 const rows=selected(report),out={completed:false,reference:prior.reference,auditInput:prior.auditInput,newStates:seen.size,coverage,uniqueCoveredLayouts:union.size,closure:report.closure,selectedIds:rows.map(r=>r.id),results:[]};
 for(const row of rows){const file=aeo.PREFIX+'-replay-'+row.id+'.json';if(!fs.existsSync(file)){const p=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(p.status,0,row.id);}
  const replay=read(file);check(replay.sourceHashes);assert.deepEqual(replay.initialMap,row.initialMap);assert.deepEqual(replay.finalMap,row.finalMap);out.results.push(replay);retainPolicy(row,prior.reference);}
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[aeo.PREFIX+'.json']:hash(aeo.PREFIX+'.json')};fs.writeFileSync(aeo.PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({verified:out.selectedIds,newStates:seen.size,coverage:union.size,closure:out.closure}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={selected};
