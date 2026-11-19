'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const recovery=require('./anneal_untoned_cr7e_recovery'),far=require('./anneal_untoned_cr7e_far'),search=require('./search_untoned_cr7e_v52');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report=read(recovery.PREFIX+'.json'),previous=read(far.PREFIX+'.json');
assert.ok(report.exactPolish.completed);
const prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
const known=new Map([...Object.values(previous.states),...Object.values(report.states)].map(r=>[mappingKey(r),r]));
const template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},results=[];
for(const stage of report.exactPolish.stages.filter(s=>s.name==='complete final leader ring')){
 const center=report.states[stage.center],variants=new Map();
 for(const row of search.neighbors(center)){
  const entry=search.rebuild({...template,...row,initialMap:report.initialMap},prior.auditInput);
  if(legal(search.audit(entry,prior.auditInput)))variants.set(mappingKey(entry),entry);
 }
 const missing=[...variants.keys()].filter(k=>!known.has(k));assert.equal(missing.length,0,center.id+' incomplete ring');
 const rows=[...variants.keys()].map(k=>known.get(k)),one=[...rows].sort((a,b)=>a.score-b.score)[0],two=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore)[0];
 results.push({id:center.id,legalUniqueNeighbors:variants.size,missing:0,centerScore:center.score,centerDoubledScore:center.doubledScore,
  bestNeighbor1x:{id:one.id,score:one.score,delta:one.score-center.score},
  bestNeighbor2x:{id:two.id,score:two.doubledScore,delta:two.doubledScore-center.doubledScore},
  strictImprovements1x:rows.filter(r=>r.score<center.score-1e-12).length,
  strictImprovements2x:rows.filter(r=>r.doubledScore<center.doubledScore-1e-12).length});
}
const out={results,policy:report.policy,scope:'complete legal single-final swaps, whole-key final-group swaps and single-final key moves under the fixed search policy; not all double/triple changes or every policy optimized neighbor',
 sourceHashes:Object.fromEntries([__filename,recovery.PREFIX+'.json',far.PREFIX+'.json',path.join(ROOT,'tools/search_untoned_cr7e_v52.js')].map(p=>[p,hash(p)]))};
fs.writeFileSync(recovery.PREFIX+'-ring-audit.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out.results));
