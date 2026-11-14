'use strict';
// Bounded two-step combinations; each path is checked against the real enumerator.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const search=require('./search_untoned_production_v51');
const closure=require('./close_untoned_2121_local');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'research/notes/2026-11-15-untoned-2121-two-step.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const SCORE_SOURCE=path.join(ROOT,'research/notes/2026-11-14-untoned-2121-local-closure.json');
function delta(base,e){return ['initialMap','finalMap'].flatMap(field=>Object.keys(base[field]).filter(t=>base[field][t]!==e[field][t]).map(t=>({field,t,from:base[field][t],to:e[field][t]})));}
function combine(base,a,b){
 const da=delta(base,a),db=delta(base,b);
 if(da.some(x=>db.some(y=>x.field===y.field&&x.t===y.t)))return null;
 const result={...base,initialMap:{...base.initialMap},finalMap:{...base.finalMap}};
 for(const x of [...da,...db])result[x.field][x.t]=x.to;
 return result;
}
function legal(e,data){const a=search.audit(e,data);return a.valid&&a.M<=42&&a.D<=2&&a.V<=5&&a.branches===0&&!a.qz&&!a.zq&&[0,1].every(i=>new Set(data.base.map(([p])=>e.codeList[p][i])).size===21);}
function worker(){
 const child=spawn(process.execPath,['--max-old-space-size=4096',path.join(ROOT,'tools/close_untoned_2121_local.js'),'--worker','1','--snow','D:/C2D/Documents/rime-snow-pinyin','--html',path.join(ROOT,'a7_CKT_R11.html'),'--fixture',path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'),'--seed',path.join(ROOT,'research/config/untoned-2121-local-closure-seed.json')],{windowsHide:true,stdio:['pipe','pipe','inherit']});
 let pending,readyResolve,readyReject;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready)readyResolve(r);else if(pending){const p=pending;pending=null;p.resolve(r);}else throw Error('unsolicited output');}catch(e){readyReject(e);pending?.reject(e);}});
 child.on('error',e=>{readyReject(e);pending?.reject(e);});child.on('exit',code=>{const e=Error('worker exited '+code);readyReject(e);pending?.reject(e);});
 return {child,ready,score:row=>new Promise((resolve,reject)=>{if(pending)return reject(Error('busy worker'));pending={resolve,reject};child.stdin.write(JSON.stringify(row)+'\n');})};
}
async function main(){
 const c=read(SCORE_SOURCE);for(const [p,h] of Object.entries(c.sourceHashes))if(hash(p)!==h)throw Error('source changed: '+p);
 const data=require('./score_completion_ckt_v4').loadPayload(path.join(ROOT,'a7_CKT_R11.html')),fixture=read(path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
 const template=data.entries.find(e=>e.id==='QZ-e8f37a0998f9');
 const base=Object.values(c.records).find(e=>e.id===c.bestId),last=c.centers.at(-1);
 const near=last.keys.map(k=>c.records[k]).filter(r=>r.score<base.score+.005).sort((a,b)=>a.score-b.score);
 const states=new Map(near.map(e=>[e.id,new Set(closure.enumerateNeighborhood(e).map(closure.layoutKey))]));
 const pool=new Map();let attempted=0,disjoint=0,validPath=0,rejected=0;
 for(let i=0;i<near.length;i++)for(let j=i+1;j<near.length;j++){
  attempted++;const a=near[i],b=near[j],e=combine(base,a,b);if(!e)continue;disjoint++;
  const key=closure.layoutKey(e);let first,second;
  if(states.get(a.id).has(key)){first=a;second=b;}else if(states.get(b.id).has(key)){first=b;second=a;}else continue;
  validPath++;const row=search.rebuild({...template,...e},data);if(!legal(row,data)){rejected++;continue;}
  const da=delta(base,a),db=delta(base,b),shared=[...new Set(da.flatMap(x=>[x.from,x.to].filter(k=>db.some(y=>y.field===x.field&&(y.from===k||y.to===k)))))];
  const zeroO=[...da,...db].some(x=>x.field==='initialMap'&&x.t==='O');
  const item={id:'T21-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),capacity:e.capacity,tone:e.tone,initialMap:e.initialMap,finalMap:e.finalMap,
   mutation:first.mutation+' THEN '+second.mutation,parent:first.id,legs:[{id:first.id,mutation:first.mutation,score:first.score},{id:second.id,mutation:second.mutation,score:second.score}],sharedKeys:shared,zeroO,
   additivePrediction:a.score+b.score-base.score,audit:search.audit(row,data),erg:search.ergonomics(row,data,fixture,()=>({upperMs:0}))};
  delete item.erg.motor;
  if(!pool.has(key)||item.additivePrediction<pool.get(key).additivePrediction)pool.set(key,item);
 }
 const ranked=[...pool.entries()].sort((a,b)=>a[1].additivePrediction-b[1].additivePrediction);
 const chosen=new Map();const add=(rows,n)=>{for(const [k,r] of rows.slice(0,n))chosen.set(k,r);};
 add(ranked.filter(([,r])=>r.zeroO),36);add(ranked.filter(([,r])=>r.sharedKeys.length),100);
 add([...ranked].sort((a,b)=>b[1].erg.mx-a[1].erg.mx),20);
 for(const [k,r] of ranked){if(chosen.size>=160)break;chosen.set(k,r);}
 const candidates=[...chosen.entries()];
 const fingerprint=crypto.createHash('sha256').update(hash(__filename)+hash(SCORE_SOURCE)).digest('hex');
 const previous=fs.existsSync(OUT)?read(OUT):null;if(previous&&previous.fingerprint!==fingerprint)throw Error('resume fingerprint differs');
 const report=previous||{version:'untoned-2121-bounded-two-step-1',fingerprint,sourceSha256:hash(SCORE_SOURCE),sourceHashes:c.sourceHashes,
  contract:{M:42,D:2,V:5,branches:0,capacity:[21,21],qzEmpty:true,zqEmpty:true,scope:'disjoint token changes from 36 near neighbors; each path validated by full one-hop enumerator; fixed production policies'},
  base,screen:{near:near.length,attempted,disjoint,validPath,rejected,uniquePool:pool.size,selected:candidates.length},results:[],completed:false};
 const save=()=>{const temp=OUT+'.tmp';fs.writeFileSync(temp,JSON.stringify(report,null,2));fs.renameSync(temp,OUT);};save();console.log(JSON.stringify(report.screen));
 const jobs=[];for(const [k,r] of candidates){if(report.results.some(x=>x.id===r.id))continue;const old=c.records[k];if(old){report.results.push({...r,score:old.score,modes:old.modes,reused:true});}else jobs.push(r);}save();
 const workers=[worker(),worker()];
 try{await Promise.all(workers.map(w=>w.ready));let cursor=0;
 await Promise.all(workers.map(async w=>{while(cursor<jobs.length){const row=jobs[cursor++],s=await w.score(row);if(s.id!==row.id||!Number.isFinite(s.score))throw Error('score mismatch');report.results.push({...row,score:s.score,modes:s.modes,seconds:s.seconds,reused:false});save();console.log(JSON.stringify({done:report.results.length,total:candidates.length,mutation:row.mutation,score:s.score,improved:s.score<base.score-1e-10}));}}));
 report.completed=true;save();
 }finally{workers.forEach(w=>w.child.kill());}
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={delta,combine,legal};
