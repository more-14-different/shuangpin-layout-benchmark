'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const home=require('./search_untoned_cr7e_onsets_home'),search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture'),{mappingKey,legal,screening}=require('./search_untoned_cr7e_coupled'),{pool}=require('./untoned_v52_stream_pool'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-transfer-v52'),KEYS='BCDEFGHJKLMNPQRSTWXYZ';
const PROD='D:/C2D/Documents/rime-snow-pinyin/config/snow-zhudao-mapping.json',UM='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/config/untoned-m40d3-v52-finalist.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function inputs(){const d=home.inputs(),prod=read(PROD),um=read(UM);assert.equal(prod.id,'T2126-V52-M4-ec60a3637a99');assert.equal(um.id,'UM40-dff81aa57dd2');return {...d,prod,um};}
function families(prod,um){return [
 {id:'P7',lane:'primary',pinE:false,initialMap:{...prod.initialMap,sh:'E',W:'W'}},
 {id:'P8',lane:'primary',pinE:true,initialMap:{...prod.initialMap,sh:'E'}},
 {id:'U7',lane:'secondary',pinE:false,initialMap:{...um.initialMap,sh:'E',q:'Q',W:'W'}},
 {id:'U8',lane:'secondary',pinE:true,initialMap:{...um.initialMap,sh:'E',q:'Q'}}];}
function seedVariants(family,seed){const fm={...seed.finalMap};if(family.id[0]==='U')[fm.ao,fm.uai]=[fm.uai,fm.ao];if(!family.pinE)return [{finalMap:fm,mutation:'existing final transplant'}];
 const out=[];for(const repair of ['en','iu','group']){const finalMap={...fm},old=finalMap.e;if(repair==='group'){for(const f of FINALS)if(f!=='e'&&finalMap[f]==='E')finalMap[f]=old;}else finalMap[repair]=old;finalMap.e='E';out.push({finalMap,mutation:'existing final transplant; e->E repair '+repair});}return out;
}
function foreignMap(family,base,rng){const fm={...base};for(const f of FINALS)if('AIOUV'.includes(fm[f]))fm[f]=KEYS[Math.floor(far.random(rng)*KEYS.length)];
 // Remove the old Q and Z groups before explicitly refilling both with safe written tails.
 for(const f of FINALS)if(base[f]==='Q')fm[f]='K';else if(base[f]==='Z')fm[f]='C';fm.ia='Q';fm.uai='Z';
 if(family.pinE){fm.e='E';fm.a='H';}return fm;
}
function allowed(row,inspect,family){const a=inspect(row);return !!a&&a.D===2&&[41,42].includes(a.M)&&(!family.pinE||row.finalMap.e==='E');}
function schedule(step){const at=step%100;return at<30?{phase:'coarse',temperature:.1*(.025/.1)**(at/29)}:{phase:'fine',temperature:.018*(.0003/.018)**((at-30)/69)};}
function selected(report){const out=[];for(const lane of ['primary','secondary'])for(const axis of ['score','doubledScore'])out.push(report.laneBest[lane][axis]);return [...new Map(out.map(r=>[r.id,r])).values()];}
async function main(){
 const {prior,previous,seeds,prod,um,xfile}=inputs(),familyList=families(prod,um),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const sourceFiles=[__filename,PROD,UM,xfile,...Object.keys(previous.sourceHashes),path.join(ROOT,'tools/search_untoned_cr7e_onsets_home.js'),path.join(ROOT,'tools/anneal_untoned_cr7e_far.js'),path.join(ROOT,'tools/ckt_v4_scheme_fixture.js')];
 const sourceHashes=Object.fromEntries([...new Set(sourceFiles)].map(p=>[p,hash(p)]));let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 const min=(rows,axis)=>[...rows].sort((a,b)=>a[axis]-b[axis]||a.id.localeCompare(b.id))[0];
 report??={version:'untoned-cr7e-transfer-v52-1',sourceHashes,families:familyList,seeds,reference:prior.reference,policy:previous.policy,
  contract:{capacity:[21,21],D:2,allowedM:[41,42],V:5,branches:0,qzEmpty:true,zqEmpty:true,...auxiliarySemantics(template.tone),costMultipliers:[1,2],
   foreignCandidates:160,foreignExactPerFamily:24,proxyPenalties:[0,150,300,600,1200],proxyTop:3,primaryNewPerChain:350,secondaryNewPerChain:100,
   annealing:'One chain per family and cost axis, 100-new-score coarse/fine cycles; far restarts after each complete cycle; initials fixed per family; pin e->E for P8/U8.',primaryRings:4,secondaryRings:1,
   neighborhood:'Final single moves, pair swaps and whole-key group swaps. Strict D2, M41/M42 and pin-e constraint checked after every atomic proposal. Finite search, not global optimality.'},
  states:{},stages:[],chains:[],trajectory:[],completed:false};
 if(report.completed){console.log(JSON.stringify({completed:true,newExactStates:Object.keys(report.states).length,closure:report.closure}));return;}
 const known=new Map(Object.values(report.states).map(r=>[mappingKey(r),r])),byId=new Map(Object.values(report.states).map(r=>[r.id,r])),pending=new Map(),inspect=screening(prior.auditInput,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),native=await pool(path.join(far.WORK,'templates.json'),12);
 const save=()=>{const tmp=PREFIX+'.json.tmp';fs.writeFileSync(tmp,JSON.stringify(report,null,2)+'\n');for(let n=0;;n++){try{fs.renameSync(tmp,PREFIX+'.json');break;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||n===19)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}}};
 const familyById=new Map(familyList.map(f=>[f.id,f])),rowsFor=f=>[...known.values()].filter(r=>r.family===f),laneRows=lane=>[...known.values()].filter(r=>familyById.get(r.family).lane===lane);
 async function evaluate(family,finalMap,parent,mutation){const row={initialMap:family.initialMap,finalMap},key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);assert.ok(allowed(row,inspect,family));
  const entry=search.rebuild({...template,...row},prior.auditInput),audit=search.audit(entry,prior.auditInput);assert.ok(legal(audit)&&audit.D===2&&[41,42].includes(audit.M));
  const job=(async()=>{const id='TRF-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id}),out={id,family:family.id,initialMap:family.initialMap,finalMap,audit,parent,mutation,score:s.score,doubledScore:s.doubledScore};known.set(key,out);byId.set(id,out);report.states[id]=out;
   if(known.size%200===0){save();console.log(JSON.stringify({newExactStates:known.size,primary1:min(laneRows('primary'),'score')?.score,primary2:min(laneRows('primary'),'doubledScore')?.doubledScore}));}return out;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 try{
  for(const c of [seeds[0],seeds.at(-1)]){const s=await native.score(c);assert.ok(Math.abs(s.score-c.score)<1e-9&&Math.abs(s.doubledScore-c.doubledScore)<1e-9);}
  for(const family of familyList){
   if(!report.stages.some(s=>s.name==='seed transplants'&&s.family===family.id)){const proposals=new Map();for(const seed of seeds)for(const n of seedVariants(family,seed)){const row={initialMap:family.initialMap,...n,parent:seed.id};if(allowed(row,inspect,family))proposals.set(mappingKey(row),row);}
    const before=known.size,values=await Promise.all([...proposals.values()].map(r=>evaluate(family,r.finalMap,r.parent,r.mutation)));report.stages.push({name:'seed transplants',family:family.id,selectedIds:values.map(r=>r.id),newExactStates:known.size-before});save();}
   if(!report.stages.some(s=>s.name==='foreign final centers'&&s.family===family.id)){const rng={rng:20261128+family.id.charCodeAt(0)*101+Number(family.id[1])},candidates=new Map();let attempts=0;
    while(candidates.size<160&&attempts++<50000){const finalMap=foreignMap(family,um.finalMap,rng),row={initialMap:family.initialMap,finalMap},proxy=inspect(row,true);if(allowed(row,inspect,family)&&!known.has(mappingKey(row)))candidates.set(mappingKey(row),{finalMap,...proxy});}
    assert.equal(candidates.size,160);const picks=new Map();for(const penalty of [0,150,300,600,1200])for(const r of [...candidates.values()].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)).slice(0,3))picks.set(JSON.stringify(r.finalMap),r);
    const list=[...candidates.values()];while(picks.size<24){const r=list[Math.floor(far.random(rng)*list.length)];picks.set(JSON.stringify(r.finalMap),r);}
    const before=known.size,values=await Promise.all([...picks.values()].map(r=>evaluate(family,r.finalMap,um.id,'26-to-21 foreign final grouping')));report.stages.push({name:'foreign final centers',family:family.id,generatedLegal:160,attempts,rngAfter:rng.rng,candidateFinalMaps:list.map(r=>r.finalMap),selectedIds:values.map(r=>r.id),newExactStates:known.size-before});save();}
   console.log(JSON.stringify({family:family.id,start1:min(rowsFor(family.id),'score').score,start2:min(rowsFor(family.id),'doubledScore').doubledScore}));
  }
  if(!report.chains.length){for(const family of familyList)for(const objective of ['score','doubledScore']){const seed=min(rowsFor(family.id),objective),index=report.chains.length;report.chains.push({index,family:family.id,objective,rng:20261129+104729*(index+1),seedId:seed.id,currentId:seed.id,bestId:seed.id,newScores:0,transitions:0,accepted:0,restarts:[]});}save();}
  async function run(chain){const family=familyById.get(chain.family),budget=family.lane==='primary'?350:100;
   while(chain.newScores<budget){const step=chain.newScores,phase=schedule(step);
    if(step>0&&step%100===0&&chain.lastRestart!==step){const base=byId.get(chain.bestId);for(let n=0;n<2000;n++){const finalMap=far.perturb(base.finalMap,chain,8+Math.floor(far.random(chain)*5)),row={initialMap:family.initialMap,finalMap};if(FINALS.filter(f=>finalMap[f]!==base.finalMap[f]).length<8||!allowed(row,inspect,family))continue;
      const key=mappingKey(row),fresh=!known.has(key)&&!pending.has(key),r=await evaluate(family,finalMap,base.id,'far restart');chain.currentId=r.id;if(fresh)chain.newScores++;if(r[chain.objective]<byId.get(chain.bestId)[chain.objective])chain.bestId=r.id;chain.restarts.push({at:step,from:base.id,to:r.id,newScore:fresh});break;}chain.lastRestart=step;save();if(chain.newScores>=budget)break;}
    const current=byId.get(chain.currentId);let finalMap;for(let n=0;n<20000;n++){const fm=phase.phase==='coarse'?far.perturb(current.finalMap,chain,2+Math.floor(far.random(chain)*3)):far.mutation(current.finalMap,chain,false);if(FINALS.every(f=>fm[f]===current.finalMap[f])||!allowed({initialMap:family.initialMap,finalMap:fm},inspect,family))continue;finalMap=fm;break;}assert.ok(finalMap,'legal proposal exhausted');
    const key=mappingKey({initialMap:family.initialMap,finalMap}),fresh=!known.has(key)&&!pending.has(key),r=await evaluate(family,finalMap,current.id,phase.phase+' final anneal'),delta=r[chain.objective]-current[chain.objective],accepted=delta<=0||far.random(chain)<Math.exp(-delta/phase.temperature);
    if(accepted){chain.currentId=r.id;chain.accepted++;}if(r[chain.objective]<byId.get(chain.bestId)[chain.objective])chain.bestId=r.id;chain.transitions++;if(fresh)chain.newScores++;
    report.trajectory.push({chain:chain.index,step,from:current.id,to:r.id,accepted,newScore:fresh,...phase,rngAfter:chain.rng});assert.ok(chain.transitions<20000);if(chain.newScores%50===0)save();
   }console.log(JSON.stringify({chain:chain.index,family:chain.family,objective:chain.objective,newScores:chain.newScores,best:byId.get(chain.bestId)[chain.objective]}));
  }
  await Promise.all(report.chains.map(run));
  for(const lane of ['primary','secondary'])for(let round=report.stages.filter(s=>s.name==='complete final leader ring'&&s.lane===lane).length;round<(lane==='primary'?4:1);round++){
   const rows=laneRows(lane),closed=new Set(report.stages.filter(s=>s.name==='complete final leader ring').map(s=>s.center)),axes=round%2?['doubledScore','score']:['score','doubledScore'],center=axes.map(a=>min(rows,a)).find(r=>!closed.has(r.id));if(!center)break;
   const family=familyById.get(center.family),proposals=new Map();for(const n of search.neighbors(center)){const row={initialMap:center.initialMap,...n};if(allowed(row,inspect,family))proposals.set(mappingKey(row),n);}
   const before=known.size,values=await Promise.all([...proposals.values()].map(n=>evaluate(family,n.finalMap,center.id,n.mutation)));report.stages.push({name:'complete final leader ring',lane,center:center.id,legalUnique:proposals.size,selectedIds:values.map(r=>r.id),newExactStates:known.size-before});save();console.log(JSON.stringify({lane,ring:round+1,center:center.id,newExact:known.size-before,one:min(laneRows(lane),'score').score,two:min(laneRows(lane),'doubledScore').doubledScore}));
  }
  report.laneBest=Object.fromEntries(['primary','secondary'].map(lane=>[lane,Object.fromEntries(['score','doubledScore'].map(axis=>[axis,min(laneRows(lane),axis)]))]));
  report.familyBest=Object.fromEntries(familyList.map(f=>[f.id,Object.fromEntries(['score','doubledScore'].map(axis=>[axis,min(rowsFor(f.id),axis)]))]));
  report.closure=['primary','secondary'].flatMap(lane=>['score','doubledScore'].map(axis=>{const r=report.laneBest[lane][axis];return {lane,axis,leader:r.id,score:r[axis],completeNeighborhoodScored:report.stages.some(s=>s.name==='complete final leader ring'&&s.center===r.id)};}));
  report.completed=true;save();console.log(JSON.stringify({completed:true,newExactStates:known.size,closure:report.closure}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={PREFIX,KEYS,PROD,UM,inputs,families,seedVariants,foreignMap,allowed,schedule,selected};
