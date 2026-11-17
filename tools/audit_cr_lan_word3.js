'use strict';
// Exact row identity, not just matching rounded peak percentages.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const scorer=require('./score_completion_ckt_v4'),toned=require('./score_toned_2121_ckt_v51');
const prefix=process.argv[2]||'research/notes/2026-11-17-cr-lan-fixed';
const bundle=JSON.parse(fs.readFileSync(prefix+'-finalists.json','utf8'));
const native=JSON.parse(fs.readFileSync(prefix+'-native.json','utf8'));
const data=scorer.loadPayload('a7_CKT_R11.html');
const words=scorer.multiwords('D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml',data,.99);
const model=require('./ckt_v4_model'),nativeMetric=require('./score_snow_jiandao_toned_benchmark');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
let fingerprint,count;const results=[];
for(const layout of bundle.layouts){
  const rows=toned.buildWordRows(layout,bundle,data,words,'IVUAO','word3','231');
  const digest=hash(JSON.stringify(rows));
  if(fingerprint)assert.equal(digest,fingerprint,'fixed-onset word3 generated rows must be identical');
  else {fingerprint=digest;count=rows.length;}
  const actual=native.results.find(r=>r.id===layout.id);
  assert.ok(Math.abs(actual.fixed.ergonomics.tracks.word3.leftPinkyQAZ-.09060178865841471)<1e-12);
  results.push({id:layout.id,word3RowsSha256:digest,leftPinky:actual.fixed.ergonomics.tracks.word3.leftPinkyQAZ,
    word3EffectiveMs:actual.fixed.tracks.word3.effectiveMs});
}
const root='D:/C2D/Documents/rime-snow-pinyin';
const untoned=JSON.parse(fs.readFileSync(path.join(root,'config/shenyun-21x26-mapping.json'),'utf8'));
const toned26=JSON.parse(fs.readFileSync(path.join(root,'config/snow-zhudao-mapping.json'),'utf8'));
assert.deepEqual(untoned.initialMap,toned26.initialMap);
const polishedSource=toned26.sourcePublication.source;
const motor=toned.projectedMotor(data);
const strokes=scorer.strokeOptions(path.join(root,'rime-stroke/stroke.dict.yaml'));
const reference=toned.buildReference({data,words,strokes,motor,snow:root});
const word3OrderAudit=['123','132','213','231','312','321'].map(order=>{
  const rows=toned.buildWordRows(bundle.layouts[0],bundle,data,words,'IVUAO','word3',order);
  const outcomes=model.resolveCompetition(rows,{motorCost:motor}),metric=nativeMetric.loadMetric(outcomes);
  return {order,leftPinky:metric.leftPinkyQAZ,rightPinky:metric.rightPinky,metric:reference.summarize(outcomes)};
});
const historyCommit='cd5497a5d11ae3fa7fb0c58636aa67402a5b24ca';
const historical=p=>execFileSync('git',['show',historyCommit+':'+p],{encoding:'utf8'});
const polishedBytes=execFileSync('git',['show',historyCommit+':'+polishedSource]);
assert.equal(hash(polishedBytes),toned26.sourcePublication.sourceSha256,'historical polished artifact must match production provenance');
const historicalFiles=['tools/prepare_anneal_2126.js','tools/anneal_2126_model.js','tools/anneal_2126.py','tools/polish_full26.js'];
const code=Object.fromEntries(historicalFiles.map(p=>[p,historical(p)]));
assert.ok(code['tools/prepare_anneal_2126.js'].includes('first:source.results[0].layout.tonedCodes[i][0]'));
assert.ok(code['tools/anneal_2126_model.js'].includes('t.first + ROWS['));
assert.ok(code['tools/anneal_2126.py'].includes('self.first = xp.asarray([ord(t[\'first\'])-65'));
assert.ok(code['tools/polish_full26.js'].includes('first:source.layout.tonedCodes[i][0]'));
const report={version:'cr-lan-word3-invariance-v1',word3Rows:count,word3RowsSha256:fingerprint,results,
  scope:'fixed complete onset map, fixed 231 shape order, same native 2121-v5.1 corpus and independent word3 competition; generated word3 rows use no rhyme keys',
  strictLeftCeiling:bundle.profiles.speed.pinkyCeiling,unavoidableWord3LeftPinky:.09060178865841471,
  word3OrderAudit,word3Reference:reference.tracks.word3,minimumWord3LeftAcrossSixOrders:Math.min(...word3OrderAudit.map(r=>r.leftPinky)),
  infeasibleUnderStrictLeftCeiling:.09060178865841471>bundle.profiles.speed.pinkyCeiling+1e-12,
  comparison2126:{initialMapsExactlyEqual:true,atoms:Object.keys(untoned.initialMap).length,
    availableEarlySearchInheritsUntonedFirstKeys:true,polishedSource,polishedSourceAvailableInWorktree:fs.existsSync(polishedSource),
    historicalCommit:historyCommit,historicalPolishedSha256:hash(polishedBytes),productionSourceHashMatches:true,
    historicalCodeSha256:Object.fromEntries(historicalFiles.map(p=>[p,hash(code[p])])),
    independenceConclusion:'the production-matching historical anneal and polish freeze token first keys inherited from the untoned input; this is not evidence of two unconstrained onset searches independently converging'}};
fs.writeFileSync(prefix+'-word3-invariance.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({word3Rows:count,hash:fingerprint,leftPinky:report.unavoidableWord3LeftPinky,infeasible:report.infeasibleUnderStrictLeftCeiling}));
