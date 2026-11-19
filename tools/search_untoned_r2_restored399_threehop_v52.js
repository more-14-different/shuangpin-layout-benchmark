'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture'),{applyFinals,makeFinalGuard}=require('./search_untoned_r2_restored399_twohop_v52');
const {audit,rebuild,ergonomics}=require('./untoned_r2_search_metrics'),{launch}=require('./untoned_r2_native_worker');
const model=require('./ckt_v4_model'),{loadLayoutInputs}=require('./untoned_r2_search_inputs');
const ROOT=path.resolve(__dirname,'..'),PREFIX='2026-11-20-untoned-r2-restored399-v52',read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
function cycleFinals(src,out,[a,b,c,d],kind){
 out.set(src);
 if(kind==='token'){out[a]=src[d];out[b]=src[a];out[c]=src[b];out[d]=src[c];}
 else for(let i=0;i<35;i++)out[i]=src[i]===a?b:src[i]===b?c:src[i]===c?d:src[i]===d?a:src[i];
 return out;
}
function permutations3(a,b,c){return [[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]];}
async function main(){
 const reportFile=path.join(ROOT,`research/notes/${PREFIX}-search.json`),report=read(path.relative(ROOT,reportFile));assert.ok(report.completed);
 const input=read('research/config/untoned-r2-restore399-v52-input.json'),manifest=read('research/.cache/r2-fixed-v52/manifest.json');for(const [p,h] of Object.entries(manifest.inputHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex'),h);
 const log=path.join(ROOT,'research/.cache/r2-restore399-v52/scores.jsonl'),known=new Map(fs.readFileSync(log,'utf8').trim().split('\n').map(l=>{const r=JSON.parse(l);return [r.key,r]}));
 const {data,template}=loadLayoutInputs(),fixture=read('research/.cache/ckt-v4-ergonomics.json'),motor=model.upstreamMotor(read('tools/ckt_v4_upstream_role_tables.json'));
 const entry=s=>rebuild({...template,initialMap:Object.fromEntries(HEADS.map((h,i)=>[h,String.fromCharCode(65+s[i])])),finalMap:Object.fromEntries(FINALS.map((f,i)=>[f,String.fromCharCode(65+s[27+i])]))},data);
 const best=field=>[...known.values()].sort((a,b)=>a[field]-b[field])[0],centers=[...new Map([best('score'),best('score2')].map(r=>[r.key,r])).values()];
 const topCount=Number(process.env.R2_399_THREEHOP_TOP||96);assert.ok(Number.isInteger(topCount)&&topCount>0&&topCount<=2048);
 const workerCount=Number(process.env.R2_399_THREEHOP_WORKERS||4);assert.ok(Number.isInteger(workerCount)&&workerCount>=1&&workerCount<=12);
 const workers=Array.from({length:workerCount},()=>launch(ROOT));await Promise.all(workers.map(w=>w.ready));const screens=[];
 try{for(const center of centers){
  const heads=center.state.slice(0,27),original=Uint8Array.from(center.state.slice(27)),a=new Uint8Array(35),b=new Uint8Array(35),fullKey=f=>Buffer.from([...heads,...f]).toString('base64');
  const identities=FINALS.map(f=>f.length===1?f.toUpperCase().charCodeAt(0)-65:-1),memory=center.audit.M-original.reduce((s,k,i)=>s+Number(k!==identities[i]),0),guard=makeFinalGuard(heads,input.common.map(r=>r.pair),memory);
  const mass=input.common.reduce((s,r)=>s+r.weight,0),cost=Array.from({length:35},()=>new Float64Array(26));for(const {pair:[h,f],weight} of input.common)for(let k=0;k<26;k++)cost[f][k]+=weight/mass*input.motor2[heads[h]][k];
  const pool=new Map(),stats={kind:'three-hop-screen',center:center.key,cachedFullScoresAtCenter:[...known.values()].filter(r=>r.origin===`399-threehop:${center.key}`).length,workerCount,threeSwapCyclesVisited:0,validEndpointsBeforeDedup:0,newLegalEndpoints:0,viaIllegalFirstIntermediate:0,selectedFullScores:0,selection:`top${topCount} additive forecasts for each multiplier, top${topCount} two-key motor, 32 deterministic exploration; all four-token and four-key cycles (three swaps), not all three-operation combinations`};
  for(const kind of ['key','token']){
   const n=kind==='key'?26:35,singles=new Map();
   for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    const op=kind==='key'?{kind:'group-swap',a:i,b:j}:{kind:'swap',a:i+27,b:j+27};applyFinals(original,a,op);singles.set(`${i},${j}`,{r:known.get(fullKey(a)),legal:guard(a)});
   }
   for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)for(let k=j+1;k<n;k++)for(let l=k+1;l<n;l++){
    if(kind==='token'&&new Set([original[i],original[j],original[k],original[l]]).size<4)continue;
    for(const tail of permutations3(j,k,l)){
     stats.threeSwapCyclesVisited++;const cycle=[i,...tail];cycleFinals(original,b,cycle,kind);if(!guard(b))continue;stats.validEndpointsBeforeDedup++;
     const key=fullKey(b);if(known.has(key)||pool.has(key))continue;
     const parts=tail.map(t=>singles.get(`${i},${t}`)),forecast=parts.every(x=>x.r)?parts.reduce((s,x)=>s+x.r.score,0)-2*center.score:Infinity,forecast2=parts.every(x=>x.r)?parts.reduce((s,x)=>s+x.r.score2,0)-2*center.score2:Infinity;
     let motor2=0;for(let f=0;f<35;f++)motor2+=cost[f][b[f]];
     const illegal=!parts[0].legal;if(illegal)stats.viaIllegalFirstIntermediate++;
     pool.set(key,{key,state:[...heads,...b],forecast,forecast2,motor2,viaIllegalFirstIntermediate:illegal,mutation:kind+' 3 swaps: '+cycle.map(t=>kind==='key'?String.fromCharCode(65+t):FINALS[t]).join(' / ')});
    }
   }
  }
  stats.newLegalEndpoints=pool.size;const selected=new Map(),by=field=>[...pool.values()].filter(r=>Number.isFinite(r[field])).sort((a,b)=>a[field]-b[field]||a.key.localeCompare(b.key)),take=(rs,n)=>rs.slice(0,n).forEach(r=>selected.set(r.key,r));
  take(by('forecast'),topCount);take(by('forecast2'),topCount);take(by('motor2'),topCount);take([...pool.values()].map(r=>({...r,draw:crypto.createHash('sha256').update('399-threehop-20261120:'+r.key).digest('hex')})).sort((a,b)=>a.draw.localeCompare(b.draw)),32);
  stats.selectedFullScores=selected.size;console.log(JSON.stringify(stats));
  const rows=[...selected.values()];for(let i=0;i<rows.length;i+=workers.length){await Promise.all(rows.slice(i,i+workers.length).map(async(p,j)=>{
   const e=entry(p.state),a=audit(e,data);assert.ok(a.valid&&a.unique===399&&!a.qz&&!a.zq&&a.M<=40&&a.D<=3&&a.V<=1&&a.branches===0);
   const r=await workers[j].score({id:p.key,state:p.state}),erg=ergonomics(e,data,fixture,motor),strictComfort=erg.mx>=142.3218631169652-1e-12&&erg.homeS2>=.4391204207421518-1e-12&&erg.homeFloor>=.31284320948242345-1e-12;
   const row={...p,audit:a,onsetChanges:center.onsetChanges,score:r.score,score2:r.score2,modes:r.modes,seconds:r.seconds,erg,strictComfort,origin:`399-threehop:${center.key}`};known.set(p.key,row);fs.appendFileSync(log,JSON.stringify(row)+'\n');
  }));if(i%80===0)console.log(JSON.stringify({threehopScored:Math.min(i+workers.length,rows.length),best1:best('score').score,best2:best('score2').score2}));}
  screens.push(stats);
 }
 }finally{workers.forEach(w=>w.close());}
 const sorted=field=>[...known.values()].sort((a,b)=>a[field]-b[field]);report.exactlyScored=known.size;report.threeHopScreens=[...(report.threeHopScreens||[]),...screens];const c=report.categories[0];c.best1=best('score').key;c.best2=best('score2').key;c.comfortableScored=[...known.values()].filter(r=>r.strictComfort).length;
 report.finalists=[...new Map([...sorted('score').slice(0,8),...sorted('score2').slice(0,8)].map(r=>[r.key,r])).values()].map(r=>({...r,initialMap:entry(r.state).initialMap,finalMap:entry(r.state).finalMap}));const expanded=new Set(report.phases.map(p=>p.center));report.oneHopStationary={multiplier1:expanded.has(c.best1),multiplier2:expanded.has(c.best2)};
 const target=path.join(ROOT,`research/notes/${PREFIX}-scores.jsonl.gz`);fs.writeFileSync(target,zlib.gzipSync(fs.readFileSync(log),{level:9}));report.scoreArchive={path:path.relative(ROOT,target),sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')};report.scope+='; selected three-swap four-token/four-key cycles with legality screening and sampled full CKT; not exhaustive three-hop search';
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({done:true,scored:known.size,best1:best('score').score,best2:best('score2').score2}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1)});
module.exports={cycleFinals,permutations3};
