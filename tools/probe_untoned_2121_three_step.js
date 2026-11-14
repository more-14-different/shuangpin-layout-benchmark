'use strict';
// Extend measured two-hop states by one real primitive step. Bounded selection.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const search=require('./search_untoned_production_v51');
const closure=require('./close_untoned_2121_local');
const {combine,delta,legal}=require('./probe_untoned_2121_two_step');
const ROOT=path.resolve(__dirname,'..'),NOTES=path.join(ROOT,'research/notes');
const SOURCE=path.join(NOTES,'2026-11-15-untoned-2121-two-step.json');
const OUT=path.join(NOTES,'2026-11-15-untoned-2121-three-step.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function launch(){
 const child=spawn(process.execPath,['--max-old-space-size=4096',path.join(ROOT,'tools/close_untoned_2121_local.js'),'--worker','1','--snow','D:/C2D/Documents/rime-snow-pinyin','--html',path.join(ROOT,'a7_CKT_R11.html'),'--fixture',path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'),'--seed',path.join(ROOT,'research/config/untoned-2121-local-closure-seed.json')],{windowsHide:true,stdio:['pipe','pipe','inherit']});
 let pending,resolveReady,rejectReady;const ready=new Promise((a,b)=>{resolveReady=a;rejectReady=b;});
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready)resolveReady(r);else if(pending){const p=pending;pending=null;p.resolve(r);}else throw Error('unexpected output');}catch(e){rejectReady(e);pending?.reject(e);}});
 child.on('error',e=>{rejectReady(e);pending?.reject(e);});child.on('exit',code=>{const e=Error('worker exited '+code);rejectReady(e);pending?.reject(e);});
 return {child,ready,score:row=>new Promise((resolve,reject)=>{if(pending)return reject(Error('worker busy'));pending={resolve,reject};child.stdin.write(JSON.stringify(row)+'\n');})};
}
async function main(){
 const two=read(SOURCE),closureFile=path.join(NOTES,'2026-11-14-untoned-2121-local-closure.json'),c=read(closureFile);
 if(!two.completed||hash(closureFile)!==two.sourceSha256)throw Error('invalid input certificate');
 for(const [p,h] of Object.entries(two.sourceHashes))if(hash(p)!==h)throw Error('source changed '+p);
 const fingerprint=crypto.createHash('sha256').update(hash(__filename)+hash(SOURCE)+hash(path.join(ROOT,'tools/probe_untoned_2121_two_step.js'))).digest('hex');
 const data=require('./score_completion_ckt_v4').loadPayload(path.join(ROOT,'a7_CKT_R11.html')),fixture=read(path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
 const template=data.entries.find(e=>e.id==='QZ-e8f37a0998f9'),base=two.base;
 const near=c.centers.at(-1).keys.map(k=>c.records[k]).filter(e=>e.score<base.score+.005).sort((a,b)=>a.score-b.score);
 const winner=[...two.results].sort((a,b)=>a.score-b.score)[0];
 let attempted=0,conflicts=0,invalidStep=0,illegal=0;
 const pool=new Map();
 for(const pair of two.results){
  const steps=new Set(closure.enumerateNeighborhood(pair).map(closure.layoutKey));
  for(const third of near){
   attempted++;const e=combine(base,pair,third);if(!e){conflicts++;continue;}
   const key=closure.layoutKey(e);if(!steps.has(key)){invalidStep++;continue;}
   const rebuilt=search.rebuild({...template,...e},data);if(!legal(rebuilt,data)){illegal++;continue;}
   const pd=delta(base,pair),td=delta(base,third),sharedKeys=[...new Set(pd.flatMap(x=>[x.from,x.to].filter(k=>td.some(y=>y.field===x.field&&(y.from===k||y.to===k)))))];
   const erg=search.ergonomics(rebuilt,data,fixture,()=>({upperMs:0}));delete erg.motor;
   const row={id:'TH21-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),capacity:e.capacity,tone:e.tone,initialMap:e.initialMap,finalMap:e.finalMap,
    pairId:pair.id,thirdId:third.id,path:[pair.parent,pair.id],fromTwoStepWinner:pair.id===winner.id,
    actualThirdStep:td.map(x=>`${x.field}:${x.t}(${pair[x.field][x.t]})→${x.to}`).join(' + '),
    sharedKeys,additivePrediction:pair.score+third.score-base.score,audit:search.audit(rebuilt,data),erg};
   const old=pool.get(key);
   if(!old||row.fromTwoStepWinner&&!old.fromTwoStepWinner||row.fromTwoStepWinner===old.fromTwoStepWinner&&row.additivePrediction<old.additivePrediction)pool.set(key,row);
  }
 }
 const ranked=[...pool.entries()].sort((a,b)=>a[1].additivePrediction-b[1].additivePrediction),chosen=new Map();
 const add=(rows,n)=>{for(const [k,r] of rows.slice(0,n)){if(chosen.size>=160)break;chosen.set(k,r);}};
 add(ranked.filter(([,r])=>r.fromTwoStepWinner),160);
 add(ranked.filter(([,r])=>r.sharedKeys.length),70);
 add([...ranked].sort((a,b)=>b[1].erg.mx-a[1].erg.mx),20);
 add([...ranked].sort((a,b)=>a[1].erg.rpMax-b[1].erg.rpMax||a[1].additivePrediction-b[1].additivePrediction),20);
 for(const [k,r] of ranked){if(chosen.size>=160)break;chosen.set(k,r);}
 const candidates=[...chosen.entries()],previous=fs.existsSync(OUT)?read(OUT):null;
 if(previous&&previous.fingerprint!==fingerprint)throw Error('resume fingerprint mismatch');
 const report=previous||{version:'untoned-2121-bounded-three-step-1',fingerprint,sourceSha256:hash(SOURCE),sourceHashes:two.sourceHashes,
  contract:two.contract,base,twoStepBest:winner,screen:{firstHopEntrances:near.length,twoHopParents:two.results.length,attempted,conflicts,invalidStep,illegal,uniquePool:pool.size,selected:candidates.length,winningPairExtensions:candidates.filter(([,r])=>r.fromTwoStepWinner).length},results:[],completed:false};
 const save=()=>{fs.writeFileSync(OUT+'.tmp',JSON.stringify(report,null,2));fs.renameSync(OUT+'.tmp',OUT);};save();console.log(JSON.stringify(report.screen));
 const known=new Map([...Object.entries(c.records),...two.results.map(r=>[closure.layoutKey(r),r])]);
 const jobs=[];
 for(const [k,r] of candidates){if(report.results.some(e=>e.id===r.id))continue;const old=known.get(k);if(old)report.results.push({...r,score:old.score,modes:old.modes,reused:true});else jobs.push(r);}save();
 const workers=[launch(),launch()];
 try{await Promise.all(workers.map(w=>w.ready));let cursor=0;
  await Promise.all(workers.map(async w=>{while(cursor<jobs.length){const row=jobs[cursor++],s=await w.score(row);if(s.id!==row.id||!Number.isFinite(s.score))throw Error('invalid score');report.results.push({...row,score:s.score,modes:s.modes,reused:false,seconds:s.seconds});save();console.log(JSON.stringify({done:report.results.length,total:candidates.length,thirdStep:row.actualThirdStep,score:s.score,beatsOneHop:s.score<base.score-1e-10,beatsTwoHop:s.score<winner.score-1e-10}));}}));
  report.completed=true;save();
 }finally{workers.forEach(w=>w.child.kill());}
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
