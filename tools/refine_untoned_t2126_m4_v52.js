'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const base=require('./search_untoned_t2126_m4_v52');
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..');
const WORK=path.join(ROOT,'research/.cache/untoned-t2126-m4-followup-20261120');
const PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-t2126-m4-followup');
const CONFIG=path.join(ROOT,'research/config/untoned-t2126-m4-followup-finalist.json');
const FAMILIES=[...HEADS.slice(0,21).map(h=>[h]),['A','E','O'],['W'],['Y','YU']];
const INITIAL_KEYS='BCDFGHJKLMNPQRSTVWXYZ';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const fileHash=p=>hash(fs.readFileSync(p));
const initialDistance=(a,b)=>FAMILIES.filter(g=>a.initialMap[g[0]]!==b.initialMap[g[0]]).length;
function expand(state){return {initialMap:Object.fromEntries(HEADS.map((h,i)=>[h,state[i]])),finalMap:Object.fromEntries(FINALS.map((f,i)=>[f,state[27+i]]))};}
function changes(a,b,field,names){return names.filter(n=>a[field][n]!==b[field][n]).map(n=>({name:n,from:b[field][n],to:a[field][n]}));}
function initialVariants(e){
 const out=[];
 const add=(map,label)=>out.push({...e,initialMap:map,mutation:label});
 for(let i=0;i<FAMILIES.length;i++)for(let j=i+1;j<FAMILIES.length;j++){
  const as=FAMILIES[i],bs=FAMILIES[j],ka=e.initialMap[as[0]],kb=e.initialMap[bs[0]];if(ka===kb)continue;
  const map={...e.initialMap};as.forEach(h=>map[h]=kb);bs.forEach(h=>map[h]=ka);add(map,`initial families ${as.join('/')}↔${bs.join('/')}`);
 }
 const groups=Object.groupBy(HEADS,h=>e.initialMap[h]),entries=Object.entries(groups);
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const [ka,as]=entries[i],[kb,bs]=entries[j];if(as.length===1&&bs.length===1)continue;
  const map={...e.initialMap};as.forEach(h=>map[h]=kb);bs.forEach(h=>map[h]=ka);add(map,`initial key groups ${ka}↔${kb}`);
 }
 for(const family of FAMILIES)for(const key of INITIAL_KEYS)if(key!==e.initialMap[family[0]]){
  const map={...e.initialMap};family.forEach(h=>map[h]=key);add(map,`initial family ${family.join('/')}→${key}`);
 }
 for(const permutation of [[1,2,0],[2,0,1]]){
  const names=['zh','ch','sh'],map={...e.initialMap};names.forEach((h,i)=>map[h]=e.initialMap[names[permutation[i]]]);add(map,'initial retroflex three-cycle '+permutation.join(''));
 }
 return out;
}
function finalVariants(e){
 const out=[],add=(map,label)=>out.push({...e,finalMap:map,mutation:label});
 for(let i=0;i<35;i++)for(let j=i+1;j<35;j++){
  const a=FINALS[i],b=FINALS[j],ka=e.finalMap[a],kb=e.finalMap[b];if(ka!==kb)add({...e.finalMap,[a]:kb,[b]:ka},`final tokens ${a}↔${b}`);
 }
 const entries=Object.entries(Object.groupBy(FINALS,f=>e.finalMap[f]));
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const [ka,as]=entries[i],[kb,bs]=entries[j];if(as.length===1&&bs.length===1)continue;
  const map={...e.finalMap};as.forEach(f=>map[f]=kb);bs.forEach(f=>map[f]=ka);add(map,`final key groups ${ka}↔${kb}`);
 }
 for(const f of FINALS)for(const key of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')if(key!==e.finalMap[f])add({...e.finalMap,[f]:key},`final token ${f}→${key}`);
 return out;
}
function guard(e,anchor,data,maxInitialDistance=3){
 if(initialDistance(e,anchor)>maxInitialDistance||e.initialMap.Y!==e.initialMap.YU||new Set(['A','E','O'].map(h=>e.initialMap[h])).size!==1)return false;
 if(HEADS.some(h=>!INITIAL_KEYS.includes(e.initialMap[h]))||FINALS.some(f=>!/^[A-Z]$/.test(e.finalMap[f])))return false;
 const a=base.audit(e.initialMap,e.finalMap,data);
 return a.unique===399&&a.initialKeys<=21&&a.finalKeys<=26&&a.reservedInitials.length===0;
}
function legalUnique(rows,anchor,data,known,maxInitialDistance=3){
 const out=new Map();
 for(const e of rows){const key=base.stateKey(e);if(!known.has(key)&&!out.has(key)&&guard(e,anchor,data,maxInitialDistance))out.set(key,e);}
 return [...out.values()];
}
function random(seed){let value=seed>>>0;return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}
function coupledVariants(center,count,seed){
 const rand=random(seed),out=[],initial=initialVariants(center),final=finalVariants(center);
 for(let i=0;i<count;i++){
  const a=initial[Math.floor(rand()*initial.length)],b=final[Math.floor(rand()*final.length)];
  out.push({...center,initialMap:a.initialMap,finalMap:b.finalMap,mutation:a.mutation+'; '+b.mutation});
  if(i%2===0){
   const map={...center.finalMap};for(let n=0;n<2;n++){const a=FINALS[Math.floor(rand()*35)],b=FINALS[Math.floor(rand()*35)];[map[a],map[b]]=[map[b],map[a]];}
   out.push({...center,finalMap:map,mutation:'two final-token swaps (endpoint guard)'});
  }
 }
 return out;
}
async function run(){
 fs.mkdirSync(WORK,{recursive:true});
 const contract=read(path.join(base.WORK,'contract.json'));
 for(const [p,digest]of Object.entries(contract.sourceHashes))if(fileHash(path.resolve(ROOT,p))!==digest)throw Error('Changed frozen score source '+p);
 const anchor=read(path.join(ROOT,'research/config/untoned-t2126-m4-v52-finalist.json'));
 const old=read(base.OUTPUT),checkpointFile=path.join(WORK,'checkpoint.json');
 const inputs={...contract.inputs};
 const objective=r=>Math.max(r.score/anchor.cktV52.defaultScore,r.doubledScore/anchor.cktV52.doubledCognitiveScore);
 const rows=new Map(old.records.map(r=>{const state=base.stateKey(r);return [state,{id:r.id,state,score:r.score,doubledScore:r.doubledScore,initialDistance:initialDistance(r,anchor),imported:true}];}));
 const checkpoint=fs.existsSync(checkpointFile)?read(checkpointFile):{version:1,anchorId:anchor.id,sourceHashes:contract.sourceHashes,searchSourceSha256:fileHash(__filename),stages:[],records:[],completed:false};
 if(checkpoint.anchorId!==anchor.id)throw Error('Changed anchor');
 checkpoint.completed=false;
 for(const row of checkpoint.records)rows.set(row.state,row);
 const rank=radius=>[...rows.values()].filter(r=>r.initialDistance<=radius).sort((a,b)=>objective(a)-objective(b)||a.initialDistance-b.initialDistance||a.id.localeCompare(b.id));
 const pack=e=>({...expand(e.state),...e});
 const save=()=>{
  checkpoint.records=[...rows.values()].filter(r=>!r.imported).sort((a,b)=>a.state.localeCompare(b.state));
  checkpoint.bestByRadius=Object.fromEntries([0,1,2,3].map(n=>[n,rank(n).slice(0,12)]));
  fs.writeFileSync(checkpointFile,JSON.stringify(checkpoint));
 };
 const workers=Array.from({length:2},()=>base.launch());await Promise.all(workers.map(w=>w.ready));
 try{
  for(const e of [anchor,...inputs.entries]){
   const actual=await workers[0].score(e),expected=e.id===anchor.id?{score:anchor.cktV52.defaultScore,doubledScore:anchor.cktV52.doubledCognitiveScore}:contract.controls.find(r=>r.id===e.id);
   for(const field of ['score','doubledScore'])if(Math.abs(actual[field]-expected[field])>1e-9)throw Error('Frozen contract reproduction failed '+e.id+'/'+field);
   console.log(JSON.stringify({verified:e.id,score:actual.score,doubledScore:actual.doubledScore}));
  }
  async function scoreBatch(jobs,stage){
   let cursor=0,finished=0;const start=Date.now();
   await Promise.all(workers.map(async worker=>{
    while(cursor<jobs.length){
     const job=jobs[cursor++],state=base.stateKey(job);if(rows.has(state))continue;
     const id='UTM4P-'+hash(state).slice(0,12),v=await worker.score({...job,id});
     const record={id,state,score:v.score,doubledScore:v.doubledScore,initialDistance:initialDistance(job,anchor),parent:job.parent||anchor.id,mutation:job.mutation,stage,seconds:v.seconds};
     rows.set(state,record);finished++;
     fs.appendFileSync(path.join(WORK,'native-scores.jsonl'),JSON.stringify({...record,modes:v.modes})+'\n');
     if(finished%20===0||finished===jobs.length){save();const best=rank(3)[0];console.log(JSON.stringify({stage,finished,total:jobs.length,best:best.id,score:best.score,doubledScore:best.doubledScore,elapsedSeconds:(Date.now()-start)/1000}));}
    }
   }));save();return finished;
  }
  if(!checkpoint.stages.some(s=>s.kind==='exact-anchor-neighborhood')){
   const initial=legalUnique(initialVariants(anchor),anchor,inputs,rows),final=legalUnique(finalVariants(anchor),anchor,inputs,rows,0);
   console.log(JSON.stringify({stage:'exact-anchor-neighborhood',initial:initial.length,final:final.length}));
   const count=await scoreBatch([...initial,...final],'exact-anchor-neighborhood');
   checkpoint.stages.push({kind:'exact-anchor-neighborhood',initialCandidates:initial.length,finalCandidates:final.length,newScores:count,completed:true});save();
  }
  if(process.argv.includes('--refine')){
   const proxyFile=path.join(WORK,'proxy-templates.json');
   if(!fs.existsSync(proxyFile)){
    const fixture=read(path.join(base.WORK,'templates.json'));
    fixture.modes=fixture.modes.map(specs=>{
     const selected=[];for(let k=0;k<4;k++)selected.push(...specs.filter(r=>r[1]===k).sort((a,b)=>a[0]-b[0]).slice(0,k===0?6500:3500));
     selected.sort((a,b)=>a[0]-b[0]);selected.forEach((r,i)=>r[0]=i);return selected;
    });fs.writeFileSync(proxyFile,JSON.stringify(fixture));
   }
   const proxy=base.launch(proxyFile);await proxy.ready;const proxyCache=new Map();
   const sample=async e=>{const key=base.stateKey(e);if(!proxyCache.has(key))proxyCache.set(key,await proxy.score({...e,id:'screen'}));return proxyCache.get(key);};
   try{
    const rounds=Number(process.argv.find(a=>a.startsWith('--rounds='))?.split('=')[1]||12);
    const done=new Set(checkpoint.stages.filter(s=>s.kind==='screened-coupled-neighborhood').map(s=>s.radius+':'+s.center));
    for(let round=0;round<rounds;round++){
     const radius=[0,2,3][round%3];
     const rawCenter=rank(radius).find(r=>!done.has(radius+':'+r.id));if(!rawCenter)continue;
     const center=pack(rawCenter),anchorProxy=await sample(center);
     const proposed=[...finalVariants(center),...(radius?[...initialVariants(center),...coupledVariants(center,5000,202611200+round)]:coupledVariants(center,3000,202611200+round).filter(r=>initialDistance(r,anchor)===0))];
     const pool=legalUnique(proposed,anchor,inputs,rows,radius),ranked=[];
     console.log(JSON.stringify({round,radius,center:center.id,legalCandidates:pool.length}));
     for(let i=0;i<pool.length;i++){
      const e=pool[i],s=await sample(e);ranked.push({...e,parent:center.id,forecast:Math.max((center.score+s.score-anchorProxy.score)/anchor.cktV52.defaultScore,(center.doubledScore+s.doubledScore-anchorProxy.doubledScore)/anchor.cktV52.doubledCognitiveScore),forecast1:s.score,forecast2:s.doubledScore});
      if(i%500===0)console.log(JSON.stringify({round,screened:i,total:pool.length}));
     }
     const selected=new Map();
     for(const field of ['forecast','forecast1','forecast2'])for(const e of [...ranked].sort((a,b)=>a[field]-b[field]||base.stateKey(a).localeCompare(base.stateKey(b))).slice(0,14))selected.set(base.stateKey(e),e);
     const count=await scoreBatch([...selected.values()],'screened-coupled-neighborhood');
     done.add(radius+':'+center.id);checkpoint.stages.push({kind:'screened-coupled-neighborhood',center:center.id,radius,legalCandidates:pool.length,newScores:count,completed:true});save();
    }
   }finally{proxy.child.stdin.end();}
  }
  if(process.argv.includes('--polish')){
   const rounds=Number(process.argv.find(a=>a.startsWith('--polish-rounds='))?.split('=')[1]||3);
   for(let round=0;round<rounds;round++){
    const center=pack(rank(3)[0]);
    if(checkpoint.stages.some(s=>s.kind==='exact-polish-neighborhood'&&s.center===center.id))break;
    const pool=legalUnique([...initialVariants(center),...finalVariants(center)],anchor,inputs,rows,3).map(e=>({...e,parent:center.id}));
    console.log(JSON.stringify({stage:'exact-polish-neighborhood',center:center.id,candidates:pool.length}));
    const count=await scoreBatch(pool,'exact-polish-neighborhood');
    checkpoint.stages.push({kind:'exact-polish-neighborhood',center:center.id,radius:3,newScores:count,objectiveGain:objective(center)-objective(rank(3)[0]),completed:true});save();
   }
  }
  checkpoint.completed=true;save();
  const selected=[0,2,3].map(radius=>({radius,...pack(rank(radius)[0])}));
  const summary={version:'untoned-t2126-m4-followup-v1',anchor,sourceHashes:contract.sourceHashes,searchSourceSha256:fileHash(__filename),semantics:auxiliarySemantics('IEUAO'),contract:{capacity:[21,26],branching:false,maxInitialFamilyDistance:3,initialFamilies:FAMILIES,comparisonMultipliers:[1,2],selectionRule:'Minimize max(defaultScore/anchorDefaultScore, doubledScore/anchorDoubledScore); ties prefer fewer changed initial families, then ID',policies:base.POLICY,lengthBalance:base.BALANCE,reference:'S005 each member separately; same cognitive multiplier as candidate'},newScores:checkpoint.records.length,importedScores:old.records.length,stages:checkpoint.stages,selected:selected.map(e=>({...e,changesFromAnchor:{initial:FAMILIES.filter(g=>e.initialMap[g[0]]!==anchor.initialMap[g[0]]).map(g=>({name:g.join('/'),from:anchor.initialMap[g[0]],to:e.initialMap[g[0]]})),final:changes(e,anchor,'finalMap',FINALS)},audit:base.audit(e.initialMap,e.finalMap,inputs)})),bestByRadius:checkpoint.bestByRadius,completed:true};
  summary.followupInputs={anchorSha256:fileHash(path.join(ROOT,'research/config/untoned-t2126-m4-v52-finalist.json')),historicalScoresSha256:fileHash(base.OUTPUT),templatesSha256:fileHash(path.join(base.WORK,'templates.json')),kernelBinarySha256:fileHash(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-2126-stream.exe'))};
  summary.searchScope='Bounded heuristic search within three changed initial families of the anchor. Exact initial/final one-operation neighborhoods at the anchor and reported polish centers; proxy screening for sampled coupled endpoints. No global optimality claim.';
  fs.writeFileSync(PREFIX+'.json',JSON.stringify(summary,null,2)+'\n');
  fs.writeFileSync(PREFIX+'-scores.jsonl.gz',zlib.gzipSync(checkpoint.records.map(r=>JSON.stringify(r)).join('\n')+'\n'));
  console.log(JSON.stringify({completed:true,newScores:checkpoint.records.length,selected:selected.map(e=>({radius:e.radius,id:e.id,score:e.score,doubledScore:e.doubledScore,initialDistance:e.initialDistance}))}));
 }finally{for(const worker of workers)worker.child.stdin.end();}
}
async function verify(){
 const summary=read(PREFIX+'.json'),contract=read(path.join(base.WORK,'contract.json'));
 if(summary.searchSourceSha256!==fileHash(__filename))throw Error('Changed followup search source; regenerate summary before verifying');
 if(summary.followupInputs.anchorSha256!==fileHash(path.join(ROOT,'research/config/untoned-t2126-m4-v52-finalist.json'))||summary.followupInputs.historicalScoresSha256!==fileHash(base.OUTPUT))throw Error('Changed followup inputs');
 for(const [p,digest]of Object.entries(summary.sourceHashes))if(fileHash(path.resolve(ROOT,p))!==digest)throw Error('Changed frozen score source '+p);
 const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52');
 const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
 const targets=[...new Map(summary.selected.map(e=>[e.id,e])).values()],worker=base.launch();await worker.ready;
 const verified=[];
 try{
  for(const e of targets){
   if(!guard(e,summary.anchor,data))throw Error('Illegal candidate '+e.id);
   const template=contract.inputs.entries[0];
   const entry={...template,...e,codeList:data.pinyin.map((py,i)=>{if(!template.codeList[i])return null;const [h,f]=splitPinyin(py);return h===255||f===255?template.codeList[i]:e.initialMap[HEADS[h]]+e.finalMap[FINALS[f]];})};
   const js=v52.evaluateUntoned(entry,base.POLICY,base.BALANCE,ctx).v52,native=await worker.score(entry);let maximumTrackDifference=0;
   for(const m of ['keytao','sanpin'])for(const k of ['character','word2','word3','word4'])for(const [field,v]of Object.entries(js[m][k]))if(typeof v==='number'){
    const difference=Math.abs(v-native.modes[m][k][field]);maximumTrackDifference=Math.max(maximumTrackDifference,difference);if(!Number.isFinite(difference)||difference>1e-7)throw Error('Native/JS track mismatch '+e.id+'/'+m+'/'+k+'/'+field);
   }
   const score=base.normalize(js,contract.reference),doubledScore=base.normalize(js,contract.reference,2);
   if(Math.abs(score-e.score)>1e-9||Math.abs(doubledScore-e.doubledScore)>1e-9)throw Error('Score mismatch '+e.id);
   verified.push({id:e.id,score,doubledScore,maximumTrackDifference,modes:js});console.log(JSON.stringify({verified:e.id,score,doubledScore,maximumTrackDifference}));
  }
 }finally{worker.child.stdin.end();}
 const winner=summary.selected.find(e=>e.radius===3),baseline=summary.anchor;
 const finalist={id:winner.id,name:'21×26 无调 · T2126-M4 声韵联合改良',sourceId:baseline.sourceId,parentId:baseline.id,capacity:[21,26],tone:'IEUAO',...auxiliarySemantics('IEUAO'),initialMap:winner.initialMap,finalMap:winner.finalMap,changesFromParent:winner.changesFromAnchor,initialFamilyDistance:winner.initialDistance,common399Unique:winner.audit.unique,audit:winner.audit,cktV52:{defaultScore:winner.score,doubledCognitiveScore:winner.doubledScore,policies:base.POLICY,lengthBalance:base.BALANCE,reference:summary.contract.reference},comparison:[{id:baseline.id,defaultScore:baseline.cktV52.defaultScore,doubledScore:baseline.cktV52.doubledCognitiveScore},...contract.controls.map(e=>({id:e.id,defaultScore:e.score,doubledScore:e.doubledScore}))].map(r=>({...r,defaultGap:r.defaultScore-winner.score,doubledGap:r.doubledScore-winner.doubledScore}))};
 fs.writeFileSync(CONFIG,JSON.stringify(finalist,null,2)+'\n');
 fs.writeFileSync(PREFIX+'-verification.json',JSON.stringify({sourceHashes:summary.sourceHashes,searchSourceSha256:summary.searchSourceSha256,semantics:summary.semantics,commonPinyin:data.base.map(([p])=>data.pinyin[p]),verified},null,2)+'\n');
}
if(require.main===module)(process.argv.includes('--verify')?verify():run()).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={FAMILIES,initialDistance,initialVariants,finalVariants,coupledVariants,guard,expand,WORK,PREFIX,CONFIG};
