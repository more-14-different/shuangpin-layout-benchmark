#!/usr/bin/env node
'use strict';

// Fresh final-state scoring and independent twenty-contract verification.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const search=require('./search_untoned_production_v51');
const {materialize,independentAuditor}=require('./close_untoned_2126_double_empty');
const ROOT=path.resolve(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function main() {
  const file=path.resolve(process.argv[2]||path.join(ROOT,'research/.cache/untoned-2126-double-empty-closure/checkpoint.json'));
  const checkpoint=read(file);
  if(checkpoint.runState!=='finalized')throw Error('Search is not finalized');
  for(const [source,expected] of Object.entries(checkpoint.sourceHashes))if(hash(source)!==expected)throw Error(`Source changed: ${source}`);
  const ctx=search.makeContext('D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'a7_CKT_R11.html'),path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json'));
  const template=ctx.data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED');
  const auditor=independentAuditor(ctx.data);
  const best=Object.values(checkpoint.records).find(e=>e.id===checkpoint.bestId);
  const rows=[{...template,expectedScore:9.10299979136027},
    {...checkpoint.seed,expectedScore:checkpoint.seed.score},
    {...best,expectedScore:best.score}];
  const results=[];
  for(const row of [...new Map(rows.map(e=>[e.id,e])).values()]) {
    const entry=row.id===template.id?template:materialize(row,template,ctx.data);
    const native=ctx.score(entry),independent=auditor(entry),a=search.audit(entry,ctx.data);
    const erg=search.ergonomics(entry,ctx.data,ctx.fixture,ctx.motor);
    if(Math.abs(native.score-row.expectedScore)>1e-10)throw Error(`Native score regression ${row.id}: ${native.score}`);
    if(Math.abs(erg.homeS2-independent.tracks.S2.home)>1e-10)throw Error('Independent S2 home mismatch');
    if(Math.abs(erg.homeFloor-Math.min(...Object.values(independent.tracks).map(t=>t.home)))>1e-10)throw Error('Independent home floor mismatch');
    results.push({id:row.id,native,independent,audit:a,erg});
    console.log(JSON.stringify({id:row.id,score:native.score,memory:a.M,s2Equivalent:independent.tracks.S2.e34,a7eV4:independent.a7eV4}));
  }
  const output=path.join(ROOT,'research/notes/2026-11-14-untoned-2126-double-empty-closure-verification.json');
  fs.writeFileSync(output,JSON.stringify({version:'untoned-2126-double-empty-fresh-verification-1',checkpointSha256:hash(file),fingerprint:checkpoint.fingerprint,sourceHashes:checkpoint.sourceHashes,results},null,2)+'\n');
}
if(require.main===module)main();
