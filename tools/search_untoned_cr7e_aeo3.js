'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const aeo=require('./search_untoned_cr7e_aeo42'),search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const {FINALS}=require('./ckt_v4_scheme_fixture'),{mappingKey,legal,screening}=require('./search_untoned_cr7e_coupled');
const {pool}=require('./untoned_v52_stream_pool'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-aeo3-v52');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const carrierCount=r=>new Set(['A','E','O'].map(h=>r.initialMap[h])).size;
function inputs(){const data=aeo.inputs(),previous=read(aeo.PREFIX+'.json');assert.ok(previous.completed);assert.deepEqual(previous.policy,data.previous.policy);assert.deepEqual(previous.reference,data.previous.reference);
 for(const row of Object.values(previous.states))data.known.set(mappingKey(row),row);
 return {...data,previous,seeds:previous.seeds.map(r=>data.known.get(mappingKey(r)))};
}
function repairFinalMaps(base){
 const fm=base.finalMap,old=fm.e,groups=Object.groupBy(FINALS,f=>fm[f]);assert.notEqual(old,'E');assert.deepEqual(groups[old],['e']);
 const out=[];
 for(const f of FINALS)if(f!=='e'&&groups[fm[f]].length>1)out.push({finalMap:{...fm,e:'E',[f]:old},mutation:`e->E; fill ${old} with ${f}`});
 const group=groups.E;assert.ok(group?.length);const finalMap={...fm,e:'E'};for(const f of group)finalMap[f]=old;
 out.push({finalMap,mutation:`e->E; fill ${old} with group ${group.join('/')}`});
 return [...new Map(out.map(r=>[FINALS.map(f=>r.finalMap[f]).join(''),r])).values()];
}
function* triples(base,keys=aeo.KEYS){for(const A of keys)for(const E of keys)for(const O of keys)if(A!==E&&A!==O&&E!==O)yield {...base,A,E,O};}
function choose(candidates,seed,count=64){
 const picks=new Map(),add=r=>picks.set(mappingKey(r),r);
 // Preserve all distinct-carrier splits adjacent to the measured A=R,E=F,O=F direction.
 for(const r of candidates)if(r.initialMap.A==='R'&&((r.initialMap.E==='F')!==(r.initialMap.O==='F')))add(r);
 for(const penalty of [0,150,300,600,1200])for(const r of [...candidates].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)||mappingKey(a).localeCompare(mappingKey(b))).slice(0,4))add(r);
 assert.ok(picks.size<=count);let rng=seed;
 const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)/4294967296;};
 while(picks.size<Math.min(count,candidates.length))add(candidates[Math.floor(random()*candidates.length)]);
 return [...picks.values()];
}
function selected(report){return [...new Map([...report.bestTripleDefault.slice(0,2),...report.bestTripleDoubled.slice(0,2),...report.bestNew].map(r=>[r.id,r])).values()];}
async function main(){
 const {prior,known,initialMap,seeds,previous}=inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const files=[__filename,...Object.keys(previous.sourceHashes),aeo.PREFIX+'.json',aeo.PREFIX+'-summary.json',path.join(ROOT,'tools/search_untoned_cr7e_aeo42.js')];
 const sourceHashes=Object.fromEntries([...new Set(files)].map(p=>[p,hash(p)]));let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 const eligible=()=>[...known.values()].filter(r=>r.audit?.actual?.[1]===21&&aeo.fixedExceptAEO(r.initialMap,initialMap));
 const min=(rows,axis)=>[...rows].sort((a,b)=>a[axis]-b[axis]||a.id.localeCompare(b.id))[0];
 report??={version:'untoned-cr7e-aeo3-v52-1',sourceHashes,baseInitialMap:initialMap,seeds,reference:prior.reference,policy:previous.policy,importedUniqueStates:known.size,
  contract:{activePhysicalKeys:[21,21],M:42,D:2,V:5,branches:0,qzEmpty:true,zqEmpty:true,nonAEOInitialsFixed:true,...auxiliarySemantics(template.tone),costMultipliers:[1,2],
   repair:'e->E plus one non-singleton final filling the vacated e key, or the entire old E group filling that key',carrierDomain:aeo.KEYS,distinctCarriers:3,
   screenPerRepair:64,proxyPenalties:[0,150,300,600,1200],topPerPenalty:4,includeAllRFFSplits:true,controls:['RRR','RFF'],maxLeaderRings:8,
   scope:'All distinct-carrier assignments are generated and screened for each recorded repaired final map; only selected layouts receive exact CKT scores. Final and carrier leader neighborhoods are fully scored. Finite search, not global optimality.'},
  baseline:{one:min(eligible(),'score'),two:min(eligible(),'doubledScore')},states:{},stages:[],completed:false};
 if(report.completed){console.log(JSON.stringify({completed:true,newExactStates:Object.keys(report.states).length,closure:report.closure}));return;}
 for(const row of Object.values(report.states))known.set(mappingKey(row),row);
 const inspect=screening(prior.auditInput,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),native=await pool(path.join(far.WORK,'templates.json'),16),pending=new Map();
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 async function evaluate(row){const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);assert.ok(aeo.fixedExceptAEO(row.initialMap,initialMap));
  const entry=search.rebuild({...template,...row},prior.auditInput),audit=search.audit(entry,prior.auditInput);assert.ok(legal(audit));
  const job=(async()=>{const id='A3E-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id}),out={id,initialMap:row.initialMap,finalMap:row.finalMap,audit,parent:row.parent,mutation:row.mutation,score:s.score,doubledScore:s.doubledScore};
   known.set(key,out);report.states[id]=out;if(Object.keys(report.states).length%200===0){save();console.log(JSON.stringify({newExactStates:Object.keys(report.states).length}));}return out;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 const routeLeaders=()=>[...new Map(['score','doubledScore'].map(axis=>{const r=min(eligible().filter(r=>carrierCount(r)===3),axis);return [r.id,r];})).values()];
 try{
  for(const row of [report.baseline.one,report.baseline.two]){const s=await native.score(row);assert.ok(Math.abs(s.score-row.score)<1e-9&&Math.abs(s.doubledScore-row.doubledScore)<1e-9);}
  let ordinal=0;
  for(const seed of seeds)for(const repair of repairFinalMaps(seed)){
   const label=seed.id+' | '+repair.mutation,randomSeed=20261125+ordinal++;if(report.stages.some(s=>s.label===label))continue;
   let total=0;const candidates=[];
   for(const initialMap of triples(seed.initialMap)){total++;const row={initialMap,finalMap:repair.finalMap,parent:seed.id,mutation:repair.mutation+'; three A/E/O carriers'},p=inspect(row,true);if(p)candidates.push({...row,...p});}
   const picks=choose(candidates,randomSeed),controls=['RRR','RFF'].map(keys=>({initialMap:{...seed.initialMap,A:keys[0],E:keys[1],O:keys[2]},finalMap:repair.finalMap,parent:seed.id,mutation:repair.mutation+'; control '+keys})).filter(r=>inspect(r));
   const before=Object.keys(report.states).length,values=await Promise.all([...picks,...controls].map(evaluate));
   const stage={name:'screened three-carrier repair',label,center:seed.id,repair,randomSeed,totalAssignments:total,legalAssignments:candidates.length,selectedIds:values.slice(0,picks.length).map(r=>r.id),controlIds:values.slice(picks.length).map(r=>r.id),newExactStates:Object.keys(report.states).length-before,
    best1x:min(values,'score'),best2x:min(values,'doubledScore')};report.stages.push(stage);save();
   console.log(JSON.stringify({stage:report.stages.length,repair:label,legal:candidates.length,newExact:stage.newExactStates,one:stage.best1x.score,two:stage.best2x.doubledScore}));
  }
  for(let round=report.stages.filter(s=>s.name==='complete carrier/final leader ring').length;round<report.contract.maxLeaderRings;round++){
   const closed=new Set(report.stages.filter(s=>s.name==='complete carrier/final leader ring').map(s=>s.center));
   const global=Object.entries({score:report.baseline.one,doubledScore:report.baseline.two}).map(([axis,baseline])=>min(eligible(),axis)).filter(r=>report.states[r.id]);
   const center=[...routeLeaders(),...global].find(r=>!closed.has(r.id));if(!center)break;
   const proposals=new Map();for(const n of [...search.neighbors(center).map(n=>({initialMap:center.initialMap,...n})),...aeo.aeoNeighbors(center.initialMap,center.finalMap)]){
    const row={...n,parent:center.id};if(inspect(row))proposals.set(mappingKey(row),row);}
   const before=Object.keys(report.states).length,values=await Promise.all([...proposals.values()].map(evaluate));
   report.stages.push({name:'complete carrier/final leader ring',center:center.id,legalUnique:proposals.size,selectedIds:values.map(r=>r.id),newExactStates:Object.keys(report.states).length-before,best1x:min(values,'score'),best2x:min(values,'doubledScore')});save();
   console.log(JSON.stringify({ring:round+1,center:center.id,newExact:Object.keys(report.states).length-before,one:min(values,'score').score,two:min(values,'doubledScore').doubledScore}));
  }
  const values=eligible(),triple=values.filter(r=>carrierCount(r)===3),fresh=Object.values(report.states);
  report.bestTripleDefault=[...triple].sort((a,b)=>a.score-b.score).slice(0,4);report.bestTripleDoubled=[...triple].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,4);
  report.bestNew=[...new Map(['score','doubledScore'].map(axis=>{const r=min(fresh,axis);return[r.id,r];})).values()];report.bestOverall={one:min(values,'score'),two:min(values,'doubledScore')};
  report.closure=['score','doubledScore'].map(axis=>{const r=min(triple,axis);return {axis,leader:r.id,score:r[axis],fixedPolicyOneStepClosed:report.stages.some(s=>s.name==='complete carrier/final leader ring'&&s.center===r.id)};});
  report.completed=true;save();console.log(JSON.stringify({completed:true,newExactStates:fresh.length,bestTriple1:report.bestTripleDefault[0],bestTriple2:report.bestTripleDoubled[0],closure:report.closure}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={PREFIX,inputs,repairFinalMaps,triples,choose,carrierCount,selected};
