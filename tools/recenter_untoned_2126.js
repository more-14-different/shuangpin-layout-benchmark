#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const search=require('./search_untoned_production_v51'),coupled=require('./search_untoned_2126_coupled');
const closure=require('./close_untoned_2126_double_empty'),exhaustive=require('./exhaust_untoned_2126_twohop'),stream=require('./untoned_v51_stream');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),idFor=key=>`RC26-${hash(key).slice(0,16)}`;
const DIRECTORY=path.join(ROOT,'research/.cache/untoned-2126-recenter-20261115');
function enumerateSingle(anchor,ops,guard,apply=coupled.applyOperation) {
  const seen=new Set([coupled.stateKey(anchor)]),endpoints=new Map();
  for(let i=0;i<ops.length;i++) {
    const state=apply(anchor,ops[i]),key=coupled.stateKey(state);if(seen.has(key))continue;seen.add(key);
    if(guard(state))endpoints.set(key,{key,path:[i]});
  }
  return {endpoints,stats:{primitiveOperations:ops.length,firstStates:seen.size-1,uniqueHardLegalEndpoints:endpoints.size}};
}
function insertScore(cache,row,source) {
  const state=Buffer.from(row.key||'','base64');
  if(state.length!==62||state.some(k=>k>=26)||state.toString('base64')!==row.key)throw Error('Invalid physical score state');
  if(!Number.isFinite(row.score))throw Error('Cached score must be finite');
  const previous=cache.get(row.key);
  if(previous) {
    if(Math.abs(row.score-previous.score)>1e-10)throw Error(`Contradictory cached scores ${row.key}`);
    if(previous.modes&&row.modes)stream.compare(previous,row);
    return;
  }
  cache.set(row.key,{id:idFor(row.key),key:row.key,score:row.score,modes:row.modes,origin:source});
}
function admitWinner(center,records,audit,pass) {
  const improving=records.filter(r=>r.score<center.score-1e-10).sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key)),audits=[];
  for(const row of improving) {const independent=audit(row),ok=pass(independent);audits.push({key:row.key,score:row.score,pass:ok,independent});if(ok)return {best:row,audits,improvements:improving.length};}
  return {best:center,audits,improvements:improving.length};
}
function save(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+`.${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n');
  for(let attempt=0;;attempt++){try{fs.renameSync(temporary,file);break;}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||attempt>=40)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}
}
function validateSources(hashes) {for(const [file,digest] of Object.entries(hashes))if(stream.fileHash(file)!==digest)throw Error(`Frozen source changed: ${file}`);}
function setup() {
  const args={snow:path.resolve('D:/C2D/Documents/rime-snow-pinyin'),html:path.join(ROOT,'a7_CKT_R11.html'),fixture:path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'),seed:path.join(ROOT,'research/config/untoned-2126-twohop-finalist.json')};
  const sources=[...closure.contractSourceFiles(args),__filename,path.join(ROOT,'tools/search_untoned_2126_coupled.js'),path.join(ROOT,'tools/exhaust_untoned_2126_twohop.js'),path.join(ROOT,'tools/untoned_v51_stream.js'),path.join(ROOT,'research/ckt-v4-core/src/bin/score-untoned-v51-stream.rs'),stream.defaults.binary,stream.defaults.templates,path.join(ROOT,'research/notes/2026-11-14-untoned-v51-stream-verification.json')];
  const historical=['research/notes/2026-11-14-untoned-2126-double-empty-closure.json','research/notes/2026-11-14-untoned-2126-coupled-basin.json','research/notes/2026-11-14-untoned-2126-twohop-scores.jsonl.gz','research/notes/2026-11-14-untoned-2126-twohop-summary.json'].map(f=>path.join(ROOT,f));
  const sourceHashes=Object.fromEntries([...sources,...historical].map(f=>[f,stream.fileHash(f)])),fingerprint=hash(JSON.stringify(sourceHashes));
  const parity=read(sources.at(-1));stream.validateTemplates();
  if(!parity.passed||parity.binarySha256!==stream.fileHash(stream.defaults.binary)||parity.fixtureSha256!==stream.fileHash(stream.defaults.templates)||parity.rustSourceSha256!==stream.fileHash(path.join(ROOT,'research/ckt-v4-core/src/bin/score-untoned-v51-stream.rs')))throw Error('Frozen stream parity differs');
  if(!Number.isFinite(parity.maximumAbsoluteDifference)||parity.maximumAbsoluteDifference>1e-9)throw Error('Invalid stream parity evidence');
  const scores=new Map();
  for(const file of historical.slice(0,2)) {
    const archive=read(file);validateSources(archive.sourceHashes);
    for(const row of Object.values(archive.records))if(row.modes)insertScore(scores,{...row,key:coupled.stateKey(coupled.compactState(row))},file);
  }
  const previousSummary=read(historical[3]),scoreArchive=historical[2];
  const compressed=zlib.gunzipSync(fs.readFileSync(scoreArchive));
  const previousExport=previousSummary.exports[path.basename(scoreArchive)];
  if(stream.fileHash(scoreArchive)!==previousExport.sha256||hash(compressed)!==previousExport.uncompressedSha256)throw Error('Historical full score archive differs');
  validateSources(previousSummary.sourceHashes);
  for(const line of compressed.toString('utf8').split('\n').filter(Boolean))insertScore(scores,JSON.parse(line),scoreArchive);
  const data=require('./score_completion_ckt_v4').loadPayload(args.html),fixture=read(args.fixture),template=data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED');
  const seed=read(args.seed),seedKey=coupled.stateKey(coupled.compactState(seed)),seedScore=scores.get(seedKey);
  if(!seedScore||Math.abs(seedScore.score-seed.cktV51)>1e-10)throw Error('Missing starting score');
  const baseline={audit:search.audit(template,data),erg:search.ergonomics(template,data,fixture,()=>({upperMs:0}))};
  return {args,sourceHashes,fingerprint,scores,data,fixture,template,seed,seedScore,baseline};
}
async function main() {
  const cli={};for(let i=2;i<process.argv.length;i+=2)cli[process.argv[i].slice(2)]=process.argv[i+1];
  const directory=path.resolve(cli.output||DIRECTORY);fs.mkdirSync(directory,{recursive:true});
  const checkpointFile=path.join(directory,'checkpoint.json'),journalFile=path.join(directory,'new-scores.jsonl');
  const ctx=setup(),ops=coupled.operations(),guard=coupled.makeGuard(ctx.data),{scores}=ctx;
  let checkpoint={version:1,fingerprint:ctx.fingerprint,sourceHashes:ctx.sourceHashes,seed:ctx.seedScore,baseline:ctx.baseline,started:new Date().toISOString(),completed:false,stages:[]};
  if(fs.existsSync(checkpointFile)){checkpoint=read(checkpointFile);if(checkpoint.fingerprint!==ctx.fingerprint)throw Error('Recenter checkpoint contract changed');}
  for(const row of exhaustive.readJournal(journalFile)){if(row.fingerprint!==ctx.fingerprint)throw Error('Score journal contract differs');insertScore(scores,row,'current journal');}
  const update=()=>{checkpoint.updated=new Date().toISOString();checkpoint.newScores=fs.existsSync(journalFile)?exhaustive.readJournal(journalFile).length:0;save(checkpointFile,checkpoint);};
  if(checkpoint.completed){console.log(JSON.stringify({alreadyCompleted:true,best:checkpoint.bestId,score:checkpoint.bestScore}));return;}
  let center=ctx.seedScore,phase='one';
  for(const stage of checkpoint.stages) {
    if(!stage.completed)break;
    if(stage.anchorKey!==center.key||stage.kind!==phase)throw Error('Invalid completed center chain');
    center=scores.get(stage.bestKey);if(!center)throw Error('Missing center score');
    phase=stage.gain>1e-10?'one':stage.kind==='one'?'two':'done';
  }
  const workers=Array.from({length:Number(cli.workers||8)},()=>stream.launch());let auditor;
  const entryFor=key=>search.rebuild({...ctx.template,...coupled.expandState(Buffer.from(key,'base64')),id:idFor(key)},ctx.data);
  try {
    await Promise.all(workers.map(w=>w.ready));console.log(JSON.stringify({ready:true,seed:center.score,importedScores:scores.size,workers:workers.length}));
    while(phase!=='done') {
      let stage=checkpoint.stages.find(s=>!s.completed);
      if(!stage) {
        const index=checkpoint.stages.length,anchor=coupled.compactState(entryFor(center.key)),started=Date.now();
        const generated=phase==='one'?enumerateSingle(anchor,ops,guard):exhaustive.enumerateTwoStep(anchor,ops,guard,undefined,x=>console.log(JSON.stringify({stage:index,...x})));
        const rows=[];
        for(const row of generated.endpoints.values()) {
          const entry=entryFor(row.key),audit=search.audit(entry,ctx.data);
          if(!search.legal({audit},ctx.baseline))throw Error(`Compact/full guard differs ${row.key}`);
          const erg=search.ergonomics(entry,ctx.data,ctx.fixture,()=>({upperMs:0}));delete erg.motor;
          const state=Buffer.from(row.key,'base64'),headChanges=[...state.subarray(0,27)].filter((v,i)=>v!==anchor[i]).length;
          rows.push({...row,id:idFor(row.key),audit,erg,comfortable:search.comfort({erg},ctx.baseline),headChanges,finalChanges:coupled.distance(state,anchor)-headChanges});
        }
        const eligible=rows.filter(r=>r.comfortable),manifestFile=path.join(directory,`stage-${index}-manifest.json`);
        const manifest={version:1,fingerprint:ctx.fingerprint,kind:phase,anchorKey:center.key,anchorScore:center.score,baseline:ctx.baseline,stats:{...generated.stats,comfortable:eligible.length,previouslyScored:eligible.filter(r=>scores.has(r.key)).length,unscored:eligible.filter(r=>!scores.has(r.key)).length,headPerturbed:eligible.filter(r=>r.headChanges).length,enumerationSeconds:(Date.now()-started)/1000},rows};
        fs.writeFileSync(manifestFile,JSON.stringify(manifest));
        stage={index,kind:phase,anchorKey:center.key,anchorScore:center.score,manifestFile,manifestSha256:stream.fileHash(manifestFile),stats:manifest.stats,completed:false};checkpoint.stages.push(stage);update();
        console.log(JSON.stringify({stageReady:index,kind:phase,...stage.stats}));
      }
      if(stage.anchorKey!==center.key||stage.kind!==phase||stream.fileHash(stage.manifestFile)!==stage.manifestSha256)throw Error('Open stage contract changed');
      const manifest=read(stage.manifestFile),jobs=manifest.rows.filter(r=>r.comfortable),pending=jobs.filter(r=>!scores.has(r.key));let cursor=0,finished=jobs.length-pending.length;
      stage.total=jobs.length;stage.finished=finished;update();
      await Promise.all(workers.map(async w=>{
        while(cursor<pending.length) {
          const job=pending[cursor++],result=await w.score({id:job.id,state:[...Buffer.from(job.key,'base64')]});
          if(result.id!==job.id||!Number.isFinite(result.score)||!result.modes)throw Error('Invalid native stream score');
          const row={...result,key:job.key,fingerprint:ctx.fingerprint};fs.appendFileSync(journalFile,JSON.stringify(row)+'\n');insertScore(scores,row,'current journal');stage.finished=++finished;
          if(finished%50===0||finished===jobs.length){stage.rawMinimum=Math.min(center.score,...jobs.filter(r=>scores.has(r.key)).map(r=>scores.get(r.key).score));update();console.log(JSON.stringify({stage:stage.index,kind:phase,finished,total:jobs.length,newScores:checkpoint.newScores,rawMinimum:stage.rawMinimum}));}
        }
      }));
      exhaustive.validateCoverage(jobs.map(r=>r.id),jobs.map(r=>scores.get(r.key)));
      if(!auditor){auditor=closure.independentAuditor(ctx.data);checkpoint.baselineIndependent=auditor(ctx.template);update();}
      const admitted=admitWinner(center,jobs.map(r=>scores.get(r.key)),r=>auditor(entryFor(r.key)),a=>a.a7eV4<=checkpoint.baselineIndependent.a7eV4+1e-12&&a.tracks.S2.e34<=checkpoint.baselineIndependent.tracks.S2.e34+1e-12);
      Object.assign(stage,{completed:true,finished:jobs.length,bestKey:admitted.best.key,bestScore:admitted.best.score,gain:center.score-admitted.best.score,improvingEndpoints:admitted.improvements,independentAudits:admitted.audits,rawMinimum:Math.min(...jobs.map(r=>scores.get(r.key).score))});
      center=admitted.best;phase=stage.gain>1e-10?'one':phase==='one'?'two':'done';update();
      console.log(JSON.stringify({stageComplete:stage.index,kind:stage.kind,score:center.score,gain:stage.gain,next:phase}));
    }
    const outputScores=path.join(directory,'all-scores.jsonl.gz');
    const usedKeys=new Set([ctx.seedScore.key,...checkpoint.stages.flatMap(stage=>read(stage.manifestFile).rows.filter(r=>r.comfortable).map(r=>r.key))]);
    const exported=[...usedKeys].sort().map(key=>JSON.stringify(scores.get(key))).join('\n')+'\n';
    fs.writeFileSync(outputScores,zlib.gzipSync(exported,{level:9,mtime:0}));
    Object.assign(checkpoint,{completed:true,bestId:center.id,bestKey:center.key,bestScore:center.score,closedCenter:center.key,stopReason:'No all-gates improvement in the complete one-step and two-step endpoint neighborhoods of the final center',scoreArchive:outputScores,scoreArchiveSha256:stream.fileHash(outputScores),journalSha256:fs.existsSync(journalFile)?stream.fileHash(journalFile):null});update();
    console.log(JSON.stringify({completed:true,best:center.id,score:center.score,newScores:checkpoint.newScores,stages:checkpoint.stages.length}));
  }finally{for(const w of workers)w.child.kill();}
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={enumerateSingle,admitWinner,insertScore,setup,DIRECTORY,idFor,validateSources};
