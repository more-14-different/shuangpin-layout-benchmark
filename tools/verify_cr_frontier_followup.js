'use strict';
// Independent full JS replay of the exported Rust search winners and policies.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4'),toned=require('./score_toned_2121_ckt_v51');
const native=require('./score_snow_jiandao_toned_benchmark'),{tonedMemoryAudit}=require('./toned_memory_audit');
const root=path.resolve(__dirname,'..'),prefix=path.join(root,'research/notes/2026-11-16-cr-frontier-followup');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const bundle=read(prefix+'-finalists.json'),aux=read(prefix+'-auxiliary.json');
const archive=read(path.join(root,'research/config/cr-frontier-finalists.json'));
const pinyin=[...new Set(bundle.tokenKeys.map(token=>token.replace(/[1-5]$/,'')))];
const decomposition=require('../research/config/ckt-v51-toned-2121-seeds.json').decomposition;
const html=path.join(root,'a7_CKT_R11.html'),data=scorer.loadPayload(html);delete data.tonedContractBenchmark;
const snow='D:/C2D/Documents/rime-snow-pinyin',words=scorer.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99);
const strokes=scorer.strokeOptions(path.join(snow,'rime-stroke/stroke.dict.yaml'));
const motor=toned.projectedMotor(data),reference=toned.buildReference({data,words,strokes,motor,snow});
const contract={shapeKeysByMeaning:'AVUIO',toneKeysByTone:'IVUAO',wordAuxiliaryPolicy:{word2:'12',word3:'213',word4:'24'}};
const roles={speed:'global_ckt_minimum',balanced:'balanced_daily_king',daily:'ultra_high_daily'};
const result={version:'cr-frontier-full-js-verification-v1',contract,tolerance:1e-9,
  sourceHashes:Object.fromEntries([prefix+'-finalists.json',prefix+'-auxiliary.json',html,
    path.join(root,'tools/score_toned_2121_ckt_v51.js'),path.join(root,'tools/ckt_v4_upstream_role_tables.json')]
    .map(p=>[path.relative(root,p).replaceAll('\\','/'),hash(p)])),results:[]};
const close=(a,b,label)=>{if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>1e-9)throw Error(label+': '+a+' != '+b)};
const output=prefix+'-verification.json';
const macroInput=path.join(root,'research/.cache/cr-frontier-followup-20261116/macro-input.json');
fs.mkdirSync(path.dirname(macroInput),{recursive:true});
fs.writeFileSync(macroInput,JSON.stringify({pinyin:data.pinyin,characters:data.characters,macroxue:{corpora:data.macroxue.corpora}}));
for(const layout of bundle.layouts){
  const tokenMap=new Map(bundle.tokenKeys.map((token,i)=>[token,layout.tonedCodes[i]]));
  const memory=tonedMemoryAudit({publication:{rhymeGroups:layout.rhymeGroups},
    tonedCodes:pinyin.map(py=>[1,2,3,4,5].map(t=>tokenMap.get(py+t)||null))},pinyin,decomposition);
  close(memory.lower,layout.metrics.m,'M lower');close(memory.guard,layout.metrics.guard,'M guard');
  const evaluate=policy=>{
    const v=toned.evaluateLayoutPolicy({layout,layouts:bundle,data,words,motor,reference,shapeKeysByMeaning:'AVUIO',policy});
    const ergonomics=native.loadSummary(v.outcomes);
    return {policy,score:v.score,tracks:v.tracks,ergonomics,aggregate:native.weightedAggregate(v.tracks,
      ['effectiveMs','motorUpperMs','meanKeys','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions'])};
  };
  const fixed=evaluate(contract.wordAuxiliaryPolicy);
  close(fixed.score,layout.rustScore,layout.id+' Rust/JS score');
  close(fixed.ergonomics.leftPinkyQAZPeak4NativeTracks.value,layout.metrics.pinky,layout.id+' Rust/JS pinky');
  const a=aux.results.find(r=>r.id===layout.id);
  if(!a||a.policyCount!==144||!a.cohortEqualityVerified)throw Error('incomplete auxiliary enumeration '+layout.id);
  const checks={};
  for(const type of ['bestStandard','bestRobust','bestPinkyPreserving']){
    const v=evaluate(a[type].policy);close(v.score,a[type].score,type+' score');
    close(v.ergonomics.leftPinkyQAZPeak4NativeTracks.value,a[type].pinky,type+' pinky');checks[type]=v;
  }
  const old=archive.finalists.find(r=>r.role===roles[layout.profile]).item;
  const changes={first:[],rhyme:[],roots:[]};
  for(const [atom,key] of Object.entries(layout.firstKeys)){
    const i=bundle.firstAtomNames.indexOf(atom);
    if(i<0)throw Error('unknown first atom '+atom);
    if(key!==old.state.firstKeys[i])changes.first.push({atom,from:old.state.firstKeys[i],to:key});
  }
  for(let region=0;region<3;region++)for(let group=0;group<10;group++){
    const before=old.state.groupKeys[region][group],after=layout.state.groupKeys[region][group];
    if(before!==after)changes.rhyme.push({region:['upper','home','lower'][region],roots:old.rhymeGroups[group].roots,from:before,to:after});
  }
  for(let i=0;i<18;i++)if(layout.state.partition[i]!==old.state.partition[i])changes.roots.push({index:i,
    from:old.state.partition[i],to:layout.state.partition[i]});
  result.results.push({id:layout.id,key:layout.key,profile:layout.profile,memory,
    daily:layout.metrics.daily,dailyPinky:layout.metrics.dailyPinky,changes,fixed,...checks});
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({id:layout.id,fixed:fixed.score,optimized:checks.bestStandard.score,changes}));
}
