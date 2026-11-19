'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture');
const {operations}=require('./search_untoned_r2_v52'),{launch}=require('./untoned_r2_native_worker');
const {audit,rebuild,ergonomics}=require('./untoned_r2_search_metrics');
const model=require('./ckt_v4_model'),{loadLayoutInputs}=require('./untoned_r2_search_inputs');
const ROOT=path.resolve(__dirname,'..'),PREFIX='2026-11-20-untoned-r2-restored399-v52',read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const identity=FINALS.map(f=>f.length===1?f.toUpperCase().charCodeAt(0)-65:-1);
function applyFinals(src,out,op){
 out.set(src);
 if(op.kind==='swap'){out[op.a-27]=src[op.b-27];out[op.b-27]=src[op.a-27];}
 else if(op.kind==='move')out[op.a-27]=op.b;
 else for(let i=0;i<35;i++)if(src[i]===op.a)out[i]=op.b;else if(op.kind==='group-swap'&&src[i]===op.b)out[i]=op.a;
 return out;
}
function makeFinalGuard(heads,pairs,onsetMemory){
 const seen=new Uint32Array(26),vowels=[...'aeiou'].map(v=>FINALS.indexOf(v));
 return finals=>{
  let memory=onsetMemory,used=0;
  for(let f=0;f<35;f++){memory+=Number(finals[f]!==identity[f]);used|=1<<finals[f];}
  if(memory>40||used!==(1<<26)-1||vowels.filter(f=>finals[f]!==identity[f]).length>1)return false;
  seen.fill(0);for(const [h,f] of pairs){const a=heads[h],b=finals[f],mask=1<<b;if((a===16&&b===25)||(a===25&&b===16)||(seen[a]&mask)!==0)return false;seen[a]|=mask;}
  return true;
 };
}
async function main(){
 const reportFile=path.join(ROOT,`research/notes/${PREFIX}-search.json`),report=read(path.relative(ROOT,reportFile));assert.ok(report.completed);
 const input=read('research/config/untoned-r2-restore399-v52-input.json'),manifest=read('research/.cache/r2-fixed-v52/manifest.json');
 for(const [p,h] of Object.entries(manifest.inputHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex'),h);
 const log=path.join(ROOT,'research/.cache/r2-restore399-v52/scores.jsonl'),known=new Map(fs.readFileSync(log,'utf8').trim().split('\n').map(line=>{const r=JSON.parse(line);return [r.key,r]}));
 const {data,template}=loadLayoutInputs(),fixture=read('research/.cache/ckt-v4-ergonomics.json'),motor=model.upstreamMotor(read('tools/ckt_v4_upstream_role_tables.json'));
 const entry=s=>rebuild({...template,initialMap:Object.fromEntries(HEADS.map((h,i)=>[h,String.fromCharCode(65+s[i])])),finalMap:Object.fromEntries(FINALS.map((f,i)=>[f,String.fromCharCode(65+s[27+i])]))},data);
 const best=field=>[...known.values()].sort((a,b)=>a[field]-b[field])[0];
 const centers=[...new Map([best('score'),best('score2')].map(r=>[r.key,r])).values()];
 const topCount=Number(process.env.R2_399_TWOHOP_TOP||96),exploreCount=Number(process.env.R2_399_TWOHOP_EXPLORE||32);
 assert.ok(Number.isInteger(topCount)&&topCount>0&&topCount<=4096&&Number.isInteger(exploreCount)&&exploreCount>=0&&exploreCount<=1024);
 const workers=Array.from({length:8},()=>launch(ROOT));await Promise.all(workers.map(w=>w.ready));const phases=[];
 try{for(const center of centers){
  const heads=center.state.slice(0,27),original=Uint8Array.from(center.state.slice(27)),onsetMemory=center.audit.M-original.reduce((s,k,i)=>s+Number(k!==identity[i]),0),guard=makeFinalGuard(heads,input.common.map(r=>r.pair),onsetMemory);
  assert.ok(guard(original));const cost=Array.from({length:35},()=>new Float64Array(26)),mass=input.common.reduce((s,r)=>s+r.weight,0);
  for(const {pair:[h,f],weight} of input.common)for(let k=0;k<26;k++)cost[f][k]+=weight/mass*input.motor2[heads[h]][k];
  const ops=operations(),single=new Map(),first=new Map(),a=new Uint8Array(35),b=new Uint8Array(35);
  const fullKey=finals=>Buffer.from([...heads,...finals]).toString('base64');
  for(const op of ops){applyFinals(original,a,op);const key=fullKey(a);single.set(op,known.get(key));if(key!==center.key&&!first.has(key))first.set(key,{finals:a.slice(),op,legal:guard(a),known:known.get(key)});}
  const pool=new Map();let pairs=0,validEndpoints=0,viaIllegal=0;
  for(const middle of first.values())for(const op of ops){
   pairs++;applyFinals(middle.finals,b,op);if(!guard(b))continue;validEndpoints++;
   const key=fullKey(b);if(known.has(key)||pool.has(key))continue;
   const rhs=single.get(op),forecast=middle.known&&rhs?middle.known.score+rhs.score-center.score:Infinity,forecast2=middle.known&&rhs?middle.known.score2+rhs.score2-center.score2:Infinity;
   let motor2=0;for(let f=0;f<35;f++)motor2+=cost[f][b[f]];
   if(!middle.legal)viaIllegal++;
   pool.set(key,{key,state:[...heads,...b],motor2,forecast,forecast2,viaIllegalIntermediate:!middle.legal,mutation:`${middle.op.label}; ${op.label}`});
  }
  const selected=new Map(),by=field=>[...pool.values()].filter(r=>Number.isFinite(r[field])).sort((a,b)=>a[field]-b[field]||a.key.localeCompare(b.key)),take=(rs,n)=>rs.slice(0,n).forEach(r=>selected.set(r.key,r));
  take(by('forecast'),topCount);take(by('forecast2'),topCount);take(by('motor2'),topCount);
  const random=[...pool.values()].map(r=>({...r,draw:crypto.createHash('sha256').update('399-twohop-20261120:'+r.key).digest('hex')})).sort((a,b)=>a.draw.localeCompare(b.draw));take(random,exploreCount);
  take(random.filter(r=>r.viaIllegalIntermediate),exploreCount);
  const stats={kind:'two-hop-screen',center:center.key,primitiveOperations:ops.length,uniqueFirstStates:first.size,orderedPairsVisited:pairs,legalEndpointsBeforeDedup:validEndpoints,newLegalEndpoints:pool.size,viaIllegalIntermediate:viaIllegal,selectedFullScores:selected.size,selection:`top${topCount} additive forecasts for each multiplier, top${topCount} two-key motor, ${exploreCount} deterministic exploration plus ${exploreCount} via illegal intermediates; deduplicated; not exhaustive full CKT of the two-hop space`};
  console.log(JSON.stringify(stats));
  const rows=[...selected.values()];for(let i=0;i<rows.length;i+=workers.length){await Promise.all(rows.slice(i,i+workers.length).map(async(p,j)=>{
   if(known.has(p.key))return;const e=entry(p.state),a=audit(e,data);assert.ok(a.valid&&a.unique===399&&!a.qz&&!a.zq&&a.M<=40&&a.D<=3&&a.V<=1&&a.branches===0);
   const r=await workers[j].score({id:p.key,state:p.state}),erg=ergonomics(e,data,fixture,motor),strictComfort=erg.mx>=142.3218631169652-1e-12&&erg.homeS2>=.4391204207421518-1e-12&&erg.homeFloor>=.31284320948242345-1e-12;
   const row={...p,audit:a,onsetChanges:center.onsetChanges,score:r.score,score2:r.score2,modes:r.modes,seconds:r.seconds,erg,strictComfort,origin:`399-twohop:${center.key}`};known.set(p.key,row);fs.appendFileSync(log,JSON.stringify(row)+'\n');
  }));if(i%80===0)console.log(JSON.stringify({twohopScored:Math.min(i+workers.length,rows.length),best1:best('score').score,best2:best('score2').score2}));}
  phases.push(stats);
 }
 }finally{workers.forEach(w=>w.close());}
 const sorted=field=>[...known.values()].sort((a,b)=>a[field]-b[field]);const c=report.categories[0];c.best1=best('score').key;c.best2=best('score2').key;c.comfortableScored=[...known.values()].filter(r=>r.strictComfort).length;
 report.exactlyScored=known.size;report.twoHopScreens=[...(report.twoHopScreens||[]),...phases];
 report.finalists=[...new Map([...sorted('score').slice(0,8),...sorted('score2').slice(0,8)].map(r=>[r.key,r])).values()].map(r=>({...r,initialMap:entry(r.state).initialMap,finalMap:entry(r.state).finalMap}));
 const expanded=new Set(report.phases.map(p=>p.center));report.oneHopStationary={multiplier1:expanded.has(c.best1),multiplier2:expanded.has(c.best2)};
 const target=path.join(ROOT,`research/notes/${PREFIX}-scores.jsonl.gz`);fs.writeFileSync(target,zlib.gzipSync(fs.readFileSync(log),{level:9}));report.scoreArchive={path:path.relative(ROOT,target),sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')};
 report.scope+='; plus legality enumeration of all two-operation endpoints at the listed two-hop centers, with screened full-CKT scoring only';
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({done:true,scored:known.size,best1:best('score').score,best2:best('score2').score2}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1)});
module.exports={applyFinals,makeFinalGuard};
