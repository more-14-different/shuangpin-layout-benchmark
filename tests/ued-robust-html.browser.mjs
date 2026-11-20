import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const prefix='research/notes/2026-11-21-ued-robust-review';
const audit=JSON.parse(readFileSync(prefix+'-html.json','utf8')),id=audit.id;
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1800,height:1200}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(pathToFileURL(audit.html).href,{timeout:120000});await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});
 await page.locator('#tabs [data-action="nav:benchmark"]').click();
 await page.locator('#uxQuery').evaluate((n,id)=>{n.value=id;n.dispatchEvent(new Event('input',{bubbles:true}));},id);
 const table=page.locator('table[data-ux-table="benchmark"]'),row=table.locator(`tr[data-dv-scheme="${id}"]`);await row.waitFor();
 const attributes=await row.locator('[data-production-attribute]').evaluateAll(nodes=>nodes.map(n=>({field:n.dataset.productionAttribute,text:n.textContent,title:n.title})));
 assert.equal(attributes.length,10);
 for(const field of attributes){
  const pct=field.text.endsWith('%'),value=Number(field.text.replace('%','')),expected=audit.productionAggregates[field.field]*(pct?100:1);
  const decimals=(field.text.replace('%','').split('.')[1]||'').length;
  assert.ok(Math.abs(value-expected)<=.5*10**(-decimals)+1e-12,field.field);
  const policies=JSON.parse(field.title.slice(field.title.indexOf('{'),field.title.lastIndexOf('}')+1));
  for(const mode of ['keytao','sanpin']){
   const p=policies.candidate[mode];assert.equal([p.word2,p.word3,p.word4].join('/'),audit.selectedPolicies[mode]);
  }
 }
 const ckt=Number(await row.locator('[data-ckt-v52-id]').textContent());assert.ok(Math.abs(ckt-audit.productionCkt[0])<1e-8);
 const headers=await table.locator('thead th').allTextContents(),cells=await row.locator('td').allTextContents();assert.equal(headers.length,cells.length);
 const displayed=Object.fromEntries(headers.map((h,i)=>[h.replace(/[↕↑↓]/g,'').trim(),cells[i].trim()]));
 assert.ok(headers.some(h=>h.includes('20合同')));assert.ok(headers.some(h=>h.includes('S2右小指')));
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);
 const csv=readFileSync(await download.path(),'utf8');assert.ok(csv.includes(id));assert.match(csv,/CKT v5\.2/);
 await page.locator('#untonedFrontierPublication').locator(`[data-ux-pick="${id}"]`).click();
 await page.waitForFunction(id=>window.App7.current().id===id,id);
 assert.equal(await page.locator('#cktV52Detail').getAttribute('data-scheme'),id);
 assert.equal(await page.locator('#cktV52Detail [data-ux-table="ckt-v52-tracks"] tbody tr').count(),12);
 const panelCells=await page.locator(`#untonedFrontierPublication tr[data-frontier-id="${id}"] td`).allTextContents();
 assert.equal(panelCells[8],audit.selectedPolicies.keytao);assert.equal(panelCells[9],audit.selectedPolicies.sanpin);
 assert.ok(Math.abs(Number(panelCells[2])-audit.productionCkt[0])<1e-9);
 assert.ok(Math.abs(Number(panelCells[3])-audit.productionCkt[1])<1e-9);
 assert.deepEqual(errors,[]);assert.equal(hash(audit.html),audit.htmlSha256);
 const result={completed:true,id,htmlSha256:hash(audit.html),productionAttributeChecks:attributes,benchmarkColumns:displayed,ckt,frontierPanel:panelCells,detailRows:12,csvExport:true,pageErrors:errors,htmlUnchanged:true,
  sourceHashes:{'tests/ued-robust-html.browser.mjs':hash('tests/ued-robust-html.browser.mjs'),[prefix+'-html.json']:hash(prefix+'-html.json')}};
 writeFileSync(prefix+'-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({completed:true,id,productionAttributes:attributes.length,benchmarkColumns:headers.length,detailRows:12,csvExport:true,pageErrors:errors}));
}finally{await browser.close();}
