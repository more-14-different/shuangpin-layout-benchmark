#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const search=require('./search_untoned_production_v51');
const closure=require('./close_untoned_2126_double_empty');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function main() {
  const refined=path.join(ROOT,'research/.cache/untoned-2126-coupled-basin/refined.json');
  const file=path.resolve(process.argv[2]||(fs.existsSync(refined)?refined:path.join(ROOT,'research/.cache/untoned-2126-coupled-basin/checkpoint.json')));
  const c=read(file);if(!c.completed||c.stages.some(s=>!s.completed))throw Error('Coupled search is incomplete');
  for(const [p,h] of Object.entries(c.sourceHashes))if(hash(p)!==h)throw Error(`Source changed ${p}`);
  const selected=[c.seed,Object.values(c.records).find(r=>r.id===c.bestId)];
  if(c.farRefine?.endId)selected.push(Object.values(c.records).find(r=>r.id===c.farRefine.endId));
  for(const kind of ['local','far','far-refine']) {
    const keys=c.stages.filter(s=>s.kind===kind).flatMap(s=>s.jobs.map(j=>j.key));
    const best=keys.map(k=>c.records[k]).sort((a,b)=>a.score-b.score)[0];if(best)selected.push(best);
  }
  const ctx=search.makeContext('D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'a7_CKT_R11.html'),path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
  const template=ctx.data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED'),audit=closure.independentAuditor(ctx.data),results=[];
  for(const row of [...new Map(selected.map(r=>[r.id,r])).values()]) {
    const entry=closure.materialize(row,template,ctx.data),native=ctx.score(entry),independent=audit(entry);
    if(Math.abs(native.score-row.score)>1e-10)throw Error(`Fresh native score mismatch ${row.id}`);
    results.push({id:row.id,native,independent});console.log(JSON.stringify({id:row.id,score:native.score,s2Equivalent:independent.tracks.S2.e34,a7eV4:independent.a7eV4}));
  }
  fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-14-untoned-2126-coupled-basin-verification.json'),JSON.stringify({version:'untoned-2126-coupled-fresh-native-verification-1',checkpointSha256:hash(file),fingerprint:c.fingerprint,results},null,2)+'\n');
}
if(require.main===module)main();
