'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const search=require('./search_untoned_cr7e_v52'),{pool}=require('./untoned_v52_stream_pool');
const {screening,mappingKey,legal}=require('./search_untoned_cr7e_coupled');
const {HEADS,FINALS,ALPHABET,splitPinyin}=require('./ckt_v4_scheme_fixture');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-far-v52');
const WORK=path.join(ROOT,'research/.cache/untoned-cr7e-far-v52-20261120');
const PRIOR=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json');
const COUPLED=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-coupled-v52-verification.json');
const POLICY={keytao:{word2:'12',word3:'231',word4:'24'},sanpin:{word2:'12',word3:'213',word4:'23'}};
const KEYS='BCDEFGHJKLMNPQRSTWXYZ';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function random(chain){let x=chain.rng>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;chain.rng=x>>>0;return chain.rng/4294967296;}
const pick=(chain,a)=>a[Math.floor(random(chain)*a.length)];
function mutation(map,chain,coarse){
 const out={...map},a=pick(chain,FINALS),b=pick(chain,FINALS),kind=pick(chain,coarse?['swap','move','group','cycle','cycle','move']:['swap','swap','move','group']);
 if(kind==='move')out[a]=pick(chain,KEYS);
 if(kind==='swap')[out[a],out[b]]=[out[b],out[a]];
 if(kind==='group'){const ka=out[a],kb=out[b];for(const f of FINALS)if(out[f]===ka)out[f]=kb;else if(out[f]===kb)out[f]=ka;}
 if(kind==='cycle'){const c=pick(chain,FINALS);if(new Set([a,b,c]).size===3)[out[a],out[b],out[c]]=[out[c],out[a],out[b]];}
 return out;
}
function perturb(map,chain,count){let out=map;for(let i=0;i<count;i++)out=mutation(out,chain,true);return out;}
function schedule(step){const at=step%150;return at<50?{phase:'coarse',temperature:.16*(.04/.16)**(at/49)}:{phase:'fine',temperature:.022*(.00025/.022)**((at-50)/99)};}
function compile(rows,ctx,e){
 const pools=new Map(),priority=[...rows].sort((a,b)=>b.weight-a.weight||(a.id<b.id?-1:a.id>b.id?1:0)),ties=new Map(priority.map((r,i)=>[r.id,i]));
 const syllable=p=>{const[h,f]=splitPinyin(ctx.data.pinyin[p]);return h===255||f===255?[...e.codeList[p]].map(k=>62+ALPHABET.indexOf(k)):[h,27+f];};
 const layout=[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])];
 return rows.map(row=>{const i=Number(row.id.slice(row.id.lastIndexOf(':')+1)),pairs=row.kind==='character'?null:ctx.words[row.kind][i].py.map(syllable);
  const prefix=row.kind==='character'?syllable(i):row.kind==='word2'?pairs.flat():pairs.map(p=>p[0]);
  const stages=row.stages.map(s=>{if(!pools.has(s.pool))pools.set(s.pool,pools.size);assert.ok(s.length<=4||s.codes.length===1);
   const codes=s.codes.map(code=>{const n=Math.min(prefix.length,s.length),tokens=[...prefix.slice(0,n),...[...code.slice(n)].map(k=>62+ALPHABET.indexOf(k))];assert.equal(tokens.map(t=>t<62?layout[t]:ALPHABET[t-62]).join(''),code);return tokens;});
   return [s.order,s.pool.startsWith('char:')?0:s.pool.startsWith('word3:')?2:1,codes];});
  return [ties.get(row.id),['character','word2','word3','word4'].indexOf(row.kind),row.weight,row.baseLength,stages];
 });
}
async function prepare(){
 fs.mkdirSync(WORK,{recursive:true});const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
 const old=read(PRIOR),e=data.entries.find(r=>r.id==='OC21-e1f155973380'),modes=[];
 for(const mode of ['keytao','sanpin']){const rows=[...scorer.buildRows(e,data,ctx.strokes,{word2:[],word3:[],word4:[]},mode),
  ...Object.entries(POLICY[mode]).flatMap(([kind,order])=>kind==='word3'?ctx.buildExtendedWord3Rows(e,data,ctx.words,mode,e.tone,order):ctx.buildRowsForOrder(e,data,ctx.words,mode,e.tone,kind,order,model))];
  modes.push(compile(rows,ctx,e));console.log('compiled',mode,rows.length);}
 const reference=old.reference;
 fs.writeFileSync(path.join(WORK,'templates.json'),JSON.stringify({version:'untoned-v52-2121-templates-1',keyAlphabet:ALPHABET,toneKeysByTone:'IVUAO',
  references:Object.values(reference).map(m=>['character','word2','word3','word4'].map(k=>m[k].effectiveMs)),referencesDoubled:Object.values(reference).map(m=>['character','word2','word3','word4'].map(k=>2*m[k].effectiveMs-m[k].motorUpperMs)),modes}));
}
async function main(){
 if(process.argv.includes('--prepare'))return prepare();
 const prior=read(PRIOR),coupled=read(COUPLED),data=prior.auditInput,template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const centers=['U7E-1f46d74c337f','U7E-3b1557bb9247'].map(id=>prior.results.find(r=>r.id===id)),initialMap=centers[0].initialMap;
 assert.deepEqual(initialMap,centers[1].initialMap);
 const sourceFiles=[__filename,PRIOR,COUPLED,path.join(ROOT,'tools/untoned_v52_stream_pool.js'),path.join(ROOT,'tools/search_untoned_cr7e_v52.js'),
  path.join(ROOT,'tools/search_untoned_cr7e_coupled.js'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),path.join(WORK,'templates.json'),
  path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')];
 const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,hash(p)])),inspect=screening(data,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 report??={version:'untoned-cr7e-far-v52-1',sourceHashes,initialMap,policy:POLICY,reference:prior.reference,
  target:read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-coupled-v52-policy-U7X-02d505540da0.json')),
  contract:{capacity:[21,21],M:42,D:2,V:5,branches:0,qzEmpty:true,zqEmpty:true,initialsFixed:true,
   search:'8 chains × 750 new exact states; 150-step alternating coarse/fine cycles, 8-12-mutation far shakes; final complete leader ring and improving-pair/triple refinements; finite heuristic',costMultipliers:[1,2]},
  states:{},chains:[],trajectory:[],stages:[],completed:false};
 const known=new Map(Object.values(report.states).map(r=>[mappingKey(r),r])),pending=new Map();
 const native=await pool(path.join(WORK,'templates.json'),6);
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 async function evaluate(finalMap,parent,mutation){
  const row={initialMap,finalMap},key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);if(!inspect(row))return null;
  const e=search.rebuild({...template,...row},data),audit=search.audit(e,data);assert.ok(legal(audit));
  const job=(async()=>{const id='U7F-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...e,id});
   const result={id,initialMap,finalMap,audit,score:s.score,doubledScore:s.doubledScore,parent,mutation};known.set(key,result);report.states[id]=result;
   if(known.size%100===0){save();console.log(JSON.stringify({states:known.size,best:Math.min(...[...known.values()].map(r=>r.score)),best2:Math.min(...[...known.values()].map(r=>r.doubledScore))}));}
   return result;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 try{
  for(const center of centers){const s=await native.score(center);assert.ok(Math.abs(s.score-center.optimal1x.score)<1e-9);assert.ok(Math.abs(s.doubledScore-center.optimal2x.score)<1e-9);}
  if(!report.chains.length){
   const seedRows=[...centers,...coupled.results.filter(r=>['U7X-02d505540da0','U7X-2deda2bfd8da'].includes(r.id)),
    ...coupled.results.filter(r=>['U7X-5bd93331a938','U7X-a3808c6b98af'].includes(r.id)),...centers];
   for(let i=0;i<8;i++){
    const chain={index:i,rng:(20261120+(i+1)*104729)>>>0,objective:i%2?'doubledScore':'score',newScores:0,transitions:0,accepted:0,farRestarts:[]};
    const seed=await evaluate(seedRows[i].finalMap,seedRows[i].id,'fixed-initial seed transplant');assert.ok(seed);
    let start=seed;
    if(i>=6){for(let attempt=0;attempt<1000;attempt++){const fm=perturb(seed.finalMap,chain,12);if(FINALS.filter(f=>fm[f]!==seed.finalMap[f]).length>=12&&inspect({initialMap,finalMap:fm})){start=await evaluate(fm,seed.id,'12-mutation distant start');break;}}}
    chain.seedId=seed.id;chain.currentId=start.id;chain.bestId=seed.id;chain.startDistance=FINALS.filter(f=>start.finalMap[f]!==seed.finalMap[f]).length;report.chains.push(chain);
   }save();
  }
  async function run(chain){
   while(chain.newScores<750){
    const step=chain.newScores,phase=schedule(step);
    if(step>0&&step%150===0&&chain.lastRestart!==step){
     const base=report.states[chain.bestId];for(let a=0;a<2000;a++){const fm=perturb(base.finalMap,chain,8+Math.floor(random(chain)*5));const distance=FINALS.filter(f=>fm[f]!==base.finalMap[f]).length;
      if(distance<10||!inspect({initialMap,finalMap:fm}))continue;const before=known.size,row=await evaluate(fm,base.id,'8–12-mutation far restart');
      chain.currentId=row.id;chain.farRestarts.push({at:step,id:row.id,distance,score:row.score,doubledScore:row.doubledScore,new:known.size>before});break;}
     chain.lastRestart=step;save();
    }
    const current=report.states[chain.currentId];let fm,description;
    for(let a=0;a<20000;a++){let m=phase.phase==='coarse'?perturb(current.finalMap,chain,2+Math.floor(random(chain)*3)):mutation(current.finalMap,chain,false);
     if(FINALS.every(f=>m[f]===current.finalMap[f])||!inspect({initialMap,finalMap:m}))continue;fm=m;description=phase.phase;break;}
    assert.ok(fm,'legal proposal exhausted');const key=mappingKey({initialMap,finalMap:fm}),isNew=!known.has(key)&&!pending.has(key);
    const row=await evaluate(fm,current.id,description+' final perturbation');chain.transitions++;
    const delta=row[chain.objective]-current[chain.objective],accepted=delta<=0||random(chain)<Math.exp(-delta/phase.temperature);
    if(accepted){chain.currentId=row.id;chain.accepted++;}if(row[chain.objective]<report.states[chain.bestId][chain.objective])chain.bestId=row.id;
    report.trajectory.push({chain:chain.index,step,from:current.id,to:row.id,accepted,newScore:isNew,phase:phase.phase,temperature:phase.temperature,rngAfter:chain.rng});
    if(isNew)chain.newScores++;assert.ok(chain.transitions<30000,'cached-transition exhaustion');if(chain.newScores%50===0)save();
   }
  }
  // Six chains at a time share six score streams; remaining starts run afterward.
  await Promise.all(Array.from({length:6},async(_,i)=>{for(let j=i;j<8;j+=6)await run(report.chains[j]);}));
  const closed=new Set(report.stages.filter(s=>s.name==='complete final leader ring').map(s=>s.center));
  for(let n=closed.size;n<2;n++){
   const rows=[...known.values()],leaders=[...rows].sort((a,b)=>a.score-b.score).slice(0,1).concat([...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,1));
   const center=leaders.find(r=>!closed.has(r.id));if(!center)break;
   const variants=search.neighbors(center),start=known.size;await Promise.all(variants.map(r=>evaluate(r.finalMap,center.id,r.mutation)));
   report.stages.push({name:'complete final leader ring',center:center.id,newStates:known.size-start});closed.add(center.id);save();
  }
  const rows=[...known.values()];report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,12);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,12);
  report.completed=true;save();console.log(JSON.stringify({completed:true,states:known.size,chains:report.chains.map(c=>({index:c.index,newScores:c.newScores,accepted:c.accepted,restarts:c.farRestarts.length})),best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={random,mutation,perturb,schedule,POLICY,PREFIX,WORK,compile};
