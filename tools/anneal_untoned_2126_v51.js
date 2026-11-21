#!/usr/bin/env node
'use strict';
// Bounded heuristic annealing. Proposal filtering is asymmetric; no equilibrium claim.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const explore=require('./explore_untoned_2126_threehop'),recenter=require('./recenter_untoned_2126');
const coupled=require('./search_untoned_2126_coupled'),search=require('./search_untoned_production_v51');
const stream=require('./untoned_v51_stream'),closure=require('./close_untoned_2126_double_empty');
const {validateTracks}=require('./verify_untoned_2126_recenter');
const ROOT=path.resolve(__dirname,'..'),DIRECTORY=path.join(ROOT,'research/.cache/untoned-2126-anneal-100k-20261115');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),stateOf=k=>Uint8Array.from(Buffer.from(k,'base64'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const PROFILES=['speed','balanced','speed','home','move','lowW','balanced','speed','balanced','home','move','lowW','speed','balanced','speed','balanced'];
const OPTIONS={newFullScores:100000,routes:16,coarseNewPerCycle:6500,fineNewPerCycle:3500,randomSeed:202611151001,rawCompoundFraction:.25,coarseSteps:[2,3,4,8],coarseTemperatureStart:.04,coarseTemperatureEnd:.004,roamingTemperatureMultiplier:2,profileNames:PROFILES,finalAdmission:'original production hard, comfort, S2 e34 and A7E-v4 gates'};
function reserveUnique(rows,known,remaining){const selected=[],seen=new Set();for(const row of rows){if(selected.length>=remaining)break;if(known.has(row.key)||seen.has(row.key))continue;seen.add(row.key);selected.push(row);}return selected;}
function acceptMove(current,next,temperature,u){return next<=current||(temperature>0&&u<Math.exp(-(next-current)/temperature));}
function energy(row,profile,b){
  const e=row.erg,penalty=.015*Math.max(0,b.mx-e.mx)+2*Math.max(0,b.homeS2-e.homeS2)+3*Math.max(0,b.homeFloor-e.homeFloor);
  let value=row.score+penalty;
  if(profile==='balanced')value+=Math.max(0,row.characterMotor/b.characterMotor-1)+.15*Math.max(0,e.wMax-b.wMax);
  else if(profile==='home')value-=.3*(e.homeS2-b.homeS2)+.2*(e.homeFloor-b.homeFloor);
  else if(profile==='move')value-=.002*(e.mx-b.mx);
  else if(profile==='lowW')value+=.3*Math.max(0,e.wMax-b.wMax);
  return value;
}
function vector(r){return [r.score,-r.erg.mx,-r.erg.homeS2,-r.erg.homeFloor,r.erg.wMax,r.erg.rpMax,r.erg.yMax,r.characterMotor??Infinity];}
function dominates(a,b){const x=vector(a),y=vector(b);return x.every((v,i)=>v<=y[i]+1e-12)&&x.some((v,i)=>v<y[i]-1e-12);}
function updateFrontier(frontier,row){if(frontier.some(r=>r.key===row.key||dominates(r,row)))return frontier;return [...frontier.filter(r=>!dominates(row,r)),{key:row.key,score:row.score,erg:row.erg,characterMotor:row.characterMotor}];}
function save(file,value){const temporary=file+`.${process.pid}.tmp`;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n');for(let i=0;;i++){try{fs.renameSync(temporary,file);break;}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||i>=40)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}}
function loadJournal(file){if(!fs.existsSync(file))return [];return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map((line,i)=>{try{return JSON.parse(line);}catch{throw Error(`Incomplete journal at line ${i+1}; preserve and repair tail before resume`);}});}
function setup(){
  const ctx=explore.setup(),prefix=path.join(ROOT,'research/notes/2026-11-15-untoned-2126-threehop');
  const summaryFile=prefix+'-summary.json',archiveFile=prefix+'-scores.jsonl.gz',summary=read(summaryFile);
  recenter.validateSources(summary.sourceHashes);if(!summary.completed||stream.fileHash(archiveFile)!==summary.exports[path.basename(archiveFile)].sha256)throw Error('Three-hop evidence differs');
  for(const line of zlib.gunzipSync(fs.readFileSync(archiveFile)).toString('utf8').split('\n').filter(Boolean))recenter.insertScore(ctx.scores,JSON.parse(line),archiveFile);
  const baselineFile=path.join(ROOT,'research/notes/2026-11-14-untoned-2126-double-empty-closure-verification.json'),baselineEvidence=read(baselineFile);
  recenter.validateSources(baselineEvidence.sourceHashes);
  const baselineResult=baselineEvidence.results.find(r=>r.id===ctx.template.id);
  if(!baselineResult||Math.abs(baselineResult.native.score-9.10299979136027)>1e-10)throw Error('Verified production baseline differs');
  recenter.insertScore(ctx.scores,{...baselineResult.native,key:coupled.stateKey(coupled.compactState(ctx.template))},baselineFile);
  const sources=[__filename,path.join(ROOT,'tools/verify_untoned_2126_recenter.js'),summaryFile,archiveFile,baselineFile];
  const sourceHashes={...ctx.sourceHashes,...Object.fromEntries(sources.map(f=>[f,stream.fileHash(f)]))};
  const pKey=coupled.stateKey(coupled.compactState(ctx.template)),production=ctx.scores.get(pKey);if(!production)throw Error('Production score missing');
  const baselineEnergy={...ctx.baseline.erg,characterMotor:(production.modes.keytao.character.motorUpperMs+production.modes.sanpin.character.motorUpperMs)/2};
  return {...ctx,sourceHashes,fingerprint:hash(JSON.stringify({sourceHashes,options:OPTIONS})),baselineEnergy};
}
function selectSeeds(ctx,metrics){
  const keys=[],add=k=>{if(ctx.scores.has(k)&&!keys.includes(k))keys.push(k);};
  add(ctx.startKey);add(coupled.stateKey(coupled.compactState(read(path.join(ROOT,'research/config/untoned-2126-double-empty-closure-finalist.json')))));add(coupled.stateKey(coupled.compactState(ctx.template)));
  const heads=new Set(keys.map(k=>k.slice(0,36))),sorted=[...ctx.scores.values()].sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key));
  for(const row of sorted){if(heads.has(row.key.slice(0,36)))continue;const m=metrics(row.key);if(!search.comfort(m,ctx.baseline))continue;add(row.key);heads.add(row.key.slice(0,36));if(keys.length>=PROFILES.length)break;}
  for(const row of sorted){if(keys.length>=PROFILES.length)break;if(keys.every(k=>coupled.distance(stateOf(k),stateOf(row.key))>=4))add(row.key);}
  if(keys.length<PROFILES.length)throw Error('Insufficient diverse seeds');return keys.slice(0,PROFILES.length);
}
async function main(){
  const cli={};for(let i=2;i<process.argv.length;i+=2)cli[process.argv[i].slice(2)]=process.argv[i+1];
  const directory=path.resolve(cli.output||DIRECTORY);fs.mkdirSync(directory,{recursive:true});const checkpointFile=path.join(directory,'checkpoint.json'),journalFile=path.join(directory,'scores.jsonl');
  const ctx=setup(),scores=ctx.scores,initialKeys=new Set(scores.keys()),ops=coupled.operations(),guard=coupled.makeGuard(ctx.data),metadata=new Map();
  const metrics=key=>{if(metadata.has(key))return metadata.get(key);const entry=search.rebuild({...ctx.template,...coupled.expandState(stateOf(key))},ctx.data),audit=search.audit(entry,ctx.data);if(!search.legal({audit},ctx.baseline))throw Error(`Hard legality failed: ${key}`);const erg=search.ergonomics(entry,ctx.data,ctx.fixture,()=>({upperMs:0}));delete erg.motor;const score=scores.get(key),result={key,score:score?.score,erg,audit,characterMotor:score?(score.modes.keytao.character.motorUpperMs+score.modes.sanpin.character.motorUpperMs)/2:undefined};metadata.set(key,result);return result;};
  const describe=key=>{const row=metrics(key),score=scores.get(key);if(!score)throw Error('Unscored energy state');if(row.score===undefined){row.score=score.score;row.characterMotor=(score.modes.keytao.character.motorUpperMs+score.modes.sanpin.character.motorUpperMs)/2;}return row;};
  let cp;
  if(fs.existsSync(checkpointFile)){cp=read(checkpointFile);if(cp.fingerprint!==ctx.fingerprint)throw Error('Anneal checkpoint contract differs');}
  else {const seeds=selectSeeds(ctx,metrics);cp={version:1,fingerprint:ctx.fingerprint,sourceHashes:ctx.sourceHashes,options:OPTIONS,started:new Date().toISOString(),completed:false,rng:OPTIONS.randomSeed,wave:0,cycle:0,phase:'coarse',phaseNew:0,totalNew:0,coarseNew:0,fineNew:0,acceptedCoarse:0,attemptedCoarse:0,proposalAttempts:0,chains:seeds.map((key,i)=>({index:i,key,seedKey:key,profile:PROFILES[i],accepted:0,proposed:0})),seeds,frontier:[],rawBestKey:ctx.startKey,rawBestScore:ctx.start.cktV51,campaigns:[],fineVisited:[],fineCampaign:null,pending:null};for(const key of seeds){const row=describe(key);if(search.comfort(row,ctx.baseline))cp.frontier=updateFrontier(cp.frontier,row);}}
  const journal=loadJournal(journalFile),journalByKey=new Map(),recentByCycle=new Map();
  for(const row of journal){if(row.fingerprint!==ctx.fingerprint||journalByKey.has(row.key)||initialKeys.has(row.key))throw Error('Journal contract, duplicate, or newness differs');validateTracks(row);recenter.insertScore(scores,row,'anneal journal');journalByKey.set(row.key,row);metadata.set(row.key,{key:row.key,score:row.score,erg:row.erg,audit:row.audit,characterMotor:row.characterMotor});if(row.phase==='coarse'){const a=recentByCycle.get(row.cycle)||[];a.push(row.key);recentByCycle.set(row.cycle,a);}}
  if(cp.totalNew>journal.length||journal.length>OPTIONS.newFullScores)throw Error('Budget/checkpoint count invalid');
  if(journal.length!==cp.totalNew&&!cp.pending)throw Error('Journal has uncommitted records without a pending wave');
  const update=()=>{cp.updated=new Date().toISOString();save(checkpointFile,cp);};
  if(cp.completed){console.log(JSON.stringify({alreadyCompleted:true,newScores:cp.totalNew,best:cp.bestScore}));return;}
  const random=()=>{cp.rng=(Math.imul(cp.rng,1664525)+1013904223)>>>0;return cp.rng/4294967296;};
  const pick=a=>a[Math.floor(random()*a.length)];
  const frontierRow=key=>{const row=describe(key);if(search.comfort(row,ctx.baseline)){cp.frontier=updateFrontier(cp.frontier,row);if(row.score<cp.rawBestScore){cp.rawBestScore=row.score;cp.rawBestKey=key;}}};
  function compound(fromKey,reserved){
    const anchor=stateOf(fromKey);
    for(let tries=0;tries<1200;tries++){
      cp.proposalAttempts++;let state=anchor.slice(),path=[],raw=random()<OPTIONS.rawCompoundFraction,steps=pick(OPTIONS.coarseSteps);
      if(raw&&steps===8)steps=4;
      let failed=false;
      for(let n=0;n<steps;n++){
        if(raw){const i=Math.floor(random()*ops.length);state=coupled.applyOperation(state,ops[i]);path.push(i);}
        else {let found=false;for(let a=0;a<100;a++){const i=Math.floor(random()*ops.length),candidate=coupled.applyOperation(state,ops[i]);if(coupled.distance(candidate,state)===0||!guard(candidate))continue;state=candidate;path.push(i);found=true;break;}if(!found){failed=true;break;}}
      }
      if(failed||!guard(state))continue;const key=coupled.stateKey(state);if(key===fromKey||scores.has(key)||reserved.has(key))continue;
      return {key,path,fromKey,proposalKind:raw?'unrestricted compound, final hard gate':'hard-legal random walk'};
    }
    throw Error('Unable to generate a novel hard-legal compound after 1200 attempts');
  }
  function pickFineAnchor(){
    const index=cp.campaigns.length,chain=index%cp.chains.length,profile=cp.chains[chain].profile;
    const pool=[...new Set([...(recentByCycle.get(cp.cycle)||[]),...cp.chains.map(c=>c.key),...cp.frontier.map(r=>r.key),...cp.seeds])];
    const visited=new Set(cp.fineVisited),available=pool.filter(k=>!visited.has(`${profile}:${k}`));if(!available.length)throw Error('No unvisited fine center');
    available.sort((a,b)=>energy(describe(a),profile,ctx.baselineEnergy)-energy(describe(b),profile,ctx.baselineEnergy)||a.localeCompare(b));
    // Every third fine center deliberately explores the wider coarse pool.
    const key=index%3===2?pick(available.slice(0,Math.min(available.length,300))):available[0];return {key,chain,profile};
  }
  function finishCampaign(){
    const campaign=cp.fineCampaign,manifest=read(campaign.manifestFile);let best=campaign.anchorKey,bestEnergy=energy(describe(best),campaign.profile,ctx.baselineEnergy);
    for(const row of manifest.rows){const e=energy(describe(row.key),campaign.profile,ctx.baselineEnergy);if(e<bestEnergy-1e-12){best=row.key;bestEnergy=e;}}
    cp.chains[campaign.chain].key=best;cp.fineVisited.push(`${campaign.profile}:${campaign.anchorKey}`);
    cp.campaigns.push({...campaign,completed:true,bestKey:best,bestEnergy,newScores:campaign.scoredNew,oneHopEnergyClosed:best===campaign.anchorKey});cp.fineCampaign=null;
  }
  const workerCount=Number(cli.workers||16);if(!Number.isInteger(workerCount)||workerCount<1||workerCount>OPTIONS.routes)throw Error('Workers must be 1..16');
  const workers=Array.from({length:workerCount},()=>stream.launch());
  try{
    await Promise.all(workers.map(w=>w.ready));console.log(JSON.stringify({ready:true,budget:OPTIONS.newFullScores,completed:cp.totalNew,importedScores:initialKeys.size,workers:workers.length,seedScores:cp.seeds.map(k=>scores.get(k).score)}));update();
    while(cp.totalNew<OPTIONS.newFullScores||cp.pending){
      if(!cp.pending){
        if(cp.phase==='coarse'&&cp.phaseNew>=OPTIONS.coarseNewPerCycle){cp.phase='fine';cp.phaseNew=0;console.log(JSON.stringify({phaseChange:'fine',cycle:cp.cycle,total:cp.totalNew}));}
        if(cp.phase==='fine'&&!cp.fineCampaign&&cp.phaseNew>=OPTIONS.fineNewPerCycle){cp.cycle++;cp.phase='coarse';cp.phaseNew=0;const reservoir=[...cp.seeds,...cp.frontier.map(r=>r.key)];for(let i=cp.cycle%4;i<cp.chains.length;i+=4)cp.chains[i].key=pick(reservoir);console.log(JSON.stringify({phaseChange:'coarse-reheat',cycle:cp.cycle,total:cp.totalNew}));}
        const capacity=Math.min(workers.length,OPTIONS.newFullScores-cp.totalNew),jobs=[];
        if(cp.phase==='coarse'){
          const n=Math.min(capacity,OPTIONS.coarseNewPerCycle-cp.phaseNew),reserved=new Set();
          for(let i=0;i<n;i++){
            const index=(cp.wave*workers.length+i)%cp.chains.length,chain=cp.chains[index],proposal=compound(chain.key,reserved);reserved.add(proposal.key);
            const fraction=cp.phaseNew/OPTIONS.coarseNewPerCycle,temperature=(OPTIONS.coarseTemperatureStart*(1-fraction)+OPTIONS.coarseTemperatureEnd*fraction)*(index%4===3?OPTIONS.roamingTemperatureMultiplier:1);
            const meta=metrics(proposal.key);jobs.push({...proposal,chain:index,profile:chain.profile,temperature,u:random(),erg:meta.erg,audit:meta.audit});
          }
        }else{
          if(!cp.fineCampaign){
            const selected=pickFineAnchor(),generated=recenter.enumerateSingle(stateOf(selected.key),ops,guard),rows=[...generated.endpoints.values()],id=cp.campaigns.length,manifestFile=path.join(directory,`fine-${id}-manifest.json`);
            const manifest={version:1,fingerprint:ctx.fingerprint,id,cycle:cp.cycle,anchorKey:selected.key,profile:selected.profile,stats:generated.stats,rows};fs.writeFileSync(manifestFile,JSON.stringify(manifest));
            cp.fineCampaign={id,cycle:cp.cycle,anchorKey:selected.key,chain:selected.chain,profile:selected.profile,manifestFile,manifestSha256:stream.fileHash(manifestFile),cursor:0,total:rows.length,scoredNew:0};
          }
          const campaign=cp.fineCampaign,manifest=read(campaign.manifestFile);
          while(campaign.cursor<manifest.rows.length&&jobs.length<capacity){const row=manifest.rows[campaign.cursor++];if(scores.has(row.key))continue;const meta=metrics(row.key);jobs.push({...row,fromKey:campaign.anchorKey,proposalKind:'complete one-hop fine neighborhood',chain:campaign.chain,profile:campaign.profile,temperature:0,u:0,erg:meta.erg,audit:meta.audit,campaign:campaign.id});}
          if(!jobs.length){finishCampaign();update();continue;}
        }
        cp.pending={wave:cp.wave,cycle:cp.cycle,phase:cp.phase,jobs};update();
      }
      const pending=cp.pending;
      const results=await Promise.all(pending.jobs.map((job,i)=>journalByKey.has(job.key)?journalByKey.get(job.key):workers[i].score({id:recenter.idFor(job.key),state:[...stateOf(job.key)]})));
      for(let i=0;i<pending.jobs.length;i++){
        const job=pending.jobs[i];let row=journalByKey.get(job.key);
        if(!row){const result=results[i];if(result.id!==recenter.idFor(job.key))throw Error('Worker result ID differs');validateTracks(result);const characterMotor=(result.modes.keytao.character.motorUpperMs+result.modes.sanpin.character.motorUpperMs)/2;
          row={...job,...result,characterMotor,fingerprint:ctx.fingerprint,wave:pending.wave,cycle:pending.cycle,phase:pending.phase};
          const before=energy(describe(job.fromKey),job.profile,ctx.baselineEnergy),after=energy(row,job.profile,ctx.baselineEnergy);row.energyBefore=before;row.energyAfter=after;row.accepted=pending.phase==='coarse'&&acceptMove(before,after,job.temperature,job.u);
          fs.appendFileSync(journalFile,JSON.stringify(row)+'\n');recenter.insertScore(scores,row,'anneal journal');journalByKey.set(row.key,row);metadata.set(row.key,{key:row.key,score:row.score,erg:row.erg,audit:row.audit,characterMotor});
          if(row.phase==='coarse'){const list=recentByCycle.get(row.cycle)||[];list.push(row.key);recentByCycle.set(row.cycle,list);}
        }else if(row.wave!==pending.wave||row.fromKey!==job.fromKey||row.phase!==pending.phase)throw Error('Pending wave/journal mismatch');
        if(pending.phase==='coarse'){const chain=cp.chains[job.chain];if(chain.key!==job.fromKey)throw Error('Chain source differs');chain.proposed++;cp.attemptedCoarse++;if(row.accepted){chain.key=row.key;chain.accepted++;cp.acceptedCoarse++;}cp.coarseNew++;}
        else {cp.fineNew++;cp.fineCampaign.scoredNew++;}
        frontierRow(row.key);
      }
      cp.totalNew+=pending.jobs.length;cp.phaseNew+=pending.jobs.length;cp.wave++;cp.pending=null;
      if(cp.fineCampaign){const manifest=read(cp.fineCampaign.manifestFile);if(cp.fineCampaign.cursor>=manifest.rows.length)finishCampaign();}
      if(cp.totalNew>OPTIONS.newFullScores)throw Error('Budget exceeded');update();
      if(cp.totalNew%256<workers.length||cp.totalNew===OPTIONS.newFullScores)console.log(JSON.stringify({newScores:cp.totalNew,budget:OPTIONS.newFullScores,phase:cp.phase,cycle:cp.cycle,rawComfortBest:cp.rawBestScore,frontier:cp.frontier.length,acceptedCoarse:cp.acceptedCoarse,coarse:cp.coarseNew,fine:cp.fineNew}));
    }
  }finally{for(const worker of workers)worker.child.kill();}
  if(cp.totalNew!==OPTIONS.newFullScores||journalByKey.size!==OPTIONS.newFullScores)throw Error('Final unique-new budget differs');
  recenter.validateSources(ctx.sourceHashes);const entryFor=key=>search.rebuild({...ctx.template,...coupled.expandState(stateOf(key)),id:recenter.idFor(key)},ctx.data),auditor=closure.independentAuditor(ctx.data),baseline=auditor(ctx.template);
  const candidates=[...journalByKey.values()].filter(r=>search.comfort(r,ctx.baseline)&&r.score<ctx.start.cktV51-1e-10).sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key));
  cp.independentAudits=[];let bestKey=ctx.startKey,bestScore=ctx.start.cktV51,bestIndependent=ctx.start.independent;
  for(const row of candidates){const independent=auditor(entryFor(row.key)),pass=independent.tracks.S2.e34<=baseline.tracks.S2.e34+1e-12&&independent.a7eV4<=baseline.a7eV4+1e-12;cp.independentAudits.push({key:row.key,score:row.score,pass,independent});update();if(pass){bestKey=row.key;bestScore=row.score;bestIndependent=independent;break;}}
  Object.assign(cp,{completed:true,bestKey,bestId:recenter.idFor(bestKey),bestScore,bestIndependent,baselineIndependent:baseline,strictComfortImproving:candidates.length,scoreJournalSha256:stream.fileHash(journalFile),stopReason:'Exactly 100000 unique previously unscored hard-legal layouts received full native eight-track CKT; bounded annealing is not a closure or global-optimum proof.'});update();
  console.log(JSON.stringify({completed:true,newScores:cp.totalNew,best:cp.bestId,score:bestScore,gain:ctx.start.cktV51-bestScore,strictComfortImproving:candidates.length,frontier:cp.frontier.length}));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={reserveUnique,acceptMove,energy,updateFrontier,dominates,vector,setup,selectSeeds,DIRECTORY,OPTIONS,PROFILES};
