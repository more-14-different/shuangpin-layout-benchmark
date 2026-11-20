'use strict';
// A small explicit factorial experiment separates the observed linked effects.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {PREFIX,WORK,BASE,rightLoads}=require('./explore_u7e_pinky_descent'),search=require('./search_untoned_cr7e_v52'),{pool}=require('./untoned_v52_stream_pool'),{HEADS,FINALS}=require('./ckt_v4_scheme_fixture'),{read,hash}=require('./u7e_pinky_descent_io');
const ROOT=path.resolve(__dirname,'..'),OUTPUT=PREFIX+'-composed.json',MULT=[1,2,3,5];
async function main(){
 const source=read(PREFIX+'.json');assert.ok(source.completed);for(const[p,h]of Object.entries(source.sourceHashes))assert.equal(hash(p),h,p);
 const baseline=read(BASE),priorPath=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'),data=read(priorPath).auditInput,contract=read(path.join(WORK,'contract.json')),initialMap=baseline.initialMap;
 const meta=read(path.join(ROOT,'research/.cache/R11_integrated_replay/model_meta.json')),mass=read(path.join(ROOT,'research/.cache/R11_integrated_replay/r4_token_loads.json'));
 const sources={...source.sourceHashes,...Object.fromEntries([__filename,PREFIX+'.json',path.join(WORK,'contract.json'),path.join(ROOT,'tools/u7e_pinky_descent_io.js')].map(p=>[p,hash(p)]))};
 if(fs.existsSync(OUTPUT)){const previous=read(OUTPUT);assert.deepEqual(previous.sourceHashes,sources);assert.ok(previous.completed);console.log('completed',previous.statesCount);return;}
 const report={completed:false,initialMap,reference:source.reference,policies:source.policies,contract:{...source.contract,search:'24 explicit combinations: ua/uang unloading fixed, o to M fixed; optional ui/un swap, optional R/T whole-group swap, ve at K/H/M. Each independently scored; not a local closure.'},sourceHashes:sources,states:{},stages:[]};
 const native=await pool(path.join(WORK,'templates.json'),2);
 try{
  const proposals=[];for(const uiUn of [false,true])for(const rtGroups of [false,true])for(const ve of ['K','H','M'])for(const oMove of ['single','wholeGroup']){
   const fm={...baseline.finalMap};if(oMove==='single')fm.o='M';else for(const[f,k]of Object.entries(fm))if(k==='J')fm[f]='M';else if(k==='M')fm[f]='J';
   [fm.ua,fm.uang]=[fm.uang,fm.ua];if(uiUn)[fm.ui,fm.un]=[fm.un,fm.ui];if(rtGroups)for(const[f,k]of Object.entries(fm))if(k==='R')fm[f]='T';else if(k==='T')fm[f]='R';fm.ve=ve;
   proposals.push({fm,factors:{uiUn,rtGroups,ve,oMove}});
  }
  await Promise.all(proposals.map(async({fm,factors})=>{
   const id='UPD-'+crypto.createHash('sha256').update(HEADS.map(h=>initialMap[h]).join('')+'|'+FINALS.map(f=>fm[f]).join('')).digest('hex').slice(0,12),entry=search.rebuild({...baseline,id,finalMap:fm},data),audit=search.audit(entry,data);assert.ok(audit.valid&&audit.M===41&&audit.D===2&&!audit.qz&&!audit.zq);
   const mapped=[...meta.heads.map(h=>initialMap[h]),...meta.finals.map(f=>fm[f]),...'IVUAO'],peak20=Math.max(...meta.tracks.map(t=>mass[t].mass.reduce((s,v,i)=>s+(mapped[i]==='P'?v:0),0)/mass[t].mass.reduce((s,v)=>s+v,0))),s=await native.score(entry),right=rightLoads(fm,initialMap,s.modes,contract.tokenMass),scores=MULT.map(m=>search.normalize(s.modes,source.reference,m)),feasible=right.mixed<=source.contract.rightPinkyMixedMax+1e-12&&right.peak<=source.contract.rightPinkyPeak8Max+1e-12&&peak20<=source.contract.rightPinkyHistorical20Max+1e-12;
   report.states[id]={id,finalMap:fm,audit,scores,rightPinky:right,rightPinky20:peak20,feasible,parent:baseline.id,mutation:'explicit factor composition',factors,modes:s.modes};
  }));
  const feasible=Object.values(report.states).filter(r=>r.feasible);report.statesCount=Object.keys(report.states).length;assert.equal(report.statesCount,24);report.feasibleCount=feasible.length;report.completed=true;report.stages.push({name:'explicit factorial combinations',proposals:24});
  report.leaders=MULT.map((multiplier,i)=>({multiplier,rows:[...feasible].sort((a,b)=>a.scores[i]-b.scores[i]).slice(0,4).map(({modes,...r})=>r)}));fs.writeFileSync(OUTPUT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({completed:true,states:24,leaders:report.leaders.map(r=>({multiplier:r.multiplier,id:r.rows[0].id,scores:r.rows[0].scores}))}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
