'use strict';
// Only relax the two empty buckets; do not change the active GPU campaign.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const {FINALS,HEADS,splitPinyin}=require('./ckt_v4_scheme_fixture'),{pool}=require('./untoned_v52_stream_pool');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-21-u7e-openqz-v52');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const key=fm=>FINALS.map(f=>fm[f]).join('');
async function explore(){
 const priorPath=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'),prior=read(priorPath),data=prior.auditInput;
 const seedPaths=['U7R-ba54b6e08e04','UED-18c004bd1f31'].map(id=>path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-u7e-deeper-v52-policy-'+id+'.json'));
 const seeds=seedPaths.map(read),initialMap=seeds[0].initialMap;assert.deepEqual(initialMap,seeds[1].initialMap);
 const template={...prior.results.find(e=>e.id==='OC21-e1f155973380'),capacity:[21,21],initialMap};
 const tuples=data.base.map(([p])=>splitPinyin(data.pinyin[p]));
 function inspect(fm){
  const keys=new Set(FINALS.map(f=>fm[f]));if(keys.size!==21||[...keys].some(k=>!'BCDEFGHJKLMNPQRSTWXYZ'.includes(k)))return null;
  const M=6+FINALS.filter(f=>fm[f]!==f.toUpperCase()).length;if(M!==41)return null;
  return {M,qz:tuples.some(([h,f])=>initialMap[HEADS[h]]==='Q'&&fm[FINALS[f]]==='Z'),zq:tuples.some(([h,f])=>initialMap[HEADS[h]]==='Z'&&fm[FINALS[f]]==='Q')};
 }
 const files=[__filename,priorPath,...seedPaths,path.join(far.WORK,'templates.json'),...['search_untoned_cr7e_v52.js','anneal_untoned_cr7e_far.js','ckt_v4_scheme_fixture.js','untoned_v52_stream_pool.js','ckt_v4_upstream_role_tables.json'].map(f=>path.join(ROOT,'tools',f)),path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe')];
 const sources=Object.fromEntries(files.map(p=>[p,hash(p)]));let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;
 if(report){assert.deepEqual(report.sourceHashes,sources);if(report.completed){console.log(JSON.stringify({completed:true,best1:report.best1,best2:report.best2}));return;}}
 report??={completed:false,contract:{initialMap,M:41,D:2,actual:[21,21],branches:0,V:5,qzEmpty:false,zqEmpty:false,policy:far.POLICY,costMultipliers:[1,2,3],search:'Complete defined one-step neighborhoods of both seeds, four chains x 500 transitions, up to two final leader rings. Fixed policy during search; finalists receive 144-policy enumeration.'},sourceHashes:sources,seeds:seeds.map(s=>({id:s.id,finalMap:s.finalMap,optimal1x:s.optimal1x,optimal2x:s.optimal2x})),states:{},stages:[],chains:[]};
 const known=new Map(Object.values(report.states).map(r=>[key(r.finalMap),r])),pending=new Map(),native=await pool(path.join(far.WORK,'templates.json'),3);
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 async function evaluate(fm,parent,mutation){
  const k=key(fm);if(known.has(k))return known.get(k);if(pending.has(k))return pending.get(k);const a=inspect(fm);if(!a)return null;
  const job=(async()=>{const id='UQO-'+crypto.createHash('sha256').update(HEADS.map(h=>initialMap[h]).join('')+'|'+k).digest('hex').slice(0,12),e=search.rebuild({...template,id,finalMap:fm},data),audit=search.audit(e,data);
   assert.ok(audit.valid&&audit.M===41&&audit.D===2&&audit.branches===0);assert.equal(a.qz,audit.qz);assert.equal(a.zq,audit.zq);
   const s=await native.score(e),r={id,finalMap:fm,audit,score:s.score,doubledScore:s.doubledScore,tripleScore:search.normalize(s.modes,prior.reference,3),parent,mutation};
   known.set(k,r);report.states[id]=r;if(known.size%200===0){save();console.log(JSON.stringify({states:known.size,best1:Math.min(...[...known.values()].map(r=>r.score)),best2:Math.min(...[...known.values()].map(r=>r.doubledScore))}));}return r;
  })();pending.set(k,job);try{return await job;}finally{pending.delete(k);}
 }
 async function ring(center,name){
  if(report.stages.some(s=>s.center===center.id&&s.name===name))return;
  const candidates=new Map(search.neighbors(center).filter(n=>inspect(n.finalMap)).map(n=>[key(n.finalMap),n]));
  const added=[...candidates.values()].filter(n=>{const a=inspect(n.finalMap);return a.qz||a.zq;});
  await Promise.all([...candidates.values()].map(n=>evaluate(n.finalMap,center.id,n.mutation)));
  report.stages.push({name,center:center.id,legalUnique:candidates.size,newlyAdmittedByBucketRelaxation:added.length});save();
  console.log(JSON.stringify(report.stages.at(-1)));
 }
 try{
  const centers=[];for(const seed of seeds){const r=await evaluate(seed.finalMap,seed.id,'source seed');assert.ok(Math.abs(r.score-seed.optimal1x.score)<1e-9);centers.push(r);}
  for(const seed of centers)await ring(seed,'seed complete ring');
  if(!report.chains.length)for(let i=0;i<4;i++)report.chains.push({index:i,axis:i%2?'doubledScore':'score',rng:(20261121+104729*(i+1))>>>0,steps:0,accepted:0,current:centers[i%2].id,best:centers[i%2].id});
  const byId=id=>report.states[id];
  async function chain(c){
   while(c.steps<500){
    const phase=far.schedule(c.steps),restart=c.steps>0&&c.steps%150===0;
    let fm=null;const center=byId(restart?c.best:c.current);
    for(let attempt=0;attempt<20000;attempt++){
     const next=restart?far.perturb(center.finalMap,c,8+Math.floor(far.random(c)*5)):phase.phase==='coarse'?far.perturb(center.finalMap,c,2+Math.floor(far.random(c)*3)):far.mutation(center.finalMap,c,false);
     if(key(next)!==key(center.finalMap)&&inspect(next)){fm=next;break;}
    }
    assert.ok(fm);const row=await evaluate(fm,center.id,restart?'distant reheat':phase.phase),delta=row[c.axis]-byId(c.current)[c.axis];
    if(restart||delta<=0||far.random(c)<Math.exp(-delta/phase.temperature)){c.current=row.id;c.accepted++;}
    if(row[c.axis]<byId(c.best)[c.axis])c.best=row.id;c.steps++;if(c.steps%50===0)save();
   }
  }
  await Promise.all(report.chains.map(chain));
  for(let i=report.stages.filter(s=>s.name==='final leader ring').length;i<2;i++){
   const leaders=['score','doubledScore'].map(axis=>[...known.values()].sort((a,b)=>a[axis]-b[axis])[0]);
   const center=leaders.find(r=>!report.stages.some(s=>s.center===r.id));if(!center)break;await ring(center,'final leader ring');
  }
  report.best1=[...known.values()].sort((a,b)=>a.score-b.score).slice(0,5);report.best2=[...known.values()].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,5);
  report.newlyOccupiedStates=[...known.values()].filter(r=>r.audit.qz||r.audit.zq).length;report.completed=true;save();
  console.log(JSON.stringify({completed:true,states:known.size,occupied:report.newlyOccupiedStates,best1:report.best1[0],best2:report.best2[0]}));
 }finally{native.close();}
}
async function verify(id){
 const report=read(PREFIX+'.json'),row=report.states[id];assert.ok(report.completed&&row);
 const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
 const {enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52'),{policyObjects}=require('./finalize_untoned_frontiers_r11'),{auxiliarySemantics}=require('./auxiliary_semantics');
 const html='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html',data=scorer.loadPayload(html),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),reference=v52.evaluateUntoned(data.entries.find(r=>r.id==='S005'),search.REF,null,ctx).v52;
 const entry=search.rebuild({...data.entries.find(r=>r.id==='UED-18c004bd1f31'),...row,initialMap:report.contract.initialMap},data),cases={};
 assert.deepEqual(search.audit(entry,data),row.audit);ctx.scorer=scorer;ctx.model=model;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();
 for(const mode of ['keytao','sanpin']){ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);cases[mode]=enumerateBounded(entry,mode,ctx);ctx.motor=null;if(global.gc)global.gc();console.log(id,mode,144);}
 const selected=Object.fromEntries(Object.entries(far.POLICY).map(([m,p])=>[m,cases[m].results.find(r=>r.policyKey===[p.word2,p.word3,p.word4].join('/')).tracks]));
 for(const[m,value]of [[1,row.score],[2,row.doubledScore],[3,row.tripleScore]])assert.ok(Math.abs(search.normalize(selected,reference,m)-value)<1e-9);
 const optima=[1,2,3].map(m=>optimum(cases,reference,m)),replays=[];
 for(const policy of new Map(optima.map(r=>[JSON.stringify(r.policy),r.policy])).values()){
  ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
  const modes=v52.evaluateUntoned(entry,policyObjects(policy),null,ctx).v52;let maxTrackDifference=0;
  for(const[m,p]of Object.entries(policy)){const expected=cases[m].results.find(r=>r.policyKey===p).tracks;
   for(const[k,t]of Object.entries(expected))for(const[f,v]of Object.entries(t))if(typeof v==='number'){const d=Math.abs(modes[m][k][f]-v);assert.ok(d<1e-8);maxTrackDifference=Math.max(maxTrackDifference,d);}}
  replays.push({policy,scores:[1,2,3].map(m=>search.normalize(modes,reference,m)),maxTrackDifference,modes});if(global.gc)global.gc();
 }
 const components=PREFIX+'-components-'+id+'.json.gz';fs.writeFileSync(components,zlib.gzipSync(Buffer.from(JSON.stringify({id,cases,reference}))));
 const files=[__filename,PREFIX+'.json',components,html,profile,...['verify_untoned_cr7e_v52.js','score_ckt_v52.js','score_completion_ckt_v4.js','ckt_v4_model.js','ckt_block_error.js','auxiliary_semantics.js'].map(f=>path.join(ROOT,'tools',f))];
 const out={completed:true,...row,initialMap:entry.initialMap,codeList:entry.codeList,auxiliarySemantics:auxiliarySemantics(entry.tone),optima,replays,sourceHashes:Object.fromEntries(files.map(p=>[p,hash(p)]))};
 fs.writeFileSync(PREFIX+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,audit:row.audit,optima}));
}
if(require.main===module)(process.argv[2]==='--verify'?verify(process.argv[3]):explore()).catch(e=>{console.error(e);process.exitCode=1;});
