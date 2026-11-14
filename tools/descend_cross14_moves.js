'use strict';
// Bounded low-frequency rhyme relocation screen from CROSS-14.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {makeContext,rebuild,audit,ergonomics,comfort,legal}=require('./search_untoned_production_v51');
const root=path.resolve(__dirname,'..'),file=path.join(root,'research/notes/2026-11-14-untoned-cross14-moves.json');
const ctx=makeContext('D:/C2D/Documents/rime-snow-pinyin',path.join(root,'a7_CKT_R11.html'),path.join(root,'research/.cache/ckt-v4-ergonomics.json'));
const template=ctx.data.entries.find(e=>e.id==='QZ-e8f37a0998f9');
const base={...template,audit:audit(template,ctx.data),erg:ergonomics(template,ctx.data,ctx.fixture,ctx.motor)};
const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
if(previous&&previous.sources.htmlSha256!==crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'a7_CKT_R11.html'))).digest('hex'))throw Error('cached input hash mismatch');
const results=previous?.families[0].results||[];
const report={version:'untoned-2121-token-moves-1',sources:{htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'a7_CKT_R11.html'))).digest('hex')},contract:{scope:'CROSS-14 low-frequency token relocations, top motor and smallest motor changes',policy:'fixed production v5.1',memory:'M-R2<=42,D<=2,QZ/ZQ empty'},families:[{id:base.id,baseline:{audit:base.audit,erg:base.erg,score:9.56789806405906},results}]};
function admissible(e){const a=e.audit;return a.valid&&a.M<=42&&a.D<=2&&a.branches===0&&!a.qz&&!a.zq&&new Set(ctx.data.base.map(([p])=>e.codeList[p][1])).size===21;}
function evaluate(e,mutation){
 const cached=results.find(r=>r.mutation===mutation&&JSON.stringify(r.finalMap)===JSON.stringify(e.finalMap));if(cached)return cached.score;
 e=rebuild(e,ctx.data);e.audit=audit(e,ctx.data);if(!admissible(e))throw Error('illegal '+mutation);
 e.erg=ergonomics(e,ctx.data,ctx.fixture,ctx.motor);const r=ctx.score(e);
 const row={id:'CROSS-'+results.length,mutation,initialMap:e.initialMap,finalMap:e.finalMap,toneKeysByTone:e.tone,capacity:e.capacity,audit:e.audit,erg:e.erg,score:r.score,modes:r.modes,strictComfort:comfort(e,base)};
 results.push(row);fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({id:row.id,mutation,score:r.score,mx:e.erg.mx,home:e.erg.homeS2}));return r.score;
}
const seed=JSON.parse(fs.readFileSync(path.join(root,'research/notes/2026-11-14-untoned-2121-cross.json'))).families[0].results.find(e=>e.id==='CROSS-14');
const origin={...template,initialMap:seed.initialMap,finalMap:seed.finalMap};
if(Math.abs(evaluate(origin,'CROSS-14 baseline')-seed.score)>1e-10)throw Error('baseline mismatch');
report.families[0].baseline={audit:results[0].audit,erg:results[0].erg,score:seed.score};
const proposals=[];
for(const token of ['er','iong','van','vn','ve','v','ua','uang','ia'])for(const key of new Set(Object.values(origin.finalMap))){
 if(origin.finalMap[token]===key)continue;
 const e=rebuild({...origin,finalMap:{...origin.finalMap,[token]:key}},ctx.data);e.audit=audit(e,ctx.data);
 if(!admissible(e))continue;
 e.erg=ergonomics(e,ctx.data,ctx.fixture,ctx.motor);e.mutation=`${token}:${origin.finalMap[token]}→${key}`;proposals.push(e);
}
const rank=[...proposals].sort((a,b)=>a.erg.motor-b.erg.motor),near=[...proposals].sort((a,b)=>Math.abs(a.erg.motor-seed.erg.motor)-Math.abs(b.erg.motor-seed.erg.motor));
const directed=proposals.filter(e=>['van:T→G','van:T→D','van:T→E','iong:H→D','iong:H→G','vn:D→G','ve:G→D','ua:Q→C'].includes(e.mutation));
// Retain the initial production-unique-count screen for reproducibility.
const oldRank=rank.filter(e=>legal(e,base)),oldNear=near.filter(e=>legal(e,base));
const selected=[...new Map([...rank.slice(0,12),...near.slice(0,12),...oldRank.slice(0,12),...oldNear.slice(0,12),...directed].map(e=>[e.mutation,e])).values()];
report.screen={legal:proposals.length,selected:selected.length};
for(const e of selected)evaluate(e,e.mutation);
report.completed=true;fs.writeFileSync(file,JSON.stringify(report,null,2));
