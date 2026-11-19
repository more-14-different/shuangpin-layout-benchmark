'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const cross=require('./search_untoned_cr7e_crosswide'),blocks=require('./search_untoned_cr7e_blocks'),recovery=require('./anneal_untoned_cr7e_recovery'),far=require('./anneal_untoned_cr7e_far');
const search=require('./search_untoned_cr7e_v52'),{mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function main(){
 const report=read(cross.PREFIX+'.json'),imports=[far.PREFIX,recovery.PREFIX,blocks.PREFIX].map(p=>read(p+'.json'));
 const prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 const get=id=>report.states[id]||imports.map(r=>r.states[id]).find(Boolean),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const args=process.argv.slice(2),flag=['--entry','--policy'].find(f=>args.includes(f)),id=flag?args[args.indexOf(flag)+1]:null;
 if(id){
  const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
  const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html')),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=get(id);assert.ok(row,id);const entry=search.rebuild({...template,...row},data);
  const reset=()=>{ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);};
  if(flag==='--entry'){
   const modes=v52.evaluateUntoned(entry,report.policy,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);
   assert.ok(Math.abs(score-row.score)<1e-9);assert.ok(Math.abs(doubledScore-row.doubledScore)<1e-9);
   const result={...row,capacity:[21,21],tone:entry.tone,codeList:entry.codeList,modes,sourceHashes:{[__filename]:hash(__filename),[cross.PREFIX+'.json']:hash(cross.PREFIX+'.json')}};
   fs.writeFileSync(cross.PREFIX+'-replay-'+id+'.json',JSON.stringify(result,null,2)+'\n');console.log(id,score,doubledScore);return;
  }
  ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();const cases={};
  for(const mode of ['keytao','sanpin']){ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);cases[mode]=enumerateBounded(entry,mode,ctx);ctx.motor=null;if(global.gc)global.gc();console.log(id,mode,'144 policies');}
  const out={id,initialMap:entry.initialMap,finalMap:entry.finalMap,optimal1x:optimum(cases,prior.reference,1),optimal2x:optimum(cases,prior.reference,2),canonicalReplays:[]};
  for(const[key,policy]of new Map([out.optimal1x,out.optimal2x].map(r=>[JSON.stringify(r.policy),r.policy]))){
   const policies=Object.fromEntries(Object.entries(policy).map(([m,s])=>[m,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,s.split('/')[i]]))]));reset();
   const modes=v52.evaluateUntoned(entry,policies,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);
   if(key===JSON.stringify(out.optimal1x.policy))assert.ok(Math.abs(score-out.optimal1x.score)<1e-9);if(key===JSON.stringify(out.optimal2x.policy))assert.ok(Math.abs(doubledScore-out.optimal2x.score)<1e-9);
   out.canonicalReplays.push({policies,score,doubledScore,modes});if(global.gc)global.gc();}
  out.sourceHashes=Object.fromEntries([__filename,profile,path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/verify_untoned_cr7e_v52.js')].map(p=>[p,hash(p)]));
  fs.writeFileSync(cross.PREFIX+'-components-'+id+'.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference:prior.reference}))));
  fs.writeFileSync(cross.PREFIX+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,one:out.optimal1x,two:out.optimal2x}));return;
 }
 assert.ok(report.completed);for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(hash(p),h,p);
 const known=new Map([...imports.flatMap(r=>Object.values(r.states)),...Object.values(report.states)].map(r=>[mappingKey(r),r]));
 for(const row of Object.values(report.states)){assert.deepEqual(row.initialMap,report.initialMap);const e=search.rebuild({...template,...row},prior.auditInput);assert.deepEqual(search.audit(e,prior.auditInput),row.audit);assert.ok(legal(row.audit));}
 const coverage=[],union=new Set();
 for(const stage of report.stages){const keys=new Set();let total=0;
  for(const group of stage.groups){const center=get(group.center);let n=0,valid=0;
   const proposals=stage.name==='complete left block over eight keys'?blocks.assignments(center.finalMap,cross.LEFT,cross.KEYS):cross.crossMoves(center.finalMap,cross.LEFT,cross.RIGHT,cross.KEYS);
   for(const finalMap of proposals){n++;total++;const e=search.rebuild({...template,initialMap:report.initialMap,finalMap},prior.auditInput);if(!legal(search.audit(e,prior.auditInput)))continue;valid++;keys.add(mappingKey(e));}
   assert.equal(n,group.total);assert.equal(valid,group.legal);}
  assert.equal(total,stage.totalAssignments);assert.equal(keys.size,stage.legalUnique);assert.ok([...keys].every(k=>known.has(k)),'missing cross/wide candidates');
  for(const k of keys)union.add(k);coverage.push({name:stage.name,totalAssignments:total,legalUnique:keys.size,missing:0});}
 const selected=[...new Map([...report.bestDefault.slice(0,2),...report.bestDoubled.slice(0,2)].map(r=>[r.id,r])).values()];
 const out={reference:prior.reference,auditInput:prior.auditInput,coverage,uniqueCoveredLayouts:union.size,selectedIds:selected.map(r=>r.id),results:[],completed:false};
 for(const row of selected){const file=cross.PREFIX+'-replay-'+row.id+'.json';
  if(!fs.existsSync(file)){const p=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(p.status,0,row.id+' replay');}
  const replay=read(file);for(const[p,h]of Object.entries(replay.sourceHashes))assert.equal(hash(p),h,p);out.results.push(replay);
  const policyFile=cross.PREFIX+'-policy-'+row.id+'.json',earlierFile=blocks.PREFIX+'-policy-'+row.id+'.json';
  if(!fs.existsSync(policyFile)&&fs.existsSync(earlierFile)){
   const earlier=read(earlierFile);assert.deepEqual(earlier.initialMap,row.initialMap);assert.deepEqual(earlier.finalMap,row.finalMap);assert.deepEqual(imports[2].reference,report.reference);
   for(const[p,h]of Object.entries(earlier.sourceHashes))assert.equal(hash(p),h,p);
   earlier.retainedPolicyEnumeration={source:earlierFile,sha256:hash(earlierFile),reason:'Identical physical layout and scoring reference; retain the earlier complete auxiliary-policy enumeration. Fixed-policy canonical replay is fresh.'};
   earlier.sourceHashes[earlierFile]=hash(earlierFile);fs.writeFileSync(policyFile,JSON.stringify(earlier,null,2)+'\n');}
 }
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[cross.PREFIX+'.json']:hash(cross.PREFIX+'.json')};
 fs.writeFileSync(cross.PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({verified:out.selectedIds,coverage,newStates:Object.keys(report.states).length}));
}
if(require.main===module)try{main();}catch(e){console.error(e);process.exitCode=1;}
