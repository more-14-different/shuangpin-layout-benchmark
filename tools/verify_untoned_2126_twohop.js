#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const search=require('./search_untoned_production_v51'),closure=require('./close_untoned_2126_double_empty');
const coupled=require('./search_untoned_2126_coupled'),stream=require('./untoned_v51_stream');
const exhaustive=require('./exhaust_untoned_2126_twohop');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function replayWitness(anchor,ops,operationPath) {
  // Buffer.slice shares its backing memory; normalize saved state at the boundary.
  const state=Uint8Array.from(anchor);
  return coupled.applyOperation(coupled.applyOperation(state,ops[operationPath[0]]),ops[operationPath[1]]);
}
function main() {
  const dir=path.join(ROOT,'research/.cache/untoned-2126-twohop-exhaustive'),manifestFile=path.join(dir,'manifest.json'),journalFile=path.join(dir,'scores.jsonl'),progressFile=path.join(dir,'progress.json');
  const progress=read(progressFile),manifest=read(manifestFile),scores=exhaustive.readJournal(journalFile);
  if(!progress.completed||!progress.scoringComplete||progress.completedScores!==progress.total)throw Error('Exhaustive search incomplete');
  if(progress.manifestSha256!==stream.fileHash(manifestFile)||progress.journalSha256!==stream.fileHash(journalFile))throw Error('Completed evidence changed');
  for(const [file,digest] of Object.entries(manifest.sourceHashes))if(stream.fileHash(file)!==digest)throw Error(`Source changed ${file}`);
  const jobs=manifest.rows.filter(r=>r.comfortable),rows=new Map(manifest.rows.map(r=>[r.id,r])),byId=new Map(scores.map(r=>[r.id,r]));
  exhaustive.validateCoverage(jobs.map(r=>r.id),scores);
  for(const r of scores)if(r.key!==rows.get(r.id).key||r.fingerprint!==manifest.fingerprint)throw Error('Score state/fingerprint differs');
  // applyOperation clones Uint8Array.slice(); Buffer.slice() would share memory.
  const anchor=Uint8Array.from(Buffer.from(manifest.anchorState,'base64')),ops=coupled.operations();
  for(const row of manifest.rows)if(coupled.stateKey(replayWitness(anchor,ops,row.path))!==row.key)throw Error(`Invalid two-operation witness ${row.id}`);
  const memoryFile=path.join(ROOT,'research/notes/2026-11-14-untoned-2126-twohop-memory-verification.json'),memory=read(memoryFile);
  if(!memory.passed||memory.manifestSha256!==progress.manifestSha256||memory.originalMR2Verified!==manifest.rows.length)throw Error('Original memory audit missing/stale');
  const headFile=path.join(ROOT,'research/notes/2026-11-14-untoned-2126-head-perturbations.json'),heads=read(headFile);
  if(!heads.completed||heads.manifestSha256!==progress.manifestSha256||heads.fullNativeHeadScores!==manifest.stats.comfortableHeadPerturbed)throw Error('Head representative audit incomplete/stale');
  const selected=new Set([progress.rawMinimum.id]);
  if(byId.has(progress.bestId))selected.add(progress.bestId);
  const validHeads=heads.rows.filter(r=>r.independentPass);
  const take=(pool,access,descending=false)=>{const r=[...pool].sort((a,b)=>(access(a)-access(b))*(descending?-1:1)||a.score-b.score)[0];if(r)selected.add(r.id);};
  take(validHeads,r=>r.score);take(validHeads,r=>r.erg.mx,true);take(validHeads,r=>r.erg.homeS2,true);take(validHeads,r=>r.erg.wMax);take(validHeads,r=>r.erg.rpMax);take(validHeads,r=>r.erg.yMax);
  take(validHeads,r=>r.independent.tracks.S2.e34);take(validHeads,r=>r.independent.a7eV4);
  take(jobs.filter(r=>!r.viaLegalIntermediate).map(r=>({...r,score:byId.get(r.id).score})),r=>r.score);
  const ctx=search.makeContext('D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'a7_CKT_R11.html'),path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
  const template=ctx.data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED'),auditor=closure.independentAuditor(ctx.data),results=[];
  const baselineNative=ctx.score(template);if(Math.abs(baselineNative.score-9.10299979136027)>1e-10)throw Error('Production native regression');
  for(const id of selected) {
    const row=byId.get(id),entry=search.rebuild({...template,...coupled.expandState(Buffer.from(row.key,'base64')),id},ctx.data),native=ctx.score(entry),difference=stream.compare(row,native),independent=auditor(entry);
    if(!Number.isFinite(native.score)||!Number.isFinite(difference))throw Error(`Nonfinite fresh verification ${id}`);
    const actualErg=search.ergonomics(entry,ctx.data,ctx.fixture,()=>({upperMs:0}));
    for(const [k,value] of Object.entries(rows.get(id).erg))if(Math.abs(actualErg[k]-value)>1e-12)throw Error(`Fresh comfort mismatch ${id}.${k}`);
    results.push({id,key:row.key,native,maximumAbsoluteDifference:difference,independent});console.log(JSON.stringify({freshJS:id,score:native.score,maximumAbsoluteDifference:difference}));
  }
  const historicalFiles=['research/notes/2026-11-14-untoned-2126-double-empty-closure.json','research/notes/2026-11-14-untoned-2126-coupled-basin.json'].map(f=>path.join(ROOT,f));
  const known=new Map();
  for(const file of historicalFiles){const archive=read(file);for(const [source,digest] of Object.entries(archive.sourceHashes))if(stream.fileHash(source)!==digest)throw Error(`Changed historical source ${source}`);for(const row of Object.values(archive.records))known.set(coupled.stateKey(coupled.compactState(row)),row);}
  const bestMeta=manifest.rows.find(r=>r.key===progress.bestKey),operationWitness=bestMeta.path.map(i=>{
    const isolated=coupled.applyOperation(anchor,ops[i]),cached=known.get(coupled.stateKey(isolated));
    return {label:ops[i].label,isolatedState:coupled.stateKey(isolated),historicalNativeScore:cached?.score??null};
  });
  const seed=read(path.join(ROOT,'research/config/untoned-2126-double-empty-closure-finalist.json'));
  const seedEntry=closure.materialize(seed,template,ctx.data),seedNative=ctx.score(seedEntry);if(Math.abs(seedNative.score-seed.cktV51)>1e-10)throw Error('Anchor native regression');
  const report={version:1,passed:true,progressSha256:stream.fileHash(progressFile),manifestSha256:progress.manifestSha256,journalSha256:progress.journalSha256,fingerprint:manifest.fingerprint,memoryVerificationSha256:stream.fileHash(memoryFile),headVerificationSha256:stream.fileHash(headFile),coverageVerified:scores.length,witnessesVerified:manifest.rows.length,baselineNative,seedNative,bestOperationWitness:operationWitness,historicalArchiveHashes:Object.fromEntries(historicalFiles.map(f=>[f,stream.fileHash(f)])),results};
  fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-14-untoned-2126-twohop-verification.json'),JSON.stringify(report,null,2)+'\n');
}
if(require.main===module)main();
module.exports={replayWitness};
