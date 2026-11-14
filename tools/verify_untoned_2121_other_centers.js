'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const search=require('./search_untoned_production_v51'),closure=require('./close_untoned_2121_local');
const ROOT=path.resolve(__dirname,'..'),NOTES=path.join(ROOT,'research/notes');
const file=path.join(NOTES,'2026-11-15-untoned-2121-other-centers.json'),r=JSON.parse(fs.readFileSync(file));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(!r.completed)throw Error('unfinished experiment');
for(const [p,h] of Object.entries(r.sourceHashes))if(hash(p)!==h)throw Error('source changed '+p);
const selected=[];
for(const f of r.families){
 if(!f.baselineVerified||f.results.length!==f.screen.selected)throw Error('incomplete family');
 const keys=new Set(closure.enumerateNeighborhood(f.baseline).map(closure.layoutKey));
 for(const row of f.results)if(!keys.has(closure.layoutKey(row)))throw Error('candidate outside neighborhood');
 const sorted=[...f.results].sort((a,b)=>a.score-b.score),better=sorted.filter(e=>e.score<f.baseline.score-1e-10);
 const highMx=[...f.results].sort((a,b)=>b.erg.mx-a.erg.mx)[0];
 for(const row of [...new Map([f.baseline,...better,...sorted.slice(0,2),highMx].map(e=>[e.id,e])).values()])selected.push({center:f.id,row});
}
const ctx=search.makeContext('D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'a7_CKT_R11.html'),path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
const template=ctx.data.entries.find(e=>e.id==='QZ-e8f37a0998f9'),auditor=closure.independentAuditor(ctx.data),results=[];
for(const {center,row} of selected){
 const e=search.rebuild({...template,...row},ctx.data),native=ctx.score(e),independent=auditor(e);
 if(Math.abs(native.score-row.score)>1e-10)throw Error('fresh score mismatch');
 if(Math.abs(row.erg.homeS2-independent.tracks.S2.home)>1e-10||Math.abs(row.erg.homeFloor-Math.min(...Object.values(independent.tracks).map(t=>t.home)))>1e-10)throw Error('load mismatch');
 results.push({center,id:row.id,mutation:row.mutation,score:native.score,erg:row.erg,audit:row.audit,independent});
 console.log(JSON.stringify({center,id:row.id,score:native.score,a7eV4:independent.a7eV4}));
}
fs.writeFileSync(path.join(NOTES,'2026-11-15-untoned-2121-other-centers-verification.json'),JSON.stringify({sourceSha256:hash(file),pathsVerified:r.families.reduce((s,f)=>s+f.results.length,0),results},null,2));
