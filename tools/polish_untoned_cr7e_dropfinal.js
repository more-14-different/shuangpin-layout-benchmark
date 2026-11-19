'use strict';
// Preserve the original evacuation/annealing experiment, then descend its new leaders.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const drop=require('./search_untoned_cr7e_dropfinal'),search=require('./search_untoned_cr7e_v52'),{mappingKey}=require('./search_untoned_cr7e_coupled');
const {pool}=require('./untoned_v52_stream_pool'),far=require('./anneal_untoned_cr7e_far');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const report=read(drop.PREFIX+'.json'),prior=read(drop.PRIOR),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(hash(p),h,p);
 const save=()=>{fs.writeFileSync(drop.PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(drop.PREFIX+'.json.tmp',drop.PREFIX+'.json');};
 if(!report.polish){assert.ok(report.completed);report.polish={sourceHashes:{[__filename]:hash(__filename)},startStates:Object.keys(report.states).length,maxAdditionalRings:8,stages:[],completed:false};}
 for(const[p,h]of Object.entries(report.polish.sourceHashes))assert.equal(hash(p),h,p);
 report.completed=false;save();const known=new Map(Object.values(report.states).map(r=>[mappingKey(r),r])),inspect=drop.screening(prior.auditInput),native=await pool(path.join(far.WORK,'templates.json'),12);
 try{
  for(let round=report.polish.stages.length;round<8;round++){
   const centers=[];
   for(const forbidden of ['Z','Q']){const rows=Object.values(report.states).filter(r=>r.forbiddenFinalKey===forbidden);
    const closed=new Set(report.stages.filter(s=>s.name==='complete final local ring'&&s.forbiddenFinalKey===forbidden).map(s=>s.center));
    for(const axis of ['score','doubledScore']){const row=[...rows].sort((a,b)=>a[axis]-b[axis])[0];if(!closed.has(row.id)&&!centers.some(c=>c.id===row.id))centers.push(row);}}
   if(!centers.length)break;const center=centers[0],candidates=new Map();
   for(const n of search.neighbors(center)){const row={...center,...n,parent:center.id};if(inspect(row,center.forbiddenFinalKey))candidates.set(mappingKey(row),row);}
   const before=known.size;await Promise.all([...candidates].filter(([k])=>!known.has(k)).map(async([key,row])=>{
    const entry=search.rebuild({...template,...row},prior.auditInput),a=drop.audit(entry,prior.auditInput,center.forbiddenFinalKey);assert.ok(drop.legal(a));
    const id='U7D-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id});
    const result={id,family:center.family,forbiddenFinalKey:center.forbiddenFinalKey,initialMap:center.initialMap,finalMap:row.finalMap,audit:a,score:s.score,doubledScore:s.doubledScore,parent:center.id,mutation:'leader descent: '+row.mutation};
    report.states[id]=result;known.set(key,result);if(known.size%100===0){save();console.log(JSON.stringify({states:known.size,polishRound:round}));}
   }));
   const values=[...candidates.keys()].map(k=>known.get(k)),stage={name:'complete final local ring',center:center.id,family:center.family,forbiddenFinalKey:center.forbiddenFinalKey,
    legalUnique:candidates.size,newExactStates:known.size-before,best1x:[...values].sort((a,b)=>a.score-b.score)[0],best2x:[...values].sort((a,b)=>a.doubledScore-b.doubledScore)[0]};
   report.stages.push(stage);report.polish.stages.push({round,center:center.id,forbiddenFinalKey:center.forbiddenFinalKey,newExactStates:known.size-before});save();
   console.log(JSON.stringify({round,center:center.id,exclude:center.forbiddenFinalKey,new:known.size-before,one:stage.best1x.score,two:stage.best2x.doubledScore}));
  }
  const values=Object.values(report.states);report.bestDefault=[...values].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.lanes=[];for(const family of ['U7E','U7X'])for(const forbiddenFinalKey of ['Z','Q']){const rows=values.filter(r=>r.family===family&&r.forbiddenFinalKey===forbiddenFinalKey);
   report.lanes.push({family,forbiddenFinalKey,count:rows.length,best1x:[...rows].sort((a,b)=>a.score-b.score)[0],best2x:[...rows].sort((a,b)=>a.doubledScore-b.doubledScore)[0]});}
  report.polish.closure=[];for(const forbiddenFinalKey of ['Z','Q']){const rows=values.filter(r=>r.forbiddenFinalKey===forbiddenFinalKey),closed=new Set(report.stages.filter(s=>s.name==='complete final local ring'&&s.forbiddenFinalKey===forbiddenFinalKey).map(s=>s.center));
   for(const axis of ['score','doubledScore']){const leader=[...rows].sort((a,b)=>a[axis]-b[axis])[0];report.polish.closure.push({forbiddenFinalKey,axis,leader:leader.id,score:leader[axis],fixedPolicyOneStepClosed:closed.has(leader.id)});}}
  report.polish.completed=true;report.completed=true;save();console.log(JSON.stringify({completed:true,states:known.size,closure:report.polish.closure}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
