'use strict';
// Controlled counterfactual: only E/O zero-initial carriers C -> R.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model');
const search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const {blockErrorMotor}=require('./ckt_block_error'),{enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52');
const {policyObjects}=require('./finalize_untoned_frontiers_r11'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-u7r-shared-r');
const HTML='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const KINDS=['character','word2','word3','word4'];
function compareTracks(actual,expected){let max=0;for(const mode of ['keytao','sanpin'])for(const kind of KINDS)
 for(const[field,value]of Object.entries(expected[mode][kind]))if(typeof value==='number'){
  const difference=Math.abs(actual[mode][kind][field]-value);assert.ok(difference<1e-8,`${mode}/${kind}/${field}: ${difference}`);max=Math.max(max,difference);
 }return max;}
async function main(){
 const id=process.argv[2];assert.ok(['U7R-143cf16e1fa2','U7R-9a7d2e90a161'].includes(id));
 const source=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-restored21-v52-policy-'+id+'.json'),original=read(source);
 const priorPath=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'),prior=read(priorPath);
 const data=scorer.loadPayload(HTML),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
 assert.deepEqual(data.base,prior.auditInput.base);assert.deepEqual(data.pinyin,prior.auditInput.pinyin);
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile);
 const reset=()=>{ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);};
 const reference=v52.evaluateUntoned(data.entries.find(e=>e.id==='S005'),search.REF,null,ctx).v52;compareTracks(reference,prior.reference);
 const baseline=search.rebuild({...data.entries.find(e=>e.id===id),...original,capacity:[21,21],tone:'IVUAO'},data);
 assert.equal(baseline.initialMap.A,'R');assert.equal(baseline.initialMap.E,'C');assert.equal(baseline.initialMap.O,'C');
 const entry=search.rebuild({...baseline,id:id+'-eoR',initialMap:{...baseline.initialMap,E:'R',O:'R'}},data);
 assert.deepEqual(entry.finalMap,baseline.finalMap);
 assert.deepEqual(Object.keys(entry.initialMap).filter(h=>entry.initialMap[h]!==baseline.initialMap[h]),['E','O']);
 const audit=search.audit(entry,data);assert.ok(audit.valid&&audit.M===41&&audit.D===2&&!audit.qz&&!audit.zq);
 const baselineReplays=[];
 for(const policies of new Map([original.optimal1x,original.optimal2x].map(r=>[JSON.stringify(r.policy),r.policy])).values()){
  reset();const modes=v52.evaluateUntoned(baseline,policyObjects(policies),null,ctx).v52;
  const row={policies,score:search.normalize(modes,reference),two:search.normalize(modes,reference,2)};
  if(JSON.stringify(policies)===JSON.stringify(original.optimal1x.policy))assert.ok(Math.abs(row.score-original.optimal1x.score)<1e-9);
  if(JSON.stringify(policies)===JSON.stringify(original.optimal2x.policy))assert.ok(Math.abs(row.two-original.optimal2x.score)<1e-9);
  baselineReplays.push(row);
 }
 const fixedPolicy=far.POLICY;reset();const fixedModes=v52.evaluateUntoned(entry,fixedPolicy,null,ctx).v52;
 const native=await require('./untoned_v52_stream_pool').pool(path.join(far.WORK,'templates.json'),1);let nativeMaxTrackDifference;
 try{nativeMaxTrackDifference=compareTracks(fixedModes,(await native.score(entry)).modes);}finally{native.close();}
 const cases={};ctx.model=model;ctx.scorer=scorer;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();
 for(const mode of ['keytao','sanpin']){
  ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
  cases[mode]=enumerateBounded(entry,mode,ctx);ctx.motor=null;if(global.gc)global.gc();
  console.log(JSON.stringify({id,mode,policies:cases[mode].results.length}));
 }
 const optimal1x=optimum(cases,reference,1),optimal2x=optimum(cases,reference,2),canonicalReplays=[];
 for(const policy of new Map([optimal1x,optimal2x].map(r=>[JSON.stringify(r.policy),r.policy])).values()){
  reset();const modes=v52.evaluateUntoned(entry,policyObjects(policy),null,ctx).v52;
  const expected=Object.fromEntries(Object.entries(policy).map(([mode,key])=>[mode,cases[mode].results.find(r=>r.policyKey===key).tracks]));
  const maxTrackDifference=compareTracks(modes,expected),score=search.normalize(modes,reference),two=search.normalize(modes,reference,2);
  if(JSON.stringify(policy)===JSON.stringify(optimal1x.policy))assert.ok(Math.abs(score-optimal1x.score)<1e-9);
  if(JSON.stringify(policy)===JSON.stringify(optimal2x.policy))assert.ok(Math.abs(two-optimal2x.score)<1e-9);
  canonicalReplays.push({policy,score,two,maxTrackDifference,modes});if(global.gc)global.gc();
 }
 const components=PREFIX+'-components-'+id+'.json.gz';fs.writeFileSync(components,zlib.gzipSync(Buffer.from(JSON.stringify({id:entry.id,cases,reference}))));
 const inputs=[__filename,HTML,source,priorPath,profile,components,path.join(far.WORK,'templates.json'),
  ...['score_completion_ckt_v4.js','score_ckt_v52.js','ckt_v4_model.js','ckt_block_error.js','verify_untoned_cr7e_v52.js','search_untoned_cr7e_v52.js','ckt_v4_upstream_role_tables.json','auxiliary_semantics.js','untoned_v52_stream_pool.js','anneal_untoned_cr7e_far.js','finalize_untoned_frontiers_r11.js'].map(f=>path.join(ROOT,'tools',f)),
  path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe'),
  ...['snow_pinyin.base.dict.yaml','rime-stroke/stroke.dict.yaml','scripts/research/evaluate_ckt_v4_word_aux_order.js','scripts/research/evaluate_ckt51_aux_order.js'].map(f=>path.join('D:/C2D/Documents/rime-snow-pinyin',f))];
 const out={completed:true,id:entry.id,parent:id,contract:'Only E/O carriers C -> R; finals fixed; each cost point optimizes all 144 policies per member; Common399; CKT v5.2; weights 1:3:1:1; members equal',
  initialMap:entry.initialMap,finalMap:entry.finalMap,tone:entry.tone,auxiliarySemantics:auxiliarySemantics(entry.tone),audit,codeList:entry.codeList,
  auditInput:prior.auditInput,baseline:{optimal1x:original.optimal1x,optimal2x:original.optimal2x,replays:baselineReplays},optimal1x,optimal2x,
  delta1x:optimal1x.score-original.optimal1x.score,delta2x:optimal2x.score-original.optimal2x.score,
  fixedPolicyNative:{policies:fixedPolicy,score:search.normalize(fixedModes,reference),two:search.normalize(fixedModes,reference,2),maxTrackDifference:nativeMaxTrackDifference},
  canonicalReplays,sourceHashes:Object.fromEntries(inputs.map(p=>[p,hash(p)]))};
 fs.writeFileSync(PREFIX+'-'+id+'.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({id:entry.id,audit,optimal1x,optimal2x,delta1x:out.delta1x,delta2x:out.delta2x,nativeMaxTrackDifference}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
