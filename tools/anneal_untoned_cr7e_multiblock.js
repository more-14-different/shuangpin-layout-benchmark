'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const far=require('./anneal_untoned_cr7e_far'),search=require('./search_untoned_cr7e_v52'),cross=require('./search_untoned_cr7e_crosswide');
const {screening,mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{pool}=require('./untoned_v52_stream_pool');
const {FINALS}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-multiblock-v52');
const WORK=path.join(ROOT,'research/.cache/untoned-cr7e-multiblock-v52-20261120');
const INPUTS=['far','recovery','blocks','crosswide'].map(n=>path.join(ROOT,`research/notes/2026-11-20-untoned-cr7e-${n}-v52.json`));
const LEFT=cross.LEFT,RIGHT=cross.RIGHT,VARIABLE=[...LEFT,...RIGHT],KEYS=cross.KEYS,ALL_KEYS='BCDEFGHJKLMNPQRSTWXYZ';
const SEEDS=['U7H-ba54b6e08e04','U7H-15738b341461','U7H-b7c21920f4cf','U7H-57a04807f570','U7H-42680903153b','U7H-e4732bf55fb2'];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const finalKey=e=>FINALS.map(f=>e.finalMap[f]).join(''),distance=(a,b,fs=FINALS)=>fs.filter(f=>a[f]!==b[f]).length;
function combineBlocks(base,a,b,left=LEFT,right=RIGHT){const out={...base};for(const f of left)out[f]=a[f];for(const f of right)out[f]=b[f];return out;}
function multiMove(base,rng,release=false){
 const out={...base},pick=a=>a[Math.floor(far.random(rng)*a.length)];
 for(const block of [LEFT,RIGHT]){
  const tokens=[...block];for(let i=tokens.length-1;i>0;i--){const j=Math.floor(far.random(rng)*(i+1));[tokens[i],tokens[j]]=[tokens[j],tokens[i]];}
  const n=2+Math.floor(far.random(rng)*3);
  for(const f of tokens.slice(0,n))out[f]=pick([...KEYS].filter(k=>k!==base[f]));
 }
 if(release){const outside=FINALS.filter(f=>!VARIABLE.includes(f));
  if(far.random(rng)<.5){const a=pick(outside),b=pick(outside);[out[a],out[b]]=[out[b],out[a]];}
  else out[pick(outside)]=pick(ALL_KEYS);}
 return out;
}
function schedule(round){return round<8?{phase:'fixed-backbone',temperature:.012*(.0003/.012)**(round/7)}:
 {phase:'released-backbone',temperature:.018*(.00015/.018)**((round-8)/7)};}
function ranker(training){
 const child=spawn('python',['-X','utf8',path.join(ROOT,'tools/learn_untoned_cr7e_ranker.py'),training],{windowsHide:true,stdio:['pipe','pipe','inherit'],env:{...process.env,OPENBLAS_NUM_THREADS:'4',OMP_NUM_THREADS:'4',MKL_NUM_THREADS:'4'}});
 let pending,resolveReady,rejectReady;const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
 const fail=e=>{rejectReady(e);pending?.reject(e);pending=null;};child.on('error',fail);child.on('exit',code=>{if(pending)fail(Error('ranker exit '+code));});
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready)resolveReady(r);else{assert.ok(pending);const p=pending;pending=null;p.resolve(r);}}catch(e){fail(e);}});
 return {ready,child,call:job=>new Promise((resolve,reject)=>{assert.ok(!pending);pending={resolve,reject};child.stdin.write(JSON.stringify(job)+'\n');})};
}
function componentBeam(rows,center,tokens,width=64){
 const outside=FINALS.filter(f=>!tokens.includes(f)),compatible=rows.filter(r=>outside.every(f=>r.finalMap[f]===center.finalMap[f])&&distance(r.finalMap,center.finalMap,tokens)>=2);
 const unique=new Map();for(const axis of ['score','doubledScore'])for(const r of [...compatible].sort((a,b)=>a[axis]-b[axis]).slice(0,width))unique.set(finalKey(r),r);
 return [...unique.values()];
}
async function main(){
 fs.mkdirSync(WORK,{recursive:true});const imports=INPUTS.map(read),previous=imports.at(-1);assert.ok(previous.completed);
 const priorFile=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'),prior=read(priorFile),data=prior.auditInput;
 const initialMap=previous.initialMap,template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const inspect=screening(data,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const sources=[__filename,...INPUTS,priorFile,path.join(ROOT,'tools/learn_untoned_cr7e_ranker.py'),path.join(ROOT,'tools/anneal_untoned_cr7e_far.js'),
  path.join(ROOT,'tools/search_untoned_cr7e_v52.js'),path.join(ROOT,'tools/search_untoned_cr7e_coupled.js'),path.join(ROOT,'tools/untoned_v52_stream_pool.js'),
  path.join(ROOT,'tools/search_untoned_cr7e_crosswide.js'),path.join(far.WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),
  path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe')];
 const sourceHashes=Object.fromEntries(sources.map(p=>[p,hash(p)]));let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;
 if(report)assert.deepEqual(report.sourceHashes,sourceHashes,'resume inputs changed');
 report??={version:'untoned-cr7e-multiblock-v52-1',sourceHashes,initialMap,policy:previous.policy,reference:previous.reference,target:previous.target,
  baseline:{one:previous.bestDefault[0],two:previous.bestDoubled[0]},
  contract:{capacity:[21,21],M:42,D:2,V:5,branches:0,qzEmpty:true,zqEmpty:true,initialsFixed:true,costMultipliers:[1,2],left:LEFT,right:RIGHT,candidateKeys:KEYS,
   search:'Measured component beams (top 64 per axis/block), simultaneous >=2-final changes in both blocks; six diverse centers, 8 fixed-backbone then 8 released rounds, 24 exact multiple-try proposals/chain/round; finite heuristic',
   seeds:SEEDS,rounds:16,perChainPerRound:24,componentBeamWidth:64},states:{},stages:[],chains:[],rounds:[],rankerFits:[],completed:false};
 const known=new Map([...imports.flatMap(r=>Object.values(r.states)),...Object.values(report.states)].map(r=>[mappingKey(r),r]));
 const byId=new Map([...known.values()].map(r=>[r.id,r])),pending=new Map();
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 const native=await pool(path.join(far.WORK,'templates.json'),12);
 async function evaluate(row){
  const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);
  const entry=search.rebuild({...template,...row,initialMap},data),audit=search.audit(entry,data);assert.ok(legal(audit));
  const job=(async()=>{const id='U7M-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id});
   const result={id,initialMap,finalMap:entry.finalMap,parent:row.parent,mutation:row.mutation,audit,score:s.score,doubledScore:s.doubledScore};
   known.set(key,result);byId.set(id,result);report.states[id]=result;
   if(Object.keys(report.states).length%100===0){save();console.log(JSON.stringify({states:Object.keys(report.states).length,best:Math.min(...[...known.values()].map(r=>r.score)),best2:Math.min(...[...known.values()].map(r=>r.doubledScore))}));}return result;})();
  pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 const training=path.join(WORK,'training.json'),writeTraining=()=>fs.writeFileSync(training,JSON.stringify([...known.values()].map(r=>{const p=inspect(r,true);assert.ok(p);return{id:r.id,keys:finalKey(r),proxy:p.proxy,miss:p.miss,score:r.score,doubledScore:r.doubledScore};})));
 let learner;
 try{
  for(const row of [previous.bestDefault[0],previous.bestDoubled[0]]){const s=await native.score(row);assert.ok(Math.abs(s.score-row.score)<1e-9&&Math.abs(s.doubledScore-row.doubledScore)<1e-9);}
  writeTraining();learner=ranker(training);const first=await learner.ready;report.rankerFits.push({afterNewStates:Object.keys(report.states).length,...first.metrics});save();console.log(JSON.stringify(first));
  // Measured block energies provide a second, independent ordering beside the learned proposal ranker.
  for(const center of [previous.bestDefault[0],previous.bestDoubled[0]]){
   const name='measured multi-block recombination';if(report.stages.some(s=>s.name===name&&s.center===center.id))continue;
   const all=[...known.values()],left=componentBeam(all,center,LEFT),right=componentBeam(all,center,RIGHT),rows=new Map();let pairs=0,legalCount=0;
   for(const a of left)for(const b of right){pairs++;const fm=combineBlocks(center.finalMap,a.finalMap,b.finalMap),row={initialMap,finalMap:fm,parent:center.id,mutation:name},p=inspect(row,true);if(!p)continue;legalCount++;
    const key=mappingKey(row);if(known.has(key))continue;rows.set(key,{...row,keys:finalKey(row),proxy:p.proxy,miss:p.miss,componentIds:[a.id,b.id],additive:[a.score+b.score-center.score,a.doubledScore+b.doubledScore-center.doubledScore]});}
   const candidates=[...rows.values()],ranked=await learner.call({rows:candidates.map(({keys,proxy,miss})=>({keys,proxy,miss}))}),picks=new Map();
   const add=(r,reason)=>{if(r&&!picks.has(r.keys))picks.set(r.keys,{...r,selection:reason});};
   const predicted=candidates.map((r,i)=>({...r,prediction:ranked.prediction[i],uncertainty:ranked.uncertainty[i]}));
   for(const axis of [0,1]){
    [...predicted].sort((a,b)=>a.additive[axis]-b.additive[axis]).slice(0,64).forEach(r=>add(r,'measured-component sum'));
    [...predicted].sort((a,b)=>a.prediction[axis]-b.prediction[axis]).slice(0,48).forEach(r=>add(r,'ridge mean'));
    [...predicted].sort((a,b)=>(a.prediction[axis]-.7*a.uncertainty[axis])-(b.prediction[axis]-.7*b.uncertainty[axis])).slice(0,24).forEach(r=>add(r,'ridge uncertainty'));}
   const rng={rng:20261120+report.stages.length};for(let i=0;i<32;i++)add(predicted[Math.floor(far.random(rng)*predicted.length)],'unranked coverage');
   const start=Object.keys(report.states).length,selected=[...picks.values()],results=await Promise.all(selected.map(evaluate));
   report.stages.push({name,center:center.id,leftIds:left.map(r=>r.id),rightIds:right.map(r=>r.id),pairs,legalCount,novelCandidates:candidates.length,newExactStates:Object.keys(report.states).length-start,
    selected:selected.map((r,i)=>({id:results[i].id,componentIds:r.componentIds,selection:r.selection,additive:r.additive,prediction:r.prediction})),best1x:[...results].sort((a,b)=>a.score-b.score)[0],best2x:[...results].sort((a,b)=>a.doubledScore-b.doubledScore)[0]});save();console.log(JSON.stringify({stage:name,center:center.id,pairs,legalCount,selected:results.length}));
  }
  if(!report.chains.length){for(let i=0;i<SEEDS.length;i++){const seed=byId.get(SEEDS[i]);assert.ok(seed);report.chains.push({index:i,seedId:seed.id,currentId:seed.id,bestId:seed.id,objective:i%2?'doubledScore':'score',rng:(20261122+(i+1)*104729)>>>0,accepted:0,round:0});}save();}
  for(let round=report.rounds.length;round<16;round++){
   const jobs=[],flat=[];
   for(const chain of report.chains){
    const center=byId.get(chain.currentId),seed=byId.get(chain.seedId),release=round>=8,unique=new Map(),cached=new Map();
    const add=(finalMap,mutation)=>{if(!release&&FINALS.some(f=>!VARIABLE.includes(f)&&finalMap[f]!==seed.finalMap[f]))return;
     const row={initialMap,finalMap,parent:center.id,mutation},key=mappingKey(row),p=inspect(row,true);if(!p||distance(finalMap,center.finalMap)===0)return;
     if(known.has(key)){cached.set(key,known.get(key));return;}unique.set(key,{...row,keys:finalKey(row),proxy:p.proxy,miss:p.miss});};
    // Include the entire legal local ring in the ranking pool, plus genuine simultaneous multi-final jumps.
    for(const r of search.neighbors(center))add(r.finalMap,'local recovery');
    for(let i=0;i<4500;i++){
     const fm=i%3!==0?multiMove(center.finalMap,chain,release):far.perturb(center.finalMap,chain,2+Math.floor(far.random(chain)*4));
     add(fm,release?'released multi-block / global regrouping':'fixed-backbone multi-block regrouping');}
    const rows=[...unique.values()],offset=flat.length;flat.push(...rows);jobs.push({chain,center,rows,cached:[...cached.values()],offset});
   }
   const ranked=await learner.call({rows:flat.map(({keys,proxy,miss})=>({keys,proxy,miss}))}),selections=[];
   for(const job of jobs){const axis=job.chain.objective==='score'?0:1,picks=new Map(),rows=job.rows.map((r,i)=>({...r,prediction:ranked.prediction[job.offset+i][axis],uncertainty:ranked.uncertainty[job.offset+i][axis]}));
    const add=r=>{if(r)picks.set(r.keys,r);};
    [...rows].sort((a,b)=>a.prediction-b.prediction).slice(0,10).forEach(add);
    [...rows].sort((a,b)=>(a.prediction-.7*a.uncertainty)-(b.prediction-.7*b.uncertainty)).slice(0,4).forEach(add);
    const multi=rows.filter(r=>distance(r.finalMap,job.center.finalMap,LEFT)>=2&&distance(r.finalMap,job.center.finalMap,RIGHT)>=2);
    [...multi].sort((a,b)=>a.prediction-b.prediction).slice(0,6).forEach(add);
    for(const penalty of [150,600])[...rows].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)).slice(0,2).forEach(add);
    while(picks.size<Math.min(24,rows.length))add(rows[Math.floor(far.random(job.chain)*rows.length)]);
    selections.push({...job,selected:[...picks.values()].slice(0,24)});
   }
   const before=Object.keys(report.states).length,results=await Promise.all(selections.map(async j=>({...j,results:await Promise.all(j.selected.map(evaluate))}))),stage={round,...schedule(round),candidateCount:flat.length,newExactStates:0,chains:[]};
   for(const job of results){const {chain,center}=job,axis=chain.objective,alternatives=[...job.results,...job.cached],best=[...alternatives].sort((a,b)=>a[axis]-b[axis])[0],delta=best[axis]-center[axis];
    const accepted=delta<=0||far.random(chain)<Math.exp(-delta/stage.temperature);if(accepted){chain.currentId=best.id;chain.accepted++;}
    chain.round=round+1;for(const row of alternatives)if(row[axis]<byId.get(chain.bestId)[axis])chain.bestId=row.id;
    stage.chains.push({index:chain.index,from:center.id,to:best.id,accepted,score:best.score,doubledScore:best.doubledScore,rngAfter:chain.rng,
     selected:job.results.map((r,i)=>({id:r.id,prediction:job.selected[i].prediction,leftChanges:distance(r.finalMap,center.finalMap,LEFT),rightChanges:distance(r.finalMap,center.finalMap,RIGHT)}))});}
   stage.newExactStates=Object.keys(report.states).length-before;report.rounds.push(stage);save();console.log(JSON.stringify({round,phase:stage.phase,candidates:stage.candidateCount,newExact:stage.newExactStates,centers:report.chains.map(c=>c.currentId)}));
   if((round+1)%4===0&&round<15){writeTraining();const r=await learner.call({refit:training});report.rankerFits.push({afterRound:round,...r.metrics});save();}
  }
  const values=[...known.values()];report.bestDefault=[...values].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.bestNewDefault=[...Object.values(report.states)].sort((a,b)=>a.score-b.score).slice(0,4);report.bestNewDoubled=[...Object.values(report.states)].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,4);
  report.completed=true;save();console.log(JSON.stringify({completed:true,newStates:Object.keys(report.states).length,best1:report.bestDefault[0].id,best2:report.bestDoubled[0].id,newBest1:report.bestNewDefault[0],newBest2:report.bestNewDoubled[0]}));
 }finally{native.close();learner?.child.stdin.end();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={PREFIX,WORK,INPUTS,LEFT,RIGHT,VARIABLE,KEYS,SEEDS,combineBlocks,multiMove,schedule,componentBeam,distance};
