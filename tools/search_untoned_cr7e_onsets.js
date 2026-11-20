'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const aeo=require('./search_untoned_cr7e_aeo42'),search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const {HEADS}=require('./ckt_v4_scheme_fixture'),{mappingKey,legal,screening}=require('./search_untoned_cr7e_coupled'),{pool}=require('./untoned_v52_stream_pool'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-onsets-v52');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ORDINARY=HEADS.slice(0,21).filter(h=>h.length===1),RETRO=['zh','ch','sh'];
function inputs(){const d=aeo.inputs(),previous=read(aeo.PREFIX+'.json'),xfile=path.join(ROOT,'research/notes/2026-11-20-untoned-cr7e-restored21-v52-summary.json'),x=read(xfile);assert.ok(previous.completed&&x.completed);
 for(const r of Object.values(previous.states))d.known.set(mappingKey(r),r);
 const seeds=[...previous.seeds,...previous.bestNew,...x.results.filter(r=>['U7R-143cf16e1fa2','U7R-9a7d2e90a161'].includes(r.id))];
 for(const r of x.results)d.known.set(mappingKey(r),{...r,score:r.score,doubledScore:r.doubledScore});
 // The X summary contains default scores as independently replayed, separate from point-optimal values.
 for(const r of seeds){if(!Number.isFinite(r.score)||!Number.isFinite(r.doubledScore)){const replay=read(xfile.replace('-summary.json','-replay-'+r.id+'.json'));r.score=replay.score;r.doubledScore=replay.doubledScore;d.known.set(mappingKey(r),r);}}
 return {...d,previous,seeds,xfile};
}
function resetOrdinary(base){const im={...base};for(const h of ORDINARY)im[h]=h.toUpperCase();return im;}
function ordinaryAllocations(base){const im=resetOrdinary(base),out=[{initialMap:im,mutation:'reset ordinary initials; D0'}];
 for(let i=0;i<ORDINARY.length;i++)for(let j=i+1;j<ORDINARY.length;j++){const a=ORDINARY[i],b=ORDINARY[j];out.push({initialMap:{...im,[a]:b.toUpperCase(),[b]:a.toUpperCase()},mutation:`reset ordinary initials; swap ${a}/${b}`});}return out;}
function isBN(r){return ORDINARY.every(h=>r.initialMap[h]===(h==='b'?'N':h==='n'?'B':h.toUpperCase()));}
function retroRepairs(base){if(Object.values(base).includes('E'))return [base];return RETRO.map(h=>({...base,[h]:'E'}));}
function bnRetroflexVariants(base){const im={...resetOrdinary(base),b:'N',n:'B'},out=[];for(const zh of 'EKSL')for(const ch of 'EKSL')for(const sh of 'EKSL')if(new Set([zh,ch,sh]).size===3&&[zh,ch,sh].includes('E'))out.push({...im,zh,ch,sh});return out;}
function selected(report){return [...new Map([...report.bestDefault.slice(0,2),...report.bestDoubled.slice(0,2),report.bestBNDefault[0],report.bestBNDoubled[0]].map(r=>[r.id,r])).values()];}
async function main(){
 const {prior,known,previous,seeds,xfile}=inputs(),template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const files=[__filename,aeo.PREFIX+'.json',xfile,...seeds.filter(r=>r.id==='U7R-143cf16e1fa2'||r.id==='U7R-9a7d2e90a161').map(r=>xfile.replace('-summary.json','-replay-'+r.id+'.json')),...Object.keys(previous.sourceHashes),path.join(ROOT,'tools/search_untoned_cr7e_aeo42.js')];
 const sourceHashes=Object.fromEntries([...new Set(files)].map(p=>[p,hash(p)]));let report=fs.existsSync(PREFIX+'.json')?read(PREFIX+'.json'):null;if(report)assert.deepEqual(report.sourceHashes,sourceHashes);
 const min=(rows,axis)=>[...rows].sort((a,b)=>a[axis]-b[axis]||a.id.localeCompare(b.id))[0];
 report??={version:'untoned-cr7e-onsets-v52-1',sourceHashes,seeds,reference:prior.reference,policy:previous.policy,
  contract:{capacity:[21,21],M:42,D:2,V:5,branches:0,qzEmpty:true,zqEmpty:true,...auxiliarySemantics(template.tone),costMultipliers:[1,2],
   ordinaryDomain:ORDINARY,ordinarySearch:'Reset every ordinary initial; no swap or one transposition. Preserve nonordinary initials except an E-key retroflex repair when needed. Separately enumerate all distinct three-retroflex assignments over EKSL containing E for b/n.',
   maxLeaderRings:8,neighborhood:'Final single moves, pair swaps, key-group swaps, and A/E/O single or co-key group moves. Prioritize b/n lane and overall lane, alternating axes. Finite search.'},
  states:{},stages:[],importedUniqueStates:known.size,completed:false};
 if(report.completed){console.log(JSON.stringify({completed:true,newExactStates:Object.keys(report.states).length,closure:report.closure}));return;}
 for(const r of Object.values(report.states))known.set(mappingKey(r),r);
 const inspect=screening(prior.auditInput,read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'))),native=await pool(path.join(far.WORK,'templates.json'),16),pending=new Map();
 const save=()=>{const tmp=PREFIX+'.json.tmp';fs.writeFileSync(tmp,JSON.stringify(report,null,2)+'\n');for(let tries=0;;tries++){try{fs.renameSync(tmp,PREFIX+'.json');break;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||tries===19)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}}};
 async function evaluate(row){const key=mappingKey(row);if(known.has(key))return known.get(key);if(pending.has(key))return pending.get(key);
  const entry=search.rebuild({...template,...row},prior.auditInput),audit=search.audit(entry,prior.auditInput);assert.ok(legal(audit));
  const job=(async()=>{const id='ONS-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12),s=await native.score({...entry,id}),out={id,initialMap:row.initialMap,finalMap:row.finalMap,audit,parent:row.parent,mutation:row.mutation,score:s.score,doubledScore:s.doubledScore};known.set(key,out);report.states[id]=out;
   if(Object.keys(report.states).length%200===0){save();console.log(JSON.stringify({newExactStates:Object.keys(report.states).length}));}return out;})();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 async function stage(name,center,rows,total){if(report.stages.some(s=>s.name===name&&s.center===center.id))return;const proposals=new Map();for(const row of rows)if(inspect(row))proposals.set(mappingKey(row),row);
  const before=Object.keys(report.states).length,values=await Promise.all([...proposals.values()].map(evaluate));assert.ok(values.length);
  const out={name,center:center.id,totalProposals:total??rows.length,legalUnique:proposals.size,selectedIds:values.map(r=>r.id),newExactStates:Object.keys(report.states).length-before,best1x:min(values,'score'),best2x:min(values,'doubledScore')};report.stages.push(out);save();console.log(JSON.stringify({stage:name,center:center.id,legal:proposals.size,newExact:out.newExactStates,one:out.best1x.score,two:out.best2x.doubledScore}));
 }
 const eligible=()=>{const byId=new Map([...known.values()].map(r=>[r.id,r]));return [...new Map(report.stages.flatMap(s=>s.selectedIds).map(id=>{const r=byId.get(id);return [mappingKey(r),r];})).values()];};
 try{
  for(const r of [seeds[0],seeds.at(-1)]){const s=await native.score(r);assert.ok(Math.abs(s.score-r.score)<1e-9&&Math.abs(s.doubledScore-r.doubledScore)<1e-9);}
  for(const center of seeds){const allocations=ordinaryAllocations(center.initialMap),rows=allocations.flatMap(a=>retroRepairs(a.initialMap).map(initialMap=>({...a,initialMap,finalMap:center.finalMap,parent:center.id})));await stage('complete D-budget transpositions',center,rows);
   await stage('complete b/n retroflex variants',center,bnRetroflexVariants(center.initialMap).map(initialMap=>({initialMap,finalMap:center.finalMap,parent:center.id,mutation:'b/n swap; distinct retroflex keys EKSL containing E'})));}
  // Resolve IDs once per leader round, without mixing imported layouts into the new-lane ranking.
  for(let round=report.stages.filter(s=>s.name==='complete leader ring').length;round<8;round++){
   const rows=eligible(),bn=rows.filter(isBN),closed=new Set(report.stages.filter(s=>s.name==='complete leader ring').map(s=>s.center)),axes=round%2?['doubledScore','score']:['score','doubledScore'];
   const lanes=round%4<2?[bn,rows]:[rows,bn],candidates=lanes.flatMap(lane=>axes.map(axis=>min(lane,axis))),center=candidates.find(r=>!closed.has(r.id));if(!center)break;
   const neighbors=[...search.neighbors(center).map(n=>({initialMap:center.initialMap,...n,parent:center.id})),...aeo.aeoNeighbors(center.initialMap,center.finalMap).map(n=>({...n,parent:center.id}))];await stage('complete leader ring',center,neighbors);
  }
  const rows=eligible(),bn=rows.filter(isBN);report.bestDefault=[...rows].sort((a,b)=>a.score-b.score).slice(0,4);report.bestDoubled=[...rows].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,4);report.bestBNDefault=[...bn].sort((a,b)=>a.score-b.score).slice(0,4);report.bestBNDoubled=[...bn].sort((a,b)=>a.doubledScore-b.doubledScore).slice(0,4);
  report.closure=['all','bn'].flatMap(lane=>['score','doubledScore'].map(axis=>{const r=min(lane==='bn'?bn:rows,axis);return {lane,axis,leader:r.id,score:r[axis],completeNeighborhoodScored:report.stages.some(s=>s.name==='complete leader ring'&&s.center===r.id)};}));report.completed=true;save();console.log(JSON.stringify({completed:true,newExactStates:Object.keys(report.states).length,closure:report.closure,best1:report.bestDefault[0],best2:report.bestDoubled[0]}));
 }finally{native.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={PREFIX,ORDINARY,RETRO,inputs,resetOrdinary,ordinaryAllocations,retroRepairs,bnRetroflexVariants,isBN,selected};
