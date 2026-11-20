import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const {loadPayload}=require('../tools/score_completion_ckt_v4');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
const {IDS,prepare}=require('../tools/um40_r11');
const html=resolve('a7_CKT_R11.html');
const d=loadPayload(html),expected=prepare(html);
const audit=JSON.parse(readFileSync('research/notes/2026-11-20-um40-r11-publication.json','utf8'));
assert.equal(createHash('sha256').update(readFileSync(html)).digest('hex'),audit.htmlAfterSha256);
{
  const before=loadPayload(resolve('research/.cache/um40-r11-publication-20261120/before.html'));
  const originals=new Set(before.entries.map(e=>e.id));
  assert.deepEqual(d.entries.filter(e=>originals.has(e.id)),before.entries);
  for(const name of ['ensemble','ensembleV2','ensembleV3','ensembleV4','ensembleV5','ensembleV6',
    'fairCKT','macroxue'])for(const [id,value] of Object.entries(before[name].values))assert.deepEqual(d[name].values[id],value,name+'/'+id);
  for(const name of ['completionB','completionBFixed','completionBV2','completionBV3','completionBV4',
    'cktV52'])for(const [id,value] of Object.entries(before[name].schemes))assert.deepEqual(d[name].schemes[id],value,name+'/'+id);
  for(const [id,value] of Object.entries(before.ckt.tracks))assert.deepEqual(d.ckt.tracks[id],value,'ckt/'+id);
  for(const name of ['baselines','centerBaselines','trackWeights','shortContractWeights'])assert.deepEqual(d.ensembleV5[name],before.ensembleV5[name],name);
}
for(const c of expected){
  const e=d.entries.find(e=>e.id===c.id);assert.ok(e,c.id);
  assert.deepEqual(e.initialMap,c.initialMap);assert.deepEqual(e.finalMap,c.finalMap);
  assert.deepEqual(e.codeList,c.codeList);
  const codes=d.base.map(([i])=>e.codeList[i]);
  assert.equal(new Set(codes).size,399);assert.ok(!codes.includes('QZ'));
  assert.deepEqual(d.base.filter(([i])=>e.codeList[i]==='ZQ').map(([i])=>d.pinyin[i]),['zen']);
  assert.equal(e.memoryAuditR2.M,40);assert.equal(e.memoryAuditR2.ordinaryDisplacedCount,3);
  const sem=auxiliarySemantics(e.tone);
  assert.equal(sem.shapeKeysByMeaning,'AEUIO');
  assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),e.tone);
  assert.equal(sem.toneDigitsByShapeMeaning,'42310');
  assert.ok(Math.abs(e.productionCandidateMetrics.replayedCktV52-c.expected.score)<1e-9);
  assert.ok(Math.abs(e.productionCandidateMetrics.doubledCktV52-c.expected.doubledScore)<1e-9);
  for(const block of ['completionB','completionBFixed','completionBV2','completionBV3','completionBV4'])assert.ok(d[block].schemes[c.id],block+'/'+c.id);
  assert.equal(Object.keys(d.ckt.tracks[c.id]).length,20);
  for(const [track,old] of Object.entries(c.comparison.legacyLoads.tracks))assert.ok(Math.abs(d.ckt.tracks[c.id][track].home-old.home)<1e-12,c.id+'/'+track+' home');
  assert.ok(e.fourCodeCollision&&e.terminalBucketAudit);
}
assert.equal(audit.catalogueAfter,d.entries.length);
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1650,height:1150}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
  await page.goto(pathToFileURL(html).href,{timeout:120000});
  await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});
  await page.locator('#tabs [data-action="nav:scheme"]').click();
  for(const id of IDS){
    await page.locator('#nf6SchemeQuery').fill(id);
    await page.locator('#nf6SchemeList').selectOption(id);
    await page.waitForFunction(id=>window.App7.current().id===id,id);
    assert.equal(await page.locator('#um40OriginalTrio').count(),1);
    const panel=page.locator('#um40OriginalTrio');
    assert.equal(await panel.getAttribute('data-scheme'),id);
    assert.equal(await panel.locator('tbody tr').count(),3);
    const text=await panel.textContent();
    for(const c of expected){assert.ok(text.includes(c.id));assert.ok(text.includes(c.expected.score.toFixed(9)));assert.ok(text.includes(c.expected.doubledScore.toFixed(9)));}
    assert.equal(await page.locator('#cktV52Detail').getAttribute('data-scheme'),id);
  }
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.locator('#uxQuery').evaluate(n=>{n.value='UM40';n.dispatchEvent(new Event('input',{bubbles:true}))});
  const table=page.locator('table[data-ux-table="benchmark"]');
  await table.waitFor();
  for(const c of expected){
    const row=table.locator(`tr[data-dv-scheme="${c.id}"]`);
    assert.equal(await row.count(),1,c.id);
    assert.equal(await row.locator(`[data-ckt-v52-id="${c.id}"]`).textContent(),c.expected.score.toFixed(9));
  }
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);
  const csv=readFileSync(await download.path(),'utf8');
  for(const id of IDS)assert.ok(csv.includes(id));
  assert.match(csv,/CKT v5\.2/);
  await page.locator('[data-action="fair"]').click();
  for(const id of IDS)assert.equal(await page.locator(`table[data-ux-table="fair"] [data-ckt-v52-id="${id}"]`).count(),1,id);
  assert.deepEqual(errors,[]);
  const result={ids:IDS,checks:['layout maps','399 unique','QZ empty/ZQ zen','M40 D3','auxiliary round trip',
    '20 native tracks','all completion columns','default and doubled scores','scheme selector','detail trio','benchmark rows','CSV','fair table'],pageErrors:errors};
  writeFileSync('research/.cache/um40-r11-publication-20261120/browser-check.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser.close()}
