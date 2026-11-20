'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far'),{pool}=require('./untoned_v52_stream_pool');
const {HEADS,FINALS,ALPHABET,splitPinyin}=require('./ckt_v4_scheme_fixture');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-21-u7e-pinky-descent'),WORK=path.join(ROOT,'research/.cache/u7e-pinky-descent-20261121');
const BASE=path.join(ROOT,'research/notes/2026-11-21-u7e-low-pinky-score-UED-3158ce08b5bc.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),key=fm=>FINALS.map(f=>fm[f]).join('');
const KINDS=['character','word2','word3','word4'],MULT=[1,2,3,5],WEIGHTS=[1,3,1,1],KEYS='BCDEFGHJKLMNPQRSTWXYZ';
async function prepare(){
 fs.mkdirSync(WORK,{recursive:true});const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model');
 const baseline=read(BASE),html='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html',data=scorer.loadPayload(html),entry=search.rebuild({...data.entries.find(r=>r.id==='UED-18c004bd1f31'),...baseline,tone:'IVUAO'},data);
 const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'),ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),reference=v52.evaluateUntoned(data.entries.find(r=>r.id==='S005'),search.REF,null,ctx).v52;
 const modes=[];for(const mode of ['keytao','sanpin']){
  const rows=[...scorer.buildRows(entry,data,ctx.strokes,{word2:[],word3:[],word4:[]},mode),...Object.entries(baseline.policies[mode]).flatMap(([kind,order])=>kind==='word3'?ctx.buildExtendedWord3Rows(entry,data,ctx.words,mode,entry.tone,order):ctx.buildRowsForOrder(entry,data,ctx.words,mode,entry.tone,kind,order,model))];
  modes.push(far.compile(rows,ctx,entry));console.log('compiled',mode,rows.length);
 }
 const tokenMass=modes.map(rows=>KINDS.map((_,kind)=>{const mass=Array(62).fill(0);let total=0;
  for(const row of rows)if(row[1]===kind){const tokens=row[4][0][2][0];assert.equal(tokens.length,row[3]);total+=row[2];for(const token of tokens){assert.ok(token<62);mass[token]+=row[2];}
   for(const stage of row[4])for(const code of stage[2]){assert.deepEqual(code.slice(0,tokens.length),tokens);assert.ok(code.slice(tokens.length).every(t=>!'P'.includes(ALPHABET[t-62])));}}
  return mass.map(v=>v/total);
 }));
 const templates=path.join(WORK,'templates.json');fs.writeFileSync(templates,JSON.stringify({version:'untoned-v52-2121-templates-1',keyAlphabet:ALPHABET,toneKeysByTone:'IVUAO',references:Object.values(reference).map(m=>KINDS.map(k=>m[k].effectiveMs)),referencesDoubled:Object.values(reference).map(m=>KINDS.map(k=>2*m[k].effectiveMs-m[k].motorUpperMs)),modes}));
 fs.writeFileSync(path.join(WORK,'contract.json'),JSON.stringify({baseline:BASE,reference,policies:baseline.policies,tokenMass,sourceHashes:Object.fromEntries([__filename,BASE,html,profile,templates,...['anneal_untoned_cr7e_far.js','score_completion_ckt_v4.js','score_ckt_v52.js','ckt_v4_model.js','ckt_block_error.js'].map(f=>path.join(ROOT,'tools',f))].map(p=>[p,hash(p)]))},null,2)+'\n');
}
function rightLoads(fm,initialMap,modes,mass){const mapped=[...HEADS.map(h=>initialMap[h]),...FINALS.map(f=>fm[f])];let numerator=0,denominator=0,peak=0;const byTrack={};
 for(let m=0;m<2;m++)for(let k=0;k<4;k++){const n=mass[m][k].reduce((s,v,i)=>s+(mapped[i]==='P'?v:0),0),d=modes[['keytao','sanpin'][m]][KINDS[k]].meanKeys;
  numerator+=WEIGHTS[k]*n;denominator+=WEIGHTS[k]*d;const value=n/d;peak=Math.max(peak,value);byTrack[['keytao','sanpin'][m]+'/'+KINDS[k]]=value;}
 return {mixed:numerator/denominator,peak,byTrack};
}
async function explore(){
 const contract=read(path.join(WORK,'contract.json'));for(const[p,h]of Object.entries(contract.sourceHashes))assert.equal(hash(p),h,p);
 const baseline=read(BASE),priorPath=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'),prior=read(priorPath),data=prior.auditInput,initialMap=baseline.initialMap;
 const metaPath=path.join(ROOT,'research/.cache/R11_integrated_replay/model_meta.json'),massPath=path.join(ROOT,'research/.cache/R11_integrated_replay/r4_token_loads.json'),meta=read(metaPath),legacyMass=read(massPath);
 const initialLegacy=meta.heads.map(h=>initialMap[h]),tuples=data.base.map(([p])=>splitPinyin(data.pinyin[p]));
 function inspect(fm){if(new Set(FINALS.map(f=>fm[f])).size!==21||FINALS.some(f=>!KEYS.includes(fm[f])||fm[f]===f.toUpperCase()))return null;
  if(tuples.some(([h,f])=>(initialMap[HEADS[h]]==='Q'&&fm[FINALS[f]]==='Z')||(initialMap[HEADS[h]]==='Z'&&fm[FINALS[f]]==='Q')))return null;
  const mapped=[...initialLegacy,...meta.finals.map(f=>fm[f]),...'IVUAO'],peak=Math.max(...meta.tracks.map(t=>legacyMass[t].mass.reduce((s,v,i)=>s+(mapped[i]==='P'?v:0),0)/legacyMass[t].mass.reduce((s,v)=>s+v,0)));
  return peak<=baseline.legacyRightPinky.max20+1e-12?peak:null;
 }
 const sources={...contract.sourceHashes,...Object.fromEntries([priorPath,metaPath,massPath,path.join(ROOT,'tools/untoned_v52_stream_pool.js'),path.join(ROOT,'tools/search_untoned_cr7e_v52.js'),path.join(ROOT,'tools/ckt_v4_scheme_fixture.js'),path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe')].map(p=>[p,hash(p)]))};
 let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;
 if(report){assert.deepEqual(report.sourceHashes,sources);if(report.completed){console.log('completed',report.statesCount);return;}}
 report??={completed:false,initialMap,reference:contract.reference,policies:contract.policies,sourceHashes:sources,baselineId:baseline.id,
  contract:{M:41,D:2,V:5,actual:[21,21],qzEmpty:true,zqEmpty:true,fixedInitials:true,costMultipliers:MULT,rightPinkyMixedMax:baseline.ergonomics.rightPinky,rightPinkyPeak8Max:baseline.ergonomics.peaks.rightPinky.value,rightPinkyHistorical20Max:baseline.legacyRightPinky.max20,search:'All single final swaps/group exchanges/legal moves around seed; 8 chains x 250 transitions coarse/fine alternating; up to 6 leader rings. Exact CPU native scoring, fixed baseline robust policy; finalists independently reselect robust policy.'},states:{},stages:[],chains:[]};
 const known=new Map(Object.values(report.states).map(r=>[key(r.finalMap),r])),pending=new Map(),native=await pool(path.join(WORK,'templates.json'),4);
 const save=()=>{fs.writeFileSync(PREFIX+'.json.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(PREFIX+'.json.tmp',PREFIX+'.json');};
 async function evaluate(fm,parent,mutation){const k=key(fm);if(known.has(k))return known.get(k);if(pending.has(k))return pending.get(k);const legacy=inspect(fm);if(legacy===null)return null;
  const job=(async()=>{const id='UPD-'+crypto.createHash('sha256').update(HEADS.map(h=>initialMap[h]).join('')+'|'+k).digest('hex').slice(0,12),entry=search.rebuild({...baseline,id,finalMap:fm,tone:'IVUAO'},data),audit=search.audit(entry,data);assert.ok(audit.valid&&audit.M===41&&audit.D===2&&!audit.qz&&!audit.zq);
   const s=await native.score(entry),right=rightLoads(fm,initialMap,s.modes,contract.tokenMass),scores=MULT.map(m=>search.normalize(s.modes,contract.reference,m)),feasible=right.mixed<=report.contract.rightPinkyMixedMax+1e-12&&right.peak<=report.contract.rightPinkyPeak8Max+1e-12;
   const r={id,finalMap:fm,audit,scores,rightPinky:right,rightPinky20:legacy,feasible,parent,mutation,modes:s.modes};known.set(k,r);report.states[id]=r;if(known.size%250===0){save();console.log(JSON.stringify({states:known.size,feasible:[...known.values()].filter(r=>r.feasible).length,best:MULT.map((_,i)=>Math.min(...[...known.values()].filter(r=>r.feasible).map(r=>r.scores[i])))}));}return r;
  })();pending.set(k,job);try{return await job;}finally{pending.delete(k);}
 }
 async function ring(center,name){if(report.stages.some(s=>s.center===center.id))return;const start=known.size,variants=new Map(search.neighbors(center).filter(n=>inspect(n.finalMap)!==null).map(n=>[key(n.finalMap),n]));await Promise.all([...variants.values()].map(n=>evaluate(n.finalMap,center.id,n.mutation)));report.stages.push({center:center.id,name,legalUnique:variants.size,newStates:known.size-start});save();console.log(JSON.stringify(report.stages.at(-1)));}
 try{
  const seed=await evaluate(baseline.finalMap,baseline.id,'seed');for(let i=0;i<3;i++)assert.ok(Math.abs(seed.scores[i]-baseline.ckt[i])<1e-9);assert.ok(seed.feasible);assert.ok(Math.abs(seed.rightPinky.mixed-baseline.ergonomics.rightPinky)<1e-12);assert.ok(Math.abs(seed.rightPinky.peak-baseline.ergonomics.peaks.rightPinky.value)<1e-12);
  for(const mode of ['keytao','sanpin'])for(const kind of KINDS){assert.ok(Math.abs(seed.rightPinky.byTrack[mode+'/'+kind]-baseline.ergonomics.byTrack[mode][kind].rightPinky)<1e-12);for(const[f,v]of Object.entries(baseline.modes[mode][kind]))if(typeof v==='number')assert.ok(Math.abs(v-seed.modes[mode][kind][f])<1e-8);}
  await ring(seed,'seed complete ring');
  if(!report.chains.length)for(let i=0;i<8;i++){const leaders=[...known.values()].filter(r=>r.feasible).sort((a,b)=>a.scores[i%4]-b.scores[i%4]);report.chains.push({index:i,axis:i%4,rng:(20261121+(i+1)*104729)>>>0,steps:0,accepted:0,current:leaders[Math.min(Math.floor(i/4),leaders.length-1)].id,best:leaders[0].id});}
  const byId=id=>report.states[id];
  async function chain(c){while(c.steps<250){const at=c.steps%100,coarse=at<30,temp=coarse?.06*(.01/.06)**(at/29):.006*(.0001/.006)**((at-30)/69),center=byId(c.current);let fm;
    for(let attempt=0;attempt<10000;attempt++){const next=coarse?far.perturb(center.finalMap,c,2+Math.floor(far.random(c)*3)):far.mutation(center.finalMap,c,false);if(key(next)!==key(center.finalMap)&&inspect(next)!==null){fm=next;break;}}
    if(!fm)throw Error('no legal mutation');const r=await evaluate(fm,center.id,coarse?'coarse linked perturbation':'fine perturbation');if(r.feasible){const delta=r.scores[c.axis]-center.scores[c.axis];if(delta<=0||far.random(c)<Math.exp(-delta/temp)){c.current=r.id;c.accepted++;}if(r.scores[c.axis]<byId(c.best).scores[c.axis])c.best=r.id;}
    c.steps++;if(c.steps%100===0)c.current=c.best;if(c.steps%50===0)save();}}
  await Promise.all(report.chains.map(chain));
  for(let round=report.stages.filter(s=>s.name==='leader ring').length;round<6;round++){const values=[...known.values()].filter(r=>r.feasible),leaders=MULT.flatMap((_,i)=>[...values].sort((a,b)=>a.scores[i]-b.scores[i]).slice(0,2)),center=leaders.find(r=>!report.stages.some(s=>s.center===r.id));if(!center)break;await ring(center,'leader ring');}
  const values=[...known.values()].filter(r=>r.feasible);report.leaders=MULT.map((multiplier,i)=>({multiplier,rows:[...values].sort((a,b)=>a.scores[i]-b.scores[i]).slice(0,8).map(({modes,...r})=>r)}));report.statesCount=known.size;report.feasibleCount=values.length;report.completed=true;save();console.log(JSON.stringify({completed:true,states:known.size,feasible:values.length,leaders:report.leaders.map(r=>({multiplier:r.multiplier,best:r.rows[0]}))}));
 }finally{native.close();}
}
if(require.main===module)(process.argv.includes('--prepare')?prepare():explore()).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={rightLoads,PREFIX,WORK,BASE};
