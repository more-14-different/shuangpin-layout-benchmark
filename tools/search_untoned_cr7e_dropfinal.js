'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const far=require('./anneal_untoned_cr7e_far'),search=require('./search_untoned_cr7e_v52'),blocks=require('./search_untoned_cr7e_blocks');
const {pool}=require('./untoned_v52_stream_pool'),{mappingKey}=require('./search_untoned_cr7e_coupled');
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-dropfinal-v52');
const PREVIOUS=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-multiblock-v52.json'),PRIOR=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json');
const KEYS='BCDEFGHJKLMNPQRSTWXYZ',read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function audit(entry,data,forbidden){
 const a=search.audit(entry,data);if(!a.actual)return a;
 const codes=data.base.map(([p])=>entry.codeList[p]);
 return {...a,valid:a.actual[0]===21&&a.actual[1]===20&&a.branches===0&&entry.initialMap.q==='Q'&&entry.initialMap.z==='Z'&&
  FINALS.every(f=>KEYS.includes(entry.finalMap[f])&&entry.finalMap[f]!==forbidden)&&codes.every(c=>/^[A-Z]{2}$/.test(c)&&[...c].every(k=>KEYS.includes(k)))};
}
const legal=a=>a.valid&&a.M<=42&&a.D<=2&&a.V<=5&&a.branches===0&&!a.qz&&!a.zq;
function screening(data){
 const tuples=data.base.map(([p])=>splitPinyin(data.pinyin[p])),activeH=[...new Set(tuples.map(([h])=>HEADS[h]==='YU'?'Y':HEADS[h]))],activeF=[...new Set(tuples.map(([,f])=>FINALS[f]))];
 return (row,forbidden)=>{
  const im=row.initialMap,fm=row.finalMap;if(im.q!=='Q'||im.z!=='Z'||im.Y!==im.YU||FINALS.some(f=>!KEYS.includes(fm[f])||fm[f]===forbidden))return false;
  const first=new Set(activeH.map(h=>im[h])),last=new Set(activeF.map(f=>fm[f]));if(first.size!==21||last.size!==20||[...first].some(k=>!KEYS.includes(k)))return false;
  const M=activeH.filter(h=>!['A','E','O'].includes(h)&&im[h]!==h.toUpperCase()).length+new Set(['A','E','O'].map(h=>im[h])).size+activeF.filter(f=>fm[f]!==f.toUpperCase()).length;
  const D=HEADS.slice(0,21).filter(h=>h.length===1&&im[h]!==h.toUpperCase()).length,V=[...'aeiou'].filter(f=>fm[f]!==f.toUpperCase()).length;
  return M<=42&&D<=2&&V<=5&&tuples.every(([h,f])=>!['QZ','ZQ'].includes(im[HEADS[h]]+fm[FINALS[f]]));
 };
}
function* evacuations(base,forbidden){const tokens=FINALS.filter(f=>base[f]===forbidden);yield* blocks.assignments(base,tokens,[...KEYS].filter(k=>k!==forbidden));}
function mutation(base,rng,forbidden,coarse=false){
 const pick=a=>a[Math.floor(far.random(rng)*a.length)],out={...base},keys=[...KEYS].filter(k=>k!==forbidden),count=coarse?2+Math.floor(far.random(rng)*3):1;
 for(let i=0;i<count;i++){
  const a=pick(FINALS),b=pick(FINALS),kind=pick(['swap','swap','group','move']);
  if(kind==='swap')[out[a],out[b]]=[out[b],out[a]];
  if(kind==='move')out[a]=pick(keys);
  if(kind==='group'){const ka=out[a],kb=out[b];for(const f of FINALS)if(out[f]===ka)out[f]=kb;else if(out[f]===kb)out[f]=ka;}
 }return out;
}
function schedule(step){return step<24?{phase:'coarse',temperature:.06*(.018/.06)**(step/23)}:{phase:'fine',temperature:.012*(.00015/.012)**((step-24)/71)};}
async function main(){
 const previous=read(PREVIOUS),prior=read(PRIOR),data=prior.auditInput,template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};assert.ok(previous.completed);
 const seeds=[{...previous.baseline.one,family:'U7E'},{...previous.baseline.two,family:'U7E'},{...previous.target,family:'U7X'}],families=Object.fromEntries(seeds.map(r=>[r.family,r.initialMap]));
 const sources=[__filename,PREVIOUS,PRIOR,path.join(ROOT,'tools/search_untoned_cr7e_v52.js'),path.join(ROOT,'tools/anneal_untoned_cr7e_far.js'),
  path.join(ROOT,'tools/search_untoned_cr7e_blocks.js'),path.join(ROOT,'tools/search_untoned_cr7e_coupled.js'),path.join(ROOT,'tools/ckt_v4_scheme_fixture.js'),path.join(ROOT,'tools/untoned_v52_stream_pool.js'),
  path.join(far.WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),
  path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe')];
 const sourceHashes=Object.fromEntries(sources.map(p=>[p,hash(p)]));let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-dropfinal-v52-1',sourceHashes,families,policy:previous.policy,reference:previous.reference,target:previous.target,
  seeds,contract:{scoringCanvas:[21,21],activePhysicalKeys:[21,20],activeCapacity:420,previousActiveCapacity:441,excludedFinalKeys:['Z','Q'],
   initialQZRetained:true,M:42,D:2,V:5,branches:0,qzEmpty:true,zqEmpty:true,toneKeysByTone:'IVUAO',shapeKeysByMeaning:'AVUIO',costMultipliers:[1,2],
   search:'Complete direct evacuation assignments from three seeds; eight surrogate-free exact-score annealing chains, 96 fresh proposals each; up to two complete local rings per excluded key. Fixed initials per family, finite heuristic.',
   scoringAdapter:'capacity [21,21] selects the unchanged traditional word3 candidate pools; actual physical final-key count is separately audited as 20. Freed Q/Z is not an auxiliary key.'},states:{},stages:[],chains:[],trajectory:[],completed:false};
 const inspect=screening(data),known=new Map(Object.values(report.states).map(r=>[mappingKey(r),r])),byId=new Map(Object.values(report.states).map(r=>[r.id,r])),pending=new Map();
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 const native=await pool(path.join(far.WORK,'templates.json'),12);
 async function evaluate(row){
  const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);assert.ok(inspect(row,row.forbiddenFinalKey));
  const entry=search.rebuild({...template,...row},data),a=audit(entry,data,row.forbiddenFinalKey);assert.ok(legal(a),'fast/canonical audit mismatch');
  const job=(async()=>{const id='U7D-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id});
   const result={id,family:row.family,forbiddenFinalKey:row.forbiddenFinalKey,initialMap:row.initialMap,finalMap:row.finalMap,audit:a,score:s.score,doubledScore:s.doubledScore,parent:row.parent,mutation:row.mutation};
   known.set(key,result);byId.set(id,result);report.states[id]=result;
   if(known.size%100===0){save();console.log(JSON.stringify({states:known.size,best:Math.min(...[...known.values()].map(r=>r.score)),best2:Math.min(...[...known.values()].map(r=>r.doubledScore))}));}return result;})();
  pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 try{
  for(const seed of seeds.slice(0,2)){const s=await native.score(seed);assert.ok(Math.abs(s.score-seed.score)<1e-9&&Math.abs(s.doubledScore-seed.doubledScore)<1e-9);}
  for(const forbiddenFinalKey of ['Z','Q'])for(const seed of seeds){
   if(report.stages.some(s=>s.name==='complete direct evacuation'&&s.center===seed.id&&s.forbiddenFinalKey===forbiddenFinalKey))continue;
   const rows=[];let total=0;for(const finalMap of evacuations(seed.finalMap,forbiddenFinalKey)){total++;const row={family:seed.family,forbiddenFinalKey,initialMap:seed.initialMap,finalMap,parent:seed.id,mutation:'complete direct evacuation'};if(inspect(row,forbiddenFinalKey))rows.push(row);}
   const before=known.size,results=await Promise.all(rows.map(evaluate));assert.ok(results.length);
   report.stages.push({name:'complete direct evacuation',center:seed.id,family:seed.family,forbiddenFinalKey,total,legal:rows.length,newExactStates:known.size-before,
    best1x:[...results].sort((a,b)=>a.score-b.score)[0],best2x:[...results].sort((a,b)=>a.doubledScore-b.doubledScore)[0]});save();console.log(JSON.stringify(report.stages.at(-1)));
  }
  if(!report.chains.length){let i=0;for(const family of ['U7E','U7X'])for(const forbiddenFinalKey of ['Z','Q'])for(const objective of ['score','doubledScore']){
   const seed=[...known.values()].filter(r=>r.family===family&&r.forbiddenFinalKey===forbiddenFinalKey).sort((a,b)=>a[objective]-b[objective])[0];
   report.chains.push({index:i,seedId:seed.id,currentId:seed.id,bestId:seed.id,family,forbiddenFinalKey,objective,rng:(20261123+(++i)*104729)>>>0,newScores:0,transitions:0,accepted:0});}save();}
  async function run(chain){
   while(chain.newScores<96){const current=byId.get(chain.currentId),s=schedule(chain.newScores);let fm;
    for(let i=0;i<20000;i++){const candidate=mutation(current.finalMap,chain,chain.forbiddenFinalKey,s.phase==='coarse');if(FINALS.every(f=>candidate[f]===current.finalMap[f])||!inspect({...current,finalMap:candidate},chain.forbiddenFinalKey))continue;fm=candidate;break;}assert.ok(fm);
    const key=mappingKey({...current,finalMap:fm}),isNew=!known.has(key)&&!pending.has(key),row=await evaluate({...current,finalMap:fm,parent:current.id,mutation:s.phase+' forbidden-final annealing'}),delta=row[chain.objective]-current[chain.objective];
    const accepted=delta<=0||far.random(chain)<Math.exp(-delta/s.temperature);if(accepted){chain.currentId=row.id;chain.accepted++;}if(row[chain.objective]<byId.get(chain.bestId)[chain.objective])chain.bestId=row.id;
    report.trajectory.push({chain:chain.index,step:chain.newScores,from:current.id,to:row.id,accepted,newScore:isNew,...s,rngAfter:chain.rng});if(isNew)chain.newScores++;chain.transitions++;
    assert.ok(chain.transitions<20000,'cached transition exhaustion');if(chain.newScores%24===0)save();
   }
  }
  await Promise.all(report.chains.map(run));
  for(const forbiddenFinalKey of ['Z','Q']){
   const closed=new Set(report.stages.filter(s=>s.name==='complete final local ring'&&s.forbiddenFinalKey===forbiddenFinalKey).map(s=>s.center));
   for(let i=closed.size;i<2;i++){
    const rows=[...known.values()].filter(r=>r.forbiddenFinalKey===forbiddenFinalKey),leaders=[...[...rows].sort((a,b)=>a.score-b.score).slice(0,1),...[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,1)],center=leaders.find(r=>!closed.has(r.id));if(!center)break;
    const candidates=new Map();for(const row of search.neighbors(center)){const r={...center,...row,parent:center.id};if(inspect(r,forbiddenFinalKey))candidates.set(mappingKey(r),r);}
    const before=known.size,results=await Promise.all([...candidates.values()].map(evaluate));
    report.stages.push({name:'complete final local ring',center:center.id,family:center.family,forbiddenFinalKey,legalUnique:candidates.size,newExactStates:known.size-before,
     best1x:[...results].sort((a,b)=>a.score-b.score)[0],best2x:[...results].sort((a,b)=>a.doubledScore-b.doubledScore)[0]});closed.add(center.id);save();console.log(JSON.stringify({stage:'local ring',forbiddenFinalKey,center:center.id,candidates:candidates.size,newStates:known.size-before}));
   }
  }
  const rows=[...known.values()];report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.lanes=[];for(const family of ['U7E','U7X'])for(const forbiddenFinalKey of ['Z','Q']){const rs=rows.filter(r=>r.family===family&&r.forbiddenFinalKey===forbiddenFinalKey);report.lanes.push({family,forbiddenFinalKey,count:rs.length,best1x:[...rs].sort((a,b)=>a.score-b.score)[0],best2x:[...rs].sort((a,b)=>a.doubledScore-b.doubledScore)[0]});}
  report.completed=true;save();console.log(JSON.stringify({completed:true,states:known.size,lanes:report.lanes.map(r=>({family:r.family,exclude:r.forbiddenFinalKey,count:r.count,one:r.best1x.score,two:r.best2x.doubledScore}))}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={PREFIX,PREVIOUS,PRIOR,KEYS,audit,legal,screening,evacuations,mutation,schedule};
