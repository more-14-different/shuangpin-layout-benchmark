#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const stream=require('./untoned_v51_stream'),coupled=require('./search_untoned_2126_coupled');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
async function main() {
  const sources=['research/notes/2026-11-14-untoned-2126-double-empty-closure.json','research/notes/2026-11-14-untoned-2126-coupled-basin.json'].map(p=>path.join(ROOT,p));
  const fixture=stream.validateTemplates(),records=sources.flatMap(f=>{
    const archive=read(f);for(const [p,digest] of Object.entries(archive.sourceHashes))if(stream.fileHash(p)!==digest)throw Error(`Changed JS cache source ${p}`);
    return Object.values(archive.records).filter(r=>r.modes);
  });
  const anchor=read(path.join(ROOT,'research/config/untoned-2126-double-empty-closure-finalist.json')),headKey=r=>JSON.stringify(r.initialMap);
  const selected=new Map(),take=r=>{if(r)selected.set(r.id,r);};
  take(records.find(r=>r.id===anchor.id));
  for(const r of [...records].sort((a,b)=>a.score-b.score).slice(0,4))take(r);
  for(const r of records.filter(r=>headKey(r)!==headKey(anchor)).filter((r,i)=>i%3===0).slice(0,18))take(r);
  for(let i=0;i<records.length;i+=Math.ceil(records.length/12))take(records[i]);
  const worker=stream.launch(),results=[];const started=Date.now();
  try {
    await worker.ready;
    for(const row of selected.values()) {
      const result=await worker.score({id:row.id,state:[...coupled.compactState(row)]});
      const difference=stream.compare(result,row);
      results.push({id:row.id,state:coupled.stateKey(coupled.compactState(row)),score:result.score,maximumAbsoluteDifference:difference,seconds:result.seconds});
      console.log(JSON.stringify(results.at(-1)));
    }
  }finally{worker.child.kill();}
  const report={version:1,passed:true,fixtureSha256:fixture.sha256,sourceHashes:fixture.sourceHashes,binarySha256:stream.fileHash(stream.defaults.binary),rustSourceSha256:stream.fileHash(path.join(ROOT,'research/ckt-v4-core/src/bin/score-untoned-v51-stream.rs')),jsArchiveHashes:Object.fromEntries(sources.map(p=>[p,stream.fileHash(p)])),elapsedSeconds:(Date.now()-started)/1000,comparedTracks:results.length*8,maximumAbsoluteDifference:Math.max(...results.map(r=>r.maximumAbsoluteDifference)),results};
  fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-14-untoned-v51-stream-verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,candidates:results.length,maximumAbsoluteDifference:report.maximumAbsoluteDifference,elapsedSeconds:report.elapsedSeconds}));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
