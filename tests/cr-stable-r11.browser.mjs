import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const report=JSON.parse(readFileSync('research/notes/2026-11-16-cr-toned-stable-policies.json','utf8'));
const audits=JSON.parse(readFileSync('research/notes/2026-11-16-cr-stable-r11-columns.json','utf8')).schemes;
const ids=['CR-GPU-f0ae939a38','CR-GPU-3d3dcbafc0','CR-GPU-0a4ee7fb52','CR-GPU-29ce221cfe'];
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||chromium.executablePath(),headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1200}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const key=p=>['word2','word3','word4'].map(k=>p[k]).join('/');
const read=table=>page.locator(`table[data-ux-table="${table}"]`).evaluate(table=>{
  const h=[...table.querySelectorAll('th')].map(n=>n.textContent.replace(/[↕↑↓]/g,'').trim());
  return [...table.querySelectorAll('.snow-jiandao-contract-row')].map(row=>({id:row.dataset.dvScheme,count:row.cells.length,headers:h,
    cells:Object.fromEntries([...row.cells].map((c,i)=>[h[i],{text:c.textContent,
      value:c.dataset.uxValue?JSON.parse(c.dataset.uxValue):null,metric:!!c.querySelector('[data-toned-metric]')}]))}));
});
const validate=rows=>{for(const row of rows){assert.equal(row.count,row.headers.length,row.id);
  for(const [h,c] of Object.entries(row.cells)){assert.doesNotMatch(c.text,/待定|不适用|N\/A|NaN|undefined|—/,row.id+'/'+h);
    if(c.metric)assert.ok(Number.isFinite(c.value),row.id+'/'+h);}}};
try{
  await page.goto(pathToFileURL(resolve('a7_CKT_R11.html')).href,{timeout:120000});
  await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});
  const registry=await page.evaluate(()=>snowJiandaoSchemes().map(n=>n.id));
  assert.equal(registry.length,13);assert.equal(registry.filter(id=>id==='CR-GPU-29ce221cfe').length,1);
  await page.locator('#tabs [data-action="nav:scheme"]').click();
  for(const id of ids){
    const expected=report.results.find(r=>r.id.endsWith(id.slice(-10))),n=audits[id];
    await page.locator('#nf6SchemeQuery').fill(id);await page.locator('#nf6SchemeList').selectOption(id);
    await page.waitForFunction(id=>window.App7.current().id===id,id);
    assert.equal(n.ckt.v51.score,expected.selectedScore);
    assert.equal(key(n.ckt.v51.policy),key(expected.selectedPolicy));
    assert.equal(key(n.contract.wordAuxiliaryPolicy),key(expected.selectedPolicy));
    const panel=page.locator('#snowJiandaoPolicyStability');
    assert.equal(await panel.locator('[data-native-word-policy]').textContent(),key(expected.selectedPolicy));
    assert.equal(await panel.locator('[data-stable-ckt]').textContent(),expected.selectedScore.toFixed(9));
    assert.equal(await panel.locator('[data-policy-runner]').textContent(),key(expected.runnerPolicy));
    assert.equal(await panel.locator('[data-policy-rank-gap]').textContent(),expected.meanRankGap.toFixed(9));
    assert.equal(await panel.locator('[data-policy-ckt-gap]').textContent(),expected.defaultScoreGap.toFixed(9));
    assert.equal(await panel.locator('tbody tr').count(),4);
    assert.equal(await page.locator('#kpis [data-toned-kpi="A7E-v5"]').textContent(),n.columns.ensemble.v5.toFixed(4));
    assert.equal(await page.locator('#kpis [data-toned-kpi="声韵记忆项 M"]').textContent(),n.memory.lower+' / '+n.memory.guard);
    const state=await page.evaluate(()=>{const n=snowJiandaoNative();return {audit:auditTonedKeymapSVG(snowJiandaoKeyboardSVG('semantic',null,n),n),
      policy:n.contract.wordAuxiliaryPolicy,adaptation:n.columns.completion.adaptation.wordAuxiliaryPolicy,
      rows:n.filterRows.filter(r=>r[5]==='word3').slice(0,100)}});
    assert.equal(state.audit.id,id);assert.deepEqual(state.adaptation,state.policy);
    for(const query of ['键','jian4','Jian','jiandao','jian4dao4','键道']){
      await page.locator('#nf5Query').fill(query);
      assert.ok(await page.locator('#svgbox [data-active="true"]').count()<12,id+'/'+query);
    }
    await page.locator('#nf5Reset').click();
    for(const mode of ['overall','character','word2','word3','word4','daily','semantic']){
      await page.locator('#snowJiandaoKeyboardMode').selectOption(mode);
      assert.equal(await page.locator('#svgbox svg').count(),1);
    }
    mkdirSync('research/.cache/cr-stable-r11',{recursive:true});
    await panel.screenshot({path:`research/.cache/cr-stable-r11/${id}-policy.png`});
  }
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.locator('#uxQuery').evaluate(n=>{n.value='CR-GPU';n.dispatchEvent(new Event('input',{bubbles:true}))});
  let rows=await read('benchmark');validate(rows);
  assert.equal(rows.length,6);
  for(const id of ids){const row=rows.find(r=>r.id===id),n=audits[id];
    assert.equal(row.cells['CKT v5.1 · 生产辅序'].value,n.ckt.v51.score);
    assert.equal(row.cells['A7E-v5'].value,n.columns.ensemble.v5);
    assert.equal(row.cells['LU-v1r'].value,n.columns.rules.lu.score);
  }
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);
  const csv=readFileSync(await download.path(),'utf8');for(const id of ids)assert.ok(csv.includes(id));
  await page.locator('#dataset').selectOption('words');await page.locator('#contract').selectOption('X2');
  await page.locator('#order').selectOption('native');await page.locator('#run').click();
  await page.waitForFunction(()=>window.App7.UX.applied?.dataset==='words'&&window.App7.UX.applied?.order==='native');
  rows=await read('benchmark');validate(rows);
  for(const id of ids){const row=rows.find(r=>r.id===id),n=audits[id];
    assert.equal(row.cells['当前 CKT ms/项'].value,n.columns.tracks['WX-Snow-21'].upperMs);
  }
  await page.locator('[data-action="fair"]').click();rows=await read('fair');validate(rows);
  for(const id of ids)assert.ok(rows.find(r=>r.id===id));
  const tau=Number(await page.locator('#uxTau').inputValue())===600?900:600;
  await page.locator('#uxTau').fill(String(tau));await page.locator('#uxTau').dispatchEvent('change');
  rows=await read('fair');validate(rows);
  for(const id of ids){const n=audits[id],m=n.columns.completion.independent.v1.keytao.word;
    assert.equal(rows.find(r=>r.id===id).cells['键道·二字词 T(τ) ms'].value,m.completionUpperMs+tau*m.p2);}
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.locator('[data-action="collision"]').click();rows=await read('four-code-collision');validate(rows);
  for(const id of ids)assert.equal(rows.filter(r=>r.id===id).length,5);
  await page.locator('#uxSubnav [data-r9-bench="macro"]').click();rows=await read('r9-macro');validate(rows);
  for(const id of ids){await page.locator(`[data-snow-macro-heat="${id}"]`).click();
    assert.match(await page.locator('#r9MacroSVG svg').getAttribute('aria-label'),new RegExp(id));}
  assert.deepEqual(errors,[]);
  console.log('Four stable policies: unique champion replacement, gaps, actual policy scores/loads, tables/CSV/environment/sliders and keyboards: ok');
}finally{await browser.close()}
