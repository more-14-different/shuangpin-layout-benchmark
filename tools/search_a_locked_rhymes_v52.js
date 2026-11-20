'use strict';
// Six-hour resumable search, four equally budgeted lanes; native exact scores.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),assert=require('node:assert/strict');
const base=require('./search_untoned_t2126_m4_v52'),md=require('./search_untoned_m40d3_v52');
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),WORK=path.join(ROOT,'research/.cache/a-locked-rhymes-v52-6h-20261121');
const CONTRACT=path.join(base.WORK,'contract.json');
const GROUPS=[['ei','er'],['o','uo'],['uan','van'],['un','vn'],['iang','uang'],['iong','ong'],['ing','uai']];
const grouped=new Set(GROUPS.flat()),ATOMS=[...GROUPS,...FINALS.filter(f=>!grouped.has(f)).map(f=>[f])];
const MOVABLE=ATOMS.filter(g=>!['ei','o','a','i','u'].includes(g[0]));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const key=fm=>FINALS.map(f=>fm[f]).join('');
const decode=s=>Object.fromEntries(FINALS.map((f,i)=>[f,s[i]]));
function setup(){
 const c=read(CONTRACT),a=c.inputs.entries.find(e=>e.id==='RC26-39a5bfdc045342cd');
 const u=read(path.join(ROOT,'research/config/untoned-m40d3-v52-finalist.json'));
 return {c,a,initials:{A:a.initialMap,UM40:u.initialMap}};
}
function check(im,fm,data,doubleEmpty=false){
 if(fm.ei!=='E'||fm.er!=='E'||fm.o!=='O'||fm.uo!=='O')return false;
 if(GROUPS.some(g=>g.some(f=>fm[f]!==fm[g[0]])))return false;
 const mem=md.memory({initialMap:im,finalMap:fm});
 const V=[...'aeiou'].filter(f=>fm[f]!==f.toUpperCase()).length;
 if(mem.M!==40||mem.D!==3||V!==1)return false;
 const bins=new Set();
 for(const[p]of data.base){
  const[h,f]=splitPinyin(data.pinyin[p]),code=im[HEADS[h]]+fm[FINALS[f]];
  if(bins.has(code)||doubleEmpty&&['QZ','ZQ'].includes(code))return false;
  bins.add(code);
 }
 return bins.size===399;
}
function neighbors(fm){
 const out=new Map(),add=(map,mutation)=>{const k=key(map);if(k!==key(fm))out.set(k,{finalMap:map,mutation});};
 for(let i=0;i<MOVABLE.length;i++){
  const a=MOVABLE[i];
  for(const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){
   const map={...fm};for(const f of a)map[f]=k;add(map,a.join('/')+'→'+k);
  }
  for(let j=i+1;j<MOVABLE.length;j++){
   const b=MOVABLE[j],ka=fm[a[0]],kb=fm[b[0]],map={...fm};
   for(const f of a)map[f]=kb;for(const f of b)map[f]=ka;add(map,a.join('/')+'↔'+b.join('/'));
  }
 }
 return [...out.values()];
}
function scores(modes,refs){
 return Object.fromEntries([1,2,3,5].map(m=>[String(m),base.normalize(modes,refs,m)]));
}
async function verify(){
 fs.mkdirSync(WORK,{recursive:true});const {c,a,initials}=setup();
 const worker=base.launch();await worker.ready;
 try{
  const r=await worker.score(a),expected=c.controls.find(r=>r.id===a.id);
  assert.ok(Math.abs(r.score-expected.score)<1e-9);assert.ok(Math.abs(r.doubledScore-expected.doubledScore)<1e-9);
  const sc=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52');
  const compact=read(path.join(ROOT,'research/.cache/um40-v52-compact-input.json'));
  const ctx=v52.context(compact,'D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
  const findings=[];
  for(const [name,im]of Object.entries(initials)){
   const legal=neighbors(a.finalMap).filter(r=>check(im,r.finalMap,c.inputs));
   assert.ok(legal.length>0,name+' has no legal seeds');
   const seed=check(im,a.finalMap,c.inputs)?{finalMap:a.finalMap,mutation:'original A finals'}:legal[0];
   const entry={...a,id:'verify-'+name,initialMap:im,finalMap:seed.finalMap};
   entry.codeList=compact.pinyin.map((py,i)=>{
    if(!a.codeList[i])return null;const[h,f]=splitPinyin(py);assert.ok(h!==255&&f!==255);return im[HEADS[h]]+entry.finalMap[FINALS[f]];
   });
   const native=await worker.score(entry),js=v52.evaluateUntoned(entry,base.POLICY,base.BALANCE,ctx).v52;
   let maximum=0;for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])
    for(const field of ['effectiveMs','motorUpperMs','firstAuxRate','selectionRate','meanRejectedCandidates','meanPageActions'])maximum=Math.max(maximum,Math.abs(js[mode][kind][field]-native.modes[mode][kind][field]));
   assert.ok(maximum<1e-8,name+' JS/native mismatch '+maximum);
   findings.push({initials:name,anchorLegal:check(im,a.finalMap,c.inputs),legalOneOperation:legal.length,
    doubleEmptyOneOperation:legal.filter(r=>check(im,r.finalMap,c.inputs,true)).length,seed,jsNativeMaximumDifference:maximum,seedScores:scores(native.modes,c.reference)});
  }
  const audit={version:1,anchor:a.id,anchorScore:r.score,anchorDoubled:r.doubledScore,
    constraints:{D:3,V:1,M:40,unique399:true,fixed:{ei:'E',er:'E',o:'O',uo:'O'},groups:GROUPS,allowedInitials:initials,policies:base.POLICY},findings};
  fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-21-a-locked-rhymes-v52-verification.json'),JSON.stringify(audit,null,2)+'\n');
  console.log(JSON.stringify(audit));
 }finally{worker.child.stdin.end();}
}
async function run(){
 fs.mkdirSync(WORK,{recursive:true});const {c,a,initials}=setup(),verification=read(path.join(ROOT,'research/notes/2026-11-21-a-locked-rhymes-v52-verification.json'));
 assert.deepEqual(verification.constraints.allowedInitials,initials);
 const hours=Number(process.argv.find(s=>s.startsWith('--hours='))?.split('=')[1]||6);
 const checkpoint=path.join(WORK,'checkpoint.json'),log=path.join(WORK,'scores.jsonl');
 const manifest={anchor:a.id,initials,constraints:verification.constraints,templateSha256:hash(fs.readFileSync(path.join(base.WORK,'templates.json'))),
  scorerSha256:hash(fs.readFileSync(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-2126-stream.exe'))),sourceSha256:hash(fs.readFileSync(__filename))};
 let state=fs.existsSync(checkpoint)?read(checkpoint):{manifest,startedAt:new Date().toISOString(),deadline:new Date(Date.now()+hours*3600000).toISOString(),rng:20261121,lanes:[],scored:0,status:'running'};
 assert.deepEqual(state.manifest,manifest,'search inputs changed');
 const seen=new Map();
 if(fs.existsSync(log))for(const line of fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean)){const r=JSON.parse(line);seen.set(r.initials+':'+r.state,r);}
 if(!state.lanes.length)for(const name of Object.keys(initials))for(const empty of [false,true]){
  const all=[{finalMap:a.finalMap,mutation:'original A finals'},...neighbors(a.finalMap)].filter(r=>check(initials[name],r.finalMap,c.inputs,empty));
  assert.ok(all.length>0,'no initial legal states '+name+'/'+empty);
  state.lanes.push({name:name+(empty?'-double-empty':'-regular'),initials:name,doubleEmpty:empty,spentSeconds:0,evaluations:0,
    queue:all.map(r=>({state:key(r.finalMap),mutation:r.mutation})),expanded:[],best:null,current:null,top:[],attempts:0});
 }
 const random=n=>{state.rng=(Math.imul(state.rng,1664525)+1013904223)>>>0;return state.rng%n;};
 const legal=(lane,k)=>check(initials[lane.initials],decode(k),c.inputs,lane.doubleEmpty);
 function consumeReview(){
  const inbox=path.join(WORK,'review-inbox.json');if(!fs.existsSync(inbox))return;
  const review=read(inbox);if(state.lastReviewId===review.id)return;
  const {settings}=require('./a_locked_rhyme_review');
  const applied={id:review.id,at:new Date().toISOString(),strategies:[],accepted:0,rejected:0};
  for(const raw of review.strategies||[]){const strategy=settings(raw),lane=state.lanes.find(l=>l.name===strategy.lane);if(lane){lane.strategy=strategy;applied.strategies.push(strategy);}}
  const incoming=new Map(state.lanes.map(l=>[l.name,[]]));
  for(const p of review.proposals||[]){
   const lane=state.lanes.find(l=>l.name===p.targetLane);
   if(!lane||typeof p.state!=='string'||p.state.length!==35||!/^[A-Z]+$/.test(p.state)||!legal(lane,p.state)){applied.rejected++;continue;}
   const old=seen.get(lane.initials+':'+p.state);if(old){register(lane,old);continue;}
   incoming.get(lane.name).push({state:p.state,parent:p.parent,mutation:p.mutation});applied.accepted++;
  }
  for(const lane of state.lanes)lane.queue=[...incoming.get(lane.name),...lane.queue];
  state.lastReviewId=review.id;state.lastReview=applied;
  fs.appendFileSync(path.join(WORK,'review-applied.jsonl'),JSON.stringify(applied)+'\n');
 }
 function register(lane,row){
  if(!legal(lane,row.state))return;
  if(!lane.best||row.scores['1']<lane.best.scores['1']){lane.best=row;console.log(JSON.stringify({best:lane.name,id:row.id,scores:row.scores,scored:state.scored}));}
  if(!lane.top.some(r=>r.state===row.state))lane.top.push(row);
  lane.top.sort((a,b)=>a.scores['1']-b.scores['1']);lane.top=lane.top.slice(0,24);
  if(!lane.current)lane.current=row;
 }
 function save(){
  state.updatedAt=new Date().toISOString();state.memory={availableGB:os.freemem()/2**30,rssGB:process.memoryUsage().rss/2**30};
  const temp=checkpoint+'.tmp';fs.writeFileSync(temp,JSON.stringify(state));fs.renameSync(temp,checkpoint);
  const report={status:state.status,startedAt:state.startedAt,deadline:state.deadline,updatedAt:state.updatedAt,
    exactScores:state.scored,baseline:c.controls.find(r=>r.id===a.id),constraints:verification.constraints,memory:state.memory,
    lastReview:state.lastReview||null,lanes:state.lanes.map(l=>({name:l.name,strategy:l.strategy||null,spentSeconds:l.spentSeconds,evaluations:l.evaluations,expandedNeighborhoods:l.expanded.length,
      pending:l.queue.length,best:l.best,top:l.top.slice(0,5)})),scope:'All legal one-atom moves/swaps at A, followed by exact neighborhood expansion and stochastic coupled atom moves; not globally exhaustive.'};
  fs.writeFileSync(path.join(WORK,'live-report.json'),JSON.stringify(report,null,2)+'\n');
  for(const l of state.lanes)if(l.best)fs.writeFileSync(path.join(WORK,l.name+'-best.json'),JSON.stringify({...l.best,initialMap:initials[l.initials],finalMap:decode(l.best.state),constraints:verification.constraints},null,2)+'\n');
 }
 state.scored=seen.size;
 for(const lane of state.lanes){lane.spentSeconds=0;lane.evaluations=0;}
 for(const row of seen.values())for(const lane of state.lanes){
  if(lane.initials===row.initials)register(lane,row);
  if(lane.name===row.assignedLane){lane.spentSeconds+=row.seconds;lane.evaluations++;}
 }
 const worker=base.launch();await worker.ready;
 try{
  state.status='running';save();
  while(Date.now()<Date.parse(state.deadline)&&!fs.existsSync(path.join(WORK,'STOP'))){
   if(state.scored%5===0)consumeReview();
   if(os.freemem()<6*2**30){state.status='waiting-for-memory';save();await new Promise(r=>setTimeout(r,10000));continue;}
   state.status='running';
   const lane=[...state.lanes].sort((a,b)=>a.spentSeconds-b.spentSeconds)[0];
   let proposal;
   for(let attempt=0;attempt<20000&&!proposal;attempt++){
    if(!lane.queue.length){
     const center=lane.top.find(r=>!lane.expanded.includes(r.state));
     const strategy=lane.strategy||{},explore=center&&(random(1000000)/1000000<(strategy.explorationProbability||0));
     if(center&&!explore){lane.expanded.push(center.state);lane.queue=neighbors(decode(center.state)).filter(r=>legal(lane,key(r.finalMap))).map(r=>({state:key(r.finalMap),mutation:r.mutation,parent:center.id}));}
     else{
      const seed=lane.top[random(Math.min(strategy.seedPool||12,lane.top.length))]||lane.current;
      const min=strategy.minSteps||2,max=strategy.maxSteps||6;
      const map=decode(seed.state),steps=min+random(max-min+1);
      for(let j=0;j<steps;j++){
       const a=MOVABLE[random(MOVABLE.length)],b=MOVABLE[random(MOVABLE.length)],ka=map[a[0]],kb=map[b[0]];
       if(random(3)){for(const f of a)map[f]=kb;for(const f of b)map[f]=ka;}
       else for(const f of a)map[f]=String.fromCharCode(65+random(26));
      }
      if(legal(lane,key(map)))lane.queue.push({state:key(map),mutation:'coupled '+steps+' atom operations',parent:seed.id});
     }
    }
    if(!lane.queue.length)continue;
    const candidate=lane.queue.shift();lane.attempts++;
    const old=seen.get(lane.initials+':'+candidate.state);
    if(old){register(lane,old);continue;}
    if(legal(lane,candidate.state))proposal=candidate;
   }
   if(!proposal){lane.spentSeconds+=1;save();continue;}
   const fm=decode(proposal.state),entry={...a,id:'ALR-'+hash(lane.initials+':'+proposal.state).slice(0,12),initialMap:initials[lane.initials],finalMap:fm};
   assert.ok(check(entry.initialMap,fm,c.inputs,lane.doubleEmpty));
   const t0=Date.now(),value=await worker.score(entry),elapsed=(Date.now()-t0)/1000;
   const row={id:entry.id,initials:lane.initials,state:proposal.state,mutation:proposal.mutation,parent:proposal.parent,
    scores:scores(value.modes,c.reference),memory:md.memory(entry),audit:base.audit(entry.initialMap,fm,c.inputs),
    modes:value.modes,seconds:elapsed,assignedLane:lane.name,scoredAt:new Date().toISOString()};
   assert.ok(row.audit.unique===399&&row.memory.M===40&&row.memory.D===3);
   assert.ok(!lane.doubleEmpty||!row.audit.qz&&!row.audit.zq);
   fs.appendFileSync(log,JSON.stringify(row)+'\n');seen.set(lane.initials+':'+row.state,row);
   state.scored++;lane.evaluations++;lane.spentSeconds+=elapsed;
   for(const other of state.lanes)if(other.initials===row.initials)register(other,row);
   const temperature=(lane.strategy?.temperature||.0005)*(1+(lane.attempts%1000)/1000);
   if(!lane.current||row.scores['1']<=lane.current.scores['1']||random(1000000)/1000000<Math.exp((lane.current.scores['1']-row.scores['1'])/temperature))lane.current=row;
   if(state.scored%5===0)save();
   if(state.scored%25===0)console.log(JSON.stringify({scored:state.scored,lanes:state.lanes.map(l=>({name:l.name,seconds:l.spentSeconds,best:l.best?.scores})),availableGB:os.freemem()/2**30}));
  }
  state.status=fs.existsSync(path.join(WORK,'STOP'))?'stopped-by-request':'completed-six-hour-window';save();
 }finally{save();worker.child.stdin.end();}
}
if(require.main===module)(process.argv.includes('--verify')?verify():run()).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={setup,check,neighbors,key,decode,GROUPS,ATOMS,MOVABLE,WORK};
