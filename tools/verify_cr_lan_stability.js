'use strict';
// Independently rebuild full native competitions for both robustness selections.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4'),toned=require('./score_toned_2121_ckt_v51');
const native=require('./score_snow_jiandao_toned_benchmark'),{tonedMemoryAudit}=require('./toned_memory_audit');
const {toneKeysFromShapeKeys}=require('./auxiliary_semantics');
const prefix='research/notes/2026-11-17-cr-lan-f19-stability';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const bundle=read(prefix+'-finalists.json'),aux=read(prefix+'-auxiliary.json');
const layout=bundle.layouts[0],enumeration=aux.results[0];
const files=['robustness','constrained-robustness'].map(s=>prefix+'-'+s+'.json');
const ranks=files.map(read);
const html='a7_CKT_R11.html',snow='D:/C2D/Documents/rime-snow-pinyin';
for(const p of [html,path.join(snow,'snow_pinyin.base.dict.yaml'),path.join(snow,'rime-stroke/stroke.dict.yaml')])
  if(hash(p)!==aux.sourceHashes[p])throw Error('verification input changed: '+p);
const data=scorer.loadPayload(html);delete data.tonedContractBenchmark;
const words=scorer.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99);
const strokes=scorer.strokeOptions(path.join(snow,'rime-stroke/stroke.dict.yaml'));
const motor=toned.projectedMotor(data),reference=toned.buildReference({data,words,strokes,motor,snow});
const close=(a,b,label,tolerance=1e-9)=>{
  if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>tolerance)throw Error(label+': '+a+' != '+b);
};
const key=p=>['word2','word3','word4'].map(k=>p[k]).join('/');
const codes=new Map(bundle.tokenKeys.map((t,i)=>[t,layout.tonedCodes[i]]));
const pinyin=[...new Set(bundle.tokenKeys.map(t=>t.replace(/[1-5]$/,'')))];
const memory=tonedMemoryAudit({publication:{rhymeGroups:layout.rhymeGroups},
  tonedCodes:pinyin.map(py=>[1,2,3,4,5].map(t=>codes.get(py+t)||null))},pinyin,
  require('../research/config/ckt-v51-toned-2121-seeds.json').decomposition);
close(memory.lower,24,'M lower');close(memory.guard,25,'M guard');close(memory.D,2,'D');close(memory.F,0,'F');
const policies=new Map([[key(layout.wordAuxiliaryPolicy),layout.wordAuxiliaryPolicy]]);
for(const rank of ranks)for(const name of ['selectedPolicy','runnerPolicy']){
  const p=rank.results[0][name];policies.set(key(p),p);
}
const result={version:'cr-lan-f19-stability-full-native-v1',id:layout.id,memory,
  shapeKeysByMeaning:'AVUIO',toneKeysByTone:toneKeysFromShapeKeys('AVUIO'),
  sourceHashes:Object.fromEntries([__filename,html,prefix+'-finalists.json',prefix+'-auxiliary.json',...files,
    'tools/score_toned_2121_ckt_v51.js','tools/score_snow_jiandao_toned_benchmark.js','tools/toned_memory_audit.js',
    'tools/ckt_v4_model.js','tools/ckt_v4_upstream_role_tables.json'].map(p=>[p,hash(p)])),policies:[],selections:[]};
for(const [policyKey,policy] of policies){
  const row=enumeration.policies.find(p=>key(p.policy)===policyKey);
  if(!row)throw Error('unrecorded policy '+policyKey);
  const v=toned.evaluateLayoutPolicy({layout,layouts:bundle,data,words,motor,reference,shapeKeysByMeaning:'AVUIO',policy});
  close(v.score,row.score,'factorized/full score');
  for(const kind of ['character','word2','word3','word4'])for(const [field,value] of Object.entries(row.tracks[kind]))
    if(typeof value==='number')close(v.tracks[kind][field],value,kind+'/'+field);
  const ergonomics=native.loadSummary(v.outcomes);
  const left=ergonomics.leftPinkyQAZPeak4NativeTracks.value,right=ergonomics.rightPinkyPeak4NativeTracks.value;
  close(left,row.pinky,'left pinky',1e-12);close(right,row.rightPinky,'right pinky',1e-12);
  if(policyKey===key(layout.wordAuxiliaryPolicy))close(v.score,layout.rustScore,'original Rust/JS');
  result.policies.push({policy,policyKey,score:v.score,tracks:v.tracks,ergonomics,
    passesPinkyConstraints:left<=enumeration.pinkyCeiling+1e-12&&right<=enumeration.rightPinkyCeiling+1e-12});
  console.log(JSON.stringify({policy:policyKey,score:v.score,left,right}));
}
for(let i=0;i<ranks.length;i++){
  const r=ranks[i].results[0];
  const selected=result.policies.find(p=>p.policyKey===key(r.selectedPolicy));
  const runner=result.policies.find(p=>p.policyKey===key(r.runnerPolicy));
  close(selected.score,r.selectedScore,'selected score');close(runner.score,r.runnerScore,'runner score');
  close(runner.score-selected.score,r.defaultScoreGap,'gap');
  if(i===1&&(!selected.passesPinkyConstraints||!runner.passesPinkyConstraints))throw Error('ineligible constrained finalists');
  result.selections.push({source:files[i],selected: selected.policyKey,runner:runner.policyKey,
    gap:runner.score-selected.score,selectedEligible:selected.passesPinkyConstraints,runnerEligible:runner.passesPinkyConstraints});
}
fs.writeFileSync(prefix+'-verification.json',JSON.stringify(result,null,2)+'\n');
