'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture');
const {rebuild,audit,ergonomics}=require('./untoned_r2_search_metrics');
const {launch}=require('./untoned_r2_native_worker');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function vowelPairs(state){
 const vowels=[...'aeiou'].map(v=>({index:27+FINALS.indexOf(v),identity:v.toUpperCase().charCodeAt(0)-65,v}));
 const restored=state.slice();for(const {index,identity} of vowels)restored[index]=identity;
 const out=[];
 for(const {index,identity,v} of vowels)for(let k=0;k<26;k++)if(k!==identity){const s=restored.slice();s[index]=k;if(s.some((k,i)=>k!==state[i]))out.push({state:s,mutation:`reset single vowels; ${v}→${String.fromCharCode(65+k)}`});}
 return out;
}
async function main(){
 const file=path.join(ROOT,'research/notes/2026-11-20-untoned-r2-onsets-v52-search.json'),report=read(file);assert.equal(report.completed,true,'finish the descent first');
 const log=path.join(path.resolve(ROOT,process.env.R2_V52_CACHE||'research/.cache/r2-fixed-v52'),'scores.jsonl'),known=new Map(fs.readFileSync(log,'utf8').trim().split('\n').map(line=>{const r=JSON.parse(line);return [r.key,r]}));
 const manifest=read(path.join(path.dirname(log),'manifest.json'));
 for(const [file,hash] of Object.entries(manifest.inputHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex'),hash,`frozen input changed: ${file}`);
 const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html')),template=data.entries.find(e=>e.id==='RC26-39a5bfdc045342cd'),fixture=read(path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json')),motor=model.upstreamMotor(read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')));
 const entry=s=>rebuild({...template,initialMap:report.initialMap,finalMap:Object.fromEntries(FINALS.map((f,i)=>[f,String.fromCharCode(65+s[27+i])]))},data);
 const all=[...known.values()],best=(field,desc=false)=>[...all].sort((a,b)=>((field==='score'||field==='score2'?a[field]-b[field]:a.erg[field]-b.erg[field])*(desc?-1:1)))[0];
 const centers=[...new Map([best('score'),best('score2'),best('mx',true),best('homeFloor',true)].map(r=>[r.key,r])).values()];
 const pool=new Map(),phases=[];
 for(const center of centers){let n=0;for(const p of vowelPairs(center.state)){
  const key=Buffer.from(p.state).toString('base64');if(known.has(key)||pool.has(key))continue;assert.deepEqual(p.state.slice(0,27),center.state.slice(0,27));
  const a=audit(entry(p.state),data);if(!a.valid||a.M>40||a.D>3||a.V>1||a.branches||a.qz||a.zq)continue;
  pool.set(key,{...p,key,audit:a,origin:`paired-vowel-budget:${center.key}:${p.mutation}`});n++;
 }phases.push({kind:'paired-vowel-budget',round:4,center:center.key,centerScore:center.score,centerScore2:center.score2,newScored:n});}
 console.log(JSON.stringify({pairedCenters:centers.length,newEndpoints:pool.size}));
 const workers=Array.from({length:4},()=>launch(ROOT));await Promise.all(workers.map(w=>w.ready));
 try{const rows=[...pool.values()];for(let i=0;i<rows.length;i+=workers.length)await Promise.all(rows.slice(i,i+workers.length).map(async(p,j)=>{
  const r=await workers[j].score({id:p.key,state:p.state}),erg=ergonomics(entry(p.state),data,fixture,motor);
  const strictComfort=erg.mx>=142.3218631169652-1e-12&&erg.homeS2>=.4391204207421518-1e-12&&erg.homeFloor>=.31284320948242345-1e-12;
  const row={...p,score:r.score,score2:r.score2,erg,strictComfort,modes:r.modes,seconds:r.seconds};known.set(p.key,row);fs.appendFileSync(log,JSON.stringify(row)+'\n');
 }));}finally{workers.forEach(w=>w.close());}
 const sorted=field=>[...known.values()].sort((a,b)=>a[field]-b[field]),strict=field=>sorted(field).filter(r=>r.strictComfort);
 const selected=new Map([...sorted('score').slice(0,12),...sorted('score2').slice(0,12),...strict('score').slice(0,12),...strict('score2').slice(0,12)].map(r=>[r.key,r]));
 report.best1=sorted('score')[0].key;report.best2=sorted('score2')[0].key;report.bestComfort1=strict('score')[0]?.key;report.bestComfort2=strict('score2')[0]?.key;report.exactlyScored=known.size;report.phases.push(...phases);report.finalists=[...selected.values()].map(r=>({...r,initialMap:report.initialMap,finalMap:entry(r.state).finalMap}));
 fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scored:known.size,best:sorted('score')[0].score,best2:sorted('score2')[0].score2,comfortable:strict('score').length}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1)});
module.exports={vowelPairs};
