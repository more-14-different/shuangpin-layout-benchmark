'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),search=require('./search_untoned_cr7e_v52');
const {blockErrorMotor}=require('./ckt_block_error'),{policyObjects}=require('./finalize_untoned_frontiers_r11'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-21-u7e-competing');
const KINDS=['character','word2','word3','word4'],WEIGHTS=[1,3,1,1];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const FINGERS=['QAZ','WSX','EDC','RFVTGB','YHNUJM','IK,','OL.','P;/[]\\\''];
const finger=k=>{const f=FINGERS.findIndex(keys=>keys.includes(k));assert.ok(f>=0,k);return f;};
const hand=k=>finger(k)<4?0:1;
function summarizeCodes(outcomes){
 const keys={},pairs={},ranks={};let weight=0,meanKeys=0,meanPairs=0,residualEntries=0;
 for(const r of outcomes){weight+=r.weight;ranks[r.rank]=(ranks[r.rank]||0)+r.weight;if(r.rank>1)residualEntries++;
  for(const k of r.code){keys[k]=(keys[k]||0)+r.weight;meanKeys+=r.weight;}
  for(let i=1;i<r.code.length;i++){const pair=r.code.slice(i-1,i+1);pairs[pair]=(pairs[pair]||0)+r.weight;meanPairs+=r.weight;}
 }
 return {count:outcomes.length,totalWeight:weight,residualEntries,meanKeys:meanKeys/weight,meanPairs:meanPairs/weight,
  expectedKeys:Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,v/weight])),expectedPairs:Object.fromEntries(Object.entries(pairs).map(([k,v])=>[k,v/weight])),
  rankMass:Object.fromEntries(Object.entries(ranks).map(([k,v])=>[k,v/weight]))};
}
function ergonomic(metrics){
 const group=keys=>Object.entries(metrics.expectedKeys).filter(([k])=>keys.includes(k)).reduce((s,[,w])=>s+w,0)/metrics.meanKeys;
 const fingers=FINGERS.map(group),leftShare=fingers.slice(0,4).reduce((a,b)=>a+b,0);
 let sameFinger=0,differentKeySameFinger=0,sameHand=0;
 for(const[p,w]of Object.entries(metrics.expectedPairs)){
  if(finger(p[0])===finger(p[1])){sameFinger+=w;if(p[0]!==p[1])differentKeySameFinger+=w;}
  if(hand(p[0])===hand(p[1]))sameHand+=w;
 }
 return {meanKeys:metrics.meanKeys,home:group('ASDFGHJKL;\''),upper:group('QWERTYUIOP[]\\'),lower:group('ZXCVBNM,./'),leftPinky:fingers[0],rightPinky:fingers[7],fingers,maxFinger:Math.max(...fingers),leftShare,rightShare:1-leftShare,
  differentKeySameFinger:differentKeySameFinger/metrics.meanPairs,sameFinger:sameFinger/metrics.meanPairs,sameHand:sameHand/metrics.meanPairs,alternation:1-sameHand/metrics.meanPairs,
  keyShares:Object.fromEntries(Object.entries(metrics.expectedKeys).map(([k,v])=>[k,v/metrics.meanKeys]))};
}
function aggregateCodes(tracks){
 const combined={expectedKeys:{},expectedPairs:{},meanKeys:0,meanPairs:0};
 for(const mode of ['keytao','sanpin'])for(let i=0;i<4;i++){
  const r=tracks[mode][KINDS[i]],w=WEIGHTS[i]/12;combined.meanKeys+=w*r.meanKeys;combined.meanPairs+=w*r.meanPairs;
  for(const field of ['expectedKeys','expectedPairs'])for(const[k,v]of Object.entries(r[field]))combined[field][k]=(combined[field][k]||0)+w*v;
 }
 const result=ergonomic(combined),byTrack=Object.fromEntries(Object.entries(tracks).map(([m,kinds])=>[m,Object.fromEntries(Object.entries(kinds).map(([k,r])=>[k,ergonomic(r)]))]));
 const values=Object.entries(byTrack).flatMap(([m,rows])=>Object.entries(rows).map(([k,v])=>({track:m+'/'+k,...v})));
 const peak=f=>values.reduce((a,b)=>b[f]>a.value?{value:b[f],track:b.track}:a,{value:-Infinity,track:null});
 return {...result,byTrack,peaks:{leftPinky:peak('leftPinky'),rightPinky:peak('rightPinky'),maxFinger:peak('maxFinger'),differentKeySameFinger:peak('differentKeySameFinger')},homeFloor:Math.min(...values.map(r=>r.home)),sufficientStatistics:combined};
}
function baseBuckets(rows){
 const buckets=new Map();for(const r of rows){const s=r.stages[0];assert.equal(s.codes.length,1);const key=s.pool+'|'+s.codes[0];if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(r);}
 const result=Object.fromEntries(KINDS.map(k=>[k,{entries:0,totalWeight:0,buckets:0,collisionBuckets:0,affectedEntries:0,affectedWeight:0,nonFirstEntries:0,nonFirstWeight:0,crossLengthBuckets:0,maxBucket:0}]));
 for(const bucket of buckets.values()){
  const winner=[...bucket].sort((a,b)=>b.weight-a.weight||(a.id<b.id?-1:a.id>b.id?1:0))[0],kinds=new Set(bucket.map(r=>r.kind));
  for(const kind of kinds){const s=result[kind];s.buckets++;s.maxBucket=Math.max(s.maxBucket,bucket.length);if(bucket.length>1)s.collisionBuckets++;if(kinds.size>1)s.crossLengthBuckets++;}
  for(const r of bucket){const s=result[r.kind];s.entries++;s.totalWeight+=r.weight;if(bucket.length>1){s.affectedEntries++;s.affectedWeight+=r.weight;}if(r.id!==winner.id){s.nonFirstEntries++;s.nonFirstWeight+=r.weight;}}
 }
 const signature=crypto.createHash('sha256');for(const members of [...buckets.values()].map(b=>b.map(r=>r.id).sort()).sort((a,b)=>a[0]<b[0]?-1:1))signature.update(JSON.stringify(members)+'\n');
 for(const s of Object.values(result))if(s.totalWeight){s.affectedRate=s.affectedWeight/s.totalWeight;s.nonFirstRate=s.nonFirstWeight/s.totalWeight;}
 return {byKind:result,partitionSha256:signature.digest('hex')};
}
function specs(){
 const notes=path.join(ROOT,'research/notes');
 return [
  {id:'U7R-ba54b6e08e04',label:'E1 原U7E 1倍端',layout:notes+'/2026-11-20-untoned-frontiers-r11-scores-U7R-ba54b6e08e04.json',robust:notes+'/2026-11-20-untoned-frontiers-r11-robustness-U7R-ba54b6e08e04.json',components:notes+'/2026-11-20-untoned-frontiers-r11-components-U7R-ba54b6e08e04.json.gz'},
  {id:'UED-18c004bd1f31',label:'E2 原U7E 2/3倍端',layout:notes+'/2026-11-20-untoned-frontiers-r11-scores-UED-18c004bd1f31.json',robust:notes+'/2026-11-20-untoned-frontiers-r11-robustness-UED-18c004bd1f31.json',components:notes+'/2026-11-20-untoned-frontiers-r11-components-UED-18c004bd1f31.json.gz'},
  {id:'UQO-f32062502583',label:'Q1 放开空桶1倍端',layout:notes+'/2026-11-21-u7e-openqz-v52-policy-UQO-f32062502583.json',robust:notes+'/2026-11-21-u7e-openqz-v52-robustness-UQO-f32062502583.json',components:notes+'/2026-11-21-u7e-openqz-v52-robust-components-UQO-f32062502583.json.gz'},
  {id:'UQO-61c93a2c344c',label:'Q2 放开空桶2/3倍端',layout:notes+'/2026-11-21-u7e-openqz-v52-policy-UQO-61c93a2c344c.json',robust:notes+'/2026-11-21-u7e-openqz-v52-robustness-UQO-61c93a2c344c.json',components:notes+'/2026-11-21-u7e-openqz-v52-robust-components-UQO-61c93a2c344c.json.gz'},
  {id:'U7G-87a5d1a954d2',label:'G GPU ui/un交换',layout:notes+'/2026-11-21-u7e-gpu-close-policy.json',robust:notes+'/2026-11-21-u7e-competing-robustness-gpu.json',components:notes+'/2026-11-21-u7e-gpu-close-components.json.gz'}
 ];
}
async function score(id){
 const spec=specs().find(r=>r.id===id);assert.ok(spec);const source=read(spec.layout),robust=read(spec.robust);assert.ok(robust.completed);assert.equal(robust.inputSha256,hash(spec.components));
 const html='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html',data=scorer.loadPayload(html),entry=search.rebuild({...data.entries.find(e=>e.id==='UED-18c004bd1f31'),id,initialMap:source.initialMap,finalMap:source.finalMap},data);
 const audit=search.audit(entry,data);assert.ok(audit.valid&&audit.M===41&&audit.D===2);const semantics=auxiliarySemantics(entry.tone);
 const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile);
 const reference=v52.evaluateUntoned(data.entries.find(e=>e.id==='S005'),search.REF,null,ctx).v52;
 ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
 const capture=[],summarize=ctx.summarize;ctx.summarize=rows=>{const r=summarize(rows),counts=summarizeCodes(rows);assert.ok(Math.abs(counts.meanKeys-r.meanKeys)<1e-10);capture.push(counts);return r;};
 const policies=policyObjects(robust.selectedPolicies),computed=v52.evaluateUntoned(entry,policies,null,ctx).v52;ctx.summarize=summarize;assert.equal(capture.length,8);
 for(const mode of ['keytao','sanpin'])for(const k of KINDS)for(const[f,v]of Object.entries(robust.selectedTracks[mode][k]))if(typeof v==='number')assert.ok(Math.abs(computed[mode][k][f]-v)<1e-8,`${id}/${mode}/${k}/${f}`);
 const codes=Object.fromEntries(['keytao','sanpin'].map((m,i)=>[m,Object.fromEntries(KINDS.map((k,j)=>[k,capture[4*i+j]]))]));
 const raw={};for(const mode of ['keytao','sanpin']){
  const rows={character:scorer.buildRows(entry,data,ctx.strokes,{word2:[],word3:[],word4:[]},mode),
   ...Object.fromEntries(KINDS.slice(1).map(k=>[k,k==='word3'?ctx.buildExtendedWord3Rows(entry,data,ctx.words,mode,entry.tone,policies[mode][k]):ctx.buildRowsForOrder(entry,data,ctx.words,mode,entry.tone,k,policies[mode][k],model)]))};
  raw[mode]={intrinsic:Object.fromEntries(KINDS.map(k=>[k,baseBuckets(rows[k])])),jointWord2Word4:baseBuckets([...rows.word2,...rows.word4])};
 }
 const pyBuckets=new Map();for(const[p,w]of data.base){const c=entry.codeList[p];if(!pyBuckets.has(c))pyBuckets.set(c,[]);pyBuckets.get(c).push({p,w});}
 let total=0,miss=0,affected=0;for(const bucket of pyBuckets.values()){const weight=bucket.reduce((s,r)=>s+r.w,0);total+=weight;miss+=weight-Math.max(...bucket.map(r=>r.w));if(bucket.length>1)affected+=bucket.length;}
 const common399={unique:pyBuckets.size,collisionExcess:399-pyBuckets.size,collisionBuckets:[...pyBuckets.values()].filter(b=>b.length>1).length,affectedSyllables:affected,frequencyWeightedNonFirst:miss/total};
 const result={id,label:spec.label,initialMap:entry.initialMap,finalMap:entry.finalMap,codeList:entry.codeList,audit,auxiliarySemantics:semantics,policies:robust.selectedPolicies,ckt:[1,2,3].map(m=>search.normalize(computed,reference,m)),modes:computed,aggregate:v52.aggregate(computed),terminalCodes:codes,ergonomics:aggregateCodes(codes),rawMainCode:raw,common399,
  scope:'Own fixed robust auxiliary policies; same Common399/99% dictionary pool and 8 CKT tracks. Terminal-code loads include auxiliaries; excludes space, selection/page keystrokes and corrected errors. Pair rates within each terminal code, no fabricated inter-word sequence. Intrinsic raw main-code collisions and word2/word4 shared-pool collisions reported separately.',
  sourceHashes:Object.fromEntries([__filename,html,spec.layout,spec.robust,spec.components,profile,...['score_completion_ckt_v4.js','score_ckt_v52.js','ckt_v4_model.js','ckt_block_error.js','auxiliary_semantics.js','finalize_untoned_frontiers_r11.js'].map(f=>path.join(ROOT,'tools',f))].map(p=>[p,hash(p)]))};
 fs.writeFileSync(PREFIX+'-'+id+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({id,ckt:result.ckt,common399,home:result.ergonomics.home,leftPinky:result.ergonomics.leftPinky,rightPinky:result.ergonomics.rightPinky,selection:result.aggregate.selectionRate}));
}
if(require.main===module)score(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={summarizeCodes,ergonomic,aggregateCodes,baseBuckets,specs};
