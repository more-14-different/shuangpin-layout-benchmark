'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const drop=require('./search_untoned_cr7e_dropfinal'),restore=require('./search_untoned_cr7e_restored21'),search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{HEADS}=require('./ckt_v4_scheme_fixture'),{pool}=require('./untoned_v52_stream_pool'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),BASE=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-u7e-fair');
const IMPORTS=['far','recovery','blocks','crosswide','multiblock','dropfinal','restored21'].map(n=>path.join(ROOT,`research/notes/2026-11-20-untoned-cr7e-${n}-v52.json`));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const prefix=phase=>BASE+'-'+phase+'-v52';
const sameInitials=(a,b)=>HEADS.every(h=>a[h]===b[h]);
function laneLeaders(rows,forbidden){const selected=rows.filter(r=>r.forbiddenFinalKey===forbidden);return [...new Map(['score','doubledScore'].map(axis=>{const r=[...selected].sort((a,b)=>a[axis]-b[axis])[0];assert.ok(r);return[r.id,r];})).values()];}
function buildInputs(phase){
 const old=IMPORTS.map(read),prior=read(drop.PRIOR),previous=old[5],initialMap=previous.families.U7E;
 const seedIds=['U7E-1f46d74c337f','U7E-3b1557bb9247'];
 const seeds=[...seedIds.map(id=>prior.results.find(r=>r.id===id)),...previous.seeds.filter(s=>s.family==='U7E')].map(r=>({id:r.id,family:'U7E',initialMap:r.initialMap,finalMap:r.finalMap}));
 for(const seed of seeds)assert.ok(sameInitials(seed.initialMap,initialMap));
 const reports=phase==='restored21'?[...old,read(prefix('drop20')+'.json')]:old;
 if(phase==='restored21')assert.ok(reports.at(-1).completed);
 const known=new Map();for(const r of reports){assert.deepEqual(r.policy,previous.policy);assert.deepEqual(r.reference,previous.reference);
  for(const row of Object.values(r.states)){if(!sameInitials(row.initialMap,initialMap))continue;known.set(mappingKey(row),{...row,family:'U7E'});}}
 return{old,prior,previous,initialMap,seeds,known};
}
async function main(){
 const phase=process.argv.includes('--phase')?process.argv[process.argv.indexOf('--phase')+1]:'drop20';assert.ok(['drop20','restored21'].includes(phase));
 const outPrefix=prefix(phase),{prior,previous,initialMap,seeds,known}=buildInputs(phase),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},inspect=drop.screening(prior.auditInput);
 const sourceFiles=[__filename,...IMPORTS,drop.PRIOR,...(phase==='restored21'?[prefix('drop20')+'.json']:[]),
  ...['search_untoned_cr7e_dropfinal.js','search_untoned_cr7e_restored21.js','search_untoned_cr7e_v52.js','search_untoned_cr7e_coupled.js','ckt_v4_scheme_fixture.js','auxiliary_semantics.js','untoned_v52_stream_pool.js'].map(p=>path.join(ROOT,'tools',p)),
  path.join(far.WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),
  path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe')];
 const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,hash(p)]));let report=fs.existsSync(outPrefix+'.json')?read(outPrefix+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-u7e-fair-v52-1',phase,sourceHashes,initialMap,seeds,policy:previous.policy,reference:previous.reference,
  baseline:{one:previous.seeds.find(r=>r.id==='U7H-ba54b6e08e04'),two:previous.seeds.find(r=>r.id==='U7H-15738b341461')},
  contract:{family:'U7E',scoringCanvas:[21,21],activePhysicalKeys:phase==='drop20'?[21,20]:[21,21],M:42,D:2,V:5,branches:0,qzEmpty:true,zqEmpty:true,initialsFixed:true,
   ...auxiliarySemantics(template.tone),costMultipliers:[1,2],maxRingsPerDropLane:8,maxRestoredPathRings:8,
   search:'Original U7E seeds plus descended U7E frontiers; complete evacuation and independent alternating leader descent for Q/Z. Restore the best four per lane/cost with singleton repair; descend four lane/cost paths with a shared eight-ring budget, then complete final global-leader rings. Finite fixed-policy search.'},
  importedUniqueStates:known.size,states:{},stages:[],restoredPaths:[],completed:false};
 if(report.completed){console.log(JSON.stringify({completed:true,phase,states:Object.keys(report.states).length,closure:report.closure}));return;}
 for(const row of Object.values(report.states))known.set(mappingKey(row),row);
 const byId=new Map([...known.values(),...seeds].map(r=>[r.id,r]));
 const save=()=>{fs.writeFileSync(outPrefix+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(outPrefix+'.json.tmp',outPrefix+'.json');};
 const native=await pool(path.join(far.WORK,'templates.json'),12),pending=new Map();
 const allowed=(row,n=phase==='drop20'?20:21)=>n===20?inspect(row,row.forbiddenFinalKey):legal(search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput));
 async function evaluate(row){const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);
  assert.ok(sameInitials(row.initialMap,initialMap));const entry=search.rebuild({...template,...row},prior.auditInput),audit=phase==='drop20'?drop.audit(entry,prior.auditInput,row.forbiddenFinalKey):search.audit(entry,prior.auditInput);
  assert.ok(phase==='drop20'?drop.legal(audit):legal(audit));
  const job=(async()=>{const id='UEF-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id});
   const result={id,family:'U7E',phase,initialMap,finalMap:row.finalMap,...(phase==='drop20'?{forbiddenFinalKey:row.forbiddenFinalKey}:{}),parent:row.parent,mutation:row.mutation,audit,score:s.score,doubledScore:s.doubledScore};
   known.set(key,result);byId.set(id,result);report.states[id]=result;if(Object.keys(report.states).length%100===0){save();console.log(JSON.stringify({phase,states:Object.keys(report.states).length}));}return result;})();
  pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 const rowsFor=(n,forbidden)=>[...known.values()].filter(r=>r.audit?.actual?.[1]===n&&(n!==20||r.forbiddenFinalKey===forbidden));
 async function ring(center,forbidden,name='complete final local ring'){
  const cached=report.stages.find(s=>s.name===name&&s.center===center.id);if(cached)return cached;
  const candidates=new Map();for(const n of search.neighbors(center)){const row={...center,...n,initialMap,parent:center.id,...(forbidden?{forbiddenFinalKey:forbidden}:{})};if(allowed(row))candidates.set(mappingKey(row),row);}
  const before=Object.keys(report.states).length,values=await Promise.all([...candidates.values()].map(evaluate));
  const stage={name,center:center.id,...(forbidden?{forbiddenFinalKey:forbidden}:{}),legalUnique:candidates.size,newExactStates:Object.keys(report.states).length-before,
   best1x:[...values].sort((a,b)=>a.score-b.score)[0],best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore)[0]};
  report.stages.push(stage);save();console.log(JSON.stringify({phase,center:center.id,forbidden,legal:candidates.size,newExact:stage.newExactStates,one:stage.best1x.score,two:stage.best2x.doubledScore}));return stage;
 }
 try{
  for(const row of [report.baseline.one,report.baseline.two]){const s=await native.score(row);assert.ok(Math.abs(s.score-row.score)<1e-9&&Math.abs(s.doubledScore-row.doubledScore)<1e-9);}
  if(phase==='drop20'){
   for(const forbiddenFinalKey of ['Z','Q'])for(const seed of seeds){
    if(report.stages.some(s=>s.name==='complete direct evacuation'&&s.center===seed.id&&s.forbiddenFinalKey===forbiddenFinalKey))continue;
    let total=0;const candidates=[];for(const finalMap of drop.evacuations(seed.finalMap,forbiddenFinalKey)){total++;const row={initialMap,finalMap,forbiddenFinalKey,parent:seed.id,mutation:'original/descended U7E evacuation'};if(allowed(row))candidates.push(row);}
    const before=Object.keys(report.states).length,values=await Promise.all(candidates.map(evaluate));assert.ok(values.length);
    report.stages.push({name:'complete direct evacuation',center:seed.id,forbiddenFinalKey,total,legal:candidates.length,newExactStates:Object.keys(report.states).length-before,
     best1x:[...values].sort((a,b)=>a.score-b.score)[0],best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore)[0]});save();
   }
   for(let round=0;round<8;round++)for(const forbidden of ['Z','Q']){
    const stages=report.stages.filter(s=>s.name==='complete final local ring'&&s.forbiddenFinalKey===forbidden);if(stages.length>round)continue;
    const closed=new Set(stages.map(s=>s.center)),center=laneLeaders(rowsFor(20,forbidden),forbidden).find(r=>!closed.has(r.id));if(center)await ring(center,forbidden);
   }
  }else{
   const dropped=read(prefix('drop20')+'.json');
   if(!report.stages.some(s=>s.name==='complete bridge restorations')){
    const parents=new Map();for(const forbidden of ['Z','Q'])for(const axis of ['score','doubledScore'])for(const row of rowsFor(20,forbidden).sort((a,b)=>a[axis]-b[axis]).slice(0,4))parents.set(row.id,row);
    const groups=[],candidates=new Map(),byLane={Z:new Set(),Q:new Set()};for(const row of parents.values())for(const original of seeds){let total=0,valid=0;
     for(const n of restore.restorations(row.finalMap,original.finalMap,row.forbiddenFinalKey)){total++;const candidate={initialMap,...n,parent:row.id};if(!allowed(candidate))continue;valid++;const key=mappingKey(candidate);candidates.set(key,candidate);byLane[row.forbiddenFinalKey].add(key);}
     groups.push({parent:row.id,original:original.id,forbiddenFinalKey:row.forbiddenFinalKey,total,legal:valid});}
    const before=Object.keys(report.states).length;await Promise.all([...candidates.values()].map(evaluate));report.stages.push({name:'complete bridge restorations',groups,legalUnique:candidates.size,newExactStates:Object.keys(report.states).length-before});
    // Paths preserve lane provenance even if a historical frontier initially wins overall.
    for(const forbidden of ['Z','Q'])for(const axis of ['score','doubledScore']){
     const values=[...byLane[forbidden]].map(key=>known.get(key));
     assert.ok(values.length);const seed=[...values].sort((a,b)=>a[axis]-b[axis])[0];report.restoredPaths.push({forbiddenFinalKey:forbidden,axis,seedId:seed.id,currentId:seed.id,closed:false,steps:[]});}
    save();
   }
   for(let pass=0;pass<8;pass++){
    let changed=false;for(const trajectory of report.restoredPaths){if(trajectory.closed)continue;
     const center=byId.get(trajectory.currentId),cached=report.stages.find(s=>s.name==='complete final local ring'&&s.center===center.id);
     if(!cached&&report.stages.filter(s=>s.name==='complete final local ring').length>=8)continue;
     const stage=cached||await ring(center),best=trajectory.axis==='score'?stage.best1x:stage.best2x;
     const improves=best[trajectory.axis]<center[trajectory.axis]-1e-12;trajectory.steps.push({from:center.id,to:best.id,improves});
     if(improves)trajectory.currentId=best.id;else trajectory.closed=true;save();changed=true;
    }if(!changed)break;
   }
   for(const axis of ['score','doubledScore']){const leader=rowsFor(21).sort((a,b)=>a[axis]-b[axis])[0];await ring(leader,undefined,'complete final global leader ring');}
   report.dropSource={file:prefix('drop20')+'.json',sha256:hash(prefix('drop20')+'.json'),closure:dropped.closure};
  }
  report.lanes=[];for(const forbiddenFinalKey of phase==='drop20'?['Z','Q']:[null]){const values=rowsFor(phase==='drop20'?20:21,forbiddenFinalKey);report.lanes.push({forbiddenFinalKey,count:values.length,
   best1x:[...values].sort((a,b)=>a.score-b.score).slice(0,2),best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,2)});}
  report.closure=[];for(const lane of report.lanes)for(const axis of ['score','doubledScore']){const leader=(axis==='score'?lane.best1x:lane.best2x)[0],stage=report.stages.find(s=>(s.name.includes('local ring')||s.name.includes('global leader ring'))&&s.center===leader.id);
   report.closure.push({forbiddenFinalKey:lane.forbiddenFinalKey,axis,leader:leader.id,score:leader[axis],fixedPolicyOneStepClosed:Boolean(stage)});}
  report.completed=true;save();console.log(JSON.stringify({completed:true,phase,newStates:Object.keys(report.states).length,closure:report.closure}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={BASE,IMPORTS,prefix,buildInputs,sameInitials,laneLeaders};
