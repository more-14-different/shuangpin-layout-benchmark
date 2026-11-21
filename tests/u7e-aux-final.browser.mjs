import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const prefix='research/notes/2026-11-21-u7e-pinky-aux-final',pub=JSON.parse(readFileSync(prefix+'-publication.json','utf8'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1800,height:1250}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(pathToFileURL(pub.html).href,{timeout:120000});await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});
 const panel=page.locator('#untonedFrontierPublication');assert.equal(await panel.count(),1);assert.equal(await panel.locator('tbody tr').count(),pub.displayRows.length);
 for(const row of pub.rows){
  const replay=JSON.parse(readFileSync(prefix+'-scores-'+row.id+'.json','utf8'));
  const panelRow=panel.locator(`tr[data-frontier-id="${row.id}"]`),cells=await panelRow.locator('td').allTextContents();assert.equal(cells[10],replay.selectedPolicies.keytao);assert.equal(cells[11],replay.selectedPolicies.sanpin);
  for(const f of ['score','two','three','five'])assert.ok(Math.abs(Number(await panelRow.locator(`[data-pinky-cost="${f}"]`).textContent())-row[f])<1e-9);
  await panelRow.locator('[data-ux-pick]').click();await page.waitForFunction(id=>window.App7.current().id===id,row.id);assert.equal(await page.locator('#cktV52Detail').getAttribute('data-scheme'),row.id);assert.ok(await page.locator('#view svg').count()>0);
  await page.locator('#tabs [data-action="nav:benchmark"]').click();await page.locator('#uxQuery').evaluate((n,id)=>{n.value=id;n.dispatchEvent(new Event('input',{bubbles:true}));},row.id);
  const bench=page.locator(`table[data-ux-table="benchmark"] tr[data-dv-scheme="${row.id}"]`);await bench.waitFor();assert.ok(Math.abs(Number(await bench.locator('[data-ckt-v52-id]').textContent())-row.score)<1e-8);
  const attrs=await bench.locator('[data-production-attribute]').evaluateAll(nodes=>nodes.map(n=>({field:n.dataset.productionAttribute,text:n.textContent,title:n.title})));assert.equal(attrs.length,10);
  for(const a of attrs){const num=a.text.replace('%',''),digits=(num.split('.')[1]||'').length;assert.ok(Math.abs(Number(num)-replay.v52.aggregate[a.field]*(a.text.endsWith('%')?100:1))<=.5*10**(-digits)+1e-12);const policies=JSON.parse(a.title.slice(a.title.indexOf('{'),a.title.lastIndexOf('}')+1));assert.deepEqual(policies.candidate,replay.policies);}
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);const csv=readFileSync(await download.path(),'utf8');assert.ok(csv.includes(row.id));
  checks.push({id:row.id,policies:replay.selectedPolicies,costs:replay.costs,productionAttributes:attrs.length,keymapRendered:true,csvExport:true});
 }
 assert.deepEqual(errors,[]);assert.equal(hash(pub.html),pub.htmlAfterSha256);const result={completed:true,htmlSha256:hash(pub.html),checks,pageErrors:errors,sourceHashes:{'tests/u7e-aux-final.browser.mjs':hash('tests/u7e-aux-final.browser.mjs'),[prefix+'-publication.json']:hash(prefix+'-publication.json')}};writeFileSync(prefix+'-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
