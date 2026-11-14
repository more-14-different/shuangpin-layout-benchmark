#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const search=require('./search_untoned_production_v51');
const closure=require('./close_untoned_2126_double_empty');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const fileHash=p=>hash(fs.readFileSync(p));
const letter=i=>String.fromCharCode(65+i);
const stateKey=s=>Buffer.from(s).toString('base64');
function compactState(e) {return Uint8Array.from([...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])],k=>k.charCodeAt(0)-65);}
function expandState(s) {return {capacity:[21,26],tone:'IEUAO',initialMap:Object.fromEntries(HEADS.map((h,i)=>[h,letter(s[i])])),finalMap:Object.fromEntries(FINALS.map((f,i)=>[f,letter(s[27+i])]))};}
function operations() {
  const out=[];
  for(const [offset,names] of [[0,HEADS],[27,FINALS]]) {
    const field=offset?'final':'initial';
    for(let a=0;a<names.length;a++)for(let b=a+1;b<names.length;b++)out.push({kind:'token-swap',indices:[a+offset,b+offset],label:`${field}:${names[a]}↔${names[b]}`});
    for(let a=0;a<26;a++)for(let b=a+1;b<26;b++)out.push({kind:'key-swap',offset,size:names.length,a,b,label:`${field}:key groups ${letter(a)}↔${letter(b)}`});
    for(let i=0;i<names.length;i++)for(let to=0;to<26;to++)out.push({kind:'token-move',indices:[offset+i],to,label:`${field}:${names[i]}→${letter(to)}`});
    for(let a=0;a<26;a++)for(let to=0;to<26;to++)if(a!==to)out.push({kind:'group-move',offset,size:names.length,a,to,label:`${field}:group ${letter(a)}→${letter(to)}`});
  }
  for(const family of [['A','E','O'],['Y','YU']])for(let to=0;to<26;to++)out.push({kind:'token-move',indices:family.map(h=>HEADS.indexOf(h)),to,label:`initial:${family.join('/')}→${letter(to)}`});
  return out;
}
function applyOperation(state,op) {
  const result=state.slice();
  if(op.kind==='token-swap') {const [a,b]=op.indices;[result[a],result[b]]=[result[b],result[a]];}
  else if(op.kind==='token-move')for(const i of op.indices)result[i]=op.to;
  else for(let i=op.offset;i<op.offset+op.size;i++) {
    if(result[i]===op.a)result[i]=op.kind==='key-swap'?op.b:op.to;
    else if(op.kind==='key-swap'&&result[i]===op.b)result[i]=op.a;
  }
  return result;
}
function makeGuard(data) {
  const pairs=data.base.map(([p])=>splitPinyin(data.pinyin[p]));
  const ordinary=HEADS.map((h,i)=>h.length===1&&i<21?i:-1).filter(i=>i>=0);
  const initialIdentity=HEADS.map(h=>h.length===1?h.toUpperCase().charCodeAt(0)-65:-1);
  const finalIdentity=FINALS.map(f=>f.length===1?f.toUpperCase().charCodeAt(0)-65:-1);
  const vowels=[...'aeiou'].map(f=>27+FINALS.indexOf(f));
  const seen=new Uint32Array(26),reserved=[...'IEUAO'].reduce((m,k)=>m|(1<<(k.charCodeAt(0)-65)),0);
  return state=> {
    if(state[25]!==state[26])return false;
    let d=0,memory=3;
    for(const i of ordinary)if(state[i]!==initialIdentity[i]){d++;memory++;}
    if(d>3)return false;
    for(let i=0;i<27;i++)if((reserved&(1<<state[i]))!==0)return false;
    memory+=new Set([state[21],state[22],state[23]]).size+Number(state[24]!==22)+Number(state[25]!==24);
    for(let i=0;i<35;i++)memory+=Number(state[27+i]!==finalIdentity[i]);
    if(memory>40||vowels.filter(i=>state[i]!==finalIdentity[i-27]).length>1)return false;
    seen.fill(0);
    for(const [h,f] of pairs) {
      const a=state[h],b=state[27+f],mask=1<<b;
      if((a===16&&b===25)||(a===25&&b===16)||(seen[a]&mask)!==0)return false;
      seen[a]|=mask;
    }
    return true;
  };
}
function distance(a,b) {let n=0;for(let i=0;i<62;i++)n+=Number(a[i]!==b[i]);return n;}
function random(seed) {let v=seed>>>0;return ()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};}
function atomicSave(file,value) {
  const temp=file+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');
  for(let i=0;;i++){try{fs.renameSync(temp,file);return;}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||i>=40)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}
}
function launchWorker(args) {
  const child=spawn(process.execPath,['--max-old-space-size=4096',path.join(ROOT,'tools/close_untoned_2126_double_empty.js'),'--worker','1','--snow',args.snow,'--html',args.html,'--fixture',args.fixture,'--seed',args.seed],{cwd:ROOT,stdio:['pipe','pipe','inherit'],windowsHide:true});
  let pending=null,resolveReady,rejectReady;const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
  readline.createInterface({input:child.stdout}).on('line',line=>{try{const value=JSON.parse(line);if(value.ready)resolveReady(value);else if(pending){const p=pending;pending=null;p.resolve(value);}else throw Error('unsolicited score');}catch(e){rejectReady(e);pending?.reject(e);}});
  child.on('error',e=>{rejectReady(e);pending?.reject(e);});
  child.on('exit',code=>{const e=Error(`native worker exited ${code}`);rejectReady(e);pending?.reject(e);});
  return {child,ready,score:row=>new Promise((resolve,reject)=>{if(pending)return reject(Error('worker busy'));pending={resolve,reject};child.stdin.write(JSON.stringify(row)+'\n');})};
}
function selectPool(pool,limit,anchor,kind) {
  const selected=new Map();
  const take=(list,n,why)=>{for(const r of list){if(selected.size>=limit)break;if(!selected.has(r.key)){selected.set(r.key,{...r,selectedBy:why});if(--n<=0)break;}}};
  const by=(key,desc=false)=>[...pool].sort((a,b)=>(a[key]-b[key])*(desc?-1:1)||a.key.localeCompare(b.key));
  take(by('forecast'),Math.ceil(limit*.4),'additive-single-step-forecast');
  take(by('motor'),Math.ceil(limit*.25),'two-key-motor');
  take([...pool].sort((a,b)=>b.erg.mx-a.erg.mx||a.forecast-b.forecast),Math.ceil(limit*.1),'moving-hand');
  const diverse=[...pool].sort((a,b)=>a.forecast-b.forecast||a.motor-b.motor);
  for(const row of diverse) {
    if(selected.size>=Math.floor(limit*.9))break;
    if([...selected.values()].every(other=>distance(row.state,other.state)>=4))take([row],1,'layout-diversity');
  }
  const rng=random(kind==='local'?411426:411427);
  take([...pool].sort((a,b)=>a.motor-b.motor).slice(0,Math.max(limit*8,100)).map(r=>({...r,randomRank:rng()})).sort((a,b)=>a.randomRank-b.randomRank),limit-selected.size,'seeded-exploration');
  take(by('motor'),limit-selected.size,'remaining-motor');
  return [...selected.values()].map(r=>({...r,state:[...r.state],distance:distance(r.state,anchor)}));
}
function localPool(anchor,known,guard,ops) {
  const anchorKey=stateKey(anchor),baseScore=known.get(anchorKey).score;
  const first=new Map();
  for(const op of ops) {const state=applyOperation(anchor,op),key=stateKey(state);if(key!==anchorKey&&!first.has(key))first.set(key,{op,state,key});}
  const singles=new Map(ops.map(op=>[op,known.get(stateKey(applyOperation(anchor,op)))?.score]));
  const seen=new Set(known.keys()),pool=[];let pairs=0,legalEndpoints=0,illegalIntermediate=0;
  for(const a of first.values()) {
    const firstLegal=guard(a.state),scoreA=known.get(a.key)?.score;
    for(const b of ops) {
      pairs++;const state=applyOperation(a.state,b);if(!guard(state))continue;legalEndpoints++;
      const key=stateKey(state);if(seen.has(key))continue;seen.add(key);
      if(!firstLegal)illegalIntermediate++;
      const scoreB=singles.get(b);
      pool.push({state,key,mutation:`${a.op.label}; ${b.label}`,intermediateLegal:firstLegal,
        intermediateScore:scoreA??null,forecast:Number.isFinite(scoreA)&&Number.isFinite(scoreB)?scoreA+scoreB-baseScore:1000});
    }
  }
  return {pool,stats:{primitiveOperations:ops.length,firstStates:first.size,orderedPairsVisited:pairs,legalEndpointsBeforeDedup:legalEndpoints,uniqueNewEndpoints:pool.length,viaIllegalIntermediate:illegalIntermediate}};
}
function farPool(anchor,known,guard,ops,data) {
  const rng=random(202611141),seeds=[{state:anchor,source:'current basin'}];
  for(const file of ['research/milestones/m40-d3/m40-d3-pareto-frontier-20261031.json','research/milestones/m40-d3-v2/m40-d3-v2-pareto-frontier-20261108.json']) {
    const archive=read(path.join(ROOT,file));
    for(const row of [...archive.top50Pareto,...archive.top20ParetoV0]) {
      let state=compactState(search.decodeState(row.stateKey,data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED')));
      const order=Array.from({length:62},(_,i)=>i).sort(()=>rng()-.5);
      while(!guard(state)&&order.length) {const i=order.pop();state[i]=anchor[i];if(i===25||i===26){state[25]=anchor[25];state[26]=anchor[26];}}
      if(guard(state)&&distance(state,anchor)>=4)seeds.push({state,source:`repaired historical ${file} rank ${row.rank}`});
    }
  }
  for(const row of known.values()) {const state=compactState(row);if(distance(state,anchor)>=4&&guard(state))seeds.push({state,source:`existing state ${row.id}`});}
  const seen=new Set(known.keys()),pool=[];let acceptedSteps=0,attemptedSteps=0;
  for(let walk=0;walk<8000;walk++) {
    const seed=seeds[Math.floor(rng()*seeds.length)];let state=seed.state.slice();
    const steps=4+(walk%3)*4,route=[];
    for(let n=0;n<steps;n++) {
      let accepted=false;
      for(let tries=0;tries<60;tries++) {
        attemptedSteps++;const op=ops[Math.floor(rng()*ops.length)],candidate=applyOperation(state,op);
        if(stateKey(candidate)===stateKey(state)||!guard(candidate))continue;
        state=candidate;route.push(op.label);accepted=true;acceptedSteps++;break;
      }
      if(!accepted)break;
    }
    const d=distance(state,anchor),key=stateKey(state);if(d<6||seen.has(key))continue;seen.add(key);
    pool.push({state,key,mutation:route.join('; '),walkSeed:seed.source,walkSteps:route.length,intermediateLegal:true,forecast:1000});
  }
  return {pool,stats:{walks:8000,seeds:seeds.length,attemptedSteps,acceptedSteps,uniqueNewEndpoints:pool.length,minimumHammingFromAnchor:6}};
}
async function main() {
  const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];
  args.snow=path.resolve(args.snow||'D:/C2D/Documents/rime-snow-pinyin');args.html=path.resolve(args.html||path.join(ROOT,'a7_CKT_R11.html'));
  args.fixture=path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json');args.seed=path.join(ROOT,'research/config/untoned-2126-double-empty-closure-finalist.json');
  const cacheFile=path.join(ROOT,'research/notes/2026-11-14-untoned-2126-double-empty-closure.json');
  const output=path.resolve(args.output||path.join(ROOT,'research/.cache/untoned-2126-coupled-basin/checkpoint.json'));
  const options={localLimit:Number(args.local||112),farLimit:Number(args.far||80),farTriggerGain:.001,localRounds:2};
  const sources=[...closure.contractSourceFiles(args),__filename,cacheFile],sourceHashes=Object.fromEntries(sources.map(p=>[p,fileHash(p)]));
  const fingerprint=hash(JSON.stringify({sourceHashes,options}));
  const imported=read(cacheFile);for(const [file,digest] of Object.entries(imported.sourceHashes))if(fileHash(file)!==digest)throw Error(`Historical score source changed ${file}`);
  const known=new Map(Object.values(imported.records).map(r=>[stateKey(compactState(r)),r]));
  const ctx=search.makeContext(args.snow,args.html,args.fixture),data=ctx.data,guard=makeGuard(data),ops=operations();
  const template=data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED'),base={audit:search.audit(template,data),erg:search.ergonomics(template,data,ctx.fixture,ctx.motor)};
  const seed=known.get(stateKey(compactState(read(args.seed))));
  let checkpoint={version:1,fingerprint,sourceHashes,options,seed,baseline:base,baselineIndependent:imported.baselineIndependent,records:{[stateKey(compactState(seed))]:seed},stages:[],completed:false,started:new Date().toISOString()};
  if(fs.existsSync(output)){checkpoint=read(output);if(checkpoint.fingerprint!==fingerprint)throw Error('Coupled search checkpoint contract differs');}
  for(const [key,row] of Object.entries(checkpoint.records))known.set(key,row);
  const save=()=>{checkpoint.updated=new Date().toISOString();atomicSave(output,checkpoint);};
  const auditor=closure.independentAuditor(data);
  const scoreGate=ind=>ind.tracks.S2.e34<=checkpoint.baselineIndependent.tracks.S2.e34+1e-12&&ind.a7eV4<=checkpoint.baselineIndependent.a7eV4+1e-12;
  const workers=Array.from({length:Number(args.workers||3)},()=>launchWorker(args));
  let best=Object.values(checkpoint.records).filter(r=>r.id===seed.id||r.independentPass).sort((a,b)=>a.score-b.score)[0];
  try {
    await Promise.all(workers.map(w=>w.ready));console.log(JSON.stringify({ready:true,seed:seed.score,output,options}));
    for(let stageIndex=0;stageIndex<3;stageIndex++) {
      const kind=stageIndex===2?'far':'local';
      if(stageIndex===1&&best.score>=seed.score-1e-10)continue;
      if(kind==='far'&&seed.score-best.score>=options.farTriggerGain)continue;
      let stage=checkpoint.stages.find(s=>s.index===stageIndex);
      if(stage?.completed){best=known.get(stage.bestKey);continue;}
      const anchor=compactState(best),anchorScore=best.score;
      if(!stage) {
        const generated=kind==='local'?localPool(anchor,known,guard,ops):farPool(anchor,known,guard,ops,data);
        const comfortable=[];
        for(const r of generated.pool) {
          const entry=search.rebuild({...template,...expandState(r.state)},data),a=search.audit(entry,data);
          if(!search.legal({audit:a},base))throw Error('Compact/full guard disagreement');
          const erg=search.ergonomics(entry,data,ctx.fixture,ctx.motor);if(!search.comfort({erg},base))continue;
          comfortable.push({...r,audit:a,erg,motor:erg.motor});
        }
        const limit=kind==='far'?options.farLimit:(stageIndex===0?options.localLimit:Math.min(options.localLimit,80));
        const selected=selectPool(comfortable,limit,anchor,kind).map(r=>({...r,state:undefined,...expandState(r.state),id:`CB26-${hash(r.key).slice(0,12)}`,parent:best.id}));
        stage={index:stageIndex,kind,anchor:best.id,anchorScore,stats:{...generated.stats,comfortPassing:comfortable.length},jobs:selected,completed:false};checkpoint.stages.push(stage);save();
        console.log(JSON.stringify({stage:stageIndex,kind,anchor:best.id,stats:stage.stats,selected:selected.length}));
      }
      const jobs=stage.jobs.filter(r=>!checkpoint.records[r.key]);let cursor=0,finished=0;
      await Promise.all(workers.map(async w=>{while(cursor<jobs.length){const job=jobs[cursor++],result=await w.score(job);if(result.id!==job.id||!Number.isFinite(result.score))throw Error('Invalid native result');const row={...job,...result};checkpoint.records[job.key]=row;known.set(job.key,row);save();finished++;if(finished%5===0||row.score<best.score)console.log(JSON.stringify({stage:stageIndex,finished,total:jobs.length,score:row.score,mutation:row.mutation,distance:row.distance}));}}));
      const improvements=stage.jobs.map(r=>known.get(r.key)).filter(r=>r.score<best.score-1e-10).sort((a,b)=>a.score-b.score);
      for(const row of improvements) {row.independent??=auditor(search.rebuild({...template,...row},data));row.independentPass=scoreGate(row.independent);save();if(row.independentPass){best=row;break;}}
      stage.completed=true;stage.bestKey=stateKey(compactState(best));stage.gain=stage.anchorScore-best.score;save();
      console.log(JSON.stringify({stageComplete:stageIndex,kind,gain:stage.gain,best:best.id,score:best.score}));
    }
    checkpoint.bestId=best.id;checkpoint.bestScore=best.score;checkpoint.completed=true;save();console.log(JSON.stringify({completed:true,best:best.id,score:best.score,newScores:Object.keys(checkpoint.records).length-1}));
  } finally {for(const w of workers)w.child.kill();}
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={operations,applyOperation,compactState,expandState,makeGuard,distance,stateKey,selectPool};
