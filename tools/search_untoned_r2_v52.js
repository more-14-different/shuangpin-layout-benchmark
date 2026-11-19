'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),readline=require('node:readline'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model');
 const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const {rebuild,audit,ergonomics}=require('./untoned_r2_search_metrics');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const CACHE=path.resolve(ROOT,process.env.R2_V52_CACHE||'research/.cache/r2-fixed-v52'),OUTPUT=path.join(ROOT,'research/notes/2026-11-20-untoned-r2-onsets-v52-search.json');
const letter=i=>String.fromCharCode(65+i),key=s=>Buffer.from(s).toString('base64');
function operations(){
 const out=[];
 for(let a=27;a<62;a++)for(let b=a+1;b<62;b++)out.push({kind:'swap',a,b,label:`${FINALS[a-27]}↔${FINALS[b-27]}`});
 for(let a=27;a<62;a++)for(let b=0;b<26;b++)out.push({kind:'move',a,b,label:`${FINALS[a-27]}→${letter(b)}`});
 for(let a=0;a<26;a++)for(let b=0;b<26;b++)if(a!==b)out.push({kind:'group-move',a,b,label:`${letter(a)}组→${letter(b)}`});
 for(let a=0;a<26;a++)for(let b=a+1;b<26;b++)out.push({kind:'group-swap',a,b,label:`${letter(a)}组↔${letter(b)}组`});
 return out;
}
function apply(s,o){const t=s.slice();if(o.kind==='swap')[t[o.a],t[o.b]]=[t[o.b],t[o.a]];else if(o.kind==='move')t[o.a]=o.b;else for(let i=27;i<62;i++)if(s[i]===o.a)t[i]=o.b;else if(o.kind==='group-swap'&&s[i]===o.b)t[i]=o.a;return t;}
async function main(){
 fs.mkdirSync(CACHE,{recursive:true});
 const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html')),feas=read(path.join(ROOT,'research/notes/2026-11-20-untoned-r2-onsets-v52-feasibility.json'));
 const template=data.entries.find(e=>e.id==='RC26-39a5bfdc045342cd'),fixed=HEADS.map(h=>feas.initialMap[h].charCodeAt(0)-65);
 const inputFiles=['research/.cache/untoned-r2-v52-templates.json','tools/ckt_v4_upstream_role_tables.json','research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json','research/ckt-v4-core/target/release/score-untoned-r2-v52-stream.exe'];
 const inputHashes=Object.fromEntries(inputFiles.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex')]));
 const manifest={sourceId:feas.sourceId,initialMap:feas.initialMap,inputHashes},manifestFile=path.join(CACHE,'manifest.json');
 if(fs.existsSync(manifestFile))assert.deepEqual(read(manifestFile),manifest,'frozen score inputs changed; use a fresh cache directory');
 else {assert.ok(!fs.existsSync(path.join(CACHE,'scores.jsonl')),'existing score cache has no input manifest; use a fresh R2_V52_CACHE');fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');}
 const fixture=read(path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json')),snapshot=read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'));
 const motor=model.upstreamMotor(snapshot);
 function entry(s){assert.deepEqual(s.slice(0,27),fixed);return rebuild({...template,initialMap:{...feas.initialMap},finalMap:Object.fromEntries(FINALS.map((f,i)=>[f,letter(s[27+i])]))},data);}
 function prepare(s){const e=entry(s),a=audit(e,data);if(!a.valid||a.M>40||a.D>3||a.V>1||a.branches||a.qz||a.zq)return null;return {state:s,key:key(s),audit:a};}
 const known=new Map();const log=path.join(CACHE,'scores.jsonl');
 if(fs.existsSync(log))for(const line of fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean)){const r=JSON.parse(line);known.set(r.key,r);}
 function launch(){
 const child=cp.spawn(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-r2-v52-stream.exe'),[path.join(ROOT,'research/.cache/untoned-r2-v52-templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')],{windowsHide:true,stdio:['pipe','pipe','inherit']});
 let pending,readyResolve,readyReject;const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j});
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const v=JSON.parse(line);if(v.ready)readyResolve(v);else {assert.ok(pending);const p=pending;pending=null;p.resolve(v)}}catch(e){readyReject(e);pending?.reject(e)}});
 child.on('error',e=>{readyReject(e);pending?.reject(e)});child.on('exit',code=>{if(code){const e=Error(`worker exit ${code}`);readyReject(e);pending?.reject(e)}});
 return {child,ready,native:s=>new Promise((resolve,reject)=>{assert.ok(!pending);pending={resolve,reject};child.stdin.write(JSON.stringify({id:key(s),state:s})+'\n')})};
 }
 const workers=Array.from({length:4},launch);await Promise.all(workers.map(w=>w.ready));
 const native=s=>workers[0].native(s);
 // Frozen A/C parity validates symbolic stages, competition, all cognitive
 // terms and the independent Rust v5.2 terminal repricing before searching.
 for(const baseline of feas.baselines){const e=data.entries.find(e=>e.id===baseline.id),s=[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])].map(k=>k.charCodeAt(0)-65),r=await native(s);for(const [m,f] of [[1,'score'],[2,'score2']])assert.ok(Math.abs(r[f]-baseline.v52[m])<1e-9,`${baseline.id}: ${r[f]}`);console.log(JSON.stringify({parity:baseline.id,score:r.score,score2:r.score2,seconds:r.seconds}));}
 let calls=0;
 async function score(p,origin,worker=workers[0]){if(known.has(p.key))return known.get(p.key);const r=await worker.native(p.state),e=entry(p.state);const erg=ergonomics(e,data,fixture,motor);const strict=erg.mx>=142.3218631169652-1e-12&&erg.homeS2>=.4391204207421518-1e-12&&erg.homeFloor>=.31284320948242345-1e-12;const row={...p,origin,score:r.score,score2:r.score2,erg,strictComfort:strict,modes:r.modes,seconds:r.seconds};known.set(p.key,row);fs.appendFileSync(log,JSON.stringify(row)+'\n');if(++calls%25===0)console.log(JSON.stringify({calls,known:known.size,best:Math.min(...[...known.values()].map(x=>x.score)),best2:Math.min(...[...known.values()].map(x=>x.score2))}));return row;}
 const seeds=new Map(),repairPool=new Map();
 function keep(s,origin){const p=prepare(s);if(p&&!repairPool.has(p.key))repairPool.set(p.key,{...p,origin});}
 function add(s,origin){
 const bad=[...new Set(data.base.filter(([p])=>{const [h,f]=splitPinyin(data.pinyin[p]);return (s[h]===16&&s[27+f]===25)||(s[h]===25&&s[27+f]===16)}).map(([p])=>27+splitPinyin(data.pinyin[p])[1]))];
 if(!bad.length){keep(s,origin);return;}
 // A/C and historical finals often become QZ after restoring q→Q. Repair
 // the offending rhyme first, instead of discarding those useful basins.
 if(bad.length>2)return;
 const walk=(t,i)=>{if(i===bad.length){keep(t,origin+':double-empty-repair');return;}for(let k=0;k<26;k++)if(k!==s[bad[i]]){const u=t.slice();u[bad[i]]=k;walk(u,i+1)}};walk(s,0);
 }
 for(const e of data.entries.filter(e=>e.capacity?.[1]===26&&e.tone==='IEUAO'&&e.finalMap&&FINALS.every(f=>/^[A-Z]$/.test(e.finalMap[f]||''))))add([...fixed,...FINALS.map(f=>e.finalMap[f].charCodeAt(0)-65)],e.id);
 const archive=process.argv[2]||path.join(ROOT,'research/config/untoned-r2-v52-historical-finals.json');if(archive)for(const r of read(archive).results){const s=[...Buffer.from(r.key,'base64')].slice(0,62);add([...fixed,...s.slice(27)],r.id);}
 const pool=[...repairPool.values()].map(p=>{const e=entry(p.state);return {...p,erg:ergonomics(e,data,fixture,motor)}});
 const take=(rows,n)=>rows.slice(0,n).forEach(p=>seeds.set(p.key,p));
 take(pool.filter(p=>/RC26-39a5bfdc045342cd|RC26-eeb7b9a25a90cadd/.test(p.origin)),1000);
 take([...pool].sort((a,b)=>a.erg.motor-b.erg.motor),64);
 take([...pool].sort((a,b)=>b.erg.mx-a.erg.mx),16);
 take([...pool].sort((a,b)=>b.erg.homeFloor-a.erg.homeFloor),16);
 console.log(JSON.stringify({legalHistoricalRepairPool:pool.length,selectedHistoricalSeeds:seeds.size}));
 async function batch(rows,origin){for(let i=0;i<rows.length;i+=workers.length)await Promise.all(rows.slice(i,i+workers.length).map((p,j)=>score(p,typeof origin==='function'?origin(p):origin,workers[j])));}
 await batch([...seeds.values()],p=>`historical-final-map:${p.origin}`);
 const phases=[];const ops=operations(),expanded=new Set();
 function top(field,strict=false){return [...known.values()].filter(r=>!strict||r.strictComfort).sort((a,b)=>a[field]-b[field])[0];}
 function save(completed=false){const sorted=field=>[...known.values()].sort((a,b)=>a[field]-b[field]);const selected=new Map([...sorted('score').slice(0,12),...sorted('score2').slice(0,12),...sorted('score').filter(r=>r.strictComfort).slice(0,12)].map(r=>[r.key,r]));fs.writeFileSync(OUTPUT,JSON.stringify({version:1,sourceId:feas.sourceId,sourceName:feas.sourceName,initialMap:feas.initialMap,contract:{mainCollisionsAllowed:true,M:40,D:3,V:1,branches:0,common399DoubleEmpty:true,toneKeysByTone:'IEUAO',shapeKeysByMeaning:'AEUIO',cognitiveMultipliers:[1,2],policies:{keytao:{word2:'12',word3:'12',word4:'24'},sanpin:{word2:'12',word3:'21',word4:'13'}},policyOptimized:false},historicalRepairPool:pool.length,historicalSeeds:seeds.size,seedSelection:'all A/C double-empty repairs plus top64 two-key motor/top16 moving-hand/top16 minimum-home',exactlyScored:known.size,phases,completed,baselines:feas.baselines.map(({modesV52,...r})=>r),best1:top('score')?.key,best2:top('score2')?.key,bestComfort1:top('score',true)?.key,bestComfort2:top('score2',true)?.key,finalists:[...selected.values()].map(r=>({...r,initialMap:feas.initialMap,finalMap:entry(r.state).finalMap}))},null,2)+'\n');}
 save();
 try{for(let round=0;round<3;round++){
 const centers=[...new Map([top('score'),top('score2'),top('score',true),top('score2',true)].filter(Boolean).map(r=>[r.key,r])).values()].filter(r=>!expanded.has(r.key));if(!centers.length)break;
 for(const center of centers){expanded.add(center.key);const neighbors=new Map();for(const o of ops){const p=prepare(apply(center.state,o));if(p&&!known.has(p.key))neighbors.set(p.key,{...p,mutation:o.label});}
 console.log(JSON.stringify({round:round+1,center:center.key,score:center.score,score2:center.score2,neighbors:neighbors.size}));
 await batch([...neighbors.values()],p=>`round${round+1}:${center.key}:${p.mutation}`);
 phases.push({round:round+1,center:center.key,centerScore:center.score,centerScore2:center.score2,newScored:neighbors.size});save();
 }
 }save(true);}finally{for(const w of workers)w.child.stdin.end();}
 console.log(JSON.stringify({done:known.size,best:top('score')?.score,best2:top('score2')?.score2,output:OUTPUT}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1)});
module.exports={operations,apply};
