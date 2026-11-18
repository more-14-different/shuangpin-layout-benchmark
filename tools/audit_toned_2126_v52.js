'use strict';
// Frozen layout selection, exact 144-policy scoring, and independent selected-policy checks.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const exp=require('./explore_toned_2126'),{prepare}=require('./fast_toned_2126');
const toned=require('./score_toned_2121_ckt_v51'),corpus=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model');
const native=require('./score_snow_jiandao_toned_benchmark'),{blockErrorMotor}=require('./ckt_block_error');
const {toneKeysFromShapeKeys,auxiliarySemantics,physicalShape}=require('./auxiliary_semantics'),{tonedMemoryAudit}=require('./toned_memory_audit');
const ROOT=path.resolve(__dirname,'..'),PREFIX='research/notes/2026-11-19-toned-2126-v52';
const KINDS=['character','word2','word3','word4'];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const policyKey=p=>KINDS.slice(1).map(k=>p[k]).join('/');
function args(){const a={};for(let i=2;i<process.argv.length;i++)if(process.argv[i].startsWith('--'))a[process.argv[i].slice(2)]=process.argv[++i];return a;}
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const text=JSON.stringify(value)+'\n';fs.writeFileSync(file,file.endsWith('.gz')?zlib.gzipSync(text):text);}
function setup(a){
 const main=path.resolve(a.main||'../shuangpin-layout-benchmark');
 const payload=path.resolve(a.payload||path.join(main,'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json'));
 const profile=path.resolve(a.profile||path.join(main,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
 const snow=path.resolve(a.snow||'D:/C2D/Documents/rime-snow-pinyin'),data=read(payload);
 const words=corpus.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99);
 const snapshot=read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'));
 const motor=model.projectedMotor(blockErrorMotor(snapshot,read(profile)),snapshot.keys,data.ckt.calibration.extension_maps);
 const legacy=toned.projectedMotor(data),publication=read('research/notes/2026-11-18-ckt-v52-all-schemes.json');
 const summarize=require(path.join(snow,'scripts/research/evaluate_ckt51_aux_order.js')).summarize;
 const reference={tracks:publication.references.v52.keytao,summarize};
 const context={data,words,motor,reference,buildRowsForOrder:require(path.join(snow,'scripts/research/evaluate_ckt_v4_word_aux_order.js')).buildRowsForOrder};
 const sourceFiles=[payload,profile,path.join(snow,'snow_pinyin.base.dict.yaml'),path.join(snow,'scripts/research/evaluate_ckt_v4_word_aux_order.js'),path.join(snow,'scripts/research/evaluate_ckt51_aux_order.js'),
  __filename,'tools/fast_toned_2126.js','tools/explore_toned_2126.js','tools/ckt_block_error.js','tools/ckt_v4_model.js','tools/ckt_v4_upstream_role_tables.json','research/notes/2026-11-18-ckt-v52-all-schemes.json'];
 return {context,legacy,publication,sourceHashes:Object.fromEntries(sourceFiles.map(p=>[path.resolve(p).replaceAll('\\','/'),hash(p)]))};
}
function candidates(a){
 const archive=path.resolve(a.archive||'../shuangpin-layout-benchmark-2126-gpu');
 const polished=read(path.join(archive,'research/notes/2026-11-17-toned-2126-best-full26-polished.json'));
 const polishPath=path.join(archive,'research/notes/2026-11-17-toned-2126-full26-polish.json'),polish=read(polishPath);
 const tokenKeys=polished.tokenKeys||polish.tokenKeys;
 const inventory=read('research/config/ckt-v51-toned-2121-seeds.json');
 const byPy=new Map(inventory.decomposition.map(d=>[d.pinyin,d]));
 const rootNames=polish.rootNames,rootOf=f=>{const d=inventory.decomposition.find(d=>d.fullFinal===f);return d.rhymeBody==='_'?f:d.rhymeBody;};
 const roots=Object.fromEntries([...new Set(inventory.decomposition.map(d=>d.fullFinal))].map(f=>[f,rootNames.indexOf(rootOf(f))]));
 const layouts=[],sources={};
 const add=(id,name,value,origin)=>{
  const layout=value.layout;if(layouts.some(r=>JSON.stringify(r.tonedCodes)===JSON.stringify(layout.tonedCodes)))return;
  const groups=[...Array(10)].map((_,g)=>({roots:rootNames.filter((r,i)=>(value.state?.partition[i]??layout.finalGroups[Object.keys(roots).find(f=>roots[f]===i)])===g),finals:Object.keys(layout.finalGroups).filter(f=>layout.finalGroups[f]===g)}));
  layouts.push({id,name,...layout,id,wordAuxiliaryPolicy:value.policy,expectedV51:value.score,origin,rhymeGroups:groups});
 };
 const files=[['A','A 精修','2026-11-17-toned-2126-best-full26-polished.json'],['B','B 长跑冠军','2026-11-16-anneal-2126-best-full26.json'],
  ['C','C 原前沿 10/9/7','2026-11-13-toned-2126-regroup-26-refine.json'],['D','D Q空键均衡','2026-11-13-toned-2126-regroup-keep-refine.json'],
  ['E','E Q空键长跑','2026-11-16-anneal-2126-best-keep.json'],['F','F Q空键上四','2026-11-16-anneal-2126-best-swap.json']];
 for(const [id,name,file] of files){const p=path.join(archive,'research/notes',file),s=read(p),v=s.results?.[0]||s;sources[file]=hash(p);add(id,name,v,{file,commit:id==='A'?'cd5497a':'b73e299'});}
 const byPhysical=new Map();
 for(const e of polish.evaluations){const key=JSON.stringify([e.state.partition,e.state.maps]);if(!byPhysical.has(key)||e.score<byPhysical.get(key).score)byPhysical.set(key,e);}
 const all=[...byPhysical.values()].sort((a,b)=>a.score-b.score),selected=new Map();
 const choose=e=>selected.set(JSON.stringify([e.state.partition,e.state.maps]),e);
 all.slice(0,12).forEach(choose);
 // Select additional parameter-sensitive challengers before looking at new v5.2 results.
 const costs=[300,300,300,600,50,300],fields=['firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions'];
 const points=[...Array(64)].map((_,i)=>costs.map((_,j)=>(i>>j&1)?10:0));
 for(const m of [.5,1,2,5,10])points.push(Array(6).fill(m));
 const oldRef=polish.reference.tracks||polish.reference;
 for(const x of points){
  const eff=t=>t.motorUpperMs+fields.reduce((s,f,j)=>s+costs[j]*x[j]*t[f],0);
  const score=e=>KINDS.reduce((s,k,i)=>s+[1,3,1,1][i]*(eff(e.tracks[k])/eff(oldRef[k]))**4,0);
  choose(all.reduce((best,e)=>!best||score(e)<score(best)?e:best,null));
 }
 let n=0;
 for(const e of selected.values()){
  const finalGroups=Object.fromEntries(Object.entries(roots).map(([f,r])=>[f,e.state.partition[r]]));
  const layout={shapeKeysByMeaning:'AEUIO',toneRowsByTone:polished.layout.toneRowsByTone,regionMaps:e.state.maps,finalGroups,
   tonedCodes:tokenKeys.map((t,i)=>{const f=byPy.get(t.slice(0,-1)).fullFinal,r=polished.layout.toneRowsByTone[Number(t.at(-1))];return polished.layout.tonedCodes[i][0]+exp.ROWS[r][e.state.maps[r][finalGroups[f]]];})};
  layout.id='T2126-V52-NEAR-'+crypto.createHash('sha256').update(JSON.stringify(layout.tonedCodes)).digest('hex').slice(0,12);
  if(layouts.some(r=>JSON.stringify(r.tonedCodes)===JSON.stringify(layout.tonedCodes)))continue;
  n++;add('N'+String(n).padStart(2,'0'),'精修邻域 '+n,{...e,layout},{file:path.basename(polishPath),historicalMove:e.move});
 }
 sources[path.basename(polishPath)]=hash(polishPath);
 return {version:'toned-2126-v52-candidates-v1',tokenKeys,layouts,sources,selection:{archiveDistinctLayouts:all.length,nearestLayouts:12,parameterProbes:points.length,rule:'Six representatives plus twelve best distinct physical layouts in the exact polish archive and winners at all 64 six-cost 0/10 corners plus uniform .5/1/2/5/10. Selection uses historical v5.1 only; no new layout search.'}};
}
function enumerate(a){
 const bundle=candidates(a);write(PREFIX+'-candidates.json',bundle);console.log('candidate layouts',bundle.layouts.length);
 const {context,legacy,publication,sourceHashes}=setup(a),fast=prepare(bundle.tokenKeys,context);
 const oldFast=prepare(bundle.tokenKeys,{...context,motor:legacy,reference:{...context.reference,tracks:publication.references.v51.keytao}});
 const out={version:'toned-2126-v52-144-policies-v1',reference:{tracks:context.reference.tracks},sourceHashes,results:[],complete:false};
 const output=PREFIX+'-policies.json.gz';
 if(fs.existsSync(output)){const prev=JSON.parse(zlib.gunzipSync(fs.readFileSync(output)));assert.deepEqual(prev.sourceHashes,sourceHashes);out.results=prev.results;}
 for(const layout of bundle.layouts){
  if(out.results.some(r=>r.id===layout.id))continue;
  const start=Date.now(),replay=oldFast(layout,layout.wordAuxiliaryPolicy);assert.ok(Math.abs(replay.score-layout.expectedV51)<1e-9,layout.id+' v51 replay '+replay.score+' != '+layout.expectedV51);
  const rows=[];
  for(const policy of exp.auxiliaryPolicies()){rows.push(fast(layout,policy));if(rows.length%48===0)console.log(layout.id,rows.length,'/144',((Date.now()-start)/1000).toFixed(1)+'s');}
  const anchor=rows.find(r=>policyKey(r.policy)===policyKey(layout.wordAuxiliaryPolicy));
  const publishedId={A:'T2126-POLISHED-8832091',B:'T2126-ANNEAL-8842639',C:'T2126-FULL26-8871530',D:'T2126-QEMPTY-8890382',E:'T2126-QEMPTY-ANNEAL-8879093',F:'T2126-QEMPTY-SWAP-8918781'}[layout.id];
  if(publishedId)assert.ok(Math.abs(anchor.score-publication.schemes[publishedId].v52.score)<1e-9,'v52 publication mismatch '+layout.id);
  out.results.push({id:layout.id,policies:rows,defaultBest:rows.reduce((a,b)=>a.score<b.score?a:b),publishedAnchor:anchor});write(output,out);
  console.log(JSON.stringify({id:layout.id,best:out.results.at(-1).defaultBest.score,seconds:(Date.now()-start)/1000}));
 }
 out.complete=true;write(output,out);
}
function exportTemplates(a){
 const bundle=read(PREFIX+'-candidates.json'),{context,sourceHashes}=setup(a),{data,words}=context;
 const byToken=new Map(bundle.tokenKeys.map((t,i)=>[t,i])),common=new Set(data.base.map(([i])=>i)),records=[];
 const token=(py,t)=>{const i=byToken.get(data.pinyin[py]+(t===0?5:t));assert.notEqual(i,undefined);return i;};
 for(const [text,py,t,weight,isCommon] of data.characters){
  if(!isCommon||!(weight>0)||corpus.FIXED_ONE_KEY.has(text)||!common.has(py))continue;
  const aux=physicalShape(data.shapes.snowshape[text],'IEUAO');if(aux.length<2)continue;
  records.push({id:`c:${text}:${py}`,kind:0,weight,tokens:[token(py,t)],aux:[...aux.slice(0,2)]});
 }
 for(const kind of KINDS.slice(1))words[kind].forEach((w,i)=>records.push({id:`${kind==='word2'?'w2':kind}:${i}`,kind:KINDS.indexOf(kind),weight:w.weight,
  tokens:w.py.map((py,j)=>token(py,w.tones[j])),aux:[...w.text].map(c=>physicalShape(data.shapes.snowshape[c],'IEUAO')[0])}));
 records.sort((a,b)=>b.weight-a.weight||(a.id<b.id?-1:a.id>b.id?1:0));
 const packed=new Int32Array(records.length*10);let at=0;
 for(const r of records){assert.ok(Number.isInteger(r.weight)&&r.weight<=2147483647);packed[at++]=r.kind;packed[at++]=r.weight;
  for(let j=0;j<4;j++)packed[at++]=r.tokens[j]??-1;
  for(let j=0;j<4;j++)packed[at++]=r.aux[j]?r.aux[j].charCodeAt(0)-65:-1;
 }
 const directory='research/.cache/toned-2126-v52';fs.mkdirSync(directory,{recursive:true});const bytes=Buffer.from(packed.buffer);
 fs.writeFileSync(directory+'/templates.bin',bytes);write(directory+'/templates.json',{version:1,rows:records.length,columns:10,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceHashes,reference:context.reference});
 console.log('exported',records.length,'rows');
}
function verify(a){
 const bundle=read(PREFIX+'-candidates.json'),audit=read(PREFIX+'-robustness.json');
 const enumeration=JSON.parse(zlib.gunzipSync(fs.readFileSync(PREFIX+'-policies.json.gz')));
 const {context,sourceHashes}=setup(a);
 // The verification driver may evolve after enumeration; all scoring inputs
 // and scorer modules must retain their exact fingerprints.
 for(const [file,digest] of Object.entries(enumeration.sourceHashes))if(file!==__filename.replaceAll('\\','/'))assert.equal(sourceHashes[file],digest,file+' changed');
 const inv=read('research/config/ckt-v51-toned-2121-seeds.json'),checks=new Map();
 const add=(id,policy)=>checks.set(id+'#'+policyKey(policy),{id,policy});
 for(const r of audit.results)if(bundle.layouts.some(l=>l.id===r.id))add(r.id,r.selected.policy);
 for(const r of audit.averageRegretSelections)if(bundle.layouts.some(l=>l.id===r.id))add(r.id,r.selected.policy);
 for(const comparisons of [audit.crossLayoutComparisons,audit.averageRegretCrossLayoutComparisons])for(const scope of Object.values(comparisons))for(const grid of Object.values(scope))for(const mode of Object.values(grid))for(const s of Object.values(mode))if(bundle.layouts.some(l=>l.id===s.worstCase.rivalId))add(s.worstCase.rivalId,s.worstCase.rivalPolicy);
 // All 144 A policies already match the independently implemented prepared JS
 // scorer. Here rebuild full native routing for each selected layout and all
 // counterexample policies, plus A's default and minimax alternatives.
 for(const p of audit.results.find(r=>r.id==='A').policyRanking.slice(0,3))add('A',p.policy);
 const results=[],memories=[];let maxDifference=0;
 for(const l of bundle.layouts){
  const codes=new Map(bundle.tokenKeys.map((t,i)=>[t,l.tonedCodes[i]]));
  const memory=tonedMemoryAudit({publication:{rhymeGroups:l.rhymeGroups,toneRowsByTone:l.toneRowsByTone},tonedCodes:context.data.pinyin.map(py=>[1,2,3,4,5].map(t=>codes.get(py+t)||null))},context.data.pinyin,inv.decomposition);
  memories.push({id:l.id,...memory});
 }
 for(const check of checks.values()){
  const layout=bundle.layouts.find(l=>l.id===check.id),tone=toneKeysFromShapeKeys(layout.shapeKeysByMeaning);
  assert.equal(auxiliarySemantics(tone).shapeKeysByMeaning,layout.shapeKeysByMeaning);
  const chars=toned.buildCharacterRows(layout,bundle,context.data,tone),adapted=exp.adaptWords(layout,bundle.tokenKeys,context.data,context.words);
  const entry={capacity:[21,26],codeList:layout.tonedCodes,tone};
  const wordRows=Object.entries(check.policy).flatMap(([k,p])=>context.buildRowsForOrder(entry,context.data,adapted,'keytao',tone,k,p,model));
  const outcomes=[...model.resolveCompetition(chars,{motorCost:context.motor}),...model.resolveCompetition(wordRows,{motorCost:context.motor,lengthBalance:exp.BALANCE})];
  const tracks=Object.fromEntries(KINDS.map(k=>[k,context.reference.summarize(outcomes.filter(o=>o.kind===k))]));
  const expected=enumeration.results.find(r=>r.id===check.id).policies.find(r=>policyKey(r.policy)===policyKey(check.policy));
  const score=toned.normalizedScore(tracks,context.reference.tracks);maxDifference=Math.max(maxDifference,Math.abs(score-expected.score));assert.ok(Math.abs(score-expected.score)<1e-9,check.id+' full score');
  for(const k of KINDS)for(const f of Object.keys(expected.tracks[k]))assert.ok(Math.abs(tracks[k][f]-expected.tracks[k][f])<1e-7,check.id+'/'+k+'/'+f);
  const selection=audit.results.find(r=>r.id===check.id).selected.policy;
  const averageSelection=audit.averageRegretSelections.find(r=>r.id===check.id).selected.policy;
  if([selection,averageSelection].some(p=>policyKey(p)===policyKey(check.policy))){
   const ergonomics=native.loadSummary(outcomes);
   for(const t of Object.values(ergonomics.tracks)){const sum=keys=>[...keys].reduce((s,k)=>s+t.load[k],0);t.leftIndex=sum('RTFGVB');t.rightIndex=sum('YUHJNM');t.bothIndex=t.leftIndex+t.rightIndex;t.leftHand=sum('QWERTASDFGZXCVB');t.rightHand=1-t.leftHand;}
   results.push({...check,selectionRules:[...(policyKey(selection)===policyKey(check.policy)?['minimax']:[]),...(policyKey(averageSelection)===policyKey(check.policy)?['averagePositiveRegret']:[])],score,tracks,ergonomics,aggregate:native.weightedAggregate(tracks,['motorUpperMs','effectiveMs','meanKeys','firstAuxRate','secondAuxRate','selectionRate','meanRejectedCandidates','meanPageActions'])});
  }
  if(results.length%5===0)console.log('full native verification',check.id,policyKey(check.policy));
 }
 write(PREFIX+'-verification.json',{version:1,sourceHashes,independentFullChecks:checks.size,maximumScoreDifference:maxDifference,memories,results});
 console.log('verified',checks.size,'full routing checks; max score difference',maxDifference);
}
if(require.main===module){const a=args();if(a.mode==='verify')verify(a);else if(a.mode==='templates')exportTemplates(a);else enumerate(a);}
module.exports={candidates,policyKey};
