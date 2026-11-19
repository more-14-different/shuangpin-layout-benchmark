'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),readline=require('node:readline');
const far=require('./anneal_untoned_cr7e_far'),search=require('./search_untoned_cr7e_v52'),{pool}=require('./untoned_v52_stream_pool');
const {screening,mappingKey,legal}=require('./search_untoned_cr7e_coupled');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-recovery-v52');
const WORK=path.join(ROOT,'research/.cache/untoned-cr7e-recovery-v52-20261120');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const finalKey=e=>FINALS.map(f=>e.finalMap[f]).join('');
function distance(a,b){return FINALS.filter(f=>a[f]!==b[f]).length;}
function partitionCrossover(a,b,rng){
 const map={...a},groups=Object.values(Object.groupBy(FINALS,f=>b[f]));
 for(const group of groups)if(far.random(rng)<.4)for(const f of group)map[f]=b[f];
 return map;
}
function schedule(round){return round<10?{phase:'recovery',temperature:0}:{phase:'fine',temperature:.018*(.0002/.018)**((round-10)/19)};}
function ranker(training){
 const child=spawn('python',['-X','utf8',path.join(ROOT,'tools/learn_untoned_cr7e_ranker.py'),training],
  {windowsHide:true,stdio:['pipe','pipe','inherit'],env:{...process.env,OPENBLAS_NUM_THREADS:'4',OMP_NUM_THREADS:'4',MKL_NUM_THREADS:'4'}});
 let pending,resolveReady,rejectReady;const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
 const fail=e=>{rejectReady(e);pending?.reject(e);pending=null;};
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const row=JSON.parse(line);if(row.ready)resolveReady(row);else{assert.ok(pending);const p=pending;pending=null;p.resolve(row);}}catch(e){fail(e);}});
 child.on('error',fail);child.on('exit',code=>fail(Error('ranker exit '+code)));
 return {ready,child,call:job=>new Promise((resolve,reject)=>{assert.ok(!pending);pending={resolve,reject};child.stdin.write(JSON.stringify(job)+'\n');})};
}
async function main(){
 fs.mkdirSync(WORK,{recursive:true});
 const previous=read(far.PREFIX+'.json'),prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 const data=prior.auditInput,initialMap=previous.initialMap,template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const inspect=screening(data,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const sourceFiles=[__filename,path.join(ROOT,'tools/learn_untoned_cr7e_ranker.py'),far.PREFIX+'.json',
  path.join(ROOT,'tools/untoned_v52_stream_pool.js'),path.join(ROOT,'tools/anneal_untoned_cr7e_far.js'),
  path.join(ROOT,'tools/search_untoned_cr7e_v52.js'),path.join(ROOT,'tools/search_untoned_cr7e_coupled.js'),
  path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'),
  path.join(far.WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),
  path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')];
 const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,hash(p)]));
 let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-recovery-v52-1',sourceHashes,initialMap,policy:far.POLICY,reference:previous.reference,target:previous.target,
  baseline:{one:previous.bestDefault[0],two:previous.bestDoubled[0]},
  contract:{...previous.contract,search:'6 chains, 30 rounds each; 24 exact multiple-try proposals per round; first 10 greedy recovery rounds then 20 long fine-cooling rounds. Ranking-only ridge ensemble surrogate, group crossover and regrouping proposals; no far restart during a chain.',maxNewExactProposals:4320},
  states:{},chains:[],rounds:[],rankerFits:[],completed:false};
 const known=new Map([...Object.values(previous.states),...Object.values(report.states)].map(r=>[mappingKey(r),r]));
 const byId=new Map([...known.values()].map(r=>[r.id,r])),pending=new Map();
 const compact=r=>{const p=inspect(r,true);assert.ok(p);return {id:r.id,keys:finalKey(r),proxy:p.proxy,miss:p.miss,score:r.score,doubledScore:r.doubledScore};};
 const training=path.join(WORK,'training.json');
 const writeTraining=()=>fs.writeFileSync(training,JSON.stringify([...known.values()].map(compact)));
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 writeTraining();const learner=ranker(training);const first=await learner.ready;
 report.rankerFits.push({afterNewStates:Object.keys(report.states).length,...first.metrics});console.log(JSON.stringify(first));
 const native=await pool(path.join(far.WORK,'templates.json'),6);
 async function evaluate(row){
  const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);
  const e=search.rebuild({...template,...row,initialMap},data),audit=search.audit(e,data);assert.ok(legal(audit));
  const job=(async()=>{const id='U7H-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...e,id});
   const result={id,initialMap,finalMap:row.finalMap,audit,score:s.score,doubledScore:s.doubledScore,parent:row.parent,mutation:row.mutation};
   known.set(key,result);byId.set(id,result);report.states[id]=result;
   if(Object.keys(report.states).length%100===0){save();console.log(JSON.stringify({states:Object.keys(report.states).length,best:Math.min(...[...known.values()].map(r=>r.score)),best2:Math.min(...[...known.values()].map(r=>r.doubledScore))}));}
   return result;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 try{
  for(const c of [previous.bestDefault[0],previous.bestDoubled[0]]){const s=await native.score(c);assert.ok(Math.abs(s.score-c.score)<1e-9&&Math.abs(s.doubledScore-c.doubledScore)<1e-9);}
  if(!report.chains.length){
   const trajectories=new Set(previous.trajectory.map(t=>t.to)),walks=Object.values(previous.states).filter(r=>trajectories.has(r.id));
   const walkOne=[...walks].sort((a,b)=>a.score-b.score)[0],walkTwo=[...walks].sort((a,b)=>a.doubledScore-b.doubledScore)[0];
   const bases=[previous.bestDefault[0],previous.bestDoubled[0],walkOne,walkTwo,previous.bestDefault[0],previous.bestDoubled[0]];
   for(let i=0;i<6;i++){
    const chain={index:i,rng:(20261121+(i+1)*104729)>>>0,objective:i%2?'doubledScore':'score',round:0,accepted:0};let start=bases[i];
    if(i>=4){for(let attempt=0;attempt<3000;attempt++){
     const fm=attempt%2?far.perturb(start.finalMap,chain,4):partitionCrossover(start.finalMap,walks[Math.floor(far.random(chain)*walks.length)].finalMap,chain);
     const d=distance(fm,start.finalMap);if(d<5||d>12||!inspect({initialMap,finalMap:fm}))continue;
     start=await evaluate({initialMap,finalMap:fm,parent:start.id,mutation:'partition crossover / moderate distant start'});break;}}
    chain.seedId=start.id;chain.currentId=start.id;chain.bestId=start.id;report.chains.push(chain);
   }save();
  }
  for(let round=report.rounds.length;round<30;round++){
   const jobs=[],flat=[];
   const elites=[...known.values()].sort((a,b)=>(a.score+a.doubledScore)-(b.score+b.doubledScore)).slice(0,24);
   for(const chain of report.chains){
    const center=byId.get(chain.currentId),unique=new Map(),cached=[];
    const add=(finalMap,mutation)=>{const row={initialMap,finalMap,parent:center.id,mutation},key=mappingKey(row),p=inspect(row,true);if(!p||distance(center.finalMap,finalMap)===0)return;
     if(known.has(key)){if(round<10)cached.push(known.get(key));return;}unique.set(key,{...row,keys:finalKey(row),proxy:p.proxy,miss:p.miss});};
    for(const r of search.neighbors(center))add(r.finalMap,r.mutation);
    for(let j=0;j<550;j++){
     const fm=j%3===0?partitionCrossover(center.finalMap,elites[Math.floor(far.random(chain)*elites.length)].finalMap,chain):far.perturb(center.finalMap,chain,j%3+2);
     add(fm,'multi-final regrouping / measured elite crossover');
    }
    const rows=[...unique.values()],offset=flat.length;flat.push(...rows);jobs.push({chain,center,rows,cached,offset});
   }
   assert.ok(flat.length);const ranked=await learner.call({rows:flat.map(({keys,proxy,miss})=>({keys,proxy,miss}))});
   const selections=[];
   for(const job of jobs){
    const axis=job.chain.objective==='score'?0:1,picks=new Map();
    const rows=job.rows.map((r,i)=>({...r,prediction:ranked.prediction[job.offset+i][axis],uncertainty:ranked.uncertainty[job.offset+i][axis]}));
    const add=r=>{if(r)picks.set(r.keys,r);};
    [...rows].sort((a,b)=>a.prediction-b.prediction).slice(0,12).forEach(add);
    [...rows].sort((a,b)=>(a.prediction-.6*a.uncertainty)-(b.prediction-.6*b.uncertainty)).slice(0,6).forEach(add);
    for(const penalty of [150,600])for(const r of [...rows].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)).slice(0,2))add(r);
    while(picks.size<Math.min(24,rows.length))add(rows[Math.floor(far.random(job.chain)*rows.length)]);
    selections.push({...job,selected:[...picks.values()].slice(0,24)});
   }
   const allResults=await Promise.all(selections.map(async job=>({...job,results:await Promise.all(job.selected.map(evaluate))})));
   const stage={round,...schedule(round),candidates:flat.length,newStates:Object.keys(report.states).length,chains:[]};
   for(const job of allResults){
    const {chain,center}=job,alternatives=[...job.results,...job.cached];assert.ok(alternatives.length);
    const best=[...alternatives].sort((a,b)=>a[chain.objective]-b[chain.objective])[0],delta=best[chain.objective]-center[chain.objective],s=schedule(round);
    const accepted=delta<=0||s.temperature>0&&far.random(chain)<Math.exp(-delta/s.temperature);
    if(accepted){chain.currentId=best.id;chain.accepted++;}chain.round=round+1;
    for(const row of job.results)if(row[chain.objective]<byId.get(chain.bestId)[chain.objective])chain.bestId=row.id;
    const errors=job.results.map((r,i)=>Math.abs(r[chain.objective]-job.selected[i].prediction));
    stage.chains.push({index:chain.index,from:center.id,to:best.id,accepted,selected:job.selected.length,score:best.score,doubledScore:best.doubledScore,
     predictionMAE:errors.reduce((a,b)=>a+b,0)/errors.length,rngAfter:chain.rng});
   }
   report.rounds.push(stage);save();console.log(JSON.stringify(stage));
   if((round+1)%5===0&&round<29){writeTraining();const refit=await learner.call({refit:training});report.rankerFits.push({afterRound:round,afterNewStates:Object.keys(report.states).length,...refit.metrics});save();}
  }
  const rows=[...known.values()];report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.completed=true;save();console.log(JSON.stringify({completed:true,states:Object.keys(report.states).length,best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{native.close();learner.child.stdin.end();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={distance,partitionCrossover,schedule,PREFIX,WORK};
