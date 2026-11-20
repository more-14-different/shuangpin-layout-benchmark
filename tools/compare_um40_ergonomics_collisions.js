'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model'),v52=require('./score_ckt_v52');
const base=require('./search_untoned_t2126_m4_v52'),follow=require('./refine_untoned_t2126_m4_v52'),md=require('./search_untoned_m40d3_v52');
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..');
const PREFIX=path.join(ROOT,'research/notes/2026-11-20-um40-ergonomics-collisions');
const KINDS=['character','word2','word3','word4'],WEIGHTS={character:1,word2:3,word3:1,word4:1};
const GROUPS={leftPinky:'QAZ',rightPinky:"P[]\\;'/",leftIndex:'RFVTGB',rightIndex:'YHNUJM',bothIndex:'RFVTGBYHNUJM',leftHand:'QWERTASDFGZXCVB',rightHand:"YUIOPHJKLNM[]\\;'/",home:"ASDFGHJKL;'",W:'W',Y:'Y'};
const FINGER=Object.fromEntries([[0,'QAZ'],[1,'WSX'],[2,'EDC'],[3,'RFVTGB'],[6,'YHNUJM'],[7,'IK'],[8,'OL'],[9,"P[]\\;'/"]].flatMap(([finger,keys])=>[...keys].map(k=>[k,finger])));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function loadMetrics(load){
 const group=keys=>[...keys].reduce((sum,k)=>sum+(load[k]||0),0);
 const metrics=Object.fromEntries(Object.entries(GROUPS).map(([name,keys])=>[name,group(keys)]));
 metrics.maxFinger=Math.max(...[0,1,2,3,6,7,8,9].map(f=>Object.entries(load).filter(([k])=>FINGER[k]===f).reduce((sum,[,value])=>sum+value,0)));
 return metrics;
}
function legacyLoads(entry,fixture,weights){
 const layout=[...HEADS.map(h=>entry.initialMap[h]),...FINALS.map(f=>entry.finalMap[f]),...entry.tone];
 const tracks=Object.fromEntries(fixture.loadModel.tracks.map((name,i)=>{
  const load={};layout.forEach((key,j)=>load[key]=(load[key]||0)+fixture.loadModel.masses[i][j]);
  const total=Object.values(load).reduce((s,v)=>s+v,0);if(Math.abs(total-1)>1e-10)throw Error('Unnormalized frozen load track '+name);
  return [name,{load,...loadMetrics(load)}];
 }));
 const weightSum=Object.values(weights).reduce((s,v)=>s+v,0);if(Math.abs(weightSum-1)>1e-10)throw Error('Unnormalized track weights');
 const summary={};for(const field of Object.keys(tracks.S2).filter(k=>k!=='load')){
  summary[field+'Peak20']=Math.max(...Object.values(tracks).map(t=>t[field]));
  summary[field+'Weighted20']=Object.entries(weights).reduce((s,[track,w])=>s+w*tracks[track][field],0);
 }
 summary.homeS2=tracks.S2.home;summary.homeC4=tracks['C4-Snow'].home;summary.homeWX=tracks['WX-Snow-12'].home;
 summary.homeFloorCW=Math.min(summary.homeC4,summary.homeWX);summary.homeFloor20=Math.min(...Object.values(tracks).map(t=>t.home));
 return {summary,tracks};
}
function rawCollisions(rows,length){
 const buckets=new Map();let totalWeight=0;
 for(const row of rows){
  const stage=length?row.stages.find(s=>s.length===length):row.stages[0];
  if(!stage||stage.codes.length!==1)throw Error('Raw collision metric expects exactly one main code');
  const code=stage.codes[0];if(!buckets.has(code))buckets.set(code,[]);buckets.get(code).push(row);totalWeight+=row.weight;
 }
 let affectedWeight=0,lostWeight=0,affectedCount=0,collisionBuckets=0,maxBucket=0;
 for(const members of buckets.values()){
  maxBucket=Math.max(maxBucket,members.length);if(members.length<2)continue;collisionBuckets++;affectedCount+=members.length;
  const sum=members.reduce((s,r)=>s+r.weight,0);affectedWeight+=sum;lostWeight+=sum-Math.max(...members.map(r=>r.weight));
 }
 return {count:rows.length,totalWeight,uniqueCodes:buckets.size,collisionBuckets,maxBucket,affectedCount,affectedRate:affectedWeight/totalWeight,firstChoiceLossRate:lostWeight/totalWeight};
}
function terminalStats(rows,outcomes){
 const original=new Map(rows.map(r=>[r.id,r]));const load={},lengthWeight={};
 let weight=0,strokes=0,transitions=0,sameFinger=0,sameFingerOther=0,repeat=0,firstMainLoss=0,needsAux=0,needsSelection=0,weightedMotor=0;
 for(const row of outcomes){
  const source=original.get(row.id);weight+=row.weight;weightedMotor+=row.weight*row.motorUpperMs;
  const code=row.code;lengthWeight[code.length]=(lengthWeight[code.length]||0)+row.weight;
  if(code.length>source.stages[0].length)firstMainLoss+=row.weight;
  if(row.auxCount>0)needsAux+=row.weight;if(row.rank>1)needsSelection+=row.weight;
  for(let i=0;i<code.length;i++){
   const k=code[i];if(FINGER[k]===undefined)throw Error('Undefined finger '+k);load[k]=(load[k]||0)+row.weight;strokes+=row.weight;
   if(i){const previous=code[i-1];transitions+=row.weight;if(previous===k)repeat+=row.weight;if(FINGER[previous]===FINGER[k]){sameFinger+=row.weight;if(previous!==k)sameFingerOther+=row.weight;}}
  }
 }
 for(const k of Object.keys(load))load[k]/=strokes;
 return {count:outcomes.length,totalWeight:weight,totalWeightedStrokes:strokes,load,...loadMetrics(load),meanKeys:strokes/weight,
  sameFingerRate:sameFinger/transitions,sameFingerOtherKeyRate:sameFingerOther/transitions,repeatRate:repeat/transitions,
  firstMainLossRate:firstMainLoss/weight,needsAuxRate:needsAux/weight,selectionRate:needsSelection/weight,
  motorMs:weightedMotor/weight,lengthDistribution:Object.fromEntries(Object.entries(lengthWeight).map(([n,w])=>[n,w/weight]))};
}
function aggregate(modes){
 const fields=['leftPinky','rightPinky','leftIndex','rightIndex','bothIndex','leftHand','rightHand','home','maxFinger','W','Y','sameFingerOtherKeyRate','repeatRate','meanKeys','needsAuxRate','selectionRate'];
 const out=Object.fromEntries(fields.map(k=>[k,0]));
 for(const mode of ['keytao','sanpin'])for(const kind of KINDS)for(const field of fields)out[field]+=WEIGHTS[kind]*modes[mode][kind][field]/12;
 out.homeFloor8=Math.min(...Object.values(modes).flatMap(m=>Object.values(m).map(t=>t.home)));
 return out;
}
function averageTrack(modes,field,kind){return (modes.keytao[kind][field]+modes.sanpin[kind][field])/2;}
function csv(rows,headers){const quote=s=>'"'+String(s).replaceAll('"','""')+'"';return '\ufeff'+[headers,...rows].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';}
async function main(){
 const html=path.join(ROOT,'a7_CKT_R11.html'),fixtureFile=path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json');
 const data=scorer.loadPayload(html),fixture=read(fixtureFile),contract=read(path.join(base.WORK,'contract.json'));
 const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile);
 const research=read(path.join(ROOT,'research/notes/2026-11-20-um40-fixed-initial-rhymes.json'));
 const candidates=[{label:'A',entry:contract.inputs.entries[0],expected:contract.controls[0]},
  {label:'C',entry:contract.inputs.entries[1],expected:contract.controls[1]},
  {label:'当前',entry:read(path.join(ROOT,'research/config/untoned-m40d3-v52-finalist.json'))},
  {label:'偏1x',entry:{...follow.expand(research.bestDefault[0].state),id:research.bestDefault[0].id},expected:research.bestDefault[0]},
  {label:'偏2x',entry:{...follow.expand(research.bestDoubled[0].state),id:research.bestDoubled[0].id},expected:research.bestDoubled[0]}];
 const output={version:'um40-ergonomics-and-collisions-v1',contracts:{legacyLoads:'R11 frozen 20-contract token masses; peak metrics are max of per-track group sums; weighted home uses ensembleV5 track weights.',nativeLoads:'Actual selected terminal codes, including auxiliary keys; frequency-weighted within each mode/word length. Composite averages normalized track loads with character:word2:word3:word4=1:3:1:1 and keytao:sanpin=1:1; no selection-key or inter-code boundary strokes.',rawCollisions:'Frequency-weighted homocode affected rate and first-choice loss in each isolated main-code track: character=2, word2=4, word3=4 (AAAU), word4=4. Rows are dictionary readings, as in CKT; identical readings are deduplicated by the existing corpus builder.',actualRouting:'Characters compete separately; word2/word3/word4 compete jointly under soft page balancing. First-main loss is final code longer than first stage; word3 first stage=AAA. Needs-aux means terminal length>baseLength (4 for word3).',auxiliarySemantics:auxiliarySemantics('IEUAO'),policies:base.POLICY,lengthBalance:base.BALANCE,legacyTrackWeights:data.ensembleV5.trackWeights},corpus:{commonPinyin:data.base.length,words:Object.fromEntries(Object.entries(ctx.words).map(([k,rows])=>[k,{count:rows.length,totalWeight:rows.reduce((s,r)=>s+r.weight,0)}]))},sourceHashes:Object.fromEntries([html,fixtureFile,profile,__filename,path.join(ROOT,'tools/ckt_v4_model.js'),path.join(ROOT,'tools/score_completion_ckt_v4.js'),path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/auxiliary_semantics.js'),'D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml'].map(p=>[p,hash(p)])),results:[]};
 for(const candidate of candidates){
  const template=contract.inputs.entries[0],e={...template,...candidate.entry,capacity:[21,26],tone:'IEUAO'};
  e.codeList=data.pinyin.map((py,i)=>{if(!template.codeList[i])return null;const[h,f]=splitPinyin(py);return h===255||f===255?template.codeList[i]:e.initialMap[HEADS[h]]+e.finalMap[FINALS[f]];});
  const modes={},summaryModes={},raw={},v52Modes={};
  for(const mode of ['keytao','sanpin']){
   const rows={character:scorer.buildRows(e,data,ctx.strokes,{word2:[],word3:[],word4:[]},mode),...Object.fromEntries(['word2','word3','word4'].map(kind=>[kind,ctx.buildRowsForOrder(e,data,ctx.words,mode,e.tone,kind,base.POLICY[mode][kind],model)]))};
   const outcomes={character:model.resolveCompetition(rows.character,{motorCost:ctx.legacy})};
   const joint=model.resolveCompetition([...rows.word2,...rows.word4,...rows.word3],{motorCost:ctx.legacy,lengthBalance:base.BALANCE});
   for(const kind of ['word2','word3','word4'])outcomes[kind]=joint.filter(r=>r.kind===kind);
   modes[mode]={};summaryModes[mode]={};raw[mode]={};v52Modes[mode]={};
   for(const kind of KINDS){
    modes[mode][kind]=terminalStats(rows[kind],outcomes[kind]);raw[mode][kind]=rawCollisions(rows[kind],kind==='word3'?4:null);
    const summary=ctx.summarize(outcomes[kind]);summaryModes[mode][kind]=summary;
    let motor=0;for(const r of outcomes[kind])motor+=r.weight*ctx.next(r.code).upperMs;
    v52Modes[mode][kind]=v52.changedTrack(summary,motor/summary.totalWeight);
    if(Math.abs(modes[mode][kind].needsAuxRate-summary.firstAuxRate)>1e-12||Math.abs(modes[mode][kind].selectionRate-summary.selectionRate)>1e-12)throw Error('Terminal routing reconstruction mismatch');
   }
  }
  const score=base.normalize(v52Modes,contract.reference),doubledScore=base.normalize(v52Modes,contract.reference,2),expected=candidate.expected||{score:e.cktV52.defaultScore,doubledScore:e.cktV52.doubledCognitiveScore};
  if(Math.abs(score-expected.score)>1e-9||Math.abs(doubledScore-expected.doubledScore)>1e-9)throw Error('Frozen score reproduction failed '+e.id);
  const collisions=Object.fromEntries(KINDS.map(kind=>[kind,{rawAffectedRate:(raw.keytao[kind].affectedRate+raw.sanpin[kind].affectedRate)/2,rawFirstChoiceLossRate:(raw.keytao[kind].firstChoiceLossRate+raw.sanpin[kind].firstChoiceLossRate)/2,actualFirstMainLossRate:averageTrack(modes,'firstMainLossRate',kind),actualAuxRate:averageTrack(modes,'needsAuxRate',kind),terminalSelectionRate:averageTrack(modes,'selectionRate',kind)}]));
  const result={label:candidate.label,id:e.id,memory:md.memory(e),pinyinAudit:base.audit(e.initialMap,e.finalMap,data),cktV52:{score,doubledScore},legacyLoads:legacyLoads(e,fixture,data.ensembleV5.trackWeights),native:{aggregate:aggregate(modes),modes},collisions,rawCollisions:raw};
  output.results.push(result);console.log(JSON.stringify({computed:candidate.label,id:e.id,score,doubledScore,native:result.native.aggregate,legacy:result.legacyLoads.summary,collisions}));
 }
 fs.writeFileSync(PREFIX+'.json',JSON.stringify(output,null,2)+'\n');
 const headers=['方案','ID','M','D','CKT1x','CKT2x','终码左小指%','终码右小指%','终码左食指%','终码右食指%','终码双食指%','终码主行%','R11左小指峰值%','R11右小指峰值%','R11左食指峰值%','R11右食指峰值%','R11综合主行%','R11音节主行%','R11单字含辅主行%','R11二字含辅主行%','单字主码首选损失%','二字主码首选损失%','三字AAAU首选损失%','四字主码首选损失%','单字终码选重%','二字终码选重%','三字终码选重%','四字终码选重%'];
 const rows=output.results.map(r=>{const n=r.native.aggregate,l=r.legacyLoads.summary,c=r.collisions;return [r.label,r.id,r.memory.M,r.memory.D,r.cktV52.score,r.cktV52.doubledScore,...['leftPinky','rightPinky','leftIndex','rightIndex','bothIndex','home'].map(k=>n[k]*100),...['leftPinkyPeak20','rightPinkyPeak20','leftIndexPeak20','rightIndexPeak20','homeWeighted20','homeS2','homeC4','homeWX'].map(k=>l[k]*100),...KINDS.map(k=>c[k].rawFirstChoiceLossRate*100),...KINDS.map(k=>c[k].terminalSelectionRate*100)];});
 fs.writeFileSync(PREFIX+'.csv',csv(rows,headers));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={GROUPS,FINGER,loadMetrics,legacyLoads,rawCollisions,terminalStats,aggregate,PREFIX};
