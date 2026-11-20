'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const base=require('./search_untoned_t2126_m4_v52'),follow=require('./refine_untoned_t2126_m4_v52');
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),WORK=path.join(ROOT,'research/.cache/untoned-m40d3-v52-20261120');
const PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-m40d3-v52');
const CONFIG=path.join(ROOT,'research/config/untoned-m40d3-v52-finalist.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const fileHash=p=>hash(fs.readFileSync(p));
function memory(e){
 const displaced=HEADS.slice(0,21).filter(h=>h.length===1&&e.initialMap[h]!==h.toUpperCase());
 const initial=HEADS.filter(h=>!['A','E','O','YU'].includes(h)&&e.initialMap[h]!==h.toUpperCase()).length+new Set(['A','E','O'].map(h=>e.initialMap[h])).size;
 const finals=FINALS.filter(f=>e.finalMap[f]!==f.toUpperCase()).length;
 return {M:initial+finals,D:displaced.length,firstLinks:initial,finalLinks:finals,branches:0,ordinaryDisplaced:displaced};
}
function guard(e,data){
 const m=memory(e);if(m.M>40||m.D>3)return false;
 return follow.guard(e,e,data,0);
}
function permutations(values){if(!values.length)return [[]];return values.flatMap((v,i)=>permutations(values.filter((_,j)=>j!==i)).map(p=>[v,...p]));}
function restoreVowels(e){
 const out=new Map(),vowels=[...'aeiou'];
 for(const omitted of [...vowels,null]){
  const fixed=vowels.filter(v=>v!==omitted),map=new Map();let valid=true;
  for(const v of fixed){const from=e.finalMap[v],to=v.toUpperCase();if(map.has(from)&&map.get(from)!==to){valid=false;break;}map.set(from,to);}
  if(!valid||new Set(map.values()).size!==map.size)continue;
  for(const key of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')if(!map.has(key)&&![...map.values()].includes(key))map.set(key,key);
  const sources=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter(k=>!map.has(k)),targets=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter(k=>![...map.values()].includes(k));
  for(const target of permutations(targets)){
   const completed=new Map(map);sources.forEach((k,i)=>completed.set(k,target[i]));
   const finalMap=Object.fromEntries(FINALS.map(f=>[f,completed.get(e.finalMap[f])]));
   const row={...e,finalMap,mutation:'restore vowel identities by final-key permutation',parent:e.id};out.set(base.stateKey(row),row);
  }
 }
 return [...out.values()];
}
function objective(e,controls){return Math.max(e.score/Math.min(...controls.map(c=>c.score)),e.doubledScore/Math.min(...controls.map(c=>c.doubledScore)));}
async function run(){
 fs.mkdirSync(WORK,{recursive:true});
 const contract=read(path.join(base.WORK,'contract.json'));
 for(const [p,h]of Object.entries(contract.sourceHashes))if(fileHash(path.resolve(ROOT,p))!==h)throw Error('Changed score source '+p);
 const data=contract.inputs,controls=contract.controls;
 const previous=[...read(base.OUTPUT).records,...zlib.gunzipSync(fs.readFileSync(follow.PREFIX+'-scores.jsonl.gz')).toString().trim().split('\n').map(JSON.parse).map(r=>({...follow.expand(r.state),...r}))];
 const checkpointFile=path.join(WORK,'checkpoint.json');
 const report=fs.existsSync(checkpointFile)?read(checkpointFile):{version:1,controls,contract:{M:40,D:3,capacity:[21,26],common399Unique:true,branching:false,toneKeysByTone:'IEUAO',shapeKeysByMeaning:'AEUIO',toneDigitsByShapeMeaning:'42310',policies:base.POLICY,lengthBalance:base.BALANCE,cognitiveMultipliers:[1,2]},sourceHashes:contract.sourceHashes,records:[],stages:[],completed:false};
 report.completed=false;
 const known=new Map();
 for(const e of previous)if(guard(e,data)){const state=base.stateKey(e);known.set(state,{id:e.id,state,score:e.score,doubledScore:e.doubledScore,memory:memory(e),imported:true});}
 for(const [i,e]of data.entries.entries())known.set(base.stateKey(e),{id:e.id,state:base.stateKey(e),score:controls[i].score,doubledScore:controls[i].doubledScore,memory:memory(e),imported:true});
 for(const e of report.records)known.set(e.state,e);
 const rank=()=>[...known.values()].sort((a,b)=>objective(a,controls)-objective(b,controls)||a.memory.M-b.memory.M||a.memory.D-b.memory.D||a.id.localeCompare(b.id));
 const expand=r=>({...follow.expand(r.state),...r});
 const save=()=>{report.records=[...known.values()].sort((a,b)=>a.state.localeCompare(b.state));report.best=rank().slice(0,15);fs.writeFileSync(checkpointFile,JSON.stringify(report));};
 function legal(rows){const out=new Map();for(const e of rows){const state=base.stateKey(e);if(!known.has(state)&&!out.has(state)&&guard(e,data))out.set(state,e);}return [...out.values()];}
 const worker=base.launch();await worker.ready;
 const proxyFile=path.join(follow.WORK,'proxy-templates.json'),proxy=base.launch(proxyFile);await proxy.ready;
 const proxyCache=new Map();
 const sample=async e=>{const state=base.stateKey(e);if(!proxyCache.has(state))proxyCache.set(state,await proxy.score({...e,id:'proxy'}));return proxyCache.get(state);};
 async function score(e,stage,scorer=worker){
  const state=base.stateKey(e);if(known.has(state))return known.get(state);if(!guard(e,data))throw Error('Illegal full-score request');
  const id='UM40-'+hash(state).slice(0,12),s=await scorer.score({...e,id});
  const row={id,state,score:s.score,doubledScore:s.doubledScore,memory:memory(e),parent:e.parent,mutation:e.mutation,stage,seconds:s.seconds};known.set(state,row);
  fs.appendFileSync(path.join(WORK,'scores.jsonl'),JSON.stringify({...row,modes:s.modes})+'\n');save();return row;
 }
 async function screen(pool,center,limit,stage){
  const anchor=await sample(center),ranked=[];
  for(let i=0;i<pool.length;i++){const e=pool[i],s=await sample(e);ranked.push({...e,forecast:objective({score:center.score+s.score-anchor.score,doubledScore:center.doubledScore+s.doubledScore-anchor.doubledScore},controls),forecast1:s.score,forecast2:s.doubledScore});if(i%500===0)console.log(JSON.stringify({stage,screened:i,total:pool.length}));}
  const selected=new Map();for(const field of ['forecast','forecast1','forecast2'])for(const e of [...ranked].sort((a,b)=>a[field]-b[field]||base.stateKey(a).localeCompare(base.stateKey(b))).slice(0,limit))selected.set(base.stateKey(e),e);
  for(const e of selected.values())await score(e,stage);
  return selected.size;
 }
 try{
  for(const e of data.entries){const s=await worker.score(e),c=controls.find(c=>c.id===e.id);if(Math.abs(s.score-c.score)>1e-9||Math.abs(s.doubledScore-c.doubledScore)>1e-9)throw Error('Control mismatch');}
  if(!report.stages.some(s=>s.kind==='repair-transplants')){
   const initials=new Map(data.entries.map(e=>[HEADS.map(h=>e.initialMap[h]).join(''),e.initialMap]));
   const anchor=read('research/config/untoned-t2126-m4-v52-finalist.json');
   for(const e of [anchor,...previous.slice(0,331)]){
    const im={...e.initialMap,l:'L',Y:'W',YU:'W'};
    if(memory({...e,initialMap:im}).D<=3)initials.set(HEADS.map(h=>im[h]).join(''),im);
   }
   const bestPrevious=[...previous].sort((a,b)=>objective(a,controls)-objective(b,controls)).slice(0,24);
   const seeds=[...new Map([...data.entries,...bestPrevious,...read(follow.PREFIX+'.json').selected].map(e=>[FINALS.map(f=>e.finalMap[f]).join(''),e])).values()];
   const proposals=[];
   for(const im of initials.values())for(const seed of seeds)proposals.push(...restoreVowels({...seed,initialMap:im}));
   const pool=legal(proposals);console.log(JSON.stringify({stage:'repair-transplants',initials:initials.size,seeds:seeds.length,legalCandidates:pool.length}));
   const count=await screen(pool,expand(rank()[0]),30,'repair-transplants');report.stages.push({kind:'repair-transplants',legalCandidates:pool.length,exactCandidates:count});save();
  }
  const rounds=Number(process.argv.find(a=>a.startsWith('--rounds='))?.split('=')[1]||14);
  const done=new Set(report.stages.filter(s=>s.kind==='joint-neighborhood').map(s=>s.center));
  for(let round=0;round<rounds;round++){
   const raw=rank().find(e=>!done.has(e.id));if(!raw)break;const center=expand(raw);
   const proposed=[...follow.initialVariants(center),...follow.finalVariants(center),...follow.coupledVariants(center,6000,2026112040+round)];
   const pool=legal(proposed).map(e=>({...e,parent:center.id}));
   const count=await screen(pool,center,16,'joint-neighborhood');done.add(center.id);
   report.stages.push({kind:'joint-neighborhood',center:center.id,legalCandidates:pool.length,exactCandidates:count});save();
   console.log(JSON.stringify({roundComplete:round,best:rank()[0],objective:objective(rank()[0],controls)}));
  }
  if(process.argv.includes('--polish')){
   const center=expand(rank()[0]);
   if(!report.stages.some(s=>s.kind==='exact-final-neighborhood'&&s.center===center.id)){
    const pool=legal([...follow.initialVariants(center),...follow.finalVariants(center)]).map(e=>({...e,parent:center.id}));
    console.log(JSON.stringify({stage:'exact-final-neighborhood',center:center.id,candidates:pool.length}));
    const extra=base.launch();await extra.ready;let cursor=0,finished=0;
    try{await Promise.all([worker,extra].map(async scorer=>{while(cursor<pool.length){const e=pool[cursor++];await score(e,'exact-final-neighborhood',scorer);finished++;if(finished%50===0||finished===pool.length)console.log(JSON.stringify({stage:'exact-final-neighborhood',finished,total:pool.length,best:rank()[0].id}));}}));}finally{extra.child.stdin.end();}
    report.stages.push({kind:'exact-final-neighborhood',center:center.id,exactCandidates:pool.length});save();
   }
  }
  report.completed=true;report.searchSourceSha256=fileHash(__filename);report.selected=expand(rank()[0]);report.semantics=auxiliarySemantics('IEUAO');report.importedSources={previousSha256:fileHash(base.OUTPUT),followupScoresSha256:fileHash(follow.PREFIX+'-scores.jsonl.gz')};save();
  report.searchScope='Hard M-R2 <=40 and ordinary D<=3 for every full score; Common399 unique, 21x26, no branching. Repair-and-transplant screening followed by bounded joint initial/final neighborhoods. Heuristic, with no global optimality claim.';
  report.selectionRule='Minimize max(defaultScore/bestControlDefault, doubledScore/bestControlDoubled); ties prefer lower M then lower D.';
  fs.writeFileSync(PREFIX+'.json',JSON.stringify({...report,records:undefined},null,2)+'\n');
  fs.writeFileSync(PREFIX+'-scores.jsonl.gz',zlib.gzipSync(report.records.map(r=>JSON.stringify(r)).join('\n')+'\n'));
 }finally{worker.child.stdin.end();proxy.child.stdin.end();}
}
async function verify(){
 const report=read(PREFIX+'.json'),contract=read(path.join(base.WORK,'contract.json'));
 if(report.searchSourceSha256!==fileHash(__filename))throw Error('Changed search source; regenerate summary');
 for(const [p,h]of Object.entries(report.sourceHashes))if(fileHash(path.resolve(ROOT,p))!==h)throw Error('Changed source '+p);
 const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52');
 const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html')),e=report.selected;
 if(!guard(e,data))throw Error('Invalid selected candidate');
 const template=contract.inputs.entries[0],entry={...template,...e,codeList:data.pinyin.map((py,i)=>{if(!template.codeList[i])return null;const[h,f]=splitPinyin(py);return h===255||f===255?template.codeList[i]:e.initialMap[HEADS[h]]+e.finalMap[FINALS[f]];})};
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
 const js=v52.evaluateUntoned(entry,base.POLICY,base.BALANCE,ctx).v52,worker=base.launch();await worker.ready;let native;
 try{native=await worker.score(entry);}finally{worker.child.stdin.end();}
 let maximumTrackDifference=0;
 for(const m of ['keytao','sanpin'])for(const k of ['character','word2','word3','word4'])for(const [field,value]of Object.entries(js[m][k]))if(typeof value==='number'){const difference=Math.abs(value-native.modes[m][k][field]);maximumTrackDifference=Math.max(maximumTrackDifference,difference);if(!Number.isFinite(difference)||difference>1e-7)throw Error('Track mismatch');}
 const score=base.normalize(js,contract.reference),doubledScore=base.normalize(js,contract.reference,2);
 if(Math.abs(score-e.score)>1e-9||Math.abs(doubledScore-e.doubledScore)>1e-9)throw Error('Score mismatch');
 const finalist={id:e.id,name:'21×26 无调 · M40 D3 CKT v5.2 候选',capacity:[21,26],tone:'IEUAO',...report.semantics,initialMap:e.initialMap,finalMap:e.finalMap,memory:memory(e),audit:base.audit(e.initialMap,e.finalMap,data),cktV52:{defaultScore:score,doubledCognitiveScore:doubledScore,policies:base.POLICY,lengthBalance:base.BALANCE,reference:'S005 each member normalized separately; cognitive costs repriced at both endpoints'},comparison:report.controls.map(c=>{const m=memory(contract.inputs.entries.find(e=>e.id===c.id));return {id:c.id,M:m.M,D:m.D,defaultScore:c.score,doubledScore:c.doubledScore,defaultGap:c.score-score,doubledGap:c.doubledScore-doubledScore};})};
 finalist.changesFromControls=contract.inputs.entries.map(c=>({id:c.id,initial:follow.FAMILIES.filter(g=>c.initialMap[g[0]]!==e.initialMap[g[0]]).map(g=>({name:g.join('/'),from:c.initialMap[g[0]],to:e.initialMap[g[0]]})),final:FINALS.filter(f=>c.finalMap[f]!==e.finalMap[f]).map(f=>({name:f,from:c.finalMap[f],to:e.finalMap[f]}))}));
 fs.writeFileSync(CONFIG,JSON.stringify(finalist,null,2)+'\n');
 fs.writeFileSync(PREFIX+'-verification.json',JSON.stringify({id:e.id,score,doubledScore,maximumTrackDifference,memory:memory(e),commonPinyin:data.base.map(([p])=>data.pinyin[p]),modes:js,semantics:report.semantics},null,2)+'\n');
 console.log(JSON.stringify({verified:e.id,score,doubledScore,maximumTrackDifference,memory:memory(e)}));
}
if(require.main===module)(process.argv.includes('--verify')?verify():run()).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={memory,guard,restoreVowels,objective,PREFIX,CONFIG,WORK};
