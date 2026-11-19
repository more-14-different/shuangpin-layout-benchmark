'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const fair=require('./search_untoned_cr7e_u7e_fair'),drop=require('./search_untoned_cr7e_dropfinal'),restore=require('./search_untoned_cr7e_restored21'),search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{FINALS}=require('./ckt_v4_scheme_fixture'),{pool}=require('./untoned_v52_stream_pool');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-u7e-deeper-v52');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function inputs(){
 const input=fair.buildInputs('restored21'),reports=['drop20','restored21'].map(phase=>read(fair.prefix(phase)+'.json'));
 for(const report of reports){assert.ok(report.completed);assert.deepEqual(report.policy,input.previous.policy);assert.deepEqual(report.reference,input.previous.reference);
  for(const row of Object.values(report.states)){assert.ok(fair.sameInitials(row.initialMap,input.initialMap));input.known.set(mappingKey(row),row);}}
 return{...input,reports};
}
function jointDisjoint(base,a,b){
 const left=FINALS.filter(f=>base[f]!==a[f]),right=FINALS.filter(f=>base[f]!==b[f]);
 if(!left.length||!right.length||left.some(f=>right.includes(f)))return null;
 const out={...base};for(const f of left)out[f]=a[f];for(const f of right)out[f]=b[f];return out;
}
function componentIds(rows,width=12){const selected=new Map();for(const axis of ['score','doubledScore'])for(const row of [...rows].sort((a,b)=>a[axis]-b[axis]).slice(0,width))selected.set(row.id,row);return [...selected.values()];}
async function main(){
 const {prior,known,initialMap,seeds,reports}=inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},inspect=drop.screening(prior.auditInput);
 const files=[__filename,...fair.IMPORTS,drop.PRIOR,...['drop20','restored21'].map(phase=>fair.prefix(phase)+'.json'),
  ...['search_untoned_cr7e_u7e_fair.js','search_untoned_cr7e_dropfinal.js','search_untoned_cr7e_restored21.js','search_untoned_cr7e_v52.js','search_untoned_cr7e_coupled.js','ckt_v4_scheme_fixture.js','untoned_v52_stream_pool.js'].map(p=>path.join(ROOT,'tools',p)),
  path.join(far.WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe')];
 const sourceHashes=Object.fromEntries(files.map(p=>[p,hash(p)]));let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-u7e-deeper-v52-1',sourceHashes,initialMap,seeds,policy:reports[1].policy,reference:reports[1].reference,baseline:reports[1].baseline,
  contract:{...reports[1].contract,activePhysicalKeys:null,domains:{dropZ:[21,20],full:[21,21]},search:'Continue two open 21-key U7E paths for six shared rounds; four complete Z-empty leader rings; complete restorations from top four per cost; measured disjoint two-component unions at four centers (top twelve per axis); final four full-domain leader rings. Finite exact fixed-policy search.',
   openRounds:6,dropRounds:4,macroWidthPerAxis:12,finalRounds:4},importedUniqueStates:known.size,states:{},stages:[],
  paths:[{axis:'score',seedId:'UEF-086172801862',currentId:'UEF-086172801862',closed:false,steps:[]},{axis:'doubledScore',seedId:'UEF-09a340e17c85',currentId:'UEF-09a340e17c85',closed:false,steps:[]}],openRounds:[],completed:false};
 if(report.completed){console.log(JSON.stringify({completed:true,newStates:Object.keys(report.states).length,closure:report.closure}));return;}
 for(const row of Object.values(report.states))known.set(mappingKey(row),row);const byId=new Map([...known.values(),...seeds].map(r=>[r.id,r]));
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 const rows=n=>[...known.values()].filter(r=>r.audit?.actual?.[1]===n&&(n!==20||r.forbiddenFinalKey==='Z'));
 const allowed=(row,domain)=>domain===20?inspect(row,'Z'):legal(search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput));
 const native=await pool(path.join(far.WORK,'templates.json'),16),pending=new Map();
 async function evaluate(row,domain){const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);
  assert.ok(fair.sameInitials(row.initialMap,initialMap));const entry=search.rebuild({...template,...row},prior.auditInput),audit=domain===20?drop.audit(entry,prior.auditInput,'Z'):search.audit(entry,prior.auditInput);assert.ok(domain===20?drop.legal(audit):legal(audit));
  const job=(async()=>{const id='UED-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id});
   const out={id,family:'U7E',initialMap,finalMap:row.finalMap,domain,...(domain===20?{forbiddenFinalKey:'Z'}:{}),audit,score:s.score,doubledScore:s.doubledScore,parent:row.parent,mutation:row.mutation};
   report.states[id]=out;known.set(key,out);byId.set(id,out);if(Object.keys(report.states).length%100===0){save();console.log(JSON.stringify({states:Object.keys(report.states).length}));}return out;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 async function ring(name,center,domain){const found=report.stages.find(s=>s.name===name&&s.center===center.id);if(found)return found;
  const proposals=new Map();for(const n of search.neighbors(center)){const row={initialMap,...n,parent:center.id};if(allowed(row,domain))proposals.set(mappingKey(row),row);}
  const before=Object.keys(report.states).length,values=await Promise.all([...proposals.values()].map(r=>evaluate(r,domain)));
  const stage={name,center:center.id,domain,legalUnique:proposals.size,newExactStates:Object.keys(report.states).length-before,best1x:[...values].sort((a,b)=>a.score-b.score)[0],best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore)[0]};report.stages.push(stage);save();
  console.log(JSON.stringify({stage:name,center:center.id,domain,newExact:stage.newExactStates,one:stage.best1x.score,two:stage.best2x.doubledScore}));return stage;
 }
 try{
  for(const row of [report.baseline.one,report.baseline.two]){const s=await native.score(row);assert.ok(Math.abs(s.score-row.score)<1e-9&&Math.abs(s.doubledScore-row.doubledScore)<1e-9);}
  for(let round=report.openRounds.length;round<6;round++){
   const index=round%2,trajectory=report.paths[index];if(trajectory.closed){report.openRounds.push({round,index,skipped:true});save();continue;}
   const center=byId.get(trajectory.currentId);assert.ok(center);const stage=await ring('open 21-key path ring',center,21),best=trajectory.axis==='score'?stage.best1x:stage.best2x,improves=best[trajectory.axis]<center[trajectory.axis]-1e-12;
   trajectory.steps.push({from:center.id,to:best.id,improves});if(improves)trajectory.currentId=best.id;else trajectory.closed=true;report.openRounds.push({round,index,skipped:false});save();
  }
  for(let round=report.stages.filter(s=>s.name==='Z-empty descent ring').length;round<4;round++){
   const closed=new Set(report.stages.filter(s=>s.name==='Z-empty descent ring').map(s=>s.center)),values=rows(20),leaders=[...new Map(['score','doubledScore'].map(axis=>{const x=[...values].sort((a,b)=>a[axis]-b[axis])[0];return[x.id,x];})).values()],center=leaders.find(r=>!closed.has(r.id));if(!center)break;
   await ring('Z-empty descent ring',center,20);
  }
  if(!report.stages.some(s=>s.name==='restorations after Z descent')){
   const parents=new Map();for(const axis of ['score','doubledScore'])for(const r of rows(20).sort((a,b)=>a[axis]-b[axis]).slice(0,4))parents.set(r.id,r);
   const groups=[],proposals=new Map();for(const parent of parents.values())for(const original of seeds){let total=0,valid=0;for(const n of restore.restorations(parent.finalMap,original.finalMap,'Z')){
    total++;const row={initialMap,...n,parent:parent.id};if(!allowed(row,21))continue;valid++;proposals.set(mappingKey(row),row);}groups.push({parent:parent.id,original:original.id,total,legal:valid});}
   const before=Object.keys(report.states).length;await Promise.all([...proposals.values()].map(r=>evaluate(r,21)));report.stages.push({name:'restorations after Z descent',domain:21,groups,legalUnique:proposals.size,newExactStates:Object.keys(report.states).length-before});save();
  }
  if(!report.macroCenters){const values=rows(21),fresh=Object.values(report.states).filter(r=>r.domain===21);report.macroCenters=[...new Set([
   ...['score','doubledScore'].map(axis=>[...values].sort((a,b)=>a[axis]-b[axis])[0]?.id),...['score','doubledScore'].map(axis=>[...fresh].sort((a,b)=>a[axis]-b[axis])[0]?.id)].filter(Boolean))];save();}
  for(const id of report.macroCenters){const center=byId.get(id);await ring('macro component ring',center,21);if(report.stages.some(s=>s.name==='measured disjoint joint changes'&&s.center===id))continue;
   const components=new Map();for(const n of search.neighbors(center)){const row={initialMap,...n};if(allowed(row,21))components.set(mappingKey(row),known.get(mappingKey(row)));}
   const beam=componentIds([...components.values()]),groups=[],proposals=new Map();let pairs=0,disjoint=0,valid=0;
   for(let a=0;a<beam.length;a++)for(let b=a+1;b<beam.length;b++){pairs++;const finalMap=jointDisjoint(center.finalMap,beam[a].finalMap,beam[b].finalMap);if(!finalMap)continue;disjoint++;
    const row={initialMap,finalMap,parent:center.id,mutation:'union of measured disjoint changes'};if(!allowed(row,21))continue;valid++;const key=mappingKey(row);proposals.set(key,row);groups.push({key,components:[beam[a].id,beam[b].id]});}
   const before=Object.keys(report.states).length;await Promise.all([...proposals.values()].map(r=>evaluate(r,21)));report.stages.push({name:'measured disjoint joint changes',domain:21,center:id,componentIds:beam.map(r=>r.id),pairs,disjoint,legalPairs:valid,legalUnique:proposals.size,newExactStates:Object.keys(report.states).length-before,
    combinations:groups.map(g=>({id:known.get(g.key).id,components:g.components}))});save();console.log(JSON.stringify({stage:'joint changes',center:id,pairs,disjoint,legalUnique:proposals.size,newExact:Object.keys(report.states).length-before}));
  }
  for(let round=report.stages.filter(s=>s.name==='final 21-key leader ring').length;round<4;round++){
   const values=rows(21),closed=new Set(report.stages.filter(s=>s.domain===21&&s.name.includes('ring')).map(s=>s.center)),leaders=[...new Map(['score','doubledScore'].map(axis=>{const r=[...values].sort((a,b)=>a[axis]-b[axis])[0];return[r.id,r];})).values()],center=leaders.find(r=>!closed.has(r.id));if(!center)break;await ring('final 21-key leader ring',center,21);
  }
  report.lanes=[];report.closure=[];for(const domain of [20,21]){const values=rows(domain),closed=new Set(report.stages.filter(s=>s.domain===domain&&s.name.includes('ring')).map(s=>s.center));
   report.lanes.push({domain,count:values.length,best1x:[...values].sort((a,b)=>a.score-b.score).slice(0,2),best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,2)});
   for(const axis of ['score','doubledScore']){const leader=[...values].sort((a,b)=>a[axis]-b[axis])[0];report.closure.push({domain,axis,leader:leader.id,score:leader[axis],fixedPolicyOneStepClosed:closed.has(leader.id)});}}
  report.bestNew=[];for(const domain of [20,21])for(const axis of ['score','doubledScore']){const row=Object.values(report.states).filter(r=>r.domain===domain).sort((a,b)=>a[axis]-b[axis])[0];if(row&&!report.bestNew.some(r=>r.id===row.id))report.bestNew.push(row);}
  report.completed=true;save();console.log(JSON.stringify({completed:true,newStates:Object.keys(report.states).length,closure:report.closure,bestNew:report.bestNew.map(r=>({id:r.id,domain:r.domain,one:r.score,two:r.doubledScore}))}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={PREFIX,inputs,jointDisjoint,componentIds};
