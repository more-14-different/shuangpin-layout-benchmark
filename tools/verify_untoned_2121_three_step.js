'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const search=require('./search_untoned_production_v51'),closure=require('./close_untoned_2121_local');
const ROOT=path.resolve(__dirname,'..'),NOTES=path.join(ROOT,'research/notes');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const file=path.join(NOTES,'2026-11-15-untoned-2121-three-step.json'),r=read(file);
if(!r.completed)throw Error('unfinished search');
for(const [p,h] of Object.entries(r.sourceHashes))if(hash(p)!==h)throw Error('source changed '+p);
const twoFile=path.join(NOTES,'2026-11-15-untoned-2121-two-step.json');if(hash(twoFile)!==r.sourceSha256)throw Error('pair input changed');
const two=read(twoFile),pairs=new Map(two.results.map(e=>[e.id,e]));
const c=read(path.join(NOTES,'2026-11-14-untoned-2121-local-closure.json')),records=new Map(Object.values(c.records).map(e=>[e.id,e]));
const firstHop=new Set(c.centers.at(-1).keys),secondCache=new Map(),thirdCache=new Map();
for(const end of r.results){
 const pair=pairs.get(end.pairId),first=records.get(pair?.parent);if(!first||!firstHop.has(closure.layoutKey(first)))throw Error('invalid first hop');
 if(!secondCache.has(first.id))secondCache.set(first.id,new Set(closure.enumerateNeighborhood(first).map(closure.layoutKey)));
 if(!secondCache.get(first.id).has(closure.layoutKey(pair)))throw Error('invalid second hop');
 if(!thirdCache.has(pair.id))thirdCache.set(pair.id,new Set(closure.enumerateNeighborhood(pair).map(closure.layoutKey)));
 if(!thirdCache.get(pair.id).has(closure.layoutKey(end)))throw Error('invalid third hop');
 if(JSON.stringify(end.path)!==JSON.stringify([first.id,pair.id]))throw Error('path metadata mismatch');
}
const ctx=search.makeContext('D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'a7_CKT_R11.html'),path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
const template=ctx.data.entries.find(e=>e.id==='QZ-e8f37a0998f9');
const best=[...r.results].sort((a,b)=>a.score-b.score)[0],pair=pairs.get(best.pairId),first=records.get(pair.parent);
const fresh=[];
for(const row of [...new Map([r.base,r.twoStepBest,first,pair,best].map(e=>[e.id,e])).values()]){
 const native=ctx.score(search.rebuild({...template,...row},ctx.data));
 if(Math.abs(native.score-row.score)>1e-10)throw Error('fresh score mismatch '+row.id);
 fresh.push({id:row.id,score:native.score,modes:native.modes});console.log(JSON.stringify({fresh:row.id,score:native.score}));
}
const finalists=read(path.join(NOTES,'2026-11-15-untoned-2121-three-step-finalists.json')).families[0].results;
const auditor=closure.independentAuditor(ctx.data),independent=[];
for(const row of finalists){
 const e=search.rebuild({...template,...row,tone:row.toneKeysByTone},ctx.data),a=auditor(e);
 if(Math.abs(row.erg.homeS2-a.tracks.S2.home)>1e-10||Math.abs(row.erg.homeFloor-Math.min(...Object.values(a.tracks).map(t=>t.home)))>1e-10)throw Error('independent load mismatch');
 independent.push({id:row.id,...a});
}
fs.writeFileSync(path.join(NOTES,'2026-11-15-untoned-2121-three-step-verification.json'),JSON.stringify({sourceSha256:hash(file),pathsVerified:r.results.length,fresh,independent},null,2));
console.log(JSON.stringify({paths:r.results.length,fresh:fresh.length,independent:independent.length}));
