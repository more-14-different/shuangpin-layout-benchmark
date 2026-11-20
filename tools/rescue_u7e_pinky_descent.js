'use strict';
// An infeasible fast center may have feasible neighbors; do not prune its whole ring.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {PREFIX,WORK,BASE,rightLoads}=require('./explore_u7e_pinky_descent'),search=require('./search_untoned_cr7e_v52'),{pool}=require('./untoned_v52_stream_pool'),{HEADS,FINALS}=require('./ckt_v4_scheme_fixture'),{read,hash}=require('./u7e_pinky_descent_io');
const ROOT=path.resolve(__dirname,'..'),OUTPUT=PREFIX+'-rescue.json',MULT=[1,2,3,5],key=fm=>FINALS.map(f=>fm[f]).join('');
async function main(){
 const source=read(PREFIX+'.json');assert.ok(source.completed);for(const[p,h]of Object.entries(source.sourceHashes))assert.equal(hash(p),h,p);
 const baseline=read(BASE),seed=Object.values(source.states).find(r=>key(r.finalMap)===key(baseline.finalMap)),priorPath=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'),data=read(priorPath).auditInput,contract=read(path.join(WORK,'contract.json')),initialMap=source.initialMap;
 const meta=read(path.join(ROOT,'research/.cache/R11_integrated_replay/model_meta.json')),mass=read(path.join(ROOT,'research/.cache/R11_integrated_replay/r4_token_loads.json'));
 const sources={...source.sourceHashes,...Object.fromEntries([__filename,PREFIX+'.json',path.join(WORK,'contract.json'),path.join(ROOT,'tools/u7e_pinky_descent_io.js')].map(p=>[p,hash(p)]))};
 let report=fs.existsSync(OUTPUT)?read(OUTPUT):null;if(report){assert.deepEqual(report.sourceHashes,sources);if(report.completed){console.log('completed',report.statesCount);return;}}
 report??={completed:false,initialMap,reference:source.reference,policies:source.policies,contract:{...source.contract,search:'Complete ring around the fastest 1x center rejected by pinky cap, then one feasible new 1x leader ring if it improves the seed. Only final candidates must pass caps; infeasible centers are explicitly marked.'},sourceHashes:sources,states:{},stages:[]};
 const known=new Map([...Object.values(source.states),...Object.values(report.states)].map(r=>[key(r.finalMap),r])),pending=new Map(),native=await pool(path.join(WORK,'templates.json'),2);
 const save=()=>{fs.writeFileSync(OUTPUT+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(OUTPUT+'.tmp',OUTPUT);};
 async function evaluate(fm,parent,mutation){const k=key(fm);if(known.has(k))return known.get(k);if(pending.has(k))return pending.get(k);
  if(new Set(FINALS.map(f=>fm[f])).size!==21||FINALS.some(f=>!'BCDEFGHJKLMNPQRSTWXYZ'.includes(fm[f])||fm[f]===f.toUpperCase()))return null;
  const entry=search.rebuild({...baseline,finalMap:fm},data),audit=search.audit(entry,data);if(!audit.valid||audit.M!==41||audit.D!==2||audit.qz||audit.zq)return null;
  const mapped=[...meta.heads.map(h=>initialMap[h]),...meta.finals.map(f=>fm[f]),...'IVUAO'],peak20=Math.max(...meta.tracks.map(t=>mass[t].mass.reduce((s,v,i)=>s+(mapped[i]==='P'?v:0),0)/mass[t].mass.reduce((s,v)=>s+v,0)));if(peak20>source.contract.rightPinkyHistorical20Max+1e-12)return null;
  const job=(async()=>{const id='UPD-'+crypto.createHash('sha256').update(HEADS.map(h=>initialMap[h]).join('')+'|'+k).digest('hex').slice(0,12),s=await native.score({...entry,id}),right=rightLoads(fm,initialMap,s.modes,contract.tokenMass),scores=MULT.map(m=>search.normalize(s.modes,source.reference,m)),feasible=right.mixed<=source.contract.rightPinkyMixedMax+1e-12&&right.peak<=source.contract.rightPinkyPeak8Max+1e-12;
   const row={id,finalMap:fm,audit,scores,rightPinky:right,rightPinky20:peak20,feasible,parent,mutation,modes:s.modes};known.set(k,row);report.states[id]=row;if(Object.keys(report.states).length%250===0){save();console.log(JSON.stringify({rescueStates:Object.keys(report.states).length,best1:Math.min(...[...known.values()].filter(r=>r.feasible).map(r=>r.scores[0]))}));}return row;
  })();pending.set(k,job);try{return await job;}finally{pending.delete(k);}
 }
 async function ring(center,name){if(report.stages.some(s=>s.center===center.id))return;const start=Object.keys(report.states).length;await Promise.all(search.neighbors(center).map(n=>evaluate(n.finalMap,center.id,n.mutation)));report.stages.push({name,center:center.id,centerFeasible:center.feasible,newStates:Object.keys(report.states).length-start});save();console.log(JSON.stringify(report.stages.at(-1)));}
 try{
  const rejected=Object.values(source.states).filter(r=>!r.feasible&&r.scores[0]<seed.scores[0]).sort((a,b)=>a.scores[0]-b.scores[0]);assert.ok(rejected.length);await ring(rejected[0],'fast rejected center repair ring');
  const best=[...known.values()].filter(r=>r.feasible).sort((a,b)=>a.scores[0]-b.scores[0])[0];if(best.scores[0]<seed.scores[0]-1e-10&&!source.stages.some(s=>s.center===best.id))await ring(best,'repaired 1x leader ring');
  const feasible=[...known.values()].filter(r=>r.feasible);report.leaders=MULT.map((multiplier,i)=>({multiplier,rows:[...feasible].sort((a,b)=>a.scores[i]-b.scores[i]).slice(0,8).map(({modes,...r})=>r)}));report.statesCount=Object.keys(report.states).length;report.feasibleCount=Object.values(report.states).filter(r=>r.feasible).length;report.completed=true;save();console.log(JSON.stringify({completed:true,newStates:report.statesCount,leaders:report.leaders.map(r=>({multiplier:r.multiplier,id:r.rows[0].id,scores:r.rows[0].scores}))}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
