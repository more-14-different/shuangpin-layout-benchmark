'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52');
const {rebuild,audit}=require('./untoned_r2_search_metrics');
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..');
const reportFile=path.join(ROOT,'research/notes/2026-11-20-untoned-r2-onsets-v52-search.json');
const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile);
const refs=v52.evaluateUntoned(data.entries.find(e=>e.id==='S005'),{keytao:{word2:'12',word3:'213',word4:'24'},sanpin:{word2:'12',word3:'213',word4:'23'}},null,ctx).v52;
const scale=(m,x)=>Object.fromEntries(Object.entries(x).map(([mode,tracks])=>[mode,Object.fromEntries(Object.entries(tracks).map(([kind,t])=>[kind,{...t,effectiveMs:t.motorUpperMs+m*(t.effectiveMs-t.motorUpperMs)}]))]));
const selected=[...new Set([report.best1,report.best2,report.bestExact26_1,report.bestExact26_2,report.bestComfort1,report.bestComfort2].filter(Boolean))];
const verified=[];
const auditor=require('./audit_untoned_r2_ergonomics').independentAuditor(data);
const independentBaseline=auditor(data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED'));
assert.ok(Math.abs(independentBaseline.a7eV4-10.670635896300677)<1e-10);
for(const key of selected){
 const r=report.finalists.find(r=>r.key===key);assert.ok(r);
 assert.deepEqual(r.state.slice(0,27).map(i=>String.fromCharCode(65+i)),HEADS.map(h=>report.initialMap[h]));
 const id='UR2-V52-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,12);
 const e=rebuild({...data.entries.find(e=>e.id==='RC26-39a5bfdc045342cd'),id,initialMap:{...report.initialMap},finalMap:{...r.finalMap}},data);
 const semantics=auxiliarySemantics(e.tone);assert.equal(semantics.shapeKeysByMeaning,'AEUIO');assert.equal(semantics.toneDigitsByShapeMeaning,'42310');
 const a=audit(e,data);assert.deepEqual(a,r.audit);assert.ok(a.unique<399);assert.ok(a.valid&&!a.qz&&!a.zq&&a.M<=40&&a.D<=3&&a.V<=1&&a.branches===0);
 const result=v52.evaluateUntoned(e,report.contract.policies,{pageSize:6,maximumCandidates:120,minimumInputLength:4},ctx);
 for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])for(const [field,value] of Object.entries(r.modes[mode][kind]))if(typeof value==='number'){
  const next=result.v52[mode][kind][field];assert.ok(Math.abs(value-next)<1e-7,`${key}/${mode}/${kind}/${field}: ${value} != ${next}`);
 }
 const score=v52.scoreModes(result.v52,refs),score2=v52.scoreModes(scale(2,result.v52),scale(2,refs));assert.ok(Math.abs(score-r.score)<1e-10);assert.ok(Math.abs(score2-r.score2)<1e-10);
 const independent=auditor(e),independentPass=independent.a7eV4<=independentBaseline.a7eV4+1e-12&&independent.tracks.S2.e34<=independentBaseline.tracks.S2.e34+1e-12;
 const row={key,id,score,score2,actualSoundKeys:new Set(HEADS.map(h=>e.initialMap[h])).size,actualRhymeKeys:new Set(FINALS.map(f=>e.finalMap[f])).size,audit:a,erg:r.erg,strictComfort:r.strictComfort,independent,independentPass,productionAdmissible:r.strictComfort&&independentPass,semantics,initialMap:e.initialMap,finalMap:e.finalMap,modesV52:result.v52,description1:v52.describe(result.v52,refs),description2:v52.describe(scale(2,result.v52),scale(2,refs))};
 verified.push(row);console.log(JSON.stringify({verified:row.id,score,score2,unique:a.unique}));
}
const sources=['a7_CKT_R11.html',profile,'tools/ckt_v4_upstream_role_tables.json','tools/score_ckt_v52.js','tools/ckt_block_error.js','tools/score_completion_ckt_v4.js','tools/export_untoned_r2_v52_templates.js','tools/audit_untoned_r2_ergonomics.js','research/.cache/R11_integrated_replay/script1.js','research/.cache/R11_integrated_replay/script2.js','research/.cache/R11_integrated_replay/track_options.json','research/ckt-v4-core/src/bin/score-untoned-r2-v52-stream.rs',__filename];
const sourceHashes=Object.fromEntries(sources.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(ROOT,p))).digest('hex')]));
fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-20-untoned-r2-onsets-v52-verification.json'),JSON.stringify({complete:true,searchCompleted:report.completed,exactlyScored:report.exactlyScored,comparison:'Rust full eight-track outcomes versus independent JS full v5.2 replay; 1x/2x all six cognitive costs for both candidate and S005',sourceHashes,independentBaseline,verified},null,2)+'\n');
