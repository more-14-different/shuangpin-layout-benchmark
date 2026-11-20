'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const home=require('./search_untoned_cr7e_onsets_home'),transfer=require('./search_untoned_cr7e_transfer'),free=require('./search_untoned_cr7e_onsets_free'),search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const coupled=require('./search_untoned_cr7e_coupled'),{HEADS,FINALS}=require('./ckt_v4_scheme_fixture'),{pool}=require('./untoned_v52_stream_pool'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-switch-v52');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),initialKey=im=>HEADS.map(h=>im[h]).join('');
const contract={capacity:[21,21],D:2,allowedM:[41,42],V:5,branches:0,qzEmpty:true,zqEmpty:true,trials:18,batchSize:32,maxBatches:3,continueGain:.003,oneCostTrials:12,twoCostTrials:6,
 selection:'One new initial mapping per trial; proxies prioritize motor/collision and initial home-row share, with deterministic diversified selection every third trial. Each trial gives its own initial map 32 legal final probes; continue only if the current target CKT improves by at least .003 in that batch, at most three batches. No full-neighborhood/global optimality claim.',...auxiliarySemantics('IVUAO')};
function inputs(){const d=home.inputs(),h=read(home.PREFIX+'.json'),t=read(transfer.PREFIX+'.json');assert.ok(h.completed&&t.completed);assert.deepEqual(h.policy,t.policy);assert.deepEqual(d.previous.policy,t.policy);assert.deepEqual(h.reference,t.reference);
 for(const report of [h,t])for(const row of Object.values(report.states))d.known.set(coupled.mappingKey(row),row);
 const anchors=[d.seeds.find(r=>r.id==='U7R-143cf16e1fa2'),d.seeds.find(r=>r.id==='U7R-9a7d2e90a161'),d.previous.bestNew[0],d.previous.bestNew[1],h.bestDefault[0],t.laneBest.primary.score];assert.ok(anchors.every(Boolean));
 return {...d,h,t,anchors};
}
function valid(row,inspect){const a=inspect(row);return a&&a.D===2&&[41,42].includes(a.M);}
function rng(seed){return {rng:seed};}
function repairedMaps(im,fm){const copies=[{...fm}];const memoryInitial=HEADS.filter(h=>!['A','E','O','YU'].includes(h)&&im[h]!==h.toUpperCase()).length+new Set(['A','E','O'].map(h=>im[h])).size;
 if(memoryInitial>7&&fm.e!=='E'){const old=fm.e;for(const f of ['en','iu'])copies.push({...fm,e:'E',[f]:old});const m={...fm,e:'E'};for(const f of FINALS)if(f!=='e'&&fm[f]==='E')m[f]=old;copies.push(m);}
 return copies;
}
function initialPool(anchor,inspect,tried){const proposals=new Map();let generated=0;
 const consider=im=>{if(initialKey(im)===initialKey(anchor.initialMap)||tried.has(initialKey(im)))return;for(const finalMap of repairedMaps(im,anchor.finalMap)){
  generated++;const row={initialMap:im,finalMap},p=inspect(row,true);if(p&&p.D===2&&[41,42].includes(p.M))proposals.set(coupled.mappingKey(row),{...row,...p});}};
 for(const n of coupled.initialNeighbors(anchor))consider(n.initialMap);
 for(const n of free.reallocations(anchor.initialMap))for(const im of free.retroRepairs(n.initialMap))consider(im);
 for(const n of home.homeAllocations(anchor.initialMap))for(const im of home.homeRetros(n.initialMap))consider(im);
 return {generated,rows:[...proposals.values()]};
}
function pickInitial(rows,index){const penalty=[150,600,300][index%3],sorted=[...rows].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)||coupled.mappingKey(a).localeCompare(coupled.mappingKey(b)));
 if(index%3!==2)return sorted[0];const state=rng(20261130+index);return sorted[Math.floor(far.random(state)*Math.min(200,sorted.length))];
}
function finalPool(center,inspect,seed){const proposals=new Map(),add=n=>{const row={initialMap:center.initialMap,finalMap:n.finalMap},p=inspect(row,true);if(p&&p.D===2&&[41,42].includes(p.M)&&coupled.mappingKey(row)!==coupled.mappingKey(center))proposals.set(coupled.mappingKey(row),{...row,...p});};
 for(const n of search.neighbors(center))add(n);const state=rng(seed);for(let i=0;i<160;i++)add({finalMap:far.perturb(center.finalMap,state,2+Math.floor(far.random(state)*3))});return [...proposals.values()];
}
function selectFinals(rows,seed){const picks=new Map(),add=r=>picks.set(coupled.mappingKey(r),r);for(const penalty of [0,150,300,600,1200])for(const r of [...rows].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)||coupled.mappingKey(a).localeCompare(coupled.mappingKey(b))).slice(0,4))add(r);
 const state=rng(seed);while(picks.size<Math.min(32,rows.length))add(rows[Math.floor(far.random(state)*rows.length)]);return [...picks.values()];
}
function shouldContinue(gain,batches){return gain>=contract.continueGain&&batches<contract.maxBatches;}
function selected(report){return [...new Map([...report.bestDefault.slice(0,1),...report.bestDoubled.slice(0,1)].map(r=>[r.id,r])).values()];}
async function main(){const {prior,previous,known,anchors,h,t,xfile}=inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const files=[__filename,home.PREFIX+'.json',transfer.PREFIX+'.json',xfile,...Object.keys(h.sourceHashes),...Object.keys(t.sourceHashes),...['search_untoned_cr7e_onsets_free.js','search_untoned_cr7e_onsets_home.js','search_untoned_cr7e_coupled.js','search_untoned_cr7e_v52.js','anneal_untoned_cr7e_far.js','ckt_v4_scheme_fixture.js','auxiliary_semantics.js'].map(n=>path.join(ROOT,'tools',n))];
 const sourceHashes=Object.fromEntries([...new Set(files)].map(p=>[p,hash(p)]));let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-switch-v52-1',contract,sourceHashes,anchors,policy:previous.policy,reference:prior.reference,states:{},trials:[],completed:false};if(report.completed){console.log(JSON.stringify({completed:true,newExactStates:Object.keys(report.states).length}));return;}
 for(const row of Object.values(report.states))known.set(coupled.mappingKey(row),row);const inspect=coupled.screening(prior.auditInput,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),native=await pool(path.join(far.WORK,'templates.json'),12),pending=new Map();
 const save=()=>{const tmp=PREFIX+'.json.tmp';fs.writeFileSync(tmp,JSON.stringify(report,null,2)+'\n');for(let n=0;;n++){try{fs.renameSync(tmp,PREFIX+'.json');break;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||n===19)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}}};
 const min=(rows,axis)=>[...rows].sort((a,b)=>a[axis]-b[axis]||a.id.localeCompare(b.id))[0];
 async function evaluate(row,parent,mutation){const key=coupled.mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);assert.ok(valid(row,inspect));
  const entry=search.rebuild({...template,...row},prior.auditInput),audit=search.audit(entry,prior.auditInput);assert.ok(coupled.legal(audit)&&audit.D===2&&[41,42].includes(audit.M));
  const job=(async()=>{const id='SWI-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id}),out={id,initialMap:row.initialMap,finalMap:row.finalMap,audit,parent,mutation,score:s.score,doubledScore:s.doubledScore};known.set(key,out);report.states[id]=out;return out;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}}
 try{for(const c of [anchors[0],anchors.at(-1)]){const s=await native.score(c);assert.ok(Math.abs(s.score-c.score)<1e-9&&Math.abs(s.doubledScore-c.doubledScore)<1e-9);}
  for(let index=0;index<contract.trials;index++){
   let trial=report.trials[index];if(trial?.completed)continue;
   const tried=new Set(report.trials.slice(0,index).map(t=>initialKey(t.initialMap))),anchor=anchors[index%anchors.length],axis=index%3===1?'doubledScore':'score';
   if(!trial){const candidates=initialPool(anchor,inspect,tried);assert.ok(candidates.rows.length);const proposal=pickInitial(candidates.rows,index),before=Object.keys(report.states).length,start=await evaluate(proposal,anchor.id,'adaptive new initial center');
    trial={index,anchor:anchor.id,axis,initialMap:proposal.initialMap,initialPoolGenerated:candidates.generated,initialPoolLegal:candidates.rows.length,startId:start.id,newStartStates:Object.keys(report.states).length-before,batches:[],completed:false};report.trials.push(trial);save();}
   const byId=new Map([...known.values()].map(r=>[r.id,r]));let center=byId.get(trial.batches.at(-1)?.bestId??trial.startId);assert.ok(center);
   while(trial.batches.length<contract.maxBatches){if(trial.batches.length&&!trial.batches.at(-1).continue)break;
    const batchIndex=trial.batches.length,seed=20261201+index*101+batchIndex,rows=finalPool(center,inspect,seed),picks=selectFinals(rows,seed+1),before=Object.keys(report.states).length,values=await Promise.all(picks.map(r=>evaluate(r,center.id,'adaptive short final probe'))),best=min([center,...values],axis),gain=center[axis]-best[axis],count=batchIndex+1;
    trial.batches.push({index:batchIndex,center:center.id,seed,legalPool:rows.length,selectedIds:values.map(r=>r.id),newExactStates:Object.keys(report.states).length-before,bestId:best.id,bestScore:best[axis],gain,continue:shouldContinue(gain,count)});center=best;save();
   }
   trial.completed=true;trial.finalId=center.id;trial.totalGain=byId.get(trial.startId)[axis]-center[axis];trial.reason=trial.batches.at(-1).gain<contract.continueGain?'insufficient batch gain; change initials':'batch cap; change initials';save();
   console.log(JSON.stringify({trial:index+1,anchor:anchor.id,axis,batches:trial.batches.length,initial:byId.get(trial.startId)[axis],final:center[axis],gain:trial.totalGain,next:'change initials',newExactStates:Object.keys(report.states).length}));
  }
  const byId=new Map([...known.values()].map(r=>[r.id,r])),tested=new Map();for(const trial of report.trials)for(const id of [trial.startId,...trial.batches.flatMap(b=>b.selectedIds)]){const r=byId.get(id);tested.set(coupled.mappingKey(r),r);}const rows=[...tested.values()];
  report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,4);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,4);report.uniqueCoveredLayouts=rows.length;report.completed=true;save();console.log(JSON.stringify({completed:true,newExactStates:Object.keys(report.states).length,coverage:rows.length,best1:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={PREFIX,contract,inputs,initialKey,valid,repairedMaps,initialPool,pickInitial,finalPool,selectFinals,shouldContinue,selected};
