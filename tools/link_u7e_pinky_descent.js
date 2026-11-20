'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {PREFIX,WORK,BASE,rightLoads}=require('./explore_u7e_pinky_descent'),search=require('./search_untoned_cr7e_v52'),{pool}=require('./untoned_v52_stream_pool'),{HEADS,FINALS}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),OUTPUT=PREFIX+'-linked.json',MULT=[1,2,3,5];
const {read,hash}=require('./u7e_pinky_descent_io'),key=fm=>FINALS.map(f=>fm[f]).join('');
async function main(){
 const source=read(PREFIX+'.json');assert.ok(source.completed);for(const[p,h]of Object.entries(source.sourceHashes))assert.equal(hash(p),h,p);
 const baseline=read(BASE),seed=Object.values(source.states).find(r=>key(r.finalMap)===key(baseline.finalMap)),priorPath=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'),prior=read(priorPath),data=prior.auditInput,contract=read(path.join(WORK,'contract.json')),initialMap=source.initialMap;
 const metaPath=path.join(ROOT,'research/.cache/R11_integrated_replay/model_meta.json'),massPath=path.join(ROOT,'research/.cache/R11_integrated_replay/r4_token_loads.json'),meta=read(metaPath),mass=read(massPath);
 function legal(fm){if(new Set(FINALS.map(f=>fm[f])).size!==21||FINALS.some(f=>!'BCDEFGHJKLMNPQRSTWXYZ'.includes(fm[f])||fm[f]===f.toUpperCase()))return null;
  const entry=search.rebuild({...baseline,finalMap:fm},data),a=search.audit(entry,data);if(!a.valid||a.qz||a.zq||a.M!==41||a.D!==2)return null;
  const mapped=[...meta.heads.map(h=>initialMap[h]),...meta.finals.map(f=>fm[f]),...'IVUAO'],peak=Math.max(...meta.tracks.map(t=>mass[t].mass.reduce((s,v,i)=>s+(mapped[i]==='P'?v:0),0)/mass[t].mass.reduce((s,v)=>s+v,0)));
  return peak<=source.contract.rightPinkyHistorical20Max+1e-12?{entry,audit:a,peak}:null;
 }
 const sources={...source.sourceHashes,...Object.fromEntries([__filename,PREFIX+'.json',path.join(WORK,'contract.json'),path.join(ROOT,'tools/u7e_pinky_descent_io.js')].map(p=>[p,hash(p)]))};
 let report=fs.existsSync(OUTPUT)?read(OUTPUT):null;if(report){assert.deepEqual(report.sourceHashes,sources);if(report.completed){console.log('completed',report.statesCount);return;}}
 report??={completed:false,initialMap,reference:source.reference,policies:source.policies,contract:{...source.contract,search:'Deterministic cross-product of up to twelve single-step speed gains with up to twelve P-unloading repairs; conflicts skipped. Then up to four complete leader rings. Prior scored states reused without recounting.'},sourceHashes:sources,states:{},stages:[],selection:{}};
 const known=new Map([...Object.values(source.states),...Object.values(report.states)].map(r=>[key(r.finalMap),r])),pending=new Map(),native=await pool(path.join(WORK,'templates.json'),4);
 const save=()=>{fs.writeFileSync(OUTPUT+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(OUTPUT+'.tmp',OUTPUT);};
 async function evaluate(fm,parent,mutation){const k=key(fm);if(known.has(k))return known.get(k);if(pending.has(k))return pending.get(k);const valid=legal(fm);if(!valid)return null;
  const job=(async()=>{const id='UPD-'+crypto.createHash('sha256').update(HEADS.map(h=>initialMap[h]).join('')+'|'+k).digest('hex').slice(0,12),s=await native.score({...valid.entry,id}),right=rightLoads(fm,initialMap,s.modes,contract.tokenMass),scores=MULT.map(m=>search.normalize(s.modes,source.reference,m)),feasible=right.mixed<=source.contract.rightPinkyMixedMax+1e-12&&right.peak<=source.contract.rightPinkyPeak8Max+1e-12;
   const row={id,finalMap:fm,audit:valid.audit,scores,rightPinky:right,rightPinky20:valid.peak,feasible,parent,mutation,modes:s.modes};known.set(k,row);report.states[id]=row;if(Object.keys(report.states).length%250===0){save();console.log(JSON.stringify({linkedStates:Object.keys(report.states).length,best:MULT.map((_,i)=>Math.min(...[...known.values()].filter(r=>r.feasible).map(r=>r.scores[i])))}));}return row;
  })();pending.set(k,job);try{return await job;}finally{pending.delete(k);}
 }
 const changed=r=>Object.fromEntries(Object.entries(r.finalMap).filter(([f,k])=>seed.finalMap[f]!==k));
 try{
  if(!report.stages.some(s=>s.name==='repair cross-product')){
   const oneStepKeys=new Set(search.neighbors(seed).map(r=>key(r.finalMap))),oneStep=Object.values(source.states).filter(r=>oneStepKeys.has(key(r.finalMap))),gains=oneStep.filter(r=>!r.feasible&&r.rightPinky.mixed<=seed.rightPinky.mixed+.00002&&r.rightPinky.peak<=seed.rightPinky.peak+.00002&&r.scores.some((v,i)=>v<seed.scores[i]));
   const repairs=oneStep.filter(r=>r.feasible&&r.rightPinky.mixed<seed.rightPinky.mixed-1e-5);
   const pick=rows=>[...new Map(MULT.flatMap((_,i)=>[...rows].sort((a,b)=>a.scores[i]-b.scores[i]).slice(0,3)).map(r=>[r.id,r])).values()];
   const selectedGains=pick(gains),selectedRepairs=pick(repairs);report.selection={gains:selectedGains.map(r=>r.id),repairs:selectedRepairs.map(r=>r.id)};
   const proposals=[];for(const a of selectedGains)for(const b of selectedRepairs){const ac=changed(a),bc=changed(b);if(Object.keys(ac).some(f=>f in bc&&ac[f]!==bc[f]))continue;proposals.push({finalMap:{...seed.finalMap,...ac,...bc},parent:[a.id,b.id],mutation:'speed gain plus P unloading repair'});}
   await Promise.all(proposals.map(p=>evaluate(p.finalMap,p.parent,p.mutation)));report.stages.push({name:'repair cross-product',proposals:proposals.length,newStates:Object.keys(report.states).length});save();console.log(JSON.stringify(report.stages.at(-1)));
  }
  for(let round=report.stages.filter(s=>s.name==='linked leader ring').length;round<4;round++){
   const feasible=[...known.values()].filter(r=>r.feasible),leaders=MULT.flatMap((_,i)=>[...feasible].sort((a,b)=>a.scores[i]-b.scores[i]).slice(0,2)),center=leaders.find(r=>!source.stages.some(s=>s.center===r.id)&&!report.stages.some(s=>s.center===r.id));if(!center)break;
   const start=Object.keys(report.states).length,variants=new Map(search.neighbors(center).filter(n=>legal(n.finalMap)).map(n=>[key(n.finalMap),n]));await Promise.all([...variants.values()].map(n=>evaluate(n.finalMap,center.id,n.mutation)));report.stages.push({name:'linked leader ring',center:center.id,legalUnique:variants.size,newStates:Object.keys(report.states).length-start});save();console.log(JSON.stringify(report.stages.at(-1)));
  }
  const feasible=[...known.values()].filter(r=>r.feasible);report.leaders=MULT.map((multiplier,i)=>({multiplier,rows:[...feasible].sort((a,b)=>a.scores[i]-b.scores[i]).slice(0,8).map(({modes,...r})=>r)}));report.statesCount=Object.keys(report.states).length;report.feasibleCount=Object.values(report.states).filter(r=>r.feasible).length;report.completed=true;save();console.log(JSON.stringify({completed:true,newStates:report.statesCount,leaders:report.leaders.map(r=>({multiplier:r.multiplier,id:r.rows[0].id,scores:r.rows[0].scores}))}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
