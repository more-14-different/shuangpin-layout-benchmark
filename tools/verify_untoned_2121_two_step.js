'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const search=require('./search_untoned_production_v51');
const {layoutKey,enumerateNeighborhood}=require('./close_untoned_2121_local');
const root=path.resolve(__dirname,'..'),notes=path.join(root,'research/notes');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const file=path.join(notes,'2026-11-15-untoned-2121-two-step.json'),r=read(file);
if(!r.completed)throw Error('incomplete search');
for(const [p,h] of Object.entries(r.sourceHashes))if(hash(p)!==h)throw Error('changed input '+p);
const c=read(path.join(notes,'2026-11-14-untoned-2121-local-closure.json'));
const byid=new Map(Object.values(c.records).map(e=>[e.id,e]));
// Independently recheck paths, including results reused from previous scores.
const states=new Map();
for(const e of r.results){
 const mid=byid.get(e.parent);if(!mid)throw Error('missing intermediate');
 if(!c.centers.at(-1).keys.includes(layoutKey(mid)))throw Error('intermediate outside first hop');
 if(!states.has(mid.id))states.set(mid.id,new Set(enumerateNeighborhood(mid).map(layoutKey)));
 if(!states.get(mid.id).has(layoutKey(e)))throw Error('invalid second hop');
}
const ctx=search.makeContext('D:/C2D/Documents/rime-snow-pinyin',path.join(root,'a7_CKT_R11.html'),path.join(root,'research/.cache/ckt-v4-ergonomics.json'));
const template=ctx.data.entries.find(e=>e.id==='QZ-e8f37a0998f9');
const best=[...r.results].sort((a,b)=>a.score-b.score)[0];
const selected=[r.base,...best.legs.map(e=>byid.get(e.id)),best],results=[];
for(const row of selected){
 const e=search.rebuild({...template,...row},ctx.data),native=ctx.score(e);
 if(Math.abs(native.score-row.score)>1e-10)throw Error('fresh native mismatch '+row.id);
 results.push({id:row.id,score:native.score,modes:native.modes});
 console.log(JSON.stringify({fresh:row.id,score:native.score}));
}
const auditor=require('./close_untoned_2121_local').independentAuditor(ctx.data);
const finalists=read(path.join(notes,'2026-11-15-untoned-2121-two-step-finalists.json')).families[0].results;
const independent=[];
for(const row of finalists){
 const e=search.rebuild({...template,...row,tone:row.toneKeysByTone},ctx.data),value=auditor(e);
 if(Math.abs(row.erg.homeS2-value.tracks.S2.home)>1e-10)throw Error('independent home mismatch');
 independent.push({id:row.id,...value});
}
fs.writeFileSync(path.join(notes,'2026-11-15-untoned-2121-two-step-verification.json'),JSON.stringify({sourceSha256:hash(file),pathsVerified:r.results.length,results,independent},null,2));
console.log(JSON.stringify({independentlyAudited:independent.length}));
