'use strict';
const path=require('node:path'),readline=require('node:readline'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const {HEADS,FINALS,ALPHABET}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..');
async function pool(templates,count=6){
 const workers=Array.from({length:count},()=>{
  const child=spawn(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe'),[
   templates,path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')],{stdio:['pipe','pipe','inherit'],windowsHide:true});
  let pending,resolveReady,rejectReady,ended=false;
  const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
  const fail=e=>{rejectReady(e);pending?.reject(e);pending=null;};
  child.on('error',fail);child.on('exit',code=>{ended=true;if(pending)fail(Error('native exit '+code));});
  readline.createInterface({input:child.stdout}).on('line',line=>{try{const row=JSON.parse(line);if(row.ready)resolveReady();else{assert.ok(pending);const p=pending;pending=null;p.resolve(row);}}catch(e){fail(e);}});
  return {child,ready,score:e=>new Promise((resolve,reject)=>{if(pending||ended)return reject(Error('worker unavailable'));pending={resolve,reject};child.stdin.write(JSON.stringify({id:e.id,state:[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])].map(k=>ALPHABET.indexOf(k))})+'\n');})};
 });
 try{await Promise.all(workers.map(w=>w.ready));}catch(e){workers.forEach(w=>w.child.kill());throw e;}
 const queues=workers.map(()=>Promise.resolve());let issued=0;
 return {score:e=>{const i=issued++%count,job=queues[i].then(()=>workers[i].score(e));queues[i]=job.catch(()=>{});return job;},close:()=>workers.forEach(w=>w.child.stdin.end())};
}
module.exports={pool};
