#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const anneal=require('./anneal_untoned_2126_v51'),coupled=require('./search_untoned_2126_coupled'),recenter=require('./recenter_untoned_2126');
const search=require('./search_untoned_production_v51'),closure=require('./close_untoned_2126_double_empty'),stream=require('./untoned_v51_stream');
const {validateTracks}=require('./verify_untoned_2126_recenter');
const ROOT=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(f,'utf8')),stateOf=k=>Uint8Array.from(Buffer.from(k,'base64'));
function ensure(ok,message){if(!ok)throw Error(message);}
function pass(a,b){return a.a7eV4<=b.a7eV4+1e-12&&a.tracks.S2.e34<=b.tracks.S2.e34+1e-12;}
function sameKeys(a,b,message){ensure(a.size===b.size&&[...a].every(k=>b.has(k)),message);}
function verifyProposal(row,ops,guard,apply=coupled.applyOperation){
  const coarse=row.phase==='coarse',walk=row.proposalKind==='hard-legal random walk',raw=row.proposalKind==='unrestricted compound, final hard gate';
  if(coarse){ensure(walk||raw,'Unrecognized coarse proposal kind');ensure([2,3,4,8].includes(row.path.length),'Invalid coarse path length');if(raw)ensure(row.path.length<=4,'Raw compound path length exceeds four');}
  else ensure(row.phase==='fine'&&row.path.length===1&&row.proposalKind==='complete one-hop fine neighborhood','Invalid fine path length or kind');
  let state=stateOf(row.fromKey);for(const index of row.path){ensure(Number.isInteger(index)&&index>=0&&index<ops.length,'Invalid operation index');const next=apply(state,ops[index]);if(walk)ensure(coupled.distance(next,state)>0&&guard(next),'Declared legal walk has an invalid intermediate');state=next;}
  ensure(coupled.stateKey(state)===row.key&&guard(state),'Proposal endpoint or final hard guard differs');return state;
}
function routeTrace(seeds,campaigns){
  const live=[...seeds];let cycle=0;const reheat=new Set(),applied=new Set();
  function fineCompleted(c,known){if(applied.has(c))return;for(const campaign of campaigns.filter(x=>x.cycle===c)){ensure(known(campaign.bestKey),'Fine route update refers to a future state');live[campaign.chain]=campaign.bestKey;}applied.add(c);}
  return {coarse(row,reservoir,known){
    if(row.cycle!==cycle){ensure(row.cycle===cycle+1,'Route skipped a cooling cycle');fineCompleted(cycle,known);cycle=row.cycle;for(let i=cycle%4;i<live.length;i+=4)reheat.add(i);}
    if(reheat.has(row.chain)){ensure(reservoir.has(row.fromKey),'Reheated route source outside its reservoir');live[row.chain]=row.fromKey;reheat.delete(row.chain);}
    ensure(live[row.chain]===row.fromKey,'Coarse proposal source is not the live route state');if(row.accepted)live[row.chain]=row.key;
  },finish(phase,known,finalKeys,reservoir){
    if(phase==='fine')fineCompleted(cycle,known);
    for(const i of reheat){ensure(finalKeys&&reservoir?.has(finalKeys[i])&&known(finalKeys[i]),'Unproposed reheated route is outside the reservoir');live[i]=finalKeys[i];}
    return [...live];
  }};
}
function main(){
  const checkpointFile=path.join(anneal.DIRECTORY,'checkpoint.json'),p=read(checkpointFile);
  ensure(p.completed&&!p.pending,'Anneal run incomplete');ensure(p.totalNew===100000&&p.options.newFullScores===100000,'The requested budget is not exactly 100000');
  recenter.validateSources(p.sourceHashes);const ctx=anneal.setup();ensure(ctx.fingerprint===p.fingerprint,'Anneal context differs');
  const journalFile=path.join(anneal.DIRECTORY,'scores.jsonl');ensure(stream.fileHash(journalFile)===p.scoreJournalSha256,'Score journal changed');
  const rows=fs.readFileSync(journalFile,'utf8').split('\n').filter(Boolean).map(JSON.parse);ensure(rows.length===100000,'Journal count differs');
  const imported=new Set(ctx.scores.keys()),seen=new Set(),metadata=new Map(),waves=new Map(),campaignRows=new Map(),cycles=new Map(),ops=coupled.operations(),guard=coupled.makeGuard(ctx.data);
  const describe=key=>{if(metadata.has(key))return metadata.get(key);const score=ctx.scores.get(key);ensure(score,'Unproven predecessor state');const entry=search.rebuild({...ctx.template,...coupled.expandState(stateOf(key))},ctx.data),erg=search.ergonomics(entry,ctx.data,ctx.fixture,()=>({upperMs:0}));delete erg.motor;const row={key,score:score.score,erg,characterMotor:(score.modes.keytao.character.motorUpperMs+score.modes.sanpin.character.motorUpperMs)/2};metadata.set(key,row);return row;};
  const initialSeeds=anneal.selectSeeds(ctx,key=>describe(key));ensure(initialSeeds.length===p.seeds.length&&initialSeeds.every((key,i)=>key===p.seeds[i]),'Initial route seed selection differs');
  let frontier=[];for(const key of p.seeds){ensure(imported.has(key),'Unproven seed');const row=describe(key);if(search.comfort(row,ctx.baseline))frontier=anneal.updateFrontier(frontier,row);}
  let rawKey=ctx.startKey,rawScore=ctx.start.cktV51,coarse=0,fine=0,accepted=0;
  const routes=routeTrace(p.seeds,p.campaigns);let reservoirCycle=0,reservoir=new Set(p.seeds);
  for(let index=0;index<rows.length;index++){
    const r=rows[index];validateTracks(r);ensure(r.fingerprint===p.fingerprint&&!seen.has(r.key)&&!imported.has(r.key),'Journal fingerprint, duplicate, or newness differs');
    ensure(r.id===recenter.idFor(r.key)&&['coarse','fine'].includes(r.phase),'Score ID or phase differs');
    ensure(Number.isInteger(r.chain)&&r.chain>=0&&r.chain<p.chains.length&&r.profile===anneal.PROFILES[r.chain],'Route/profile differs');
    ensure(ctx.scores.has(r.fromKey),'Predecessor was not scored before the proposal');
    const state=verifyProposal(r,ops,guard);
    const entry=search.rebuild({...ctx.template,...coupled.expandState(state)},ctx.data),audit=search.audit(entry,ctx.data),erg=search.ergonomics(entry,ctx.data,ctx.fixture,()=>({upperMs:0}));delete erg.motor;
    ensure(search.legal({audit},ctx.baseline),'Full hard audit failed');for(const[k,v]of Object.entries(r.audit))ensure(audit[k]===v,'Saved hard audit differs');for(const[k,v]of Object.entries(r.erg))ensure(Number.isFinite(v)&&Math.abs(erg[k]-v)<=1e-12,'Saved comfort metric differs');
    const characterMotor=(r.modes.keytao.character.motorUpperMs+r.modes.sanpin.character.motorUpperMs)/2;ensure(Math.abs(characterMotor-r.characterMotor)<=1e-12,'Native character motion diagnostic differs');
    const before=anneal.energy(describe(r.fromKey),r.profile,ctx.baselineEnergy),after=anneal.energy(r,r.profile,ctx.baselineEnergy);ensure(Number.isFinite(before)&&Number.isFinite(after)&&Math.abs(before-r.energyBefore)<=1e-12&&Math.abs(after-r.energyAfter)<=1e-12,'Exploration energy differs');
    ensure(r.accepted===(r.phase==='coarse'&&anneal.acceptMove(before,after,r.temperature,r.u)),'Annealing acceptance differs');
    if(r.phase==='coarse'){if(r.cycle!==reservoirCycle){reservoirCycle=r.cycle;reservoir=new Set([...p.seeds,...frontier.map(x=>x.key)]);}routes.coarse(r,reservoir,key=>ctx.scores.has(key));}
    const wave=waves.get(r.wave)||{cycle:r.cycle,phase:r.phase,rows:[]};ensure(wave.cycle===r.cycle&&wave.phase===r.phase,'Mixed wave metadata');wave.rows.push(r);waves.set(r.wave,wave);
    const cycle=cycles.get(r.cycle)||{coarse:0,fine:0,fineStarted:false};if(r.phase==='coarse'){ensure(!cycle.fineStarted,'Coarse phase returned without reheating');cycle.coarse++;coarse++;accepted+=Number(r.accepted);}else{cycle.fineStarted=true;cycle.fine++;fine++;const list=campaignRows.get(r.campaign)||[];list.push(r);campaignRows.set(r.campaign,list);}cycles.set(r.cycle,cycle);
    recenter.insertScore(ctx.scores,r,'verified annealing journal');metadata.set(r.key,{key:r.key,score:r.score,erg:r.erg,characterMotor:r.characterMotor});seen.add(r.key);
    if(search.comfort(r,ctx.baseline)){frontier=anneal.updateFrontier(frontier,r);if(r.score<rawScore){rawScore=r.score;rawKey=r.key;}}
    if((index+1)%10000===0)console.log(JSON.stringify({ledgerVerified:index+1,total:rows.length,rawComfortMinimum:rawScore,frontier:frontier.length}));
  }
  ensure(coarse===p.coarseNew&&fine===p.fineNew&&coarse+fine===100000&&accepted===p.acceptedCoarse&&coarse===p.attemptedCoarse,'Phase or acceptance counters differ');
  const finalRoutes=routes.finish(p.phase,key=>ctx.scores.has(key),p.chains.map(c=>c.key),reservoir);ensure(finalRoutes.every((key,i)=>key===p.chains[i].key),'Final route state reconstruction differs');
  ensure(waves.size===p.wave,'Wave count differs');let expectedWave=0;const coarseBefore=new Map();
  for(const[waveIndex,w]of waves){ensure(waveIndex===expectedWave++,'Nonconsecutive wave order');if(w.phase==='coarse'){ensure(new Set(w.rows.map(r=>r.chain)).size===w.rows.length,'Concurrent proposals share a route');const n=coarseBefore.get(w.cycle)||0;for(const r of w.rows){const f=n/p.options.coarseNewPerCycle,t=(p.options.coarseTemperatureStart*(1-f)+p.options.coarseTemperatureEnd*f)*(r.chain%4===3?p.options.roamingTemperatureMultiplier:1);ensure(Math.abs(t-r.temperature)<=1e-12&&r.u>=0&&r.u<1,'Cooling schedule or random acceptance draw differs');}coarseBefore.set(w.cycle,n+w.rows.length);}}
  for(const[i,c]of cycles){ensure(c.coarse<=p.options.coarseNewPerCycle,'Coarse phase exceeded allocation');if(c.fine)ensure(c.coarse===p.options.coarseNewPerCycle,'Fine phase began early');if(i<p.cycle)ensure(c.fine>=p.options.fineNewPerCycle,'Cycle reheated before completing fine allocation');}
  sameKeys(new Set(frontier.map(r=>r.key)),new Set(p.frontier.map(r=>r.key)),'Regenerated frontier differs');ensure(rawKey===p.rawBestKey&&Math.abs(rawScore-p.rawBestScore)<=1e-10,'Raw comfort winner differs');
  for(const c of [...p.campaigns,...(p.fineCampaign?[p.fineCampaign]:[])]){
    ensure(stream.fileHash(c.manifestFile)===c.manifestSha256,'Fine manifest changed');const m=read(c.manifestFile);ensure(m.fingerprint===p.fingerprint&&m.anchorKey===c.anchorKey&&m.profile===c.profile,'Fine manifest contract differs');
    const regenerated=recenter.enumerateSingle(stateOf(c.anchorKey),ops,guard);sameKeys(new Set(m.rows.map(r=>r.key)),new Set(regenerated.endpoints.keys()),'Fine one-hop coverage differs');
    const ownRows=campaignRows.get(c.id)||[];ensure(ownRows.length===c.scoredNew&&ownRows.every(r=>r.fromKey===c.anchorKey&&r.profile===c.profile),'Fine new-score accounting differs');
    if(c.completed){let best=c.anchorKey,value=anneal.energy(describe(best),c.profile,ctx.baselineEnergy);for(const r of m.rows){ensure(ctx.scores.has(r.key),'Completed fine campaign has unscored endpoint');const e=anneal.energy(describe(r.key),c.profile,ctx.baselineEnergy);if(e<value-1e-12){best=r.key;value=e;}}ensure(best===c.bestKey&&Math.abs(value-c.bestEnergy)<=1e-12&&c.oneHopEnergyClosed===(best===c.anchorKey),'Fine winner/closure differs');}
  }
  const memoryFile=path.join(ROOT,'research/notes/2026-11-15-untoned-2126-anneal-100k-memory-verification.json'),memory=read(memoryFile);ensure(memory.passed&&memory.completedAtSnapshot&&memory.fingerprint===p.fingerprint&&memory.uniqueNewHardLegalVerified===100000&&memory.journalSha256===p.scoreJournalSha256,'Original M-R2 verification incomplete');
  const improving=rows.filter(r=>search.comfort(r,ctx.baseline)&&r.score<ctx.start.cktV51-1e-10).sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key));ensure(improving.length===p.strictComfortImproving,'Improvement count differs');
  const audits=p.independentAudits;ensure(audits.length<=improving.length,'Unexpected independent audit count');for(let i=0;i<audits.length;i++){const a=audits[i];ensure(a.key===improving[i].key&&a.pass===pass(a.independent,p.baselineIndependent),'Final admission prefix differs');if(i<audits.length-1)ensure(!a.pass,'Skipped admitted winner');}const last=audits.at(-1);ensure(last?.pass||audits.length===improving.length,'Unchecked lower CKT');ensure(p.bestKey===(last?.pass?last.key:ctx.startKey),'Admitted best state differs');
  const chosen=new Map([[ctx.startKey,'previous best'],[p.bestKey,'admitted annealing best'],[p.rawBestKey,'raw comfort minimum']]);
  chosen.set(coupled.stateKey(coupled.compactState(ctx.template)),'current production reference');
  const newComfortMinimum=rows.filter(r=>search.comfort(r,ctx.baseline)).sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key))[0];if(newComfortMinimum)chosen.set(newComfortMinimum.key,'newly scored comfort minimum');
  const hardMinimum=rows.reduce((a,b)=>a.score<b.score?a:b);chosen.set(hardMinimum.key,'hard-legal minimum; comfort may fail');
  const earlyFile=path.join(anneal.DIRECTORY,'early-fresh-check.json');if(fs.existsSync(earlyFile)){const early=read(earlyFile);ensure(early.passed&&early.fingerprint===p.fingerprint&&seen.has(early.key)&&Number.isFinite(early.difference)&&early.difference<=1e-9,'Early cross-check differs');chosen.set(early.key,'early new head-map cross-check');}
  const dKey=coupled.stateKey(coupled.compactState(read(path.join(ROOT,'research/config/untoned-2126-double-empty-closure-finalist.json'))));chosen.set(dKey,'balanced production challenger reference');
  const pool=frontier.filter(r=>r.score<=9.10299979136027);for(const[metric,descending]of [['mx',true],['homeS2',true],['wMax',false]]){const r=[...pool].sort((a,b)=>(a.erg[metric]-b.erg[metric])*(descending?-1:1)||a.score-b.score)[0];if(r)chosen.set(r.key,`frontier ${metric}`);}const motor=[...pool].sort((a,b)=>a.characterMotor-b.characterMotor||a.score-b.score)[0];if(motor)chosen.set(motor.key,'frontier character motion');
  const balanced=pool.filter(r=>r.score<ctx.scores.get(dKey).score-1e-10&&r.characterMotor<=ctx.baselineEnergy.characterMotor).sort((a,b)=>a.score-b.score);
  for(const r of balanced.slice(0,2))chosen.set(r.key,'balanced screening candidate; original independent gates still required');
  const balancedMotion=[...balanced].sort((a,b)=>a.characterMotor-b.characterMotor||a.score-b.score)[0];if(balancedMotion)chosen.set(balancedMotion.key,'balanced screening candidate with lower character motion');
  for(const a of audits)chosen.set(a.key,'final winner-admission audit');
  const native=search.makeContext(ctx.args.snow,ctx.args.html,ctx.args.fixture),auditor=closure.independentAuditor(native.data),baseline=auditor(native.data.entries.find(e=>e.id===ctx.template.id)),results=[];
  ensure(Math.abs(baseline.a7eV4-p.baselineIndependent.a7eV4)<=1e-10&&Math.abs(baseline.tracks.S2.e34-p.baselineIndependent.tracks.S2.e34)<=1e-10,'Independent baseline differs');
  for(const[key,reason]of chosen){const entry=search.rebuild({...ctx.template,...coupled.expandState(stateOf(key)),id:recenter.idFor(key)},native.data),value=native.score(entry),difference=stream.compare(value,ctx.scores.get(key)),independent=auditor(entry);ensure(Number.isFinite(difference),'Nonfinite fresh score');const prior=audits.find(a=>a.key===key);if(prior)ensure(pass(independent,baseline)===prior.pass&&Math.abs(independent.a7eV4-prior.independent.a7eV4)<=1e-10,'Fresh winner admission differs');const comfortPass=search.comfort(describe(key),ctx.baseline);if(key===p.bestKey)ensure(comfortPass&&pass(independent,baseline),'Fresh best inadmissible');results.push({key,id:recenter.idFor(key),reason,native:value,maximumAbsoluteDifference:difference,independent,independentPass:pass(independent,baseline),comfortPass,allGatesPass:comfortPass&&pass(independent,baseline),erg:describe(key).erg});console.log(JSON.stringify({freshJS:recenter.idFor(key),score:value.score,difference,allGatesPass:comfortPass&&pass(independent,baseline)}));}
  const report={version:1,passed:true,checkpointSha256:stream.fileHash(checkpointFile),fingerprint:p.fingerprint,verifierSha256:stream.fileHash(__filename),journalSha256:p.scoreJournalSha256,newUniqueFullScores:rows.length,previouslyScoredStatesExcluded:imported.size,coarseNew:coarse,fineNew:fine,acceptedCoarse:accepted,coarseWaves:[...waves.values()].filter(w=>w.phase==='coarse').length,fineCampaigns:p.campaigns.length,partialFineCampaign:p.fineCampaign?.id??null,frontierVerified:frontier.length,memoryVerificationSha256:stream.fileHash(memoryFile),results};
  fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-15-untoned-2126-anneal-100k-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,newUniqueFullScores:rows.length,best:p.bestScore,frontier:frontier.length}));
}
if(require.main===module)main();
module.exports={sameKeys,verifyProposal,routeTrace};
