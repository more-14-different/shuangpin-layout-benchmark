'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const multi=require('./anneal_untoned_cr7e_multiblock'),search=require('./search_untoned_cr7e_v52'),{mappingKey,legal}=require('./search_untoned_cr7e_coupled');
const {FINALS}=require('./ckt_v4_scheme_fixture'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=hashes=>{for(const[p,h]of Object.entries(hashes))assert.equal(hash(p),h,p);};
function main(){
 const report=read(multi.PREFIX+'.json'),imports=multi.INPUTS.map(read),prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 const byId=new Map([...imports.flatMap(r=>Object.values(r.states)),...Object.values(report.states)].map(r=>[r.id,r])),get=id=>{const r=byId.get(id);assert.ok(r,id);return r;};
 const template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},args=process.argv.slice(2),flag=['--entry','--policy'].find(f=>args.includes(f)),id=flag?args[args.indexOf(flag)+1]:null;
 if(id){
  const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
  const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html')),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=get(id),entry=search.rebuild({...template,...row},data);
  const reset=()=>{ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);};
  if(flag==='--entry'){
   const modes=v52.evaluateUntoned(entry,report.policy,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);
   assert.ok(Math.abs(score-row.score)<1e-9);assert.ok(Math.abs(doubledScore-row.doubledScore)<1e-9);
   const result={...row,capacity:[21,21],tone:entry.tone,codeList:entry.codeList,modes,sourceHashes:{[__filename]:hash(__filename),[multi.PREFIX+'.json']:hash(multi.PREFIX+'.json')}};
   fs.writeFileSync(multi.PREFIX+'-replay-'+id+'.json',JSON.stringify(result,null,2)+'\n');console.log(id,score,doubledScore);return;
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
  fs.writeFileSync(multi.PREFIX+'-components-'+id+'.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference:prior.reference}))));
  fs.writeFileSync(multi.PREFIX+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,one:out.optimal1x,two:out.optimal2x}));return;
 }
 assert.ok(report.completed);check(report.sourceHashes);assert.equal(report.rounds.length,16);assert.equal(report.chains.length,6);
 const oldKeys=new Set(imports.flatMap(r=>Object.values(r.states)).map(mappingKey)),seen=new Set();
 for(const row of Object.values(report.states)){assert.deepEqual(row.initialMap,report.initialMap);const key=mappingKey(row);assert.ok(!oldKeys.has(key)&&!seen.has(key));seen.add(key);
  const e=search.rebuild({...template,...row},prior.auditInput);assert.deepEqual(search.audit(e,prior.auditInput),row.audit);assert.ok(legal(row.audit));}
 const stages=[];
 for(const stage of report.stages){const center=get(stage.center);let pairs=0,legalCount=0;const freshKeys=new Set();
  for(const aId of stage.leftIds)for(const bId of stage.rightIds){const a=get(aId),b=get(bId);pairs++;
   assert.ok(multi.distance(a.finalMap,center.finalMap,multi.LEFT)>=2);assert.ok(multi.distance(b.finalMap,center.finalMap,multi.RIGHT)>=2);
   for(const f of FINALS){if(!multi.LEFT.includes(f))assert.equal(a.finalMap[f],center.finalMap[f]);if(!multi.RIGHT.includes(f))assert.equal(b.finalMap[f],center.finalMap[f]);}
   const fm=multi.combineBlocks(center.finalMap,a.finalMap,b.finalMap),e=search.rebuild({...template,initialMap:report.initialMap,finalMap:fm},prior.auditInput);
   if(legal(search.audit(e,prior.auditInput)))legalCount++;freshKeys.add(mappingKey(e));}
  assert.equal(pairs,stage.pairs);assert.equal(legalCount,stage.legalCount);
  for(const pick of stage.selected){const row=get(pick.id),[a,b]=pick.componentIds.map(get);assert.deepEqual(row.finalMap,multi.combineBlocks(center.finalMap,a.finalMap,b.finalMap));}
  stages.push({center:center.id,pairs,legalCount,exactSelected:stage.selected.length});}
 let multiSelections=0,fixedSelections=0,releasedSelections=0;
 for(const round of report.rounds){assert.deepEqual({phase:round.phase,temperature:round.temperature},multi.schedule(round.round));assert.equal(round.chains.length,6);
  for(const step of round.chains){const chain=report.chains[step.index],seed=get(chain.seedId),center=get(step.from);assert.equal(step.selected.length,24);
   for(const pick of step.selected){const row=get(pick.id),left=multi.distance(row.finalMap,center.finalMap,multi.LEFT),right=multi.distance(row.finalMap,center.finalMap,multi.RIGHT);
    assert.equal(left,pick.leftChanges);assert.equal(right,pick.rightChanges);if(left>=2&&right>=2)multiSelections++;
    if(round.round<8){fixedSelections++;for(const f of FINALS.filter(f=>!multi.VARIABLE.includes(f)))assert.equal(row.finalMap[f],seed.finalMap[f]);}else releasedSelections++;}
  }}
 const selected=[...new Map([report.bestDefault[0],report.bestDoubled[0],...report.bestNewDefault.slice(0,2),...report.bestNewDoubled.slice(0,2)].map(r=>[r.id,r])).values()];
 const out={completed:false,reference:prior.reference,auditInput:prior.auditInput,newStates:seen.size,measuredComponentStages:stages,multiSelections,fixedSelections,releasedSelections,selectedIds:selected.map(r=>r.id),results:[]};
 for(const row of selected){const file=multi.PREFIX+'-replay-'+row.id+'.json';
  if(!fs.existsSync(file)){const p=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(p.status,0,row.id+' replay');}
  const replay=read(file);check(replay.sourceHashes);out.results.push(replay);
  const policyFile=multi.PREFIX+'-policy-'+row.id+'.json',earlierFile=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-crosswide-v52-policy-'+row.id+'.json');
  if(!fs.existsSync(policyFile)&&fs.existsSync(earlierFile)){
   const earlier=read(earlierFile);assert.deepEqual(earlier.initialMap,row.initialMap);assert.deepEqual(earlier.finalMap,row.finalMap);assert.deepEqual(imports.at(-1).reference,report.reference);check(earlier.sourceHashes);
   earlier.retainedPolicyEnumeration={source:earlierFile,sha256:hash(earlierFile),reason:'Identical layout and scoring reference; retain complete policy enumeration; fresh fixed-policy canonical replay.'};
   earlier.sourceHashes[earlierFile]=hash(earlierFile);fs.writeFileSync(policyFile,JSON.stringify(earlier,null,2)+'\n');}
 }
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[multi.PREFIX+'.json']:hash(multi.PREFIX+'.json')};
 fs.writeFileSync(multi.PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({verified:out.selectedIds,newStates:seen.size,multiSelections,fixedSelections,releasedSelections,stages}));
}
if(require.main===module)try{main();}catch(e){console.error(e);process.exitCode=1;}
