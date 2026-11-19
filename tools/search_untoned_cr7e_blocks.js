'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const recovery=require('./anneal_untoned_cr7e_recovery'),far=require('./anneal_untoned_cr7e_far'),search=require('./search_untoned_cr7e_v52');
const {screening,mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{pool}=require('./untoned_v52_stream_pool');
const {FINALS}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-blocks-v52');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function* assignments(base,tokens,keys){
 const total=keys.length**tokens.length;
 for(let index=0;index<total;index++){let n=index;const map={...base};
  for(let i=tokens.length-1;i>=0;i--){map[tokens[i]]=keys[n%keys.length];n=Math.floor(n/keys.length);}yield map;
 }
}
async function main(){
 const previous=read(recovery.PREFIX+'.json'),farReport=read(far.PREFIX+'.json'),prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 assert.ok(previous.exactPolish.completed);
 const initialMap=previous.initialMap,data=prior.auditInput,template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const inspect=screening(data,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const sourceFiles=[__filename,recovery.PREFIX+'.json',far.PREFIX+'.json',path.join(ROOT,'tools/untoned_v52_stream_pool.js'),
  path.join(ROOT,'tools/search_untoned_cr7e_v52.js'),path.join(ROOT,'tools/search_untoned_cr7e_coupled.js'),
  path.join(far.WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),
  path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')];
 const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,hash(p)]));
 let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-blocks-v52-1',sourceHashes,initialMap,policy:previous.policy,reference:previous.reference,target:previous.target,
  contract:{...previous.contract,search:'exact six-key assignments for two five-final blocks, alternating centers; permits merged/split buckets and invalid intermediate steps; final state obeys full contract',
   blocks:[['in','ui','un','ve','vn'],['iu','v','uan','eng','van']],candidateKeys:'BEGKRT',rounds:3},
  baseline:{one:previous.bestDefault[0],two:previous.bestDoubled[0]},states:{},stages:[],completed:false};
 const known=new Map([...Object.values(farReport.states),...Object.values(previous.states),...Object.values(report.states)].map(r=>[mappingKey(r),r]));
 const pending=new Map(),native=await pool(path.join(far.WORK,'templates.json'),12);
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 async function evaluate(row){
  const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);
  const entry=search.rebuild({...template,...row},data),audit=search.audit(entry,data);assert.ok(legal(audit));
  const job=(async()=>{const id='U7B-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id});
   const out={id,initialMap,finalMap:entry.finalMap,audit,score:s.score,doubledScore:s.doubledScore,parent:row.parent,mutation:row.mutation};
   known.set(key,out);report.states[id]=out;
   if(Object.keys(report.states).length%100===0){save();console.log(JSON.stringify({states:Object.keys(report.states).length,best:Math.min(...[...known.values()].map(r=>r.score)),best2:Math.min(...[...known.values()].map(r=>r.doubledScore))}));}
   return out;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 try{
  for(const c of [previous.bestDefault[0],previous.bestDoubled[0]]){const s=await native.score(c);assert.ok(Math.abs(s.score-c.score)<1e-9&&Math.abs(s.doubledScore-c.doubledScore)<1e-9);}
  for(let round=0;round<3;round++){
   if(report.stages.some(s=>s.round===round))continue;
   const tokens=report.contract.blocks[round%2],keys=report.contract.candidateKeys,values=[...known.values()];
   const centers=[...new Map([...[...values].sort((a,b)=>a.score-b.score).slice(0,1),...[...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,1)].map(r=>[r.id,r])).values()];
   const legalRows=new Map(),groups=[];let total=0;
   for(const center of centers){let legalCount=0;const backbone=FINALS.filter(f=>!tokens.includes(f)).map(f=>center.finalMap[f]).join('');
    if(groups.some(g=>g.backbone===backbone)){groups.push({center:center.id,backbone,shared:true});continue;}
    for(const finalMap of assignments(center.finalMap,tokens,keys)){
     total++;const row={initialMap,finalMap,parent:center.id,mutation:`complete block ${tokens.join('/')} over ${keys}`};if(!inspect(row))continue;
     legalCount++;legalRows.set(mappingKey(row),row);
    }groups.push({center:center.id,backbone,legalCount});
   }
   const start=Object.keys(report.states).length,newRows=[...legalRows.values()].filter(r=>!known.has(mappingKey(r)));
   console.log(JSON.stringify({round,tokens,total,legal:legalRows.size,newExact:newRows.length}));
   await Promise.all(newRows.map(evaluate));
   const all=[...legalRows.keys()].map(k=>known.get(k));
   report.stages.push({round,tokens,keys,groups,totalAssignments:total,legalUnique:legalRows.size,newExactStates:Object.keys(report.states).length-start,
    best1x:[...all].sort((a,b)=>a.score-b.score)[0],best2x:[...all].sort((a,b)=>a.doubledScore-b.doubledScore)[0]});save();
  }
  const rows=[...known.values()];report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.completed=true;save();console.log(JSON.stringify({completed:true,newStates:Object.keys(report.states).length,best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={assignments,PREFIX};
