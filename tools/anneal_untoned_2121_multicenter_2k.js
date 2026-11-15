'use strict';
// Five exact-score chains, coarse/fine alternation, 400 new states each.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const search=require('./search_untoned_production_v51'),closure=require('./close_untoned_2121_local');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),NOTES=path.join(ROOT,'research/notes');
const OUT=path.join(NOTES,'2026-11-15-untoned-2121-anneal-2k.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function random(chain){let x=chain.rng>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;chain.rng=x>>>0;return chain.rng/4294967296;}
function pick(chain,items){return items[Math.floor(random(chain)*items.length)];}
function schedule(step){const cycle=Math.floor(step/100),index=step%100,coarse=index<30;return {cycle,phase:coarse?'coarse':'fine',temperature:coarse?.10*(.025/.10)**(index/29):.012*(.00015/.012)**((index-30)/69)};}
function primitive(row,chain,coarse){
 const field=random(chain)<.22?'initialMap':'finalMap',tokens=field==='initialMap'?HEADS:FINALS,map={...row[field]},a=pick(chain,tokens);
 const choices=coarse?['group-swap','group-move','cycle','swap','move']:['move','swap'];
 const kind=pick(chain,choices),before=JSON.stringify(map);let description;
 if(kind==='move'){const k=pick(chain,[...'BCDEFGHJKLMNPQRSTWXYZ']);description=`${field}:${a}(${map[a]})→${k}`;map[a]=k;}
 else if(kind==='swap'){const b=pick(chain,tokens),ka=map[a];description=`${field}:${a}(${ka})↔${b}(${map[b]})`;map[a]=map[b];map[b]=ka;}
 else if(kind==='group-swap'){
  const b=pick(chain,tokens),ka=map[a],kb=map[b];description=`${field}:groups ${ka}↔${kb}`;
  for(const t of tokens)if(map[t]===ka)map[t]=kb;else if(map[t]===kb)map[t]=ka;
 }else if(kind==='group-move'){
  const ka=map[a],kb=pick(chain,[...'BCDEFGHJKLMNPQRSTWXYZ']);description=`${field}:group ${ka}→${kb}`;for(const t of tokens)if(map[t]===ka)map[t]=kb;
 }else{
  const b=pick(chain,tokens),c=pick(chain,tokens);if(new Set([a,b,c]).size!==3)return null;
  description=`${field}:cycle ${a}/${b}/${c}`;[map[a],map[b],map[c]]=[map[c],map[a],map[b]];
 }
 return before===JSON.stringify(map)?null:{row:{...row,[field]:map},description};
}
function proposal(current,chain,coarse){
 let row={...current,initialMap:{...current.initialMap},finalMap:{...current.finalMap}},moves=[];
 const count=coarse?2+Math.floor(random(chain)*2):1;
 for(let i=0;i<count;i++){const p=primitive(row,chain,coarse);if(!p)continue;row=p.row;moves.push(p.description);}
 return moves.length?{row,moves}:null;
}
function legal(e,data){const a=search.audit(e,data);return a.valid&&a.M<=42&&a.D<=2&&a.V<=5&&a.branches===0&&!a.qz&&!a.zq&&[0,1].every(i=>new Set(data.base.map(([p])=>e.codeList[p][i])).size===21);}
const axes=[['score',-1],['mx',1],['homeS2',1],['homeFloor',1],['rpMax',-1]];
function dominates(a,b){let strict=false;for(const [name,sign] of axes){const av=(name==='score'?a.score:a.erg[name])*sign,bv=(name==='score'?b.score:b.erg[name])*sign;if(av<bv-1e-12)return false;if(av>bv+1e-12)strict=true;}return strict;}
function archiveInsert(archive,row){if(archive.some(e=>e.id===row.id||dominates(e,row)))return archive;return [...archive.filter(e=>!dominates(row,e)),row];}
function launch(){
 const child=spawn(process.execPath,['--max-old-space-size=4096',path.join(ROOT,'tools/close_untoned_2121_local.js'),'--worker','1','--snow','D:/C2D/Documents/rime-snow-pinyin','--html',path.join(ROOT,'a7_CKT_R11.html'),'--fixture',path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'),'--seed',path.join(ROOT,'research/config/untoned-2121-local-closure-seed.json')],{windowsHide:true,stdio:['pipe','pipe','inherit']});
 let pending,resolveReady,rejectReady;const ready=new Promise((a,b)=>{resolveReady=a;rejectReady=b;});
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready)resolveReady(r);else if(pending){const p=pending;pending=null;p.resolve(r);}else throw Error('unexpected score');}catch(e){rejectReady(e);pending?.reject(e);}});
 child.on('error',e=>{rejectReady(e);pending?.reject(e);});child.on('exit',code=>{const e=Error('worker exit '+code);rejectReady(e);pending?.reject(e);});
 return {child,ready,score:r=>new Promise((resolve,reject)=>{if(pending)return reject(Error('worker busy'));pending={resolve,reject};child.stdin.write(JSON.stringify(r)+'\n');})};
}
async function main(){
 const sourceNames=['2026-11-14-untoned-2121-local-closure.json','2026-11-15-untoned-2121-two-step.json','2026-11-15-untoned-2121-three-step.json','2026-11-15-untoned-2121-other-centers.json'];
 const sources=sourceNames.map(n=>path.join(NOTES,n)),[c,two,three,others]=sources.map(read);
 const OLD_ROOT='D:\\C2D\\Desktop\\Code\\Lua\\inputMethod\\shuangpin-layout-benchmark';
 const relocated=p=>p.startsWith(OLD_ROOT+'\\')?path.join(ROOT,p.slice(OLD_ROOT.length+1)):p;
 const sourceHashes={...Object.fromEntries(Object.entries(c.sourceHashes).map(([p,h])=>[relocated(p),h])),...Object.fromEntries([__filename,path.join(ROOT,'tools/probe_untoned_2121_two_step.js'),...sources].map(p=>[p,hash(p)]))};
 for(const [p,h] of Object.entries(sourceHashes))if(hash(p)!==h)throw Error('source changed '+p);
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify(sourceHashes)).digest('hex');
 const data=require('./score_completion_ckt_v4').loadPayload(path.join(ROOT,'a7_CKT_R11.html')),fixture=read(path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
 const template=data.entries.find(e=>e.id==='QZ-e8f37a0998f9');
 const seeds=[two.results.reduce((a,b)=>a.score<b.score?a:b),three.results.reduce((a,b)=>a.score<b.score?a:b),others.families.flatMap(f=>f.results).find(e=>e.id==='OC21-bf9bf45a7e60'),others.families.flatMap(f=>f.results).find(e=>e.id==='OC21-114d689c1c06'),{...template,score:9.56789806405906}];
 const compact=row=>{const e=search.rebuild({...template,...row,tone:row.tone||row.toneKeysByTone||'IVUAO'},data);if(!legal(e,data))throw Error('illegal seed');const erg=search.ergonomics(e,data,fixture,()=>({upperMs:0}));delete erg.motor;return {id:row.id,capacity:e.capacity,tone:e.tone,initialMap:e.initialMap,finalMap:e.finalMap,audit:search.audit(e,data),erg,score:row.score};};
 let report=fs.existsSync(OUT)?read(OUT):null;
 if(report&&report.fingerprint!==fingerprint){
  const pilotFile=path.join(ROOT,'research/config/untoned-2121-anneal-2k-pilot-runner.js');
  const prior=Object.fromEntries(Object.entries(report.sourceHashes).map(([p,h])=>[relocated(p),h]));
  const changed=Object.keys(sourceHashes).filter(p=>prior[p]!==sourceHashes[p]);
  if(report.calibration||changed.length!==1||changed[0]!==__filename||!fs.existsSync(pilotFile)||hash(pilotFile)!==prior[__filename])throw Error('resume contract changed');
  const ds=report.trajectory.filter(t=>t.phase==='coarse').map(t=>t.score-report.states[t.from].score).filter(d=>d>0).sort((a,b)=>a-b);
  report.calibration={afterNewScores:report.chains.reduce((s,c)=>s+c.newScores,0),pilotRunner:pilotFile,pilotSha256:hash(pilotFile),pilotFingerprint:report.fingerprint,pilotSourceHashes:report.sourceHashes,positiveCoarseMedian:ds[Math.floor(ds.length/2)],acceptedPilot:report.trajectory.filter(t=>t.accepted).length,reason:'pilot had zero accepted moves; calibrate coarse temperature to observed deltas',newCoarse:[.10,.025],newFine:[.012,.00015]};
  report.sourceHashes=sourceHashes;report.fingerprint=fingerprint;
  report.contract.coarseTemperature=[.10,.025];report.contract.fineTemperature=[.012,.00015];
  for(const chain of report.chains){chain.currentId=chain.bestId;chain.cycleStarted=undefined;}
 }
 if(!report){const seedRows=seeds.map(compact);report={version:'untoned-2121-coarse-fine-2k-1',fingerprint,sourceHashes,
  contract:{newScores:2000,chains:5,newScoresPerChain:400,cycles:4,coarsePerCycle:30,finePerCycle:70,coarseTemperature:[.018,.004],fineTemperature:[.003,.00015],M:42,D:2,V:5,capacity:[21,21],branches:0,qzEmpty:true,zqEmpty:true,policy:'fixed production v5.1; no auxiliary optimization',archiveAxes:axes,scope:'heuristic multi-center annealing; not a closure proof'},
  seeds:seedRows,chains:seedRows.map((e,i)=>({index:i,seedId:e.id,currentId:e.id,bestId:e.id,rng:(151115+(i+1)*104729)>>>0,newScores:0,transitions:0,rejections:0,legalAttempts:0})),states:Object.fromEntries(seedRows.map(e=>[e.id,e])),trajectory:[],archive:seedRows.reduce(archiveInsert,[]),completed:false};}
 const save=()=>{fs.writeFileSync(OUT+'.tmp',JSON.stringify(report,null,2));fs.renameSync(OUT+'.tmp',OUT);};
 const known=new Map();
 for(const r of [...Object.values(c.records),...two.results,...three.results,...others.families.flatMap(f=>[f.baseline,...f.results]),...report.seeds])known.set(closure.layoutKey(r),r);
 for(const r of Object.values(report.states))known.set(closure.layoutKey(r),r);
 const pending=new Map();
 const getScore=async(row,w,chain)=>{
  const key=closure.layoutKey(row);let old=known.get(key);if(old)return {value:old,isNew:false};
  if(pending.has(key))return {value:await pending.get(key),isNew:false};
  const job=(async()=>{const s=await w.score(row);if(s.id!==row.id||!Number.isFinite(s.score))throw Error('invalid scorer reply');const value={...row,score:s.score,modes:s.modes,seconds:s.seconds,newScore:true,scoredByChain:chain.index};known.set(key,value);return value;})();
  pending.set(key,job);try{return {value:await job,isNew:true};}finally{pending.delete(key);}
 };
 const workers=[launch(),launch()];
 try{
  await Promise.all(workers.map(w=>w.ready));
  for(let i=0;i<report.seeds.length;i++){const e=report.seeds[i],s=await workers[i%2].score(e);if(Math.abs(s.score-e.score)>1e-10)throw Error('seed mismatch '+e.id);}
  report.seedsVerified=true;save();console.log(JSON.stringify({ready:true,seeds:report.seeds.map(e=>({id:e.id,score:e.score})),done:report.chains.reduce((s,c)=>s+c.newScores,0)}));
  async function chainRun(chain,w){
   while(chain.newScores<400){
    const step=chain.newScores,phase=schedule(step);
    if(step%100===0&&chain.cycleStarted!==phase.cycle){chain.currentId=chain.bestId;chain.cycleStarted=phase.cycle;chain.restarted=chain.currentId;}
    const current=report.states[chain.currentId];let row,moves;
    for(let attempts=0;attempts<50000;attempts++){
     const p=proposal(current,chain,phase.phase==='coarse');if(!p)continue;chain.legalAttempts++;
     const e=search.rebuild({...template,...p.row},data);if(!legal(e,data)){chain.rejections++;continue;}
     if(closure.layoutKey(e)===closure.layoutKey(current))continue;
     const erg=search.ergonomics(e,data,fixture,()=>({upperMs:0}));delete erg.motor;
     row={id:'A2K-'+crypto.createHash('sha256').update(closure.layoutKey(e)).digest('hex').slice(0,16),capacity:e.capacity,tone:e.tone,initialMap:e.initialMap,finalMap:e.finalMap,audit:search.audit(e,data),erg};moves=p.moves;break;
    }
    if(!row)throw Error('proposal exhaustion');
    const {value,isNew}=await getScore(row,w,chain);
    // Historical rows can carry old IDs/descriptions; bind only their score and modes to this proposal.
    row={...row,score:value.score,modes:value.modes,seconds:isNew?value.seconds:undefined,newScore:isNew,scoredByChain:isNew?chain.index:undefined};
    if(!report.states[row.id])report.states[row.id]=row;
    const accepted=row.score<=current.score||random(chain)<Math.exp(Math.min(0,(current.score-row.score)/phase.temperature));
    chain.transitions++;
    report.trajectory.push({chain:chain.index,step,from:current.id,to:row.id,moves,...phase,accepted,newScore:isNew,score:row.score,rngAfter:chain.rng});
    if(accepted)chain.currentId=row.id;
    if(row.score<report.states[chain.bestId].score)chain.bestId=row.id;
    report.archive=archiveInsert(report.archive,report.states[row.id]);
    if(isNew)chain.newScores++;
    if(chain.transitions>50000)throw Error('too many cached transitions without completing budget');
    save();
    const done=report.chains.reduce((s,e)=>s+e.newScores,0);
    if(isNew&&(done%10===0||row.id===chain.bestId))console.log(JSON.stringify({done,total:2000,chain:chain.index,chainDone:chain.newScores,phase:phase.phase,score:row.score,accepted,best:report.states[chain.bestId].score,archive:report.archive.length}));
   }
  }
  await Promise.all(workers.map(async(w,i)=>{for(let j=i;j<5;j+=2)await chainRun(report.chains[j],w);}));
  if(report.chains.reduce((s,c)=>s+c.newScores,0)!==2000)throw Error('wrong new-score count');
  report.completed=true;save();console.log(JSON.stringify({completed:true,newScores:2000,archive:report.archive.length,best:Math.min(...Object.values(report.states).map(e=>e.score))}));
 }finally{workers.forEach(w=>w.child.kill());}
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={random,schedule,proposal,legal,dominates,archiveInsert};
