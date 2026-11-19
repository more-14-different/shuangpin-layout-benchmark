import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import catalog from '../tools/toned_2126_r1_r2_c1_catalog.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const html=resolve(process.env.R11_HTML||'../shuangpin-layout-benchmark/a7_CKT_R11.html');
const out=resolve('research/.cache/toned-2126-r1-r2-c1-browser');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,args:['--js-flags=--max-old-space-size=16384']});
const page=await browser.newPage({viewport:{width:1700,height:1300}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(pathToFileURL(html).href,{timeout:240000});
 await page.waitForFunction(()=>window.App7?.ready,null,{timeout:240000});
 for(const key of Object.keys(catalog.entries)){
  const expected=catalog.load(key),id=expected.id;
  await page.evaluate(id=>{CURRENT=id;snowJiandaoRenderDetail()},id);
  const result=await page.evaluate(id=>{
   const n=snowJiandaoNative(id),svg=document.querySelector('#svgbox svg'),p=n.publication.policyAudit;
   const audit=auditTonedKeymapSVG(snowJiandaoKeyboardSVG('semantic',null,n),n);
   const clipped=[...svg.querySelectorAll('[data-rhyme]')].filter(t=>{
    const b=t.getBBox(),box=t.closest('g[data-key]').querySelector('clipPath rect').getBBox();
    return b.x<box.x||b.x+b.width>box.x+box.width||b.y<box.y||b.y+b.height>box.y+box.height;
   }).map(t=>t.textContent);
   return {id,name:n.name,policy:n.contract.wordAuxiliaryPolicy,policyPanel:document.querySelector('[data-r1-r2-c1-policy]')?.dataset.r1R2C1Policy,
    default:Number(document.querySelector('[data-refined-default]').textContent),double:Number(document.querySelector('[data-refined-double]').textContent),
    score:n.ckt.v52.score,v51:n.ckt.v51.score,memory:n.memory,columns:n.columns,capacity:n.contract.capacity,rows:n.filterRows.length,
    word3Valid:n.filterRows.filter(r=>r[5]==='word3').every(r=>r[2].length===4),shapes:svg.querySelectorAll('[data-shape]').length,
    clipped,audit,detail:document.querySelector('#cktV52Detail')?.textContent,unique:snowJiandaoSchemes().filter(n=>n.id===id).length,
    topRecord:D.cktV52.schemes[id].v52.score,broadRobustnessAudited:p.broadRobustnessAudited,
    shapeKeysByMeaning:n.contract.shapeKeysByMeaning,toneKeysByTone:n.contract.toneKeysByTone};
  },id);
  assert.equal(result.name,expected.name);assert.equal(result.unique,1);assert.deepEqual(result.policy,expected.policy);
  assert.equal(result.policyPanel,expected.layout.policy.join('/'));assert.ok(Math.abs(result.score-expected.score)<1e-9);
  assert.ok(Math.abs(result.default-expected.score)<1e-9);assert.ok(Math.abs(result.double-expected.doubleScore)<1e-9);
  assert.equal(result.topRecord,result.score);assert.equal(result.memory.lower,18);assert.equal(result.memory.guard,21);assert.equal(result.memory.D,2);
  assert.equal(result.columns.version,'tone-in-main-column-contracts-v3');assert.equal(result.columns.nativeId,id);
  assert.equal(result.columns.sound.syllables,1407);assert.ok(result.columns.collision);assert.equal(result.rows,289644);
  assert.equal(result.shapes,5);assert.ok(result.word3Valid);assert.deepEqual(result.clipped,[]);assert.deepEqual(result.capacity,[21,26]);
  assert.equal(result.broadRobustnessAudited,false);assert.equal(result.shapeKeysByMeaning,'AEUIO');assert.equal(result.toneKeysByTone,'IEUAO');
  assert.match(result.detail,/CKT v5.1／v5.2/);
  await page.locator('#nf5Query').fill('er2');assert.ok(await page.locator('#svgbox [data-active="true"]').count());
  await page.locator('#nf5Query').fill('');
  for(const mode of ['overall','daily','character','word2','word3','word4','semantic'])await page.locator('#snowJiandaoKeyboardMode').selectOption(mode);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#snowJiandaoExportRows').click()]);
  assert.match(download.suggestedFilename(),/\.tsv$/);
  await page.locator('#svgbox').screenshot({path:resolve(out,key+'.png')});
  const {columns,...compact}=result;results.push({...compact,columnVersion:columns.version,ensemble:columns.ensemble});
  console.log(JSON.stringify({key,id,score:result.score,policy:result.policyPanel,rows:result.rows}));
 }
 assert.deepEqual(errors,[]);
 writeFileSync(resolve(out,'verification.json'),JSON.stringify({html,results,errors},null,2)+'\n');
}finally{await browser.close()}
