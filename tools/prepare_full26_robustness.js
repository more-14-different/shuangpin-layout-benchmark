'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {setup}=require('./polish_full26');
const {policies}=require('./anneal_2126_model');
const {prepare}=require('./fast_toned_2126');
const experiment=require('./explore_toned_2126');
const input='research/notes/2026-11-17-toned-2126-best-full26-polished.json';
const output=process.argv[2]||'research/notes/2026-11-17-toned-2126-robustness-input.json';
const only=process.argv[3];
const {source,context,hashes}=setup(input,'D:/C2D/Documents/rime-snow-pinyin');
const fast=prepare(source.tokenKeys,context);
const read=f=>JSON.parse(fs.readFileSync(f));
const polish=read('research/notes/2026-11-17-toned-2126-full26-polish.json');
const original=read('research/notes/2026-11-16-anneal-2126-best-full26.json');
const oldFull=read('research/notes/2026-11-13-toned-2126-regroup-26-refine.json').results[0];
const oldKeep=read('research/notes/2026-11-13-toned-2126-regroup-keep-refine.json').results[0];
const newKeep=read('research/notes/2026-11-16-anneal-2126-best-keep.json');
const newSwap=read('research/notes/2026-11-16-anneal-2126-best-swap.json');
const baseEntry=context.data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED');
assert.ok(baseEntry);
const index=new Map(context.data.pinyin.map((p,i)=>[p,i]));
const base={layout:{id:baseEntry.id,shapeKeysByMeaning:'AEUIO',tonedCodes:source.tokenKeys.map(t=>baseEntry.codeList[index.get(t.slice(0,-1))])},policy:{word2:'12',word3:'12',word4:'24'},score:9.117650560950630};
const sameState=(a,b)=>JSON.stringify([a.partition,a.maps])===JSON.stringify([b.partition,b.maps]);
const cases=[['polished',source,polish.evaluations.filter(e=>sameState(e.state,source.state))],
 ['longrun',original,polish.evaluations.filter(e=>sameState(e.state,original.state))],
 ['oldFull26',oldFull,null],['oldQEmpty',oldKeep,null],
 ['newQEmpty',newKeep,null],['newSwap',newSwap,null],['untonedD3V1',base,null]];
let report={version:'full26-robust-input-1',hashes,reference:context.reference.tracks,
 baselineCostsMs:{firstAuxMs:300,secondAuxMs:300,thirdAuxMs:300,selectionDecisionMs:600,scanPerCandidateMs:50,pageActionMs:300},
 models:[],complete:false};
if(fs.existsSync(output)){const prev=read(output);assert.deepEqual(prev.hashes,hashes);report=prev;}
const save=()=>{fs.writeFileSync(output+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(output+'.tmp',output);};
for(const [key,best,cached] of cases){
 if(only && key!==only)continue;
 let model=report.models.find(m=>m.key===key);
 if(!model){model={key,layoutId:best.layout.id,publishedPolicy:best.policy,publishedScore:best.score,evaluations:[]};report.models.push(model);}
 const replay=fast(best.layout,best.policy);assert.ok(Math.abs(replay.score-best.score)<1e-10,`${key} replay drift`);
 const oracle=experiment.evaluate(best.layout,source.tokenKeys,context,best.policy);
 for(const k of Object.keys(oracle.tracks))for(const f of Object.keys(oracle.tracks[k]))assert.ok(Math.abs(oracle.tracks[k][f]-replay.tracks[k][f])<1e-8);
 model.oracleDifference=replay.score-oracle.score;
 for(const policy of policies){
  if(model.evaluations.some(e=>JSON.stringify(e.policy)===JSON.stringify(policy)))continue;
  const hit=cached?.find(e=>JSON.stringify(e.policy)===JSON.stringify(policy));
  const value=hit||fast(best.layout,policy);
  model.evaluations.push({policy,policyKey:['word2','word3','word4'].map(k=>policy[k]).join('/'),score:value.score,tracks:value.tracks});
  if(model.evaluations.length%12===0){save();console.log(key,model.evaluations.length,'/144',hit?'reused':'full');}
 }
 assert.equal(model.evaluations.length,144);save();
}
report.complete=true;save();console.log('complete',output);
