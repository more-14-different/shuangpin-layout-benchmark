'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4'),toned=require('./score_toned_2121_ckt_v51');
const model=require('./ckt_v4_model'),native=require('./score_snow_jiandao_toned_benchmark');
const weights={character:1,word2:3,word3:1,word4:1};
const pairs=n=>Array.from({length:n},(_,i)=>i+1).flatMap(a=>Array.from({length:n},(_,i)=>i+1).filter(b=>a!==b).map(b=>''+a+b));
const permutations=items=>items.length<=1?[items.join('')]:items.flatMap((a,i)=>permutations(items.filter((_,j)=>j!==i)).map(t=>a+t));
function effective(metric,auxiliary,selection){
  return metric.motorUpperMs+auxiliary*(metric.firstAuxRate+metric.secondAuxRate+metric.thirdAuxRate)+
    selection*metric.selectionRate+50*metric.meanRejectedCandidates+300*metric.meanPageActions;
}
function sensitivityScore(tracks,reference,auxiliary,selection){
  let sum=0;for(const [kind,w] of Object.entries(weights))sum+=w*(effective(tracks[kind],auxiliary,selection)/effective(reference[kind],auxiliary,selection))**4;
  return 10*(sum/6)**.25;
}
function chooseRobust(rows,cases){
  const floors=cases.map((_,i)=>Math.min(...rows.map(r=>r.caseScores[i])));
  return rows.map(row=>({...row,worstRegret:Math.max(...row.caseScores.map((s,i)=>s/floors[i]-1)),
    meanRegret:row.caseScores.reduce((sum,s,i)=>sum+s/floors[i]-1,0)/cases.length}))
    .sort((a,b)=>a.worstRegret-b.worstRegret||a.meanRegret-b.meanRegret||a.score-b.score);
}
async function main(){
  const option=(key,fallback)=>{const i=process.argv.indexOf('--'+key);return i<0?fallback:process.argv[i+1]};
  const data=scorer.loadPayload(option('html','a7_CKT_R11.html')),snow='D:/C2D/Documents/rime-snow-pinyin';
  const macroOutput=option('macro-output',null);
  if(macroOutput)fs.writeFileSync(macroOutput,JSON.stringify({pinyin:data.pinyin,characters:data.characters,
    macroxue:{corpora:data.macroxue.corpora}})+'\n');
  delete data.tonedContractBenchmark;
  const words=scorer.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99);
  const strokes=scorer.strokeOptions(path.join(snow,'rime-stroke/stroke.dict.yaml'));
  const motor=toned.projectedMotor(data),reference=toned.buildReference({data,words,strokes,motor,snow});
  const archive=require('../research/config/cr-frontier-finalists.json');
  const original={speed:archive.finalists.find(r=>r.role==='global_ckt_minimum').item,
    balanced:archive.finalists.find(r=>r.role==='balanced_daily_king').item,daily:archive.finalists.find(r=>r.role==='ultra_high_daily').item};
  const file=option('layouts',null);let bundle;
  if(file)bundle=JSON.parse(fs.readFileSync(file,'utf8'));
  else{
    const fixtures=Object.entries(original).map(([profile,item])=>{const id='CR-GPU-'+item.key.slice(0,10);
      const fixture=JSON.parse(fs.readFileSync('a7_CKT_R11_integrated_materials/cr_gpu_frontier/'+id+'.fixture.json','utf8'));
      const adapted=native.fixtureAdapter(fixture,data);return {...adapted,profile,metrics:item.metrics};});
    bundle={tokenKeys:fixtures[0].inventory.tokenKeys,layouts:fixtures.map(f=>({...f.layout,profile:f.profile,rustScore:f.metrics.ckt}))};
  }
  const cases=[200,300,400].flatMap(auxiliary=>[300,600,900].map(selection=>({auxiliary,selection})));
  const result={version:'cr-frontier-auxiliary-policy-v1',contract:{shapeKeysByMeaning:'AVUIO',toneKeysByTone:'IVUAO',
    reference:'S005 fixed 12/213/24; native four tracks 1:3:1:1',memory:'sound-rule M-T1 unchanged; auxiliary-order learning is outside this ledger',
    sensitivity:'same frequency-ranked routing and motor outcomes; recompute cognitive costs and S005 reference for each case'},
    sourceHashes:Object.fromEntries([option('html','a7_CKT_R11.html'),'tools/ckt_v4_upstream_role_tables.json',__filename,
      path.join(snow,'snow_pinyin.base.dict.yaml'),path.join(snow,'rime-stroke/stroke.dict.yaml'),
      ...(file?[file]:Object.values(original).map(item=>'a7_CKT_R11_integrated_materials/cr_gpu_frontier/CR-GPU-'+item.key.slice(0,10)+'.fixture.json'))]
      .map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),cases,results:[]};
  const output=option('output','research/notes/2026-11-16-cr-frontier-followup-auxiliary.json');
  const selected=option('ids',null)?.split(','),layouts=bundle.layouts.filter(layout=>!selected||selected.includes(layout.id));
  if(selected&&layouts.length!==selected.length)throw Error('unknown requested layout IDs');
  for(const layout of layouts){
    const summarize=rows=>({metric:reference.summarize(rows),pinky:native.loadMetric(rows).leftPinkyQAZ});
    const chars=summarize(model.resolveCompetition(toned.buildCharacterRows(layout,bundle,data,'IVUAO'),{motorCost:motor}));
    const three=new Map(permutations(['1','2','3']).map(order=>[order,summarize(model.resolveCompetition(
      toned.buildWordRows(layout,bundle,data,words,'IVUAO','word3',order),{motorCost:motor}))]));
    const w2=new Map(pairs(2).map(order=>[order,toned.buildWordRows(layout,bundle,data,words,'IVUAO','word2',order)]));
    const w4=new Map(pairs(4).map(order=>[order,toned.buildWordRows(layout,bundle,data,words,'IVUAO','word4',order)]));
    const rows=[];
    for(const [word2,a] of w2)for(const [word4,b] of w4){
      const outcomes=model.resolveCompetition([...a,...b],{motorCost:motor});
      const two=summarize(outcomes.filter(r=>r.kind==='word2')),four=summarize(outcomes.filter(r=>r.kind==='word4'));
      for(const [word3,third] of three){
        const tracks={character:chars.metric,word2:two.metric,word3:third.metric,word4:four.metric};
        rows.push({policy:{word2,word3,word4},score:toned.normalizedScore(tracks,reference.tracks),
          pinky:Math.max(chars.pinky,two.pinky,third.pinky,four.pinky),tracks,
          caseScores:cases.map(c=>sensitivityScore(tracks,reference.tracks,c.auxiliary,c.selection))});
      }
    }
    const anchor=layout.wordAuxiliaryPolicy||{word2:'12',word3:'213',word4:'24'};
    const baseline=rows.find(r=>['word2','word3','word4'].every(kind=>r.policy[kind]===anchor[kind]));
    if(Math.abs(baseline.score-layout.rustScore)>1e-9)throw Error('fixed-policy anchor mismatch '+layout.id);
    for(const row of rows)for(const kind of Object.keys(weights))
      if(row.tracks[kind].count!==baseline.tracks[kind].count||row.tracks[kind].totalWeight!==baseline.tracks[kind].totalWeight)
        throw Error('auxiliary policy changed the evaluated cohort: '+layout.id+'/'+kind);
    const ceiling=layout.constraints?.pinkyCeiling??(layout.profile==='speed'?1:original[layout.profile].metrics.pinky);
    const eligible=rows.filter(r=>r.pinky<=ceiling+1e-12),standard=[...eligible].sort((a,b)=>a.score-b.score)[0];
    const robust=chooseRobust(eligible,cases)[0];
    const preserving=rows.filter(r=>r.pinky<=baseline.pinky+1e-12).sort((a,b)=>a.score-b.score)[0];
    const verify=row=>{const v=toned.evaluateLayoutPolicy({layout,layouts:bundle,data,words,motor,reference,
      shapeKeysByMeaning:'AVUIO',policy:row.policy});
      if(Math.abs(v.score-row.score)>1e-9)throw Error('policy score mismatch');
      for(const kind of Object.keys(weights))for(const field of ['effectiveMs','meanKeys','selectionRate'])
        if(Math.abs(v.tracks[kind][field]-row.tracks[kind][field])>1e-9)throw Error('factorized/full track mismatch');
      const ergonomics=native.loadSummary(v.outcomes);
      if(Math.abs(ergonomics.leftPinkyQAZPeak4NativeTracks.value-row.pinky)>1e-12)throw Error('policy load mismatch');
      return {...row,ergonomics,aggregate:native.weightedAggregate(v.tracks,
        ['effectiveMs','motorUpperMs','meanKeys','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions'])};};
    const item={id:layout.id,profile:layout.profile,policyCount:rows.length,eligiblePolicyCount:eligible.length,cohortEqualityVerified:true,pinkyCeiling:ceiling,
      baseline,baselineVerified:verify(baseline),bestStandard:verify(standard),bestRobust:verify(robust),bestPinkyPreserving:verify(preserving),policies:rows};
    result.results.push(item);fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({id:item.id,before:baseline.score,standard:standard.score,standardPolicy:standard.policy,
      robust:robust.score,robustPolicy:robust.policy,worstRegret:robust.worstRegret}));
  }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={pairs,permutations,effective,sensitivityScore,chooseRobust};
