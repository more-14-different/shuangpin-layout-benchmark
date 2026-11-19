'use strict';
// Cross axes selected by measured full CKT, then completely score the new leaders' rings.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),readline=require('node:readline');
const search=require('./search_untoned_cr7e_v52'),coupled=require('./search_untoned_cr7e_coupled');
const {HEADS,FINALS,ALPHABET}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),PREFIX=coupled.PREFIX;
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function launch(){
 const child=spawn(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe'),[
  path.join(ROOT,'research/.cache/untoned-cr7e-v52-20261119/templates.json'),
  path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),
  path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')],{stdio:['pipe','pipe','inherit'],windowsHide:true});
 let pending,resolveReady,rejectReady;const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
 const fail=e=>{rejectReady(e);pending?.reject(e);pending=null;};
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready)resolveReady();else{assert.ok(pending);const p=pending;pending=null;p.resolve(r);}}catch(e){fail(e);}});
 child.on('error',fail);child.on('exit',code=>{if(pending)fail(Error('native exit '+code));});
 return {child,ready,score:e=>new Promise((resolve,reject)=>{assert.ok(!pending);pending={resolve,reject};
  child.stdin.write(JSON.stringify({id:e.id,state:[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])].map(k=>ALPHABET.indexOf(k))})+'\n');})};
}
function topBoth(rows,n){return [...new Map(['score','doubledScore'].flatMap(field=>[...rows].sort((a,b)=>a[field]-b[field]).slice(0,n)).map(r=>[coupled.mappingKey(r),r])).values()];}
function mergeChanges(base,a,b){
 const out={...base};for(const k of Object.keys(base)){
  if(a[k]!==base[k]&&b[k]!==base[k]&&a[k]!==b[k])return null;
  out[k]=a[k]!==base[k]?a[k]:b[k];
 }return out;
}
async function main(){
 const report=read(PREFIX+'.json');assert.ok(report.completed);
 for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(hash(p),h,p);
 const prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52.json'));
 const verified=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 const zero=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-zero-n-v52.json'));
 const seeds=verified.results.filter(r=>report.seeds.includes(r.id)),data=verified.auditInput;
 const template={...verified.results.find(r=>r.id==='OC21-bf9bf45a7e60'),capacity:[21,21]};
 const archive=PREFIX+'-before-axis-combinations.json.gz';
 if(!report.axisCombinationExtension){
  fs.writeFileSync(archive,zlib.gzipSync(fs.readFileSync(PREFIX+'.json')));
  report.axisCombinationExtension={sourceHashes:{[__filename]:hash(__filename),[archive]:hash(archive)},completed:false};
 }
 for(const[p,h]of Object.entries(report.axisCombinationExtension.sourceHashes))assert.equal(hash(p),h,p);
 const initialMap=seeds[0].initialMap,initialKey=e=>HEADS.map(h=>e.initialMap[h]).join(''),finalKey=e=>FINALS.map(f=>e.finalMap[f]).join('');
 const known=new Map([...Object.values(prior.states),...Object.values(zero.states),...verified.results,...Object.values(report.states)].map(r=>[coupled.mappingKey(r),r]));
 const inspect=coupled.screening(data,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const workers=Array.from({length:6},launch);await Promise.all(workers.map(w=>w.ready));
 const queues=workers.map(()=>Promise.resolve());let issued=0;
 const score=e=>{const i=issued++%workers.length,job=queues[i].then(()=>workers[i].score(e));queues[i]=job.catch(()=>{});return job;};
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 async function stage(name,center,rows){
  if(report.stages.some(s=>s.name===name&&s.center===center))return;
  const unique=new Map();for(const r of rows){const k=coupled.mappingKey(r);if(!known.has(k)&&inspect(r))unique.set(k,r);}
  console.log(JSON.stringify({stage:name,center,candidates:unique.size}));
  await Promise.all([...unique.entries()].map(async([key,row])=>{
   const e=search.rebuild({...template,...row},data),audit=search.audit(e,data);assert.ok(coupled.legal(audit));
   const id='U7X-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await score({...e,id});
   const result={id,initialMap:e.initialMap,finalMap:e.finalMap,audit,score:s.score,doubledScore:s.doubledScore,parent:row.parent,mutation:row.mutation};
   known.set(key,result);report.states[id]=result;
   if(Object.keys(report.states).length%50===0){save();const rows=Object.values(report.states);console.log(JSON.stringify({states:rows.length,best:Math.min(...rows.map(r=>r.score)),best2:Math.min(...rows.map(r=>r.doubledScore))}));}
  }));
  report.stages.push({name,center,exactCandidates:unique.size,newStates:unique.size});save();
 }
 try{
  for(const c of verified.results.filter(r=>r.id==='OC21-e1f155973380')){const s=await score(c);assert.ok(Math.abs(s.score-c.score)<1e-9&&Math.abs(s.doubledScore-c.doubledScore)<1e-9);}
  const checkpoint=JSON.parse(zlib.gunzipSync(fs.readFileSync(archive))),values=Object.values(checkpoint.states);
  const seedFinals=new Set(seeds.map(finalKey));
  const onsets=topBoth(values.filter(r=>seedFinals.has(finalKey(r))&&initialKey(r)!==initialKey(seeds[0])),12);
  // A legal three-onset cycle plus s restoration bridges toward the known 21x21
  // onset family. Crossing that family with U7E finals tests a distinct basin edge.
  onsets.push(...verified.results.filter(r=>r.id.startsWith('OC21-')));
  const finals=topBoth([...seeds,...values.filter(r=>initialKey(r)===initialKey(seeds[0]))],12);
  const cross=[];
  for(const im of onsets)for(const fm of finals)cross.push({initialMap:im.initialMap,finalMap:fm.finalMap,parent:[im.id,fm.id],mutation:'measured initial × measured final axes'});
  await stage('measured CKT axis combinations','both U7E centers',cross);
  const merged=[];
  for(let i=0;i<onsets.length;i++)for(let j=i+1;j<onsets.length;j++){
   const im=mergeChanges(initialMap,onsets[i].initialMap,onsets[j].initialMap);if(!im)continue;
   for(const fm of finals)merged.push({initialMap:im,finalMap:fm.finalMap,parent:[onsets[i].id,onsets[j].id,fm.id],mutation:'two compatible measured initial changes × final axis'});
  }
  await stage('compatible double-initial and final axes','both U7E centers',merged);
  // Bounded complete polish: dynamically choose the best unexpanded 1x and 2x centers.
  const previousPolish=report.stages.filter(s=>s.name==='complete coupled leader initial/final ring').length;
  for(let round=previousPolish;round<2;round++){
   const closed=new Set(report.stages.filter(s=>s.name==='complete coupled leader initial/final ring').map(s=>s.center));
   const center=topBoth(Object.values(report.states),1).find(r=>!closed.has(r.id));if(!center)break;
   const rows=[...coupled.initialNeighbors(center),...search.neighbors(center).map(r=>({...r,initialMap:center.initialMap}))].map(r=>({...r,parent:center.id}));
   await stage('complete coupled leader initial/final ring',center.id,rows);
  }
  const rows=[...seeds,...Object.values(report.states)];report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.axisCombinationExtension.completed=true;save();console.log(JSON.stringify({completed:true,states:Object.keys(report.states).length,best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{for(const w of workers)w.child.stdin.end();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={mergeChanges,topBoth};
