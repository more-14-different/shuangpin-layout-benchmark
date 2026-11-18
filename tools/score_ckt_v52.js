'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model');
const {blockErrorMotor}=require('./ckt_block_error');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..');
const KINDS=['character','word2','word3','word4'];
const WEIGHTS=Object.freeze({character:1,word2:3,word3:1,word4:1});
const REFERENCE_POLICIES={keytao:{word2:'12',word3:'213',word4:'24'},sanpin:{word2:'12',word3:'213',word4:'23'}};
const BALANCE={pageSize:6,maximumCandidates:120,minimumInputLength:4};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

function inventory(data){
  const untoned=data.entries.filter(e=>Number.isFinite(e.productionCandidateMetrics?.replayedCktV51));
  const group=data.tonedContractBenchmark?.schemes||{};
  const toned=[group.snowJiandao,...Object.values(group.research||{})].filter(n=>Number.isFinite(n?.ckt?.v51?.score));
  const ids=[...untoned,...toned].map(x=>x.id);
  if(new Set(ids).size!==ids.length)throw Error('duplicate v5.1 scheme IDs');
  return {untoned,toned,aliases:group.qzE8f37a?[{path:'tonedContractBenchmark.schemes.qzE8f37a',id:group.qzE8f37a.id}]:[]};
}
function v51Digest(data){
  const i=inventory(data),pick=o=>Object.fromEntries(Object.entries(o||{}).filter(([k])=>/51/i.test(k)));
  return digest({untoned:i.untoned.map(e=>({id:e.id,production:pick(e.productionCandidateMetrics),readme:pick(e.readmeBenchmarkMetrics)})),
    toned:i.toned.map(n=>({id:n.id,v51:n.ckt.v51})),aliases:i.aliases.map(a=>({id:a.id,v51:data.tonedContractBenchmark.schemes.qzE8f37a.ckt.v51}))});
}
function effective(t){return t.effectiveMs}
function aggregate(modes){
  const fields=['motorUpperMs','effectiveMs','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions','meanKeys'];
  const out=Object.fromEntries(fields.map(k=>[k,0])),members=Object.keys(modes);
  for(const mode of members)for(const kind of KINDS)for(const field of fields)out[field]+=WEIGHTS[kind]*(modes[mode][kind][field]||0)/(6*members.length);
  out.cognitiveMs=out.effectiveMs-out.motorUpperMs;return out;
}
function scoreModes(modes,references){
  const members=Object.keys(modes);
  let sum=0;for(const mode of members)for(const k of KINDS)sum+=WEIGHTS[k]*(effective(modes[mode][k])/effective(references[mode][k]))**4;
  return 10*(sum/(6*members.length))**.25;
}
function describe(modes,references){
  const members=Object.keys(modes),memberScores={},trackScores={};
  for(const mode of members){
    memberScores[mode]=scoreModes({[mode]:modes[mode]},references);
    trackScores[mode]=Object.fromEntries(KINDS.map(k=>[k,10*effective(modes[mode][k])/effective(references[mode][k])]));
  }
  const equalTracks=Object.fromEntries(KINDS.map(k=>[k,{score:10*(members.reduce((s,m)=>s+(effective(modes[m][k])/effective(references[m][k]))**4,0)/members.length)**.25,
    effectiveMs:members.reduce((s,m)=>s+effective(modes[m][k]),0)/members.length}]));
  return {score:scoreModes(modes,references),aggregate:aggregate(modes),modes,memberScores,trackScores,equalTracks};
}
function changedTrack(old,newMotorMs){return {...old,motorUpperMs:newMotorMs,effectiveMs:old.effectiveMs-old.motorUpperMs+newMotorMs}}
function reprice(outcomes,motor,summarize){
  const old=summarize(outcomes);let total=0,weight=0;
  for(const row of outcomes){total+=row.weight*motor(row.code).upperMs;weight+=row.weight}
  assert.equal(weight,old.totalWeight);
  return {v51:old,v52:changedTrack(old,total/weight)};
}
function routeSignature(rows){
  const signatures=new Set(rows.map(r=>JSON.stringify({baseLength:r.baseLength,stages:r.stages.map(s=>({length:s.length,pool:s.pool}))})));
  for(const r of rows)for(const s of r.stages)if(s.length>4&&s.codes.length!==1)throw Error('long-code alternatives need full v5.2 routing');
  return [...signatures].map(x=>JSON.parse(x));
}
function context(data,snow,profilePath){
  const snapshot=read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')),profile=read(profilePath);
  const legacy=model.projectedMotor(model.upstreamMotor(snapshot),snapshot.keys,data.ckt.calibration.extension_maps);
  const next=model.projectedMotor(blockErrorMotor(snapshot,profile,{tailMode:'block'}),snapshot.keys,data.ckt.calibration.extension_maps);
  return {data,snow,snapshot,profile,legacy,next,
    words:scorer.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99),
    strokes:scorer.strokeOptions(path.join(snow,'rime-stroke/stroke.dict.yaml')),
    ...require(path.join(snow,'scripts/research/evaluate_ckt_v4_word_aux_order.js')),
    ...require(path.join(snow,'scripts/research/evaluate_ckt51_aux_order.js'))};
}
function evaluateUntoned(entry,policies,lengthBalance,ctx){
  const versions={v51:{},v52:{}},routes={};
  const traditional=model.classifyContract(entry.capacity)==='traditional-21x21';
  auxiliarySemantics(entry.tone);
  for(const mode of ['keytao','sanpin']){
    const rows={character:scorer.buildRows(entry,ctx.data,ctx.strokes,{word2:[],word3:[],word4:[]},mode),
      ...Object.fromEntries(['word2','word3','word4'].map(kind=>[kind,
        kind==='word3'&&traditional?ctx.buildExtendedWord3Rows(entry,ctx.data,ctx.words,mode,entry.tone,policies[mode][kind]):
          ctx.buildRowsForOrder(entry,ctx.data,ctx.words,mode,entry.tone,kind,policies[mode][kind],model)]))};
    routes[mode]=Object.fromEntries(KINDS.map(k=>[k,routeSignature(rows[k])]));
    const outcomes={character:model.resolveCompetition(rows.character,{motorCost:ctx.legacy})};
    const pair=model.resolveCompetition([...rows.word2,...rows.word4,...(traditional?[]:rows.word3)],
      {motorCost:ctx.legacy,...(!traditional&&lengthBalance?{lengthBalance}: {})});
    outcomes.word2=pair.filter(r=>r.kind==='word2');outcomes.word4=pair.filter(r=>r.kind==='word4');
    outcomes.word3=traditional?model.resolveCompetition(rows.word3,{motorCost:ctx.legacy}):pair.filter(r=>r.kind==='word3');
    versions.v51[mode]={};versions.v52[mode]={};
    for(const k of KINDS){const r=reprice(outcomes[k],ctx.next,ctx.summarize);versions.v51[mode][k]=r.v51;versions.v52[mode][k]=r.v52}
  }
  return {...versions,routes};
}
function* nativeRows(native,data){
  if(native.filterRows){yield* native.filterRows;return}
  const packed=native.filterRowsPacked,pool=data.tonedFilterRowPool;
  if(packed?.version!==1||pool?.version!==1)throw Error('unknown native terminal encoding '+native.id);
  for(const row of packed.rows){const [text,reading,weight,kind]=pool.rows[row[0]];yield [text,reading,row[1],row[2],weight,kind]}
}
function evaluateToned(native,ctx){
  const old=native.ckt.v51.tracks,sums=Object.fromEntries(KINDS.map(k=>[k,{old:0,next:0,weight:0,count:0,main:new Set(),terminal:new Set()}]));
  const semantics=auxiliarySemantics(native.contract.toneKeysByTone);
  assert.equal(semantics.shapeKeysByMeaning,native.contract.shapeKeysByMeaning);
  for(const row of nativeRows(native,ctx.data)){
    const s=sums[row[5]];s.old+=row[4]*ctx.legacy(row[3]).upperMs;s.next+=row[4]*ctx.next(row[3]).upperMs;
    s.weight+=row[4];s.count++;s.main.add(row[2].length);s.terminal.add(row[3].length);
  }
  const next={};for(const k of KINDS){const s=sums[k];assert.equal(s.count,old[k].count);assert.equal(s.weight,old[k].totalWeight);
    assert.ok(Math.abs(s.old/s.weight-old[k].motorUpperMs)<1e-7,native.id+'/'+k+' frozen motor mismatch');
    next[k]=changedTrack(old[k],s.next/s.weight)}
  return {v51:{keytao:old},v52:{keytao:next},routes:{keytao:Object.fromEntries(KINDS.map(k=>[k,{
    nativeContract:native.contract.main,mainLengths:[...sums[k].main].sort(),terminalLengths:[...sums[k].terminal].sort(),
    policy:k==='character'?'two shape strokes':native.contract.wordAuxiliaryPolicy[k]}]))}};
}
function snapshotInput(html,output){
  fs.mkdirSync(output,{recursive:true});const backup=path.join(output,'before.html');
  if(!fs.existsSync(backup))fs.copyFileSync(html,backup);
  return hash(html);
}
function main(){
  const args={};for(let i=2;i<process.argv.length;i++)if(process.argv[i].startsWith('--'))args[process.argv[i].slice(2)]=process.argv[++i];
  const html=path.resolve(args.html||path.join(ROOT,'a7_CKT_R11.html')),snow=path.resolve(args.snow||'D:/C2D/Documents/rime-snow-pinyin');
  const cache=path.resolve(args.cache||path.join(ROOT,'research/.cache/ckt-v52-publication-20261118'));
  const htmlSha=snapshotInput(html,cache),data=scorer.loadPayload(html),targets=inventory(data),before=v51Digest(data);
  const profilePath=path.resolve(args.profile||path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
  const ctx=context(data,snow,profilePath),ref=data.entries.find(e=>e.id==='S005');
  const reference=evaluateUntoned(ref,REFERENCE_POLICIES,null,ctx);
  const output={version:'ckt-v5.2-contract-preserving-publication-v1',model:'four-prefix-tail-success-v1',tailMode:'block',
    definition:{nativeUnchangedThrough:4,five:'Q5(ABCDE)=Q4(ABCD)*Q2(DE)',six:'Q6(ABCDEF)=Q4(ABCD)*Q3(DEF)',
      time:'Original rolling timing; frozen four-key error cost anchored plus added whole-string failure risk',
      cognitiveMs:{firstAux:300,secondAux:300,thirdAux:300,selection:600,scan:50,page:300},pageSize:6,
      kindWeights:WEIGHTS,memberWeights:'same as each v5.1 task; untoned keytao/sanpin equally weighted; tone-in-main remains shape-only',
      upstreamErrorArtifact:'rebuilt from pinned source/data; original separate error artifact not available',
      policySelection:'inherit each published v5.1 policy; no auxiliary-order reselection'},
    htmlBeforeSha256:htmlSha,v51BeforeDigest:before,sourceHashes:Object.fromEntries([
      __filename,path.join(ROOT,'tools/ckt_block_error.js'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),profilePath,
      path.join(snow,'snow_pinyin.base.dict.yaml'),path.join(snow,'scripts/research/evaluate_ckt_v4_word_aux_order.js'),
      path.join(snow,'scripts/research/evaluate_ckt51_aux_order.js')].map(p=>[path.relative(ROOT,p).replaceAll('\\','/'),hash(p)])),
    counts:{untoned:targets.untoned.length,toned:targets.toned.length,total:targets.untoned.length+targets.toned.length},
    references:{v51:reference.v51,v52:reference.v52,policies:REFERENCE_POLICIES},aliases:targets.aliases,schemes:{}};
  for(const e of targets.untoned){
    const p=e.productionCandidateMetrics,policies=p.cktV51Policies;
    assert.deepEqual(policies.reference,REFERENCE_POLICIES,e.id+' reference policy differs');
    const balance=e.capacity[1]===26?BALANCE:null;
    const value=evaluateUntoned(e,policies.candidate,balance,ctx);
    const v51=describe(value.v51,reference.v51),v52=describe(value.v52,reference.v52);
    assert.ok(Math.abs(v51.score-p.replayedCktV51)<1e-9,e.id+': v5.1 replay mismatch '+v51.score+' != '+p.replayedCktV51);
    output.schemes[e.id]={id:e.id,name:e.name,kind:'untoned',contract:{capacity:e.capacity,auxiliarySemantics:auxiliarySemantics(e.tone),
      policies,lengthBalance:balance,routes:value.routes,reference:'S005 each mode separately'},v51,v52};
    fs.writeFileSync(path.join(cache,'progress.json'),JSON.stringify(output));console.log(JSON.stringify({id:e.id,v51:v51.score,v52:v52.score}));
  }
  for(const n of targets.toned){
    const value=evaluateToned(n,ctx),v51=describe(value.v51,{keytao:reference.v51.keytao}),v52=describe(value.v52,{keytao:reference.v52.keytao});
    assert.ok(Math.abs(v51.score-n.ckt.v51.score)<1e-9,n.id+' v5.1 normalization mismatch');
    output.schemes[n.id]={id:n.id,name:n.name,kind:'tone-in-main',contract:{...n.contract,routes:value.routes,reference:n.ckt.v51.reference},v51,v52};
    fs.writeFileSync(path.join(cache,'progress.json'),JSON.stringify(output));console.log(JSON.stringify({id:n.id,v51:v51.score,v52:v52.score}));
  }
  assert.equal(before,v51Digest(data));assert.equal(htmlSha,hash(html),'HTML changed during scoring');
  const destination=path.resolve(args.output||path.join(ROOT,'research/notes/2026-11-18-ckt-v52-all-schemes.json'));
  fs.writeFileSync(destination,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({output:destination,counts:output.counts}));
}
if(require.main===module)main();
module.exports={inventory,v51Digest,aggregate,scoreModes,describe,changedTrack,evaluateUntoned,evaluateToned,nativeRows,context};
