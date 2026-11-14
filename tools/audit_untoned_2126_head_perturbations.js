#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const search=require('./search_untoned_production_v51'),closure=require('./close_untoned_2126_double_empty');
const coupled=require('./search_untoned_2126_coupled'),stream=require('./untoned_v51_stream');
const {readJournal}=require('./exhaust_untoned_2126_twohop');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function main() {
  const dir=path.join(ROOT,'research/.cache/untoned-2126-twohop-exhaustive'),manifestFile=path.join(dir,'manifest.json'),manifest=read(manifestFile);
  for(const [file,digest] of Object.entries(manifest.sourceHashes))if(stream.fileHash(file)!==digest)throw Error(`Changed source ${file}`);
  const scores=new Map(readJournal(path.join(dir,'scores.jsonl')).map(r=>[r.id,r]));
  const heads=manifest.rows.filter(r=>r.comfortable&&r.headChanges);
  if(heads.some(r=>!scores.has(r.id)))throw Error('Head-perturbed score coverage incomplete');
  const all=heads.map(r=>({...r,score:scores.get(r.id).score})),selected=new Map();
  const take=(pool,value,descending=false)=>{const row=[...pool].sort((a,b)=>(value(a)-value(b))*(descending?-1:1)||a.score-b.score)[0];if(row)selected.set(row.id,row);};
  take(all,r=>r.score);for(const key of ['mx','homeS2','homeFloor','rpMax','wMax','yMax'])take(all,r=>r.erg[key],['mx','homeS2','homeFloor'].includes(key));
  const maps=Object.groupBy(all,r=>r.key.slice(0,36));for(const group of Object.values(maps))take(group,r=>r.score);
  for(const r of all.filter(r=>!r.finalChanges))selected.set(r.id,r);
  const data=require('./score_completion_ckt_v4').loadPayload(path.join(ROOT,'a7_CKT_R11.html')),audit=closure.independentAuditor(data);
  const template=data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED'),baseline=audit(template),rows=[];
  for(const head of selected.values()) {
    const native=scores.get(head.id),entry=search.rebuild({...template,...coupled.expandState(Buffer.from(head.key,'base64')),id:head.id},data),independent=audit(entry);
    const independentPass=independent.a7eV4<=baseline.a7eV4+1e-12&&independent.tracks.S2.e34<=baseline.tracks.S2.e34+1e-12;
    rows.push({...head,score:native.score,independentPass,independent});
    console.log(JSON.stringify({headAudited:rows.length,total:selected.size,id:head.id,score:native.score,independentPass}));
  }
  const report={version:1,completed:true,fingerprint:manifest.fingerprint,manifestSha256:stream.fileHash(manifestFile),auditorSha256:stream.fileHash(__filename),fullNativeHeadScores:all.length,selection:'minimum CKT per head map, raw dimension extrema, and all pure-head candidates; independent 20-track audit applies to these representatives only',baselineIndependent:baseline,rows};
  const output=path.join(ROOT,'research/notes/2026-11-14-untoned-2126-head-perturbations.json');fs.writeFileSync(output,JSON.stringify(report)+'\n');
  const valid=rows.filter(r=>r.independentPass).sort((a,b)=>a.score-b.score);
  console.log(JSON.stringify({completed:true,headPerturbed:all.length,representativesAudited:rows.length,representativesPassingAllGates:valid.length,best:valid[0]?.id,score:valid[0]?.score}));
}
if(require.main===module)main();
