'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model'),v52=require('./score_ckt_v52');
const {blockErrorMotor}=require('./ckt_block_error');
const search=require('./search_untoned_cr7e_v52'),coupled=require('./search_untoned_cr7e_coupled');
const {enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52');
const ROOT=path.resolve(__dirname,'..'),PREFIX=coupled.PREFIX;
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function selectedRows(report){
 const values=Object.values(report.states),seeds=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json')).results.filter(r=>report.seeds.includes(r.id));
 const rank=field=>[...values,...seeds].sort((a,b)=>a[field]-b[field]);
 const fixed=values.filter(r=>JSON.stringify(r.initialMap)===JSON.stringify(seeds[0].initialMap));
 const fixedRank=field=>[...fixed].sort((a,b)=>a[field]-b[field]).slice(0,1);
 return [...new Map([...rank('score').slice(0,3),...rank('doubledScore').slice(0,3),...fixedRank('score'),...fixedRank('doubledScore')].map(r=>[r.id,r])).values()];
}
function firstRingCoverage(report,prior,original,zero){
 const known=new Map([...Object.values(original.states),...Object.values(zero.states),...prior.results,...Object.values(report.states)].map(r=>[coupled.mappingKey(r),r]));
 const template={...prior.results.find(r=>r.id==='OC21-bf9bf45a7e60'),capacity:[21,21]},out=[];
 for(const id of report.seeds){
  const center=prior.results.find(r=>r.id===id);
  for(const kind of ['initial','final']){
   const variants=kind==='initial'?coupled.initialNeighbors(center):search.neighbors(center).map(r=>({...r,initialMap:center.initialMap}));
   const keys=new Map();for(const r of variants){const e=search.rebuild({...template,...r},prior.auditInput);if(coupled.legal(search.audit(e,prior.auditInput)))keys.set(coupled.mappingKey(e),e);}
   const missing=[...keys.keys()].filter(k=>!known.has(k));assert.equal(missing.length,0,id+' '+kind+' ring incomplete');
   const rows=[...keys.keys()].map(k=>known.get(k));
   out.push({center:id,kind,legalUniqueNeighbors:keys.size,missing:missing.length,
    scoredThisRun:rows.filter(r=>report.states[r.id]).length,
    bestFixedPolicy1x:[...rows].sort((a,b)=>a.score-b.score)[0].id,
    bestFixedPolicy2x:[...rows].sort((a,b)=>a.doubledScore-b.doubledScore)[0].id});
  }
 }
 return out;
}
async function main(){
 const args=process.argv.slice(2),id=args.includes('--policies')?args[args.indexOf('--policies')+1]:null;
 const report=read(PREFIX+'.json');if(!id)assert.ok(report.completed);
 for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(hash(p),h,p);
 const prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 if(args.includes('--list')){console.log(JSON.stringify(selectedRows(report).map(r=>({id:r.id,score:r.score,doubledScore:r.doubledScore}))));return;}
 const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
 const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),reference=prior.reference;
 const template={...prior.results.find(r=>r.id==='OC21-bf9bf45a7e60'),capacity:[21,21]};
 const reset=()=>{
  ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
  ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
 };
 if(id){
  const row=report.states[id]||prior.results.find(r=>r.id===id);assert.ok(row);
  const entry=search.rebuild({...template,...row},data),cases={};ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();
  for(const mode of ['keytao','sanpin']){
   ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
   cases[mode]=enumerateBounded(entry,mode,ctx);console.log(id,mode,'144 policies');ctx.motor=null;if(global.gc)global.gc();
  }
  const out={id,initialMap:entry.initialMap,finalMap:entry.finalMap,mappingKey:coupled.mappingKey(entry),
   optimal1x:optimum(cases,reference,1),optimal2x:optimum(cases,reference,2),canonicalReplays:[]};
  // Replay the selected code paths through the independent canonical v5.2 pipeline.
  const keys=new Set();
  for(const optimal of [out.optimal1x,out.optimal2x]){
   const key=JSON.stringify(optimal.policy);if(keys.has(key))continue;keys.add(key);
   const policies=Object.fromEntries(Object.entries(optimal.policy).map(([mode,k])=>[mode,Object.fromEntries(['word2','word3','word4'].map((kind,i)=>[kind,k.split('/')[i]]))]));
   reset();const modes=v52.evaluateUntoned(entry,policies,null,ctx).v52;
   const score=search.normalize(modes,reference),doubledScore=search.normalize(modes,reference,2);
   if(key===JSON.stringify(out.optimal1x.policy))assert.ok(Math.abs(score-out.optimal1x.score)<1e-9);
   if(key===JSON.stringify(out.optimal2x.policy))assert.ok(Math.abs(doubledScore-out.optimal2x.score)<1e-9);
   out.canonicalReplays.push({policies,score,doubledScore,modes});if(global.gc)global.gc();
  }
  out.sourceHashes=Object.fromEntries([__filename,profile,path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/verify_untoned_cr7e_v52.js'),path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json')].map(p=>[p,hash(p)]));
  fs.writeFileSync(PREFIX+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({id,optimal1x:out.optimal1x,optimal2x:out.optimal2x}));return;
 }
 for(const row of Object.values(report.states)){
  const e=search.rebuild({...template,...row},data),a=search.audit(e,data);assert.deepEqual(a,row.audit);assert.ok(coupled.legal(a));
 }
 const selected=selectedRows(report),out={version:'untoned-cr7e-coupled-v52-canonical-verification-1',reference,
  auditInput:prior.auditInput,searchStates:Object.keys(report.states).length,selectedIds:selected.map(r=>r.id),results:[],completed:false};
 out.firstRingCoverage=firstRingCoverage(report,prior,
  read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52.json')),
  read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-zero-n-v52.json')));
 for(const row of selected){
  reset();const entry=search.rebuild({...template,...row},data),modes=v52.evaluateUntoned(entry,report.policy,null,ctx).v52;
  const score=search.normalize(modes,reference),doubledScore=search.normalize(modes,reference,2);
  assert.ok(Math.abs(score-row.score)<1e-9,row.id+' native/JS');assert.ok(Math.abs(doubledScore-row.doubledScore)<1e-9,row.id+' doubled native/JS');
  out.results.push({...row,capacity:[21,21],tone:entry.tone,codeList:entry.codeList,modes,
   nativeVsJsMaxScoreDifference:Math.max(Math.abs(score-row.score),Math.abs(doubledScore-row.doubledScore))});
  fs.writeFileSync(PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({id:row.id,score,doubledScore}));if(global.gc)global.gc();
 }
 out.completed=true;out.sourceHashes=Object.fromEntries([__filename,PREFIX+'.json',profile,path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/ckt_block_error.js')].map(p=>[p,hash(p)]));
 fs.writeFileSync(PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={selectedRows,firstRingCoverage};
