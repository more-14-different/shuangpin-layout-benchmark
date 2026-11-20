'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const base=require('./search_untoned_t2126_m4_v52'),md=require('./search_untoned_m40d3_v52'),follow=require('./refine_untoned_t2126_m4_v52');
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),WORK=path.join(ROOT,'research/.cache/um40-fixed-initial-rhymes-20261120');
const PREFIX=path.join(ROOT,'research/notes/2026-11-20-um40-fixed-initial-rhymes');
const CONFIG=path.join(ROOT,'research/config/um40-fixed-initial-rhymes-finalist.json');
const ANCHOR=path.join(ROOT,'research/config/untoned-m40d3-v52-finalist.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const fileHash=p=>hash(fs.readFileSync(p));
const encode=map=>Uint8Array.from(FINALS.map(f=>map[f].charCodeAt(0)-65));
const key=s=>String.fromCharCode(...s.map(k=>k+65));
const decode=s=>Object.fromEntries(FINALS.map((f,i)=>[f,String.fromCharCode(s[i]+65)]));
function operations(){
 const out=[];
 for(let a=0;a<35;a++)for(let b=a+1;b<35;b++)out.push({kind:'token-swap',a,b});
 for(let a=0;a<35;a++)for(let b=0;b<26;b++)out.push({kind:'token-move',a,b});
 for(let a=0;a<26;a++)for(let b=a+1;b<26;b++)out.push({kind:'key-swap',a,b});
 for(let a=0;a<26;a++)for(let b=0;b<26;b++)if(a!==b)out.push({kind:'group-move',a,b});
 return out;
}
function apply(state,op){
 const out=state.slice();
 if(op.kind==='token-swap')[out[op.a],out[op.b]]=[out[op.b],out[op.a]];
 else if(op.kind==='token-move')out[op.a]=op.b;
 else for(let i=0;i<35;i++){if(out[i]===op.a)out[i]=op.b;else if(op.kind==='key-swap'&&out[i]===op.b)out[i]=op.a;}
 return out;
}
function label(op){const k=i=>String.fromCharCode(65+i);return op.kind==='token-swap'?`${FINALS[op.a]}↔${FINALS[op.b]}`:op.kind==='token-move'?`${FINALS[op.a]}→${k(op.b)}`:op.kind==='key-swap'?`key groups ${k(op.a)}↔${k(op.b)}`:`key group ${k(op.a)}→${k(op.b)}`;}
function makeGuard(anchor,data){
 const conflictsLo=new Uint32Array(35),conflictsHi=new Uint32Array(35),byInitial=new Map();
 for(const [p]of data.base){const [h,f]=splitPinyin(data.pinyin[p]),initial=anchor.initialMap[HEADS[h]];if(!byInitial.has(initial))byInitial.set(initial,new Set());byInitial.get(initial).add(f);}
 for(const set of byInitial.values())for(const a of set)for(const b of set)if(a!==b){if(b<32)conflictsLo[a]|=1<<b;else conflictsHi[a]|=1<<(b-32);}
 const lo=new Uint32Array(26),hi=new Uint32Array(26),vowels=[...'aeiou'].map(f=>[FINALS.indexOf(f),f.toUpperCase().charCodeAt(0)-65]);
 const firstLinks=md.memory(anchor).firstLinks;
 return state=>{
  if(state.length!==35)return false;
  let identities=0;for(const [i,k]of vowels)identities+=Number(state[i]===k);
  if(firstLinks+35-identities>40)return false;
  lo.fill(0);hi.fill(0);
  for(let i=0;i<35;i++){const k=state[i];if(k>=26||(lo[k]&conflictsLo[i])!==0||(hi[k]&conflictsHi[i])!==0)return false;if(i<32)lo[k]|=1<<i;else hi[k]|=1<<(i-32);}
  return true;
 };
}
function motorTable(anchor,data){
 const motor=require('./ckt_v4_model').upstreamMotor(read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),table=Array.from({length:35},()=>new Float64Array(26));let total=0;
 for(const [p,w]of data.base){const [h,f]=splitPinyin(data.pinyin[p]);total+=w;for(let k=0;k<26;k++)table[f][k]+=w*motor(anchor.initialMap[HEADS[h]]+String.fromCharCode(65+k)).upperMs;}
 return state=>state.reduce((sum,k,i)=>sum+table[i][k],0)/total;
}
async function run(){
 fs.mkdirSync(WORK,{recursive:true});const anchor=read(ANCHOR),contract=read(path.join(base.WORK,'contract.json')),data=contract.inputs;
 for(const [p,digest]of Object.entries(contract.sourceHashes))if(fileHash(path.resolve(ROOT,p))!==digest)throw Error('Changed frozen scoring source '+p);
 const fixedInitials=HEADS.map(h=>anchor.initialMap[h]).join(''),guard=makeGuard(anchor,data),ops=operations(),motor=motorTable(anchor,data),start=encode(anchor.finalMap);
 const objective=r=>Math.max(r.score/anchor.cktV52.defaultScore,r.doubledScore/anchor.cktV52.doubledCognitiveScore);
 const full=e=>({initialMap:anchor.initialMap,finalMap:decode(e),capacity:[21,26],tone:'IEUAO'});
 const previous=zlib.gunzipSync(fs.readFileSync(md.PREFIX+'-scores.jsonl.gz')).toString().trim().split('\n').map(JSON.parse).filter(r=>r.state.slice(0,27)===fixedInitials);
 const checkpointFile=path.join(WORK,'checkpoint.json');
 const report=fs.existsSync(checkpointFile)?read(checkpointFile):{version:1,anchorId:anchor.id,anchorSha256:fileHash(ANCHOR),stages:[],records:[],completed:false};
 if(report.anchorSha256!==fileHash(ANCHOR))throw Error('Changed anchor');
 report.completed=false;
 const known=new Map(previous.map(r=>[r.state.slice(27),{...r,finalState:r.state.slice(27),imported:true}]));for(const r of report.records)known.set(r.finalState,r);
 const rank=()=>[...known.values()].sort((a,b)=>objective(a)-objective(b)||a.id.localeCompare(b.id));
 const save=()=>{report.records=[...known.values()].sort((a,b)=>a.finalState.localeCompare(b.finalState));report.best=rank().slice(0,15);fs.writeFileSync(checkpointFile,JSON.stringify(report));};
 const workers=Array.from({length:2},()=>base.launch());await Promise.all(workers.map(w=>w.ready));
 const proxy=base.launch(path.join(follow.WORK,'proxy-templates.json'));await proxy.ready;const proxyCache=new Map();
 const sample=async state=>{const stateKey=key(state);if(!proxyCache.has(stateKey))proxyCache.set(stateKey,await proxy.score({...full(state),id:'proxy'}));return proxyCache.get(stateKey);};
 async function scoreBatch(jobs,stage){
  let cursor=0,finished=0;const count=jobs.length;
  await Promise.all(workers.map(async worker=>{while(cursor<count){const e=jobs[cursor++],stateKey=key(e.state);if(known.has(stateKey))continue;
   if(!guard(e.state)||!md.guard(full(e.state),data))throw Error('Compact/full guard mismatch');
   const id='UMR40-'+hash(fixedInitials+stateKey).slice(0,12),v=await worker.score({...full(e.state),id});
   const row={id,state:fixedInitials+stateKey,finalState:stateKey,score:v.score,doubledScore:v.doubledScore,memory:md.memory(full(e.state)),parent:e.parent||anchor.id,mutation:e.mutation,stage,seconds:v.seconds};
   known.set(stateKey,row);fs.appendFileSync(path.join(WORK,'scores.jsonl'),JSON.stringify({...row,modes:v.modes})+'\n');finished++;save();
   if(finished%20===0||finished===count)console.log(JSON.stringify({stage,finished,total:count,best:rank()[0]}));
  }}));save();return finished;
 }
 async function screen(pool,center,limit,stage){
  const original=await sample(center.state),ranked=[];
  for(let i=0;i<pool.length;i++){const row=pool[i],s=await sample(row.state);ranked.push({...row,forecast:objective({score:center.score+s.score-original.score,doubledScore:center.doubledScore+s.doubledScore-original.doubledScore}),forecast1:s.score,forecast2:s.doubledScore});if(i%200===0)console.log(JSON.stringify({stage,screened:i,total:pool.length}));}
  const picked=new Map();for(const field of ['forecast','forecast1','forecast2'])for(const row of [...ranked].sort((a,b)=>a[field]-b[field]||key(a.state).localeCompare(key(b.state))).slice(0,limit))picked.set(key(row.state),row);
  return scoreBatch([...picked.values()],stage);
 }
 try{
  const control=await workers[0].score(anchor);if(Math.abs(control.score-anchor.cktV52.defaultScore)>1e-9||Math.abs(control.doubledScore-anchor.cktV52.doubledCognitiveScore)>1e-9)throw Error('Anchor reproduction failed');
  console.log(JSON.stringify({anchorVerified:anchor.id,score:control.score,doubledScore:control.doubledScore,imported:previous.length}));
  if(!report.stages.some(s=>s.kind==='single-operations')){
   const singles=new Map();for(const op of ops){const state=apply(start,op),k=key(state);if(!known.has(k)&&guard(state))singles.set(k,{state,mutation:label(op)});}
   const count=await scoreBatch([...singles.values()],'single-operations');report.stages.push({kind:'single-operations',newScores:count,primitiveOperations:ops.length});save();
  }
  if(!report.stages.some(s=>s.kind==='two-operation-endpoints')){
   const first=new Map(),baselineScores=ops.map(op=>known.get(key(apply(start,op))));
   for(const op of ops){const state=apply(start,op),k=key(state);if(k!==key(start)&&!first.has(k))first.set(k,{state,op,legal:guard(state)});}
   const pool=new Map();let visited=0,legalEndpoints=0,illegalIntermediate=0;
   for(const firstRow of first.values()){
    const a=known.get(key(firstRow.state));
    for(let i=0;i<ops.length;i++){
     visited++;const state=apply(firstRow.state,ops[i]);if(!guard(state))continue;legalEndpoints++;
     const k=key(state);if(known.has(k)||pool.has(k))continue;
     if(!firstRow.legal)illegalIntermediate++;
     const b=baselineScores[i],forecast=a&&b?objective({score:a.score+b.score-anchor.cktV52.defaultScore,doubledScore:a.doubledScore+b.doubledScore-anchor.cktV52.doubledCognitiveScore}):Infinity;
     pool.set(k,{state,motor:motor(state),forecast,mutation:label(firstRow.op)+'; '+label(ops[i]),illegalIntermediate:!firstRow.legal});
    }
   }
   const values=[...pool.values()],picked=new Map();
   for(const field of ['motor','forecast'])for(const row of [...values].sort((a,b)=>a[field]-b[field]||key(a.state).localeCompare(key(b.state))).slice(0,220))picked.set(key(row.state),row);
   const partitions=new Set();for(const row of [...values].sort((a,b)=>a.motor-b.motor)){
    const groups=new Map(),signature=[...row.state].map(k=>{if(!groups.has(k))groups.set(k,groups.size);return groups.get(k);}).join(',');
    if(!partitions.has(signature)){partitions.add(signature);picked.set(key(row.state),row);if(partitions.size>=100)break;}
   }
   let rng=20261120;const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
   const exploratory=[...values].sort((a,b)=>a.motor-b.motor).slice(0,5000);for(let n=0;n<80&&exploratory.length;n++){const row=exploratory[Math.floor(random()*exploratory.length)];picked.set(key(row.state),row);}
   const stats={kind:'two-operation-endpoints',primitiveOperations:ops.length,firstStates:first.size,orderedPairsVisited:visited,legalEndpointsBeforeDedup:legalEndpoints,uniqueNewEndpoints:pool.size,viaIllegalIntermediate:illegalIntermediate,proxyCandidates:picked.size};
   console.log(JSON.stringify(stats));
   const exact=await screen([...picked.values()],{state:start,score:anchor.cktV52.defaultScore,doubledScore:anchor.cktV52.doubledCognitiveScore},30,'two-operation-endpoints');
   report.stages.push({...stats,newScores:exact});save();
  }
  if(process.argv.includes('--boundary')&&!report.stages.some(s=>s.kind==='exact-boundary-endpoints')){
   const first=new Map();for(const op of ops){const state=apply(start,op);if(!guard(state))first.set(key(state),{state,op});}
   const endpoints=new Map();
   for(const a of first.values())for(const b of ops){const state=apply(a.state,b);if(guard(state)){const k=key(state);if(!endpoints.has(k))endpoints.set(k,{state,mutation:label(a.op)+'; '+label(b),illegalIntermediate:true});}}
   const jobs=[...endpoints.values()].filter(e=>!known.has(key(e.state)));
   console.log(JSON.stringify({stage:'exact-boundary-endpoints',invalidFirstStates:first.size,uniqueLegalEndpoints:endpoints.size,newScores:jobs.length}));
   const count=await scoreBatch(jobs,'exact-boundary-endpoints');
   report.stages.push({kind:'exact-boundary-endpoints',invalidFirstStates:first.size,uniqueLegalEndpoints:endpoints.size,newScores:count});save();
  }
  const done=new Set(report.stages.filter(s=>s.kind==='local-rhyme-refinement').map(s=>s.center));
  const rounds=Number(process.argv.find(a=>a.startsWith('--rounds='))?.split('=')[1]||6);
  for(let round=0;round<rounds;round++){
   const centerRow=rank().find(r=>!done.has(r.id));if(!centerRow)break;
   const state=encode(Object.fromEntries(FINALS.map((f,i)=>[f,centerRow.finalState[i]]))),proposals=new Map();
   const add=(s,mutation)=>{const k=key(s);if(guard(s)&&!known.has(k))proposals.set(k,{state:s,parent:centerRow.id,mutation});};
   for(const op of ops)add(apply(state,op),label(op));
   let rng=2026112000+round;const random=n=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng%n;};
   for(let n=0;n<6000;n++){const a=ops[random(ops.length)],b=ops[random(ops.length)];add(apply(apply(state,a),b),label(a)+'; '+label(b));}
   const count=await screen([...proposals.values()],{...centerRow,state},18,'local-rhyme-refinement');
   done.add(centerRow.id);report.stages.push({kind:'local-rhyme-refinement',center:centerRow.id,legalCandidates:proposals.size,newScores:count});save();
   console.log(JSON.stringify({roundComplete:round,best:rank()[0]}));
  }
  report.completed=true;report.anchor=anchor;report.selected={...full(Uint8Array.from([...rank()[0].finalState],k=>k.charCodeAt(0)-65)),...rank()[0]};
  report.bestDefault=[...known.values()].sort((a,b)=>a.score-b.score||a.doubledScore-b.doubledScore).slice(0,10);
  report.bestDoubled=[...known.values()].sort((a,b)=>a.doubledScore-b.doubledScore||a.score-b.score).slice(0,10);
  report.strictImprovements=[...known.values()].filter(r=>r.score<anchor.cktV52.defaultScore-1e-9&&r.doubledScore<anchor.cktV52.doubledCognitiveScore-1e-9).sort((a,b)=>objective(a)-objective(b));
  report.scoreCounts={total:known.size,imported:[...known.values()].filter(r=>r.imported).length,newFullDictionary:[...known.values()].filter(r=>!r.imported).length};
  report.resultStatus=report.strictImprovements.length?'strict-two-endpoint-improvement-found':'no-strict-two-endpoint-improvement-found';
  report.searchScope='Fixed initials and auxiliary policies. Single-operation final neighborhoods plus all enumerated two-operation endpoints; only a screened subset of the general two-operation set receives full-dictionary scores. Optional exact boundary phase scores every legal endpoint reached through an invalid first state. No global optimality claim.';
  report.sourceHashes={...contract.sourceHashes,[ANCHOR]:fileHash(ANCHOR),[md.PREFIX+'-scores.jsonl.gz']:fileHash(md.PREFIX+'-scores.jsonl.gz'),[require.resolve('./search_untoned_m40d3_v52')]:fileHash(require.resolve('./search_untoned_m40d3_v52')),[require.resolve('./refine_untoned_t2126_m4_v52')]:fileHash(require.resolve('./refine_untoned_t2126_m4_v52')),[__filename]:fileHash(__filename)};
  report.semantics=auxiliarySemantics('IEUAO');report.contract={fixedInitials:true,M:40,D:3,capacity:[21,26],common399Unique:true,policies:base.POLICY,lengthBalance:base.BALANCE,cognitiveMultipliers:[1,2],reference:'S005 repriced at each endpoint; each member normalized separately'};save();
  fs.writeFileSync(PREFIX+'.json',JSON.stringify({...report,records:undefined},null,2)+'\n');fs.writeFileSync(PREFIX+'-scores.jsonl.gz',zlib.gzipSync(report.records.map(r=>JSON.stringify(r)).join('\n')+'\n'));
 }finally{for(const worker of workers)worker.child.stdin.end();proxy.child.stdin.end();}
}
async function verify(){
 const report=read(PREFIX+'.json'),contract=read(path.join(base.WORK,'contract.json'));
 for(const [p,digest]of Object.entries(report.sourceHashes))if(fileHash(path.resolve(ROOT,p))!==digest)throw Error('Changed source '+p);
 const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52');const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html')),e=report.selected;
 if(HEADS.some(h=>e.initialMap[h]!==report.anchor.initialMap[h])||!md.guard(e,data))throw Error('Selected candidate violates fixed-initial contract');
 const template=contract.inputs.entries[0],entry={...template,...e,codeList:data.pinyin.map((py,i)=>{if(!template.codeList[i])return null;const[h,f]=splitPinyin(py);return h===255||f===255?template.codeList[i]:e.initialMap[HEADS[h]]+e.finalMap[FINALS[f]];})};
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
 const js=v52.evaluateUntoned(entry,base.POLICY,base.BALANCE,ctx).v52,worker=base.launch();await worker.ready;let native;
 try{native=await worker.score(entry);}finally{worker.child.stdin.end();}
 let maximumTrackDifference=0;for(const m of ['keytao','sanpin'])for(const k of ['character','word2','word3','word4'])for(const [field,value]of Object.entries(js[m][k]))if(typeof value==='number'){const difference=Math.abs(value-native.modes[m][k][field]);maximumTrackDifference=Math.max(maximumTrackDifference,difference);if(!Number.isFinite(difference)||difference>1e-7)throw Error('Track mismatch');}
 const score=base.normalize(js,contract.reference),doubledScore=base.normalize(js,contract.reference,2);if(Math.abs(score-e.score)>1e-9||Math.abs(doubledScore-e.doubledScore)>1e-9)throw Error('Score mismatch');
 const finalist={id:e.id,anchorId:report.anchor.id,status:e.id===report.anchor.id?'anchor-retained':'improved-candidate',parentId:e.id===report.anchor.id?null:report.anchor.id,capacity:[21,26],tone:'IEUAO',...report.semantics,initialMap:e.initialMap,finalMap:e.finalMap,memory:md.memory(e),audit:base.audit(e.initialMap,e.finalMap,data),changesFromParent:FINALS.filter(f=>e.finalMap[f]!==report.anchor.finalMap[f]).map(f=>({final:f,from:report.anchor.finalMap[f],to:e.finalMap[f]})),cktV52:{defaultScore:score,doubledCognitiveScore:doubledScore,policies:base.POLICY,lengthBalance:base.BALANCE},comparison:[{id:report.anchor.id,score:report.anchor.cktV52.defaultScore,doubledScore:report.anchor.cktV52.doubledCognitiveScore},...contract.controls].map(c=>({id:c.id,score:c.score,doubledScore:c.doubledScore,defaultGap:c.score-score,doubledGap:c.doubledScore-doubledScore}))};
 fs.writeFileSync(CONFIG,JSON.stringify(finalist,null,2)+'\n');fs.writeFileSync(PREFIX+'-verification.json',JSON.stringify({id:e.id,score,doubledScore,maximumTrackDifference,modes:js,commonPinyin:data.base.map(([p])=>data.pinyin[p]),semantics:report.semantics},null,2)+'\n');console.log(JSON.stringify({verified:e.id,score,doubledScore,maximumTrackDifference,memory:md.memory(e)}));
}
if(require.main===module)(process.argv.includes('--verify')?verify():run()).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={operations,apply,makeGuard,encode,decode,key,PREFIX,CONFIG,WORK,ANCHOR};
