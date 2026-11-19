'use strict';
// Cached historical rings should not consume the opportunity to descend new restored centers.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const fair=require('./search_untoned_cr7e_u7e_fair'),search=require('./search_untoned_cr7e_v52'),drop=require('./search_untoned_cr7e_dropfinal'),far=require('./anneal_untoned_cr7e_far');
const {mappingKey,legal}=require('./search_untoned_cr7e_coupled'),{pool}=require('./untoned_v52_stream_pool');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const prefix=fair.prefix('restored21'),file=prefix+'.json';let report=fs.existsSync(file)?read(file):null;
 if(!report||(!report.completed&&!report.continuation)){
  const p=spawnSync(process.execPath,['--max-old-space-size=4096',path.join(ROOT,'tools/search_untoned_cr7e_u7e_fair_restored.js')],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(p.status,0);report=read(file);}
 for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(hash(p),h,p);
 if(report.continuation?.completed){console.log(JSON.stringify({completed:true,phase:'restored21',newStates:Object.keys(report.states).length,closure:report.closure}));return;}
 report.sourceHashes[__filename]=hash(__filename);
 report.continuation??={sourceHashes:{[__filename]:hash(__filename)},reason:'Continue open restored paths; cached historical rings do not consume the additional four fresh-ring budget.',maxAdditionalFreshRings:4,stages:[],completed:false};
 report.completed=false;const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(file+'.tmp',file);};save();
 const {prior,known}=fair.buildInputs('restored21'),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 for(const row of Object.values(report.states))known.set(mappingKey(row),row);const byId=new Map([...known.values()].map(r=>[r.id,r])),native=await pool(path.join(far.WORK,'templates.json'),12);
 function candidates(center){const out=new Map();for(const n of search.neighbors(center)){const row={...center,...n,parent:center.id};if(legal(search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput)))out.set(mappingKey(row),row);}return out;}
 async function ring(center,name,proposals=candidates(center)){
  const cached=report.stages.find(s=>s.name===name&&s.center===center.id);if(cached)return cached;
  const before=Object.keys(report.states).length;await Promise.all([...proposals].filter(([key])=>!known.has(key)).map(async([key,row])=>{
   const entry=search.rebuild({...template,...row},prior.auditInput),audit=search.audit(entry,prior.auditInput);assert.ok(legal(audit));
   const id='UEF-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id}),result={id,family:'U7E',phase:'restored21',initialMap:row.initialMap,finalMap:row.finalMap,parent:center.id,mutation:'continued path: '+row.mutation,audit,score:s.score,doubledScore:s.doubledScore};
   known.set(key,result);byId.set(id,result);report.states[id]=result;if(Object.keys(report.states).length%100===0){save();console.log(JSON.stringify({phase:'restored21-continuation',states:Object.keys(report.states).length}));}
  }));
  const values=[...proposals.keys()].map(k=>known.get(k)),stage={name,center:center.id,legalUnique:proposals.size,newExactStates:Object.keys(report.states).length-before,
   best1x:[...values].sort((a,b)=>a.score-b.score)[0],best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore)[0]};
  report.stages.push(stage);report.continuation.stages.push({name,center:center.id,newExactStates:stage.newExactStates});save();
  console.log(JSON.stringify({continuedCenter:center.id,newExact:stage.newExactStates,one:stage.best1x.score,two:stage.best2x.doubledScore}));return stage;
 }
 try{
  for(let pass=0;pass<16;pass++){let changed=false;
   for(const trajectory of report.restoredPaths){if(trajectory.closed)continue;const center=byId.get(trajectory.currentId);assert.ok(center);
    let stage=report.stages.find(s=>s.name==='complete final local ring'&&s.center===center.id);
    if(!stage){const proposals=candidates(center),fresh=[...proposals.keys()].some(k=>!known.has(k)),charged=report.continuation.stages.filter(s=>s.name==='complete final local ring'&&s.newExactStates>0).length;
     if(fresh&&charged>=4)continue;stage=await ring(center,'complete final local ring',proposals);}
    const best=trajectory.axis==='score'?stage.best1x:stage.best2x,improves=best[trajectory.axis]<center[trajectory.axis]-1e-12;
    trajectory.steps.push({from:center.id,to:best.id,improves});if(improves)trajectory.currentId=best.id;else trajectory.closed=true;changed=true;save();
   }if(!changed)break;
  }
  const all21=()=>[...known.values()].filter(r=>r.audit?.actual?.[1]===21);for(const axis of ['score','doubledScore'])await ring(all21().sort((a,b)=>a[axis]-b[axis])[0],'complete final global leader ring');
  const values=all21();report.lanes=[{forbiddenFinalKey:null,count:values.length,best1x:[...values].sort((a,b)=>a.score-b.score).slice(0,2),best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,2)}];
  report.closure=['score','doubledScore'].map(axis=>{const leader=[...values].sort((a,b)=>a[axis]-b[axis])[0];return{forbiddenFinalKey:null,axis,leader:leader.id,score:leader[axis],fixedPolicyOneStepClosed:report.stages.some(s=>s.name.includes('ring')&&s.center===leader.id)};});
  report.continuation.completed=true;report.completed=true;save();console.log(JSON.stringify({completed:true,newStates:Object.keys(report.states).length,closure:report.closure,paths:report.restoredPaths.map(p=>({lane:p.forbiddenFinalKey,axis:p.axis,kind:p.kind,current:p.currentId,closed:p.closed}))}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
