'use strict';
// Give alternative restored centers their own descent paths, even when an old frontier wins initially.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const fair=require('./search_untoned_cr7e_u7e_fair'),drop=require('./search_untoned_cr7e_dropfinal'),restore=require('./search_untoned_cr7e_restored21'),search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{pool}=require('./untoned_v52_stream_pool');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function choosePathSeeds(rows,baselineKeys,axis){const sorted=[...rows].sort((a,b)=>a[axis]-b[axis]),first=sorted[0];assert.ok(first);
 const alternative=sorted.find(r=>r.id!==first.id&&!baselineKeys.has(mappingKey(r)));return[{kind:'best-restored',row:first},...(alternative?[{kind:'alternative-center',row:alternative}]:[])];}
async function main(){
 const phase='restored21',prefix=fair.prefix(phase),input=fair.buildInputs(phase),{prior,known,seeds,initialMap}=input,dropped=read(fair.prefix('drop20')+'.json');assert.ok(dropped.completed);
 const template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const files=[__filename,path.join(ROOT,'tools/search_untoned_cr7e_u7e_fair.js'),...fair.IMPORTS,drop.PRIOR,fair.prefix('drop20')+'.json',
  ...['search_untoned_cr7e_v52.js','search_untoned_cr7e_dropfinal.js','search_untoned_cr7e_restored21.js','search_untoned_cr7e_coupled.js','auxiliary_semantics.js','untoned_v52_stream_pool.js'].map(p=>path.join(ROOT,'tools',p)),
  path.join(far.WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe')];
 const sourceHashes=Object.fromEntries(files.map(p=>[p,hash(p)]));let report=fs.existsSync(prefix+'.json')?read(prefix+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-u7e-fair-v52-1',phase,sourceHashes,initialMap,seeds,policy:dropped.policy,reference:dropped.reference,baseline:dropped.baseline,
  contract:{...dropped.contract,activePhysicalKeys:[21,21],search:'U7E only: complete restorations from top four per lane/cost and four original/descended maps. Each lane/cost receives its best restored path plus an alternative center distinct from the old frontiers. Shared eight-ring path budget, then complete global-leader rings; finite search.'},
  importedUniqueStates:known.size,states:{},stages:[],restoredPaths:[],completed:false};
 if(report.completed){console.log(JSON.stringify({completed:true,phase,newStates:Object.keys(report.states).length,closure:report.closure}));return;}
 for(const row of Object.values(report.states))known.set(mappingKey(row),row);const byId=new Map([...known.values(),...seeds].map(r=>[r.id,r]));
 const save=()=>{fs.writeFileSync(prefix+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(prefix+'.json.tmp',prefix+'.json');};
 const native=await pool(path.join(far.WORK,'templates.json'),12),pending=new Map();
 async function evaluate(row){const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);
  assert.ok(fair.sameInitials(row.initialMap,initialMap));const entry=search.rebuild({...template,...row},prior.auditInput),audit=search.audit(entry,prior.auditInput);assert.ok(legal(audit));
  const job=(async()=>{const id='UEF-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id});
   const result={id,family:'U7E',phase,initialMap,finalMap:row.finalMap,parent:row.parent,mutation:row.mutation,audit,score:s.score,doubledScore:s.doubledScore};
   known.set(key,result);byId.set(id,result);report.states[id]=result;if(Object.keys(report.states).length%100===0){save();console.log(JSON.stringify({phase,states:Object.keys(report.states).length}));}return result;})();
  pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 async function ring(center,name='complete final local ring'){
  const cached=report.stages.find(s=>s.name===name&&s.center===center.id);if(cached)return cached;
  const candidates=new Map();for(const n of search.neighbors(center)){const row={...center,...n,parent:center.id};if(legal(search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput)))candidates.set(mappingKey(row),row);}
  const before=Object.keys(report.states).length,values=await Promise.all([...candidates.values()].map(evaluate));const stage={name,center:center.id,legalUnique:candidates.size,newExactStates:Object.keys(report.states).length-before,
   best1x:[...values].sort((a,b)=>a.score-b.score)[0],best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore)[0]};
  report.stages.push(stage);save();console.log(JSON.stringify({phase,center:center.id,legal:candidates.size,newExact:stage.newExactStates,one:stage.best1x.score,two:stage.best2x.doubledScore}));return stage;
 }
 try{
  for(const row of [report.baseline.one,report.baseline.two]){const s=await native.score(row);assert.ok(Math.abs(s.score-row.score)<1e-9&&Math.abs(s.doubledScore-row.doubledScore)<1e-9);}
  if(!report.stages.some(s=>s.name==='complete bridge restorations')){
   const parents=new Map();for(const forbidden of ['Z','Q']){const rows=[...known.values()].filter(r=>r.audit?.actual?.[1]===20&&r.forbiddenFinalKey===forbidden);
    for(const axis of ['score','doubledScore'])for(const row of [...rows].sort((a,b)=>a[axis]-b[axis]).slice(0,4))parents.set(row.id,row);}
   const candidates=new Map(),groups=[],byLane={Z:new Set(),Q:new Set()};for(const row of parents.values())for(const original of seeds){let total=0,valid=0;
    for(const n of restore.restorations(row.finalMap,original.finalMap,row.forbiddenFinalKey)){total++;const candidate={initialMap,...n,parent:row.id};if(!legal(search.audit(search.rebuild({...template,...candidate},prior.auditInput),prior.auditInput)))continue;
     valid++;const key=mappingKey(candidate);candidates.set(key,candidate);byLane[row.forbiddenFinalKey].add(key);}
    groups.push({parent:row.id,original:original.id,forbiddenFinalKey:row.forbiddenFinalKey,total,legal:valid});}
   const before=Object.keys(report.states).length;await Promise.all([...candidates.values()].map(evaluate));report.stages.push({name:'complete bridge restorations',groups,legalUnique:candidates.size,newExactStates:Object.keys(report.states).length-before});
   const baselineKeys=new Set([report.baseline.one,report.baseline.two].map(mappingKey));for(const forbiddenFinalKey of ['Z','Q'])for(const axis of ['score','doubledScore']){
    const values=[...byLane[forbiddenFinalKey]].map(k=>known.get(k));for(const choice of choosePathSeeds(values,baselineKeys,axis))report.restoredPaths.push({forbiddenFinalKey,axis,kind:choice.kind,seedId:choice.row.id,currentId:choice.row.id,closed:false,steps:[]});}
   save();
  }
  for(let pass=0;pass<8;pass++){let changed=false;
   for(const trajectory of report.restoredPaths){if(trajectory.closed)continue;const center=byId.get(trajectory.currentId),cached=report.stages.find(s=>s.name==='complete final local ring'&&s.center===center.id);
    if(!cached&&report.stages.filter(s=>s.name==='complete final local ring').length>=8)continue;
    const stage=cached||await ring(center),best=trajectory.axis==='score'?stage.best1x:stage.best2x,improves=best[trajectory.axis]<center[trajectory.axis]-1e-12;
    trajectory.steps.push({from:center.id,to:best.id,improves});if(improves)trajectory.currentId=best.id;else trajectory.closed=true;save();changed=true;
   }if(!changed)break;
  }
  const all21=()=>[...known.values()].filter(r=>r.audit?.actual?.[1]===21);for(const axis of ['score','doubledScore'])await ring(all21().sort((a,b)=>a[axis]-b[axis])[0],'complete final global leader ring');
  const values=all21();report.lanes=[{forbiddenFinalKey:null,count:values.length,best1x:[...values].sort((a,b)=>a.score-b.score).slice(0,2),best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,2)}];
  report.closure=['score','doubledScore'].map(axis=>{const leader=[...values].sort((a,b)=>a[axis]-b[axis])[0];return{forbiddenFinalKey:null,axis,leader:leader.id,score:leader[axis],fixedPolicyOneStepClosed:report.stages.some(s=>s.name.includes('ring')&&s.center===leader.id)};});
  report.dropSource={file:fair.prefix('drop20')+'.json',sha256:hash(fair.prefix('drop20')+'.json'),closure:dropped.closure};report.completed=true;save();console.log(JSON.stringify({completed:true,phase,newStates:Object.keys(report.states).length,closure:report.closure}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={choosePathSeeds};
