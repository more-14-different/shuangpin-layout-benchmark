#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const search=require('./search_untoned_production_v51'),coupled=require('./search_untoned_2126_coupled');
const closure=require('./close_untoned_2126_double_empty'),exhaustive=require('./exhaust_untoned_2126_twohop'),recenter=require('./recenter_untoned_2126'),stream=require('./untoned_v51_stream');
const ROOT=path.resolve(__dirname,'..'),DIRECTORY=path.join(ROOT,'research/.cache/untoned-2126-threehop-20261115');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const stateOf=key=>Uint8Array.from(Buffer.from(key,'base64'));
const OPTIONS={comfortableBridges:32,repairBridges:8,sampledTriples:1000000,randomSeed:2026111503,centers:6,maximumCenterRounds:8};
function extendBridges(bridges,ops,guard,apply=coupled.applyOperation) {
  const endpoints=new Map();let visited=0,legalPaths=0;
  for(const bridge of bridges)for(let i=0;i<ops.length;i++) {
    visited++;const state=apply(stateOf(bridge.key),ops[i]);if(!guard(state))continue;legalPaths++;
    const key=coupled.stateKey(state);if(!endpoints.has(key))endpoints.set(key,{key,path:[...bridge.path,i],bridgeKey:bridge.key,selection:bridge.selection||'bridge'});
  }
  return {endpoints,stats:{bridges:bridges.length,thirdOperationsVisited:visited,legalPaths,uniqueHardLegalEndpoints:endpoints.size}};
}
function sampleTriples(anchor,ops,guard,trials,seed,apply=coupled.applyOperation) {
  const endpoints=new Map();let value=seed>>>0,legalPaths=0;
  const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value;};
  for(let n=0;n<trials;n++) {
    const path=[0,0,0].map(()=>Math.floor(random()/4294967296*ops.length));
    const a=apply(anchor,ops[path[0]]),b=apply(a,ops[path[1]]),state=apply(b,ops[path[2]]);
    if(!guard(state))continue;legalPaths++;
    const key=coupled.stateKey(state),illegalIntermediate=!guard(a)||!guard(b),old=endpoints.get(key);
    if(!old)endpoints.set(key,{key,path,selection:'fixed-seed-triple-sample',illegalIntermediate,observedIllegalIntermediate:illegalIntermediate});
    else old.observedIllegalIntermediate||=illegalIntermediate;
  }
  return {endpoints,stats:{sampledTriples:trials,seed,legalPaths,uniqueHardLegalEndpoints:endpoints.size}};
}
function selectBridges(manifest,scores,anchor,ops,options=OPTIONS) {
  const singles=new Set(ops.map(op=>coupled.stateKey(coupled.applyOperation(anchor,op))));
  const candidates=manifest.rows.filter(r=>!singles.has(r.key)&&r.key!==coupled.stateKey(anchor));
  const selected=new Map(),take=(rows,n,why)=>{if(n<=0)return;for(const row of rows){if(selected.has(row.key))continue;selected.set(row.key,{...row,selection:why});if(--n===0)break;}};
  const comfortable=candidates.filter(r=>r.comfortable),byScore=(a,b)=>scores.get(a.key).score-scores.get(b.key).score||a.key.localeCompare(b.key);
  const groups=Object.values(Object.groupBy(comfortable,r=>r.key.slice(0,36))).map(g=>[...g].sort(byScore)[0]).sort(byScore);
  take(groups,options.comfortableBridges,'minimum CKT per head map');
  take([...comfortable].sort(byScore),Math.min(8,Math.max(0,options.comfortableBridges-selected.size)),'nearby CKT bridge');
  for(const [metric,descending] of [['mx',true],['homeS2',true],['wMax',false]]) {
    if(selected.size>=options.comfortableBridges)break;
    take([...comfortable].sort((a,b)=>(a.erg[metric]-b.erg[metric])*(descending?-1:1)||byScore(a,b)),1,`bridge extreme ${metric}`);
  }
  if(selected.size<options.comfortableBridges)take([...comfortable].sort((a,b)=>hash(`${options.randomSeed}:${a.key}`).localeCompare(hash(`${options.randomSeed}:${b.key}`))),options.comfortableBridges-selected.size,'fixed-seed bridge diversity');
  const b=manifest.baseline.erg,deficit=r=>Math.max(0,b.mx-r.erg.mx)+100*Math.max(0,b.homeS2-r.erg.homeS2)+100*Math.max(0,b.homeFloor-r.erg.homeFloor);
  const rejected=candidates.filter(r=>!r.comfortable).sort((a,b)=>deficit(a)-deficit(b)||a.key.localeCompare(b.key)),repairs=[];
  for(const row of rejected)if(repairs.every(r=>coupled.distance(stateOf(r.key),stateOf(row.key))>=3)){repairs.push(row);if(repairs.length===options.repairBridges)break;}
  take(repairs,options.repairBridges,'hard-legal bridge below a comfort floor');
  return [...selected.values()];
}
function save(file,value) {
  const temp=file+`.${process.pid}.tmp`;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');
  for(let n=0;;n++){try{fs.renameSync(temp,file);break;}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||n>=40)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}
}
function setup() {
  const ctx=recenter.setup(),prefix=path.join(ROOT,'research/notes/2026-11-15-untoned-2126-recenter');
  const summaryFile=prefix+'-summary.json',archiveFile=prefix+'-scores.jsonl.gz',manifestFile=prefix+'-stage-7-manifest.json.gz';
  const summary=read(summaryFile);recenter.validateSources(summary.sourceHashes);
  if(!summary.completed||stream.fileHash(archiveFile)!==summary.exports[path.basename(archiveFile)].sha256||stream.fileHash(manifestFile)!==summary.exports[path.basename(manifestFile)].sha256)throw Error('Recenter evidence changed/incomplete');
  for(const line of zlib.gunzipSync(fs.readFileSync(archiveFile)).toString('utf8').split('\n').filter(Boolean))recenter.insertScore(ctx.scores,JSON.parse(line),archiveFile);
  const start=read(path.join(ROOT,'research/config/untoned-2126-recenter-finalist.json')),startKey=coupled.stateKey(coupled.compactState(start));
  if(Math.abs(ctx.scores.get(startKey).score-start.cktV51)>1e-10)throw Error('Starting score differs');
  const extra=[__filename,summaryFile,archiveFile,manifestFile,path.join(ROOT,'research/config/untoned-2126-recenter-finalist.json')];
  const sourceHashes={...ctx.sourceHashes,...Object.fromEntries(extra.map(f=>[f,stream.fileHash(f)]))};
  return {...ctx,start,startKey,rootManifest:JSON.parse(zlib.gunzipSync(fs.readFileSync(manifestFile))),sourceHashes,fingerprint:hash(JSON.stringify({sourceHashes,options:OPTIONS}))};
}
function chooseCenters(ctx,ops) {
  const excluded=new Set(ctx.rootManifest.rows.map(r=>r.key)),anchor=stateOf(ctx.startKey),head=ctx.startKey.slice(0,36),guard=coupled.makeGuard(ctx.data),pool=[];
  for(const row of ctx.scores.values()) {
    const state=stateOf(row.key),distance=coupled.distance(state,anchor);if(distance<6||excluded.has(row.key)||!guard(state))continue;
    const entry=search.rebuild({...ctx.template,...coupled.expandState(state)},ctx.data),erg=search.ergonomics(entry,ctx.data,ctx.fixture,()=>({upperMs:0}));delete erg.motor;
    if(search.comfort({erg},ctx.baseline))pool.push({key:row.key,score:row.score,erg,distance,headChanged:row.key.slice(0,36)!==head,origin:row.origin});
  }
  const selected=[],take=(rows,why)=>{const row=rows.find(r=>selected.every(s=>s.key!==r.key&&coupled.distance(stateOf(s.key),stateOf(r.key))>=4));if(row)selected.push({...row,reason:why});};
  const byScore=(a,b)=>a.score-b.score||a.key.localeCompare(b.key);
  take(pool.filter(r=>r.headChanged).sort(byScore),'lowest CKT with different heads outside current two-hop endpoints');
  take(pool.filter(r=>r.distance>=10).sort(byScore),'lowest CKT at physical distance >=10');
  take(pool.filter(r=>r.score<=ctx.start.cktV51+.1&&r.headChanged).sort((a,b)=>b.erg.mx-a.erg.mx||byScore(a,b)),'high moving-hand alternative center');
  take(pool.filter(r=>r.score<=ctx.start.cktV51+.1).sort((a,b)=>b.erg.homeS2-a.erg.homeS2||byScore(a,b)),'high home-row alternative center');
  take(pool.filter(r=>r.distance>=8&&r.origin.includes('coupled-basin')).sort(byScore),'earlier distant-basin record');
  const diverse=pool.filter(r=>r.score<=ctx.start.cktV51+.05).map(r=>({...r,separation:selected.length?Math.min(...selected.map(s=>coupled.distance(stateOf(s.key),stateOf(r.key)))):r.distance})).sort((a,b)=>b.separation-a.separation||byScore(a,b));
  take(diverse,'physical diversity among near-score alternatives');
  if(selected.length<OPTIONS.centers)for(const row of [...pool].sort(byScore)){take([row],'remaining near-score center');if(selected.length===OPTIONS.centers)break;}
  return selected.slice(0,OPTIONS.centers);
}
async function main() {
  const cli={};for(let i=2;i<process.argv.length;i+=2)cli[process.argv[i].slice(2)]=process.argv[i+1];
  const directory=path.resolve(cli.output||DIRECTORY);fs.mkdirSync(directory,{recursive:true});const checkpointFile=path.join(directory,'checkpoint.json'),journalFile=path.join(directory,'new-scores.jsonl');
  const ctx=setup(),ops=coupled.operations(),guard=coupled.makeGuard(ctx.data),scores=ctx.scores;
  const entryFor=key=>search.rebuild({...ctx.template,...coupled.expandState(stateOf(key)),id:recenter.idFor(key)},ctx.data);
  let checkpoint={version:1,fingerprint:ctx.fingerprint,sourceHashes:ctx.sourceHashes,options:OPTIONS,start:{...scores.get(ctx.startKey),independent:ctx.start.independent},globalKey:ctx.startKey,globalScore:ctx.start.cktV51,globalIndependent:ctx.start.independent,baseline:ctx.baseline,stages:[],centers:[],completed:false,started:new Date().toISOString(),finalRound:0,finalClosed:false};
  if(fs.existsSync(checkpointFile)){checkpoint=read(checkpointFile);if(checkpoint.fingerprint!==ctx.fingerprint)throw Error('Three-hop checkpoint contract differs');}
  const journal=exhaustive.readJournal(journalFile);for(const row of journal){if(row.fingerprint!==ctx.fingerprint)throw Error('Journal contract differs');recenter.insertScore(scores,row,'current three-hop journal');}
  let newScores=journal.length;const update=()=>{checkpoint.newScores=newScores;checkpoint.updated=new Date().toISOString();save(checkpointFile,checkpoint);};
  if(checkpoint.completed){console.log(JSON.stringify({alreadyCompleted:true,score:checkpoint.globalScore}));return;}
  if(!checkpoint.centers.length){checkpoint.centers=chooseCenters(ctx,ops).map((s,i)=>({...s,index:i,currentKey:s.key,round:0,completed:false}));update();}
  const workers=Array.from({length:Number(cli.workers||12)},()=>stream.launch());let auditor;
  const auditFor=key=>{if(!auditor){auditor=closure.independentAuditor(ctx.data);checkpoint.baselineIndependent=auditor(ctx.template);}Engine7.init(ctx.data);return auditor(entryFor(key));};
  const pass=a=>a.a7eV4<=checkpoint.baselineIndependent.a7eV4+1e-12&&a.tracks.S2.e34<=checkpoint.baselineIndependent.tracks.S2.e34+1e-12;
  async function runPool(label,kind,anchorKey,generate) {
    let stage=checkpoint.stages.find(s=>s.label===label);if(stage?.completed)return stage;
    if(!stage) {
      const generated=generate(),anchor=stateOf(anchorKey),rows=[];
      for(const item of generated.endpoints.values()) {
        const entry=entryFor(item.key),audit=search.audit(entry,ctx.data);if(!search.legal({audit},ctx.baseline))throw Error('Compact/full guard mismatch');
        const erg=search.ergonomics(entry,ctx.data,ctx.fixture,()=>({upperMs:0}));delete erg.motor;
        const state=stateOf(item.key),headChanges=[...state.slice(0,27)].filter((v,i)=>v!==anchor[i]).length;
        rows.push({...item,id:recenter.idFor(item.key),audit,erg,comfortable:search.comfort({erg},ctx.baseline),headChanges,distance:coupled.distance(state,anchor)});
      }
      const index=checkpoint.stages.length,manifestFile=path.join(directory,`stage-${index}-manifest.json`),jobs=rows.filter(r=>r.comfortable);
      const manifest={version:1,fingerprint:ctx.fingerprint,kind,label,anchorKey,anchorScore:scores.get(anchorKey).score,baseline:ctx.baseline,stats:{...generated.stats,hardLegal:rows.length,comfortable:jobs.length,previouslyScored:jobs.filter(r=>scores.has(r.key)).length,unscored:jobs.filter(r=>!scores.has(r.key)).length,headPerturbed:jobs.filter(r=>r.headChanges).length},selection:generated.selection,rows};
      fs.writeFileSync(manifestFile,JSON.stringify(manifest));stage={index,label,kind,anchorKey,anchorScore:manifest.anchorScore,manifestFile,manifestSha256:stream.fileHash(manifestFile),stats:manifest.stats,completed:false};checkpoint.stages.push(stage);update();console.log(JSON.stringify({stageReady:index,label,...stage.stats}));
    }
    if(stage.anchorKey!==anchorKey||stream.fileHash(stage.manifestFile)!==stage.manifestSha256)throw Error('Open stage differs');
    const manifest=read(stage.manifestFile),jobs=manifest.rows.filter(r=>r.comfortable),pending=jobs.filter(r=>!scores.has(r.key));let cursor=0,finished=jobs.length-pending.length;stage.total=jobs.length;stage.finished=finished;update();
    await Promise.all(workers.map(async w=>{while(cursor<pending.length){const job=pending[cursor++],result=await w.score({id:job.id,state:[...stateOf(job.key)]});if(result.id!==job.id||!Number.isFinite(result.score)||!result.modes)throw Error('Invalid native score');const row={...result,key:job.key,fingerprint:ctx.fingerprint};fs.appendFileSync(journalFile,JSON.stringify(row)+'\n');recenter.insertScore(scores,row,'current three-hop journal');newScores++;stage.finished=++finished;if(finished%100===0||finished===jobs.length){stage.rawMinimum=Math.min(...jobs.filter(r=>scores.has(r.key)).map(r=>scores.get(r.key).score));update();console.log(JSON.stringify({stage:stage.index,label,finished,total:jobs.length,newScores,rawMinimum:stage.rawMinimum}));}}}));
    exhaustive.validateCoverage(jobs.map(r=>r.id),jobs.map(r=>scores.get(r.key)));
    const center=scores.get(anchorKey);if(!checkpoint.baselineIndependent)auditFor(anchorKey);
    const admission=recenter.admitWinner(center,jobs.map(r=>scores.get(r.key)),r=>auditFor(r.key),pass);
    Object.assign(stage,{completed:true,bestKey:admission.best.key,bestScore:admission.best.score,gain:center.score-admission.best.score,improvingEndpoints:admission.improvements,independentAudits:admission.audits,rawMinimum:Math.min(...jobs.map(r=>scores.get(r.key).score))});
    const winnerAudit=admission.audits.find(a=>a.key===stage.bestKey&&a.pass);
    if(winnerAudit&&stage.bestScore<checkpoint.globalScore-1e-10){checkpoint.globalKey=stage.bestKey;checkpoint.globalScore=stage.bestScore;checkpoint.globalIndependent=winnerAudit.independent;}
    update();console.log(JSON.stringify({stageComplete:stage.index,label,best:stage.bestScore,gain:stage.gain,globalBest:checkpoint.globalScore}));return stage;
  }
  try {
    await Promise.all(workers.map(w=>w.ready));console.log(JSON.stringify({ready:true,start:ctx.start.cktV51,importedScores:scores.size,centers:checkpoint.centers.map(s=>({index:s.index,score:s.score,distance:s.distance,reason:s.reason}))}));
    await runPool('three-hop-slices','three',ctx.startKey,()=>{
      const anchor=stateOf(ctx.startKey),bridges=selectBridges(ctx.rootManifest,scores,anchor,ops),structured=extendBridges(bridges,ops,guard),sampled=sampleTriples(anchor,ops,guard,OPTIONS.sampledTriples,OPTIONS.randomSeed);
      for(const [key,row] of sampled.endpoints){const existing=structured.endpoints.get(key);if(existing)existing.observedIllegalIntermediate||=row.observedIllegalIntermediate;else structured.endpoints.set(key,row);}
      const rootTwo=new Set(ctx.rootManifest.rows.map(r=>r.key));
      for(const row of structured.endpoints.values()) {
        let state=anchor;let bad=false;for(const i of row.path.slice(0,2)){state=coupled.applyOperation(state,ops[i]);bad||=!guard(state);}
        row.illegalIntermediate=bad;row.observedIllegalIntermediate||=bad;row.outsideOriginalTwoHop=!rootTwo.has(row.key);
      }
      return {endpoints:structured.endpoints,stats:{structured:structured.stats,sampled:sampled.stats,bridges:bridges.length,outsideOriginalTwoHop:[...structured.endpoints.values()].filter(r=>r.outsideOriginalTwoHop).length,observedIllegalIntermediate:[...structured.endpoints.values()].filter(r=>r.observedIllegalIntermediate).length},selection:{bridges:bridges.map(r=>({key:r.key,path:r.path,selection:r.selection,comfortable:r.comfortable})),options:OPTIONS}};
    });
    for(const center of checkpoint.centers) {
      if(center.completed)continue;
      if(!center.initialIndependent){center.initialIndependent=auditFor(center.key);center.initialPass=pass(center.initialIndependent);update();}
      while(!center.completed) {
        const stage=await runPool(`center-${center.index}-${center.round}`,'one',center.currentKey,()=>recenter.enumerateSingle(stateOf(center.currentKey),ops,guard));
        center.currentKey=stage.bestKey;center.round++;
        if(stage.gain<=1e-10||center.round>=OPTIONS.maximumCenterRounds){center.completed=true;center.oneHopClosed=stage.gain<=1e-10;center.stopReason=center.oneHopClosed?'complete one-step neighborhood has no admitted improvement':'predeclared round limit';}
        update();
      }
    }
    while(!checkpoint.finalClosed) {
      const key=checkpoint.globalKey,stage=await runPool(`final-${checkpoint.finalRound}`,'one',key,()=>recenter.enumerateSingle(stateOf(key),ops,guard));
      checkpoint.finalRound++;checkpoint.finalClosed=stage.gain<=1e-10;update();
    }
    const required=new Set([ctx.startKey,...checkpoint.centers.map(s=>s.key),...checkpoint.stages.flatMap(s=>read(s.manifestFile).rows.filter(r=>r.comfortable).map(r=>r.key))]);
    const scoreArchive=path.join(directory,'all-scores.jsonl.gz');fs.writeFileSync(scoreArchive,zlib.gzipSync([...required].sort().map(k=>JSON.stringify(scores.get(k))).join('\n')+'\n',{level:9}));
    Object.assign(checkpoint,{completed:true,bestId:recenter.idFor(checkpoint.globalKey),bestKey:checkpoint.globalKey,bestScore:checkpoint.globalScore,scoreArchive,scoreArchiveSha256:stream.fileHash(scoreArchive),journalSha256:stream.fileHash(journalFile),stopReason:'Fixed three-hop bridge/sample exploration and bounded multi-center descent completed; final representative has complete one-hop closure. No exhaustive three-hop or two-hop-at-new-best claim.'});update();
    console.log(JSON.stringify({completed:true,best:checkpoint.bestId,score:checkpoint.bestScore,gain:ctx.start.cktV51-checkpoint.bestScore,newScores,stages:checkpoint.stages.length}));
  }finally{for(const w of workers)w.child.kill();}
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={extendBridges,sampleTriples,selectBridges,chooseCenters,setup,DIRECTORY,OPTIONS};
