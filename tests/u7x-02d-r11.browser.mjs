import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const target='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html';
const id='U7X-02d505540da0',audit=JSON.parse(readFileSync('research/notes/2026-11-20-u7x-02d-r11-publication.json','utf8'));
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1650,height:1250}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(pathToFileURL(target).href,{timeout:120000});await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});
 await page.locator('#tabs [data-action="nav:benchmark"]').click();
 await page.locator('#uxQuery').evaluate((n,id)=>{n.value=id;n.dispatchEvent(new Event('input',{bubbles:true}));},id);
 await page.locator(`table[data-ux-table="benchmark"] tr[data-dv-scheme="${id}"]`).waitFor();
 const row=page.locator(`table[data-ux-table="benchmark"] tr[data-dv-scheme="${id}"]`);
 const value=await row.locator('[data-ckt-v52-id]').textContent();assert.ok(Math.abs(Number(value)-audit.score)<1e-8);
 const fields=await row.locator('[data-production-attribute]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.productionAttribute,Number(n.textContent.replace('%',''))])));
 assert.ok(Math.abs(fields.motorUpperMs-audit.metrics.aggregateMotorUpperMs)<1e-5);
 assert.ok(Math.abs(fields.effectiveMs-audit.metrics.aggregateEffectiveMs)<1e-5);
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);
 const csv=readFileSync(await download.path(),'utf8');assert.ok(csv.includes(id));assert.match(csv,/CKT v5\.2/);
 await page.locator('#tabs [data-action="nav:scheme"]').click();await page.locator('#nf6SchemeQuery').fill(id);await page.locator('#nf6SchemeList').selectOption(id);
 await page.waitForFunction(id=>window.App7.current().id===id,id);
 assert.equal(await page.locator('#cktV52Detail').getAttribute('data-scheme'),id);
 assert.equal(await page.locator('#cktV52Detail [data-ux-table="ckt-v52-tracks"] tbody tr').count(),12);
 assert.deepEqual(errors,[]);
 const result={id,score:audit.score,fields,checks:['main HTML catalogue row','v5.2 full precision score','v5.2 production attributes','CSV export','12 member/word-length detail rows'],pageErrors:errors};
 writeFileSync('research/notes/2026-11-20-u7x-02d-r11-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
