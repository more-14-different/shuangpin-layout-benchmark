import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const publication=JSON.parse(readFileSync('research/notes/2026-11-18-ckt-v52-all-schemes.json','utf8'));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1650,height:1250}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
const expected=publication.schemes,coverage=new Set();
async function tableCheck(key){
  if(key)await page.locator(`table[data-ux-table="${key}"]`).waitFor();
  const tables=await page.locator(key?`table[data-ux-table="${key}"]`:'table').evaluateAll(nodes=>nodes.map(table=>({
    key:table.dataset.uxTable,
    headers:[...table.querySelectorAll('thead th')].map(n=>n.textContent.replace(/[↕↑↓]/g,'').trim()),
    rows:[...table.querySelectorAll('tbody tr')].map(row=>({id:row.dataset.dvScheme,cells:[...row.cells].map(c=>({
      text:c.textContent,raw:c.dataset.uxValue,marked:c.querySelector('[data-ckt-v52-id]')?.dataset.cktV52Id}))}))
  })));
  let checked=0;
  for(const table of tables)for(let at=0;at<table.headers.length;at++){
    if(table.key?.startsWith('ckt-v52-'))continue;
    if(!/CKT(?:-T)?\s*v?5\.1/.test(table.headers[at]))continue;
    assert.equal(table.headers[at+1],table.headers[at].replace('5.1','5.2'),table.key);
    for(const row of table.rows){
      assert.equal(row.cells.length,table.headers.length,table.key+'/'+row.id);
      const old=parseFloat(row.cells[at].text);
      if(!Number.isFinite(old))continue;
      const record=expected[row.id]||Object.values(expected).find(r=>Math.abs(r.v51.score-old)<1e-7);
      assert.ok(record,'missing record '+row.id+'/'+old);
      const cell=row.cells[at+1];
      assert.ok(Math.abs(parseFloat(cell.text)-record.v52.score)<1e-8,table.key+'/'+record.id);
      if(cell.raw!==undefined)assert.equal(JSON.parse(cell.raw),record.v52.score);
      if(cell.marked)assert.equal(cell.marked,record.id);
      coverage.add(record.id);checked++;
    }
  }
  return checked;
}
try{
  await page.goto(pathToFileURL(resolve('a7_CKT_R11.html')).href,{timeout:120000});
  await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});
  await tableCheck();
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.locator('#uxQuery').evaluate(n=>{n.value='';n.dispatchEvent(new Event('input',{bubbles:true}))});
  assert.ok(await tableCheck('benchmark')>=33);
  assert.equal(coverage.size,33);
  // Sort uses full precision numeric raw values, rather than formatted text.
  const newHeader=page.locator('table[data-ux-table="benchmark"] th').filter({hasText:'CKT v5.2 · 生产辅序'});
  await newHeader.locator('[data-ux-sort]').click();
  const values=await page.locator('table[data-ux-table="benchmark"] [data-ckt-v52-id]').evaluateAll(nodes=>nodes.map(n=>JSON.parse(n.parentElement.dataset.uxValue)));
  assert.ok(values.every((v,i)=>i===0||v>=values[i-1])||values.every((v,i)=>i===0||v<=values[i-1]));
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);
  const csv=readFileSync(await download.path(),'utf8');
  assert.match(csv,/CKT v5\.1 · 生产辅序[^\n]*CKT v5\.2 · 生产辅序/);
  for(const id of Object.keys(expected))assert.ok(csv.includes(id),'CSV '+id);
  await page.locator('[data-action="fair"]').click();
  assert.ok(await tableCheck('fair')>=33);
  await page.locator('#tabs [data-action="nav:scheme"]').click();
  for(const [id,record] of Object.entries(expected)){
    await page.locator('#nf6SchemeQuery').fill(id);
    await page.locator('#nf6SchemeList').selectOption(id);
    await page.waitForFunction(id=>window.App7.current().id===id,id);
    const detail=page.locator('#cktV52Detail');
    assert.equal(await detail.getAttribute('data-scheme'),id);
    const modes=Object.keys(record.v52.modes),groups=modes.length===2?3:1;
    assert.equal(await detail.locator('[data-ux-table="ckt-v52-members"] tbody tr').count(),groups);
    assert.equal(await detail.locator('[data-ux-table="ckt-v52-tracks"] tbody tr').count(),groups*4);
    const actual=await detail.locator('[data-ux-table="ckt-v52-tracks"] tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(c=>JSON.parse(c.dataset.uxValue))));
    let i=0;
    for(const mode of [...modes,...(groups===3?['equal']:[])])for(const kind of ['character','word2','word3','word4']){
      const row=actual[i++],old=mode==='equal'?record.v51.equalTracks[kind].score:record.v51.trackScores[mode][kind],
        next=mode==='equal'?record.v52.equalTracks[kind].score:record.v52.trackScores[mode][kind];
      assert.equal(row[6],old);assert.equal(row[7],next);
    }
    if(record.kind==='tone-in-main'){
      assert.equal(await page.locator('[data-native-ckt-v52]').textContent(),record.v52.score.toFixed(9));
      const stable=page.locator('#snowJiandaoPolicyStability [data-stable-ckt]');
      if(await stable.count())assert.equal(await stable.textContent(),record.v51.score.toFixed(9));
    }
  }
  // The cross-contract comparison has no scheme IDs; its exact-score fallback must also work.
  await page.evaluate(()=>{document.querySelector('#view').insertAdjacentHTML('beforeend',r11TonedContractTable())});
  assert.ok(await tableCheck()>=2);
  await page.locator('#cktV52Detail').screenshot({path:resolve('research/.cache/ckt-v52-publication-20261118/details.png')});
  assert.deepEqual(errors,[]);
  const audit={schemes:coverage.size,members:44,tracks:176,checks:['adjacent columns','numeric sorting','CSV','fair table','all scheme details','all mode/kind tracks','native policy stability','static comparison'],pageErrors:errors};
  mkdirSync('research/.cache/ckt-v52-publication-20261118',{recursive:true});
  writeFileSync('research/.cache/ckt-v52-publication-20261118/browser-check.json',JSON.stringify(audit,null,2)+'\n');
  console.log(JSON.stringify(audit));
}finally{await browser.close()}
