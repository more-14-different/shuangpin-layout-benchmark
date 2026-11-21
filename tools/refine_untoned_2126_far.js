#!/usr/bin/env node
'use strict';
// Descend the most promising distant endpoint even when it is slower than
// the global anchor; that is a bridge search, not a new production candidate.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');const readline=require('node:readline');
const search=require('./search_untoned_production_v51');
const closure=require('./close_untoned_2126_double_empty');
const coupled=require('./search_untoned_2126_coupled');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),fileHash=p=>hash(fs.readFileSync(p));
function save(file,c) {const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(c,null,2)+'\n');for(let i=0;;i++){try{fs.renameSync(tmp,file);return;}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||i>=40)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}}
function worker(seedFile) {
  const p=spawn(process.execPath,['--max-old-space-size=4096',path.join(ROOT,'tools/close_untoned_2126_double_empty.js'),'--worker','1','--snow','D:/C2D/Documents/rime-snow-pinyin','--html',path.join(ROOT,'a7_CKT_R11.html'),'--fixture',path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'),'--seed',seedFile],{stdio:['pipe','pipe','inherit'],windowsHide:true});
  let waiting,resolve,reject;const ready=new Promise((r,j)=>{resolve=r;reject=j;});
  readline.createInterface({input:p.stdout}).on('line',line=>{try{const v=JSON.parse(line);if(v.ready)resolve(v);else{const w=waiting;waiting=null;w.resolve(v);}}catch(e){reject(e);waiting?.reject(e);}});
  p.on('exit',code=>{const e=Error(`native scorer exited ${code}`);reject(e);waiting?.reject(e);});p.on('error',e=>{reject(e);waiting?.reject(e);});
  return {p,ready,score:r=>new Promise((resolve,reject)=>{waiting={resolve,reject};p.stdin.write(JSON.stringify(r)+'\n');})};
}
async function main() {
  const input=path.join(ROOT,'research/.cache/untoned-2126-coupled-basin/checkpoint.json'),output=path.join(ROOT,'research/.cache/untoned-2126-coupled-basin/refined.json');
  const initial=read(input);if(!initial.completed)throw Error('Wait for coupled/far screening to finish');
  for(const [p,h] of Object.entries(initial.sourceHashes))if(fileHash(p)!==h)throw Error(`Source changed ${p}`);
  const sourceHashes={...initial.sourceHashes,[input]:fileHash(input),[__filename]:fileHash(__filename)};
  const fingerprint=hash(JSON.stringify({sourceHashes,rounds:2,retain:64}));
  let c={...initial,sourceHashes,fingerprint,completed:false,farRefine:{rounds:2,retain:64,bridgeSource:initial.bestId}};
  if(fs.existsSync(output)){c=read(output);if(c.fingerprint!==fingerprint)throw Error('Far-refine checkpoint contract differs');}
  const ctx=search.makeContext('D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'a7_CKT_R11.html'),path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
  const template=ctx.data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED');
  const imported=read(path.join(ROOT,'research/notes/2026-11-14-untoned-2126-double-empty-closure.json'));
  const known=new Map([...Object.values(imported.records),...Object.values(c.records)].map(r=>[coupled.stateKey(coupled.compactState(r)),r]));
  const farStage=c.stages.find(s=>s.kind==='far');
  let bridge=farStage.jobs.map(j=>c.records[j.key]).sort((a,b)=>a.score-b.score)[0];
  c.farRefine.startId=bridge.id;c.farRefine.startScore=bridge.score;
  const audit=closure.independentAuditor(ctx.data),saveNow=()=>{c.updated=new Date().toISOString();save(output,c);};
  const workers=Array.from({length:3},()=>worker(path.join(ROOT,'research/config/untoned-2126-double-empty-closure-finalist.json')));
  try {
    await Promise.all(workers.map(w=>w.ready));
    for(let round=0;round<2;round++) {
      let stage=c.stages.find(s=>s.kind==='far-refine'&&s.refineRound===round);
      if(stage?.completed){bridge=c.records[stage.bridgeKey];continue;}
      if(!stage) {
        const entry=closure.materialize(bridge,template,ctx.data),raw=closure.enumerateNeighborhood(entry),pool=[],knownNeighbors=[];let legal=0;
        for(const e of raw) {
          const r=search.rebuild(e,ctx.data);r.audit=search.audit(r,ctx.data);if(!search.legal(r,c.baseline))continue;legal++;
          const state=coupled.compactState(r),key=coupled.stateKey(state);
          if(known.has(key)) {
            const cached=known.get(key);
            if(search.comfort(cached,c.baseline)){c.records[key]=cached;knownNeighbors.push({key,id:cached.id,score:cached.score});}
            continue;
          }
          const erg=search.ergonomics(r,ctx.data,ctx.fixture,ctx.motor);if(!search.comfort({erg},c.baseline))continue;
          pool.push({state,key,audit:r.audit,erg,motor:erg.motor,forecast:erg.motor,mutation:r.mutation});
        }
        const selected=coupled.selectPool(pool,64,coupled.compactState(bridge),'far').map(r=>({...r,state:undefined,...coupled.expandState(r.state),id:`FR26-${hash(r.key).slice(0,12)}`,parent:bridge.id}));
        stage={index:3+round,kind:'far-refine',refineRound:round,anchor:bridge.id,anchorScore:bridge.score,stats:{proposals:raw.length,legal,knownComfortNeighbors:knownNeighbors.length,uniqueNewEndpoints:pool.length,comfortPassing:pool.length+knownNeighbors.length},knownNeighbors,jobs:selected,completed:false};c.stages.push(stage);saveNow();
        console.log(JSON.stringify({farRefineRound:round,bridge:bridge.id,score:bridge.score,legal,selected:selected.length}));
      }
      const jobs=stage.jobs.filter(j=>!c.records[j.key]);let cursor=0,finished=0;
      await Promise.all(workers.map(async w=>{while(cursor<jobs.length){const job=jobs[cursor++],result=await w.score(job);if(result.id!==job.id||!Number.isFinite(result.score))throw Error('native result mismatch');c.records[job.key]={...job,...result};known.set(job.key,c.records[job.key]);finished++;saveNow();if(finished%5===0||result.score<bridge.score)console.log(JSON.stringify({farRefineRound:round,finished,total:jobs.length,score:result.score,mutation:job.mutation}));}}));
      const candidate=[...stage.jobs,...stage.knownNeighbors].map(j=>c.records[j.key]).sort((a,b)=>a.score-b.score)[0];
      if(candidate&&candidate.score<bridge.score-1e-10)bridge=candidate;
      const improvements=stage.jobs.map(j=>c.records[j.key]).filter(r=>r.score<c.bestScore-1e-10).sort((a,b)=>a.score-b.score);
      for(const r of improvements){r.independent??=audit(closure.materialize(r,template,ctx.data));r.independentPass=r.independent.tracks.S2.e34<=c.baselineIndependent.tracks.S2.e34+1e-12&&r.independent.a7eV4<=c.baselineIndependent.a7eV4+1e-12;if(r.independentPass){c.bestId=r.id;c.bestScore=r.score;break;}}
      stage.bridgeKey=coupled.stateKey(coupled.compactState(bridge));stage.bestKey=coupled.stateKey(coupled.compactState(c.records[stage.bridgeKey]));stage.gain=stage.anchorScore-bridge.score;stage.completed=true;saveNow();
      console.log(JSON.stringify({farRefineClosed:round,bridge:bridge.id,bridgeScore:bridge.score,globalBest:c.bestScore}));
      if(stage.gain<=1e-10)break;
    }
    c.farRefine.endId=bridge.id;c.farRefine.endScore=bridge.score;c.completed=true;saveNow();console.log(JSON.stringify({completed:true,best:c.bestId,score:c.bestScore,bridgeScore:bridge.score,records:Object.keys(c.records).length}));
  } finally {for(const w of workers)w.p.kill();}
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
