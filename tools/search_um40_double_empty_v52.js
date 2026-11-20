'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const base=require('./search_untoned_t2126_m4_v52'),md=require('./search_untoned_m40d3_v52');
const follow=require('./refine_untoned_t2126_m4_v52'),rhymes=require('./refine_um40_rhymes_v52');
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),WORK=path.join(ROOT,'research/.cache/um40-double-empty-v52-20261120');
const PREFIX=path.join(ROOT,'research/notes/2026-11-20-um40-double-empty-v52');
const CONFIG=path.join(ROOT,'research/config/um40-double-empty-v52-finalist.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const fileHash=p=>digest(fs.readFileSync(p));
const initialKey=e=>HEADS.map(h=>e.initialMap[h]).join('');
const expand=r=>({...follow.expand(r.state),...r});
const objective=(r,controls)=>Math.max(r.score/Math.min(...controls.map(c=>c.score)),r.doubledScore/Math.min(...controls.map(c=>c.doubledScore)));
function buckets(e,data){
 const out={QZ:[],ZQ:[]};
 for(const [p]of data.base){const [h,f]=splitPinyin(data.pinyin[p]),code=e.initialMap[HEADS[h]]+e.finalMap[FINALS[f]];if(out[code])out[code].push(data.pinyin[p]);}
 return out;
}
function guard(e,data,anchor,maxInitialDistance=2){
 if(anchor&&follow.initialDistance(e,anchor)>maxInitialDistance)return false;
 if(!md.guard(e,data))return false;
 const b=buckets(e,data);return b.QZ.length===0&&b.ZQ.length===0;
}
function compactGuard(e,data){
 const ordinary=new Map(),forbidden=new Uint32Array(35);let impossible=false;
 for(const [p]of data.base){const [h,f]=splitPinyin(data.pinyin[p]),k=e.initialMap[HEADS[h]];
  const pair=k+':'+f;if(ordinary.has(pair))impossible=true;ordinary.set(pair,true);
  if(k==='Q')forbidden[f]|=1<<25;if(k==='Z')forbidden[f]|=1<<16;
 }
 if(impossible)return ()=>false;
 const legal=rhymes.makeGuard(e,data);
 return state=>legal(state)&&state.every((k,i)=>(forbidden[i]&(1<<k))===0);
}
function opLabel(op){const key=i=>String.fromCharCode(65+i);return op.kind==='token-swap'?`final ${FINALS[op.a]}↔${FINALS[op.b]}`:op.kind==='token-move'?`final ${FINALS[op.a]}→${key(op.b)}`:op.kind==='key-swap'?`final key groups ${key(op.a)}↔${key(op.b)}`:`final key group ${key(op.a)}→${key(op.b)}`;}
function atomic(file,value){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file);}
async function search(){
 fs.mkdirSync(WORK,{recursive:true});const contract=read(path.join(base.WORK,'contract.json')),data=contract.inputs,controls=contract.controls;
 for(const [p,h]of Object.entries(contract.sourceHashes))if(fileHash(path.resolve(ROOT,p))!==h)throw Error('Changed score source '+p);
 const old=read(rhymes.PREFIX+'.json'),anchor=old.anchor;
 const starts=[{...anchor,score:anchor.cktV52.defaultScore,doubledScore:anchor.cktV52.doubledCognitiveScore},expand(old.bestDefault[0]),expand(old.bestDoubled[0])];
 const archives=[md.PREFIX+'-scores.jsonl.gz',rhymes.PREFIX+'-scores.jsonl.gz'];
 const known=new Map();for(const file of archives)for(const r of zlib.gunzipSync(fs.readFileSync(file)).toString().trim().split('\n').map(JSON.parse))if(guard(expand(r),data,anchor))known.set(r.state,{...r,imported:true});
 const checkpoint=path.join(WORK,'checkpoint.json');
 const report=fs.existsSync(checkpoint)?read(checkpoint):{version:1,anchorId:anchor.id,anchorSha256:fileHash(rhymes.PREFIX+'.json'),records:[],stages:[],completed:false};
 if(report.anchorSha256!==fileHash(rhymes.PREFIX+'.json'))throw Error('Changed starting layouts');
 for(const r of report.records)known.set(r.state,r);report.completed=false;
 const rank=fixed=>[...known.values()].filter(r=>!fixed||r.state.slice(0,27)===initialKey(anchor)).sort((a,b)=>objective(a,controls)-objective(b,controls)||a.id.localeCompare(b.id));
 const save=()=>{report.records=[...known.values()].sort((a,b)=>a.state.localeCompare(b.state));report.best=rank(false).slice(0,15);report.bestFixed=rank(true).slice(0,15);atomic(checkpoint,report);};
 const workers=Array.from({length:2},()=>base.launch());await Promise.all(workers.map(w=>w.ready));
 const proxy=base.launch(path.join(follow.WORK,'proxy-templates.json'));await proxy.ready;const proxyCache=new Map();
 const sample=async e=>{const state=base.stateKey(e);if(!proxyCache.has(state))proxyCache.set(state,await proxy.score({...e,id:'screen'}));return proxyCache.get(state);};
 const guards=new Map();const getCompact=e=>{const k=initialKey(e);if(!guards.has(k))guards.set(k,compactGuard(e,data));return guards.get(k);};
 function legalUnique(proposals){const pool=new Map();for(const e of proposals){const state=base.stateKey(e);if(!known.has(state)&&!pool.has(state)&&guard(e,data,anchor))pool.set(state,e);}return [...pool.values()];}
 async function scoreBatch(jobs,stage){let cursor=0,finished=0;const before=known.size;
  await Promise.all(workers.map(async worker=>{while(cursor<jobs.length){const e=jobs[cursor++],state=base.stateKey(e);if(known.has(state))continue;
   if(!guard(e,data,anchor))throw Error('Illegal full score '+state);
   const id='UDE40-'+digest(state).slice(0,12),v=await worker.score({...e,id});
   if(v.id!==id||!Number.isFinite(v.score)||!Number.isFinite(v.doubledScore))throw Error('Invalid native response');
   const row={id,state,score:v.score,doubledScore:v.doubledScore,memory:md.memory(e),initialDistance:follow.initialDistance(e,anchor),parent:e.parent,mutation:e.mutation,stage,seconds:v.seconds};
   known.set(state,row);fs.appendFileSync(path.join(WORK,'scores.jsonl'),JSON.stringify({...row,modes:v.modes})+'\n');finished++;save();
   if(finished%20===0||cursor===jobs.length){const b=rank(false)[0],f=rank(true)[0];console.log(JSON.stringify({stage,finished,total:jobs.length,best:{id:b.id,score:b.score,doubledScore:b.doubledScore},bestFixed:{id:f.id,score:f.score,doubledScore:f.doubledScore}}));}
  }}));save();return known.size-before;
 }
 async function screen(pool,center,limit,stage){const reference=await sample(center),ranked=[];
  for(let i=0;i<pool.length;i++){const e=pool[i],v=await sample(e);ranked.push({...e,forecast:objective({score:center.score+v.score-reference.score,doubledScore:center.doubledScore+v.doubledScore-reference.doubledScore},controls),proxy1:v.score,proxy2:v.doubledScore});if(i%400===0)console.log(JSON.stringify({stage,screened:i,total:pool.length}));}
  const selected=new Map();for(const field of ['forecast','proxy1','proxy2'])for(const e of [...ranked].sort((a,b)=>a[field]-b[field]||base.stateKey(a).localeCompare(base.stateKey(b))).slice(0,limit))selected.set(base.stateKey(e),e);
  return scoreBatch([...selected.values()],stage);
 }
 const ops=rhymes.operations();
 try{
  for(const e of [...starts,...data.entries]){const v=await workers[0].score(e),expected=starts.find(r=>r.id===e.id)||controls.find(r=>r.id===e.id);if(Math.abs(v.score-expected.score)>1e-9||Math.abs(v.doubledScore-expected.doubledScore)>1e-9)throw Error('Control replay mismatch '+e.id);console.log(JSON.stringify({verified:e.id,score:v.score,doubledScore:v.doubledScore,buckets:buckets(e,data)}));}
  for(const start of starts){
   if(report.stages.some(s=>s.kind==='exact-single-repairs'&&s.center===start.id))continue;
   const pool=legalUnique([...follow.finalVariants(start),...follow.initialVariants(start)]).map(e=>({...e,parent:start.id}));
   const count=await scoreBatch(pool,'exact-single-repairs');report.stages.push({kind:'exact-single-repairs',center:start.id,legalCandidates:pool.length,newScores:count});save();
  }
  for(const start of starts){
   if(report.stages.some(s=>s.kind==='two-operation-rhyme-repairs'&&s.center===start.id))continue;
   const state=rhymes.encode(start.finalMap),compact=getCompact(start),first=new Map(),pool=new Map();
   for(const op of ops){const s=rhymes.apply(state,op),k=rhymes.key(s);if(k!==rhymes.key(state)&&!first.has(k))first.set(k,{state:s,op});}
   let visits=0,legal=0;
   for(const a of first.values())for(const b of ops){visits++;const s=rhymes.apply(a.state,b);if(!compact(s))continue;legal++;const k=initialKey(start)+rhymes.key(s);if(!known.has(k)&&!pool.has(k))pool.set(k,{...start,finalMap:rhymes.decode(s),parent:start.id,mutation:opLabel(a.op)+'; '+opLabel(b)});}
   const motor=require('./ckt_v4_model').upstreamMotor(read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),table=Array.from({length:35},()=>new Float64Array(26));
   for(const [p,w]of data.base){const [h,f]=splitPinyin(data.pinyin[p]);for(let k=0;k<26;k++)table[f][k]+=w*motor(start.initialMap[HEADS[h]]+String.fromCharCode(65+k)).upperMs;}
   const values=[...pool.values()].map(e=>({...e,motor:FINALS.reduce((sum,f,i)=>sum+table[i][e.finalMap[f].charCodeAt(0)-65],0)}));
   const picked=new Map();for(const e of values.sort((a,b)=>a.motor-b.motor||base.stateKey(a).localeCompare(base.stateKey(b))).slice(0,350))picked.set(base.stateKey(e),e);
   const groups=new Set();for(const e of values){const used=new Map(),signature=FINALS.map(f=>{const k=e.finalMap[f];if(!used.has(k))used.set(k,used.size);return used.get(k);}).join(',');if(!groups.has(signature)){groups.add(signature);picked.set(base.stateKey(e),e);if(groups.size>=100)break;}}
   let random=20261120;for(let i=0;i<80&&values.length;i++){random=(Math.imul(random,1664525)+1013904223)>>>0;const e=values[random%values.length];picked.set(base.stateKey(e),e);}
   const stats={kind:'two-operation-rhyme-repairs',center:start.id,primitiveOperations:ops.length,firstStates:first.size,pairsVisited:visits,legalBeforeDedup:legal,uniqueNewEndpoints:pool.size,proxyCandidates:picked.size};console.log(JSON.stringify(stats));
   const count=await screen([...picked.values()],start,28,'two-operation-rhyme-repairs');report.stages.push({...stats,newScores:count});save();
  }
  const rounds=Number(process.argv.find(a=>a.startsWith('--rounds='))?.split('=')[1]??12),done=new Set(report.stages.filter(s=>s.kind==='local-refinement').map(s=>s.fixed+':'+s.center));
  for(let round=0;round<rounds;round++){
   const fixed=round%3!==2,raw=rank(fixed).find(r=>!done.has(fixed+':'+r.id));if(!raw)continue;const center=expand(raw),state=rhymes.encode(center.finalMap),compact=getCompact(center),proposals=[];
   for(const op of ops){const s=rhymes.apply(state,op);if(compact(s))proposals.push({...center,finalMap:rhymes.decode(s),mutation:opLabel(op)});}
   let seed=2026112080+round;const rng=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
   for(let i=0;i<9000;i++){const a=ops[rng(ops.length)],b=ops[rng(ops.length)],s=rhymes.apply(rhymes.apply(state,a),b);if(compact(s))proposals.push({...center,finalMap:rhymes.decode(s),mutation:opLabel(a)+'; '+opLabel(b)});}
   if(!fixed)proposals.push(...follow.initialVariants(center),...follow.coupledVariants(center,7000,2026112090+round));
   const pool=legalUnique(proposals).map(e=>({...e,parent:center.id}));const count=await screen(pool,center,20,'local-refinement');
   done.add(fixed+':'+center.id);report.stages.push({kind:'local-refinement',fixed,center:center.id,legalCandidates:pool.length,newScores:count});save();
   const b=rank(false)[0],f=rank(true)[0];console.log(JSON.stringify({roundComplete:round,best:{id:b.id,score:b.score,doubledScore:b.doubledScore},bestFixed:{id:f.id,score:f.score,doubledScore:f.doubledScore}}));
  }
  if(process.argv.includes('--twohop')){
   const center=expand(rank(true)[0]);
   if(!report.stages.some(s=>s.kind==='repaired-center-twohop'&&s.center===center.id)){
    const state=rhymes.encode(center.finalMap),compact=getCompact(center),first=new Map(),pool=new Map();
    const singles=ops.map(op=>known.get(initialKey(center)+rhymes.key(rhymes.apply(state,op))));
    for(const op of ops){const s=rhymes.apply(state,op),k=rhymes.key(s);if(k!==rhymes.key(state)&&!first.has(k))first.set(k,{state:s,op});}
    const motor=require('./ckt_v4_model').upstreamMotor(read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),table=Array.from({length:35},()=>new Float64Array(26));
    for(const [p,w]of data.base){const[h,f]=splitPinyin(data.pinyin[p]);for(let k=0;k<26;k++)table[f][k]+=w*motor(center.initialMap[HEADS[h]]+String.fromCharCode(65+k)).upperMs;}
    let visits=0,legal=0;
    for(const a of first.values()){
     const scoreA=known.get(initialKey(center)+rhymes.key(a.state));
     for(let i=0;i<ops.length;i++){
      visits++;const s=rhymes.apply(a.state,ops[i]);if(!compact(s))continue;legal++;
      const k=initialKey(center)+rhymes.key(s);if(known.has(k)||pool.has(k))continue;
      const b=singles[i],forecast=scoreA&&b?objective({score:scoreA.score+b.score-center.score,doubledScore:scoreA.doubledScore+b.doubledScore-center.doubledScore},controls):Infinity;
      pool.set(k,{...center,finalMap:rhymes.decode(s),parent:center.id,mutation:opLabel(a.op)+'; '+opLabel(ops[i]),forecast,motor:s.reduce((sum,k,j)=>sum+table[j][k],0)});
     }
    }
    const values=[...pool.values()],picked=new Map();
    for(const field of ['forecast','motor'])for(const e of [...values].sort((a,b)=>a[field]-b[field]||base.stateKey(a).localeCompare(base.stateKey(b))).slice(0,250))picked.set(base.stateKey(e),e);
    let rng=20261121;const exploratory=[...values].sort((a,b)=>a.motor-b.motor).slice(0,6000);
    for(let i=0;i<100&&exploratory.length;i++){rng=(Math.imul(rng,1664525)+1013904223)>>>0;const e=exploratory[rng%exploratory.length];picked.set(base.stateKey(e),e);}
    const stats={kind:'repaired-center-twohop',center:center.id,pairsVisited:visits,legalBeforeDedup:legal,uniqueNewEndpoints:pool.size,proxyCandidates:picked.size};console.log(JSON.stringify(stats));
    const count=await screen([...picked.values()],center,40,'repaired-center-twohop');report.stages.push({...stats,newScores:count});save();
   }
  }
  if(process.argv.includes('--polish')){
   const limit=Number(process.argv.find(a=>a.startsWith('--polish-rounds='))?.split('=')[1]??3);
   for(let round=0;round<limit;round++){
    const center=expand(rank(false)[0]);if(report.stages.some(s=>s.kind==='exact-polish'&&s.center===center.id))break;
    const pool=legalUnique([...follow.initialVariants(center),...follow.finalVariants(center)]).map(e=>({...e,parent:center.id}));
    console.log(JSON.stringify({stage:'exact-polish',round,center:center.id,legalCandidates:pool.length}));
    const count=await scoreBatch(pool,'exact-polish');report.stages.push({kind:'exact-polish',center:center.id,newScores:count});save();
   }
  }
  report.completed=true;report.anchors=starts;report.controls=controls;
  report.singleRepairByAnchor=starts.map(start=>{
   const unique=new Map();for(const e of follow.finalVariants(start))if(guard(e,data,anchor)){const r=known.get(base.stateKey(e));if(r)unique.set(r.state,{...r,repairOf:start.id,repairMutation:e.mutation});}
   const rows=[...unique.values()].sort((a,b)=>objective(a,controls)-objective(b,controls));
   return {anchorId:start.id,legalScoredSingleRhymeRepairs:rows.length,best:rows[0]};
  });
  report.selected=[{kind:'fixed-initials',...expand(rank(true)[0])},{kind:'up-to-two-initial-families',...expand(rank(false)[0])}];
  report.bestDefault=[...known.values()].sort((a,b)=>a.score-b.score).slice(0,10);report.bestDoubled=[...known.values()].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,10);
  report.contract={capacity:[21,26],maximumM:40,maximumD:3,common399Unique:true,qzEmpty:true,zqEmpty:true,maximumInitialFamilyDistance:2,initialFamilyReference:anchor.id,cognitiveMultipliers:[1,2],policies:base.POLICY,lengthBalance:base.BALANCE,semantics:auxiliarySemantics('IEUAO')};
  report.selectionRule='Minimize max(score / best A/C score, doubledScore / best A/C doubledScore); fixed-initial alternative ranked separately.';
  report.searchScope='Exact single-operation repairs of three anchors; enumerate two-final-operation legal endpoints and screen a subset; bounded local final and initial perturbations. General two-operation space not fully scored; no global optimality claim.';
  const sourceFiles=[...archives,rhymes.PREFIX+'.json',__filename,require.resolve('./refine_um40_rhymes_v52'),require.resolve('./search_untoned_m40d3_v52'),require.resolve('./refine_untoned_t2126_m4_v52')];
  report.sourceHashes={...contract.sourceHashes,...Object.fromEntries(sourceFiles.map(p=>[p,fileHash(p)]))};report.scoreCounts={total:known.size,imported:[...known.values()].filter(r=>r.imported).length,newFullDictionary:[...known.values()].filter(r=>!r.imported).length};save();
  report.resultsVersusControls=report.selected.map(r=>({kind:r.kind,id:r.id,beatsBothAtBothPoints:controls.every(c=>r.score<c.score-1e-9&&r.doubledScore<c.doubledScore-1e-9),comparisons:controls.map(c=>({id:c.id,defaultGap:c.score-r.score,doubledGap:c.doubledScore-r.doubledScore}))}));
  fs.writeFileSync(PREFIX+'.json',JSON.stringify({...report,records:undefined},null,2)+'\n');fs.writeFileSync(PREFIX+'-scores.jsonl.gz',zlib.gzipSync(report.records.map(r=>JSON.stringify(r)).join('\n')+'\n'));
 }finally{for(const w of workers)w.child.stdin.end();proxy.child.stdin.end();}
}
async function verify(){
 const report=read(PREFIX+'.json'),contract=read(path.join(base.WORK,'contract.json'));
 for(const [p,h]of Object.entries(report.sourceHashes))if(fileHash(path.resolve(ROOT,p))!==h)throw Error('Changed source '+p);
 const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52');const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
 const targets=[...new Map(report.selected.map(e=>[e.id,e])).values()],checked=[],worker=base.launch();await worker.ready;
 try{for(const e of targets){
  if(!guard(e,data,report.anchors[0]))throw Error('Invalid selected candidate');
  const template=contract.inputs.entries[0],entry={...template,...e,codeList:data.pinyin.map((py,i)=>{if(!template.codeList[i])return null;const[h,f]=splitPinyin(py);return h===255||f===255?template.codeList[i]:e.initialMap[HEADS[h]]+e.finalMap[FINALS[f]];})};
  const js=v52.evaluateUntoned(entry,base.POLICY,base.BALANCE,ctx).v52,native=await worker.score(entry);let maximumTrackDifference=0;
  for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])for(const [field,v]of Object.entries(js[mode][kind]))if(typeof v==='number'){const difference=Math.abs(v-native.modes[mode][kind][field]);maximumTrackDifference=Math.max(maximumTrackDifference,difference);if(!Number.isFinite(difference)||difference>1e-7)throw Error('Track mismatch '+e.id+'/'+mode+'/'+kind+'/'+field);}
  const score=base.normalize(js,contract.reference),doubledScore=base.normalize(js,contract.reference,2);if(Math.abs(score-e.score)>1e-9||Math.abs(doubledScore-e.doubledScore)>1e-9)throw Error('Score mismatch');
  checked.push({id:e.id,score,doubledScore,maximumTrackDifference,modes:js,memory:md.memory(e),buckets:buckets(e,data)});console.log(JSON.stringify({verified:e.id,score,doubledScore,maximumTrackDifference,memory:md.memory(e),buckets:buckets(e,data)}));
 }}finally{worker.child.stdin.end();}
 const e=report.selected.find(e=>e.kind==='up-to-two-initial-families'),anchor=report.anchors[0];
 const initialChanges=follow.FAMILIES.filter(g=>e.initialMap[g[0]]!==anchor.initialMap[g[0]]).map(g=>({name:g.join('/'),from:anchor.initialMap[g[0]],to:e.initialMap[g[0]]}));
 const finalist={id:e.id,parentId:anchor.id,name:'21×26 无调 · M40 D3 QZ/ZQ双空候选',capacity:[21,26],tone:'IEUAO',...auxiliarySemantics('IEUAO'),initialMap:e.initialMap,finalMap:e.finalMap,memory:md.memory(e),audit:base.audit(e.initialMap,e.finalMap,data),buckets:buckets(e,data),changesFromParent:{initial:initialChanges,final:FINALS.filter(f=>e.finalMap[f]!==anchor.finalMap[f]).map(f=>({name:f,from:anchor.finalMap[f],to:e.finalMap[f]}))},cktV52:{defaultScore:e.score,doubledCognitiveScore:e.doubledScore,policies:base.POLICY,lengthBalance:base.BALANCE,reference:'S005 repriced at both cognitive multipliers; normalize each member separately'},comparison:[...report.anchors,...report.controls].map(c=>({id:c.id,score:c.score,doubledScore:c.doubledScore,defaultGap:c.score-e.score,doubledGap:c.doubledScore-e.doubledScore}))};
 fs.writeFileSync(CONFIG,JSON.stringify(finalist,null,2)+'\n');fs.writeFileSync(PREFIX+'-verification.json',JSON.stringify({passed:true,commonPinyin:data.base.map(([p])=>data.pinyin[p]),semantics:auxiliarySemantics('IEUAO'),checked,sourceHashes:report.sourceHashes},null,2)+'\n');
}
if(require.main===module)(process.argv.includes('--verify')?verify():search()).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={buckets,guard,compactGuard,objective,PREFIX,CONFIG,WORK};
