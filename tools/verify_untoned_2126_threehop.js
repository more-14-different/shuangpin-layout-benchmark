#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const explore=require('./explore_untoned_2126_threehop'),recenter=require('./recenter_untoned_2126'),coupled=require('./search_untoned_2126_coupled');
const search=require('./search_untoned_production_v51'),closure=require('./close_untoned_2126_double_empty'),stream=require('./untoned_v51_stream');
const {validateTracks}=require('./verify_untoned_2126_recenter');
const ROOT=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(f,'utf8')),stateOf=k=>Uint8Array.from(Buffer.from(k,'base64'));
function ensure(ok,message){if(!ok)throw Error(message);}
function pass(a,b){return a.a7eV4<=b.a7eV4+1e-12&&a.tracks.S2.e34<=b.tracks.S2.e34+1e-12;}
function sameSet(expected,actual,message){ensure(expected.size===actual.size&&[...expected].every(k=>actual.has(k)),message);}
function main(){
  const dir=explore.DIRECTORY,file=path.join(dir,'checkpoint.json'),p=read(file);ensure(p.completed&&p.finalClosed,'Exploration incomplete');recenter.validateSources(p.sourceHashes);
  const ctx=explore.setup();ensure(ctx.fingerprint===p.fingerprint,'Exploration fingerprint differs');
  const originallyChosenCenters=explore.chooseCenters(ctx,coupled.operations());
  ensure(stream.fileHash(p.scoreArchive)===p.scoreArchiveSha256,'Score archive changed');
  const rows=zlib.gunzipSync(fs.readFileSync(p.scoreArchive)).toString('utf8').trim().split('\n').map(JSON.parse),scores=new Map();
  for(const row of rows){validateTracks(row);ensure(!scores.has(row.key),'Duplicate exported state');scores.set(row.key,row);}
  const journalFile=path.join(dir,'new-scores.jsonl');ensure(stream.fileHash(journalFile)===p.journalSha256,'Journal changed');
  const journal=fs.readFileSync(journalFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),newKeys=new Set();
  for(const row of journal){validateTracks(row);ensure(row.fingerprint===p.fingerprint&&!newKeys.has(row.key),'Invalid journal contract/duplicate');newKeys.add(row.key);recenter.insertScore(ctx.scores,row,'verification journal');}
  ensure(journal.length===p.newScores,'New score count differs');
  const required=new Set([p.start.key,...p.centers.map(c=>c.key)]),hard=new Set(),ops=coupled.operations(),guard=coupled.makeGuard(ctx.data),freshSelected=new Map(),manifests=new Map();
  let globalKey=p.start.key,globalScore=p.start.score;freshSelected.set(globalKey,'starting point');
  const stageReports=[];
  for(const stage of p.stages){
    ensure(stage.completed&&stream.fileHash(stage.manifestFile)===stage.manifestSha256,'Incomplete/changed stage');
    const m=read(stage.manifestFile);manifests.set(stage.label,m);ensure(m.fingerprint===p.fingerprint&&m.anchorKey===stage.anchorKey,'Stage contract differs');
    const anchor=stateOf(stage.anchorKey),seen=new Set(),eligible=[];
    for(const row of m.rows){ensure(!seen.has(row.key),'Duplicate endpoint');seen.add(row.key);hard.add(row.key);let state=anchor;
      ensure(row.path.length===(stage.kind==='three'?3:1),'Wrong path depth');
      for(const i of row.path){ensure(Number.isInteger(i)&&i>=0&&i<ops.length,'Invalid operation');state=coupled.applyOperation(state,ops[i]);}
      ensure(coupled.stateKey(state)===row.key&&guard(state),'Invalid endpoint witness');
      const entry=search.rebuild({...ctx.template,...coupled.expandState(state)},ctx.data),audit=search.audit(entry,ctx.data),erg=search.ergonomics(entry,ctx.data,ctx.fixture,()=>({upperMs:0}));
      ensure(search.legal({audit},ctx.baseline),'Full hard legality differs');
      for(const [k,v]of Object.entries(row.audit))ensure(audit[k]===v,'Saved hard audit differs');
      for(const [k,v]of Object.entries(row.erg))ensure(Number.isFinite(v)&&Math.abs(erg[k]-v)<=1e-12,'Fresh comfort metric differs');
      ensure(search.comfort({erg},ctx.baseline)===row.comfortable,'Comfort classification differs');
      if(row.comfortable){required.add(row.key);eligible.push(scores.get(row.key));ensure(scores.has(row.key),'Missing score');}
    }
    ensure(stage.finished===eligible.length&&stage.total===eligible.length&&stage.stats.comfortable===eligible.length,'Stage score coverage count differs');
    ensure(stage.stats.previouslyScored+stage.stats.unscored===eligible.length,'Stage reuse count differs');
    const improving=eligible.filter(r=>r.score<stage.anchorScore-1e-10).sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key));
    ensure(improving.length===stage.improvingEndpoints,'Improvement count differs');
    const audits=stage.independentAudits;ensure(audits.length<=improving.length,'Extra independent audits');
    for(let i=0;i<audits.length;i++){const a=audits[i];ensure(a.key===improving[i].key&&Math.abs(a.score-improving[i].score)<=1e-10,'Admission prefix differs');ensure(pass(a.independent,p.baselineIndependent)===a.pass,'Admission gate differs');if(i<audits.length-1)ensure(!a.pass,'Skipped admitted winner');freshSelected.set(a.key,'winner admission');}
    const accepted=audits.at(-1)?.pass;ensure(accepted||audits.length===improving.length,'Unchecked improving endpoint');
    const bestKey=accepted?audits.at(-1).key:stage.anchorKey,bestScore=scores.get(bestKey).score;
    ensure(stage.bestKey===bestKey&&Math.abs(stage.bestScore-bestScore)<=1e-10&&Math.abs(stage.gain-(stage.anchorScore-bestScore))<=1e-10,'Stage winner differs');
    if(accepted&&bestScore<globalScore-1e-10){globalKey=bestKey;globalScore=bestScore;}
    const raw=[...eligible].sort((a,b)=>a.score-b.score)[0];if(stage.kind==='three')freshSelected.set(raw.key,'three-hop raw minimum');
    const winner=m.rows.find(r=>r.key===bestKey);
    stageReports.push({index:stage.index,label:stage.label,kind:stage.kind,anchorKey:stage.anchorKey,anchorScore:stage.anchorScore,bestKey,bestScore,gain:stage.gain,rawMinimum:raw.score,stats:stage.stats,winnerOperations:winner?.path.map(i=>ops[i].label)??[]});
  }
  ensure(p.stages.reduce((n,s)=>n+s.stats.unscored,0)===journal.length,'New-score union differs');sameSet(required,new Set(scores.keys()),'Exported score state set differs');
  for(const row of scores.values()){ensure(ctx.scores.has(row.key),'Unproven score provenance');ensure(Number.isFinite(stream.compare(row,ctx.scores.get(row.key))),'Nonfinite provenance comparison');}
  ensure(globalKey===p.globalKey&&globalKey===p.bestKey&&Math.abs(globalScore-p.bestScore)<=1e-10,'Global winner differs');
  const root=manifests.get('three-hop-slices'),anchor=stateOf(p.start.key),bridges=explore.selectBridges(ctx.rootManifest,ctx.scores,anchor,ops),structured=explore.extendBridges(bridges,ops,guard),sampled=explore.sampleTriples(anchor,ops,guard,p.options.sampledTriples,p.options.randomSeed);
  ensure(JSON.stringify(structured.stats)===JSON.stringify(root.stats.structured)&&JSON.stringify(sampled.stats)===JSON.stringify(root.stats.sampled),'Regenerated path/sample counters differ');
  for(const [k,row]of sampled.endpoints)if(!structured.endpoints.has(k))structured.endpoints.set(k,row);
  sameSet(new Set(root.rows.map(r=>r.key)),new Set(structured.endpoints.keys()),'Three-hop slices/sample regeneration differs');
  sameSet(new Set(root.selection.bridges.map(r=>r.key)),new Set(bridges.map(r=>r.key)),'Bridge selection differs');
  const chosen=originallyChosenCenters;ensure(chosen.length===p.centers.length&&chosen.every((r,i)=>r.key===p.centers[i].key),'Alternative center selection differs');
  const auditedCenterStarts=p.centers.filter(c=>c.initialIndependent);ensure(auditedCenterStarts.length===p.centers.length&&auditedCenterStarts.every(c=>c.initialPass===pass(c.initialIndependent,p.baselineIndependent)),'Initial center gate report differs');
  for(const c of p.centers){ensure(c.completed,'Alternative center incomplete');let key=c.key;for(let round=0;round<c.round;round++){const stage=p.stages.find(s=>s.label===`center-${c.index}-${round}`);ensure(stage&&stage.anchorKey===key,'Alternative center chain differs');key=stage.bestKey;}ensure(key===c.currentKey,'Alternative endpoint differs');const last=p.stages.find(s=>s.label===`center-${c.index}-${c.round-1}`);ensure(c.oneHopClosed===(last.gain<=1e-10),'Center closure flag differs');ensure(c.oneHopClosed||c.round===p.options.maximumCenterRounds,'Unexpected center stop');freshSelected.set(c.currentKey,`alternative center ${c.index} endpoint`);}
  const finalStage=p.stages.find(s=>s.label===`final-${p.finalRound-1}`);ensure(finalStage&&finalStage.anchorKey===p.bestKey&&finalStage.gain<=1e-10,'Final one-hop closure differs');
  for(const stage of p.stages.filter(s=>s.kind==='one')){const regenerated=recenter.enumerateSingle(stateOf(stage.anchorKey),ops,guard);sameSet(new Set(manifests.get(stage.label).rows.map(r=>r.key)),new Set(regenerated.endpoints.keys()),'One-hop neighborhood regeneration differs');}
  const memoryFile=path.join(ROOT,'research/notes/2026-11-15-untoned-2126-threehop-memory-verification.json'),memory=read(memoryFile);ensure(memory.passed&&memory.fingerprint===p.fingerprint&&memory.uniqueHardLegalVerified===hard.size&&memory.stages.length===p.stages.length,'Original memory audit incomplete');for(const stage of p.stages)ensure(memory.stages.find(s=>s.index===stage.index)?.manifestSha256===stage.manifestSha256,'Memory stage differs');
  freshSelected.set(p.bestKey,'global winner');
  const native=search.makeContext(ctx.args.snow,ctx.args.html,ctx.args.fixture),auditor=closure.independentAuditor(native.data),baseline=auditor(native.data.entries.find(e=>e.id===ctx.template.id)),results=[];
  ensure(Math.abs(baseline.a7eV4-p.baselineIndependent.a7eV4)<=1e-10&&Math.abs(baseline.tracks.S2.e34-p.baselineIndependent.tracks.S2.e34)<=1e-10,'Independent baseline differs');
  const admissionAudits=new Map(p.stages.flatMap(s=>s.independentAudits).map(a=>[a.key,a]));
  for(const [key,reason]of freshSelected){const entry=search.rebuild({...ctx.template,...coupled.expandState(stateOf(key)),id:recenter.idFor(key)},native.data),score=native.score(entry),difference=stream.compare(score,scores.get(key)),independent=auditor(entry);ensure(Number.isFinite(difference),'Nonfinite fresh comparison');if(key===p.bestKey)ensure(pass(independent,baseline),'Fresh global winner inadmissible');const prior=admissionAudits.get(key);if(prior)ensure(pass(independent,baseline)===prior.pass&&Math.abs(independent.a7eV4-prior.independent.a7eV4)<=1e-10&&Math.abs(independent.tracks.S2.e34-prior.independent.tracks.S2.e34)<=1e-10,'Fresh admission audit differs');results.push({id:recenter.idFor(key),key,reason,native:score,maximumAbsoluteDifference:difference,independent,independentPass:pass(independent,baseline)});console.log(JSON.stringify({freshJS:recenter.idFor(key),score:score.score,pass:pass(independent,baseline),difference}));}
  const report={version:1,passed:true,fingerprint:p.fingerprint,checkpointSha256:stream.fileHash(file),verifierSha256:stream.fileHash(__filename),scoreArchiveSha256:p.scoreArchiveSha256,journalSha256:p.journalSha256,uniqueScoreCoverage:scores.size,newScoresVerified:journal.length,uniqueHardLegalVerified:hard.size,regeneratedThreeHopPool:true,regeneratedOneHopStages:true,memoryVerificationSha256:stream.fileHash(memoryFile),stageReports,results};
  fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-15-untoned-2126-threehop-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,stages:p.stages.length,best:p.bestScore,newScores:journal.length,scoreCoverage:scores.size}));
}
if(require.main===module)main();
module.exports={sameSet};
