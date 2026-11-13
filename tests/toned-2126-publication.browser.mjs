import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1700,height:1300}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try {
 await page.goto(pathToFileURL(resolve('a7_CKT_R11.html')).href,{timeout:180000});
 await page.waitForFunction(()=>window.App7?.ready,null,{timeout:180000});
 for(const [id,score] of [['T2126-QEMPTY-8890382',8.890382234262121],['T2126-FULL26-8871530',8.871530178018425]]){
  await page.evaluate(id=>{CURRENT=id;snowJiandaoRenderDetail();},id);
  const audit=await page.evaluate(id=>{
   const n=snowJiandaoNative(id),svg=document.querySelector('#svgbox svg');
   const e=snowJiandaoTonedFacade(n);
   return {capacity:e.capacity,actual:e.actual,score:n.ckt.v51.score,shape:n.contract.shapeKeysByMeaning,
    shapes:svg.querySelectorAll('[data-shape]').length,rhymes:svg.querySelectorAll('[data-rhyme]').length,
    top:[...svg.querySelectorAll('g[data-key]')].filter(g=>'QWERTYUIOP'.includes(g.dataset.key)).map(g=>g.querySelector('[data-tones]')?.textContent),
    detail:document.querySelector('#snowJiandaoTonedDetail').textContent,
    qz:n.inventory.qzEmpty,zq:n.inventory.zqEmpty,
    rows:n.filterRows.length,main3:n.filterRows.filter(r=>r[5]==='word3').every(r=>r[2].length===4),
    finite:Object.values(n.columns.ensemble).every(Number.isFinite),
    clipped:[...svg.querySelectorAll('[data-rhyme]')].filter(t=>{const b=t.getBBox(),c=t.closest('g[data-key]').querySelector('clipPath rect').getBBox();return b.x<c.x||b.x+b.width>c.x+c.width||b.y<c.y||b.y+b.height>c.y+c.height;}).map(t=>t.textContent)};
  },id);
  assert.deepEqual(audit.capacity,[21,26]);assert.equal(audit.shape,'AEUIO');
  assert.ok(Math.abs(audit.score-score)<1e-10);assert.equal(audit.shapes,5);assert.ok(audit.rhymes>=25);
  assert.ok(audit.main3&&audit.finite);assert.equal(audit.rows,289644);
  assert.match(audit.detail,/待定/);assert.match(audit.detail,/21×26/);
  assert.ok(audit.top.filter(Boolean).every(s=>s==='2/3'));
  assert.doesNotMatch(await page.locator('#svgbox').textContent(), /阴|阳|上ˇ|去ˋ/);
  assert.deepEqual(audit.clipped,[]);
  await page.locator('#nf5Query').fill('er2');
  assert.ok(await page.locator('#svgbox g[data-active="true"]').count());
  for(const mode of ['overall','daily','character','word2','word3','word4','semantic'])await page.locator('#snowJiandaoKeyboardMode').selectOption(mode);
  await page.locator('#nf5Query').fill('');
  mkdirSync('research/.cache/toned2126-browser',{recursive:true});
  await page.locator('#svgbox').screenshot({path:`research/.cache/toned2126-browser/${id}.png`});
  console.log(JSON.stringify({id,score:audit.score,rows:audit.rows,shapeLabels:audit.shapes}));
 }
 assert.deepEqual(errors,[]);
} finally {await browser.close();}
