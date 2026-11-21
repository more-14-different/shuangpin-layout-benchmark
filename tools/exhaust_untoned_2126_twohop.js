#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const coupled=require('./search_untoned_2126_coupled'),search=require('./search_untoned_production_v51');
const closure=require('./close_untoned_2126_double_empty'),stream=require('./untoned_v51_stream');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function enumerateTwoStep(anchor,ops,guard,apply=coupled.applyOperation,heartbeat=()=>{}) {
  const first=new Map(),anchorKey=coupled.stateKey(anchor);
  for(let i=0;i<ops.length;i++){const state=apply(anchor,ops[i]),key=coupled.stateKey(state);if(key!==anchorKey&&!first.has(key))first.set(key,{state,op:i});}
  const endpoints=new Map();let pairs=0,accepted=0,visited=0;
  for(const a of first.values()) {
    const firstLegal=guard(a.state);
    for(let j=0;j<ops.length;j++) {
      pairs++;const state=apply(a.state,ops[j]);if(!guard(state))continue;accepted++;
      const key=coupled.stateKey(state);let row=endpoints.get(key);
      if(!row){row={key,path:[a.op,j],viaLegalIntermediate:false,viaIllegalIntermediate:false};endpoints.set(key,row);}
      if(firstLegal)row.viaLegalIntermediate=true;else row.viaIllegalIntermediate=true;
    }
    if(++visited%500===0)heartbeat({firstStatesVisited:visited,totalFirstStates:first.size,orderedPairsVisited:pairs,uniqueHardLegalEndpoints:endpoints.size});
  }
  return {endpoints,stats:{primitiveOperations:ops.length,firstStates:first.size,orderedPairsVisited:pairs,hardLegalPathsBeforeDedup:accepted,uniqueHardLegalEndpoints:endpoints.size,viaIllegalIntermediate:[...endpoints.values()].filter(r=>r.viaIllegalIntermediate).length,onlyViaIllegalIntermediate:[...endpoints.values()].filter(r=>!r.viaLegalIntermediate).length}};
}
function validateCoverage(ids,records) {
  const expected=new Set(ids),seen=new Set();if(expected.size!==ids.length)throw Error('duplicate manifest ID');
  for(const row of records) {
    if(seen.has(row.id))throw Error(`duplicate score ${row.id}`);
    if(!expected.has(row.id))throw Error(`foreign score ${row.id}`);
    if(!Number.isFinite(row.score))throw Error(`score must be finite ${row.id}`);seen.add(row.id);
  }
  const missing=[...expected].filter(id=>!seen.has(id));if(missing.length)throw Error(`missing ${missing.length} scores`);
}
function save(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+`.${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');
  for(let i=0;;i++){try{fs.renameSync(tmp,file);break;}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||i>=40)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}
}
function readJournal(file) {
  if(!fs.existsSync(file))return [];
  return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map((line,i)=>{try{return JSON.parse(line);}catch{throw Error(`Incomplete journal record at line ${i+1}; preserve and repair the tail before resuming`);}});
}
function frozenSources(args) {
  return Object.fromEntries([...closure.contractSourceFiles(args),__filename,path.join(ROOT,'tools/search_untoned_2126_coupled.js'),path.join(ROOT,'tools/untoned_v51_stream.js'),path.join(ROOT,'tools/export_untoned_v51_templates.js'),path.join(ROOT,'research/ckt-v4-core/src/bin/score-untoned-v51-stream.rs'),stream.defaults.binary,stream.defaults.templates,path.join(ROOT,'research/notes/2026-11-14-untoned-v51-stream-verification.json')].map(f=>[f,stream.fileHash(f)]));
}
async function main() {
  const cli={};for(let i=2;i<process.argv.length;i+=2)cli[process.argv[i].slice(2)]=process.argv[i+1];
  const args={snow:path.resolve(cli.snow||'D:/C2D/Documents/rime-snow-pinyin'),html:path.join(ROOT,'a7_CKT_R11.html'),fixture:path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'),seed:path.join(ROOT,'research/config/untoned-2126-double-empty-closure-finalist.json')};
  const directory=path.resolve(cli.output||path.join(ROOT,'research/.cache/untoned-2126-twohop-exhaustive'));
  fs.mkdirSync(directory,{recursive:true});const manifestFile=path.join(directory,'manifest.json'),journalFile=path.join(directory,'scores.jsonl'),progressFile=path.join(directory,'progress.json');
  const verified=read(path.join(ROOT,'research/notes/2026-11-14-untoned-v51-stream-verification.json'));
  if(!verified.passed||verified.binarySha256!==stream.fileHash(stream.defaults.binary)||verified.rustSourceSha256!==stream.fileHash(path.join(ROOT,'research/ckt-v4-core/src/bin/score-untoned-v51-stream.rs'))||verified.fixtureSha256!==stream.fileHash(stream.defaults.templates))throw Error('Missing/current stream parity verification');
  stream.validateTemplates();const sourceHashes=frozenSources(args),fingerprint=hash(JSON.stringify(sourceHashes));
  const data=require('./score_completion_ckt_v4').loadPayload(args.html),fixture=read(args.fixture),ops=coupled.operations();
  const template=data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED'),seed=read(args.seed),anchor=coupled.compactState(seed);
  const baseline={audit:search.audit(template,data),erg:search.ergonomics(template,data,fixture,()=>({upperMs:0}))};
  let manifest;
  if(fs.existsSync(manifestFile)){manifest=read(manifestFile);if(manifest.fingerprint!==fingerprint)throw Error('Two-hop manifest contract changed');}
  else {
    const started=Date.now(),generated=enumerateTwoStep(anchor,ops,coupled.makeGuard(data),undefined,x=>console.log(JSON.stringify(x)));
    const rows=[];let n=0;
    for(const row of generated.endpoints.values()) {
      const state=Uint8Array.from(Buffer.from(row.key,'base64')),entry=search.rebuild({...template,...coupled.expandState(state)},data),audit=search.audit(entry,data);
      if(!search.legal({audit},baseline))throw Error(`Compact/full guard disagreement ${row.key}`);
      const erg=search.ergonomics(entry,data,fixture,()=>({upperMs:0}));delete erg.motor;
      const headChanges=[...state.slice(0,27)].filter((k,i)=>k!==anchor[i]).length,finalChanges=coupled.distance(state,anchor)-headChanges;
      rows.push({...row,id:`E2-${hash(row.key).slice(0,16)}`,audit,erg,comfortable:search.comfort({erg},baseline),headChanges,finalChanges});
      if(++n%5000===0)console.log(JSON.stringify({comfortAudited:n,total:generated.endpoints.size}));
    }
    const eligible=rows.filter(r=>r.comfortable);
    manifest={version:1,fingerprint,sourceHashes,anchor:seed.id,anchorScore:seed.cktV51,anchorState:coupled.stateKey(anchor),baseline,stats:{...generated.stats,comfortableEndpoints:eligible.length,hardLegalHeadPerturbed:rows.filter(r=>r.headChanges).length,comfortableHeadPerturbed:eligible.filter(r=>r.headChanges).length,comfortablePureHead:eligible.filter(r=>r.headChanges&&!r.finalChanges).length,comfortableHeadMaps:new Set(eligible.map(r=>r.key.slice(0,36))).size,enumerationSeconds:(Date.now()-started)/1000},rows};
    // Compact, complete endpoint manifest; its content hash is frozen in progress.json.
    fs.writeFileSync(manifestFile,JSON.stringify(manifest));console.log(JSON.stringify({manifestReady:true,...manifest.stats}));
  }
  const jobs=manifest.rows.filter(r=>r.comfortable),prior=readJournal(journalFile),done=new Map();
  const expected=new Map(jobs.map(r=>[r.id,r]));
  for(const r of prior){if(done.has(r.id)||!expected.has(r.id)||r.key!==expected.get(r.id).key||r.fingerprint!==fingerprint||!Number.isFinite(r.score))throw Error('Journal coverage/contract mismatch');done.set(r.id,r);}
  const progress={version:1,fingerprint,manifestSha256:stream.fileHash(manifestFile),total:jobs.length,completedScores:done.size,completed:false,stats:manifest.stats,started:new Date().toISOString()};
  if(fs.existsSync(progressFile)){const previous=read(progressFile);if(previous.fingerprint!==fingerprint||previous.manifestSha256!==progress.manifestSha256)throw Error('Progress contract changed');progress.started=previous.started;}
  const update=()=>{progress.completedScores=done.size;progress.updated=new Date().toISOString();progress.bestScore=Math.min(...[...done.values()].map(r=>r.score),seed.cktV51);save(progressFile,progress);};
  update();const pending=jobs.filter(r=>!done.has(r.id)),workers=Array.from({length:Number(cli.workers||4)},()=>stream.launch());let cursor=0;
  console.log(JSON.stringify({scoring:true,total:jobs.length,remaining:pending.length,workers:workers.length}));
  try {
    await Promise.all(workers.map(w=>w.ready));
    await Promise.all(workers.map(async worker=>{
      while(cursor<pending.length) {
        const job=pending[cursor++],result=await worker.score({id:job.id,state:[...Buffer.from(job.key,'base64')]});
        if(result.id!==job.id||!Number.isFinite(result.score))throw Error('Invalid stream score');
        const row={...result,key:job.key,fingerprint};fs.appendFileSync(journalFile,JSON.stringify(row)+'\n');done.set(row.id,row);
        if(done.size%50===0){update();console.log(JSON.stringify({completed:done.size,total:jobs.length,bestScore:progress.bestScore,latestScore:row.score}));}
      }
    }));
  }finally{for(const w of workers)w.child.kill();update();}
  validateCoverage(jobs.map(r=>r.id),[...done.values()]);progress.scoringComplete=true;update();
  const auditor=closure.independentAuditor(data),baselineIndependent=auditor(template),improvements=[...done.values()].filter(r=>r.score<seed.cktV51-1e-10).sort((a,b)=>a.score-b.score);
  const independent=[];let best={id:seed.id,score:seed.cktV51,key:coupled.stateKey(anchor)};
  for(const row of improvements) {
    const entry=search.rebuild({...template,...coupled.expandState(Buffer.from(row.key,'base64')),id:row.id},data),audit=auditor(entry);
    const pass=audit.a7eV4<=baselineIndependent.a7eV4+1e-12&&audit.tracks.S2.e34<=baselineIndependent.tracks.S2.e34+1e-12;
    independent.push({id:row.id,score:row.score,pass,audit});if(pass){best=row;break;}
  }
  Object.assign(progress,{completed:true,bestId:best.id,bestScore:best.score,bestKey:best.key,rawMinimum:[...done.values()].sort((a,b)=>a.score-b.score)[0],improvements:improvements.length,baselineIndependent,independent,journalSha256:stream.fileHash(journalFile)});update();
  // update() intentionally tracks raw best during scoring; restore the admitted minimum.
  progress.rawBestScore=progress.bestScore;progress.bestScore=best.score;save(progressFile,progress);
  console.log(JSON.stringify({completed:true,bestId:best.id,bestScore:best.score,rawBestScore:progress.rawBestScore,improvements:improvements.length}));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={enumerateTwoStep,validateCoverage,readJournal};
