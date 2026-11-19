'use strict';
// Combine measured improving final mutations, rather than extrapolating additive gains.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),readline=require('node:readline');
const search=require('./search_untoned_cr7e_v52'),coupled=require('./search_untoned_cr7e_coupled');
const {mergeChanges,topBoth}=require('./extend_untoned_cr7e_coupled');
const {HEADS,FINALS,ALPHABET}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),PREFIX=coupled.PREFIX;
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const report=read(PREFIX+'.json');assert.ok(report.completed&&report.axisCombinationExtension.completed);
 const archive=PREFIX+'-before-final-pairs.json.gz';
 if(!report.finalPairExtension){fs.writeFileSync(archive,zlib.gzipSync(fs.readFileSync(PREFIX+'.json')));
  report.finalPairExtension={sourceHashes:{[__filename]:hash(__filename),[archive]:hash(archive)},completed:false};}
 for(const mapping of [report.sourceHashes,report.axisCombinationExtension.sourceHashes,report.finalPairExtension.sourceHashes])for(const[p,h]of Object.entries(mapping))assert.equal(hash(p),h,p);
 const prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 const original=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52.json'));
 const zero=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-zero-n-v52.json'));
 const checkpoint=JSON.parse(zlib.gunzipSync(fs.readFileSync(archive))),data=prior.auditInput;
 const template={...prior.results.find(r=>r.id==='OC21-bf9bf45a7e60'),capacity:[21,21]};
 const known=new Map([...Object.values(original.states),...Object.values(zero.states),...prior.results,...Object.values(report.states)].map(r=>[coupled.mappingKey(r),r]));
 const inspect=coupled.screening(data,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const workers=Array.from({length:6},()=>{
  const child=spawn(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe'),[
   path.join(ROOT,'research/.cache/untoned-cr7e-v52-20261119/templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),
   path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')],{stdio:['pipe','pipe','inherit'],windowsHide:true});
  let pending,readyResolve,readyReject;const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
  const fail=e=>{readyReject(e);pending?.reject(e);pending=null;};
  child.on('error',fail);child.on('exit',code=>{if(pending)fail(Error('native exit '+code));});
  readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready)readyResolve();else{assert.ok(pending);const p=pending;pending=null;p.resolve(r);}}catch(e){fail(e);}});
  return {child,ready,score:e=>new Promise((resolve,reject)=>{assert.ok(!pending);pending={resolve,reject};child.stdin.write(JSON.stringify({id:e.id,state:[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])].map(k=>ALPHABET.indexOf(k))})+'\n');})};
 });
 await Promise.all(workers.map(w=>w.ready));const queues=workers.map(()=>Promise.resolve());let issued=0;
 const score=e=>{const i=issued++%workers.length,job=queues[i].then(()=>workers[i].score(e));queues[i]=job.catch(()=>{});return job;};
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 try{
  const centers=checkpoint.stages.filter(s=>s.name==='complete coupled leader initial/final ring').map(s=>checkpoint.states[s.center]);
  for(const center of centers){
   if(report.stages.some(s=>s.name==='measured final pairs and triples'&&s.center===center.id))continue;
   const values=Object.values(checkpoint.states),im=HEADS.map(h=>center.initialMap[h]).join('');
   const improving=values.filter(r=>r.parent===center.id&&HEADS.map(h=>r.initialMap[h]).join('')===im&&(r.score<center.score||r.doubledScore<center.doubledScore));
   const picked=topBoth(improving,12),rows=new Map();
   const add=(map,parents,n)=>{if(!map)return;const r={initialMap:center.initialMap,finalMap:map,parent:parents,mutation:`${n} compatible measured final changes from ${center.id}`},key=coupled.mappingKey(r);if(!known.has(key)&&inspect(r))rows.set(key,r);};
   for(let i=0;i<picked.length;i++)for(let j=i+1;j<picked.length;j++){
    const merged=mergeChanges(center.finalMap,picked[i].finalMap,picked[j].finalMap);add(merged,[picked[i].id,picked[j].id],2);
    if(merged)for(let k=j+1;k<picked.length;k++)add(mergeChanges(center.finalMap,merged,picked[k].finalMap),[picked[i].id,picked[j].id,picked[k].id],3);
   }
   console.log(JSON.stringify({stage:'measured final pairs and triples',center:center.id,improvingSingleChanges:picked.length,candidates:rows.size}));
   await Promise.all([...rows.entries()].map(async([key,row])=>{const e=search.rebuild({...template,...row},data),audit=search.audit(e,data);assert.ok(coupled.legal(audit));
    const id='U7X-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await score({...e,id});
    const result={id,initialMap:e.initialMap,finalMap:e.finalMap,audit,score:s.score,doubledScore:s.doubledScore,parent:row.parent,mutation:row.mutation};
    known.set(key,result);report.states[id]=result;}));
   report.stages.push({name:'measured final pairs and triples',center:center.id,improvingSingleChanges:picked.length,exactCandidates:rows.size,newStates:rows.size});save();
  }
  const rows=Object.values(report.states);report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.finalPairExtension.completed=true;save();console.log(JSON.stringify({completed:true,states:rows.length,best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{for(const w of workers)w.child.stdin.end();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
