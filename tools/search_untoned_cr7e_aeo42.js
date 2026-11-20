'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const deeper=require('./search_untoned_cr7e_u7e_deeper'),fair=require('./search_untoned_cr7e_u7e_fair'),drop=require('./search_untoned_cr7e_dropfinal'),search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture'),{mappingKey,legal,screening}=require('./search_untoned_cr7e_coupled'),{pool}=require('./untoned_v52_stream_pool'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-aeo42-v52'),KEYS='BCDEFGHJKLMNPQRSTWXYZ';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function* carriers(base,maxCarriers=2,keys=KEYS){for(const A of keys)for(const E of keys)for(const O of keys)if(new Set([A,E,O]).size<=maxCarriers)yield{...base,A,E,O};}
function fixedExceptAEO(im,base){return HEADS.filter(h=>!['A','E','O'].includes(h)).every(h=>im[h]===base[h]);}
function inputs(){const input=deeper.inputs(),previous=read(deeper.PREFIX+'.json');assert.ok(previous.completed);assert.deepEqual(previous.policy,input.previous.policy);assert.deepEqual(previous.reference,input.previous.reference);
 for(const r of Object.values(previous.states)){assert.ok(fair.sameInitials(r.initialMap,input.initialMap));input.known.set(mappingKey(r),r);}return{...input,previous};}
function aeoNeighbors(base,finalMap){const out=[];for(const h of ['A','E','O'])for(const k of KEYS)if(k!==base[h])out.push({initialMap:{...base,[h]:k},finalMap,mutation:`move carrier ${h} to ${k}`});
 const groups=Object.groupBy(['A','E','O'],h=>base[h]);for(const group of Object.values(groups))for(const k of KEYS)if(k!==base[group[0]]){const im={...base};for(const h of group)im[h]=k;out.push({initialMap:im,finalMap,mutation:`move carrier group ${group.join('/')} to ${k}`});}
 return out;
}
async function main(){
 const {prior,known,initialMap,previous}=inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},baseInitialMap=initialMap;
 const full=[...known.values()].filter(r=>r.audit?.actual?.[1]===21),byId=new Map([...known.values()].map(r=>[r.id,r]));
 const seeds=['U7R-ba54b6e08e04','U7R-15738b341461','UED-18c004bd1f31'].map(id=>{const r=byId.get(id);assert.ok(r,id);assert.equal(r.audit.M,41);return r;});
 const files=[__filename,...fair.IMPORTS,drop.PRIOR,...['drop20','restored21'].map(phase=>fair.prefix(phase)+'.json'),deeper.PREFIX+'.json',
  ...['search_untoned_cr7e_u7e_deeper.js','search_untoned_cr7e_u7e_fair.js','search_untoned_cr7e_v52.js','search_untoned_cr7e_coupled.js','ckt_v4_scheme_fixture.js','auxiliary_semantics.js','untoned_v52_stream_pool.js'].map(p=>path.join(ROOT,'tools',p)),
  path.join(far.WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe')];
 const sourceHashes=Object.fromEntries(files.map(p=>[p,hash(p)]));let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-aeo42-v52-1',sourceHashes,baseInitialMap,seeds:seeds.map(r=>({id:r.id,initialMap:r.initialMap,finalMap:r.finalMap,audit:r.audit,score:r.score,doubledScore:r.doubledScore})),policy:previous.policy,reference:previous.reference,
  baseline:{one:[...full].sort((a,b)=>a.score-b.score)[0],two:[...full].sort((a,b)=>a.doubledScore-b.doubledScore)[0]},
  contract:{capacity:[21,21],activePhysicalKeys:[21,21],M:42,D:2,V:5,branches:0,qzEmpty:true,zqEmpty:true,nonAEOInitialsFixed:true,...auxiliarySemantics(template.tone),costMultipliers:[1,2],
   search:'Complete A/E/O mappings over 21 main keys, at most two carriers, at three M41 frontier final maps. Then up to six cost-leader local descents with final moves/swaps/group swaps and carrier moves. Selected joint final/carrier proposals permit memory-repair intermediates, followed by up to four leader rings. Finite search.',
   carrierKeys:KEYS,maxCarriersInCompleteSweep:2,firstLeaderRings:6,jointFinalRepairProposalsPerLeader:60,finalLeaderRings:4},importedUniqueStates:known.size,states:{},stages:[],completed:false};
 if(report.completed){console.log(JSON.stringify({completed:true,newStates:Object.keys(report.states).length,closure:report.closure}));return;}
 for(const row of Object.values(report.states)){known.set(mappingKey(row),row);byId.set(row.id,row);}
 const inspect=screening(prior.auditInput,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),native=await pool(path.join(far.WORK,'templates.json'),16),pending=new Map();
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 async function evaluate(row){const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);assert.ok(fixedExceptAEO(row.initialMap,baseInitialMap));
  const entry=search.rebuild({...template,...row},prior.auditInput),audit=search.audit(entry,prior.auditInput);assert.ok(legal(audit));
  const job=(async()=>{const id='A42-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id}),out={id,initialMap:row.initialMap,finalMap:row.finalMap,parent:row.parent,mutation:row.mutation,audit,score:s.score,doubledScore:s.doubledScore};
   known.set(key,out);byId.set(id,out);report.states[id]=out;if(Object.keys(report.states).length%100===0){save();console.log(JSON.stringify({states:Object.keys(report.states).length}));}return out;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 const eligible=()=>[...known.values()].filter(r=>r.audit?.actual?.[1]===21&&fixedExceptAEO(r.initialMap,baseInitialMap));
 const leaders=()=>{const values=eligible();return [...new Map(['score','doubledScore'].map(axis=>{const r=[...values].sort((a,b)=>a[axis]-b[axis])[0];return[r.id,r];})).values()];};
 const neighbors=center=>[...search.neighbors(center).map(n=>({initialMap:center.initialMap,...n})),...aeoNeighbors(center.initialMap,center.finalMap)];
 async function ring(name,center){const cached=report.stages.find(s=>s.name===name&&s.center===center.id);if(cached)return cached;
  const proposals=new Map();for(const n of neighbors(center)){const row={...n,parent:center.id};if(inspect(row))proposals.set(mappingKey(row),row);}
  const before=Object.keys(report.states).length,values=await Promise.all([...proposals.values()].map(evaluate));
  const stage={name,center:center.id,legalUnique:proposals.size,newExactStates:Object.keys(report.states).length-before,best1x:[...values].sort((a,b)=>a.score-b.score)[0],best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore)[0]};report.stages.push(stage);save();console.log(JSON.stringify({stage:name,center:center.id,newExact:stage.newExactStates,one:stage.best1x.score,two:stage.best2x.doubledScore}));return stage;
 }
 try{
  for(const r of seeds){const s=await native.score(r);assert.ok(Math.abs(s.score-r.score)<1e-9&&Math.abs(s.doubledScore-r.doubledScore)<1e-9);}
  for(const seed of seeds){if(report.stages.some(s=>s.name==='complete AEO sweep'&&s.center===seed.id))continue;
   let total=0;const proposals=new Map();for(const im of carriers(seed.initialMap)){total++;const row={initialMap:im,finalMap:seed.finalMap,parent:seed.id,mutation:'complete A/E/O sweep'};if(inspect(row))proposals.set(mappingKey(row),row);}
   const before=Object.keys(report.states).length,values=await Promise.all([...proposals.values()].map(evaluate));report.stages.push({name:'complete AEO sweep',center:seed.id,total,legalUnique:proposals.size,newExactStates:Object.keys(report.states).length-before,
    best1x:[...values].sort((a,b)=>a.score-b.score)[0],best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore)[0],sharedN:values.find(r=>['A','E','O'].every(h=>r.initialMap[h]==='N')),sharedBest:values.filter(r=>new Set(['A','E','O'].map(h=>r.initialMap[h])).size===1).sort((a,b)=>a.score-b.score)[0]});save();
   console.log(JSON.stringify({stage:'complete AEO sweep',center:seed.id,total,legal:proposals.size,newExact:Object.keys(report.states).length-before,one:report.stages.at(-1).best1x.score,two:report.stages.at(-1).best2x.doubledScore}));
  }
  for(let i=report.stages.filter(s=>s.name==='first carrier/final leader ring').length;i<6;i++){const closed=new Set(report.stages.filter(s=>s.name.includes('leader ring')).map(s=>s.center)),center=leaders().find(r=>!closed.has(r.id));if(!center)break;await ring('first carrier/final leader ring',center);}
  if(!report.jointCenters){report.jointCenters=leaders().map(r=>r.id);save();}
  for(const id of report.jointCenters){if(report.stages.some(s=>s.name==='joint memory repair'&&s.center===id))continue;const center=byId.get(id),proposals=new Map();
   // Apply both mutations before legality checks, so an e->E repair can pay for a third carrier.
   for(const n of search.neighbors(center))for(const m of aeoNeighbors(center.initialMap,n.finalMap)){
    const row={initialMap:m.initialMap,finalMap:n.finalMap,parent:id,mutation:n.mutation+' + '+m.mutation},p=inspect(row,true);if(!p||known.has(mappingKey(row)))continue;proposals.set(mappingKey(row),{...row,proxy:p.proxy,miss:p.miss});}
   const rows=[...proposals.values()],picks=new Map();for(const penalty of [150,600])for(const row of [...rows].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)).slice(0,25))picks.set(mappingKey(row),row);
   let rng=20261124+report.stages.length;const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)/4294967296;};while(picks.size<Math.min(60,rows.length)){const row=rows[Math.floor(random()*rows.length)];picks.set(mappingKey(row),row);}
   const before=Object.keys(report.states).length,values=await Promise.all([...picks.values()].map(evaluate));report.stages.push({name:'joint memory repair',center:id,legalNovelUnique:rows.length,selectedIds:values.map(r=>r.id),newExactStates:Object.keys(report.states).length-before});save();
  }
  for(let i=report.stages.filter(s=>s.name==='final carrier/final leader ring').length;i<4;i++){const closed=new Set(report.stages.filter(s=>s.name.includes('leader ring')).map(s=>s.center)),center=leaders().find(r=>!closed.has(r.id));if(!center)break;await ring('final carrier/final leader ring',center);}
  const values=eligible();report.bestDefault=[...values].sort((a,b)=>a.score-b.score).slice(0,4);report.bestDoubled=[...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,4);
  report.bestNew=[...new Map(['score','doubledScore'].map(axis=>{const r=Object.values(report.states).sort((a,b)=>a[axis]-b[axis])[0];return[r.id,r];})).values()];
  report.closure=['score','doubledScore'].map(axis=>{const r=[...values].sort((a,b)=>a[axis]-b[axis])[0];return{axis,leader:r.id,score:r[axis],fixedPolicyOneStepClosed:report.stages.some(s=>s.name.includes('leader ring')&&s.center===r.id)};});
  report.completed=true;save();console.log(JSON.stringify({completed:true,newStates:Object.keys(report.states).length,closure:report.closure,best1:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={PREFIX,KEYS,inputs,carriers,fixedExceptAEO,aeoNeighbors};
