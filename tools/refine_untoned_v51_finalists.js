#!/usr/bin/env node
'use strict';
// Test the two useful disjoint rhyme swaps on the best completed 21x26 state.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {makeContext,rebuild,audit,ergonomics,legal,comfort}=require('./search_untoned_production_v51');
const root=path.resolve(__dirname,'..');
const input=process.argv[2]||path.join(root,'research/notes/2026-11-14-untoned-2126-v51-descent.json');
const output=process.argv[3]||path.join(root,'research/notes/2026-11-14-untoned-2126-v51-combinations.json');
const source=JSON.parse(fs.readFileSync(input,'utf8'));
const family=source.families.find(f=>f.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED');
const parent=[...family.results].filter(r=>r.strictComfort).sort((a,b)=>a.score-b.score)[0];
const ctx=makeContext('D:/C2D/Documents/rime-snow-pinyin',path.join(root,'a7_CKT_R11.html'),path.join(root,'research/.cache/ckt-v4-ergonomics.json'));
const template=ctx.data.entries.find(e=>e.id===family.id);
const baseline={audit:family.baseline.audit,erg:family.baseline.erg};
const swaps=[['iang','ie'],['in','ve']];
const results=[family.results[0],parent];
let legalCount=0;
for(const mask of [1,2,3]) {
  const finalMap={...parent.finalMap},mutations=[];
  swaps.forEach(([a,b],i)=>{if(mask&(1<<i)){mutations.push(`${a}(${finalMap[a]})↔${b}(${finalMap[b]})`);[finalMap[a],finalMap[b]]=[finalMap[b],finalMap[a]];}});
  const e=rebuild({...template,initialMap:parent.initialMap,finalMap},ctx.data);
  e.audit=audit(e,ctx.data);if(!legal(e,baseline))continue;legalCount++;
  e.erg=ergonomics(e,ctx.data,ctx.fixture,ctx.motor);
  const evaluated=ctx.score(e);
  const row={id:`UV51-C-${crypto.createHash('sha256').update(JSON.stringify(finalMap)).digest('hex').slice(0,12)}`,parent:parent.id,mutation:mutations.join(' + '),initialMap:e.initialMap,finalMap:e.finalMap,toneKeysByTone:e.tone,capacity:e.capacity,audit:e.audit,erg:e.erg,score:evaluated.score,modes:evaluated.modes,strictComfort:comfort(e,baseline)};
  results.push(row);console.log(JSON.stringify({mutation:row.mutation,score:row.score,strict:row.strictComfort}));
}
fs.writeFileSync(output,JSON.stringify({version:'untoned-v51-directed-disjoint-swaps-1',sources:source.sources,contract:source.contract,parentSource:path.basename(input),parentId:parent.id,completed:true,families:[{id:family.id,baseline:family.baseline,rounds:[{round:'directed combinations',legal:legalCount,scored:results.length-2}],results}]},null,2)+'\n');
