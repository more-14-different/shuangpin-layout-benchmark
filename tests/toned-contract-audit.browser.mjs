import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync} from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||chromium.executablePath(),headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1200}}),errors=[];
page.on('pageerror',error=>{errors.push(String(error));console.error(error.stack)});
const read=key=>page.locator(`table[data-ux-table="${key}"]`).evaluate(table=>{
  const headers=[...table.querySelectorAll('th')].map(th=>th.textContent.replace(/[↕↑↓]/g,'').trim());
  return [...table.querySelectorAll('.snow-jiandao-contract-row')].map(row=>({id:row.dataset.dvScheme,count:row.cells.length,
    headers,cells:Object.fromEntries([...row.cells].map((cell,index)=>[headers[index],{text:cell.textContent,raw:cell.hasAttribute('data-ux-value')?JSON.parse(cell.dataset.uxValue):null}]))}));
});
try{
  await page.goto(pathToFileURL(resolve('a7_CKT_R11.html')).href,{timeout:120000});
  await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});
  const frozen=await page.evaluate(()=>snowJiandaoSchemes().map(n=>({id:n.id,memory:n.memory,columns:n.columns,capacity:n.contract.capacity||[21,21]})));
  for(const n of frozen){
    const result=await page.evaluate(id=>{
      const n=snowJiandaoNative(id);
      const semantic=auditTonedKeymapSVG(snowJiandaoKeyboardSVG('semantic',null,n),n);
      const heat=auditTonedKeymapSVG(snowJiandaoKeyboardSVG('overall',null,n),n);
      const corrupted=new DOMParser().parseFromString(snowJiandaoKeyboardSVG('semantic',null,n),'image/svg+xml');
      let rejected=null,missingRejected=null;
      if(n.id.startsWith('T2126')){
        const text=[...corrupted.querySelectorAll('g[data-key="W"] > g > text')].find(t=>t.textContent==='W');text.setAttribute('fill','#000000');
        try{auditTonedKeymapSVG(new XMLSerializer().serializeToString(corrupted),n);rejected=false}catch{rejected=true}
        const missing={...n,keyboards:{...n.keyboards,firstByKey:Object.fromEntries(Object.entries(n.keyboards.firstByKey).map(([key,names])=>[key,names.filter(name=>name!=='zero-W')]))}};
        try{auditTonedKeymapSVG(snowJiandaoKeyboardSVG('semantic',null,missing),missing);missingRejected=false}catch{missingRejected=true}
      }
      return {semantic,heat,rejected,missingRejected};
    },n.id);
    if(n.id.startsWith('T2126')){
      assert.deepEqual(result.semantic.zeroTargets,{W:['J'],Y:['W']});
      assert.deepEqual(result.semantic.zeroMoved,{W:true,Y:true});assert.equal(result.rejected,true);assert.equal(result.missingRejected,true);
    }
    assert.equal(n.columns.version,'tone-in-main-column-contracts-v3');
    assert.ok(n.memory.lower<=n.memory.guard);
    const expectedBase=n.capacity[1]===26?4:3;
    assert.equal(n.columns.completion.adaptation.word3BaseLength,expectedBase);
    for(const kind of ['word3','word4'])assert.deepEqual(n.columns.completion.independent.v3.sanpin[kind],n.columns.completion.independent.v3.keytao[kind],n.id+' abbreviated completion must use shape-only paths');
  }
  await page.locator('#tabs [data-action="nav:scheme"]').click();
  for(const n of frozen){
    await page.locator('#nf6SchemeQuery').fill(n.id);await page.locator('#nf6SchemeList').selectOption(n.id);
    await page.waitForFunction(id=>window.App7.current().id===id,n.id);
    assert.equal(await page.locator('#kpis [data-toned-kpi="声韵记忆项 M"]').innerText(),n.memory.lower+' / '+n.memory.guard);
    if(n.id.startsWith('T2126')){
      mkdirSync('research/.cache/toned-contract-audit',{recursive:true});
      await page.locator('#svgbox').screenshot({path:`research/.cache/toned-contract-audit/${n.id}.png`});
    }
  }
  await page.locator('#tabs [data-action="nav:selection"]').click();
  await page.locator('#nf6SelectionHost').selectOption('21x26');await page.locator('#nf6SelectionMemory').fill('19');
  await page.waitForFunction(()=>document.querySelectorAll('.snow-jiandao-contract-card [data-snow-jiandao-open]').length===1);
  assert.equal(await page.locator('.snow-jiandao-contract-card [data-snow-jiandao-open]').getAttribute('data-snow-jiandao-open'),'T2126-FULL26-8871530');
  await page.locator('#nf6SelectionHost').selectOption('all');await page.locator('#nf6SelectionMemory').fill('');
  await page.waitForFunction(()=>document.querySelectorAll('.snow-jiandao-contract-card [data-snow-jiandao-open]').length===7);
  await page.locator('.nf6-preference-card [data-action="nav:benchmark"]').click();
  await page.waitForSelector('table[data-ux-table="benchmark"] .snow-jiandao-contract-row');
  const validate=(rows)=>{
    assert.equal(rows.length,7);
    for(const row of rows){assert.equal(row.count,row.headers.length);for(const cell of Object.values(row.cells))assert.doesNotMatch(cell.text,/待定|不适用|NaN|undefined|N\/A/)}
  };
  let rows=await read('benchmark');validate(rows);
  for(const n of frozen){const row=rows.find(row=>row.id===n.id);
    assert.equal(row.cells['声韵记忆项 M'].text,n.memory.lower+' / '+n.memory.guard);assert.equal(row.cells['声韵记忆项 M'].raw,n.memory.lower);
    assert.equal(row.cells['A7E-v5'].raw,n.columns.ensemble.v5);assert.equal(row.cells['LU-v1r'].raw,n.columns.rules.lu.score);
  }
  await page.locator('[data-action="fair"]').click();
  rows=await read('fair');validate(rows);
  for(const n of frozen){const row=rows.find(row=>row.id===n.id);
    assert.equal(row.cells['声韵记忆项 M'].text,n.memory.lower+' / '+n.memory.guard);
    const scores=await page.evaluate(id=>snowJiandaoScores(bCompletionTau(),bCompletionFirstAuxPenalty(),bCompletionSecondAuxPenalty(),snowJiandaoNative(id)),n.id);
    assert.equal(row.cells['固定 IVUAO 对照 · 字:词=1:2 · τ ×10'].raw,scores.fixed);
    assert.equal(row.cells['综合补全 CKT v2 · 固定 IVUAO · 字:词=1:2 · ×10'].raw,scores.v2);
  }
  assert.deepEqual(errors,[]);
  console.log('Seven toned contracts: final SVG link inks, W/Y chain, M intervals and filtering, benchmark/fair columns and fixed auxiliary controls: ok');
}finally{await browser.close()}
