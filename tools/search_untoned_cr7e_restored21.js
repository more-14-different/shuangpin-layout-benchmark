'use strict';
// Use the dropped-key layouts as a bridge, then restore the original 21-key domain.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const drop=require('./search_untoned_cr7e_dropfinal'),search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{FINALS}=require('./ckt_v4_scheme_fixture'),{pool}=require('./untoned_v52_stream_pool');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-restored21-v52');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function* restorations(map,original,forbidden){
 const tokens=FINALS.filter(f=>original[f]===forbidden);
 for(let mask=1;mask<2**tokens.length;mask++){
  const fm={...map},restored=tokens.filter((_,i)=>mask&(1<<i));for(const f of restored)fm[f]=forbidden;
  yield {finalMap:fm,mutation:`restore ${restored.join('/')} to ${forbidden}`};
  // Restoring the key can vacate another singleton bucket; repair it atomically.
  for(const key of drop.KEYS)if(!Object.values(fm).includes(key))for(const f of FINALS)if(!restored.includes(f))yield {finalMap:{...fm,[f]:key},mutation:`restore ${restored.join('/')} to ${forbidden}; repair ${f} to ${key}`};
 }
}
function parents(report){const picks=new Map();for(const lane of report.lanes){const rows=Object.values(report.states).filter(r=>r.family===lane.family&&r.forbiddenFinalKey===lane.forbiddenFinalKey);
 for(const axis of ['score','doubledScore'])for(const row of rows.sort((a,b)=>a[axis]-b[axis]).slice(0,4))picks.set(row.id,row);}
 // Retain the original discovery even if later 20-key descent displaces it from the beam.
 if(report.states['U7D-345a8cbf2297'])picks.set('U7D-345a8cbf2297',report.states['U7D-345a8cbf2297']);return [...picks.values()];}
function discovery(source){const initialMap=source.target.initialMap,finalMap={...source.target.finalMap},a=finalMap.ai,b=finalMap.er;
 for(const f of FINALS)if(finalMap[f]===a)finalMap[f]=b;else if(finalMap[f]===b)finalMap[f]=a;
 const id='U7R-'+crypto.createHash('sha256').update(mappingKey({initialMap,finalMap})).digest('hex').slice(0,12);
 return{id,family:'U7X',initialMap,finalMap,parent:'U7D-345a8cbf2297',mutation:'restore Q after the ai/van versus er/ian group exchange'};}
async function main(){
 const source=read(drop.PREFIX+'.json');assert.ok(source.completed);const prior=read(drop.PRIOR),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const files=[__filename,drop.PREFIX+'.json',drop.PRIOR,path.join(ROOT,'tools/search_untoned_cr7e_v52.js'),path.join(ROOT,'tools/search_untoned_cr7e_dropfinal.js'),
  path.join(ROOT,'tools/search_untoned_cr7e_coupled.js'),path.join(ROOT,'tools/untoned_v52_stream_pool.js'),path.join(ROOT,'tools/anneal_untoned_cr7e_far.js'),
  path.join(far.WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),
  path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe')];
 const sourceHashes=Object.fromEntries(files.map(p=>[p,hash(p)]));let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-restored21-v52-1',sourceHashes,policy:source.policy,reference:source.reference,target:source.target,families:source.families,
  contract:{capacity:[21,21],activePhysicalKeys:[21,21],M:42,D:2,V:5,branches:0,qzEmpty:true,zqEmpty:true,costMultipliers:[1,2],initialsFixedPerFamily:true,
   search:'Restore one or all removed-key finals from top four per cost/family/exclusion plus the original discovery parent, repair a vacated singleton bucket atomically; exact complete local leader descent, at most eight rings. Finite bridge search.'},
  states:{},stages:[],completed:false};
 const known=new Map(Object.values(report.states).map(r=>[mappingKey(r),r])),save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 const native=await pool(path.join(far.WORK,'templates.json'),12),pending=new Map();
 async function evaluate(row){const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);
  const entry=search.rebuild({...template,...row},prior.auditInput),audit=search.audit(entry,prior.auditInput);assert.ok(legal(audit));
  const job=(async()=>{const id='U7R-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id});
   const result={id,family:row.family,initialMap:row.initialMap,finalMap:row.finalMap,parent:row.parent,mutation:row.mutation,audit,score:s.score,doubledScore:s.doubledScore};
   report.states[id]=result;known.set(key,result);if(known.size%100===0){save();console.log(JSON.stringify({states:known.size,best:Math.min(...[...known.values()].map(r=>r.score)),best2:Math.min(...[...known.values()].map(r=>r.doubledScore))}));}return result;})();
  pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 try{
  if(!report.control){const entry=search.rebuild({...template,...source.target},prior.auditInput),s=await native.score(entry);report.control={...source.target,score:s.score,doubledScore:s.doubledScore};save();}
  if(!report.stages.some(s=>s.name==='complete bridge restorations')){
   const candidates=new Map(),groups=[];for(const row of parents(source))for(const original of source.seeds.filter(s=>s.family===row.family)){
    let total=0,legalCount=0;for(const n of restorations(row.finalMap,original.finalMap,row.forbiddenFinalKey)){
     total++;const candidate={family:row.family,initialMap:row.initialMap,...n,parent:row.id},entry=search.rebuild({...template,...candidate},prior.auditInput);
     if(!legal(search.audit(entry,prior.auditInput)))continue;legalCount++;candidates.set(mappingKey(candidate),candidate);}
    groups.push({parent:row.id,original:original.id,forbiddenFinalKey:row.forbiddenFinalKey,total,legal:legalCount});}
   const before=known.size;await Promise.all([...candidates.values()].map(evaluate));report.stages.push({name:'complete bridge restorations',groups,legalUnique:candidates.size,newExactStates:known.size-before});save();
  }
  report.discoveryId=discovery(source).id;assert.ok(report.states[report.discoveryId]);
  const closed=new Set(report.stages.filter(s=>s.name==='complete final local ring').map(s=>s.center));
  for(let round=closed.size;round<8;round++){
   const rows=[...known.values()],leaders=[...[...rows].sort((a,b)=>a.score-b.score).slice(0,1),...[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,1)],center=leaders.find(r=>!closed.has(r.id));if(!center)break;
   const candidates=new Map();for(const n of search.neighbors(center)){const row={...center,...n,parent:center.id},entry=search.rebuild({...template,...row},prior.auditInput);if(legal(search.audit(entry,prior.auditInput)))candidates.set(mappingKey(row),row);}
   const before=known.size;await Promise.all([...candidates.values()].map(evaluate));report.stages.push({name:'complete final local ring',center:center.id,family:center.family,legalUnique:candidates.size,newExactStates:known.size-before});closed.add(center.id);save();
   console.log(JSON.stringify({round,center:center.id,newExact:known.size-before,best1:Math.min(...[...known.values()].map(r=>r.score)),best2:Math.min(...[...known.values()].map(r=>r.doubledScore))}));
  }
  const rows=[...known.values()];report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.closure=['score','doubledScore'].map(axis=>{const leader=[...rows].sort((a,b)=>a[axis]-b[axis])[0];return{axis,leader:leader.id,score:leader[axis],fixedPolicyOneStepClosed:closed.has(leader.id)};});
  report.completed=true;save();console.log(JSON.stringify({completed:true,states:known.size,closure:report.closure}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={PREFIX,restorations,parents,discovery};
