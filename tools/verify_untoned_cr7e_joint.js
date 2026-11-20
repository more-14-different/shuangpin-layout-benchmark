'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const aeo=require('./search_untoned_cr7e_joint'),carrier=require('./search_untoned_cr7e_aeo42'),drop=require('./search_untoned_cr7e_dropfinal'),restore=require('./search_untoned_cr7e_restored21'),search=require('./search_untoned_cr7e_v52'),fair=require('./search_untoned_cr7e_u7e_fair');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=hashes=>{for(const[p,h]of Object.entries(hashes))assert.equal(hash(p),h,p);};
const selected=aeo.selected;
async function main(){
 const report=read(aeo.PREFIX+'.json'),{prior,known:imported,anchors}=aeo.inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const known=new Map([...imported,...Object.values(report.states).map(r=>[mappingKey(r),r])]);const byId=new Map([...known.values(),...anchors].map(r=>[r.id,r])),get=id=>{const r=byId.get(id);assert.ok(r,id);return r;};
 const args=process.argv.slice(2),flag=['--entry','--policy'].find(f=>args.includes(f)),id=flag?args[args.indexOf(flag)+1]:null;
 if(id){
  const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
  const html=path.join(ROOT,'a7_CKT_R11.html'),data=scorer.loadPayload(html),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');assert.deepEqual(data.base,prior.auditInput.base);assert.deepEqual(data.pinyin,prior.auditInput.pinyin);
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=get(id),entry=search.rebuild({...template,...row},data),domain=row.audit.actual[1],audit=domain===20?drop.audit(entry,data,'Z'):search.audit(entry,data);assert.deepEqual(audit,row.audit);assert.ok(audit.valid&&audit.branches===0&&audit.D===2&&[41,42].includes(audit.M));assert.equal(audit.D<=2,true);
  const semantics=auxiliarySemantics(entry.tone);assert.equal(semantics.toneKeysByTone,'IVUAO');assert.equal(semantics.shapeKeysByMeaning,'AVUIO');
  const inputs=[__filename,path.join(ROOT,'tools/search_untoned_cr7e_joint.js'),html,profile,...['score_ckt_v52.js','score_completion_ckt_v4.js','verify_untoned_cr7e_v52.js','ckt_v4_model.js','ckt_block_error.js','auxiliary_semantics.js'].map(p=>path.join(ROOT,'tools',p)),
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
  const out={id,family:'adaptive-initial',domain,initialMap:entry.initialMap,finalMap:entry.finalMap,activePhysicalKeys:audit.actual,auxiliarySemantics:semantics,optimal1x:optimum(cases,prior.reference,1),optimal2x:optimum(cases,prior.reference,2),canonicalReplays:[]};
  for(const[key,policy]of new Map([out.optimal1x,out.optimal2x].map(r=>[JSON.stringify(r.policy),r.policy]))){const policies=Object.fromEntries(Object.entries(policy).map(([m,s])=>[m,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,s.split('/')[i]]))]));reset();
   const modes=v52.evaluateUntoned(entry,policies,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);if(key===JSON.stringify(out.optimal1x.policy))assert.ok(Math.abs(score-out.optimal1x.score)<1e-9);if(key===JSON.stringify(out.optimal2x.policy))assert.ok(Math.abs(doubledScore-out.optimal2x.score)<1e-9);out.canonicalReplays.push({policies,score,doubledScore,modes});if(global.gc)global.gc();}
  out.sourceHashes=Object.fromEntries(inputs.map(p=>[p,hash(p)]));fs.writeFileSync(aeo.PREFIX+'-components-'+id+'.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference:prior.reference}))));fs.writeFileSync(aeo.PREFIX+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,one:out.optimal1x,two:out.optimal2x}));return;
 }





 assert.ok(report.completed);check(report.sourceHashes);assert.deepEqual(report.reference,prior.reference);assert.deepEqual(report.contract,aeo.contract);
 const sw=require('./search_untoned_cr7e_switch_open'),inspect=sw.openScreening(prior.auditInput,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),seen=new Set(),beforeKeys=new Set(imported.keys());
 const valid=row=>{const a=search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput);return a.valid&&a.branches===0&&a.D===2&&[41,42].includes(a.M)&&a.V<=5;};
 for(const row of Object.values(report.states)){const key=mappingKey(row);assert.ok(!seen.has(key)&&!beforeKeys.has(key));seen.add(key);assert.ok(valid(row));assert.deepEqual(search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput),row.audit);}
 const tried=new Set(),union=new Set(anchors.map(mappingKey)),coverage=[],min=(rows,axis)=>[...rows].sort((a,b)=>a[axis]-b[axis]||a.id.localeCompare(b.id))[0];assert.equal(report.plans.length,3);assert.equal(report.trials.length,12);
 for(let ai=0;ai<3;ai++){
  const anchor=anchors[ai],p=report.plans[ai],expected=aeo.plan(anchor,inspect,tried,ai);assert.equal(p.anchor,anchor.id);assert.equal(p.initialPoolGenerated,expected.initialPoolGenerated);assert.equal(p.initialPoolLegal,expected.initialPoolLegal);assert.deepEqual(p.beam,expected.beam);assert.deepEqual(p.selected,expected.selected);
  for(const row of p.selected){const k=sw.initialKey(row.reference.initialMap);assert.ok(!tried.has(k));assert.notEqual(k,sw.initialKey(anchor.initialMap));tried.add(k);}
  for(let j=0;j<4;j++){const index=ai*4+j,trial=report.trials[index],axis=j%3===1?'doubledScore':'score';assert.equal(trial.index,index);assert.equal(trial.axis,axis);assert.equal(trial.anchor,anchor.id);assert.ok(trial.completed);assert.deepEqual(trial.reference,p.selected[j].reference);
   const start=get(trial.startId),onset=sw.initialKey(start.initialMap),startKey=mappingKey(start);assert.equal(mappingKey(trial.reference),startKey);assert.deepEqual(start.initialMap,trial.initialMap);assert.equal(beforeKeys.has(startKey)?0:1,trial.newStartStates);beforeKeys.add(startKey);union.add(startKey);let center=start;
   assert.ok(trial.batches.length>=1&&trial.batches.length<=3);
   for(const batch of trial.batches){const seed=20261205+index*100+batch.index;assert.equal(batch.seed,seed);assert.equal(batch.center,center.id);
    const pool=batch.index?sw.finalPool(center,inspect,seed):aeo.jointPool(anchor,trial.reference,inspect,seed),picks=aeo.selectJoint(pool,anchor,seed+1);assert.equal(pool.length,batch.legalPool);assert.equal(picks.length,32);
    const keys=new Set(picks.map(mappingKey));assert.deepEqual(keys,new Set(batch.selectedIds.map(id=>mappingKey(get(id)))));assert.ok(picks.every(r=>sw.initialKey(r.initialMap)===onset&&valid(r)));
    const values=batch.selectedIds.map(get),best=min([center,...values],axis),gain=center[axis]-best[axis];assert.equal(best.id,batch.bestId);assert.equal(batch.gain,gain);assert.equal(batch.continue,gain>=.003&&batch.index+1<3);assert.equal([...keys].filter(k=>!beforeKeys.has(k)).length,batch.newExactStates);
    for(const key of keys){beforeKeys.add(key);union.add(key);}coverage.push({name:'atomic initial-final probe',trial:index,batch:batch.index,exactLayouts:keys.size,newExactStates:batch.newExactStates,missing:0});center=best;
    if(batch.index<trial.batches.length-1)assert.equal(batch.continue,true);
   }
   assert.equal(trial.batches.at(-1).continue,false);assert.equal(center.id,trial.finalId);assert.equal(start[axis]-center[axis],trial.totalGain);assert.equal(anchor[axis]-center[axis],trial.improvementOverAnchor);
   const controlKeys=new Set();for(const [name,row]of Object.entries({initialOnly:{initialMap:center.initialMap,finalMap:anchor.finalMap},finalOnly:{initialMap:anchor.initialMap,finalMap:center.finalMap}})){
    const c=trial.components[name];assert.equal(c.valid,!!valid(row));if(c.valid){assert.equal(mappingKey(get(c.id)),mappingKey(row));controlKeys.add(mappingKey(row));}}
   assert.equal([...controlKeys].filter(k=>!beforeKeys.has(k)).length,trial.newControlStates);for(const key of controlKeys){beforeKeys.add(key);union.add(key);}coverage.push({name:'separate-change interaction controls',trial:index,exactLayouts:controlKeys.size,newExactStates:trial.newControlStates,missing:0});
  }
 }
 assert.ok([...seen].every(k=>union.has(k)));assert.equal(union.size,report.uniqueCoveredLayouts);
 for(const [axis,label]of [['score','bestDefault'],['doubledScore','bestDoubled']])assert.equal(min([...union].map(k=>known.get(k)),axis).id,report[label][0].id);
 const out={completed:false,reference:prior.reference,auditInput:prior.auditInput,newStates:seen.size,uniqueCoveredLayouts:union.size,distinctInitials:tried.size,coverage,selectedIds:selected(report).map(r=>r.id),results:[]};
 for(const row of selected(report)){const file=aeo.PREFIX+'-replay-'+row.id+'.json';if(!fs.existsSync(file)){const p=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(p.status,0,row.id);}
  const replay=read(file);check(replay.sourceHashes);assert.deepEqual(replay.initialMap,row.initialMap);assert.deepEqual(replay.finalMap,row.finalMap);out.results.push(replay);}
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[aeo.PREFIX+'.json']:hash(aeo.PREFIX+'.json')};fs.writeFileSync(aeo.PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({verified:out.selectedIds,newStates:seen.size,coverage:union.size,distinctInitials:tried.size}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={selected};
