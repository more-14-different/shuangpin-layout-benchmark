'use strict';
// Serial low-memory enumeration: compact corpus input and residual-only row caches.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model');
const base=require('./search_untoned_t2126_m4_v52'),{IDS}=require('./um40_r11');
const {summarize}=require('./enumerate_um40_v52_policies');
const {prefixFactor,mergeTrack,compare}=require('./enumerate_um40_v52_policies_fast');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('./auxiliary_semantics');
const {prepare:prepareTail}=require('./um40_policy_tail');
const ROOT=path.resolve(__dirname,'..'),DEST=path.join(ROOT,'research/notes/2026-11-21-um40-v52-policies.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function enumerateCase(e,mode,ctx,published,previous,onProgress){
  const t0=Date.now(),orders=Object.fromEntries([2,3,4].map(n=>[n,ctx.orderedDistinctPairs(n)]));
  const kinds=['word2','word3','word4'];
  const build=(kind,order)=>ctx.buildRowsForOrder(e,ctx.data,ctx.words,mode,e.tone,kind,order,model);
  let initial=kinds.flatMap((kind,i)=>build(kind,orders[i+2][0]));
  const factor=prefixFactor(initial,ctx);initial=null;if(global.gc)global.gc();
  const tails={};
  for(let i=0;i<3;i++){
    const kind=kinds[i];tails[kind]=new Map();
    let prefix;
    for(const order of orders[i+2]){
      let full=build(kind,order);
      if(!prefix)prefix=full.map(r=>JSON.stringify(r.stages.filter(s=>s.length<=4)));
      else full.forEach((r,j)=>assert.equal(JSON.stringify(r.stages.filter(s=>s.length<=4)),prefix[j]));
      tails[kind].set(order,full.filter(r=>factor.residual.has(r.id)).map(factor.tail));
      full=null;if(global.gc)global.gc();
    }
  }
  const resolveTail=prepareTail(tails,ctx);
  for(const kind of kinds)delete tails[kind];
  if(global.gc)global.gc();
  const character=summarize(model.resolveCompetition(scorer.buildRows(e,ctx.data,ctx.strokes,{word2:[],word3:[],word4:[]},mode),{motorCost:ctx.legacy}),ctx);
  const old=new Map((previous?.results||[]).map(r=>[r.policyKey,r]));
  const result={results:[]};let fullChecks=0,cachedChecks=0;
  const publishedKey=Object.values(base.POLICY[mode]).join('/');
  for(const word2 of orders[2])for(const word3 of orders[3])for(const word4 of orders[4]){
    const key=[word2,word3,word4].join('/');
    const tail=resolveTail({word2,word3,word4});
    const tracks={character,...Object.fromEntries(kinds.map(kind=>[kind,mergeTrack(factor.constant[kind],tail[kind])]))};
    if(old.has(key)){compare(tracks,old.get(key).tracks,e.id+'/'+mode+'/'+key+'/cache');cachedChecks++;}
    if(result.results.length===0||result.results.length===71||result.results.length===143||key===publishedKey){
      const rows=[...build('word2',word2),...build('word4',word4),...build('word3',word3)];
      const full=model.resolveCompetition(rows,{motorCost:ctx.legacy,lengthBalance:base.BALANCE});
      const expected={character,...Object.fromEntries(kinds.map(kind=>[kind,summarize(full.filter(r=>r.kind===kind),ctx)]))};
      compare(tracks,expected,e.id+'/'+mode+'/'+key+'/full');fullChecks++;
    }
    result.results.push({policy:{word2,word3,word4},policyKey:key,tracks,score:v52.scoreModes({[mode]:tracks},published.references)});
    if(result.results.length%24===0){
      onProgress(result);
      console.log(JSON.stringify({id:e.id,mode,policies:result.results.length,
        seconds:(Date.now()-t0)/1000,rssGB:process.memoryUsage().rss/2**30}));
    }
  }
  compare(result.results.find(r=>r.policyKey===publishedKey).tracks,published.scores[e.id].v52.modes[mode],e.id+'/'+mode+'/published');
  result.publishedPolicyReplayVerified=true;
  result.factorizationVerified={prefixWinners:factor.won,residualRows:factor.residual.size,fullChecks,cachedChecks};
  return result;
}
function main(){
  const data=JSON.parse(fs.readFileSync(path.join(ROOT,'research/.cache/um40-v52-compact-input.json'),'utf8'));
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
  const output=JSON.parse(fs.readFileSync(DEST,'utf8'));
  for(const [p,h]of Object.entries(output.sourceHashes))assert.equal(hash(p),h,'input changed '+p);
  const references=v52.evaluateUntoned(data.entries[0],base.REF,null,ctx).v52;
  for(const mode of ['keytao','sanpin'])compare({...references[mode]},output.references[mode],'compact reference/'+mode);
  const publication=JSON.parse(fs.readFileSync(path.join(ROOT,'research/notes/2026-11-20-um40-r11-publication.json'),'utf8'));
  const published={references,scores:publication.scores};
  output.compactReplaySha256=data.frozenReplaySha256;
  output.compactEnumeratorSha256=hash(__filename);
  for(const id of IDS){
    const e=data.entries.find(e=>e.id===id),sem=auxiliarySemantics(e.tone);
    assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),e.tone);
    const target=output.schemes[id]??={id,name:e.name,semantics:sem,publishedPolicies:base.POLICY,cases:{}};
    for(const mode of ['keytao','sanpin']){
      if(target.cases[mode]?.publishedPolicyReplayVerified){console.log('cached '+id+'/'+mode);continue;}
      target.cases[mode]=enumerateCase(e,mode,ctx,published,target.cases[mode],progress=>{
        target.cases[mode]=progress;fs.writeFileSync(DEST,JSON.stringify(output,null,2)+'\n');
      });
      fs.writeFileSync(DEST,JSON.stringify(output,null,2)+'\n');
      if(global.gc)global.gc();
    }
  }
  fs.writeFileSync(DEST,JSON.stringify(output,null,2)+'\n');
}
if(require.main===module)main();
