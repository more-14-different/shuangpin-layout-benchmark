'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const {ALPHABET,HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model');
const ROOT=path.resolve(__dirname,'..'),SOURCE='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark';
const WORK=path.join(ROOT,'research/.cache/untoned-cr7e-v52-20261119');
const OUT=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52.json');
const PROFILE=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
const POLICY={keytao:{word2:'12',word3:'213',word4:'24'},sanpin:{word2:'12',word3:'213',word4:'21'}};
const REF={...POLICY,sanpin:{...POLICY.sanpin,word4:'23'}};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const key=e=>FINALS.map(f=>e.finalMap[f]).join('');
function rebuild(e,data){return {...e,codeList:data.pinyin.map((py,i)=>{if(!e.codeList[i])return null;const [h,f]=splitPinyin(py);return h===255||f===255?e.codeList[i]:e.initialMap[HEADS[h]]+e.finalMap[FINALS[f]];})};}
function audit(e,data){
 const first={},last={},codes=[];
 for(const [p]of data.base){const [hi,fi]=splitPinyin(data.pinyin[p]),h=HEADS[hi]==='YU'?'Y':HEADS[hi],f=FINALS[fi],c=e.codeList[p];if(typeof c!=='string'||! /^[A-Z]{2}$/.test(c))return {valid:false};(first[h]??=new Set()).add(c[0]);(last[f]??=new Set()).add(c[1]);codes.push(c);}
 const M=Object.entries(first).filter(([h])=>!'AEO'.includes(h)).reduce((s,[h,ks])=>s+[...ks].filter(k=>h.toUpperCase()!==k).length,0)+new Set(['A','E','O'].flatMap(h=>[...first[h]])).size+Object.entries(last).reduce((s,[f,ks])=>s+[...ks].filter(k=>f.toUpperCase()!==k).length,0);
 const branches=[...Object.values(first),...Object.values(last)].reduce((s,ks)=>s+ks.size-1,0),D=HEADS.slice(0,21).filter(h=>h.length===1).filter(h=>!first[h].has(h.toUpperCase())).length,V=[...'aeiou'].filter(f=>!last[f]?.has(f.toUpperCase())).length;
 const actual=[0,1].map(i=>new Set(codes.map(c=>c[i])).size),qz=codes.includes('QZ'),zq=codes.includes('ZQ');
 return {valid:actual.every(n=>n===21)&&codes.every(c=>![...c].some(k=>'AVUIO'.includes(k)))&&branches===0,M:M+branches,D,V,branches,actual,unique:new Set(codes).size,qz,zq};
}
function legal(a){return a.valid&&a.M<=42&&a.D<=2&&a.V<=5&&!a.qz&&!a.zq;}
function compile(rows,ctx,e){
 const pools=new Map(),priority=[...rows].sort((a,b)=>b.weight-a.weight||(a.id<b.id?-1:a.id>b.id?1:0)),ties=new Map(priority.map((r,i)=>[r.id,i]));
 const syllable=p=>{const [h,f]=splitPinyin(ctx.data.pinyin[p]);return h===255||f===255?[...e.codeList[p]].map(k=>62+ALPHABET.indexOf(k)):[h,27+f];};
 const layout=[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])];
 return rows.map(row=>{
  const i=Number(row.id.slice(row.id.lastIndexOf(':')+1));
  const pairs=row.kind==='character'?null:ctx.words[row.kind][i].py.map(syllable);
  const prefix=row.kind==='character'?syllable(i):row.kind==='word2'?pairs.flat():pairs.map(p=>p[0]);
  const stages=row.stages.map(s=>{if(!pools.has(s.pool))pools.set(s.pool,pools.size);if(s.length>4&&s.codes.length!==1)throw Error('long alternatives unsupported');
   const codes=s.codes.map(code=>{const n=Math.min(prefix.length,s.length),tokens=[...prefix.slice(0,n),...[...code.slice(n)].map(k=>62+ALPHABET.indexOf(k))];if(tokens.map(t=>t<62?layout[t]:ALPHABET[t-62]).join('')!==code)throw Error('symbolic row mismatch '+row.id);return tokens;});
   return [s.order,pools.get(s.pool),codes];});
  // Traditional 21x21 never uses the four-code-top soft-balance pools.
  for(const s of stages){const name=[...pools.keys()][s[1]];s[1]=name.startsWith('char:')?0:name.startsWith('word3:')?2:1;}
  return [ties.get(row.id),['character','word2','word3','word4'].indexOf(row.kind),row.weight,row.baseLength,stages];
 });
}
function normalize(modes,reference,mult=1){let sum=0;for(const m of ['keytao','sanpin'])for(const[k,w]of Object.entries({character:1,word2:3,word3:1,word4:1})){const t=modes[m][k],r=reference[m][k];const cost=t.motorUpperMs+mult*(t.effectiveMs-t.motorUpperMs),base=r.motorUpperMs+mult*(r.effectiveMs-r.motorUpperMs);sum+=w*(cost/base)**4;}return 10*(sum/12)**.25;}
function neighbors(e){
 const rows=[],groups=Object.groupBy(FINALS,f=>e.finalMap[f]);
 for(let i=0;i<FINALS.length;i++)for(let j=i+1;j<FINALS.length;j++){const a=FINALS[i],b=FINALS[j],ka=e.finalMap[a],kb=e.finalMap[b];if(ka===kb)continue;rows.push({finalMap:{...e.finalMap,[a]:kb,[b]:ka},mutation:`swap ${a}/${b}`});}
 const gs=Object.entries(groups);
 for(let i=0;i<gs.length;i++)for(let j=i+1;j<gs.length;j++){const[ka,as]=gs[i],[kb,bs]=gs[j];if(as.length===1&&bs.length===1)continue;const map={...e.finalMap};as.forEach(f=>map[f]=kb);bs.forEach(f=>map[f]=ka);rows.push({finalMap:map,mutation:`groups ${as.join('/')}/${bs.join('/')}`});}
 for(const f of FINALS)for(const k of 'BCDEFGHJKLMNPQRSTWXYZ')if(k!==e.finalMap[f])rows.push({finalMap:{...e.finalMap,[f]:k},mutation:`move ${f} to ${k}`});
 return rows;
}
function launch(){const child=spawn(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe'),[path.join(WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),PROFILE],{stdio:['pipe','pipe','inherit'],windowsHide:true});let pending,resolveReady,rejectReady;const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});readline.createInterface({input:child.stdout}).on('line',line=>{try{const v=JSON.parse(line);if(v.ready)resolveReady(v);else{const p=pending;pending=null;p.resolve(v);}}catch(e){pending?.reject(e);rejectReady(e);}});child.on('exit',code=>{pending?.reject(Error('stream exit '+code));rejectReady(Error('stream exit '+code));});return{child,ready,score:e=>new Promise((resolve,reject)=>{pending={resolve,reject};child.stdin.write(JSON.stringify({id:e.id,state:[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])].map(k=>ALPHABET.indexOf(k))})+'\n');})};}
async function main(){
 fs.mkdirSync(WORK,{recursive:true});const args=process.argv.slice(2),data=scorer.loadPayload(path.join(SOURCE,'a7_CKT_R11.html'));
 const preparing=args.includes('--prepare'),ctx=preparing?v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',PROFILE):null;
 const bases=['OC21-bf9bf45a7e60','OC21-e1f155973380'].map(id=>data.entries.find(e=>e.id===id));
 const crfile=path.join(SOURCE,'research/notes/2026-11-19-recent-cr-r11-source.json'),cr=read(crfile).layouts.find(e=>e.id==='CR-REF-7e650f7a4c');
 const initialMap=Object.fromEntries(HEADS.map(h=>[h,cr.firstKeys[{'A':'zero-A','E':'zero-E','O':'zero-O','W':'zero-W','Y':'zero-Y','YU':'zero-Y'}[h]||h]]));
 const prepared=preparing?null:read(path.join(WORK,'contract.json'));
 const reference=preparing?v52.evaluateUntoned(data.entries.find(e=>e.id==='S005'),REF,null,ctx).v52:prepared.reference;
 const controls=preparing?bases.map(e=>{const s=v52.evaluateUntoned(e,POLICY,null,ctx).v52;return{id:e.id,initialMap:e.initialMap,finalMap:e.finalMap,score:normalize(s,reference),doubledScore:normalize(s,reference,2),modes:s};}):prepared.controls;
 const sourceHashes=Object.fromEntries([__filename,path.join(SOURCE,'a7_CKT_R11.html'),crfile,PROFILE,path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/ckt_block_error.js'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),'D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml'].map(p=>[p,hash(p)]));
 if(args.includes('--prepare')){
  const entry=bases[0],modes=[];
  for(const m of ['keytao','sanpin']){const char=scorer.buildRows(entry,data,ctx.strokes,{word2:[],word3:[],word4:[]},m);const rows=[...char,...Object.entries(POLICY[m]).flatMap(([kind,order])=>kind==='word3'?ctx.buildExtendedWord3Rows(entry,data,ctx.words,m,entry.tone,order):ctx.buildRowsForOrder(entry,data,ctx.words,m,entry.tone,kind,order,model))];modes.push(compile(rows,ctx,entry));console.log('compiled',m,rows.length);}
  fs.writeFileSync(path.join(WORK,'templates.json'),JSON.stringify({version:'untoned-v52-2121-templates-1',keyAlphabet:ALPHABET,toneKeysByTone:'IVUAO',references:Object.values(reference).map(m=>['character','word2','word3','word4'].map(k=>m[k].effectiveMs)),referencesDoubled:Object.values(reference).map(m=>['character','word2','word3','word4'].map(k=>2*m[k].effectiveMs-m[k].motorUpperMs)),modes}));
  fs.writeFileSync(path.join(WORK,'contract.json'),JSON.stringify({sourceHashes,initialMap,reference,controls,policy:POLICY},null,2));console.log(JSON.stringify(controls.map(({modes,...r})=>r)));return;
 }
 const saved=read(path.join(WORK,'contract.json'));for(const[p,h]of Object.entries(saved.sourceHashes))if(hash(p)!==h){if(p!==__filename||hash(path.join(WORK,'pilot-search.js'))!==h)throw Error('contract changed '+p);}
 const workers=[launch(),launch()];await Promise.all(workers.map(w=>w.ready));const template=bases[0];
 const queues=workers.map(()=>Promise.resolve());let issued=0;
 const worker={score:e=>{const i=issued++%workers.length,job=queues[i].then(()=>workers[i].score(e));queues[i]=job.catch(()=>{});return job;}};
 try{
  for(const c of controls){const e=rebuild({...template,...c,id:c.id},data),s=await worker.score(e);for(const f of ['score','doubledScore'])if(Math.abs(s[f]-c[f])>1e-9)throw Error('native control mismatch '+c.id+' '+f);}
  let report=fs.existsSync(OUT)?read(OUT):{version:'untoned-cr7e-v52-fixed-initials-1',sourceHashes,initialMap,policy:POLICY,controls,contract:{memory:'M-R2-explicit',maxM:42,maxD:2,maxV:5,capacity:[21,21],qzEmpty:true,zqEmpty:true,costMultipliers:[1,2],cognitive:'all six coefficients multiply together; reference also repriced',fixedInitials:true},states:{},stages:[],completed:false};
  if(report.sourceHashes[__filename]!==sourceHashes[__filename]){
   const old=report.sourceHashes[__filename],first=hash(path.join(WORK,'pilot-search.js'))===old;
   const source=path.join(WORK,first?'pilot-search.js':'screened-search-v1.js'),archive=path.join(WORK,first?'pilot-report.json':'screened-report-v1.json');
   if(hash(source)!==old)throw Error('unknown checkpoint search revision');
   (report.searchRevisions??=[]).push({searchSha256:old,reportSha256:hash(archive),scoredStates:Object.keys(report.states).length,reason:first?'retain exact pilot; screen subsequent neighborhoods':'continue descending frontier with two independent native score workers'});report.sourceHashes=sourceHashes;
  }
  report.contract.search='historical transplants and up to 24 additional screened fixed-initial neighborhoods, stopping when top three centers of both costs have been screened; heuristic, not a closure proof';
  report.completed=false;
  const seen=new Map(Object.values(report.states).map(r=>[key(r),r]));
  const save=()=>{fs.writeFileSync(OUT+'.tmp',JSON.stringify(report,null,2));fs.renameSync(OUT+'.tmp',OUT);};
  async function evaluate(row){const e=rebuild({...template,...row,initialMap},data),k=key(e);if(seen.has(k))return seen.get(k);const a=audit(e,data);if(!legal(a))return null;const id='U7E-'+crypto.createHash('sha256').update(k).digest('hex').slice(0,12),s=await worker.score({...e,id});const r={id,initialMap,finalMap:e.finalMap,audit:a,score:s.score,doubledScore:s.doubledScore,mutation:row.mutation,parent:row.parent};seen.set(k,r);report.states[id]=r;if(seen.size%50===0){save();console.log('scores',seen.size,'best',Math.min(...[...seen.values()].map(r=>r.score)),Math.min(...[...seen.values()].map(r=>r.doubledScore)));}return r;}
  for(const b of bases)await evaluate({...b,mutation:'transplant '+b.id});
  const legacy=read('D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark-2121-2k/research/notes/2026-11-14-untoned-2121-local-closure.json');
  const seeds=Object.values(legacy.records).sort((a,b)=>a.score-b.score);let accepted=0;for(const row of seeds){if(report.stages.some(s=>s.center))break;const e=rebuild({...template,...row,initialMap},data);if(legal(audit(e,data))&&!seen.has(key(e))){await evaluate({...row,mutation:'historical basin transplant '+row.id});accepted++;if(accepted>=180)break;}}
  report.stages.push({name:'transplant',count:seen.size});save();
  const closed=new Set(report.stages.filter(s=>s.center).map(s=>s.center));
  const snapshot=read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')),motor=model.upstreamMotor(snapshot);
  function proxy(row){const e=rebuild({...template,...row,initialMap},data),a=audit(e,data);if(!legal(a)||seen.has(key(e)))return null;const buckets=new Map();let cost=0,total=0,miss=0;for(const[p,w]of data.base){const c=e.codeList[p];cost+=w*motor(c).upperMs;total+=w;if(!buckets.has(c))buckets.set(c,[]);buckets.get(c).push(w);}for(const b of buckets.values())miss+=b.reduce((s,w)=>s+w,0)-Math.max(...b);return {...row,proxy:cost/total,miss:miss/total};}
  for(let round=0;round<24&&seen.size<2400;round++){
   const values=[...seen.values()],seeds=[...values].sort((a,b)=>a.score-b.score).slice(0,3).concat([...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,3));
   const center=seeds.find(e=>!closed.has(e.id));if(!center)break;
   const variants=neighbors(center);let rng=71919+round;const rand=n=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)%n;};
   for(let i=0;i<200;i++){const map={...center.finalMap};for(let j=0;j<2;j++){const a=FINALS[rand(35)],b=FINALS[rand(35)];[map[a],map[b]]=[map[b],map[a]];}variants.push({finalMap:map,mutation:'two-swap perturbation'});}
   const legalRows=variants.map(proxy).filter(Boolean),picked=new Map();for(const penalty of [0,150,300,600])for(const row of [...legalRows].sort((a,b)=>(a.proxy+penalty*a.miss)-(b.proxy+penalty*b.miss)).slice(0,25))picked.set(key(row),row);
   const start=seen.size;await Promise.all([...picked.values()].map(n=>evaluate({...n,parent:center.id})));closed.add(center.id);report.stages.push({name:'screened single-move and double-swap final neighborhood',center:center.id,legalCandidates:legalRows.length,exactCandidates:picked.size,newStates:seen.size-start});save();
  }
  const values=[...seen.values()];report.bestDefault=[...values].sort((a,b)=>a.score-b.score).slice(0,10);report.bestDoubled=[...values].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,10);report.completed=true;save();console.log(JSON.stringify({completed:true,count:seen.size,best:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{for(const w of workers)w.child.stdin.end();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={audit,rebuild,neighbors,normalize,POLICY,REF};
