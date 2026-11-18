'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {positionAwareMotor}=require('./ckt_long_continuation');
const {upstreamMotor}=require('./ckt_v4_model');
const toned=require('./score_toned_2121_ckt_v51');
const scorer=require('./score_completion_ckt_v4');
const bridge=require('./score_snow_jiandao_toned_benchmark');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const variants=[['legacy',0,false],['guardOnly',0,true],['quarter',.25,false],['quarterGuard',.25,true],
  ['half',.5,false],['halfGuard',.5,true],['full',1,false],['fullGuard',1,true]];
const kinds=['character','word2','word3','word4'],weights={character:1,word2:3,word3:1,word4:1};
function stats(values) {
  const v=[...values].sort((a,b)=>a-b),at=q=>v[Math.min(v.length-1,Math.floor(q*v.length))];
  return {n:v.length,min:v[0],p01:at(.01),median:at(.5),p99:at(.99),max:v.at(-1),
    mean:v.reduce((a,b)=>a+b,0)/v.length};
}
function motors(snapshot,profile,cacheLimit) {
  return Object.fromEntries(variants.map(([name,scale,monotone])=>[name,name==='legacy'?upstreamMotor(snapshot):
    positionAwareMotor(snapshot,profile,{positionScale:scale,monotone,cacheLimit})]));
}
function samples(snapshot,profile,count,seed) {
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
  const pick=alphabet=>alphabet[Math.floor(random()*alphabet.length)];
  const models=motors(snapshot,profile,0),groups=[];
  for(const domain of ['uniform30','sound21-shape5'])for(const length of [5,6]) {
    const records=Object.fromEntries(variants.map(([name])=>[name,{reversals:0,guardHits:0,increments:[],corrections:[],guardCosts:[]}]));
    for(let i=0;i<count;i++) {
      const code=domain==='uniform30'?Array.from({length},()=>pick(snapshot.keys)).join(''):
        Array.from({length:4},()=>pick('QWERTYPSDFGHJKLZXCBNM')).join('')+
        Array.from({length:length-4},()=>pick('AVUIO')).join('');
      const baseline=models.legacy(code).upperMs;
      for(const [name] of variants) {
        const value=models[name](code),prefix=models[name](code.slice(0,-1));
        const increment=value.upperMs-prefix.upperMs,r=records[name];
        r.reversals+=increment<0;r.guardHits+=(value.monotoneCorrectionMs||0)>0;
        r.increments.push(increment);r.corrections.push(value.upperMs-baseline);r.guardCosts.push(value.monotoneCorrectionMs||0);
      }
    }
    groups.push({domain,length,count,variants:Object.fromEntries(Object.entries(records).map(([name,r])=>[name,{
      reversals:r.reversals,reversalRate:r.reversals/count,guardHits:r.guardHits,guardRate:r.guardHits/count,
      incrementMs:stats(r.increments),correctionMs:stats(r.corrections),guardMs:stats(r.guardCosts)}]))});
    console.log(JSON.stringify({domain,length,count,reversals:Object.fromEntries(Object.entries(records).map(([k,r])=>[k,r.reversals]))}));
  }
  return groups;
}
function frozenCheck(snapshot,models) {
  const keys=snapshot.keys,counts={2:0,3:0,4:0};
  // Exhaustive 30-key comparison, including complete result metadata.
  for(let a=0;a<keys.length;a++)for(let b=0;b<keys.length;b++) {
    for(let length=2;length<=4;length++)for(let tail=0;tail<keys.length**(length-2);tail++) {
      let code=keys[a]+keys[b],v=tail;
      for(let i=2;i<length;i++){code+=keys[v%keys.length];v=Math.floor(v/keys.length)}
      const expected=models.legacy(code);
      for(const [name] of variants)if(name!=='legacy')assert.deepEqual(models[name](code),expected);
      counts[length]++;
    }
  }
  return counts;
}
function summarizeVariants(outcomes,models,reference) {
  const total=Object.fromEntries(kinds.map(k=>[k,outcomes.filter(r=>r.kind===k).reduce((s,r)=>s+r.weight,0)]));
  const frequentIds=new Set(outcomes.filter(r=>r.code.length>4)
    .sort((a,b)=>weights[b.kind]*b.weight/total[b.kind]-weights[a.kind]*a.weight/total[a.kind])
    .slice(0,6).map(r=>r.id));
  const base=Object.fromEntries(kinds.map(k=>[k,reference.summarize(outcomes.filter(r=>r.kind===k))]));
  const sums=Object.fromEntries(variants.map(([name])=>[name,{motor:Object.fromEntries(kinds.map(k=>[k,0])),
    guardMass:0,guardMs:0,reversalMass:0,weightedDeltaMs:0,lengths:{},effects:[],frequent:[]} ]));
  for(const row of outcomes) {
    const mass=weights[row.kind]/6*row.weight/total[row.kind],long=row.code.length>4;
    const sampled=long&&crypto.createHash('sha256').update(row.id).digest().readUInt32LE()%200===0;
    for(const [name] of variants) {
      const m=models[name](row.code),s=sums[name];
      s.motor[row.kind]+=row.weight/total[row.kind]*m.upperMs;
      s.lengths[row.code.length]=(s.lengths[row.code.length]||0)+mass;
      s.weightedDeltaMs+=mass*(m.upperMs-row.motorUpperMs);
      if(long) {
        s.guardMass+=mass*((m.monotoneCorrectionMs||0)>0);s.guardMs+=mass*(m.monotoneCorrectionMs||0);
        s.reversalMass+=mass*(m.upperMs<models[name](row.code.slice(0,-1)).upperMs);
        // Fixed hash sample, independent of correction magnitude; full population is scored.
        if(sampled)s.effects.push({text:row.text,kind:row.kind,code:row.code,mass,
          oldMs:row.motorUpperMs,newMs:m.upperMs,deltaMs:m.upperMs-row.motorUpperMs,
          positionMs:m.positionErrorCorrectionMs||0,guardMs:m.monotoneCorrectionMs||0});
        if(frequentIds.has(row.id))s.frequent.push({text:row.text,kind:row.kind,code:row.code,mass,
          oldMs:row.motorUpperMs,newMs:m.upperMs,deltaMs:m.upperMs-row.motorUpperMs,
          positionMs:m.positionErrorCorrectionMs||0,guardMs:m.monotoneCorrectionMs||0});
      }
    }
  }
  return Object.fromEntries(variants.map(([name])=>{
    const s=sums[name];
    const tracks=Object.fromEntries(kinds.map(k=>[k,{...base[k],motorUpperMs:s.motor[k],
      effectiveMs:base[k].effectiveMs-base[k].motorUpperMs+s.motor[k]}]));
    return [name,{tracks,weightedDeltaMs:s.weightedDeltaMs,guardFrequencyShare:s.guardMass,
      weightedGuardMs:s.guardMs,reversalFrequencyShare:s.reversalMass,lengthShares:s.lengths,
      sampledLongRows:s.effects.length, sampledCorrectionMs:s.effects.length?stats(s.effects.map(r=>r.deltaMs)):null,
      largestChangesInFixedSample:s.effects.sort((a,b)=>b.deltaMs-a.deltaMs).slice(0,6),
      mostFrequentLongRows:s.frequent.sort((a,b)=>b.mass-a.mass)}];
  }));
}
function captureReference(build,external) {
  const outcomes=[],original=external.summarize;
  external.summarize=rows=>{for(const row of rows)outcomes.push(row);return original(rows)};
  try {
    const reference=build();
    // buildReference captures its imported callback; restore that instance as well.
    reference.summarize=original;
    return {reference,outcomes};
  } finally {external.summarize=original}
}
function nativeAudit(snapshot,profile,snow) {
  const payload=path.join(root,'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json');
  const data=read(payload),words=scorer.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99);
  const strokes=scorer.strokeOptions(path.join(snow,'rime-stroke/stroke.dict.yaml'));
  const models=motors(snapshot,profile,50000);
  const external=require(path.join(snow,'scripts/research/evaluate_ckt51_aux_order'));
  const {reference,outcomes:referenceOutcomes}=captureReference(
    ()=>toned.buildReference({data,words,strokes,motor:models.legacy,snow}),external);
  const references=summarizeVariants(referenceOutcomes,models,reference);
  const productionFixture=read(path.join(root,'research/.cache/ckt-v51-toned-mars10-D1-final.json'));
  for(let i=0;i<kinds.length;i++)assert.ok(Math.abs(reference.tracks[kinds[i]].effectiveMs-productionFixture.referenceEffectiveMs[i])<1e-10);
  const production=bridge.fixtureAdapter(productionFixture,data);
  const bundle=read(path.join(root,'research/notes/2026-11-18-cr-lan-f19-combined-finalists.json'));
  const layouts=[['production',production.layout,production.inventory,{word2:'12',word3:'213',word4:'24'}],
    ...['f19a0ad1dc','7af91c1a1c'].map(id=>{const l=bundle.layouts.find(r=>r.id.includes(id));return [id,l,bundle,l.wordAuxiliaryPolicy]})];
  const results=[];
  for(const [name,layout,inventory,policy] of layouts) {
    const evaluated=toned.evaluateLayoutPolicy({layout,layouts:inventory,data,words,motor:models.legacy,reference,
      shapeKeysByMeaning:'AVUIO',policy});
    assert.ok(Math.abs(evaluated.score-(name==='production'?productionFixture.expected.score:layout.rustScore))<1e-10);
    const values=summarizeVariants(evaluated.outcomes,models,reference);
    for(const [key] of variants)values[key].score=toned.normalizedScore(values[key].tracks,references[key].tracks);
    assert.ok(Math.abs(values.legacy.score-evaluated.score)<1e-10);
    if(name==='f19a0ad1dc') {
      const correctedReference=toned.buildReference({data,words,strokes,motor:models.halfGuard,snow});
      const independent=toned.evaluateLayoutPolicy({layout,layouts:inventory,data,words,motor:models.halfGuard,
        reference:correctedReference,shapeKeysByMeaning:'AVUIO',policy});
      assert.ok(Math.abs(independent.score-values.halfGuard.score)<1e-10);
      for(const k of kinds)assert.ok(Math.abs(independent.tracks[k].effectiveMs-values.halfGuard.tracks[k].effectiveMs)<1e-7);
    }
    results.push({name,policy,variants:values});
    console.log(JSON.stringify({layout:name,scores:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.score]))}));
  }
  return {inputHashes:{payload:sha(payload),dictionary:sha(path.join(snow,'snow_pinyin.base.dict.yaml')),
    stroke:sha(path.join(snow,'rime-stroke/stroke.dict.yaml'))},reference:references,layouts:results,
    verification:'f19 halfGuard aggregate independently matched a full rebuilt reference and full native competition within 1e-10 score / 1e-7 ms'};
}
function main() {
  const args={};for(let i=2;i<process.argv.length;i++)if(process.argv[i].startsWith('--'))args[process.argv[i].slice(2)]=process.argv[++i];
  const profilePath=path.resolve(args.profile||path.join(root,'research/.cache/ckt-long-code-audit-20261118/error-profile.json'));
  const snapshotPath=path.join(root,'tools/ckt_v4_upstream_role_tables.json'),snapshot=read(snapshotPath),profile=read(profilePath);
  const count=Number(args.samples||100000),seed=20261119;
  if(!Number.isSafeInteger(count)||count<=0)throw Error('samples must be positive integer');
  const models=motors(snapshot,profile,0);
  const result={version:'ckt-long-continuation-sample-audit-v1',experimental:true,
    caveat:'Position correction and the nondecreasing guard are separate engineering hypotheses; no five/six-key human validation. Rebuilt XGB context errors are not a hash-verified original upstream error artifact.',
    seed,samplesPerDomainAndLength:count,profile:{...profile,errorTables:undefined},
    sourceHashes:Object.fromEntries([__filename,path.join(root,'tools/ckt_long_continuation.js'),snapshotPath,profilePath].map(p=>[path.relative(root,p).replaceAll('\\','/'),sha(p)])),
    frozenShortCodeCounts:frozenCheck(snapshot,models),samples:samples(snapshot,profile,count,seed)};
  result.native=nativeAudit(snapshot,profile,path.resolve(args.snow||'D:/C2D/Documents/rime-snow-pinyin'));
  result.examples=['YYWX','YYWXO','XFYWA','XFYWAO','FJFJI','FJFJIO'].map(code=>({code,
    variants:Object.fromEntries(variants.map(([name])=>[name,models[name](code)]))}));
  const output=path.resolve(args.output||path.join(root,'research/notes/2026-11-18-ckt-long-continuation-audit.json'));
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({output,frozenShortCodes:result.frozenShortCodeCounts}));
}
if(require.main===module)main();
module.exports={stats,captureReference};
