'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const {HEADS,FINALS,ALPHABET,splitPinyin}=require('./ckt_v4_scheme_fixture');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52');
const model=require('./ckt_v4_model');
const ROOT=path.resolve(__dirname,'..'),WORK=path.join(ROOT,'research/.cache/untoned-t2126-m4-20261120');
const OUTPUT=path.join(ROOT,'research/notes/2026-11-20-untoned-t2126-m4-v52.json');
const PROFILE=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
const SOURCE='T2126-V52-M4-ec60a3637a99';
const IDS=['RC26-39a5bfdc045342cd','RC26-eeb7b9a25a90cadd'];
const POLICY={keytao:{word2:'12',word3:'12',word4:'24'},sanpin:{word2:'12',word3:'21',word4:'13'}};
const REF={keytao:{word2:'12',word3:'213',word4:'24'},sanpin:{word2:'12',word3:'213',word4:'23'}};
const BALANCE={pageSize:6,maximumCandidates:120,minimumInputLength:4};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const fileHash=p=>digest(fs.readFileSync(p));
const stateKey=e=>HEADS.map(h=>e.initialMap[h]).join('')+FINALS.map(f=>e.finalMap[f]).join('');
function rebuild(e,data){
 return {...e,codeList:data.pinyin.map((py,i)=>{
  if(!e.codeList[i])return null;
  const [h,f]=splitPinyin(py);
  return h===255||f===255?e.codeList[i]:e.initialMap[HEADS[h]]+e.finalMap[FINALS[f]];
 })};
}
function compileRows(rows,words,data,entry){
 const pools=new Map(['char:base','char:aux1','char:aux2','word:four','word:five','word:six','word3:three'].map((p,i)=>[p,i]));
 const priority=[...rows].sort((a,b)=>b.weight-a.weight||(a.id<b.id?-1:a.id>b.id?1:0));
 const ties=new Map(priority.map((r,i)=>[r.id,i]));
 const layout=[...HEADS.map(h=>entry.initialMap[h]),...FINALS.map(f=>entry.finalMap[f])];
 const syllable=p=>{const [h,f]=splitPinyin(data.pinyin[p]);return h===255||f===255?[...entry.codeList[p]].map(k=>62+ALPHABET.indexOf(k)):[h,27+f];};
 return rows.map(row=>{
  const i=Number(row.id.slice(row.id.lastIndexOf(':')+1));
  const pairs=row.kind==='character'?null:words[row.kind][i].py.map(syllable);
  const prefix=row.kind==='character'?syllable(i):row.kind==='word2'?pairs.flat():row.kind==='word3'?[...pairs.map(p=>p[0]),pairs[2][1]]:pairs.map(p=>p[0]);
  const stages=row.stages.map(s=>{
   if(!pools.has(s.pool))throw Error('Unknown competition pool '+s.pool);
   if(s.length>4&&s.codes.length!==1)throw Error('Long-code alternatives require full v5.2 routing');
   const n=Math.min(prefix.length,s.length),codes=s.codes.map(code=>{
    const tokens=[...prefix.slice(0,n),...[...code.slice(n)].map(k=>62+ALPHABET.indexOf(k))];
    if(tokens.map(t=>t<62?layout[t]:ALPHABET[t-62]).join('')!==code)throw Error('Symbolic row mismatch '+row.id);
    return tokens;
   });
   return [s.order,pools.get(s.pool),codes];
  });
  return [ties.get(row.id),['character','word2','word3','word4'].indexOf(row.kind),row.weight,row.baseLength,stages];
 });
}
function normalize(modes,reference,multiplier=1){
 let sum=0;
 for(const m of ['keytao','sanpin'])for(const [k,w]of Object.entries({character:1,word2:3,word3:1,word4:1})){
  const t=modes[m][k],r=reference[m][k];
  const effective=x=>x.motorUpperMs+multiplier*(x.effectiveMs-x.motorUpperMs);
  sum+=w*(effective(t)/effective(r))**4;
 }
 return 10*(sum/12)**.25;
}
function audit(initialMap,finalMap,data){
 const buckets=new Map();
 for(const [p]of data.base){const [h,f]=splitPinyin(data.pinyin[p]);if(h===255||f===255)throw Error('Unparsed Common399 syllable');const c=initialMap[HEADS[h]]+finalMap[FINALS[f]];(buckets.get(c)||buckets.set(c,[]).get(c)).push(data.pinyin[p]);}
 const collisions=[...buckets].filter(([,ps])=>ps.length>1);
 return {commonCount:data.base.length,unique:buckets.size,collisionPairs:collisions.reduce((s,[,ps])=>s+ps.length*(ps.length-1)/2,0),collisions,
  initialKeys:new Set(HEADS.map(h=>initialMap[h])).size,finalKeys:new Set(FINALS.map(f=>finalMap[f])).size,
  reservedInitials:HEADS.filter(h=>'AEUIO'.includes(initialMap[h])),qz:buckets.has('QZ'),zq:buckets.has('ZQ')};
}
// A/E/O share one carrier; Y/YU share one carrier. One family edit means
// changing its physical key, regardless of how many spellings it represents.
function enumerateInitials(initialMap,data,maxChanges=4){
 const groups=[...HEADS.slice(0,21).map(h=>[h]),['A','E','O'],['W'],['Y','YU']];
 const sets=groups.map(()=>new Set());
 for(const [p]of data.base){const [h,f]=splitPinyin(data.pinyin[p]);sets[groups.findIndex(g=>g.includes(HEADS[h]))].add(FINALS[f]);}
 const keys=[...'BCDFGHJKLMNPQRSTVWXYZ'],orig=groups.map(g=>initialMap[g[0]]),levels=[],solutions=[];
 const incompatible=(i,j)=>[...sets[i]].some(f=>sets[j].has(f))||sets[i].size+sets[j].size>26;
 for(let k=0;k<=maxChanges;k++){
  let compatibleFixedSubsets=0,assignments=0;
  function choose(start,indices){
   if(indices.length===k){
    const fixed=groups.map((_,i)=>i).filter(i=>!indices.includes(i));
    if(fixed.some((i,a)=>fixed.slice(a+1).some(j=>orig[i]===orig[j]&&incompatible(i,j))))return;
    compatibleFixedSubsets++;
    const state=orig.slice();
    function assign(n){
     if(n===k){assignments++;solutions.push({initialMap:Object.fromEntries(groups.flatMap((g,i)=>g.map(h=>[h,state[i]]))),changes:indices.map(i=>({head:groups[i].join('/'),from:orig[i],to:state[i]}))});return;}
     const i=indices[n];
     for(const key of keys){
      if(key===orig[i])continue;
      const occupants=[...fixed,...indices.slice(0,n)].filter(j=>state[j]===key);
      if(occupants.some(j=>incompatible(i,j))||sets[i].size+occupants.reduce((s,j)=>s+sets[j].size,0)>26)continue;
      state[i]=key;assign(n+1);
     }
     state[i]=orig[i];
    }
    assign(0);return;
   }
   for(let i=start;i<groups.length;i++)choose(i+1,[...indices,i]);
  }
  choose(0,[]);levels.push({changedFamilies:k,compatibleFixedSubsets,assignments});
  if(assignments)break;
 }
 return {levels,solutions};
}
async function prepare(){
 fs.mkdirSync(WORK,{recursive:true});
 const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
 const native=data.tonedContractBenchmark.schemes.research[SOURCE];
 const raw=native.publication.source.layouts.find(e=>e.id===SOURCE);
 const initialMap=Object.fromEntries(HEADS.map(h=>[h,raw.firstKeys[{A:'zero-A',E:'zero-E',O:'zero-O',W:'zero-W',Y:'zero-Y',YU:'zero-Y'}[h]||h]]));
 const inputs={pinyin:data.pinyin,base:data.base,initialMap,entries:IDS.map(id=>data.entries.find(e=>e.id===id))};
 const enumeration=enumerateInitials(initialMap,data);
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',PROFILE);
 const reference=v52.evaluateUntoned(data.entries.find(e=>e.id==='S005'),REF,null,ctx).v52;
 const controls=[];
 for(const e of inputs.entries){const value=v52.evaluateUntoned(e,POLICY,BALANCE,ctx).v52;controls.push({id:e.id,score:normalize(value,reference),doubledScore:normalize(value,reference,2),modes:value});console.log(JSON.stringify(controls.at(-1)));}
 const entry=inputs.entries[0],modes=[];
 for(const mode of ['keytao','sanpin']){
  const rows=[...scorer.buildRows(entry,data,ctx.strokes,{word2:[],word3:[],word4:[]},mode),...Object.entries(POLICY[mode]).flatMap(([kind,order])=>ctx.buildRowsForOrder(entry,data,ctx.words,mode,entry.tone,kind,order,model))];
  modes.push(compileRows(rows,ctx.words,data,entry));console.log(JSON.stringify({compiled:mode,rows:rows.length}));
 }
 fs.writeFileSync(path.join(WORK,'templates.json'),JSON.stringify({version:'untoned-v52-2126-templates-1',keyAlphabet:ALPHABET,toneKeysByTone:'IEUAO',shapeKeysByMeaning:'AEUIO',toneDigitsByShapeMeaning:'42310',references:Object.values(reference).map(m=>['character','word2','word3','word4'].map(k=>m[k].effectiveMs)),referencesDoubled:Object.values(reference).map(m=>['character','word2','word3','word4'].map(k=>2*m[k].effectiveMs-m[k].motorUpperMs)),modes}));
 const files=['a7_CKT_R11.html','tools/score_ckt_v52.js','tools/ckt_block_error.js','tools/auxiliary_semantics.js','tools/ckt_v4_upstream_role_tables.json',__filename,'research/ckt-v4-core/src/bin/score-untoned-v52-2126-stream.rs',PROFILE,'D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml','D:/C2D/Documents/rime-snow-pinyin/scripts/research/evaluate_ckt_v4_word_aux_order.js','D:/C2D/Documents/rime-snow-pinyin/scripts/research/evaluate_ckt51_aux_order.js'];
 const contract={sourceId:SOURCE,sourceLayout:raw,inputs,enumeration,reference,controls,policies:POLICY,lengthBalance:BALANCE,sourceHashes:Object.fromEntries(files.map(p=>[p,fileHash(path.resolve(ROOT,p))]))};
 fs.writeFileSync(path.join(WORK,'contract.json'),JSON.stringify(contract));
 console.log(JSON.stringify({prepared:true,levels:enumeration.levels,solutions:enumeration.solutions.length}));
}
function launch(templateFile=path.join(WORK,'templates.json')){
 const child=spawn(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-2126-stream.exe'),[templateFile,path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),PROFILE],{stdio:['pipe','pipe','inherit'],windowsHide:true});
 let pending,readyResolve,readyReject;
 const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready)readyResolve(r);else{const p=pending;pending=null;p.resolve(r);}}catch(e){readyReject(e);pending?.reject(e);}});
 child.on('error',e=>{readyReject(e);pending?.reject(e);});child.on('exit',code=>{if(code){const e=Error('worker exited '+code);readyReject(e);pending?.reject(e);}});
 return {child,ready,score:e=>new Promise((resolve,reject)=>{if(pending)throw Error('worker busy');pending={resolve,reject};child.stdin.write(JSON.stringify({id:e.id,state:[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])].map(k=>ALPHABET.indexOf(k))})+'\n');})};
}
async function search(){
 const c=read(path.join(WORK,'contract.json'));
 for(const [p,h]of Object.entries(c.sourceHashes))if(fileHash(path.resolve(ROOT,p))!==h)throw Error('Changed source '+p);
const report=fs.existsSync(OUTPUT)?read(OUTPUT):{sourceId:SOURCE,sourceInitialMap:c.inputs.initialMap,sourceHashes:c.sourceHashes,contract:{capacity:[21,26],toneKeysByTone:'IEUAO',shapeKeysByMeaning:'AEUIO',toneDigitsByShapeMeaning:'42310',policies:POLICY,lengthBalance:BALANCE,cognitiveMultipliers:[1,2],referenceRepriced:true,branching:false,familyMetric:'A/E/O together; Y/YU together; each other head individually'},minimumEdits:c.enumeration.levels,controls:c.controls,records:[],stages:[]};
 const known=new Map(report.records.map(r=>[stateKey(r),r]));
 const save=()=>fs.writeFileSync(OUTPUT,JSON.stringify(report,null,2)+'\n');
 const worker=launch();await worker.ready;
 try{
  for(const e of c.inputs.entries){const actual=await worker.score(e),expected=c.controls.find(r=>r.id===e.id);for(const f of ['score','doubledScore'])if(Math.abs(actual[f]-expected[f])>1e-9)throw Error('JS/native mismatch '+e.id+' '+f+' '+actual[f]+' '+expected[f]);console.log(JSON.stringify({verified:e.id,score:actual.score,doubledScore:actual.doubledScore,seconds:actual.seconds}));}
  async function score(e){
   const key=stateKey(e);if(known.has(key))return known.get(key);
   const a=audit(e.initialMap,e.finalMap,c.inputs);if(a.unique!==399||a.reservedInitials.length||a.initialKeys>21)return null;
   const id='UTM4-'+digest(key).slice(0,12),v=await worker.score({...e,id});
   const r={id,initialMap:e.initialMap,finalMap:e.finalMap,changes:e.changes,origin:e.origin,parent:e.parent,audit:a,score:v.score,doubledScore:v.doubledScore,seconds:v.seconds,modes:v.modes};
   known.set(key,r);report.records.push(r);save();
   console.log(JSON.stringify({count:known.size,id,score:r.score,doubledScore:r.doubledScore,seconds:r.seconds}));return r;
  }
  for(const e of c.enumeration.solutions)for(const seed of c.inputs.entries)await score({...e,finalMap:seed.finalMap,origin:'transplant '+seed.id});
  report.stages.push({kind:'minimum-initials-two-final-seeds',layouts:c.enumeration.solutions.length,records:known.size});
  report.bestDefault=[...known.values()].sort((a,b)=>a.score-b.score).slice(0,10);
  report.bestDoubled=[...known.values()].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,10);save();
  if(process.argv.includes('--cross')){
   const seeds=new Map([...report.bestDefault.slice(0,2),...report.bestDoubled.slice(0,2)].map(e=>[FINALS.map(f=>e.finalMap[f]).join(''),e]));
   for(const e of c.enumeration.solutions)for(const seed of seeds.values())await score({...e,finalMap:seed.finalMap,origin:'cross-transplant optimized finals',parent:seed.id});
   const objective=r=>Math.max(r.score/Math.min(...c.controls.map(x=>x.score)),r.doubledScore/Math.min(...c.controls.map(x=>x.doubledScore)));
   report.bestJoint=[...known.values()].sort((a,b)=>objective(a)-objective(b)).slice(0,10);
   report.bestDefault=[...known.values()].sort((a,b)=>a.score-b.score).slice(0,10);report.bestDoubled=[...known.values()].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,10);
   report.preferredCandidate=[...known.values()].filter(e=>e.initialMap.s===c.inputs.initialMap.s).sort((a,b)=>objective(a)-objective(b))[0];save();
  }
  if(process.argv.includes('--refine')){
   const fixture=read(path.join(WORK,'templates.json'));
   fixture.modes=fixture.modes.map(rows=>{
    const selected=[];
    for(let kind=0;kind<4;kind++)selected.push(...rows.filter(r=>r[1]===kind).sort((a,b)=>a[0]-b[0]).slice(0,kind===0?6500:2500));
    selected.sort((a,b)=>a[0]-b[0]);selected.forEach((r,i)=>r[0]=i);return selected;
   });
   const proxyFile=path.join(WORK,'proxy-templates.json');fs.writeFileSync(proxyFile,JSON.stringify(fixture));
   const proxy=launch(proxyFile);await proxy.ready;
   const proxyCache=new Map(),threshold={score:Math.min(...c.controls.map(r=>r.score)),doubledScore:Math.min(...c.controls.map(r=>r.doubledScore))};
   const objective=r=>Math.max(r.score/threshold.score,r.doubledScore/threshold.doubledScore);
   const proxyScore=async e=>{const key=stateKey(e);if(!proxyCache.has(key))proxyCache.set(key,await proxy.score({...e,id:'proxy'}));return proxyCache.get(key);};
   function neighbors(e){
    const out=new Map(),groups=Object.groupBy(FINALS,f=>e.finalMap[f]);
    const add=(map,label)=>{const row={...e,finalMap:map,origin:label,parent:e.id},key=stateKey(row);if(!known.has(key)&&audit(row.initialMap,map,c.inputs).unique===399)out.set(key,row);};
    for(let i=0;i<35;i++)for(let j=i+1;j<35;j++){const a=FINALS[i],b=FINALS[j],ka=e.finalMap[a],kb=e.finalMap[b];if(ka!==kb)add({...e.finalMap,[a]:kb,[b]:ka},`final token swap ${a}/${b}`);}
    const gs=Object.entries(groups);
    for(let i=0;i<gs.length;i++)for(let j=i+1;j<gs.length;j++){const [ka,as]=gs[i],[kb,bs]=gs[j],map={...e.finalMap};as.forEach(f=>map[f]=kb);bs.forEach(f=>map[f]=ka);add(map,`final key groups ${ka}/${kb}`);}
    for(const f of FINALS)for(const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')if(k!==e.finalMap[f])add({...e.finalMap,[f]:k},`final move ${f} to ${k}`);
    return [...out.values()];
   }
   try{
    const rounds=Number(process.argv.find(a=>a.startsWith('--rounds='))?.split('=')[1]||12);
    const done=new Set(report.stages.filter(s=>s.kind==='proxy-screened-finals').map(s=>s.center));
    for(let round=0;round<rounds;round++){
     const candidates=[...known.values()].sort((a,b)=>objective(a)-objective(b));
     const center=candidates.find(e=>!done.has(e.id)&&(!process.argv.includes('--prefer-ch')||e.initialMap.s===c.inputs.initialMap.s));if(!center)break;
     const anchor=await proxyScore(center),pool=neighbors(center),ranked=[];
     for(let i=0;i<pool.length;i++){
      const e=pool[i],s=await proxyScore(e);
      ranked.push({...e,forecast1:center.score+s.score-anchor.score,forecast2:center.doubledScore+s.doubledScore-anchor.doubledScore});
      if(i%150===0)console.log(JSON.stringify({round,proxy:i,total:pool.length,center:center.id}));
     }
     const picked=new Map();
     for(const order of [r=>Math.max(r.forecast1/threshold.score,r.forecast2/threshold.doubledScore),r=>r.forecast1,r=>r.forecast2])for(const r of [...ranked].sort((a,b)=>order(a)-order(b)).slice(0,12))picked.set(stateKey(r),r);
     for(const e of picked.values())await score(e);
     done.add(center.id);report.stages.push({kind:'proxy-screened-finals',center:center.id,legalNeighbors:pool.length,exactScored:picked.size,proxyRows:fixture.modes.map(m=>m.length)});
     report.bestDefault=[...known.values()].sort((a,b)=>a.score-b.score).slice(0,10);report.bestDoubled=[...known.values()].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,10);
     report.bestJoint=[...known.values()].sort((a,b)=>objective(a)-objective(b)).slice(0,10);save();
     report.preferredCandidate=[...known.values()].filter(e=>e.initialMap.s===c.inputs.initialMap.s).sort((a,b)=>objective(a)-objective(b))[0];save();
     console.log(JSON.stringify({roundComplete:round,best:report.bestJoint[0].id,score:report.bestJoint[0].score,doubledScore:report.bestJoint[0].doubledScore,objective:objective(report.bestJoint[0])}));
     if(objective(report.bestJoint[0])<.999&&round>=3)break;
    }
   }finally{proxy.child.stdin.end();}
  }
 }finally{worker.child.stdin.end();}
}
async function verify(){
 const c=read(path.join(WORK,'contract.json')),report=read(OUTPUT);
 const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',PROFILE);
 const {auxiliarySemantics}=require('./auxiliary_semantics');
 const semantics=auxiliarySemantics('IEUAO');
 if(semantics.shapeKeysByMeaning!=='AEUIO'||semantics.toneDigitsByShapeMeaning!=='42310')throw Error('Auxiliary semantic mismatch');
 const targets=new Map();
 for(const e of [report.bestJoint?.[0],report.bestDefault?.[0],report.bestDoubled?.[0],report.preferredCandidate].filter(Boolean))targets.set(e.id,e);
 const worker=launch();await worker.ready;const verification=[];
 try{
  for(const e of targets.values()){
   const entry=rebuild({...c.inputs.entries[0],...e},data),a=audit(entry.initialMap,entry.finalMap,data);
   if(a.unique!==399||a.reservedInitials.length||a.initialKeys>21)throw Error('Candidate is not legal');
   const js=v52.evaluateUntoned(entry,POLICY,BALANCE,ctx).v52,native=await worker.score(entry);
   let maximumTrackDifference=0;
   for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])for(const [field,value]of Object.entries(js[mode][kind]))if(typeof value==='number'){
    const difference=Math.abs(value-native.modes[mode][kind][field]);
    maximumTrackDifference=Math.max(maximumTrackDifference,difference);
    if(!Number.isFinite(difference)||difference>1e-7)throw Error('JS/native track mismatch '+e.id+'/'+mode+'/'+kind+'/'+field);
   }
   const score=normalize(js,c.reference),doubledScore=normalize(js,c.reference,2);
   if(Math.abs(score-e.score)>1e-9||Math.abs(doubledScore-e.doubledScore)>1e-9)throw Error('JS/native score mismatch');
   verification.push({id:e.id,score,doubledScore,audit:a,maximumTrackDifference,modes:js});
   console.log(JSON.stringify({verified:e.id,score,doubledScore,maximumTrackDifference}));
  }
 }finally{worker.child.stdin.end();}
 const commonPinyin=data.base.map(([p])=>data.pinyin[p]);
 report.commonPinyin=commonPinyin;
 report.sourceHashes=c.sourceHashes;
 report.searchSourceSha256=fileHash(__filename);
 fs.writeFileSync(OUTPUT,JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(OUTPUT.replace(/\.json$/,'-verification.json'),JSON.stringify({sourceId:SOURCE,searchSourceSha256:report.searchSourceSha256,sourceHashes:c.sourceHashes,auxiliarySemantics:semantics,commonPinyin,verification},null,2)+'\n');
}
if(require.main===module)(process.argv.includes('--prepare')?prepare():process.argv.includes('--verify')?verify():search()).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={enumerateInitials,audit,normalize,stateKey,launch,compileRows,WORK,OUTPUT,POLICY,REF,BALANCE};
