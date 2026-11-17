'use strict';
// Exhaust the 21 sound keys without changing rhymes or either family's policy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model');
const toned=require('./score_toned_2121_ckt_v51'),native=require('./score_snow_jiandao_toned_benchmark');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const {tonedMemoryAudit}=require('./toned_memory_audit');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const snow='D:/C2D/Documents/rime-snow-pinyin',html='a7_CKT_R11.html';
const dir='research/.cache/lan-aeo-all-20261118';
const outputIndex=process.argv.indexOf('--output');
const output=outputIndex<0?'research/notes/2026-11-18-lan-aeo-all.json':process.argv[outputIndex+1];
const soundKeys=[...'BCDEFGHJKLMNPQRSTWXYZ'],weights={character:1,word2:3,word3:1,word4:1};
const mappingFile=snow+'/config/shenyun-21x21-mapping.json',mapping=read(mappingFile);
const data=scorer.loadPayload(html),words=scorer.multiwords(snow+'/snow_pinyin.base.dict.yaml',data,.99);
const strokes=scorer.strokeOptions(snow+'/rime-stroke/stroke.dict.yaml'),motor=toned.projectedMotor(data);
const {buildRowsForOrder}=require(snow+'/scripts/research/evaluate_ckt_v4_word_aux_order.js');
const {buildExtendedWord3Rows,summarize}=require(snow+'/scripts/research/evaluate_ckt51_aux_order.js');
const report={version:'lan-aeo-all-sound-keys-v1',soundKeys,auxiliaryPolicyReoptimized:false,
  htmlSha256:hash(html),sourceHashes:Object.fromEntries([__filename,mappingFile,
    snow+'/snow_sanpin.schema.yaml',snow+'/snow_jiandao.schema.yaml',
    snow+'/snow_pinyin.base.dict.yaml',snow+'/rime-stroke/stroke.dict.yaml',
    'tools/score_toned_2121_ckt_v51.js','tools/score_completion_ckt_v4.js','tools/ckt_v4_model.js',
    'tools/ckt_v4_scheme_fixture.js','tools/ckt_v4_upstream_role_tables.json',
    snow+'/scripts/research/evaluate_ckt_v4_word_aux_order.js',snow+'/scripts/research/evaluate_ckt51_aux_order.js'].map(p=>[p,hash(p)])),families:[]};
fs.mkdirSync(dir,{recursive:true});
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const close=(a,b,label)=>{if(!Number.isFinite(a)||Math.abs(a-b)>1e-9)throw Error(label+': '+a+' != '+b);};
function rebuild(entry){
  return {...entry,codeList:data.pinyin.map((py,i)=>{
    if(!entry.codeList[i])return null;
    const [h,f]=splitPinyin(py);
    return h===255||f===255?entry.codeList[i]:entry.initialMap[HEADS[h]]+entry.finalMap[FINALS[f]];
  })};
}
function auditUntoned(entry){
  const first={},last={},codes=[];
  for(const [p] of data.base){
    const [hi,fi]=splitPinyin(data.pinyin[p]),h=HEADS[hi]==='YU'?'Y':HEADS[hi],f=FINALS[fi],code=entry.codeList[p];
    if(typeof code!=='string'||! /^[A-Z]{2}$/.test(code))throw Error('incomplete Common399');
    (first[h]??=new Set()).add(code[0]);(last[f]??=new Set()).add(code[1]);codes.push(code);
  }
  const onsetLinks=Object.entries(first).filter(([h])=>!'AEO'.includes(h)).reduce((s,[h,ks])=>s+[...ks].filter(k=>h.toUpperCase()!==k).length,0)
    +new Set(['A','E','O'].flatMap(h=>[...(first[h]||[])])).size;
  const finalLinks=Object.entries(last).reduce((s,[f,ks])=>s+[...ks].filter(k=>f.toUpperCase()!==k).length,0);
  const branches=[...Object.values(first),...Object.values(last)].reduce((s,ks)=>s+ks.size-1,0);
  const reserved=new Set(entry.tone),sound=[...new Set(codes.map(c=>c[0]))],rhyme=[...new Set(codes.map(c=>c[1]))];
  return {valid:sound.every(k=>!reserved.has(k))&&sound.length<=21&&rhyme.length<=21&&rhyme.every(k=>!reserved.has(k)),
    M:onsetLinks+finalLinks+branches,D:HEADS.slice(0,21).filter(h=>h.length===1).filter(h=>first[h].size!==1||!first[h].has(h.toUpperCase())).length,
    V:[...'aeiou'].filter(f=>!last[f]?.has(f.toUpperCase())).length,branches,unique:new Set(codes).size,
    qz:codes.includes('QZ'),zq:codes.includes('ZQ')};
}
function ergonomicsUntoned(entry,fixture){
  const physical=[...HEADS.map(h=>entry.initialMap[h]),...FINALS.map(f=>entry.finalMap[f]),...entry.tone],lm=fixture.loadModel;
  const loads=lm.masses.map(row=>{const load={};physical.forEach((key,i)=>load[key]=(load[key]||0)+row[i]);return load;});
  const sum=(load,keys)=>[...keys].reduce((s,k)=>s+(load[k]||0),0),homes=loads.map(l=>sum(l,lm.homeKeys));
  const m=fixture.movingHand,corpus=m.corpora.daily,variant=corpus.variants['native-punctuation'];
  const tokens=corpus.tokens.filter(t=>variant.includeFixedKeys||t.pinyin!=null);
  const strokes=tokens.flatMap(t=>t.key!=null?[t.key.toUpperCase()]:[...entry.codeList[t.pinyinIndex]]);
  const distance=(x0,y0,x1,y1)=>{
    if(y0>0)x0+=m.rowStagger.firstLowerRow+(y0-1)*m.rowStagger.perAdditionalRow;
    if(y1>0)x1+=m.rowStagger.firstLowerRow+(y1-1)*m.rowStagger.perAdditionalRow;
    return Math.hypot(x0-x1,y0-y1);
  };
  const positions=[[0,0],[0,0]];let prev=m.initialPreviousColumn,time=0;
  for(const key of strokes){const g=m.geometry[key],hand=Number(g.x>=5),same=hand===Number(prev>=5),[px,py]=positions[hand];
    positions[hand]=[g.x-g.finger,g.y-1];time+=(.2+(same?distance(g.finger+px,1+py,g.x,g.y):0))/m.fingerSpeeds[g.finger];prev=g.x;}
  let cost=0,weight=0;for(const [p,w] of data.base){cost+=w*motor(entry.codeList[p]).upperMs;weight+=w;}
  return {mx:tokens.length/time*200,hits:strokes.length,homeS2:homes[lm.tracks.indexOf('S2')],homeFloor:Math.min(...homes),
    rpMax:Math.max(...loads.map(l=>sum(l,lm.rightPinkyKeys))),wMax:Math.max(...loads.map(l=>l.W||0)),
    yMax:Math.max(...loads.map(l=>l.Y||0)),motor:cost/weight};
}
function evaluateUntoned(entry,policies){
  const modes={},ergonomics={};
  for(const mode of ['keytao','sanpin']){
    const chars=model.resolveCompetition(scorer.buildRows(entry,data,strokes,{word2:[],word3:[],word4:[]},mode),{motorCost:motor});
    const rows=Object.fromEntries(Object.entries(policies[mode]).map(([kind,order])=>[kind,kind==='word3'?
      buildExtendedWord3Rows(entry,data,words,mode,entry.tone,order):buildRowsForOrder(entry,data,words,mode,entry.tone,kind,order,model)]));
    const pair=model.resolveCompetition([...rows.word2,...rows.word4],{motorCost:motor});
    const third=model.resolveCompetition(rows.word3,{motorCost:motor});
    const all=[...chars,...pair,...third];ergonomics[mode]=native.loadSummary(all);
    modes[mode]=Object.fromEntries(Object.keys(weights).map(kind=>[kind,summarize(all.filter(r=>r.kind===kind))]));
  }
  return {modes,ergonomics};
}
function untonedScores(v,ref){
  const byMode={};let total=0;
  for(const mode of ['keytao','sanpin']){
    let sum=0;for(const [kind,w] of Object.entries(weights))sum+=w*(v.modes[mode][kind].effectiveMs/ref.modes[mode][kind].effectiveMs)**4;
    byMode[mode]=10*(sum/6)**.25;total+=sum;
  }
  return {score:10*(total/12)**.25,byMode};
}
async function main(){
  const option=process.argv.indexOf('--family'),family=option<0?'both':process.argv[option+1];
  if(family==='both'||family==='toned'){
    const bundle=read('research/notes/2026-11-17-cr-lan-f19-stability-finalists.json'),base=bundle.layouts[0];
    const reference=toned.buildReference({data,words,strokes,motor,snow});
    const decomposition=read('research/config/ckt-v51-toned-2121-seeds.json').decomposition;
    const pinyin=[...new Set(bundle.tokenKeys.map(t=>t.replace(/[1-5]$/,'')))];
    const f={family:'toned',baselineId:base.id,policy:base.wordAuxiliaryPolicy,constraints:base.constraints,rows:[]};report.families.push(f);
    for(const target of [null,...soundKeys]){
      const layout=structuredClone(base);if(target)layout.tonedCodes=base.tonedCodes.map((code,i)=>
        /^[aeo]/.test(bundle.tokenKeys[i])?target+code[1]:code);
      const codes=new Map(bundle.tokenKeys.map((t,i)=>[t,layout.tonedCodes[i]]));
      const memory=tonedMemoryAudit({publication:{rhymeGroups:layout.rhymeGroups},
        tonedCodes:pinyin.map(py=>[1,2,3,4,5].map(t=>codes.get(py+t)||null))},pinyin,decomposition);
      const v=toned.evaluateLayoutPolicy({layout,layouts:bundle,data,words,motor,reference,shapeKeysByMeaning:'AVUIO',policy:f.policy});
      const erg=native.loadSummary(v.outcomes),row={target:target||'original',score:v.score,memory,tracks:v.tracks,ergonomics:erg,
        occupiedBuckets:new Set(layout.tonedCodes).size,
        passesLeft:erg.leftPinkyQAZPeak4NativeTracks.value<=f.constraints.pinkyCeiling+1e-12,
        passesRight:erg.rightPinkyPeak4NativeTracks.value<=f.constraints.rightPinkyCeiling+1e-12};
      if(!target)close(v.score,base.rustScore,'toned baseline');
      f.rows.push(row);save();console.log(JSON.stringify({family:f.family,target:row.target,score:v.score,left:erg.leftPinkyQAZPeak4NativeTracks.value,right:erg.rightPinkyPeak4NativeTracks.value}));
    }
  }
  if(family==='both'||family==='untoned'){
    const original=data.entries.find(e=>e.id===mapping.id);if(!original)throw Error('missing current production Lan');
    for(const [name,key] of Object.entries(mapping.initialMap))if(original.initialMap[name]!==key)throw Error('production onset mismatch '+name);
    for(const [name,key] of Object.entries(mapping.finalMap))if(original.finalMap[name]!==key)throw Error('production final mismatch '+name);
    const sem=auxiliarySemantics(original.tone);if(sem.shapeKeysByMeaning!==mapping.shapeKeysByMeaning||sem.toneKeysByTone!==mapping.toneKeysByTone)throw Error('auxiliary meaning mismatch');
    const policies={keytao:Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,mapping.shapeAuxiliaryOrder.split('/')[i]])),
      sanpin:Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,mapping.toneAuxiliaryOrder.split('/')[i]]))};
    const referencePolicies={keytao:{word2:'12',word3:'213',word4:'24'},sanpin:{word2:'12',word3:'213',word4:'23'}};
    const ref=evaluateUntoned(data.entries.find(e=>e.id==='S005'),referencePolicies);
    const fixture=read('research/.cache/ckt-v4-ergonomics.json');
    const f={family:'untoned',baselineId:original.id,policy:policies,referencePolicy:referencePolicies,rows:[]};report.families.push(f);
    for(const target of [null,...soundKeys]){
      const entry=rebuild({...original,id:original.id+'-AEO-'+(target||'original'),initialMap:{...original.initialMap,
        ...(target?{A:target,E:target,O:target}:{})}});
      const a=auditUntoned(entry),v=evaluateUntoned(entry,policies),scores=untonedScores(v,ref);
      const erg=ergonomicsUntoned(entry,fixture);
      const row={target:target||'original',...scores,audit:a,ergonomics:v.ergonomics,erg20:erg,modes:v.modes};
      if(!target){close(scores.score,mapping.cktV51,'untoned current production baseline');close(a.M,mapping.memory,'untoned M');
        close(erg.mx,data.macroxue.values[original.id]['daily|native-punctuation'].score,'untoned daily');}
      f.rows.push(row);fs.writeFileSync(dir+'/untoned-'+row.target+'.entry.json',JSON.stringify(entry));
      save();console.log(JSON.stringify({family:f.family,target:row.target,score:scores.score,daily:erg.mx,M:a.M,unique:a.unique,qz:a.qz,zq:a.zq}));
    }
  }
  report.completed=true;report.htmlUnchanged=hash(html)===report.htmlSha256;if(!report.htmlUnchanged)throw Error('HTML changed');save();
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
