'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {blockErrorMotor}=require('./ckt_block_error');
const {upstreamMotor}=require('./ckt_v4_model');
const {captureReference,stats}=require('./audit_ckt_long_continuation');
const toned=require('./score_toned_2121_ckt_v51'),scorer=require('./score_completion_ckt_v4');
const {fixtureAdapter}=require('./score_snow_jiandao_toned_benchmark');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const kinds=['character','word2','word3','word4'],weights={character:1,word2:3,word3:1,word4:1};
const names=['legacy','block','sequential'];
function models(snapshot,profile){return {legacy:upstreamMotor(snapshot),block:blockErrorMotor(snapshot,profile),
  sequential:blockErrorMotor(snapshot,profile,{tailMode:'sequential'})}}
function sample(m,snapshot,count) {
  let seed=20261120;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const pick=s=>s[Math.floor(random()*s.length)],groups=[];
  for(const domain of ['uniform30','sound21-shape5'])for(const length of [5,6]) {
    const records=Object.fromEntries(names.map(n=>[n,{costReversals:0,riskReversals:n==='legacy'?null:0,
      riskBelowFour:n==='legacy'?null:0,deltas:[],increments:[],minimumIncrement:null}]));
    for(let i=0;i<count;i++) {
      const code=domain==='uniform30'?Array.from({length},()=>pick(snapshot.keys)).join(''):
        Array.from({length:4},()=>pick('QWERTYPSDFGHJKLZXCBNM')).join('')+Array.from({length:length-4},()=>pick('AVUIO')).join('');
      const base=m.legacy(code).upperMs;
      for(const name of names) {
        const v=m[name](code),prefix=m[name](code.slice(0,-1)),s=records[name],increment=v.upperMs-prefix.upperMs;
        s.costReversals+=increment<0;s.deltas.push(v.upperMs-base);s.increments.push(increment);
        if(!s.minimumIncrement||increment<s.minimumIncrement.ms)s.minimumIncrement={code,ms:increment,from:prefix.upperMs,to:v.upperMs};
        if(name!=='legacy') {
          const r=m[name].risk(code),before=m[name].risk(code.slice(0,-1)),four=m[name].risk(code.slice(0,4));
          s.riskReversals+=r.errorProbability<before.errorProbability;
          s.riskBelowFour+=r.errorProbability<four.errorProbability;
        }
      }
    }
    for(const s of Object.values(records)){s.deltaMs=stats(s.deltas);s.incrementMs=stats(s.increments);delete s.deltas;delete s.increments}
    groups.push({domain,length,count,models:records});console.log(JSON.stringify(groups.at(-1)));
  }
  return groups;
}
function shortAudit(m,keys) {
  const count={2:0,3:0,4:0};let tailRiskDrops=0,worst=null;
  for(let length=2;length<=4;length++)for(let n=0;n<keys.length**length;n++) {
    let v=n,code='';for(let i=0;i<length;i++){code+=keys[v%keys.length];v=Math.floor(v/keys.length)}
    const expected=m.legacy(code);assert.deepEqual(m.block(code),expected);assert.deepEqual(m.sequential(code),expected);count[length]++;
    if(length===3) {
      const pair=m.block.risk(code.slice(0,2)).errorProbability,triple=m.block.risk(code).errorProbability,delta=triple-pair;
      tailRiskDrops+=delta<0;if(!worst||delta<worst.delta)worst={code,pair,triple,delta};
    }
  }
  return {frozenCodeCounts:count,tailRiskDropsOutOf27000:tailRiskDrops,worstTailRiskDrop:worst};
}
function summary(outcomes,m,reference) {
  const base=Object.fromEntries(kinds.map(k=>[k,reference.summarize(outcomes.filter(r=>r.kind===k))]));
  const topIds=new Set(outcomes.filter(r=>r.code.length>4).sort((a,b)=>
    weights[b.kind]*b.weight/base[b.kind].totalWeight-weights[a.kind]*a.weight/base[a.kind].totalWeight).slice(0,6).map(r=>r.id));
  return Object.fromEntries(names.map(name=>{
    const sums=Object.fromEntries(kinds.map(k=>[k,0]));let riskReversals=0,riskBelowFour=0,costReversals=0,delta=0;
    const examples=[];
    for(const row of outcomes) {
      const value=m[name](row.code),mass=weights[row.kind]/6*row.weight/base[row.kind].totalWeight;
      sums[row.kind]+=row.weight/base[row.kind].totalWeight*value.upperMs;delta+=mass*(value.upperMs-row.motorUpperMs);
      if(row.code.length>4) {
        costReversals+=mass*(value.upperMs<m[name](row.code.slice(0,-1)).upperMs);
        if(name!=='legacy') {
          riskReversals+=mass*(value.errorProbability<m[name].risk(row.code.slice(0,-1)).errorProbability);
          riskBelowFour+=mass*(value.errorProbability<value.prefixErrorProbability);
        }
        if(topIds.has(row.id))examples.push({text:row.text,code:row.code,mass,oldMs:row.motorUpperMs,newMs:value.upperMs,
          deltaMs:value.upperMs-row.motorUpperMs,errorProbability:value.errorProbability,prefixErrorProbability:value.prefixErrorProbability});
      }
    }
    const tracks=Object.fromEntries(kinds.map(k=>[k,{...base[k],motorUpperMs:sums[k],
      effectiveMs:base[k].effectiveMs-base[k].motorUpperMs+sums[k]}]));
    return [name,{tracks,weightedCostDeltaMs:delta,costReversalFrequency:costReversals,
      riskReversalFrequency:name==='legacy'?null:riskReversals,riskBelowFourFrequency:name==='legacy'?null:riskBelowFour,
      mostFrequentLongRows:examples.sort((a,b)=>b.mass-a.mass)}];
  }));
}
function native(m,snow) {
  const payload=path.join(root,'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json'),data=read(payload);
  const words=scorer.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99);
  const strokes=scorer.strokeOptions(path.join(snow,'rime-stroke/stroke.dict.yaml'));
  const external=require(path.join(snow,'scripts/research/evaluate_ckt51_aux_order'));
  const {reference,outcomes}=captureReference(()=>toned.buildReference({data,words,strokes,motor:m.legacy,snow}),external);
  const references=summary(outcomes,m,reference);
  const fixture=read(path.join(root,'research/.cache/ckt-v51-toned-mars10-D1-final.json')),production=fixtureAdapter(fixture,data);
  const bundle=read(path.join(root,'research/notes/2026-11-18-cr-lan-f19-combined-finalists.json'));
  const layouts=[['production',production.layout,production.inventory,{word2:'12',word3:'213',word4:'24'}],
    ...['f19a0ad1dc','7af91c1a1c'].map(id=>{const row=bundle.layouts.find(r=>r.id.includes(id));return [id,row,bundle,row.wordAuxiliaryPolicy]})],results=[];
  for(const [id,layout,inventory,policy] of layouts) {
    const baseline=toned.evaluateLayoutPolicy({layout,layouts:inventory,data,words,motor:m.legacy,reference,shapeKeysByMeaning:'AVUIO',policy});
    assert.ok(Math.abs(baseline.score-(id==='production'?fixture.expected.score:layout.rustScore))<1e-10);
    const values=summary(baseline.outcomes,m,reference);
    for(const name of names)values[name].score=toned.normalizedScore(values[name].tracks,references[name].tracks);
    if(id==='f19a0ad1dc') {
      const ref=toned.buildReference({data,words,strokes,motor:m.block,snow});
      const check=toned.evaluateLayoutPolicy({layout,layouts:inventory,data,words,motor:m.block,reference:ref,shapeKeysByMeaning:'AVUIO',policy});
      assert.ok(Math.abs(check.score-values.block.score)<1e-10);
      for(const k of kinds)assert.ok(Math.abs(check.tracks[k].effectiveMs-values.block.tracks[k].effectiveMs)<1e-7);
    }
    results.push({id,policy,models:values});console.log(JSON.stringify({id,scores:Object.fromEntries(names.map(n=>[n,values[n].score]))}));
  }
  return {inputHashes:{payload:sha(payload),dictionary:sha(path.join(snow,'snow_pinyin.base.dict.yaml')),
    stroke:sha(path.join(snow,'rime-stroke/stroke.dict.yaml'))},references,layouts:results,fullF19BlockReplayVerified:true};
}
function main() {
  const args={};for(let i=2;i<process.argv.length;i++)if(process.argv[i].startsWith('--'))args[process.argv[i].slice(2)]=process.argv[++i];
  const profilePath=path.resolve(args.profile||path.join(root,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
  const snapshotPath=path.join(root,'tools/ckt_v4_upstream_role_tables.json'),snapshot=read(snapshotPath),profile=read(profilePath),m=models(snapshot,profile);
  const count=Number(args.samples||100000);if(!Number.isSafeInteger(count)||count<=0)throw Error('invalid samples');
  const result={version:'ckt-four-prefix-tail-success-audit-v1',experimental:true,seed:20261120,
    interpretation:'block: S5=S4(ABCD)*S2(DE), S6=S4(ABCD)*S3(DEF); sequential comparison: S6=S5*(1-h_L3i2(DEF)). Each risk is conditional on the anchor first key being correct. No total-cost guard or position-strength parameter.',
    costConvention:'Keep frozen <=4 costs. Long timing remains the inferred original rolling timing. Anchor the four-key summed-hazard cost; charge 782.2*(P_long-P_four) for added first-error risk.',
    caveat:'Rebuilt context error tables are not the hash-verified original error artifact. Standalone short-tail success approximates conditional tail success; no human five/six-key validation.',
    sourceHashes:Object.fromEntries([__filename,path.join(root,'tools/ckt_block_error.js'),path.join(root,'tools/export_ckt_long_error_profile.py'),snapshotPath,profilePath].map(p=>[path.relative(root,p).replaceAll('\\','/'),sha(p)])),
    shortAudit:shortAudit(m,snapshot.keys),globalCostBounds:{block:m.block.costBounds(),sequential:m.sequential.costBounds()},
    samples:sample(m,snapshot,count)};
  result.native=native(m,path.resolve(args.snow||'D:/C2D/Documents/rime-snow-pinyin'));
  result.examples=['YYWX','YYWXO','YYWXOA','XFYWA','XFYWAO'].map(code=>({code,
    models:Object.fromEntries(names.map(n=>[n,m[n](code)])),risk:{block:m.block.risk(code),sequential:m.sequential.risk(code)}}));
  const output=path.resolve(args.output||path.join(root,'research/notes/2026-11-18-ckt-block-error-audit.json'));
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(output);
}
if(require.main===module)main();
