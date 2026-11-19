'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const recovery=require('./anneal_untoned_cr7e_recovery'),far=require('./anneal_untoned_cr7e_far'),search=require('./search_untoned_cr7e_v52');
const {pool}=require('./untoned_v52_stream_pool'),{screening,mappingKey,legal}=require('./search_untoned_cr7e_coupled');
const {mergeChanges,topBoth}=require('./extend_untoned_cr7e_coupled');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const report=read(recovery.PREFIX+'.json');assert.ok(report.completed);for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(hash(p),h,p);
 if(report.exactPolish?.completed)return;
 report.exactPolish??={sourceHashes:{[__filename]:hash(__filename)},stages:[],completed:false};assert.equal(report.exactPolish.sourceHashes[__filename],hash(__filename));
 const previous=read(far.PREFIX+'.json'),prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 const data=prior.auditInput,template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const known=new Map([...Object.values(previous.states),...Object.values(report.states)].map(r=>[mappingKey(r),r]));
 const inspect=screening(data,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const native=await pool(path.join(far.WORK,'templates.json'),6);
 const save=()=>{fs.writeFileSync(recovery.PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(recovery.PREFIX+'.json.tmp',recovery.PREFIX+'.json');};
 async function evaluate(rows){
  const unique=new Map();for(const row of rows){const e={...row,initialMap:report.initialMap},key=mappingKey(e);if(!known.has(key)&&inspect(e))unique.set(key,e);}
  const results=await Promise.all([...unique].map(async([key,row])=>{const entry=search.rebuild({...template,...row},data),audit=search.audit(entry,data);assert.ok(legal(audit));
   const id='U7H-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id});
   const result={id,initialMap:report.initialMap,finalMap:entry.finalMap,parent:row.parent,mutation:row.mutation,audit,score:s.score,doubledScore:s.doubledScore};
   known.set(key,result);report.states[id]=result;if(Object.keys(report.states).length%100===0){save();console.log(JSON.stringify({states:Object.keys(report.states).length,best:Math.min(...[...known.values()].map(r=>r.score)),best2:Math.min(...[...known.values()].map(r=>r.doubledScore))}));}return result;}));
  return results;
 }
 try{
  const already=report.exactPolish.stages.filter(s=>s.name==='complete final leader ring').length;
  for(let i=already;i<2;i++){
   const closed=new Set(report.exactPolish.stages.map(s=>s.center)),rows=[...known.values()];
   const center=topBoth(rows,1).find(r=>!closed.has(r.id));if(!center)break;
   const proposals=search.neighbors(center).map(r=>({...r,parent:center.id}));
   const scored=await evaluate(proposals);report.exactPolish.stages.push({name:'complete final leader ring',center:center.id,newStates:scored.length});save();
  }
  for(const stage of report.exactPolish.stages.filter(s=>s.name==='complete final leader ring')){
   if(report.exactPolish.stages.some(s=>s.name==='measured final pair/triple'&&s.center===stage.center))continue;
   const center=[...known.values()].find(r=>r.id===stage.center);
   const improving=[...known.values()].filter(r=>r.parent===center.id&&(r.score<center.score||r.doubledScore<center.doubledScore));
   const selected=topBoth(improving,8),proposals=[];
   const add=(map,parents)=>{if(map)proposals.push({finalMap:map,parent:parents,mutation:'measured final pair/triple after recovery'});};
   for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
    const map=mergeChanges(center.finalMap,selected[i].finalMap,selected[j].finalMap);add(map,[selected[i].id,selected[j].id]);
    if(map)for(let k=j+1;k<selected.length;k++)add(mergeChanges(center.finalMap,map,selected[k].finalMap),[selected[i].id,selected[j].id,selected[k].id]);
   }
   const scored=await evaluate(proposals);report.exactPolish.stages.push({name:'measured final pair/triple',center:center.id,newStates:scored.length});save();
  }
  const rows=[...known.values()];report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.exactPolish.completed=true;save();console.log(JSON.stringify({completed:true,states:Object.keys(report.states).length,best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
