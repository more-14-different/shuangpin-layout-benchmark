'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const aeo=require('./search_untoned_cr7e_joint_relabel'),carrier=require('./search_untoned_cr7e_aeo42'),drop=require('./search_untoned_cr7e_dropfinal'),restore=require('./search_untoned_cr7e_restored21'),search=require('./search_untoned_cr7e_v52'),fair=require('./search_untoned_cr7e_u7e_fair');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=hashes=>{for(const[p,h]of Object.entries(hashes))assert.equal(hash(p),h,p);};
const selected=report=>[...new Map([report.bestDefault[0],report.bestDoubled[0]].map(r=>[r.id,r])).values()];
async function main(){
 const report=read(aeo.PREFIX+'.json'),{prior,known:imported,anchors}=aeo.inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const known=new Map([...imported,...Object.values(report.states).map(r=>[mappingKey(r),r])]);const byId=new Map([...known.values(),...anchors].map(r=>[r.id,r])),get=id=>{const r=byId.get(id);assert.ok(r,id);return r;};
 const args=process.argv.slice(2),flag=['--entry','--policy'].find(f=>args.includes(f)),id=flag?args[args.indexOf(flag)+1]:null;
 if(id){
  const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
  const html=path.join(ROOT,'a7_CKT_R11.html'),data=scorer.loadPayload(html),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');assert.deepEqual(data.base,prior.auditInput.base);assert.deepEqual(data.pinyin,prior.auditInput.pinyin);
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=get(id),entry=search.rebuild({...template,...row},data),domain=row.audit.actual[1],audit=domain===20?drop.audit(entry,data,'Z'):search.audit(entry,data);assert.deepEqual(audit,row.audit);assert.ok(audit.valid&&audit.branches===0&&audit.D===2&&[41,42].includes(audit.M));assert.equal(audit.D<=2,true);
  const semantics=auxiliarySemantics(entry.tone);assert.equal(semantics.toneKeysByTone,'IVUAO');assert.equal(semantics.shapeKeysByMeaning,'AVUIO');
  const inputs=[__filename,path.join(ROOT,'tools/search_untoned_cr7e_joint_relabel.js'),html,profile,...['score_ckt_v52.js','score_completion_ckt_v4.js','verify_untoned_cr7e_v52.js','ckt_v4_model.js','ckt_block_error.js','auxiliary_semantics.js'].map(p=>path.join(ROOT,'tools',p)),
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






 assert.ok(report.completed);check(report.sourceHashes);assert.deepEqual(report.reference,prior.reference);const sw=require('./search_untoned_cr7e_switch_open'),inspect=sw.openScreening(prior.auditInput,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),seen=new Set(),union=new Set(),coverage=[];
 for(const r of Object.values(report.states)){const key=mappingKey(r);assert.ok(!seen.has(key));seen.add(key);const e=search.rebuild({...template,...r},prior.auditInput);assert.deepEqual(search.audit(e,prior.auditInput),r.audit);assert.ok(sw.valid(r,inspect));}
 for(const stage of report.stages){const anchor=get(stage.anchor),keys=new Set(),original=search.rebuild({...template,...anchor},prior.auditInput);let generated=0;
  for(const cycle of aeo.cycles()){generated++;const row=aeo.relabel(anchor,cycle);if(!sw.valid(row,inspect))continue;const key=mappingKey(row),r=known.get(key);assert.ok(r);assert.deepEqual(r.cycle,cycle);
   const entry=search.rebuild({...template,...row},prior.auditInput);assert.deepEqual(aeo.partition(original.codeList,prior.auditInput.base),aeo.partition(entry.codeList,prior.auditInput.base));assert.equal(r.audit.unique,anchor.audit.unique);keys.add(key);}
  assert.equal(generated,2870);assert.equal(generated,stage.generated);assert.equal(keys.size,stage.legal);assert.deepEqual(keys,new Set(stage.selectedIds.map(id=>mappingKey(get(id)))));for(const k of keys)union.add(k);coverage.push({anchor:anchor.id,generated,exactLayouts:keys.size,collisionPartitionPreserved:true,missing:0});
 }
 assert.equal(report.stages.length,3);assert.deepEqual(union,seen);
 const out={completed:false,reference:prior.reference,auditInput:prior.auditInput,exactLayouts:seen.size,coverage,selectedIds:selected(report).map(r=>r.id),results:[]};
 for(const row of selected(report)){const file=aeo.PREFIX+'-replay-'+row.id+'.json';if(!fs.existsSync(file)){const p=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(p.status,0,row.id);}
  const replay=read(file);check(replay.sourceHashes);out.results.push(replay);}
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[aeo.PREFIX+'.json']:hash(aeo.PREFIX+'.json')};fs.writeFileSync(aeo.PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({verified:out.selectedIds,exactLayouts:seen.size,coverage}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={selected};
