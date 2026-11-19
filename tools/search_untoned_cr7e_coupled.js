'use strict';
// Extend the two U7E centers without changing the historical fixed-initial search.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),readline=require('node:readline');
const search=require('./search_untoned_cr7e_v52'),model=require('./ckt_v4_model');
const {HEADS,FINALS,ALPHABET,splitPinyin}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-coupled-v52');
const PRIOR=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52');
const ZERO=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-zero-n-v52');
const WORK=path.join(ROOT,'research/.cache/untoned-cr7e-v52-20261119');
const PROFILE=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
const KEYS='BCDEFGHJKLMNPQRSTWXYZ';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const mappingKey=e=>HEADS.map(h=>e.initialMap[h]).join('')+'|'+FINALS.map(f=>e.finalMap[f]).join('');
const legal=a=>a.valid&&a.M<=42&&a.D<=2&&a.V<=5&&a.branches===0&&!a.qz&&!a.zq;
const UNITS=HEADS.filter(h=>h!=='YU');
function setInitial(map,h,key){map[h]=key;if(h==='Y')map.YU=key;}
function initialNeighbors(e){
 const rows=[],groups=Object.groupBy(UNITS,h=>e.initialMap[h]);
 for(let i=0;i<UNITS.length;i++)for(let j=i+1;j<UNITS.length;j++){
  const a=UNITS[i],b=UNITS[j],ka=e.initialMap[a],kb=e.initialMap[b];if(ka===kb)continue;
  const map={...e.initialMap};setInitial(map,a,kb);setInitial(map,b,ka);
  rows.push({initialMap:map,finalMap:e.finalMap,mutation:`initial swap ${a}/${b}`});
 }
 const gs=Object.entries(groups);
 for(let i=0;i<gs.length;i++)for(let j=i+1;j<gs.length;j++){
  const[ka,as]=gs[i],[kb,bs]=gs[j];if(as.length===1&&bs.length===1)continue;
  const map={...e.initialMap};as.forEach(h=>setInitial(map,h,kb));bs.forEach(h=>setInitial(map,h,ka));
  rows.push({initialMap:map,finalMap:e.finalMap,mutation:`initial groups ${as.join('/')}/${bs.join('/')}`});
 }
 for(const h of UNITS)for(const k of KEYS)if(k!==e.initialMap[h]){
  const map={...e.initialMap};setInitial(map,h,k);
  rows.push({initialMap:map,finalMap:e.finalMap,mutation:`initial move ${h} to ${k}`});
 }
 for(const k of KEYS)if(['A','E','O'].some(h=>e.initialMap[h]!==k))
  rows.push({initialMap:{...e.initialMap,A:k,E:k,O:k},finalMap:e.finalMap,mutation:`zero A/E/O to ${k}`});
 return rows;
}
// Exact memory/shape audit on the same 399 syllables, avoiding repeated pinyin parsing.
function screening(data,snapshot){
 const tuples=data.base.map(([p,w])=>[...splitPinyin(data.pinyin[p]),w]);
 const motor=model.upstreamMotor(snapshot),motorTable=new Map();
 for(const a of KEYS)for(const b of KEYS)motorTable.set(a+b,motor(a+b).upperMs);
 const activeH=[...new Set(tuples.map(([h])=>HEADS[h]==='YU'?'Y':HEADS[h]))];
 const activeF=[...new Set(tuples.map(([,f])=>FINALS[f]))];
 function inspect(e,withProxy=false){
  const im=e.initialMap,fm=e.finalMap;
  if(im.Y!==im.YU)return null;
  const first=new Set(activeH.map(h=>im[h])),last=new Set(activeF.map(f=>fm[f]));
  if(first.size!==21||last.size!==21||[...first,...last].some(k=>!KEYS.includes(k)))return null;
  const M=activeH.filter(h=>!['A','E','O'].includes(h)&&im[h]!==h.toUpperCase()).length+
   new Set(['A','E','O'].map(h=>im[h])).size+activeF.filter(f=>fm[f]!==f.toUpperCase()).length;
  const D=HEADS.slice(0,21).filter(h=>h.length===1&&im[h]!==h.toUpperCase()).length;
  const V=[...'aeiou'].filter(f=>fm[f]!==f.toUpperCase()).length;
  if(M>42||D>2||V>5)return null;
  let cost=0,total=0,collisionWeight=0;const buckets=new Map();
  for(const[h,f,w]of tuples){const code=im[HEADS[h]]+fm[FINALS[f]];if(code==='QZ'||code==='ZQ')return null;
   if(withProxy){cost+=w*motorTable.get(code);total+=w;const b=buckets.get(code)||[0,0];b[0]+=w;b[1]=Math.max(b[1],w);buckets.set(code,b);}}
  if(!withProxy)return {M,D,V};
  for(const[sum,max]of buckets.values())collisionWeight+=sum-max;
  return {M,D,V,proxy:cost/total,miss:collisionWeight/total};
 }
 return inspect;
}
function launch(){
 const child=spawn(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe'),[
  path.join(WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),PROFILE],{stdio:['pipe','pipe','inherit'],windowsHide:true});
 let pending,resolveReady,rejectReady,ended=false;
 const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
 const fail=e=>{rejectReady(e);pending?.reject(e);pending=null;};
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready)resolveReady(r);else{assert.ok(pending);const p=pending;pending=null;p.resolve(r);}}catch(e){fail(e);}});
 child.on('error',fail);child.on('exit',code=>{ended=true;if(pending)fail(Error('native worker exit '+code));});
 return {child,ready,score:e=>new Promise((resolve,reject)=>{if(ended||pending)return reject(Error('worker unavailable'));
  pending={resolve,reject};child.stdin.write(JSON.stringify({id:e.id,state:[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])].map(k=>ALPHABET.indexOf(k))})+'\n');})};
}
async function main(){
 const prior=read(PRIOR+'.json'),verified=read(PRIOR+'-verification.json'),zero=read(ZERO+'.json');
 const data=verified.auditInput,template={...verified.results.find(r=>r.id==='OC21-bf9bf45a7e60'),capacity:[21,21]};
 const seeds=['U7E-1f46d74c337f','U7E-3b1557bb9247'].map(id=>verified.results.find(r=>r.id===id));
 const sourceHashes=Object.fromEntries([__filename,PRIOR+'.json',PRIOR+'-verification.json',ZERO+'.json',
  path.join(ROOT,'tools/search_untoned_cr7e_v52.js'),path.join(ROOT,'tools/ckt_v4_model.js'),
  path.join(ROOT,'tools/ckt_v4_scheme_fixture.js'),path.join(ROOT,'tools/auxiliary_semantics.js'),
  path.join(ROOT,'research/ckt-v4-core/src/bin/score-untoned-v52-stream.rs'),
  path.join(WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),PROFILE].map(p=>[p,hash(p)]));
 const known=new Map([...Object.values(prior.states),...Object.values(zero.states),...verified.results].map(r=>[mappingKey(r),r]));
 let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;
 if(report)assert.deepEqual(report.sourceHashes,sourceHashes,'resume sources changed');
 report??={version:'untoned-cr7e-coupled-v52-1',sourceHashes,seeds:seeds.map(r=>r.id),policy:search.POLICY,reference:verified.reference,
  contract:{...prior.contract,fixedInitials:false,search:'complete single final and initial neighbors of both seeds; budget-repair initial perturbations; proxy-screened coupled and 2/3-step final exploration; finite heuristic'},
  knownStateCount:known.size,controls:verified.results.filter(r=>r.id.startsWith('OC21-')).map(({id,score,doubledScore})=>({id,score,doubledScore})),states:{},stages:[],completed:false};
 const seen=new Map(Object.values(report.states).map(r=>[mappingKey(r),r])),pending=new Map();
 const inspect=screening(data,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const workerCount=6;
 const workers=Array.from({length:workerCount},launch);await Promise.all(workers.map(w=>w.ready));
 const queues=workers.map(()=>Promise.resolve());let issued=0;
 const score=e=>{const i=issued++%workers.length,job=queues[i].then(()=>workers[i].score(e));queues[i]=job.catch(()=>{});return job;};
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 async function evaluate(row){
  const k=mappingKey(row);if(seen.has(k))return seen.get(k);if(known.has(k))return known.get(k);if(pending.has(k))return pending.get(k);
  if(!inspect(row))return null;
  const e=search.rebuild({...template,...row},data),audit=search.audit(e,data);assert.ok(legal(audit),'screening and canonical audit must agree');
  const job=(async()=>{const id='U7X-'+crypto.createHash('sha256').update(k).digest('hex').slice(0,12),s=await score({...e,id});
   const result={id,initialMap:e.initialMap,finalMap:e.finalMap,audit,score:s.score,doubledScore:s.doubledScore,parent:row.parent,mutation:row.mutation};
   seen.set(k,result);report.states[id]=result;
   if(seen.size%50===0){save();console.log(JSON.stringify({states:seen.size,best:Math.min(...[...seen.values()].map(r=>r.score)),best2:Math.min(...[...seen.values()].map(r=>r.doubledScore))}));}
   return result;})();pending.set(k,job);try{return await job;}finally{pending.delete(k);}
 }
 function fresh(rows){const unique=new Map();for(const r of rows){const k=mappingKey(r);if(!known.has(k)&&!seen.has(k)&&inspect(r))unique.set(k,r);}return [...unique.values()];}
 function select(rows,n){const candidates=fresh(rows).map(r=>({...r,...inspect(r,true)})),selected=new Map();
  for(const penalty of [0,150,300,600,1200])for(const r of [...candidates].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)).slice(0,n))selected.set(mappingKey(r),r);
  return {rows:[...selected.values()],legalCandidates:candidates.length};
 }
 async function stage(name,center,rows,screenCount){
  if(report.stages.some(s=>s.name===name&&s.center===center.id))return;
  const picked=screenCount?select(rows,screenCount):{rows:fresh(rows)},start=seen.size;
  console.log(JSON.stringify({stage:name,center:center.id,candidates:picked.rows.length,legalCandidates:picked.legalCandidates}));
  await Promise.all(picked.rows.map(r=>evaluate({...r,parent:center.id})));
  report.stages.push({name,center:center.id,legalCandidates:picked.legalCandidates,exactCandidates:picked.rows.length,newStates:seen.size-start});save();
 }
 try{
  for(const row of verified.results.filter(r=>r.id.startsWith('OC21-')||seeds.some(s=>s.id===r.id))){const s=await score(row);assert.ok(Math.abs(s.score-row.score)<1e-9);assert.ok(Math.abs(s.doubledScore-row.doubledScore)<1e-9);}
  // Finish the first ring instead of relying on the old proxy screen.
  for(const center of seeds){
   await stage('complete initial one-step neighbors',center,initialNeighbors(center));
   await stage('complete final one-step neighbors',center,search.neighbors(center).map(r=>({...r,initialMap:center.initialMap})));
  }
  for(const center of seeds){
   const rows=[];
   for(const restore of [['k'],['s'],['k','s']]){
    const initialMap={...center.initialMap};for(const h of restore)initialMap[h]=h.toUpperCase();
    const repaired={...center,initialMap};
    for(const r of initialNeighbors(repaired))rows.push({...r,mutation:`restore ${restore.join('/')} then ${r.mutation}`});
    for(const r of search.neighbors(repaired))rows.push({...r,initialMap,mutation:`restore ${restore.join('/')} then ${r.mutation}`});
   }
   // Three-onset cycles can traverse an invalid intermediate state while the final map remains legal.
   const hs=['l','r','zh','ch','sh','k','s'];
   for(let i=0;i<hs.length;i++)for(let j=i+1;j<hs.length;j++)for(let k=j+1;k<hs.length;k++)for(const reverse of [false,true]){
    const group=[hs[i],hs[j],hs[k]],initialMap={...center.initialMap};
    group.forEach((h,n)=>initialMap[h]=center.initialMap[group[(n+(reverse?2:1))%3]]);
    rows.push({initialMap,finalMap:center.finalMap,mutation:`initial 3-cycle ${group.join('/')} ${reverse?'reverse':'forward'}`});
   }
   await stage('budget-repair initial and final macros',center,rows,60);
  }
  const closed=new Set(report.stages.filter(s=>s.name==='coupled and multi-step neighborhood').map(s=>s.center));
  for(let round=closed.size;round<14&&seen.size<4600;round++){
   const all=[...seeds,...seen.values()],leaders=[...all].sort((a,b)=>a.score-b.score).slice(0,6).concat([...all].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,6));
   // Include initial-mutated centers to avoid the fixed-initial basin monopolizing expansion.
   const onsetLeaders=[...seen.values()].filter(r=>HEADS.some(h=>r.initialMap[h]!==seeds[0].initialMap[h]));
   leaders.push(...onsetLeaders.sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,3));
   const center=leaders.find(r=>!closed.has(r.id));if(!center)break;
   const inits=fresh(initialNeighbors(center)),finals=search.neighbors(center).map(r=>({...r,initialMap:center.initialMap}));
   const rows=[...inits,...finals];
   // Couple the best scalar-screened onsets with every one-step final mutation.
   const onsetScreen=select(inits,8).rows;
   for(const im of onsetScreen)for(const fm of finals)rows.push({initialMap:im.initialMap,finalMap:fm.finalMap,mutation:im.mutation+' + '+fm.mutation});
   let rng=0x7ec019+round;const rand=n=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)%n;};
   for(let i=0;i<5000;i++){
    const fm={...center.finalMap},steps=i%2+2;
    for(let j=0;j<steps;j++){const a=FINALS[rand(FINALS.length)],b=FINALS[rand(FINALS.length)];[fm[a],fm[b]]=[fm[b],fm[a]];}
    const im=i%4===0&&onsetScreen.length?onsetScreen[rand(onsetScreen.length)].initialMap:center.initialMap;
    rows.push({initialMap:im,finalMap:fm,mutation:`${steps} final swaps${im!==center.initialMap?' + initial perturbation':''}`});
   }
   await stage('coupled and multi-step neighborhood',center,rows,42);closed.add(center.id);
  }
  const rows=[...seeds,...seen.values()];report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,12);
  report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.completed=true;save();console.log(JSON.stringify({completed:true,states:seen.size,best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{for(const w of workers)w.child.stdin.end();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={mappingKey,legal,initialNeighbors,screening,PREFIX};
