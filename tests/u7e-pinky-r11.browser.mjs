import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const prefix='research/notes/2026-11-21-u7e-pinky-r11',publication=JSON.parse(readFileSync(prefix+'-publication.json','utf8'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1800,height:1250}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(pathToFileURL(publication.html).href,{timeout:120000});await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});
 const panel=page.locator('#untonedFrontierPublication');assert.equal(await panel.count(),1);assert.equal(await panel.locator('tbody tr').count(),publication.displayRows.length);
 for(const row of publication.displayRows){const cells=await panel.locator(`tr[data-frontier-id="${row.id}"] td`).allTextContents();assert.equal(cells.length,13);for(const f of ['score','two','three','five','optimal1','optimal2'])assert.ok(Math.abs(Number(await panel.locator(`tr[data-frontier-id="${row.id}"] [data-pinky-cost="${f}"]`).textContent())-row[f])<1e-9,`${row.id}/${f}`);}
 for(const row of publication.rows){
  const replay=JSON.parse(readFileSync(prefix+'-scores-'+row.id+'.json','utf8'));
  await panel.locator(`[data-ux-pick="${row.id}"]`).click();await page.waitForFunction(id=>window.App7.current().id===id,row.id);
  const current=await page.evaluate(()=>{const e=window.App7.current();return{id:e.id,name:e.name,tone:e.tone,initialMap:e.initialMap,finalMap:e.finalMap};});
  assert.equal(current.tone,'IVUAO');assert.deepEqual(current.initialMap,replay.initialMap);assert.deepEqual(current.finalMap,replay.finalMap);
  assert.equal(await page.locator('#cktV52Detail').getAttribute('data-scheme'),row.id);assert.equal(await page.locator('#cktV52Detail [data-ux-table="ckt-v52-tracks"] tbody tr').count(),12);assert.ok(await page.locator('#view svg').count()>0);
  await page.locator('#tabs [data-action="nav:benchmark"]').click();await page.locator('#uxQuery').evaluate((n,id)=>{n.value=id;n.dispatchEvent(new Event('input',{bubbles:true}));},row.id);
  const table=page.locator('table[data-ux-table="benchmark"]'),bench=table.locator(`tr[data-dv-scheme="${row.id}"]`);await bench.waitFor();assert.ok(Math.abs(Number(await bench.locator('[data-ckt-v52-id]').textContent())-row.score)<1e-8);
  const attrs=await bench.locator('[data-production-attribute]').evaluateAll(nodes=>nodes.map(n=>({field:n.dataset.productionAttribute,text:n.textContent,title:n.title})));assert.equal(attrs.length,10);
  for(const a of attrs){const pct=a.text.endsWith('%'),number=a.text.replace('%',''),value=Number(number),decimals=(number.split('.')[1]||'').length;assert.ok(Math.abs(value-replay.v52.aggregate[a.field]*(pct?100:1))<=.5*10**(-decimals)+1e-12,a.field);const policies=JSON.parse(a.title.slice(a.title.indexOf('{'),a.title.lastIndexOf('}')+1));assert.deepEqual(policies.candidate,replay.policies);}
  const headers=await table.locator('thead th').allTextContents(),cells=await bench.locator('td').allTextContents();assert.equal(headers.length,cells.length);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);const csv=readFileSync(await download.path(),'utf8');assert.ok(csv.includes(row.id));assert.match(csv,/CKT v5\.2/);
  checks.push({id:row.id,name:current.name,benchmarkColumns:headers.length,productionAttributeChecks:attrs,costs:replay.costs,detailRows:12,keymapRendered:true,csvExport:true});
 }
 assert.deepEqual(errors,[]);assert.equal(hash(publication.html),publication.htmlAfterSha256);
 const result={completed:true,htmlSha256:hash(publication.html),checks,frontierRows:publication.displayRows.length,pageErrors:errors,sourceHashes:{'tests/u7e-pinky-r11.browser.mjs':hash('tests/u7e-pinky-r11.browser.mjs'),[prefix+'-publication.json']:hash(prefix+'-publication.json')}};
 writeFileSync(prefix+'-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({completed:true,checks:checks.map(r=>({id:r.id,name:r.name,benchmarkColumns:r.benchmarkColumns,costs:r.costs})),pageErrors:errors}));
}finally{await browser.close();}
