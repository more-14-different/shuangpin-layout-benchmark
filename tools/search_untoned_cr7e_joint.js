'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sw=require('./search_untoned_cr7e_switch_open'),strict=require('./search_untoned_cr7e_switch'),search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture'),{mappingKey}=require('./search_untoned_cr7e_coupled'),{pool}=require('./untoned_v52_stream_pool'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-joint-v52');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const FLEX=['eng','ing','uan','v','ve','vn','in','ui','un'],contract={capacity:[21,21],D:2,allowedM:[41,42],V:5,branches:0,qzEmpty:false,zqEmpty:false,initialBeam:24,trialsPerAnchor:4,batchSize:32,maxBatches:3,continueGain:.003,
 featureGuidance:'Prioritize finals eng/ing/uan/v/ve/vn/in/ui/un as a soft preference; retain random coverage. Rank initial maps by their best joint-final proxy, not a requirement for an improving initial-only step.',...auxiliarySemantics('IVUAO')};
function inputs(){const d=sw.inputs(),s=read(strict.PREFIX+'.json'),o=read(sw.PREFIX+'.json');assert.ok(s.completed&&o.completed);for(const r of [s,o]){assert.deepEqual(r.policy,d.previous.policy);assert.deepEqual(r.reference,d.prior.reference);for(const row of Object.values(r.states))d.known.set(mappingKey(row),row);}
 const anchors=[d.anchors[0],d.anchors[1],o.bestDefault[0]];return {...d,s,o,anchors};
}
function initialBeam(rows,seed){const picks=new Map(),add=r=>{const k=sw.initialKey(r.initialMap);if(!picks.has(k))picks.set(k,r);};
 for(const penalty of [0,150,300,600,1200])for(const r of [...rows].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)||mappingKey(a).localeCompare(mappingKey(b))).slice(0,4))add(r);
 const rng={rng:seed};while(picks.size<24){const r=rows[Math.floor(far.random(rng)*rows.length)];add(r);}return [...picks.values()].slice(0,24);
}
function jointPool(anchor,reference,inspect,seed){const rows=new Map(),add=fm=>{const row={initialMap:reference.initialMap,finalMap:fm},p=inspect(row,true);if(p&&p.D===2&&[41,42].includes(p.M))rows.set(mappingKey(row),{...row,...p});};
 for(const base of [anchor,reference]){add(base.finalMap);for(const n of search.neighbors(base))add(n.finalMap);}const rng={rng:seed};
 for(let n=0;n<96;n++){const fm={...anchor.finalMap},a=FLEX[Math.floor(far.random(rng)*FLEX.length)],b=FLEX[Math.floor(far.random(rng)*FLEX.length)];[fm[a],fm[b]]=[fm[b],fm[a]];if(n%3===0){const c=FLEX[Math.floor(far.random(rng)*FLEX.length)];fm[c]='BCDEFGHJKLMNPQRSTWXYZ'[Math.floor(far.random(rng)*21)];}add(fm);}
 return [...rows.values()];
}
function selectJoint(rows,anchor,seed){const picks=new Map(),add=r=>picks.set(mappingKey(r),r),sort=(rows,p)=>[...rows].sort((a,b)=>(a.proxy+p*a.miss)-(b.proxy+p*b.miss)||mappingKey(a).localeCompare(mappingKey(b)));
 for(const penalty of [0,150,300,600,1200])for(const r of sort(rows,penalty).slice(0,3))add(r);
 const focused=rows.filter(r=>FINALS.some(f=>r.finalMap[f]!==anchor.finalMap[f])&&FINALS.every(f=>r.finalMap[f]===anchor.finalMap[f]||FLEX.includes(f)));
 for(const p of [150,600])for(const r of sort(focused,p).slice(0,4))add(r);
 const rng={rng:seed};while(picks.size<Math.min(32,rows.length)){const r=rows[Math.floor(far.random(rng)*rows.length)];add(r);}return [...picks.values()];
}
function plan(anchor,inspect,tried,index){const pool=sw.initialPool(anchor,inspect,tried),beam=initialBeam(pool.rows,20261202+index),rows=beam.map((reference,i)=>{const seed=20261203+index*100+i,combined=jointPool(anchor,reference,inspect,seed);return {reference,seed,legalPool:combined.length,bestProxy150:Math.min(...combined.map(r=>r.proxy+150*r.miss)),bestProxy600:Math.min(...combined.map(r=>r.proxy+600*r.miss))};});
 const selected=new Map(),add=r=>selected.set(sw.initialKey(r.reference.initialMap),r);
 for(const axis of ['bestProxy150','bestProxy600'])for(const r of [...rows].sort((a,b)=>a[axis]-b[axis]||mappingKey(a.reference).localeCompare(mappingKey(b.reference))).slice(0,2))add(r);
 const rng={rng:20261204+index};while(selected.size<4){const r=rows[Math.floor(far.random(rng)*rows.length)];add(r);}return {initialPoolGenerated:pool.generated,initialPoolLegal:pool.rows.length,beam:rows,selected:[...selected.values()].slice(0,4)};
}
function selected(report){return [...new Map([report.bestDefault[0],report.bestDoubled[0],report.bestNovelDefault[0],report.bestNovelDoubled[0]].filter(Boolean).map(r=>[r.id,r])).values()];}
async function main(){const {prior,previous,known,anchors,h,t,s,o}=inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const sourceFiles=[__filename,strict.PREFIX+'.json',sw.PREFIX+'.json',...Object.keys(s.sourceHashes),...Object.keys(o.sourceHashes),...['search_untoned_cr7e_switch_open.js','search_untoned_cr7e_switch.js','search_untoned_cr7e_v52.js','anneal_untoned_cr7e_far.js','ckt_v4_scheme_fixture.js','auxiliary_semantics.js'].map(n=>path.join(ROOT,'tools',n))];
 const sourceHashes=Object.fromEntries([...new Set(sourceFiles)].map(p=>[p,hash(p)]));let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-joint-v52-1',sourceHashes,contract,anchors,policy:previous.policy,reference:prior.reference,states:{},plans:[],trials:[],completed:false};if(report.completed){console.log(JSON.stringify({completed:true,newExactStates:Object.keys(report.states).length}));return;}
 for(const row of Object.values(report.states))known.set(mappingKey(row),row);const inspect=sw.openScreening(prior.auditInput,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),native=await pool(path.join(far.WORK,'templates.json'),12),pending=new Map();
 const min=(rows,axis)=>[...rows].sort((a,b)=>a[axis]-b[axis]||a.id.localeCompare(b.id))[0],save=()=>{const tmp=PREFIX+'.json.tmp';fs.writeFileSync(tmp,JSON.stringify(report,null,2)+'\n');for(let n=0;;n++){try{fs.renameSync(tmp,PREFIX+'.json');break;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||n===19)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}}};
 async function evaluate(row,parent,mutation){const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);assert.ok(sw.valid(row,inspect));const e=search.rebuild({...template,...row},prior.auditInput),audit=search.audit(e,prior.auditInput);assert.ok(audit.valid&&audit.D===2&&[41,42].includes(audit.M)&&!audit.branches);
  const job=(async()=>{const id='JNT-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),score=await native.score({...e,id}),out={id,initialMap:row.initialMap,finalMap:row.finalMap,audit,parent,mutation,score:score.score,doubledScore:score.doubledScore};known.set(key,out);report.states[id]=out;return out;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}}
 try{for(const c of anchors){const r=await native.score(c);assert.ok(Math.abs(r.score-c.score)<1e-9&&Math.abs(r.doubledScore-c.doubledScore)<1e-9);}
  const tried=new Set();
  for(let ai=0;ai<anchors.length;ai++){
   let p=report.plans[ai];if(!p){p={anchor:anchors[ai].id,...plan(anchors[ai],inspect,tried,ai)};report.plans.push(p);save();}for(const r of p.selected)tried.add(sw.initialKey(r.reference.initialMap));
   for(let j=0;j<p.selected.length;j++){const index=ai*4+j,anchor=anchors[ai],axis=j%3===1?'doubledScore':'score';let trial=report.trials[index];if(trial?.completed)continue;
    if(!trial){const before=Object.keys(report.states).length,start=await evaluate(p.selected[j].reference,anchor.id,'joint onset reference');trial={index,anchor:anchor.id,axis,startId:start.id,reference:p.selected[j].reference,initialMap:start.initialMap,newStartStates:Object.keys(report.states).length-before,batches:[],completed:false};report.trials.push(trial);save();}
    const byId=()=>new Map([...known.values()].map(r=>[r.id,r]));let center=byId().get(trial.batches.at(-1)?.bestId??trial.startId);
    while(trial.batches.length<3){if(trial.batches.length&&!trial.batches.at(-1).continue)break;const bi=trial.batches.length,seed=20261205+index*100+bi,pool=bi?sw.finalPool(center,inspect,seed):jointPool(anchor,trial.reference,inspect,seed),picks=selectJoint(pool,anchor,seed+1),before=Object.keys(report.states).length,values=await Promise.all(picks.map(r=>evaluate(r,center.id,'atomic initial-final probe'))),best=min([center,...values],axis),gain=center[axis]-best[axis];
     trial.batches.push({index:bi,center:center.id,seed,legalPool:pool.length,selectedIds:values.map(r=>r.id),newExactStates:Object.keys(report.states).length-before,bestId:best.id,gain,continue:gain>=.003&&bi+1<3});center=best;save();}
    const before=Object.keys(report.states).length,initialOnly={initialMap:center.initialMap,finalMap:anchor.finalMap},finalOnly={initialMap:anchor.initialMap,finalMap:center.finalMap},measure={};
    for(const [name,row]of Object.entries({initialOnly,finalOnly}))measure[name]=sw.valid(row,inspect)?{valid:true,id:(await evaluate(row,anchor.id,name+' interaction control')).id}:{valid:false};
    trial.components=measure;trial.newControlStates=Object.keys(report.states).length-before;trial.finalId=center.id;trial.totalGain=byId().get(trial.startId)[axis]-center[axis];trial.improvementOverAnchor=anchor[axis]-center[axis];trial.completed=true;save();console.log(JSON.stringify({trial:index+1,anchor:anchor.id,axis,batches:trial.batches.length,final:center[axis],ownGain:trial.totalGain,anchorGain:trial.improvementOverAnchor,newExactStates:Object.keys(report.states).length}));
   }
  }
  const byId=new Map([...known.values()].map(r=>[r.id,r])),tested=new Map(anchors.map(r=>[mappingKey(r),r]));for(const trial of report.trials)for(const id of [trial.startId,...trial.batches.flatMap(b=>b.selectedIds),...Object.values(trial.components).filter(c=>c.valid).map(c=>c.id)]){const r=byId.get(id);tested.set(mappingKey(r),r);}const rows=[...tested.values()],novel=Object.values(report.states);
  report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,4);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,4);report.bestNovelDefault=[...novel].sort((a,b)=>a.score-b.score).slice(0,2);report.bestNovelDoubled=[...novel].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,2);report.uniqueCoveredLayouts=rows.length;report.completed=true;save();console.log(JSON.stringify({completed:true,newExactStates:novel.length,coverage:rows.length,best1:report.bestDefault[0].id,best2:report.bestDoubled[0].id,new1:report.bestNovelDefault[0].id,new2:report.bestNovelDoubled[0].id}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={PREFIX,FLEX,contract,inputs,initialBeam,jointPool,selectJoint,plan,selected};
