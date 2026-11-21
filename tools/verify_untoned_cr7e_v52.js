'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model');
const {blockErrorMotor}=require('./ckt_block_error');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture');
const search=require('./search_untoned_cr7e_v52');
const ROOT=path.resolve(__dirname,'..'),WORK=path.join(ROOT,'research/.cache/untoned-cr7e-v52-20261119');
const FILE=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52.json');
const OUTPUT=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function optimum(cases,reference,mult){let fourth=0,policy={},runnerGaps={};for(const mode of ['keytao','sanpin']){
 const scores=cases[mode].results.map(row=>{let value=0;for(const [k,w]of Object.entries({character:1,word2:3,word3:1,word4:1})){const t=row.tracks[k],r=reference[mode][k];value+=w*((t.motorUpperMs+mult*(t.effectiveMs-t.motorUpperMs))/(r.motorUpperMs+mult*(r.effectiveMs-r.motorUpperMs)))**4;}return {policy:row.policyKey,fourth:value};}).sort((a,b)=>a.fourth-b.fourth);
 fourth+=scores[0].fourth;policy[mode]=scores[0].policy;runnerGaps[mode]=10*((scores[1].fourth/6)**.25-(scores[0].fourth/6)**.25);
 }return {score:10*(fourth/12)**.25,policy,memberRunnerUpGaps:runnerGaps};}
function enumerateBounded(entry,mode,ctx){
 const character=ctx.summarize(model.resolveCompetition(scorer.buildRows(entry,ctx.data,ctx.strokes,{word2:[],word3:[],word4:[]},mode),{motorCost:ctx.motor}));
 const two=ctx.orderedDistinctPairs(2),three=ctx.permutations(3),four=ctx.orderedDistinctPairs(4);
 const word2=new Map(two.map(order=>[order,ctx.buildRowsForOrder(entry,ctx.data,ctx.words,mode,entry.tone,'word2',order,model)]));
 const pairs=new Map();
 for(const o4 of four){const rows4=ctx.buildRowsForOrder(entry,ctx.data,ctx.words,mode,entry.tone,'word4',o4,model);
  for(const o2 of two){const outcomes=model.resolveCompetition([...word2.get(o2),...rows4],{motorCost:ctx.motor});pairs.set(o2+'/'+o4,{word2:ctx.summarize(outcomes.filter(r=>r.kind==='word2')),word4:ctx.summarize(outcomes.filter(r=>r.kind==='word4'))});}
 }
 word2.clear();const thirds=new Map();
 for(const order of three){const rows=ctx.buildExtendedWord3Rows(entry,ctx.data,ctx.words,mode,entry.tone,order);thirds.set(order,ctx.summarize(model.resolveCompetition(rows,{motorCost:ctx.motor})));}
 const results=[];for(const o2 of two)for(const o3 of three)for(const o4 of four)results.push({policyKey:[o2,o3,o4].join('/'),tracks:{character,...pairs.get(o2+'/'+o4),word3:thirds.get(o3)}});
 assert.equal(results.length,144);return{results};
}
async function main(){
 const report=read(FILE);assert.ok(report.completed,'finish finite search first');
 for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),h,p);
 const data=scorer.loadPayload('a7_CKT_R11.html'),profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),reference=v52.evaluateUntoned(data.entries.find(e=>e.id==='S005'),search.REF,null,ctx).v52;
 const template=data.entries.find(e=>e.id==='OC21-bf9bf45a7e60');
 const source=read('D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/research/notes/2026-11-19-recent-cr-r11-source.json').layouts.find(e=>e.id==='CR-REF-7e650f7a4c');
 const initialMap=Object.fromEntries(HEADS.map(h=>[h,source.firstKeys[{'A':'zero-A','E':'zero-E','O':'zero-O','W':'zero-W','Y':'zero-Y','YU':'zero-Y'}[h]||h]]));
 assert.deepEqual(report.initialMap,initialMap,'fixed initials must equal the specified CR source');
 for(const row of Object.values(report.states)){
  assert.deepEqual(row.initialMap,initialMap);
  const a=search.audit(search.rebuild({...template,...row},data),data);
  assert.deepEqual(row.audit,a,row.id+' mapping audit');
  assert.ok(a.valid&&a.M<=42&&a.D<=2&&a.V<=5&&!a.qz&&!a.zq);
 }
 const worker=spawn(path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe'),[path.join(WORK,'templates.json'),path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'),profile],{stdio:['pipe','pipe','inherit'],windowsHide:true});
 let pending,readyResolve;const ready=new Promise(r=>readyResolve=r);
 readline.createInterface({input:worker.stdout}).on('line',line=>{const row=JSON.parse(line);if(row.ready)readyResolve();else{const r=pending;pending=null;r(row);}});
 const native=e=>new Promise(r=>{pending=r;worker.stdin.write(JSON.stringify({id:e.id,state:[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f])].map(k=>k.charCodeAt(0)-65)})+'\n');});
 const cached=fs.existsSync(OUTPUT)?read(OUTPUT):null;
 if(cached)assert.deepEqual(cached.reference,reference,'resumed S005 reference differs');
 const out={version:'untoned-cr7e-v52-independent-verification-1',reference,auditInput:{pinyin:data.pinyin,base:data.base},results:[],finiteSearchStates:Object.keys(report.states).length,searchContract:report.contract};
 if(cached)out.resumedNativeCheckpointSha256=crypto.createHash('sha256').update(fs.readFileSync(OUTPUT)).digest('hex');
 const withBaselineOccupancy=Object.values(report.states).filter(r=>r.audit.unique>=345);
 const leaders=[report.bestDefault[0],report.bestDoubled[0],
  ...[withBaselineOccupancy.sort((a,b)=>a.score-b.score)[0],withBaselineOccupancy.sort((a,b)=>a.doubledScore-b.doubledScore)[0]].filter(Boolean)];
 const transplants=Object.values(report.states).filter(r=>r.mutation?.startsWith('transplant '));
 const selected=[...new Map([...report.controls,...transplants,...leaders].map(r=>[r.id,r])).values()];
 await ready;
 try{for(const row of selected){
  const previous=cached?.results.find(r=>r.id===row.id);
  if(previous){assert.deepEqual(previous.initialMap,row.initialMap);assert.deepEqual(previous.finalMap,row.finalMap);assert.ok(previous.maxTrackDifference<1e-8);
   assert.ok(Math.abs(search.normalize(previous.modes,reference)-row.score)<1e-9);assert.ok(Math.abs(search.normalize(previous.modes,reference,2)-row.doubledScore)<1e-9);
   out.results.push(previous);console.log('retained fully cross-checked native tracks',row.id);continue;}
  ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
  ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
  const entry=search.rebuild({...template,...row},data),computed=v52.evaluateUntoned(entry,search.POLICY,null,ctx),ns=await native(entry);
  let maxTrackDifference=0;
  for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])for(const[f,value]of Object.entries(computed.v52[mode][kind]))if(typeof value==='number'){
   const difference=Math.abs(value-ns.modes[mode][kind][f]);maxTrackDifference=Math.max(maxTrackDifference,difference);assert.ok(difference<1e-8,`${row.id}/${mode}/${kind}/${f}: ${difference}`);
  }
  const score=search.normalize(computed.v52,reference),doubledScore=search.normalize(computed.v52,reference,2);
  assert.ok(Math.abs(score-row.score)<1e-9,row.id+' score');assert.ok(Math.abs(doubledScore-row.doubledScore)<1e-9,row.id+' double score');
  const result={id:row.id,initialMap:entry.initialMap,finalMap:entry.finalMap,tone:entry.tone,codeList:entry.codeList,audit:search.audit(entry,data),score,doubledScore,maxTrackDifference,modes:computed.v52};
  out.results.push(result);fs.writeFileSync(OUTPUT,JSON.stringify(out,null,2));console.log(JSON.stringify({id:row.id,score,doubledScore,maxTrackDifference}));if(global.gc)global.gc();
 }
 ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();
 // Finalists and controls receive the same complete 144-policy optimization.
 for(const result of out.results.filter(r=>report.controls.some(c=>c.id===r.id)||leaders.some(c=>c.id===r.id))){
  const entry=search.rebuild({...template,...result},data),cases={};
  for(const mode of ['keytao','sanpin']){
   ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);ctx.scorer=scorer;ctx.model=model;
   cases[mode]=enumerateBounded(entry,mode,ctx);console.log('policy enumeration',result.id,mode,cases[mode].results.length);
  }
  result.optimal1x=optimum(cases,reference,1);result.optimal2x=optimum(cases,reference,2);
  fs.writeFileSync(OUTPUT,JSON.stringify(out,null,2));if(global.gc)global.gc();
 }
 out.completed=true;out.sourceHashes=Object.fromEntries([__filename,FILE,path.join(ROOT,'research/ckt-v4-core/src/bin/score-untoned-v52-stream.rs'),path.join(WORK,'templates.json'),
  'D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark-2121-2k/research/notes/2026-11-14-untoned-2121-local-closure.json'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));fs.writeFileSync(OUTPUT,JSON.stringify(out,null,2));
 }finally{worker.stdin.end();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={optimum,enumerateBounded};
