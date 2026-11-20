'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),{policyObjects}=require('./finalize_untoned_frontiers_r11'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-21-ued-robust-review');
const HTML='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html',ID='UED-18c004bd1f31';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function main(){
 const gridPath=PREFIX+'-grid.json',grid=read(gridPath);assert.ok(grid.completed);
 const scorePath=path.join(ROOT,'research/notes/2026-11-20-untoned-frontiers-r11-scores-'+ID+'.json'),score=read(scorePath);
 const performancePath=path.join(ROOT,'research/notes/2026-11-21-u7e-competing-'+ID+'.json'),performance=read(performancePath);
 const columnsPath=path.join(ROOT,'research/notes/2026-11-20-untoned-frontiers-r11-columns.json'),columns=read(columnsPath).schemes[ID];
 const data=scorer.loadPayload(HTML),entries=data.entries.filter(e=>e.id===ID);assert.equal(entries.length,1);const e=entries[0],p=e.productionCandidateMetrics,checks=[];
 const close=(actual,expected,label)=>{assert.ok(typeof actual==='number'&&Math.abs(actual-expected)<1e-10,label);checks.push(label);};
 const policies=policyObjects(grid.selectedPolicies);assert.deepEqual(e.initialMap,performance.initialMap);assert.deepEqual(e.finalMap,performance.finalMap);assert.deepEqual(e.codeList,performance.codeList);
 assert.deepEqual(auxiliarySemantics(e.tone),score.auxiliarySemantics);assert.equal(e.memoryAuditR2.M,41);assert.equal(p.memory,41);assert.equal(p.productionMetricVersion,'v52');
 assert.deepEqual(p.cktV52Policies.candidate,policies);assert.deepEqual(p.cktV51Policies.candidate,policies);assert.deepEqual(p.cktV52AuxOrderSelection.selectedPolicies,grid.selectedPolicies);
 close(p.replayedCktV52,performance.ckt[0],'production CKT v5.2');close(p.replayedCktV51,score.v51.score,'production CKT v5.1');close(p.cktV52CostDoubled,performance.ckt[1],'production doubled-cost v5.2');
 for(const[field,value]of Object.entries(performance.aggregate)){
  close(p.cktV52Aggregate[field],value,'production aggregate '+field);
  close(e.readmeBenchmarkMetrics['aggregate'+field[0].toUpperCase()+field.slice(1)],value,'readme aggregate '+field);
 }
 for(const[field,value]of Object.entries(score.v51.aggregate))close(p.cktV51Aggregate[field],value,'v5.1 aggregate '+field);
 for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])for(const[field,value]of Object.entries(grid.selectedTracks[mode][kind]))if(typeof value==='number'){
  close(p.cktV52Modes[mode][kind][field],value,mode+'/'+kind+'/'+field);
  close(data.cktV52.schemes[ID].v52.modes[mode][kind][field],value,'detail '+mode+'/'+kind+'/'+field);
 }
 close(data.cktV52.schemes[ID].v52.score,performance.ckt[0],'detail score');assert.deepEqual(data.cktV52.schemes[ID].contract.policies.candidate,policies);
 const panel=data.untonedFrontierPublication.rows.find(r=>r.id===ID);assert.deepEqual(panel.policies,grid.selectedPolicies);close(panel.score,performance.ckt[0],'frontier panel score');close(panel.two,performance.ckt[1],'frontier panel doubled');
 close(panel.rightPinky,performance.ergonomics.rightPinky,'frontier panel right pinky');close(panel.rightPinkyPeak,performance.ergonomics.peaks.rightPinky.value,'frontier panel right-pinky peak');
 const historicalFields=['s2FrequencyWeightedMiss','s2CompletionMeanKeys','s2CompletionCenterMs','s2DifferentKeySameFingerRate','dailyEightScenarioMovingHand','homeShareS2','homeFloor20Contracts','maxFingerPeak20Contracts','dailyMeanEffectiveDistance'];
 for(const field of historicalFields)close(e.readmeBenchmarkMetrics[field],columns.readmeBenchmarkMetrics[field],'frozen-contract '+field);
 const result={completed:true,id:ID,html:HTML,htmlSha256:hash(HTML),htmlName:e.name,selectedPolicies:grid.selectedPolicies,productionAggregates:performance.aggregate,productionCkt:performance.ckt,matchingNumericFields:checks.length,
  productionAndDetailFieldsMatch:true,historicalFieldsHaveIndependentContracts:true,
  separateContracts:[
   {columns:'当前 CKT ms/项、非首选权重、平均键数、异键同指、左右交替、右小指负担、主行占比',scope:'Current UI selected benchmark track (default S2 raw two-key common399), not fixed production 8-track mixture.'},
   {columns:'右小指20合同最高、左小指QAZ20合同最高、主行含形辅下限、含辅上下差、A7E-v1..v5',scope:'Historical frozen native contracts; word auxiliary orders and corpus contracts are their original definitions.'},
   {columns:'CKT v5 历史合同、键道/三拼 字/词+B1/B2',scope:'Historical completion contracts; does not claim 6-key v5.2 production order.'},
   {columns:'MX34 日常纯汉字、日常移手分',scope:'Frozen corpus raw double-pinyin strokes, excludes auxiliaries; hanzi-only and punctuation variants are distinct.'}
  ],changedHtml:false,sourceHashes:Object.fromEntries([__filename,gridPath,scorePath,performancePath,columnsPath,...['score_completion_ckt_v4.js','auxiliary_semantics.js','finalize_untoned_frontiers_r11.js'].map(f=>path.join(ROOT,'tools',f))].map(p=>[p,hash(p)]))};
 fs.writeFileSync(PREFIX+'-html.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
if(require.main===module)main();
