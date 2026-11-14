#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const search=require('./search_untoned_production_v51'),coupled=require('./search_untoned_2126_coupled'),closure=require('./close_untoned_2126_double_empty');
const exhaustive=require('./exhaust_untoned_2126_twohop'),recenter=require('./recenter_untoned_2126'),stream=require('./untoned_v51_stream');
const ROOT=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function ensure(condition,message) {if(!condition)throw Error(message);}
function pass(a,baseline) {return a.a7eV4<=baseline.a7eV4+1e-12&&a.tracks.S2.e34<=baseline.tracks.S2.e34+1e-12;}
function validateTracks(row) {
  ensure(Number.isFinite(row.score),'Nonfinite overall score');
  for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4']) {
    const track=row.modes?.[mode]?.[kind];ensure(track&&Number.isFinite(track.effectiveMs)&&track.count>0&&track.totalWeight>0,'Missing score track');
    ensure(Object.values(track).every(v=>typeof v==='number'&&Number.isFinite(v)),'Nonfinite track component');
  }
}
function main() {
  const checkpointFile=path.join(recenter.DIRECTORY,'checkpoint.json'),checkpoint=read(checkpointFile);
  ensure(checkpoint.completed,'Recenter search incomplete');recenter.validateSources(checkpoint.sourceHashes);
  ensure(stream.fileHash(checkpoint.scoreArchive)===checkpoint.scoreArchiveSha256,'Score archive changed');
  const scoreRows=zlib.gunzipSync(fs.readFileSync(checkpoint.scoreArchive)).toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
  const scores=new Map();for(const row of scoreRows){validateTracks(row);ensure(!scores.has(row.key),'Duplicate exported score');scores.set(row.key,row);}
  const source=recenter.setup();ensure(source.fingerprint===checkpoint.fingerprint,'Score context differs');
  const oldCenter=read(path.join(ROOT,'research/config/untoned-2126-double-empty-closure-finalist.json'));
  const headSwap=coupled.operations().find(o=>o.label==='initial:ch↔s');
  const oldHeadKey=coupled.stateKey(coupled.applyOperation(coupled.compactState(oldCenter),headSwap));
  const newHeadKey=coupled.stateKey(coupled.applyOperation(Uint8Array.from(Buffer.from(checkpoint.seed.key,'base64')),headSwap));
  const journalFile=path.join(recenter.DIRECTORY,'new-scores.jsonl'),journal=exhaustive.readJournal(journalFile),journalKeys=new Set();
  ensure(stream.fileHash(journalFile)===checkpoint.journalSha256,'Journal changed');
  for(const row of journal){ensure(!journalKeys.has(row.key),'Duplicate journal score');journalKeys.add(row.key);ensure(row.fingerprint===checkpoint.fingerprint,'Journal fingerprint differs');recenter.insertScore(source.scores,row,'verification journal');}
  ensure(journal.length===checkpoint.newScores,'New score count differs');
  const ops=coupled.operations(),required=new Set([checkpoint.seed.key]),allHard=new Set(),stageReports=[];
  let center=checkpoint.seed,phase='one';const selected=new Map([[center.key,{reason:'starting point',row:source.scores.get(center.key)}]]);
  for(const stage of checkpoint.stages) {
    ensure(stage.completed&&stage.anchorKey===center.key&&stage.kind===phase,'Broken stage/center chain');
    ensure(stream.fileHash(stage.manifestFile)===stage.manifestSha256,'Manifest changed');
    const manifest=read(stage.manifestFile);ensure(manifest.fingerprint===checkpoint.fingerprint&&manifest.anchorKey===stage.anchorKey&&manifest.kind===stage.kind,'Manifest contract differs');
    const anchor=Uint8Array.from(Buffer.from(stage.anchorKey,'base64')),seen=new Set();
    for(const row of manifest.rows) {
      ensure(!seen.has(row.key),'Duplicate endpoint');seen.add(row.key);allHard.add(row.key);
      let state=anchor;ensure(row.path.length===(stage.kind==='one'?1:2),'Incorrect operation depth');
      for(const i of row.path){ensure(Number.isInteger(i)&&i>=0&&i<ops.length,'Invalid operation index');state=coupled.applyOperation(state,ops[i]);}
      ensure(coupled.stateKey(state)===row.key,'Invalid endpoint witness');
      const comfortable=search.comfort(row,checkpoint.baseline);ensure(comfortable===row.comfortable,'Comfort flag differs');
      if(row.comfortable)required.add(row.key);
    }
    const eligible=manifest.rows.filter(r=>r.comfortable),values=eligible.map(r=>{const score=scores.get(r.key);ensure(score,'Missing scored endpoint');return score;});
    ensure(stage.total===eligible.length&&stage.finished===eligible.length&&stage.stats.comfortable===eligible.length,'Stage completion count differs');
    ensure(stage.stats.previouslyScored+stage.stats.unscored===eligible.length,'Stage reuse/new counts differ');
    exhaustive.validateCoverage(eligible.map(r=>r.id),values);
    const improving=values.filter(r=>r.score<center.score-1e-10).sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key));
    ensure(improving.length===stage.improvingEndpoints,'Improvement count differs');
    const audits=stage.independentAudits;ensure(audits.length<=improving.length,'Unexpected independent audit');
    for(let i=0;i<audits.length;i++) {
      const a=audits[i];ensure(a.key===improving[i].key&&Math.abs(a.score-improving[i].score)<=1e-10,'Independent audit order differs');
      ensure(a.pass===pass(a.independent,checkpoint.baselineIndependent),'Independent gate differs');
      if(i<audits.length-1)ensure(!a.pass,'Ignored admitted improvement');
      selected.set(a.key,{reason:'winner-admission prefix',row:scores.get(a.key)});
    }
    const admitted=audits.at(-1)?.pass;
    ensure(admitted||audits.length===improving.length,'Unchecked lower score');
    const next=admitted?scores.get(audits.at(-1).key):center;
    ensure(next.key===stage.bestKey&&Math.abs(next.score-stage.bestScore)<=1e-10,'Stage winner differs');
    ensure(Math.abs(center.score-next.score-stage.gain)<=1e-10,'Stage gain differs');
    const minimum=[...values].sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key))[0];selected.set(minimum.key,{reason:'stage raw minimum',row:minimum});
    const winner=manifest.rows.find(r=>r.key===stage.bestKey);
    stageReports.push({index:stage.index,kind:stage.kind,hardLegal:manifest.rows.length,comfortable:eligible.length,bestKey:stage.bestKey,bestScore:stage.bestScore,gain:stage.gain,winnerOperations:winner?.path.map(i=>ops[i].label)??[]});
    center=next;phase=stage.gain>1e-10?'one':stage.kind==='one'?'two':'done';
  }
  ensure(phase==='done'&&center.key===checkpoint.bestKey&&Math.abs(center.score-checkpoint.bestScore)<=1e-10,'Final one/two-step closure is unproved');
  ensure(checkpoint.stages.reduce((n,s)=>n+s.stats.unscored,0)===journal.length,'Stage new-score coverage differs');
  ensure(required.size===scores.size&&[...required].every(k=>scores.has(k)),'Exported score coverage differs');
  for(const row of scores.values()){const original=source.scores.get(row.key);ensure(original,'Export has unproven score');const difference=stream.compare(row,original);ensure(Number.isFinite(difference),'Nonfinite provenance comparison');}
  const finalStage=checkpoint.stages.at(-1),finalManifest=read(finalStage.manifestFile),finalAnchor=Uint8Array.from(Buffer.from(finalStage.anchorKey,'base64'));
  const regenerated=exhaustive.enumerateTwoStep(finalAnchor,ops,coupled.makeGuard(source.data),undefined,x=>console.log(JSON.stringify({coverageRegeneration:true,...x})));
  ensure(regenerated.endpoints.size===finalManifest.rows.length&&finalManifest.rows.every(r=>regenerated.endpoints.has(r.key)),'Regenerated final two-hop coverage differs');
  const memoryFile=path.join(ROOT,'research/notes/2026-11-15-untoned-2126-recenter-memory-verification.json'),memory=read(memoryFile);
  ensure(memory.passed&&memory.fingerprint===checkpoint.fingerprint&&memory.uniqueHardLegalVerified===allHard.size&&memory.stages.length===checkpoint.stages.length,'Original M-R2 audit incomplete');
  for(const stage of checkpoint.stages)ensure(memory.stages.find(s=>s.index===stage.index)?.manifestSha256===stage.manifestSha256,'Memory audit stage differs');
  const finalHeads=finalManifest.rows.filter(r=>r.comfortable&&r.headChanges).map(r=>({...r,...scores.get(r.key)})).sort((a,b)=>a.score-b.score);
  if(finalHeads.length)selected.set(finalHeads[0].key,{reason:'final head-perturbed minimum',row:finalHeads[0]});
  const expectedAudits=new Map(checkpoint.stages.flatMap(s=>s.independentAudits).map(a=>[a.key,a]));
  const ctx=search.makeContext(source.args.snow,source.args.html,source.args.fixture),auditor=closure.independentAuditor(ctx.data),template=ctx.data.entries.find(e=>e.id===source.template.id),baseline=auditor(template),results=[];
  ensure(Math.abs(baseline.a7eV4-checkpoint.baselineIndependent.a7eV4)<=1e-12&&Math.abs(baseline.tracks.S2.e34-checkpoint.baselineIndependent.tracks.S2.e34)<=1e-12,'Baseline independent audit changed');
  const productionNative=ctx.score(template);ensure(Math.abs(productionNative.score-9.10299979136027)<=1e-10,'Native production regression');
  for(const [key,item] of selected) {
    const entry=search.rebuild({...template,...coupled.expandState(Buffer.from(key,'base64')),id:recenter.idFor(key)},ctx.data),native=ctx.score(entry),difference=stream.compare(native,item.row),independent=auditor(entry);
    ensure(Number.isFinite(difference)&&Number.isFinite(native.score),'Nonfinite fresh score');
    const expectedAudit=expectedAudits.get(key);
    if(expectedAudit) {
      ensure(pass(independent,baseline)===expectedAudit.pass,'Fresh winner-admission gate differs');
      ensure(Math.abs(independent.a7eV4-expectedAudit.independent.a7eV4)<=1e-10&&Math.abs(independent.tracks.S2.e34-expectedAudit.independent.tracks.S2.e34)<=1e-10,'Fresh independent metrics differ');
    }
    if(key===checkpoint.bestKey)ensure(pass(independent,baseline),'Final winner fails fresh independent gates');
    results.push({key,id:recenter.idFor(key),reason:item.reason,native,maximumAbsoluteDifference:difference,independent,independentPass:pass(independent,baseline)});
    console.log(JSON.stringify({freshJS:recenter.idFor(key),score:native.score,maximumAbsoluteDifference:difference,pass:pass(independent,baseline)}));
  }
  const headContext={operation:headSwap.label,oldCenter:{key:coupled.stateKey(coupled.compactState(oldCenter)),score:oldCenter.cktV51},oldHeadSwap:source.scores.get(oldHeadKey),newCenter:checkpoint.seed,newHeadSwap:source.scores.get(newHeadKey)};
  ensure(headContext.oldHeadSwap&&headContext.newHeadSwap,'Missing head-context comparison');
  const report={version:1,passed:true,checkpointSha256:stream.fileHash(checkpointFile),fingerprint:checkpoint.fingerprint,sourceHashes:checkpoint.sourceHashes,scoreArchiveSha256:checkpoint.scoreArchiveSha256,newScoresVerified:journal.length,uniqueScoreCoverage:required.size,uniqueHardLegalVerified:allHard.size,regeneratedFinalTwoHop:true,stageReports,memoryVerificationSha256:stream.fileHash(memoryFile),verifierSha256:stream.fileHash(__filename),productionNative,baselineIndependent:baseline,headContext,results};
  fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-15-untoned-2126-recenter-verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,newScores:journal.length,uniqueCoverage:required.size,stages:stageReports.length,best:checkpoint.bestScore}));
}
if(require.main===module)main();
module.exports={validateTracks};
