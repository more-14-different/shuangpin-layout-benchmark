'use strict';
// Enumerate every native 21x26 auxiliary policy using v5.1 routes and v5.2 motor costs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model');
const {IDS}=require('./um40_r11'),base=require('./search_untoned_t2126_m4_v52');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),DEST=path.join(ROOT,'research/notes/2026-11-21-um40-v52-policies.json');
const KINDS=['character','word2','word3','word4'];
const COSTS={firstAuxMs:300,secondAuxMs:300,thirdAuxMs:300,selectionDecisionMs:600,scanPerCandidateMs:50,pageActionMs:300};
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function summarize(rows,ctx){
  const old=ctx.summarize(rows);let motor=0;
  for(const r of rows)motor+=r.weight*ctx.next(r.code).upperMs;
  const next=v52.changedTrack(old,motor/old.totalWeight);
  assert.ok(Math.abs(next.effectiveMs-next.motorUpperMs-(old.effectiveMs-old.motorUpperMs))<1e-8);
  return next;
}
function main(){
  const html=path.join(ROOT,'a7_CKT_R11.html'),data=scorer.loadPayload(html);
  const snow='D:/C2D/Documents/rime-snow-pinyin',profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
  const inputs=[html,__filename,path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/ckt_v4_model.js'),
    profile,path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),path.join(ROOT,'tools/auxiliary_semantics.js'),
    path.join(snow,'snow_pinyin.base.dict.yaml'),path.join(snow,'rime-stroke/stroke.dict.yaml'),
    path.join(snow,'scripts/research/evaluate_ckt_v4_word_aux_order.js'),path.join(snow,'scripts/research/evaluate_ckt51_aux_order.js')];
  const hashes=Object.fromEntries(inputs.map(p=>[p,hash(p)]));
  const ctx=v52.context(data,snow,profile),ref=data.entries.find(e=>e.id==='S005');
  const references=v52.evaluateUntoned(ref,base.REF,null,ctx).v52;
  const output=fs.existsSync(DEST)?JSON.parse(fs.readFileSync(DEST,'utf8')):{version:'um40-native-v52-all-policies-v1',sourceHashes:hashes,
    baselineCostsMs:COSTS,referencePolicies:base.REF,references,lengthBalance:base.BALANCE,
    policiesPerMode:144,rankingTieTolerance:1e-9,schemes:{}};
  assert.deepEqual(output.sourceHashes,hashes,'stale enumeration cache');
  const save=()=>fs.writeFileSync(DEST,JSON.stringify(output,null,2)+'\n');
  for(const id of IDS){
    const e=data.entries.find(e=>e.id===id);assert.ok(e,id);
    const sem=auxiliarySemantics(e.tone);assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),e.tone);
    const target=output.schemes[id]??={id,name:e.name,semantics:sem,publishedPolicies:base.POLICY,cases:{}};
    for(const mode of ['keytao','sanpin']){
      if(target.cases[mode]?.results.length===144){console.log('cached '+id+'/'+mode);continue;}
      const t0=Date.now(),pairs=Object.fromEntries([2,3,4].map(n=>[n,ctx.orderedDistinctPairs(n)]));
      const rows=Object.fromEntries(['word2','word3','word4'].map((kind,i)=>[kind,new Map(pairs[i+2].map(order=>
        [order,ctx.buildRowsForOrder(e,data,ctx.words,mode,e.tone,kind,order,model)]))]));
      const chars=scorer.buildRows(e,data,ctx.strokes,{word2:[],word3:[],word4:[]},mode);
      const character=summarize(model.resolveCompetition(chars,{motorCost:ctx.legacy}),ctx);
      const saved=target.cases[mode]??={results:[]};
      const done=new Set(saved.results.map(r=>r.policyKey));
      for(const word2 of pairs[2])for(const word3 of pairs[3])for(const word4 of pairs[4]){
        const key=[word2,word3,word4].join('/');if(done.has(key))continue;
        const outcomes=model.resolveCompetition([...rows.word2.get(word2),...rows.word4.get(word4),...rows.word3.get(word3)],
          {motorCost:ctx.legacy,lengthBalance:base.BALANCE});
        const tracks={character,...Object.fromEntries(['word2','word3','word4'].map(kind=>[kind,summarize(outcomes.filter(r=>r.kind===kind),ctx)]))};
        saved.results.push({policy:{word2,word3,word4},policyKey:key,tracks,score:v52.scoreModes({[mode]:tracks},references)});
        if(saved.results.length%12===0){save();console.log(JSON.stringify({id,mode,policies:saved.results.length,seconds:(Date.now()-t0)/1000}));}
      }
      const published=saved.results.find(r=>r.policyKey===Object.values(base.POLICY[mode]).join('/'));
      for(const kind of KINDS){
        const expected=data.cktV52.schemes[id].v52.modes[mode][kind];
        for(const field of ['motorUpperMs','effectiveMs','firstAuxRate','selectionRate','meanRejectedCandidates','meanPageActions'])
          assert.ok(Math.abs(published.tracks[kind][field]-expected[field])<1e-8,id+'/'+mode+'/'+kind+'/'+field);
      }
      saved.publishedPolicyReplayVerified=true;save();if(global.gc)global.gc();
    }
  }
  console.log(DEST);
}
if(require.main===module)main();
module.exports={COSTS,summarize};
