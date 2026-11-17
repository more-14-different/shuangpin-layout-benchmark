'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {neighborhood,signature}=require('./polish_2126_neighborhood');
const stateModel=require('./anneal_2126_model'),scorer=require('./score_completion_ckt_v4');
const toned=require('./score_toned_2121_ckt_v51'),experiment=require('./explore_toned_2126');
const {prepare}=require('./fast_toned_2126');
function setup(input,snow){
 const source=JSON.parse(fs.readFileSync(input));
 const inventory=JSON.parse(fs.readFileSync('research/config/ckt-v51-toned-2121-seeds.json'));
 const roots=[...new Set(inventory.decomposition.map(d=>d.rhymeBody==='_'?d.fullFinal:d.rhymeBody))].sort();
 const byPy=new Map(inventory.decomposition.map(d=>[d.pinyin,d]));
 const bundle={rootNames:roots,finalRoots:Object.fromEntries(inventory.decomposition.map(d=>[d.fullFinal,roots.indexOf(d.rhymeBody==='_'?d.fullFinal:d.rhymeBody)])),tokens:source.tokenKeys.map((t,i)=>{const d=byPy.get(t.slice(0,-1));return{root:roots.indexOf(d.rhymeBody==='_'?d.fullFinal:d.rhymeBody),tone:Number(t.slice(-1)),first:source.layout.tonedCodes[i][0]};}),seeds:{full26:{rowCounts:[10,9,7],qEmpty:false,toneRowsByTone:source.layout.toneRowsByTone}}};
 assert.deepEqual(stateModel.layout(bundle,'full26',source.state).tonedCodes,source.layout.tonedCodes);
 const html='a7_CKT_R11.html',dict=path.join(snow,'snow_pinyin.base.dict.yaml'),stroke=path.join(snow,'rime-stroke/stroke.dict.yaml');
 const data=scorer.loadPayload(html),words=scorer.multiwords(dict,data,.99),strokes=scorer.strokeOptions(stroke),motor=toned.projectedMotor(data);
 const script=path.join(snow,'scripts/research/evaluate_ckt_v4_word_aux_order.js');
 const context={data,words,motor,reference:toned.buildReference({data,words,strokes,motor,snow}),buildRowsForOrder:require(script).buildRowsForOrder};
 const files=[input,html,dict,stroke,script,path.join(snow,'scripts/research/evaluate_ckt51_aux_order.js'),
  'tools/ckt_v4_upstream_role_tables.json','tools/fast_toned_2126.js','tools/ckt_v4_model.js','tools/score_completion_ckt_v4.js','tools/score_toned_2121_ckt_v51.js','tools/explore_toned_2126.js','tools/auxiliary_semantics.js','tools/anneal_2126_model.js','tools/polish_2126_neighborhood.js','tools/polish_full26.js'];
 const hashes=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
 return{source,bundle,context,hashes};
}
function main(){
 const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
 const input=args.input||'research/notes/2026-11-16-anneal-2126-best-full26.json';
 const output=args.output||'research/notes/2026-11-17-toned-2126-full26-polish.json';
 const snow=args.snow||'D:/C2D/Documents/rime-snow-pinyin';
 const {source,bundle,context,hashes}=setup(input,snow),fast=prepare(source.tokenKeys,context);
 const build=s=>stateModel.layout(bundle,'full26',s);
 const oracle=s=>experiment.evaluate(build(s),source.tokenKeys,context,stateModel.policies[s.policy]);
 const parity=(s,value)=>{
  const expected=oracle(s);assert.ok(Math.abs(expected.score-value.score)<1e-10);
  for(const k of Object.keys(expected.tracks))for(const f of Object.keys(expected.tracks[k]))assert.ok(Math.abs(expected.tracks[k][f]-value.tracks[k][f])<1e-8,`${k}/${f}`);
  return expected.score-value.score;
 };
 const replay=fast(build(source.state),source.policy);assert.ok(Math.abs(replay.score-source.score)<1e-10,'champion drift');
 let report={version:'full26-exact-polish-1',input,hashes,originalSources:source.sources,tokenKeys:source.tokenKeys,rootNames:bundle.rootNames,
  scope:'all single root transfers, pairwise root swaps, within-row single group reassignments/pair swaps, and all 144 policies; fixed 18 atomic roots, ten nonempty groups, D3/V1 first keys, tone rows, 10/9/7 and AEUIO',
  reference:context.reference.tracks,seedScore:source.score,initialOracleDifference:parity(source.state,replay),
  evaluations:[],history:[{state:source.state,score:source.score,move:null}],passes:[],complete:false};
 if(fs.existsSync(output)){
  const previous=JSON.parse(fs.readFileSync(output));assert.deepEqual(previous.hashes,hashes,'resume source/scorer changed');report=previous;
 }
 const save=()=>{fs.writeFileSync(output+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(output+'.tmp',output);};
 const cache=new Map(report.evaluations.map(e=>[signature(e.state),e]));
 const evaluate=(s,move)=>{
  const key=signature(s);if(!cache.has(key)){
   const value={state:s,move,...fast(build(s),stateModel.policies[s.policy])};cache.set(key,value);report.evaluations.push(value);
   if(cache.size%10===0){save();console.log('evaluated',cache.size,'best in cache',Math.min(...report.evaluations.map(v=>v.score)));}
  }return cache.get(key);
 };
 let current=report.history.at(-1);let value=evaluate(current.state,null);
 for(;;){
  const options=neighborhood(bundle,'full26',current.state);let best=value;
  for(const n of options){const candidate=evaluate(n.state,n.move);if(candidate.score<best.score-1e-10)best=candidate;}
  report.passes.push({anchorState:current.state,anchorScore:value.score,neighborCount:options.length,bestScore:best.score,
    moveCounts:options.reduce((s,n)=>(s[n.move.kind]=(s[n.move.kind]||0)+1,s),{})});
  if(best===value){report.finalOracleDifference=parity(current.state,value);break;}
  current={state:best.state,score:best.score,move:best.move};report.history.push(current);value=best;
  console.log('IMPROVED',best.score,JSON.stringify(best.move));save();
 }
 report.result={route:'full26',state:current.state,layout:build(current.state),...value};
 report.buckets=Object.fromEntries(['QZ','ZQ'].map(code=>[code,source.tokenKeys.filter((t,i)=>report.result.layout.tonedCodes[i]===code)]));
 report.complete=true;save();console.log(JSON.stringify({complete:true,evaluations:cache.size,history:report.history.map(h=>h.score),last:report.passes.at(-1)}));
}
if(require.main===module)main();
module.exports={setup};
