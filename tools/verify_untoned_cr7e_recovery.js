'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const recovery=require('./anneal_untoned_cr7e_recovery'),far=require('./anneal_untoned_cr7e_far'),search=require('./search_untoned_cr7e_v52');
const {legal}=require('./search_untoned_cr7e_coupled'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function finalists(report){const top=f=>report[f].slice(0,2);return [...new Map([...top('bestDefault'),...top('bestDoubled')].map(r=>[r.id,r])).values()];}
function main(){
 const args=process.argv.slice(2),flag=['--entry','--policy'].find(f=>args.includes(f)),id=flag?args[args.indexOf(flag)+1]:null;
 const report=read(recovery.PREFIX+'.json'),prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 const template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const old=read(far.PREFIX+'.json'),get=id=>report.states[id]||old.states[id];
 if(flag){
  const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
  const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
  const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=get(id);assert.ok(row,id);
  const entry=search.rebuild({...template,...row},data);
  const reset=()=>{ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
   ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);};
  if(flag==='--entry'){
   const modes=v52.evaluateUntoned(entry,report.policy,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);
   assert.ok(Math.abs(score-row.score)<1e-9);assert.ok(Math.abs(doubledScore-row.doubledScore)<1e-9);
   const out={...row,capacity:[21,21],tone:entry.tone,codeList:entry.codeList,modes,
    sourceHashes:{[__filename]:hash(__filename),[recovery.PREFIX+'.json']:hash(recovery.PREFIX+'.json')}};
   fs.writeFileSync(recovery.PREFIX+'-replay-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(id,score,doubledScore);return;
  }
  ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();const cases={};
  for(const mode of ['keytao','sanpin']){ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
   cases[mode]=enumerateBounded(entry,mode,ctx);ctx.motor=null;if(global.gc)global.gc();console.log(id,mode,'144 policies');}
  const out={id,initialMap:entry.initialMap,finalMap:entry.finalMap,optimal1x:optimum(cases,prior.reference,1),optimal2x:optimum(cases,prior.reference,2),canonicalReplays:[]};
  const selected=new Map([out.optimal1x,out.optimal2x].map(r=>[JSON.stringify(r.policy),r.policy]));
  for(const[key,policy]of selected){const policies=Object.fromEntries(Object.entries(policy).map(([m,s])=>[m,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,s.split('/')[i]]))]));
   reset();const modes=v52.evaluateUntoned(entry,policies,null,ctx).v52,score=search.normalize(modes,prior.reference),doubledScore=search.normalize(modes,prior.reference,2);
   if(key===JSON.stringify(out.optimal1x.policy))assert.ok(Math.abs(score-out.optimal1x.score)<1e-9);
   if(key===JSON.stringify(out.optimal2x.policy))assert.ok(Math.abs(doubledScore-out.optimal2x.score)<1e-9);
   out.canonicalReplays.push({policies,score,doubledScore,modes});if(global.gc)global.gc();}
  out.sourceHashes=Object.fromEntries([__filename,profile,path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/verify_untoned_cr7e_v52.js')].map(p=>[p,hash(p)]));
  fs.writeFileSync(recovery.PREFIX+'-components-'+id+'.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference:prior.reference}))));
  fs.writeFileSync(recovery.PREFIX+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,one:out.optimal1x,two:out.optimal2x}));return;
 }
 assert.ok(report.completed);for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(hash(p),h,p);
 for(const row of Object.values(report.states)){assert.deepEqual(row.initialMap,report.initialMap);assert.ok(!old.states[row.id]);
  const e=search.rebuild({...template,...row},prior.auditInput);assert.deepEqual(search.audit(e,prior.auditInput),row.audit);assert.ok(legal(row.audit));}
 const selected=finalists(report),out={reference:prior.reference,auditInput:prior.auditInput,selectedIds:selected.map(r=>r.id),results:[],completed:false};
 for(const row of selected){
  const file=recovery.PREFIX+'-replay-'+row.id+'.json';
  if(!fs.existsSync(file)){const result=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(result.status,0,row.id+' replay');}
  const replay=read(file);for(const[p,h]of Object.entries(replay.sourceHashes))assert.equal(hash(p),h,p);out.results.push(replay);
 }
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[recovery.PREFIX+'.json']:hash(recovery.PREFIX+'.json')};
 fs.writeFileSync(recovery.PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({verified:out.selectedIds,states:Object.keys(report.states).length}));
}
if(require.main===module)try{main();}catch(e){console.error(e);process.exitCode=1;}
module.exports={finalists};
