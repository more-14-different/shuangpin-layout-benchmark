import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const id='RC26-39a5bfdc045342cd';
function payload(file){const html=fs.readFileSync(file,'utf8');return JSON.parse(zlib.gunzipSync(Buffer.from(html.match(/<script id="payload"[^>]*>([^<]+)/)[1],'base64')));}
const data=payload('a7_CKT_R11.html');
const maps=d=>({ensemble:d.ensemble.values,ensembleV2:d.ensembleV2.values,ensembleV3:d.ensembleV3.values,ensembleV4:d.ensembleV4.values,ensembleV5:d.ensembleV5.values,ensembleV6:d.ensembleV6.values,ckt:d.ckt.tracks,fair:d.fairCKT.values,load:d.r11LoadSummaries,pair:d.r11PairMetrics.values,eligibility:d.r11Eligibility,macro:d.macroxue.values,...Object.fromEntries(['completionB','completionBFixed','completionBV2','completionBV3','completionBV4'].map(k=>[k,d[k].schemes]))});
test('candidate A has actual values in all benchmark maps and eight native B paths',()=>{
 const e=data.entries.find(e=>e.id===id);assert.ok(e);for(const[name,m]of Object.entries(maps(data)))assert.ok(m[id],name);
 assert.equal(Object.keys(data.ckt.tracks[id]).length,20);assert.equal(Object.keys(e.bPathMetricsNative).length,8);assert.ok(Object.values(e.bPathMetricsNative).every(Number.isFinite));
 assert.equal(e.memoryAuditR2.M,40);assert.equal(e.memoryAuditR2.unique,399);const codes=data.base.map(([p])=>e.codeList[p]);assert.ok(!codes.includes('QZ')&&!codes.includes('ZQ'));assert.equal(e.tone,'IEUAO');
 const sem=createRequire(import.meta.url)('../tools/auxiliary_semantics.js').auxiliarySemantics(e.tone);assert.equal(sem.shapeKeysByMeaning,'AEUIO');assert.equal(sem.toneDigitsByShapeMeaning,'42310');
});
test('candidate A reproduces independent anchors and fixed-policy native CKT',()=>{
 const m=data.entries.find(e=>e.id===id).productionCandidateMetrics;
 assert.ok(Math.abs(m.replayedCktV51-9.082777229838413)<1e-12);
 assert.ok(Math.abs(data.ensembleV4.values[id].score-10.65130184996203)<1e-10);
 assert.ok(Math.abs(data.ensembleV5.values[id].score-10.203924915744143)<1e-10);
 assert.equal(m.cktV51Policies.candidate.keytao.word3,'12');assert.equal(m.cktV51BalanceContract,'soft-page-fill-v2');assert.equal(m.cktV51AuxOrderRobustness,undefined);
 assert.ok(Math.abs(m.cktV51Aggregate.cognitiveMs-(m.cktV51Aggregate.effectiveMs-m.cktV51Aggregate.motorUpperMs))<1e-12);
});
test('adding A preserves existing schemes and all existing benchmark values',()=>{
 const file='research/.cache/candidate-a-before.html';assert.ok(fs.existsSync(file),'Original HTML snapshot required');const before=payload(file);assert.equal(data.entries.length,before.entries.length+1);
 const afterMaps=maps(data);for(const[name,m]of Object.entries(maps(before)))for(const e of before.entries)assert.deepEqual(afterMaps[name][e.id],m[e.id],name+':'+e.id);
 assert.deepEqual(data.tonedContractBenchmark,before.tonedContractBenchmark);
});
test('candidate A can be selected and rendered in the HTML',async()=>{
 const {chromium}=createRequire(import.meta.url)('playwright');const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try{await page.goto(pathToFileURL(path.resolve('a7_CKT_R11.html')).href,{waitUntil:'load',timeout:120000});await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});await page.locator('#tabs [data-action="nav:scheme"]').click();await page.locator('#nf6SchemeQuery').fill(id);await page.locator('#nf6SchemeList').selectOption(id);await page.waitForFunction(id=>window.App7.current().id===id,id);assert.equal(await page.locator('#view h2').first().innerText(),id);const text=await page.locator('#view').innerText();assert.match(text,/综合候选 A/);assert.equal(await page.locator('#svgbox svg').count(),1);assert.ok(Math.abs(await page.evaluate(()=>window.App7.current().productionCandidateMetrics.replayedCktV51)-9.082777229838413)<1e-12);assert.deepEqual(errors,[]);await page.screenshot({path:'research/.cache/candidate-a-preview.png',fullPage:false});}finally{await browser.close();}
});
