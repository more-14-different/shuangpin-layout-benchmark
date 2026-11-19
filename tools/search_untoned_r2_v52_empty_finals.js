'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture');
const {rebuild,audit,ergonomics}=require('./untoned_r2_search_metrics');
const {operations,apply}=require('./search_untoned_r2_v52');
const {launch}=require('./untoned_r2_native_worker');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const CASES=[{name:'empty-Q-only',forbidden:[16],actualRhymeKeys:25},{name:'empty-QZ',forbidden:[16,25],actualRhymeKeys:24}];
const PREFIX='2026-11-20-untoned-r2-empty-finals-v52';
function matches(state,c){const keys=new Set(state.slice(27));return keys.size===c.actualRhymeKeys&&c.forbidden.every(k=>!keys.has(k));}
function repairSeeds(state,c){
 const cleared=[state.slice()];
 for(const k of c.forbidden){const before=cleared.splice(0);for(const s of before){const indices=Array.from({length:35},(_,i)=>27+i).filter(i=>s[i]===k);if(!indices.length){cleared.push(s);continue;}
  // Repair shared rhyme tokens independently when the group is small; this
  // includes splitting ing/uai formerly sharing Q without moving the onsets.
  if(indices.length<=2){const visit=(t,i)=>{if(i===indices.length){cleared.push(t);return;}for(let to=0;to<26;to++)if(!c.forbidden.includes(to)){const n=t.slice();n[indices[i]]=to;visit(n,i+1)}};visit(s,0);}
  else for(let to=0;to<26;to++)if(!c.forbidden.includes(to)){const t=s.slice();indices.forEach(i=>t[i]=to);cleared.push(t);}
 }}
 const out=new Map();for(const s of cleared){const add=t=>{if(matches(t,c))out.set(Buffer.from(t).toString('base64'),t);};add(s);
  const present=new Set(s.slice(27)),missing=Array.from({length:26},(_,i)=>i).filter(i=>!c.forbidden.includes(i)&&!present.has(i));
  if(missing.length===1)for(let i=27;i<62;i++){const t=s.slice();t[i]=missing[0];add(t);}
 }
 return [...out.values()];
}
async function main(){
 const cache=path.join(ROOT,'research/.cache/r2-empty-finals-v52');fs.mkdirSync(cache,{recursive:true});
 const source=path.join(ROOT,'research/notes/2026-11-20-untoned-r2-onsets-v52-scores.jsonl.gz'),sourceRaw=zlib.gunzipSync(fs.readFileSync(source)).toString('utf8');
 const base=read(path.join(ROOT,'research/notes/2026-11-20-untoned-r2-onsets-v52-search.json'));
 const manifest=read(path.join(ROOT,'research/.cache/r2-fixed-v52/manifest.json'));
 for(const [file,hash] of Object.entries(manifest.inputHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex'),hash,`changed score input ${file}`);
 const known=new Map(sourceRaw.trim().split('\n').map(s=>{const r=JSON.parse(s);return [r.key,r]})),priorCount=known.size;
 const log=path.join(cache,'scores.jsonl');if(fs.existsSync(log))for(const line of fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean)){const r=JSON.parse(line);known.set(r.key,r);}
 const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html')),template=data.entries.find(e=>e.id==='RC26-39a5bfdc045342cd'),fixture=read(path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json')),motor=model.upstreamMotor(read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const first=HEADS.map(h=>base.initialMap[h].charCodeAt(0)-65);
 const entry=s=>rebuild({...template,initialMap:base.initialMap,finalMap:Object.fromEntries(FINALS.map((f,i)=>[f,String.fromCharCode(65+s[27+i])]))},data);
 function prepare(s,c){assert.deepEqual(s.slice(0,27),first);if(!matches(s,c))return null;const a=audit(entry(s),data);if(!a.valid||a.M>40||a.D>3||a.V>1||a.branches||a.qz||a.zq)return null;return {state:s,key:Buffer.from(s).toString('base64'),audit:a};}
 const sorted=(field,c)=>[...known.values()].filter(r=>!c||matches(r.state,c)).sort((a,b)=>a[field]-b[field]);
 let report={version:1,sourceId:base.sourceId,sourceName:base.sourceName,initialMap:base.initialMap,contract:base.contract,baselines:base.baselines,categories:[],phases:[],priorScored:priorCount,sourceArchive:{path:path.relative(ROOT,source),sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')},scoreInputHashes:manifest.inputHashes,completed:false};
 const output=path.join(ROOT,`research/notes/${PREFIX}-search.json`);
 if(fs.existsSync(output)){const previous=read(output);assert.deepEqual(previous.scoreInputHashes,report.scoreInputHashes);assert.deepEqual(previous.initialMap,report.initialMap);assert.deepEqual(previous.sourceArchive,report.sourceArchive);report=previous;}
 function save(completed=false){report.completed=completed;report.exactlyScored=known.size;report.newExactlyScored=known.size-priorCount;const finalists=new Map();for(const c of CASES){const rows=sorted('score',c),rows2=sorted('score2',c);const prior=report.categories.find(x=>x.name===c.name)||{};Object.assign(prior,{...c,eligibleScored:rows.length,best1:rows[0]?.key,best2:rows2[0]?.key,comfortableScored:rows.filter(r=>r.strictComfort).length});if(!report.categories.includes(prior))report.categories.push(prior);for(const r of [...rows.slice(0,4),...rows2.slice(0,4)])finalists.set(r.key,{...r,actualRhymeKeys:new Set(r.state.slice(27)).size,initialMap:base.initialMap,finalMap:entry(r.state).finalMap});}report.finalists=[...finalists.values()];fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
 const workerCount=Number(process.env.R2_EMPTY_FINAL_WORKERS||8);assert.ok(Number.isInteger(workerCount)&&workerCount>=1&&workerCount<=12);
 const workers=Array.from({length:workerCount},()=>launch(ROOT));await Promise.all(workers.map(w=>w.ready));let calls=0;
 async function batch(rows,origin){for(let i=0;i<rows.length;i+=workers.length){await Promise.all(rows.slice(i,i+workers.length).map(async(p,j)=>{if(known.has(p.key))return;const result=await workers[j].score({id:p.key,state:p.state}),erg=p.erg||ergonomics(entry(p.state),data,fixture,motor),strictComfort=erg.mx>=142.3218631169652-1e-12&&erg.homeS2>=.4391204207421518-1e-12&&erg.homeFloor>=.31284320948242345-1e-12;const row={...p,origin,score:result.score,score2:result.score2,modes:result.modes,seconds:result.seconds,erg,strictComfort};known.set(p.key,row);fs.appendFileSync(log,JSON.stringify(row)+'\n');calls++;}));if(calls&&calls%100<workers.length){console.log(JSON.stringify({calls,categories:CASES.map(c=>({name:c.name,best1:sorted('score',c)[0]?.score,best2:sorted('score2',c)[0]?.score2}))}));save();}}}
 try{
 if(!report.seedPreparationComplete)for(const c of CASES){
  const parents=[...new Map([sorted('score')[0],sorted('score2')[0],sorted('score',c)[0],sorted('score2',c)[0]].filter(Boolean).map(r=>[r.key,r])).values()],pool=new Map();
  for(const parent of parents)for(const s of repairSeeds(parent.state,c)){const p=prepare(s,c);if(p&&!known.has(p.key)&&!pool.has(p.key))pool.set(p.key,{...p,erg:ergonomics(entry(s),data,fixture,motor)});}
  const selected=new Map(),take=(rs,n)=>rs.slice(0,n).forEach(p=>selected.set(p.key,p));take([...pool.values()].sort((a,b)=>a.erg.motor-b.erg.motor),48);take([...pool.values()].sort((a,b)=>b.erg.mx-a.erg.mx),8);take([...pool.values()].sort((a,b)=>b.erg.homeFloor-a.erg.homeFloor),8);
  const category=report.categories.find(x=>x.name===c.name)||{};Object.assign(category,{...c,repairPool:pool.size,selectedRepairSeeds:selected.size});if(!report.categories.includes(category))report.categories.push(category);console.log(JSON.stringify({category:c.name,repairPool:pool.size,selectedRepairSeeds:selected.size}));await batch([...selected.values()],`empty-final-repair:${c.name}`);save();
 }
 report.seedPreparationComplete=true;save();
 const ops=operations(),expanded=new Set(report.phases.map(p=>p.center));
 async function scan(c,center,round){
   const pool=new Map();for(const op of ops){const p=prepare(apply(center.state,op),c);if(p&&!known.has(p.key))pool.set(p.key,p);}
   report.pendingPhase={round,category:c.name,center:center.key};save();
   console.log(JSON.stringify({round,category:c.name,centerScore:center.score,centerScore2:center.score2,newEndpoints:pool.size,workers:workerCount}));
   await batch([...pool.values()],`empty-final-one-hop:${c.name}:round${round}:${center.key}`);
   expanded.add(center.key);report.phases.push({round,category:c.name,center:center.key,centerScore:center.score,centerScore2:center.score2,newScored:pool.size});delete report.pendingPhase;save();
 }
 if(report.pendingPhase){const p=report.pendingPhase;await scan(CASES.find(c=>c.name===p.category),known.get(p.center),p.round);}
 for(let round=1;round<=2;round++)for(const c of CASES){
  if(report.phases.filter(p=>p.round===round&&p.category===c.name).length>=2)continue;
  const centers=[...new Map([sorted('score',c)[0],sorted('score2',c)[0]].filter(Boolean).map(r=>[r.key,r])).values()].filter(r=>!expanded.has(r.key));
  for(const center of centers)await scan(c,center,round);
 }
 report.scope='Exact 25 final-key usage with Q absent, versus exact 24 usage with Q and Z absent; repaired seeds plus two rounds of full legal one-hop scans at each listed center; no global optimality claim';
 for(const c of report.categories)c.oneHopStationary={multiplier1:expanded.has(c.best1),multiplier2:expanded.has(c.best2)};
 if(fs.existsSync(log)){const raw=fs.readFileSync(log),target=path.join(ROOT,`research/notes/${PREFIX}-scores.jsonl.gz`);fs.writeFileSync(target,zlib.gzipSync(raw,{level:9}));report.newScoreArchive={path:path.relative(ROOT,target),sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')};}
 save(true);console.log(JSON.stringify({completed:true,newScored:report.newExactlyScored,categories:report.categories}));
 }finally{workers.forEach(w=>w.close());}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1)});
module.exports={matches,repairSeeds,CASES};
