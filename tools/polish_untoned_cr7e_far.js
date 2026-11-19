'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far'),{pool}=require('./untoned_v52_stream_pool');
const {screening,mappingKey,legal}=require('./search_untoned_cr7e_coupled');
const {mergeChanges,topBoth}=require('./extend_untoned_cr7e_coupled');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const report=read(far.PREFIX+'.json');assert.ok(report.completed);for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(hash(p),h,p);
 if(report.measuredFinalPolish?.completed)return;
 const prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 const template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},data=prior.auditInput;
 const inspect=screening(data,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const known=new Map(Object.values(report.states).map(r=>[mappingKey(r),r])),variants=new Map();
 for(const stage of report.stages.filter(s=>s.name==='complete final leader ring')){
  const center=report.states[stage.center],rows=Object.values(report.states).filter(r=>r.parent===center.id&&(r.score<center.score||r.doubledScore<center.doubledScore));
  const selected=topBoth(rows,10);
  function add(finalMap,parents){if(!finalMap)return;const e={initialMap:report.initialMap,finalMap,parent:parents,mutation:'compatible measured final pair/triple'};
   const key=mappingKey(e);if(!known.has(key)&&inspect(e))variants.set(key,e);}
  for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
   const map=mergeChanges(center.finalMap,selected[i].finalMap,selected[j].finalMap);add(map,[selected[i].id,selected[j].id]);
   if(map)for(let k=j+1;k<selected.length;k++)add(mergeChanges(center.finalMap,map,selected[k].finalMap),[selected[i].id,selected[j].id,selected[k].id]);
  }
 }
 const native=await pool(path.join(far.WORK,'templates.json'),6);
 try{
  await Promise.all([...variants].map(async([key,row])=>{const entry=search.rebuild({...template,...row},data),audit=search.audit(entry,data);assert.ok(legal(audit));
   const id='U7F-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id});
   report.states[id]={...row,id,audit,score:s.score,doubledScore:s.doubledScore};}));
  const rows=Object.values(report.states);report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.measuredFinalPolish={completed:true,newStates:variants.size,sourceHashes:{[__filename]:hash(__filename),[path.join(ROOT,'tools/extend_untoned_cr7e_coupled.js')]:hash(path.join(ROOT,'tools/extend_untoned_cr7e_coupled.js'))}};
  fs.writeFileSync(far.PREFIX+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({newStates:variants.size,states:rows.length,best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
