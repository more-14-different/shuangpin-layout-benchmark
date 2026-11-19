import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const audit=JSON.parse(readFileSync('research/notes/2026-11-19-recent-cr-r11-columns.json','utf8'));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1700,height:1200}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
async function rows(key){return page.locator(`table[data-ux-table="${key}"]`).evaluate(table=>{
  const headers=[...table.querySelectorAll('thead th')].map(n=>n.textContent.replace(/[↕↑↓]/g,'').trim());
  return [...table.querySelectorAll('tbody tr')].filter(r=>r.dataset.dvScheme?.startsWith('CR-REF-')).map(r=>({id:r.dataset.dvScheme,headers,
    cells:[...r.cells].map(c=>({text:c.textContent,value:c.dataset.uxValue?JSON.parse(c.dataset.uxValue):null}))}));
})}
function check(tableRows){
  for(const id of audit.ids){const row=tableRows.find(r=>r.id===id),n=audit.schemes[id];assert.ok(row,id);
    assert.equal(row.cells.length,row.headers.length,id);
    const at=row.headers.findIndex(h=>h==='CKT v5.1 · 生产辅序');assert.ok(at>=0,id+' v51');
    assert.equal(row.headers[at+1],'CKT v5.2 · 生产辅序');
    assert.equal(row.cells[at].value,n.ckt.v51.score);assert.equal(row.cells[at+1].value,n.ckt.v52.score);
    for(const cell of row.cells)assert.doesNotMatch(cell.text,/NaN|undefined|待定|不适用|N\/A/,id);
  }
}
try{
  await page.goto(pathToFileURL(resolve('a7_CKT_R11.html')).href,{timeout:180000});
  await page.waitForFunction(()=>window.App7?.ready,null,{timeout:180000});
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.locator('#uxQuery').evaluate(n=>{n.value='CR-REF';n.dispatchEvent(new Event('input',{bubbles:true}))});
  check(await rows('benchmark'));
  await page.locator('table[data-ux-table="benchmark"] th').filter({hasText:'CKT v5.2 · 生产辅序'}).locator('[data-ux-sort]').click();
  const sorted=await rows('benchmark'),values=sorted.map(r=>r.cells[r.headers.indexOf('CKT v5.2 · 生产辅序')].value);
  assert.ok(values.every((v,i)=>i===0||v>=values[i-1])||values.every((v,i)=>i===0||v<=values[i-1]));
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);
  const csv=readFileSync(await download.path(),'utf8');for(const id of audit.ids)assert.ok(csv.includes(id));
  assert.match(csv,/CKT v5\.1 · 生产辅序[^\n]*CKT v5\.2 · 生产辅序/);
  await page.locator('[data-action="fair"]').click();check(await rows('fair'));
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.locator('[data-action="collision"]').click();
  const collisions=await rows('four-code-collision');
  for(const id of audit.ids)assert.equal(collisions.filter(r=>r.id===id).length,5,id+' collision rows');
  await page.locator('#uxSubnav [data-r9-bench="macro"]').click();
  const macros=await rows('r9-macro');
  for(const id of audit.ids)assert.ok(macros.some(r=>r.id===id),id+' macro row');
  await page.locator('#tabs [data-action="nav:scheme"]').click();
  for(const id of audit.ids){
    const n=audit.schemes[id],policy=['word2','word3','word4'].map(k=>n.contract.wordAuxiliaryPolicy[k]).join('/');
    await page.locator('#nf6SchemeQuery').fill(id);await page.locator('#nf6SchemeList').selectOption(id);
    await page.waitForFunction(id=>window.App7.current().id===id,id);
    const panel=page.locator('#snowJiandaoPolicyStability');
    assert.equal(await panel.locator('[data-native-word-policy]').textContent(),policy);
    assert.equal(await panel.locator('[data-stable-ckt]').textContent(),n.ckt.v51.score.toFixed(9));
    assert.equal(await panel.locator('[data-native-ckt-v52]').textContent(),n.ckt.v52.score.toFixed(9));
    assert.equal(await panel.locator('[data-doubled-v52]').textContent(),n.publication.policySelection.doubledV52.toFixed(9));
    assert.equal(await panel.locator('tbody tr').count(),4);
    assert.equal(await page.locator('#cktV52Detail').getAttribute('data-scheme'),id);
    const state=await page.evaluate(()=>{const n=snowJiandaoNative();return {audit:auditTonedKeymapSVG(snowJiandaoKeyboardSVG('semantic',null,n),n),
      tone:n.contract.toneKeysByTone,shape:n.contract.shapeKeysByMeaning,rows:n.filterRows.length}});
    assert.equal(state.audit.id,id);assert.equal(state.tone,'IVUAO');assert.equal(state.shape,'AVUIO');assert.equal(state.rows,289644);
    for(const mode of ['overall','character','word2','word3','word4','daily','semantic']){
      await page.locator('#snowJiandaoKeyboardMode').selectOption(mode);assert.equal(await page.locator('#svgbox svg').count(),1);
    }
  }
  assert.deepEqual(errors,[]);
  mkdirSync('research/.cache/recent-cr-r11',{recursive:true});
  await page.locator('#snowJiandaoPolicyStability').screenshot({path:'research/.cache/recent-cr-r11/policy.png'});
  const result={version:'recent-cr-r11-browser-v1',schemes:audit.ids.length,checks:['benchmark cells','adjacent v51/v52','numeric sorting','fair table','CSV','collision rows','macro rows','minimax policy panel','all details','auxiliary semantics','seven keyboard modes'],pageErrors:errors};
  writeFileSync('research/notes/2026-11-19-recent-cr-r11-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close()}
