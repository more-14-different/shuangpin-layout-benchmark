'use strict';
// Fresh exact scoring plus original twenty-contract replay of selected states.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const search=require('./search_untoned_production_v51'),closure=require('./close_untoned_2121_local');
const runner=require('./anneal_untoned_2121_multicenter_2k');
const ROOT=path.resolve(__dirname,'..'),NOTES=path.join(ROOT,'research/notes');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function replayMoves(from,moves){
 const row={...from,initialMap:{...from.initialMap},finalMap:{...from.finalMap}};
 for(const description of moves){
  const [field,op]=description.split(':');if(!['initialMap','finalMap'].includes(field))throw Error('unknown move field');
  const map=row[field];let m;
  if((m=/^groups ([A-Z])↔([A-Z])$/.exec(op))){for(const t of Object.keys(map))if(map[t]===m[1])map[t]=m[2];else if(map[t]===m[2])map[t]=m[1];}
  else if((m=/^group ([A-Z])→([A-Z])$/.exec(op))){for(const t of Object.keys(map))if(map[t]===m[1])map[t]=m[2];}
  else if((m=/^cycle ([^/]+)\/([^/]+)\/([^/]+)$/.exec(op))){[map[m[1]],map[m[2]],map[m[3]]]=[map[m[3]],map[m[1]],map[m[2]]];}
  else if((m=/^([^()]+)\(([A-Z])\)→([A-Z])$/.exec(op))){if(map[m[1]]!==m[2])throw Error('move source mismatch');map[m[1]]=m[3];}
  else if((m=/^([^()]+)\(([A-Z])\)↔([^()]+)\(([A-Z])\)$/.exec(op))){if(map[m[1]]!==m[2]||map[m[3]]!==m[4])throw Error('swap source mismatch');[map[m[1]],map[m[3]]]=[map[m[3]],map[m[1]]];}
  else throw Error('unrecognized primitive '+description);
 }
 return row;
}
function validateTrajectory(r){
 if(!r.completed||!r.seedsVerified||r.chains.reduce((s,c)=>s+c.newScores,0)!==2000)throw Error('incomplete budget');
 const freshlyScored=r.trajectory.filter(t=>t.newScore);
 if(freshlyScored.length!==2000||new Set(freshlyScored.map(t=>t.to)).size!==2000)throw Error('duplicate new-score budget');
 for(const chain of r.chains){
  const ts=r.trajectory.filter(t=>t.chain===chain.index);if(ts.filter(t=>t.newScore).length!==400)throw Error('per-center budget mismatch');
  let count=0;
  for(const t of ts){
   if(t.step!==count||!r.states[t.from]||!r.states[t.to]||t.score!==r.states[t.to].score)throw Error('invalid transition metadata');
   const expected=runner.schedule(t.step);
   if(t.phase!==expected.phase||t.cycle!==expected.cycle)throw Error('phase mismatch');
   if(t.newScore)count++;
   if(!t.accepted&&t.score<=r.states[t.from].score)throw Error('downhill state rejected');
   if(closure.layoutKey(replayMoves(r.states[t.from],t.moves))!==closure.layoutKey(r.states[t.to]))throw Error('proposal transcript does not reproduce state');
   const fromScore=r.states[t.from].score;
   if(t.score>fromScore&&t.accepted!==((t.rngAfter>>>0)/4294967296<Math.exp((fromScore-t.score)/t.temperature)))throw Error('Metropolis decision mismatch');
  }
 }
 // Rebuild non-dominated archive from every evaluated state; reject stale entries.
 let archive=[];for(const row of Object.values(r.states))archive=runner.archiveInsert(archive,row);
 const coverage=rows=>new Set(rows.map(e=>closure.layoutKey(e)));
 const a=coverage(archive),b=coverage(r.archive);if(a.size!==b.size||[...a].some(k=>!b.has(k)))throw Error('archive mismatch');
 return {newScores:2000,states:Object.keys(r.states).length,archive:archive.length};
}
async function main(){
 const file=path.join(NOTES,'2026-11-15-untoned-2121-anneal-2k.json'),r=read(file),counts=validateTrajectory(r);
 for(const [p,h] of Object.entries(r.sourceHashes))if(hash(p)!==h)throw Error('changed input '+p);
 const finalists=read(path.join(NOTES,'2026-11-15-untoned-2121-anneal-2k-finalists.json')).families[0].results;
 const output=path.join(NOTES,'2026-11-15-untoned-2121-anneal-2k-verification.json'),prior=fs.existsSync(output)?read(output):null;
 const cached=prior?.sourceSha256===hash(file)?new Map(prior.results.map(e=>[e.id,e])):new Map();
 const ctx=search.makeContext('D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'a7_CKT_R11.html'),path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
 const template=ctx.data.entries.find(e=>e.id==='QZ-e8f37a0998f9'),auditor=closure.independentAuditor(ctx.data),results=[];
 for(const row of finalists){
  if(cached.get(row.id)?.score===row.score){results.push(cached.get(row.id));continue;}
  const entry=search.rebuild({...template,...row,tone:row.toneKeysByTone},ctx.data);
  if(!runner.legal(entry,ctx.data))throw Error('illegal representative');
  const native=ctx.score(entry),independent=auditor(entry),erg=search.ergonomics(entry,ctx.data,ctx.fixture,ctx.motor);
  if(Math.abs(native.score-row.score)>1e-10)throw Error('fresh score mismatch '+row.id);
  for(const field of ['mx','homeS2','homeFloor','rpMax'])if(Math.abs(erg[field]-row.erg[field])>1e-10)throw Error('ergonomic mismatch '+field);
  if(Math.abs(independent.tracks.S2.home-erg.homeS2)>1e-10||Math.abs(Math.min(...Object.values(independent.tracks).map(t=>t.home))-erg.homeFloor)>1e-10)throw Error('independent load mismatch');
  results.push({id:row.id,score:native.score,audit:search.audit(entry,ctx.data),erg,native,independent});
  console.log(JSON.stringify({fresh:row.id,score:native.score,movingHand:erg.mx,equivalent:independent.a7eV4}));
 }
 fs.writeFileSync(output,JSON.stringify({sourceSha256:hash(file),counts,results},null,2));
 console.log(JSON.stringify({verified:results.length,...counts}));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={validateTrajectory,replayMoves};
