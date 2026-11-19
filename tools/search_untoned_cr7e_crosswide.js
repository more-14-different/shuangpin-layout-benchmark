'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const blocks=require('./search_untoned_cr7e_blocks'),recovery=require('./anneal_untoned_cr7e_recovery'),far=require('./anneal_untoned_cr7e_far'),search=require('./search_untoned_cr7e_v52');
const {screening,mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{pool}=require('./untoned_v52_stream_pool');
const {FINALS}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-crosswide-v52');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const LEFT=['in','ui','un','ve','vn'],RIGHT=['iu','v','uan','eng','van'],KEYS='BEGHKNRT';
function* crossMoves(base,left,right,keys){
 for(const a of left)for(const b of right)for(const ka of keys)if(ka!==base[a])for(const kb of keys)if(kb!==base[b])yield {...base,[a]:ka,[b]:kb};
}
async function main(){
 const imports=[read(far.PREFIX+'.json'),read(recovery.PREFIX+'.json'),read(blocks.PREFIX+'.json')],previous=imports.at(-1);
 assert.ok(previous.completed);
 const prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json')),data=prior.auditInput;
 const initialMap=previous.initialMap,template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const inspect=screening(data,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const sourceFiles=[__filename,far.PREFIX+'.json',recovery.PREFIX+'.json',blocks.PREFIX+'.json',
  path.join(ROOT,'tools/untoned_v52_stream_pool.js'),path.join(ROOT,'tools/search_untoned_cr7e_blocks.js'),
  path.join(ROOT,'tools/search_untoned_cr7e_v52.js'),path.join(ROOT,'tools/search_untoned_cr7e_coupled.js'),
  path.join(far.WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),
  path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')];
 const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,hash(p)]));
 let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-crosswide-v52-1',sourceHashes,initialMap,policy:previous.policy,reference:previous.reference,target:previous.target,
  baseline:{one:previous.bestDefault[0],two:previous.bestDoubled[0]},
  contract:{...previous.contract,search:'complete eight-key left-block assignments at the best-1x backbone; then two rounds of complete simultaneous one-final-per-block reassignments around both cost leaders',
   left:LEFT,right:RIGHT,candidateKeys:KEYS,crossRounds:2},states:{},stages:[],completed:false};
 const known=new Map([...imports.flatMap(r=>Object.values(r.states)),...Object.values(report.states)].map(r=>[mappingKey(r),r]));
 const pending=new Map(),native=await pool(path.join(far.WORK,'templates.json'),12);
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 async function evaluate(row){
  const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);
  const entry=search.rebuild({...template,...row},data),audit=search.audit(entry,data);assert.ok(legal(audit));
  const job=(async()=>{const id='U7W-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id});
   const result={id,initialMap,finalMap:entry.finalMap,parent:row.parent,mutation:row.mutation,audit,score:s.score,doubledScore:s.doubledScore};
   known.set(key,result);report.states[id]=result;
   if(Object.keys(report.states).length%100===0){save();console.log(JSON.stringify({states:Object.keys(report.states).length,best:Math.min(...[...known.values()].map(r=>r.score)),best2:Math.min(...[...known.values()].map(r=>r.doubledScore))}));}
   return result;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 async function stage(name,centers,generate){
  if(report.stages.some(s=>s.name===name))return;
  const legalRows=new Map(),groups=[];let total=0;
  for(const center of centers){let proposals=0,legalCount=0;for(const finalMap of generate(center.finalMap)){
   total++;proposals++;const row={initialMap,finalMap,parent:center.id,mutation:name};if(!inspect(row))continue;
   legalCount++;legalRows.set(mappingKey(row),row);}
   groups.push({center:center.id,total:proposals,legal:legalCount});
  }
  const start=Object.keys(report.states).length,fresh=[...legalRows.values()].filter(r=>!known.has(mappingKey(r)));
  console.log(JSON.stringify({stage:name,total,legal:legalRows.size,newExact:fresh.length}));
  await Promise.all(fresh.map(evaluate));
  const values=[...legalRows.keys()].map(k=>known.get(k));
  report.stages.push({name,groups,totalAssignments:total,legalUnique:legalRows.size,newExactStates:Object.keys(report.states).length-start,
   best1x:[...values].sort((a,b)=>a.score-b.score)[0],best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore)[0]});save();
 }
 try{
  for(const row of [previous.bestDefault[0],previous.bestDoubled[0]]){const s=await native.score(row);assert.ok(Math.abs(s.score-row.score)<1e-9&&Math.abs(s.doubledScore-row.doubledScore)<1e-9);}
  await stage('complete left block over eight keys',[previous.bestDefault[0]],map=>blocks.assignments(map,LEFT,KEYS));
  for(let round=0;round<2;round++){
   const values=[...known.values()],centers=[...new Map([...[...values].sort((a,b)=>a.score-b.score).slice(0,1),...[...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,1)].map(r=>[r.id,r])).values()];
   await stage('complete cross-block pair round '+round,centers,map=>crossMoves(map,LEFT,RIGHT,KEYS));
  }
  const values=[...known.values()];report.bestDefault=[...values].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.completed=true;save();console.log(JSON.stringify({completed:true,newStates:Object.keys(report.states).length,best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={crossMoves,PREFIX,LEFT,RIGHT,KEYS};
