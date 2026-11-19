'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model'),{HEADS,FINALS}=require('./ckt_v4_scheme_fixture');
const {audit,rebuild,ergonomics}=require('./untoned_r2_search_metrics'),{operations,apply}=require('./search_untoned_r2_v52'),{launch}=require('./untoned_r2_native_worker');
const ROOT=path.resolve(__dirname,'..'),PREFIX='2026-11-20-untoned-r2-restored399-v52',read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
function changes(s,initialMap){const a=HEADS.map(h=>initialMap[h].charCodeAt(0)-65);return {entries:s.slice(0,27).filter((k,i)=>k!==a[i]).length,families:[...Array(21).keys(),24,25].filter(i=>s[i]!==a[i]).length+Number([21,22,23].some(i=>s[i]!==a[i]))};}
async function main(){
 const cache=path.join(ROOT,'research/.cache/r2-restore399-v52');fs.mkdirSync(cache,{recursive:true});const log=path.join(cache,'scores.jsonl'),output=path.join(ROOT,`research/notes/${PREFIX}-search.json`);
 const source=read('research/notes/2026-11-20-untoned-r2-onsets-v52-search.json'),construction=read('research/notes/2026-11-20-untoned-r2-399-rhyme-constructions.json');
 const manifest=read('research/.cache/r2-fixed-v52/manifest.json');for(const [p,h] of Object.entries(manifest.inputHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex'),h);
 const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html')),template=data.entries.find(e=>e.id==='RC26-39a5bfdc045342cd'),fixture=read('research/.cache/ckt-v4-ergonomics.json'),motor=model.upstreamMotor(read('tools/ckt_v4_upstream_role_tables.json'));
 function entry(s){return rebuild({...template,initialMap:Object.fromEntries(HEADS.map((h,i)=>[h,String.fromCharCode(65+s[i])])),finalMap:Object.fromEntries(FINALS.map((f,i)=>[f,String.fromCharCode(65+s[27+i])]))},data);}
 function prepare(s){const c=changes(s,source.initialMap);if(c.families!==4||c.entries!==6||new Set(s.slice(27)).size!==26)return null;const a=audit(entry(s),data);if(!a.valid||a.unique!==399||a.qz||a.zq||a.M>40||a.D>3||a.V>1||a.branches)return null;return {state:s,key:Buffer.from(s).toString('base64'),audit:a,onsetChanges:c};}
 const known=new Map();if(fs.existsSync(log))for(const line of fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean)){const r=JSON.parse(line);known.set(r.key,r);}
 let report={version:1,sourceId:source.sourceId,sourceName:source.sourceName,initialMap:source.initialMap,contract:{...source.contract,mainCollisionsAllowed:false,minOnsetRuleChanges:4,minOnsetEntryChanges:6,minimumFinalKeys:26,fixedOriginalR2:false},baselines:source.baselines,categories:[{name:'restored399-full26'}],phases:[],infeasibleCategories:[{name:'empty-Z',actualRhymeKeys:25},{name:'empty-Q',actualRhymeKeys:25},{name:'empty-QZ',actualRhymeKeys:24}],certificate:'research/notes/2026-11-20-untoned-399-minimum26-certificate.json',scoreInputHashes:manifest.inputHashes};
 if(fs.existsSync(output)){const previous=read(path.relative(ROOT,output));assert.deepEqual(previous.scoreInputHashes,manifest.inputHashes,'frozen score inputs changed');assert.deepEqual(previous.initialMap,source.initialMap);report=previous;}
 const sorted=field=>[...known.values()].sort((a,b)=>a[field]-b[field]);
 function save(completed=false){report.completed=completed;report.exactlyScored=known.size;const c=report.categories[0];c.best1=sorted('score')[0]?.key;c.best2=sorted('score2')[0]?.key;c.comfortableScored=[...known.values()].filter(r=>r.strictComfort).length;const selected=new Map([...sorted('score').slice(0,8),...sorted('score2').slice(0,8)].map(r=>[r.key,r]));report.finalists=[...selected.values()].map(r=>({...r,initialMap:entry(r.state).initialMap,finalMap:entry(r.state).finalMap}));fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
 const workers=Array.from({length:8},()=>launch(ROOT));await Promise.all(workers.map(w=>w.ready));let calls=0;
 async function batch(pool,origin){const rows=[...pool.values()];for(let i=0;i<rows.length;i+=workers.length){await Promise.all(rows.slice(i,i+workers.length).map(async(p,j)=>{if(known.has(p.key))return;const r=await workers[j].score({id:p.key,state:p.state}),erg=ergonomics(entry(p.state),data,fixture,motor),strictComfort=erg.mx>=142.3218631169652-1e-12&&erg.homeS2>=.4391204207421518-1e-12&&erg.homeFloor>=.31284320948242345-1e-12;const row={...p,score:r.score,score2:r.score2,modes:r.modes,seconds:r.seconds,erg,strictComfort,origin};known.set(p.key,row);fs.appendFileSync(log,JSON.stringify(row)+'\n');calls++;}));if(calls>0&&calls%100<workers.length){console.log(JSON.stringify({calls,best1:sorted('score')[0]?.score,best2:sorted('score2')[0]?.score2}));save();}}}
 try{const seeds=new Map(),allSeeds=[...construction.candidates];
 const extra='research/notes/2026-11-20-untoned-r2-399-diverse-constructions.json';if(fs.existsSync(path.join(ROOT,extra))){const diverse=read(extra);allSeeds.push(...diverse.candidates);report.diverseSeedSource=extra;}
 for(const r of allSeeds){const p=prepare(r.state);if(p)seeds.set(p.key,p);}report.constructedSeeds=seeds.size;console.log(JSON.stringify({seeds:seeds.size,cached:known.size}));await batch(seeds,'MILP onset-minimal 399-unique construction');save();
 const expanded=new Set(report.phases.map(p=>p.center)),ops=operations();
 const budget=Number(process.env.R2_RESTORE399_SCAN_BUDGET??12);assert.ok(Number.isInteger(budget)&&budget>=0);
 function centers(){
  const top=[sorted('score')[0],sorted('score2')[0]],perHead=new Map();
  for(const r of sorted('score')){const head=Buffer.from(r.state.slice(0,27)).toString('base64');if(!perHead.has(head))perHead.set(head,r);}
  const bestNewHead=[...perHead.values()].find(r=>![...expanded].some(key=>known.get(key).state.slice(0,27).every((k,i)=>r.state[i]===k)));
  return [...new Map([...top,...(process.env.R2_RESTORE399_ONLY_CHAMPIONS==='1'?[]:[bestNewHead])].filter(Boolean).map(r=>[r.key,r])).values()].filter(r=>!expanded.has(r.key));
 }
 async function scanCenter(center){
  const pool=new Map();for(const op of ops){const p=prepare(apply(center.state,op));if(p&&!known.has(p.key))pool.set(p.key,p);}
  report.pendingCenter=center.key;save();const round=report.phases.length+1;console.log(JSON.stringify({round,center:center.key,score:center.score,score2:center.score2,newEndpoints:pool.size}));await batch(pool,`399-unique-final-only-round${round}:${center.key}`);expanded.add(center.key);report.phases.push({round,center:center.key,newScored:pool.size,centerScore:center.score,centerScore2:center.score2});delete report.pendingCenter;save();
 }
 if(report.pendingCenter&&!expanded.has(report.pendingCenter))await scanCenter(known.get(report.pendingCenter));
 for(let scan=0;scan<budget;scan++){
  const available=centers();if(!available.length)break;const center=available[scan%3===2?available.length-1:0];
  await scanCenter(center);
 }
 report.scope='Resumed multicenter rhyme-only descent at minimum 4 changed onset rule families and 6 entries; exact legal one-hop scans at listed centers, with additional MILP constructed basins where available; not global CKT optimality';
 if(report.twoHopScreens?.length)report.scope+='; two-operation endpoint legality enumeration and screened full-CKT scoring at listed two-hop centers';
 report.oneHopStationary={multiplier1:expanded.has(sorted('score')[0].key),multiplier2:expanded.has(sorted('score2')[0].key)};
 const target=path.join(ROOT,`research/notes/${PREFIX}-scores.jsonl.gz`);fs.writeFileSync(target,zlib.gzipSync(fs.readFileSync(log),{level:9}));report.scoreArchive={path:path.relative(ROOT,target),sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')};save(true);console.log(JSON.stringify({completed:true,scored:known.size,best1:sorted('score')[0].score,best2:sorted('score2')[0].score2}));
 }finally{workers.forEach(w=>w.close());}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1)});
module.exports={changes};
