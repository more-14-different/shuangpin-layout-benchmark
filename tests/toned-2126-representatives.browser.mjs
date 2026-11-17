import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
import catalog from '../tools/toned_2126_publication_catalog.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const target=process.env.R11_HTML||resolve('a7_CKT_R11.html');
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,args:['--js-flags=--max-old-space-size=16384']});
const page=await browser.newPage({viewport:{width:1700,height:1300}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(pathToFileURL(target).href,{timeout:240000});
 await page.waitForFunction(()=>window.App7?.ready,null,{timeout:240000});
 for(const key of Object.keys(catalog.entries)){
  const entry=catalog.load(key),id=entry.id;
  await page.evaluate(id=>{CURRENT=id;snowJiandaoRenderDetail();},id);
  const actual=await page.evaluate(id=>{
   const native=snowJiandaoNative(id),svg=document.querySelector('#svgbox svg');
   return {score:native.ckt.v51.score,policy:native.contract.wordAuxiliaryPolicy,
    displayedPolicy:document.querySelector('[data-robust-policy]')?.dataset.robustPolicy,
    schemeCount:snowJiandaoSchemes().filter(n=>n.id===id).length,
    memory:native.memory,columnsVersion:native.columns.version,capacity:native.contract.capacity,
    soundCount:native.columns.sound.syllables,word3MainValid:native.filterRows.filter(r=>r[5]==='word3').every(r=>r[2].length===4),
    rows:native.filterRows.length,shapes:svg.querySelectorAll('[data-shape]').length,
    clipped:[...svg.querySelectorAll('[data-rhyme]')].filter(t=>{const b=t.getBBox(),c=t.closest('g[data-key]').querySelector('clipPath rect').getBBox();return b.x<c.x||b.x+b.width>c.x+c.width||b.y<c.y||b.y+b.height>c.y+c.height;}).map(t=>t.textContent),
    caption:[...svg.querySelectorAll(':scope > text')].map(t=>t.textContent).join(' '),
    bFill:svg.querySelector('g[data-key="B"] > rect').getAttribute('fill')};
  },id);
  assert.ok(Math.abs(actual.score-entry.best.score)<1e-10);
  assert.deepEqual(actual.policy,entry.best.policy);assert.equal(actual.displayedPolicy,entry.robustness.selectedPolicy);
  assert.equal(actual.schemeCount,1);assert.equal(actual.soundCount,1407);assert.equal(actual.rows,289644);
  assert.deepEqual(actual.capacity,[21,26]);assert.equal(actual.columnsVersion,'tone-in-main-column-contracts-v3');
  assert.equal(actual.shapes,5);assert.ok(actual.word3MainValid);assert.deepEqual(actual.clipped,[]);
  assert.equal(actual.bFill,'#f5e8bd');
  assert.ok(Number.isFinite(actual.memory.lower)&&Number.isFinite(actual.memory.guard));
  assert.match(actual.caption,key==='newSwap'?/上排 4 声 · 中排 2\/3 声/:/上排 2\/3 声 · 中排 4 声/);
  await page.locator('#nf5Query').fill('er2');
  assert.ok(await page.locator('#svgbox [data-active="true"]').count());
  for(const mode of ['overall','daily','character','word2','word3','word4','semantic'])await page.locator('#snowJiandaoKeyboardMode').selectOption(mode);
  await page.locator('#nf5Query').fill('');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#snowJiandaoExportRows').click()]);
  assert.match(download.suggestedFilename(),/\.tsv$/);
  mkdirSync('research/.cache/toned2126-representative-previews',{recursive:true});
  await page.locator('#svgbox').screenshot({path:`research/.cache/toned2126-representative-previews/${key}.png`});
  console.log(JSON.stringify({id,score:actual.score,policy:actual.displayedPolicy,memory:[actual.memory.lower,actual.memory.guard]}));
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
