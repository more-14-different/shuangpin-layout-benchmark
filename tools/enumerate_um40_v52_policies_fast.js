'use strict';
// Exact factorization: stages through four keys are independent of auxiliary order.
// Resolve that prefix once, then replay only residual five/six-key competitions.
// Full JS replay checks representative policies and every previously cached result.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model');
const {IDS}=require('./um40_r11'),base=require('./search_untoned_t2126_m4_v52');
const {COSTS,summarize}=require('./enumerate_um40_v52_policies');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),DEST=path.resolve(process.env.UM40_POLICY_OUTPUT||path.join(ROOT,'research/notes/2026-11-21-um40-v52-policies.json'));
const KINDS=['character','word2','word3','word4'];
const FIELDS=['motorUpperMs','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions','meanKeys'];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function prefixFactor(rows,ctx){
  for(const row of rows)assert.ok(row.stages.filter(s=>s.length>4).every(s=>s.codes.length===1));
  const prefix=rows.map(r=>({...r,stages:r.stages.filter(s=>s.length<=4)}));
  const resolved=model.resolveCompetition(prefix,{motorCost:ctx.legacy,lengthBalance:base.BALANCE});
  const won=resolved.filter(r=>r.rank===1),residual=new Set(resolved.filter(r=>r.rank>1).map(r=>r.id));
  const constant=Object.fromEntries(['word2','word3','word4'].map(kind=>[kind,summarize(won.filter(r=>r.kind===kind),ctx)]));
  const tail=r=>({...r,stages:r.stages.filter(s=>s.length>4)});
  return {constant,residual,tail,won:won.length};
}
function mergeTrack(a,b){
  const w=a.totalWeight+b.totalWeight,out={count:a.count+b.count,totalWeight:w};
  for(const f of FIELDS)out[f]=(a[f]*a.totalWeight+b[f]*b.totalWeight)/w;
  out.effectiveMs=out.motorUpperMs+300*out.firstAuxRate+300*out.secondAuxRate+300*out.thirdAuxRate+
    600*out.selectionRate+50*out.meanRejectedCandidates+300*out.meanPageActions;
  return out;
}
function compare(actual,expected,label){
  for(const kind of KINDS){
    assert.equal(actual[kind].count,expected[kind].count,label+'/'+kind+'/count');
    for(const field of [...FIELDS,'effectiveMs','totalWeight'])assert.ok(Math.abs(actual[kind][field]-expected[kind][field])<1e-8,label+'/'+kind+'/'+field);
  }
}
function main(){
  const html=path.join(ROOT,'a7_CKT_R11.html'),data=scorer.loadPayload(html),snow='D:/C2D/Documents/rime-snow-pinyin';
  const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
  const original=path.join(ROOT,'tools/enumerate_um40_v52_policies.js');
  const inputs=[html,original,path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/ckt_v4_model.js'),profile,
    path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),path.join(ROOT,'tools/auxiliary_semantics.js'),
    path.join(snow,'snow_pinyin.base.dict.yaml'),path.join(snow,'rime-stroke/stroke.dict.yaml'),
    path.join(snow,'scripts/research/evaluate_ckt_v4_word_aux_order.js'),path.join(snow,'scripts/research/evaluate_ckt51_aux_order.js')];
  const hashes=Object.fromEntries(inputs.map(p=>[p,hash(p)])),ctx=v52.context(data,snow,profile);
  const references=v52.evaluateUntoned(data.entries.find(e=>e.id==='S005'),base.REF,null,ctx).v52;
  const output=fs.existsSync(DEST)?JSON.parse(fs.readFileSync(DEST,'utf8')):{version:'um40-native-v52-all-policies-v1',sourceHashes:hashes,
    baselineCostsMs:COSTS,referencePolicies:base.REF,references,lengthBalance:base.BALANCE,policiesPerMode:144,rankingTieTolerance:1e-9,schemes:{}};
  assert.deepEqual(output.sourceHashes,hashes,'stale enumeration cache');
  if(output.acceleratorSha256)assert.equal(output.acceleratorSha256,hash(__filename));
  output.acceleratorSha256=hash(__filename);
  const save=()=>fs.writeFileSync(DEST,JSON.stringify(output,null,2)+'\n');
  for(const id of IDS.filter(id=>!process.env.UM40_ID||id===process.env.UM40_ID)){
    const e=data.entries.find(e=>e.id===id);assert.ok(e,id);
    const sem=auxiliarySemantics(e.tone);assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),e.tone);
    const target=output.schemes[id]??={id,name:e.name,semantics:sem,publishedPolicies:base.POLICY,cases:{}};
    for(const mode of ['keytao','sanpin']){
      if(target.cases[mode]?.factorizationVerified){console.log('cached '+id+'/'+mode);continue;}
      const old=new Map((target.cases[mode]?.results||[]).map(r=>[r.policyKey,r]));
      const t0=Date.now(),pairs=Object.fromEntries([2,3,4].map(n=>[n,ctx.orderedDistinctPairs(n)]));
      const rows=Object.fromEntries(['word2','word3','word4'].map((kind,i)=>[kind,new Map(pairs[i+2].map(order=>
        [order,ctx.buildRowsForOrder(e,data,ctx.words,mode,e.tone,kind,order,model)]))]));
      for(const kind of ['word2','word3','word4']){
        const values=[...rows[kind].values()],prefix=values[0].map(r=>JSON.stringify(r.stages.filter(s=>s.length<=4)));
        for(const variant of values.slice(1))variant.forEach((r,i)=>assert.equal(JSON.stringify(r.stages.filter(s=>s.length<=4)),prefix[i],kind+' prefix invariance'));
      }
      const chars=scorer.buildRows(e,data,ctx.strokes,{word2:[],word3:[],word4:[]},mode);
      const character=summarize(model.resolveCompetition(chars,{motorCost:ctx.legacy}),ctx);
      const combined=[...rows.word2.values().next().value,...rows.word4.values().next().value,...rows.word3.values().next().value];
      const factor=prefixFactor(combined,ctx);
      const tails=Object.fromEntries(Object.entries(rows).map(([kind,variants])=>[kind,new Map([...variants].map(([key,rr])=>[key,rr.filter(r=>factor.residual.has(r.id)).map(factor.tail)]))]));
      const saved=target.cases[mode]={results:[]};let fullChecks=0,cachedChecks=0;
      const publishedKey=Object.values(base.POLICY[mode]).join('/');
      for(const word2 of pairs[2])for(const word3 of pairs[3])for(const word4 of pairs[4]){
        const key=[word2,word3,word4].join('/');
        const outcomes=model.resolveCompetition([...tails.word2.get(word2),...tails.word4.get(word4),...tails.word3.get(word3)],{motorCost:ctx.legacy,lengthBalance:base.BALANCE});
        const tracks={character,...Object.fromEntries(['word2','word3','word4'].map(kind=>[kind,mergeTrack(factor.constant[kind],summarize(outcomes.filter(r=>r.kind===kind),ctx))]))};
        if(old.has(key)){compare(tracks,old.get(key).tracks,id+'/'+mode+'/'+key+'/cache');cachedChecks++;}
        if(saved.results.length===0||saved.results.length===71||saved.results.length===143||key===publishedKey){
          const full=model.resolveCompetition([...rows.word2.get(word2),...rows.word4.get(word4),...rows.word3.get(word3)],{motorCost:ctx.legacy,lengthBalance:base.BALANCE});
          const expected={character,...Object.fromEntries(['word2','word3','word4'].map(kind=>[kind,summarize(full.filter(r=>r.kind===kind),ctx)]))};
          compare(tracks,expected,id+'/'+mode+'/'+key+'/full');fullChecks++;
        }
        saved.results.push({policy:{word2,word3,word4},policyKey:key,tracks,score:v52.scoreModes({[mode]:tracks},references)});
        if(saved.results.length%24===0){save();console.log(JSON.stringify({id,mode,policies:saved.results.length,seconds:(Date.now()-t0)/1000}));}
      }
      compare(saved.results.find(r=>r.policyKey===publishedKey).tracks,data.cktV52.schemes[id].v52.modes[mode],id+'/'+mode+'/published');
      saved.publishedPolicyReplayVerified=true;
      saved.factorizationVerified={prefixWinners:factor.won,residualRows:factor.residual.size,fullChecks,cachedChecks};save();if(global.gc)global.gc();
    }
  }
  console.log(DEST);
}
if(require.main===module)main();
module.exports={prefixFactor,mergeTrack,compare};
