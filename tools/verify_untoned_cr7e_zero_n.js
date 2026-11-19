'use strict';
// Canonical JS replay, paired N/R carrier comparison, and full policy enumeration.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model'),v52=require('./score_ckt_v52');
const {blockErrorMotor}=require('./ckt_block_error');
const search=require('./search_untoned_cr7e_v52');
const zero=require('./search_untoned_cr7e_zero_n');
const {enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52');
const ROOT=path.resolve(__dirname,'..'),PREFIX=zero.PREFIX;
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const args=process.argv.slice(2),id=args.includes('--policies')?args[args.indexOf('--policies')+1]:null;
 const report=read(PREFIX+'.json');assert.ok(report.completed,'search must finish');
 if(report.exactSwapPolish)assert.ok(report.exactSwapPolish.completed,'complete swap scoring must finish');
 for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(hash(p),h,p);
 for(const[p,h]of Object.entries(report.exactSwapPolish?.sourceHashes||{}))assert.equal(hash(p),h,p);
 const prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
 const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),reference=prior.reference;
 const template={...prior.results.find(r=>r.id==='OC21-bf9bf45a7e60'),capacity:[21,21]};
 const selected=[...new Map([report.bestDefault[0],report.bestDoubled[0],
  ...Object.values(report.states).filter(r=>r.mutation==='A/E/O R→N transplant'&&['OC21-bf9bf45a7e60','OC21-e1f155973380','U7E-1f46d74c337f','U7E-3b1557bb9247'].includes(r.parent))].map(r=>[r.id,r])).values()];
 const reset=()=>{
  ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
  ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
 };
 if(id){
  const row=selected.find(r=>r.id===id);assert.ok(row,'only audited search leaders or direct controls may be optimized');
  const entry=search.rebuild({...template,...row},data),cases={};ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();
  for(const mode of ['keytao','sanpin']){
   ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
   cases[mode]=enumerateBounded(entry,mode,ctx);console.log(id,mode,'144 policies');ctx.motor=null;if(global.gc)global.gc();
  }
  const out={id,initialMap:entry.initialMap,finalMap:entry.finalMap,optimal1x:optimum(cases,reference,1),optimal2x:optimum(cases,reference,2),
   sourceHashes:Object.fromEntries([__filename,PREFIX+'.json',profile].map(p=>[p,hash(p)]))};
  fs.writeFileSync(PREFIX+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));return;
 }
 // Every scored state is independently re-materialized before finalists are replayed.
 for(const row of Object.values(report.states)){
  assert.deepEqual(row.initialMap,report.initialMap);
  const e=search.rebuild({...template,...row},data),a=search.audit(e,data);assert.deepEqual(a,row.audit);assert.ok(zero.legal(a));
 }
 const out={version:'untoned-cr7e-zero-n-v52-canonical-verification-1',reference,auditInput:{pinyin:data.pinyin,base:data.base},results:[],
  searchStates:Object.keys(report.states).length,selectedIds:selected.map(r=>r.id),completed:false};
 for(const row of selected){
  reset();const entry=search.rebuild({...template,...row},data),value=v52.evaluateUntoned(entry,report.policy,null,ctx).v52;
  const score=search.normalize(value,reference),doubledScore=search.normalize(value,reference,2);
  assert.ok(Math.abs(score-row.score)<1e-9,row.id+' native/JS');assert.ok(Math.abs(doubledScore-row.doubledScore)<1e-9,row.id+' doubled native/JS');
  reset();const rEntry=search.rebuild({...entry,initialMap:report.previousInitialMap},data),rModes=v52.evaluateUntoned(rEntry,report.policy,null,ctx).v52;
  const pairedR={score:search.normalize(rModes,reference),doubledScore:search.normalize(rModes,reference,2),modes:rModes,audit:search.audit(rEntry,data)};
  out.results.push({...row,capacity:[21,21],tone:entry.tone,codeList:entry.codeList,modes:value,pairedR,
   carrierOnlyDelta:{one:score-pairedR.score,two:doubledScore-pairedR.doubledScore},nativeVsJsMaxScoreDifference:Math.max(Math.abs(score-row.score),Math.abs(doubledScore-row.doubledScore))});
  fs.writeFileSync(PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id:row.id,score,doubledScore,pairedR:{score:pairedR.score,doubledScore:pairedR.doubledScore}}));if(global.gc)global.gc();
 }
 out.completed=true;out.sourceHashes=Object.fromEntries([__filename,PREFIX+'.json',profile,path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/ckt_block_error.js')].map(p=>[p,hash(p)]));
 fs.writeFileSync(PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
