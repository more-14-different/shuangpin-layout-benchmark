'use strict';
// Rebuild the full competitions for both the search policy and the six-cost winner.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4'),toned=require('./score_toned_2121_ckt_v51');
const native=require('./score_snow_jiandao_toned_benchmark'),{tonedMemoryAudit}=require('./toned_memory_audit');
const {toneKeysFromShapeKeys}=require('./auxiliary_semantics');
const prefix='research/notes/2026-11-16-cr-stable-neighbors';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const bundle=read(prefix+'-finalists.json'),aux=read(prefix+'-auxiliary.json'),rank=read(prefix+'-robustness.json');
const html='a7_CKT_R11.html',snow='D:/C2D/Documents/rime-snow-pinyin';
for(const p of [html,path.join(snow,'snow_pinyin.base.dict.yaml'),path.join(snow,'rime-stroke/stroke.dict.yaml')])
  if(hash(p)!==aux.sourceHashes[p])throw Error('verification input changed: '+p);
const data=scorer.loadPayload(html);delete data.tonedContractBenchmark;
const words=scorer.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99);
const strokes=scorer.strokeOptions(path.join(snow,'rime-stroke/stroke.dict.yaml'));
const motor=toned.projectedMotor(data),reference=toned.buildReference({data,words,strokes,motor,snow});
const decomposition=require('../research/config/ckt-v51-toned-2121-seeds.json').decomposition;
const pinyin=[...new Set(bundle.tokenKeys.map(t=>t.replace(/[1-5]$/,'')))];
const close=(a,b,label)=>{if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>1e-9)
  throw Error(label+': '+a+' != '+b);};
const result={version:'cr-stable-neighbors-full-native-v1',tolerance:1e-9,
  shapeKeysByMeaning:'AVUIO',toneKeysByTone:toneKeysFromShapeKeys('AVUIO'),
  sourceHashes:Object.fromEntries([__filename,html,prefix+'-finalists.json',prefix+'-auxiliary.json',prefix+'-robustness.json',
    'tools/score_toned_2121_ckt_v51.js','tools/score_snow_jiandao_toned_benchmark.js','tools/toned_memory_audit.js',
    'tools/ckt_v4_model.js','tools/ckt_v4_upstream_role_tables.json'].map(p=>[p,hash(p)])),results:[]};
for(const layout of bundle.layouts){
  const codes=new Map(bundle.tokenKeys.map((t,i)=>[t,layout.tonedCodes[i]]));
  const memory=tonedMemoryAudit({publication:{rhymeGroups:layout.rhymeGroups},
    tonedCodes:pinyin.map(py=>[1,2,3,4,5].map(t=>codes.get(py+t)||null))},pinyin,decomposition);
  close(memory.lower,layout.metrics.m,'M');close(memory.guard,layout.metrics.guard,'M guard');
  close(memory.D,layout.metrics.d,'D');close(memory.F,0,'F');
  const row=aux.results.find(r=>r.id===layout.id),r=rank.results.find(r=>r.id===layout.id);
  if(!row||!r)throw Error('missing layout '+layout.id);
  const evaluated=new Map();
  const evaluate=policy=>{
    const key=JSON.stringify(policy);if(evaluated.has(key))return evaluated.get(key);
    const v=toned.evaluateLayoutPolicy({layout,layouts:bundle,data,words,motor,reference,shapeKeysByMeaning:'AVUIO',policy});
    const record=row.policies.find(p=>JSON.stringify(p.policy)===key);
    if(!record)throw Error('unrecorded policy');
    close(v.score,record.score,'full/factorized score');
    for(const kind of ['character','word2','word3','word4'])for(const field of Object.keys(record.tracks[kind]))
      if(typeof record.tracks[kind][field]==='number')close(v.tracks[kind][field],record.tracks[kind][field],kind+'/'+field);
    const ergonomics=native.loadSummary(v.outcomes);
    close(ergonomics.leftPinkyQAZPeak4NativeTracks.value,record.pinky,'pinky');
    const value={policy,score:v.score,tracks:v.tracks,ergonomics,aggregate:native.weightedAggregate(v.tracks,
      ['effectiveMs','motorUpperMs','meanKeys','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions'])};
    evaluated.set(key,value);return value;
  };
  const fixed=evaluate(layout.wordAuxiliaryPolicy),selected=evaluate(r.selectedPolicy);
  close(fixed.score,layout.rustScore,'Rust/JS');close(selected.score,r.selectedScore,'selected score');
  result.results.push({id:layout.id,memory,fixed,selected});
  fs.writeFileSync(prefix+'-native.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({id:layout.id,fixed:fixed.score,selected:selected.score,policy:selected.policy}));
}
