'use strict';
// Independent bounded screens around two ergonomic centers and a historic basin.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const search=require('./search_untoned_production_v51'),closure=require('./close_untoned_2121_local');
const model=require('./ckt_v4_model'),{legal}=require('./probe_untoned_2121_two_step');
const ROOT=path.resolve(__dirname,'..'),NOTES=path.join(ROOT,'research/notes');
const OUT=path.join(NOTES,'2026-11-15-untoned-2121-other-centers.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function launch(){
 const child=spawn(process.execPath,['--max-old-space-size=4096',path.join(ROOT,'tools/close_untoned_2121_local.js'),'--worker','1','--snow','D:/C2D/Documents/rime-snow-pinyin','--html',path.join(ROOT,'a7_CKT_R11.html'),'--fixture',path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'),'--seed',path.join(ROOT,'research/config/untoned-2121-local-closure-seed.json')],{windowsHide:true,stdio:['pipe','pipe','inherit']});
 let pending,resolveReady,rejectReady;const ready=new Promise((a,b)=>{resolveReady=a;rejectReady=b;});
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready)resolveReady(r);else if(pending){const p=pending;pending=null;p.resolve(r);}else throw Error('unexpected worker output');}catch(e){rejectReady(e);pending?.reject(e);}});
 child.on('error',e=>{rejectReady(e);pending?.reject(e);});child.on('exit',code=>{const e=Error('worker exit '+code);rejectReady(e);pending?.reject(e);});
 return {child,ready,score:row=>new Promise((resolve,reject)=>{if(pending)return reject(Error('busy'));pending={resolve,reject};child.stdin.write(JSON.stringify(row)+'\n');})};
}
async function main(){
 const crossPath=path.join(NOTES,'2026-11-14-untoned-2121-cross.json'),historyPath=path.join(NOTES,'2026-11-14-untoned-2121-v51-partial.json');
 const cross=read(crossPath),history=read(historyPath),c=read(path.join(NOTES,'2026-11-14-untoned-2121-local-closure.json'));
 for(const [p,h] of Object.entries(c.sourceHashes))if(hash(p)!==h)throw Error('source changed '+p);
 const fingerprint=crypto.createHash('sha256').update([__filename,crossPath,historyPath].map(hash).join('')).digest('hex');
 const previous=fs.existsSync(OUT)?read(OUT):null;if(previous&&previous.fingerprint!==fingerprint)throw Error('cache mismatch');
 const data=require('./score_completion_ckt_v4').loadPayload(path.join(ROOT,'a7_CKT_R11.html')),fixture=read(path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
 const snapshot=read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')),motor=model.projectedMotor(model.upstreamMotor(snapshot),snapshot.keys,data.ckt.calibration.extension_maps);
 const template=data.entries.find(e=>e.id==='QZ-e8f37a0998f9');
 const centers=[...cross.families[0].results.filter(e=>['CROSS-12','CROSS-24'].includes(e.id)),history.families[0].results.find(e=>e.id==='QZ-c6f1cd673f93')];
 const report=previous||{version:'untoned-2121-other-centers-1',fingerprint,sourceHashes:c.sourceHashes,contract:{M:42,D:2,V:5,capacity:[21,21],qzEmpty:true,zqEmpty:true,policy:'fixed production native v5.1'},families:[],completed:false};
 const save=()=>{fs.writeFileSync(OUT+'.tmp',JSON.stringify(report,null,2));fs.renameSync(OUT+'.tmp',OUT);};
 if(!previous)for(const center of centers){
  if(!center)throw Error('missing center');
  const base=search.rebuild({...template,...center,tone:center.toneKeysByTone||'IVUAO'},data);
  base.audit=search.audit(base,data);if(!legal(base,data))throw Error('invalid center');
  const proxy=e=>{let sum=0,total=0;for(const [p,w] of data.base){sum+=w*motor(e.codeList[p]).upperMs;total+=w;}return sum/total;};
  const erg=search.ergonomics(base,data,fixture,motor),proposals=[];
  for(const raw of closure.enumerateNeighborhood(base)){
   const e=search.rebuild(raw,data);if(!legal(e,data))continue;
   const key=closure.layoutKey(e),r={id:'OC21-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),parent:center.id,mutation:raw.mutation,capacity:base.capacity,tone:base.tone,initialMap:e.initialMap,finalMap:e.finalMap,audit:search.audit(e,data),erg:search.ergonomics(e,data,fixture,()=>({upperMs:0})),proxy:proxy(e)};
   delete r.erg.motor;proposals.push(r);
  }
  const ranked=[...proposals].sort((a,b)=>a.proxy-b.proxy),near=[...proposals].sort((a,b)=>Math.abs(a.proxy-erg.motor)-Math.abs(b.proxy-erg.motor));
  const chosen=new Map(),add=(rows,n)=>{for(const r of rows.slice(0,n)){if(chosen.size<24)chosen.set(r.id,r);}};
  add(ranked,6);add(near,8);add(near.filter(e=>e.mutation.startsWith('initialMap:')),4);
  add([...proposals].sort((a,b)=>b.erg.mx-a.erg.mx),4);add(near.filter(e=>e.mutation.includes('group')),2);
  for(const r of near){if(chosen.size>=24)break;chosen.set(r.id,r);}
  const baseRow={id:center.id,mutation:'center baseline',capacity:base.capacity,tone:base.tone,initialMap:base.initialMap,finalMap:base.finalMap,audit:base.audit,erg,score:center.score};
  report.families.push({id:center.id,expectedScore:center.score,baseline:baseRow,screen:{legal:proposals.length,selected:chosen.size,method:'6 motor-lowest; 8 motor-nearest; 4 initial; 4 moving-hand; 2 group; fill to24'},candidates:[...chosen.values()],results:[]});
 }save();console.log(JSON.stringify(report.families.map(f=>({id:f.id,...f.screen}))));
 const jobs=[];
 for(const f of report.families){if(!f.baselineVerified)jobs.push({family:f,row:f.baseline,baseline:true});for(const row of f.candidates)if(!f.results.some(e=>e.id===row.id))jobs.push({family:f,row,baseline:false});}
 const workers=[launch(),launch()];
 try{await Promise.all(workers.map(w=>w.ready));let cursor=0,done=0;
  await Promise.all(workers.map(async w=>{while(cursor<jobs.length){const job=jobs[cursor++],s=await w.score(job.row);if(s.id!==job.row.id||!Number.isFinite(s.score))throw Error('invalid score');if(job.baseline){if(Math.abs(s.score-job.family.expectedScore)>1e-10)throw Error('baseline mismatch');job.family.baselineVerified=true;job.family.baselineModes=s.modes;}else job.family.results.push({...job.row,score:s.score,modes:s.modes,seconds:s.seconds});save();done++;console.log(JSON.stringify({done,total:jobs.length,center:job.family.id,score:s.score,mutation:job.row.mutation,improved:!job.baseline&&s.score<job.family.expectedScore-1e-10}));}}));
  report.completed=true;save();
 }finally{workers.forEach(w=>w.child.kill());}
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
