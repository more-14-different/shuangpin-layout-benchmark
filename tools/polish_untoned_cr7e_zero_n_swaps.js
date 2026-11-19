'use strict';
// Complete single-final and whole-group swap neighborhoods of two N centers.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const base=require('./search_untoned_cr7e_v52'),zero=require('./search_untoned_cr7e_zero_n');
const {HEADS,FINALS,ALPHABET}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),WORK=path.join(ROOT,'research/.cache/untoned-cr7e-v52-20261119');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const file=zero.PREFIX+'.json',report=JSON.parse(fs.readFileSync(file));assert.ok(report.completed,'finish the screened search first');
 const original=path.join(ROOT,'research/.cache/untoned-cr7e-v52-20261119/zero-n-before-exact-swaps.json');
 if(!fs.existsSync(original))fs.copyFileSync(file,original);
 const verified=JSON.parse(fs.readFileSync(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json')));
 const template={...verified.results[0],capacity:[21,21]},data=verified.auditInput;
 const snapshot=JSON.parse(fs.readFileSync(original));
 const centers=[...new Map([snapshot.bestDefault[0],snapshot.bestDoubled[0]].map(r=>[r.id,r])).values()];
 report.exactSwapPolish={sourceHashes:{[__filename]:hash(__filename),[original]:hash(original)},centers:centers.map(r=>r.id),completed:false};
 const known=new Map(Object.values(report.states).map(r=>[zero.mappingKey(r),r]));
 const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
 const children=[0,1].map(()=>spawn(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe'),[
  path.join(WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),
  path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')],{stdio:['pipe','pipe','inherit'],windowsHide:true}));
 const workers=children.map(child=>{let pending,readyResolve,readyReject;const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
  readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready)readyResolve();else{const p=pending;pending=null;p.resolve(r);}}catch(e){readyReject(e);pending?.reject(e);}});
  child.on('error',e=>{readyReject(e);pending?.reject(e);});child.on('exit',code=>{if(pending)pending.reject(Error('native scorer exited '+code));});
  return{ready,score:e=>new Promise((resolve,reject)=>{assert.ok(!pending);pending={resolve,reject};child.stdin.write(JSON.stringify({id:e.id,state:[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])].map(k=>ALPHABET.indexOf(k))})+'\n');})};});
 await Promise.all(workers.map(w=>w.ready));
 try{
  for(const center of centers){
   if(report.stages.some(s=>s.name==='complete single-final and whole-group swaps'&&s.center===center.id))continue;
   const variants=base.neighbors(center).filter(r=>r.mutation.startsWith('swap ')||r.mutation.startsWith('groups '));
   const legal=new Map();for(const r of variants){const e=base.rebuild({...template,...r,initialMap:report.initialMap},data),a=base.audit(e,data);if(zero.legal(a))legal.set(zero.mappingKey(e),{...e,audit:a,mutation:r.mutation});}
   const todo=[...legal.values()].filter(e=>!known.has(zero.mappingKey(e))),start=known.size;let index=0;
   console.log('complete swap center',center.id,'legal',legal.size,'new',todo.length);
   await Promise.all(workers.map(async worker=>{while(index<todo.length){const e=todo[index++],key=zero.mappingKey(e),id='U7N-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),score=await worker.score({...e,id});
    const r={id,initialMap:report.initialMap,finalMap:e.finalMap,audit:e.audit,score:score.score,doubledScore:score.doubledScore,parent:center.id,mutation:e.mutation};
    known.set(key,r);report.states[id]=r;if(known.size%50===0){save();console.log('exact swap states',known.size);}
   }}));
   assert.ok([...legal.keys()].every(k=>known.has(k)),'incomplete swap neighborhood');
   report.stages.push({name:'complete single-final and whole-group swaps',center:center.id,legalDistinctNeighbors:legal.size,newStates:known.size-start});save();
  }
  const rows=[...known.values()];report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,10);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,10);
  report.exactSwapPolish.completed=true;report.completed=true;save();console.log(JSON.stringify({completed:true,count:rows.length,best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{for(const child of children)child.stdin.end();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
