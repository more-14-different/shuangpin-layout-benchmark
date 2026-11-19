'use strict';
// Fixed CR7e consonants, shared A/E/O carrier N, unchanged untoned contract.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),readline=require('node:readline');
const search=require('./search_untoned_cr7e_v52');
const {HEADS,FINALS,ALPHABET}=require('./ckt_v4_scheme_fixture');
const model=require('./ckt_v4_model');
const ROOT=path.resolve(__dirname,'..');
const PREFIX=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-zero-n-v52');
const WORK=path.join(ROOT,'research/.cache/untoned-cr7e-v52-20261119');
const PROFILE=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
const PRIOR=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52.json');
const VERIFIED=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const mappingKey=e=>FINALS.map(f=>e.finalMap[f]).join('');
function nCarrier(initialMap){return {...initialMap,A:'N',E:'N',O:'N'};}
function legal(a){return a.valid&&a.M<=42&&a.D<=2&&a.V<=5&&a.branches===0&&!a.qz&&!a.zq;}
function launch(){
 const child=spawn(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe'),[
  path.join(WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),PROFILE],
  {stdio:['pipe','pipe','inherit'],windowsHide:true});
 let pending,resolveReady,rejectReady,ended=false;
 const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
 const fail=e=>{rejectReady(e);pending?.reject(e);pending=null;};
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const row=JSON.parse(line);if(row.ready)resolveReady(row);else{assert.ok(pending,'unsolicited native score');const p=pending;pending=null;p.resolve(row);}}catch(e){fail(e);}});
 child.on('error',fail);child.on('exit',code=>{ended=true;if(pending)fail(Error('native worker exited '+code));});
 return {child,ready,score:entry=>new Promise((resolve,reject)=>{
  if(ended||pending)return reject(Error('worker unavailable'));pending={resolve,reject};
  child.stdin.write(JSON.stringify({id:entry.id,state:[...HEADS.map(h=>entry.initialMap[h]),...FINALS.map(f=>entry.finalMap[f])].map(k=>ALPHABET.indexOf(k))})+'\n');
 })};
}
async function main(){
 const prior=read(PRIOR),verified=read(VERIFIED);assert.ok(prior.completed&&verified.completed);
 const data=verified.auditInput,initialMap=nCarrier(prior.initialMap);
 const template={...verified.results.find(r=>r.id==='OC21-bf9bf45a7e60'),capacity:[21,21]};
 const files=[__filename,PRIOR,VERIFIED,path.join(ROOT,'tools/search_untoned_cr7e_v52.js'),
  path.join(ROOT,'tools/ckt_v4_model.js'),path.join(ROOT,'tools/auxiliary_semantics.js'),
  path.join(ROOT,'research/ckt-v4-core/src/bin/score-untoned-v52-stream.rs'),
  path.join(WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),PROFILE];
 const sourceHashes=Object.fromEntries(files.map(p=>[p,hash(p)]));
 let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;
 if(report)assert.deepEqual(report.sourceHashes,sourceHashes,'resume contract differs');
 report??={version:'untoned-cr7e-zero-n-v52-1',sourceHashes,initialMap,previousInitialMap:prior.initialMap,policy:prior.policy,
  reference:verified.reference,controls:verified.results.filter(r=>r.id.startsWith('OC21-')).map(r=>({id:r.id,score:r.score,doubledScore:r.doubledScore})),
  contract:{capacity:[21,21],memory:'M-R2-explicit',maxM:42,maxD:2,maxV:5,qzEmpty:true,zqEmpty:true,
   zeroCarrier:'A/E/O all N; Y/YU and W unchanged',costMultipliers:[1,2],
   cognitive:'first/second/third auxiliary, selection, scan, page all scale together; S005 reference also repriced',
   search:'multi-seed transplants; proxy-screened final swaps, group swaps, moves and two-swap perturbations; finite heuristic, no closure proof'},
  states:{},stages:[],completed:false};
 const seen=new Map(Object.values(report.states).map(r=>[mappingKey(r),r])),pending=new Map();
 const workers=[launch(),launch()];await Promise.all(workers.map(w=>w.ready));
 const queues=workers.map(()=>Promise.resolve());let issued=0;
 const score=entry=>{const i=issued++%workers.length,job=queues[i].then(()=>workers[i].score(entry));queues[i]=job.catch(()=>{});return job;};
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 async function evaluate(row){
  const e=search.rebuild({...template,...row,initialMap},data),key=mappingKey(e);
  if(seen.has(key))return seen.get(key);if(pending.has(key))return pending.get(key);
  const audit=search.audit(e,data);if(!legal(audit))return null;
  const job=(async()=>{const id='U7N-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),native=await score({...e,id});
   const result={id,initialMap,finalMap:e.finalMap,audit,score:native.score,doubledScore:native.doubledScore,parent:row.parent,mutation:row.mutation};
   seen.set(key,result);report.states[id]=result;
   if(seen.size%50===0){save();console.log(JSON.stringify({states:seen.size,best:Math.min(...[...seen.values()].map(r=>r.score)),best2:Math.min(...[...seen.values()].map(r=>r.doubledScore))}));}
   return result;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 try{
  // Check both published controls before accepting any new native score.
  for(const control of verified.results.filter(r=>r.id.startsWith('OC21-'))){
   const s=await score(control);assert.ok(Math.abs(s.score-control.score)<1e-9);assert.ok(Math.abs(s.doubledScore-control.doubledScore)<1e-9);
  }
  if(!report.stages.some(s=>s.name==='seed transplants')){
   const rows=Object.values(prior.states),seeds=[...verified.results.filter(r=>r.id.startsWith('OC21-')),
    ...[...rows].sort((a,b)=>a.score-b.score).slice(0,45),...[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,45)];
   const unique=[...new Map(seeds.map(r=>[mappingKey(r),r])).values()];
   await Promise.all(unique.map(r=>evaluate({...r,parent:r.id,mutation:'A/E/O R→N transplant'})));
   report.stages.push({name:'seed transplants',sources:unique.map(r=>r.id),newStates:seen.size});save();
  }
  const closed=new Set(report.stages.filter(s=>s.center).map(s=>s.center));
  const motor=model.upstreamMotor(read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
  function proxy(row){const e=search.rebuild({...template,...row,initialMap},data);if(seen.has(mappingKey(e))||!legal(search.audit(e,data)))return null;
   let total=0,cost=0,miss=0;const buckets=new Map();for(const[p,w]of data.base){const c=e.codeList[p];cost+=w*motor(c).upperMs;total+=w;if(!buckets.has(c))buckets.set(c,[]);buckets.get(c).push(w);}
   for(const rows of buckets.values())miss+=rows.reduce((s,w)=>s+w,0)-Math.max(...rows);return{...row,proxy:cost/total,miss:miss/total};}
  for(let round=closed.size;round<24&&seen.size<2000;round++){
   const rows=[...seen.values()],best=[...rows].sort((a,b)=>a.score-b.score).slice(0,3).concat([...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,3));
   const center=best.find(r=>!closed.has(r.id));if(!center)break;
   const variants=search.neighbors(center);let rng=191119+round;const rand=n=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)%n;};
   for(let i=0;i<220;i++){const map={...center.finalMap};for(let j=0;j<2;j++){const a=FINALS[rand(35)],b=FINALS[rand(35)];[map[a],map[b]]=[map[b],map[a]];}variants.push({finalMap:map,mutation:'two-swap perturbation'});}
   const legalRows=variants.map(proxy).filter(Boolean),selected=new Map();
   for(const penalty of [0,150,300,600])for(const r of [...legalRows].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)).slice(0,25))selected.set(mappingKey(r),r);
   const start=seen.size;await Promise.all([...selected.values()].map(r=>evaluate({...r,parent:center.id})));
   closed.add(center.id);report.stages.push({name:'screened final neighborhood',center:center.id,legalCandidates:legalRows.length,exactCandidates:selected.size,newStates:seen.size-start});save();
  }
  const rows=[...seen.values()];report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,10);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,10);
  report.completed=true;save();console.log(JSON.stringify({completed:true,states:seen.size,centers:closed.size,best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{for(const w of workers)w.child.stdin.end();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={nCarrier,legal,mappingKey,PREFIX};
