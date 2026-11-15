import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const candidates={A:{id:'RC26-39a5bfdc045342cd',score:9.082777229838413,a4:10.65130184996203,a5:10.203924915744143},C:{id:'RC26-eeb7b9a25a90cadd',score:9.07926885388391,a4:10.658933045653725,a5:10.29830777190428}};
function payload(file){const html=fs.readFileSync(file,'utf8');return JSON.parse(zlib.gunzipSync(Buffer.from(html.match(/<script id="payload"[^>]*>([^<]+)/)[1],'base64')));}
const data=payload('a7_CKT_R11.html');
const maps=d=>({ensemble:d.ensemble.values,ensembleV2:d.ensembleV2.values,ensembleV3:d.ensembleV3.values,ensembleV4:d.ensembleV4.values,ensembleV5:d.ensembleV5.values,ensembleV6:d.ensembleV6.values,ckt:d.ckt.tracks,fair:d.fairCKT.values,load:d.r11LoadSummaries,pair:d.r11PairMetrics.values,eligibility:d.r11Eligibility,macro:d.macroxue.values,...Object.fromEntries(['completionB','completionBFixed','completionBV2','completionBV3','completionBV4'].map(k=>[k,d[k].schemes]))});
for(const[label,c]of Object.entries(candidates)){
 test(`candidate ${label} has complete metrics and correct auxiliary semantics`,()=>{
  const e=data.entries.find(e=>e.id===c.id);assert.ok(e);for(const[name,m]of Object.entries(maps(data)))assert.ok(m[c.id],name);
  assert.equal(Object.keys(data.ckt.tracks[c.id]).length,20);assert.equal(Object.keys(e.bPathMetricsNative).length,8);assert.ok(Object.values(e.bPathMetricsNative).every(Number.isFinite));
  assert.equal(e.memoryAuditR2.M,40);assert.equal(e.memoryAuditR2.unique,399);const codes=data.base.map(([p])=>e.codeList[p]);assert.ok(!codes.includes('QZ')&&!codes.includes('ZQ'));assert.equal(new Set(codes).size,399);
  const sem=createRequire(import.meta.url)('../tools/auxiliary_semantics.js').auxiliarySemantics(e.tone);assert.equal(sem.shapeKeysByMeaning,'AEUIO');assert.equal(sem.toneKeysByTone,'IEUAO');assert.equal(sem.toneDigitsByShapeMeaning,'42310');
 });
 test(`candidate ${label} uses verified robust policies and freshly rebuilt benchmark`,()=>{
  const e=data.entries.find(e=>e.id===c.id),m=e.productionCandidateMetrics,r=m.cktV51AuxOrderRobustness;
  assert.ok(Math.abs(m.replayedCktV51-c.score)<1e-12);assert.ok(Math.abs(data.ensembleV4.values[c.id].score-c.a4)<1e-10);assert.ok(Math.abs(data.ensembleV5.values[c.id].score-c.a5)<1e-10);
  assert.deepEqual(m.cktV51Policies.candidate,{keytao:{word2:'12',word3:'12',word4:'24'},sanpin:{word2:'12',word3:'21',word4:'13'}});assert.equal(m.cktV51BalanceContract,'soft-page-fill-v2');assert.equal(r.grid.points,1771561);assert.equal(r.cases.keytao.winner.policy,'12/12/24');assert.equal(r.cases.sanpin.winner.policy,'12/21/13');assert.ok(r.cases.keytao.meanRankDistance>0&&r.cases.sanpin.meanRankDistance>0);
  assert.deepEqual(m.cktV5Policies.candidate,m.cktV51Policies.candidate);assert.ok(Number.isFinite(m.replayedCktV5));
  assert.ok(!e.notes.some(n=>n.includes('未做候选专属辅序稳健性扫描')));assert.ok(e.notes.some(n=>n.includes('稳健冠军')));
  const audit=JSON.parse(fs.readFileSync(`research/notes/2026-11-15-untoned-2126-candidate-${label.toLowerCase()}-r11.json`,'utf8'));
  assert.equal(audit.preservationPassed,true);assert.equal(audit.refreshFromOriginalRows,true);assert.equal(audit.fixedNativeV51.maximumAbsoluteDifference,0);
  assert.deepEqual(audit.cktTracks,data.ckt.tracks[c.id]);assert.deepEqual(audit.productionCandidateMetrics,m);
  assert.ok(Math.abs(m.cktV51Aggregate.cognitiveMs-(m.cktV51Aggregate.effectiveMs-m.cktV51Aggregate.motorUpperMs))<1e-12);
 });
}
test('refreshing A and adding C preserves all unrelated entries, benchmark values and toned schemes',()=>{
 const before=payload('research/.cache/candidate-ac-before.html'),targetIds=new Set(Object.values(candidates).map(c=>c.id));assert.equal(data.entries.length,before.entries.length+1);
 const afterMaps=maps(data);for(const e of before.entries){if(targetIds.has(e.id))continue;for(const[name,m]of Object.entries(maps(before)))assert.deepEqual(afterMaps[name][e.id],m[e.id],name+':'+e.id);const next=data.entries.find(x=>x.id===e.id);assert.deepEqual(next,e,'entry:'+e.id);}
 assert.deepEqual(data.tonedContractBenchmark,before.tonedContractBenchmark);
});
test('both robust candidates can be selected and rendered in the HTML',async()=>{
 const {chromium}=createRequire(import.meta.url)('playwright');const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try{await page.goto(pathToFileURL(path.resolve('a7_CKT_R11.html')).href,{waitUntil:'load',timeout:120000});await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});await page.locator('#tabs [data-action="nav:scheme"]').click();for(const[label,c]of Object.entries(candidates)){await page.locator('#nf6SchemeQuery').fill(c.id);await page.locator('#nf6SchemeList').selectOption(c.id);await page.waitForFunction(id=>window.App7.current().id===id,c.id);assert.equal(await page.locator('#view h2').first().innerText(),c.id);assert.match(await page.locator('#view').innerText(),new RegExp('候选 '+label));assert.equal(await page.locator('#svgbox svg').count(),1);assert.ok(Math.abs(await page.evaluate(()=>window.App7.current().productionCandidateMetrics.replayedCktV51)-c.score)<1e-12);await page.screenshot({path:`research/.cache/candidate-${label.toLowerCase()}-robust-preview.png`,fullPage:false});}assert.deepEqual(errors,[]);}finally{await browser.close();}
});
