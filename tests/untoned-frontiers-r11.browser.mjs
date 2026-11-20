import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require('playwright');
const prefix='research/notes/2026-11-20-untoned-frontiers-r11';
const publication=JSON.parse(readFileSync(prefix+'-publication.json','utf8'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1800,height:1250}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
  await page.goto(pathToFileURL(publication.html).href,{timeout:120000});
  await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});
  const panel=page.locator('#untonedFrontierPublication');
  assert.equal(await panel.count(),1);
  assert.equal(await panel.locator('tbody tr').count(),8);
  for(const row of publication.rows){
    const cells=await panel.locator(`tr[data-frontier-id="${row.id}"] td`).allTextContents();
    assert.equal(Number(cells[1]),row.M);
    for(const [column,field] of [[2,'score'],[3,'two'],[4,'optimal1'],[5,'optimal2']])
      assert.ok(Math.abs(Number(cells[column])-row[field])<1e-9);
    assert.equal(cells[6],(100*row.rightPinky).toFixed(2)+'%');
    assert.equal(cells[7],(100*row.rightPinkyPeak).toFixed(2)+'%');
    await panel.locator(`[data-ux-pick="${row.id}"]`).click();
    await page.waitForFunction(id=>window.App7.current().id===id,row.id);
    assert.equal(await page.locator('#cktV52Detail').getAttribute('data-scheme'),row.id);
    assert.equal(await page.locator('#cktV52Detail [data-ux-table="ckt-v52-tracks"] tbody tr').count(),12);
    assert.ok(await page.locator('#view svg').count()>0);
    await page.locator('#tabs [data-action="nav:benchmark"]').click();
    await page.locator('#uxQuery').evaluate((n,id)=>{
      n.value=id;n.dispatchEvent(new Event('input',{bubbles:true}));
    },row.id);
    const bench=page.locator(`table[data-ux-table="benchmark"] tr[data-dv-scheme="${row.id}"]`);
    await bench.waitFor();
    const score=Number(await bench.locator('[data-ckt-v52-id]').textContent());
    assert.ok(Math.abs(score-row.score)<1e-8,`${row.id}: benchmark score`);
    const fields=await bench.locator('[data-production-attribute]').evaluateAll(nodes=>
      Object.fromEntries(nodes.map(n=>[n.dataset.productionAttribute,Number(n.textContent.replace('%',''))])));
    const replay=JSON.parse(readFileSync(prefix+'-scores-'+row.id+'.json','utf8'));
    for(const field of ['motorUpperMs','effectiveMs'])
      assert.ok(Math.abs(fields[field]-replay.v52.aggregate[field])<1e-5,`${row.id}: ${field}`);
    checks.push({id:row.id,M:row.M,score,productionAttributes:fields,detailRows:12,keyboardRendered:true});
  }
  const [download]=await Promise.all([
    page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()
  ]);
  const csv=readFileSync(await download.path(),'utf8');
  assert.ok(csv.includes(publication.rows.at(-1).id));
  assert.match(csv,/CKT v5\.2/);
  assert.deepEqual(errors,[]);
  assert.equal(hash(publication.html),publication.htmlAfterSha256);
  const result={completed:true,htmlSha256:hash(publication.html),catalogue:publication.catalogue,
    checks,csvExport:true,pageErrors:errors,
    sourceHashes:{'tests/untoned-frontiers-r11.browser.mjs':hash('tests/untoned-frontiers-r11.browser.mjs'),
      [prefix+'-publication.json']:hash(prefix+'-publication.json')}};
  writeFileSync(prefix+'-browser.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser.close();}
