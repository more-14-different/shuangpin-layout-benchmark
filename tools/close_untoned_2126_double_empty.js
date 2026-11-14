#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const readline=require('node:readline');
const {spawn}=require('node:child_process');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture');
const search=require('./search_untoned_production_v51');
const {loadPayload}=require('./score_completion_ckt_v4');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const fileHash=p=>hash(fs.readFileSync(p));
function layoutKey(e) {
  return JSON.stringify([e.capacity,HEADS.map(h=>e.initialMap[h]),FINALS.map(f=>e.finalMap[f]),e.tone||e.toneKeysByTone]);
}
function validateCheckpoint(checkpoint,fingerprint) {
  if(checkpoint.version!==1||checkpoint.fingerprint!==fingerprint)throw Error('checkpoint score contract differs; use a new output directory');
}
function contractSourceFiles(args) {
  const replay=path.join(ROOT,'research/.cache/R11_integrated_replay');
  return [args.html,args.fixture,args.seed,__filename,
    ...['search_untoned_production_v51.js','ckt_v4_model.js','score_completion_ckt_v4.js','ckt_v4_upstream_role_tables.json','ckt_v4_scheme_fixture.js','auxiliary_semantics.js'].map(f=>path.join(ROOT,'tools',f)),
    ...['script1.js','script2.js','track_options.json','memory_r2.py','audit.py'].map(f=>path.join(replay,f)),
    ...['snow_pinyin.base.dict.yaml','rime-stroke/stroke.dict.yaml','scripts/research/evaluate_ckt_v4_word_aux_order.js','scripts/research/evaluate_ckt51_aux_order.js','scripts/research/auxiliary_semantics.js'].map(f=>path.join(args.snow,f))];
}
function resumeCenter(checkpoint) {
  let current=checkpoint.seed;const seen=new Set();
  while(true) {
    if(seen.has(current.id))throw Error('checkpoint center chain contains a cycle');seen.add(current.id);
    const center=checkpoint.centers.find(c=>c.id===current.id);
    if(!center?.completed||!center.nextId)return current;
    const next=Object.values(checkpoint.records).find(r=>r.id===center.nextId);
    if(!next)throw Error('checkpoint successor record missing');current=next;
  }
}
function enumerateNeighborhood(base) {
  const rows=search.variants(base);
  for(const [field,tokens] of [['initialMap',HEADS],['finalMap',FINALS]]) {
    for(const token of tokens)for(const key of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      if(base[field][token]===key)continue;
      rows.push({...base,[field]:{...base[field],[token]:key},mutation:`${field}:move ${token}(${base[field][token]})→${key}`});
    }
    for(const [from,group] of Object.entries(Object.groupBy(tokens,t=>base[field][t]))) {
      if(group.length<2)continue;
      for(const key of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        if(from===key)continue;
        const map={...base[field]};for(const token of group)map[token]=key;
        rows.push({...base,[field]:map,mutation:`${field}:move group ${group.join('/')}(${from})→${key}`});
      }
    }
  }
  const initial=layoutKey(base),seen=new Set([initial]);
  return rows.filter(e=>{const key=layoutKey(e);if(seen.has(key))return false;seen.add(key);return true;});
}
function materialize(row,template,data) {
  return search.rebuild({...template,...row,tone:row.tone||row.toneKeysByTone},data);
}
function saveJson(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+`.${process.pid}.tmp`;fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');fs.renameSync(temp,file);
}
function independentAuditor(data) {
  const replay=path.join(ROOT,'research/.cache/R11_integrated_replay');
  require(path.join(replay,'script1.js'));require(path.join(replay,'script2.js'));
  Engine7.init(data);CKTEngine.init(data);
  const specs=read(path.join(replay,'track_options.json'));
  return entry=> {
    const tracks={};
    for(const [name,spec] of Object.entries(specs)) {
      const opt={...spec,model:'ckt',confirm:0,uniform:false,cohort:'common',boundary:'none'};
      const z=CKTEngine.evaluate({...entry,id:`closure-audit:${entry.id}`},opt,false);
      const aggregate=Engine7.aggregate(Engine7.rowsFor(entry,opt),{...opt,boundary:'iid'});
      const e34=Engine7.project(aggregate,Engine7.costs('e34'));
      const geo=Engine7.project(aggregate,Engine7.costs('geometry'));
      tracks[name]={home:z.home,sfb:z.sfb,maxFinger:z.maxFinger,rightPinky:z.rightPinky,upperMs:z.upperMs,e34:e34.eq,geometry:geo.eq};
    }
    let e4=0,e5=0;const c=data.ensembleV4;
    for(const [name,w] of Object.entries(c.trackWeights))for(const model of ['e34','geometry'])e4+=w*.5*(tracks[name][model]/c.baselines[`${name}|${model}`])**c.beta;
    for(const [name,w] of Object.entries(data.ensembleV5.trackWeights))e5+=w*(tracks[name].upperMs/data.ensembleV5.baselines[name])**4;
    return {a7eV4:10*e4**(1/c.beta),a7eV5:10*e5**.25,tracks};
  };
}
async function worker(args) {
  const ctx=search.makeContext(args.snow,args.html,args.fixture);
  const template=ctx.data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED');
  const baseline=ctx.score(template);
  const finalist=read(args.seed);
  const seed=materialize(finalist,template,ctx.data),seedScore=ctx.score(seed);
  if(Math.abs(baseline.score-9.10299979136027)>1e-9||Math.abs(seedScore.score-finalist.cktV51)>1e-9)throw Error('native production/seed regression');
  process.stdout.write(JSON.stringify({ready:true,baseline:baseline.score,seed:seedScore.score})+'\n');
  for await(const line of readline.createInterface({input:process.stdin})) {
    const request=JSON.parse(line),start=Date.now();
    const entry=materialize(request,template,ctx.data),result=ctx.score(entry);
    process.stdout.write(JSON.stringify({id:request.id,...result,seconds:(Date.now()-start)/1000})+'\n');
  }
}
function launchWorker(args) {
  const child=spawn(process.execPath,['--max-old-space-size=4096',__filename,'--worker','1','--snow',args.snow,'--html',args.html,'--fixture',args.fixture,'--seed',args.seed],{cwd:ROOT,stdio:['pipe','pipe','inherit'],windowsHide:true});
  let pending=null,readyResolve,readyReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  readline.createInterface({input:child.stdout}).on('line',line=> {
    try {
      const response=JSON.parse(line);
      if(response.ready)readyResolve(response);
      else if(pending){const p=pending;pending=null;p.resolve(response);}
      else throw Error('unsolicited worker output');
    } catch(error){readyReject(error);if(pending)pending.reject(error);}
  });
  child.on('error',error=>{readyReject(error);if(pending)pending.reject(error);});
  child.on('exit',code=>{const error=Error(`score worker exited ${code}`);readyReject(error);if(pending)pending.reject(error);});
  return {child,ready,score:row=>new Promise((resolve,reject)=>{if(pending)return reject(Error('worker already busy'));pending={resolve,reject};child.stdin.write(JSON.stringify(row)+'\n');})};
}
async function main() {
  const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];
  args.snow=path.resolve(args.snow||'D:/C2D/Documents/rime-snow-pinyin');
  args.html=path.resolve(args.html||path.join(ROOT,'a7_CKT_R11.html'));
  args.fixture=path.resolve(args.fixture||path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
  args.seed=path.resolve(args.seed||path.join(ROOT,'research/config/untoned-2126-v51-research-finalist-20261114.json'));
  if(args.worker)return worker(args);
  const output=path.resolve(args.output||path.join(ROOT,'research/.cache/untoned-2126-double-empty-closure'));
  const checkpointFile=path.join(output,'checkpoint.json');
  const workerCount=Number(args.workers||2),maxCenters=Number(args['max-centers']||6);
  if(!Number.isInteger(workerCount)||workerCount<1||workerCount>4)throw Error('workers must be 1..4');
  const sourceFiles=contractSourceFiles(args);
  const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,fileHash(p)]));
  const fingerprint=hash(JSON.stringify(sourceHashes));
  const data=loadPayload(args.html),fixture=read(args.fixture);
  const template=data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED');
  const original=read(args.seed),seed=materialize(original,template,data);
  const baseline={audit:search.audit(template,data),erg:search.ergonomics(template,data,fixture,()=>({upperMs:0}))};
  const seedRow={id:original.id,initialMap:seed.initialMap,finalMap:seed.finalMap,tone:seed.tone,capacity:seed.capacity,audit:search.audit(seed,data),erg:search.ergonomics(seed,data,fixture,()=>({upperMs:0})),score:original.cktV51,mutation:'starting research candidate'};
  let checkpoint={version:1,fingerprint,sourceHashes,started:new Date().toISOString(),baseline,seed:seedRow,records:{[layoutKey(seedRow)]:seedRow},centers:[],completed:false,stopReason:null};
  if(fs.existsSync(checkpointFile)){checkpoint=read(checkpointFile);validateCheckpoint(checkpoint,fingerprint);}
  const save=()=>{checkpoint.updated=new Date().toISOString();saveJson(checkpointFile,checkpoint);};
  const audit=independentAuditor(data);
  checkpoint.baselineIndependent??=audit(template);
  const eqPass=a=>a.tracks.S2.e34<=checkpoint.baselineIndependent.tracks.S2.e34+1e-12&&a.a7eV4<=checkpoint.baselineIndependent.a7eV4+1e-12;
  let current=resumeCenter(checkpoint);
  checkpoint.runState='running';checkpoint.completed=false;checkpoint.stopReason=null;
  delete checkpoint.bestId;delete checkpoint.bestScore;save();
  const workers=Array.from({length:workerCount},()=>launchWorker(args));
  try {
    const ready=await Promise.all(workers.map(w=>w.ready));console.log(JSON.stringify({workersReady:ready,output,fingerprint}));
    for(let round=0;round<maxCenters;round++) {
      const centerKey=layoutKey(current);
      let center=checkpoint.centers.find(c=>c.key===centerKey);
      if(center?.completed) {
        if(center.nextId){current=Object.values(checkpoint.records).find(e=>e.id===center.nextId);continue;}
        checkpoint.completed=true;checkpoint.stopReason='complete one-hop neighborhood; no admissible improving neighbor';break;
      }
      const centerEntry=materialize(current,template,data);
      const proposals=enumerateNeighborhood(centerEntry),legal=[];
      for(const e of proposals) {
        const rebuilt=search.rebuild(e,data);rebuilt.audit=search.audit(rebuilt,data);if(!search.legal(rebuilt,baseline))continue;
        const key=layoutKey(rebuilt),existing=checkpoint.records[key];
        const row=existing||{id:`DE26-${hash(key).slice(0,12)}`,capacity:e.capacity,initialMap:e.initialMap,finalMap:e.finalMap,tone:e.tone,mutation:e.mutation,parent:current.id,audit:rebuilt.audit,erg:search.ergonomics(rebuilt,data,fixture,()=>({upperMs:0}))};
        legal.push({key,row});
      }
      if(!center){center={key:centerKey,id:current.id,score:current.score,proposals:proposals.length,legal:legal.length,comfort:legal.filter(e=>search.comfort(e.row,baseline)).length,keys:legal.map(e=>e.key),completed:false};checkpoint.centers.push(center);}
      const jobs=legal.filter(e=>!Number.isFinite(checkpoint.records[e.key]?.score));
      console.log(JSON.stringify({center:current.id,score:current.score,proposals:proposals.length,legal:legal.length,pending:jobs.length,comfort:center.comfort}));save();
      let cursor=0,finished=0;
      await Promise.all(workers.map(async w=> {
        while(cursor<jobs.length) {
          const job=jobs[cursor++],result=await w.score(job.row);
          if(result.id!==job.row.id||!Number.isFinite(result.score))throw Error('worker result mismatch');
          checkpoint.records[job.key]={...job.row,score:result.score,modes:result.modes,seconds:result.seconds};finished++;
          save();
          if(finished%5===0||result.score<current.score-1e-12)console.log(JSON.stringify({center:current.id,finished,total:jobs.length,score:result.score,mutation:job.row.mutation,comfort:search.comfort(job.row,baseline),seconds:result.seconds}));
        }
      }));
      const improvements=legal.map(e=>checkpoint.records[e.key]).filter(e=>e.score<current.score-1e-10&&search.comfort(e,baseline)).sort((a,b)=>a.score-b.score);
      let next=null;
      for(const row of improvements) {
        row.independent??=audit(materialize(row,template,data));row.independentPass=eqPass(row.independent);save();
        if(row.independentPass){next=row;break;}
      }
      center.completed=true;center.improvements=improvements.map(e=>({id:e.id,score:e.score,independentPass:e.independentPass??null}));
      center.nextId=next?.id||null;save();
      console.log(JSON.stringify({closed:current.id,score:current.score,next:next?.id,nextScore:next?.score,allNeighborsScored:legal.length}));
      if(!next){checkpoint.completed=true;checkpoint.stopReason='complete one-hop neighborhood; no admissible improving neighbor';break;}
      current=next;
    }
    if(!checkpoint.completed)checkpoint.stopReason='center limit reached with an improving successor; not locally saturated';
    checkpoint.bestId=current.id;checkpoint.bestScore=current.score;checkpoint.runState='finalized';save();
    console.log(JSON.stringify({completed:checkpoint.completed,stopReason:checkpoint.stopReason,centers:checkpoint.centers.length,records:Object.keys(checkpoint.records).length,best:current.id,score:current.score}));
  } finally {for(const w of workers)w.child.kill();}
}
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports={layoutKey,validateCheckpoint,contractSourceFiles,resumeCenter,enumerateNeighborhood,materialize,independentAuditor};
