import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url), artifact = resolve('a7_CKT_R11.html');
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!existsSync(artifact) || !existsSync(edge)) {console.log('Toned benchmark browser test skipped: local artifact or Edge unavailable');process.exit(0)}
const {chromium} = require('playwright');
const browser = await chromium.launch({executablePath:edge,headless:true});
const page = await browser.newPage({viewport:{width:1600,height:1000}}), errors = [];
page.on('pageerror', error => {errors.push(String(error));console.error('pageerror:',error.stack)});
try {
  await page.goto(pathToFileURL(artifact).href,{timeout:120_000});
  await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120_000});
  await page.locator('#nf6SelectionHost').selectOption('21x21');
  await page.locator('#nf6SelectionMemory').fill('21');
  await page.locator('.nf6-preference-card [data-action="nav:benchmark"]').click();
  await page.waitForSelector('table[data-ux-table="benchmark"] .snow-jiandao-contract-row');
  const read = key => page.locator(`table[data-ux-table="${key}"]`).evaluate(table=>{
    const heads=[...table.querySelectorAll('th')].map(th=>th.textContent.replace(/[↕↑↓]/g,'').trim());
    const row=table.querySelector('.snow-jiandao-contract-row');
    return {length:row.cells.length,headers:heads,cells:Object.fromEntries([...row.cells].map((td,index)=>[heads[index],{
      text:td.textContent,raw:td.hasAttribute('data-ux-value')?JSON.parse(td.dataset.uxValue):null,
      metric:td.querySelector('[data-toned-metric]')?.dataset.tonedMetric,
    }]))};
  });
  const validate = data => {
    assert.equal(data.length,data.headers.length,'one cell per final column including wrappers');
    for(const [label,cell] of Object.entries(data.cells)) {
      assert.doesNotMatch(cell.text,/不适用|N\/A|NaN|undefined|—/u,label);
      if(cell.metric) {assert.equal(cell.metric,label);assert.ok(Number.isFinite(cell.raw),label)}
    }
  };
  let table=await read('benchmark');validate(table);
  console.log('benchmark static columns: ok');
  const frozen=await page.evaluate(()=>window.App7.data.tonedContractBenchmark.schemes.snowJiandao.columns);
  assert.equal(table.cells['A7E-v5'].raw,frozen.ensemble.v5);
  assert.equal(table.cells['S2右小指'].raw,frozen.tracks.S2.rightPinky);
  assert.equal(table.cells['主行·含形辅下限'].raw,frozen.load.homeFloor);
  assert.equal(table.cells['韵偏移 V'].raw,frozen.rules.V);
  assert.equal(table.cells['当前 CKT ms/项'].raw,frozen.tracks.S2.upperMs);
  assert.equal(table.cells['Top10k 最大桶'].raw,frozen.collision.cuts['10000'].maxBucket);
  const [exported]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);
  assert.match(readFileSync(await exported.path(),'utf8'),/SNOW-JIANDAO-TONED/);
  await page.locator('#uxQuery').evaluate(input=>{input.value='SNOW-JIANDAO-TONED';input.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.waitForTimeout(350);
  // Changing environments changes only dynamic columns; costs must come from
  // the requested actual path rather than reusing native-character completion.
  for(const [dataset,contract,model,weight] of [['chars','T','ckt','frequency'],['chars','X2','ckt','frequency'],['words','X2','geometry','uniform']]) {
    console.log('checking environment:',dataset,contract,model,weight);
    await page.locator('#dataset').selectOption(dataset);
    await page.locator('#contract').selectOption(contract);
    await page.locator('#model').selectOption(model);
    await page.locator('#weight').selectOption(weight,{force:true});
    await page.locator('#run').click();
    await page.waitForFunction(()=>window.App7.UX.applied?.dataset===document.querySelector('#dataset').value);
    await page.waitForSelector('table[data-ux-table="benchmark"] .snow-jiandao-contract-row');
    table=await read('benchmark');validate(table);
    assert.equal(table.cells['A7E-v5'].raw,frozen.ensemble.v5);
    assert.equal(table.cells['主行·含形辅下限'].raw,frozen.load.homeFloor);
    const actual=await page.evaluate(()=>({options:window.App7.UX.applied,value:snowJiandaoCurrentStat()}));
    const label=model==='ckt'?'当前 CKT ms/项':'当前键对当量 ×10';
    assert.equal(table.cells[label].raw,actual.value.eq*(model==='ckt'?1:10));
    if(model==='ckt') assert.equal(table.cells[label].raw,frozen.tracks[contract==='T'?'C3':'C4-Snow'].upperMs);
    assert.equal(table.cells['主行占比'].raw,actual.value.home);
  }
  await page.locator('[data-action="fair"]').click();
  await page.waitForSelector('table[data-ux-table="fair"] .snow-jiandao-contract-row');
  const before=await read('fair');validate(before);
  assert.equal(before.cells['裸二键唯一'].text,'427/1407');
  assert.equal(before.cells['裸 CKT ms'].raw,frozen.tracks.S2.upperMs);
  assert.equal(before.cells['S2规则补全 CKT ms'].raw,frozen.sound.upperMs);
  assert.equal(before.cells['键道·单字 补全CKT ms'].raw,frozen.completion.independent.v1.keytao.character.completionUpperMs);
  assert.equal(before.cells['三拼·单字 两B后非首选'].raw,frozen.completion.independent.v1.sanpin.character.p2);
  assert.equal(before.cells['三拼·二字词 补全键数'].raw,4);
  const initialTau=Number(await page.locator('#uxTau').inputValue());
  await page.locator('#uxTau').fill(String(initialTau===600?1000:600));
  await page.locator('#uxTau').dispatchEvent('change');
  const after=await read('fair');validate(after);
  const nextTau=Number(await page.locator('#uxTau').inputValue());
  assert.match(after.cells['旧v5-S(四档τ)'].text,new RegExp(`τ=${[0,150,300,600].includes(nextTau)?nextTau:600} ms`));
  const m=frozen.completion.independent.v1.keytao.word;
  assert.equal(after.cells['键道·二字词 T(τ) ms'].raw,m.completionUpperMs+nextTau*m.p2);
  assert.notEqual(before.cells['综合补全 CKT v4 · 联合池 · 上游串击 · ×10'].raw,after.cells['综合补全 CKT v4 · 联合池 · 上游串击 · ×10'].raw);
  await page.locator('#uxFirstAuxPenalty').fill('550');await page.locator('#uxFirstAuxPenalty').dispatchEvent('change');
  const penalty=await read('fair');validate(penalty);
  assert.notEqual(penalty.cells['综合补全 CKT v2 · 固定 IVUAO · 字:词=1:2 · ×10'].raw,after.cells['综合补全 CKT v2 · 固定 IVUAO · 字:词=1:2 · ×10'].raw);
  assert.equal(penalty.cells['键道·二字词 补全CKT ms'].raw,after.cells['键道·二字词 补全CKT ms'].raw);
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.waitForSelector('table[data-ux-table="benchmark"]');
  await page.locator('[data-action="collision"]').click();
  await page.waitForSelector('table[data-ux-table="four-code-collision"]');
  const collision=await page.locator('table[data-ux-table="four-code-collision"]').evaluate(table=>({
    heads:table.querySelectorAll('th').length,rows:[...table.querySelectorAll('.snow-jiandao-contract-row')].map(row=>row.cells.length),
  }));
  assert.equal(collision.rows.length,5);assert.ok(collision.rows.every(length=>length===collision.heads));
  await page.locator('#uxSubnav [data-r9-bench="macro"]').click();
  await page.waitForSelector('table[data-ux-table="r9-macro"] .snow-jiandao-contract-row');
  const macro=await read('r9-macro');validate(macro);
  await page.locator('[data-snow-macro-heat]').click();
  assert.equal(await page.locator('#r9MacroSVG svg').count(),1);
  assert.match(await page.locator('#r9MacroSVG svg').getAttribute('aria-label'),/SNOW-JIANDAO-TONED/);
  const filter=await page.evaluate(()=>{
    const value=D.tonedContractBenchmark.schemes.snowJiandao.columns;
    return {all:snowJiandaoMetricFilterPass({}),v0:snowJiandaoMetricFilterPass({v:'0'}),right:snowJiandaoMetricFilterPass({p:String(value.load.rightPinkyMax20-.01)}),home:snowJiandaoMetricFilterPass({h:String(value.load.homeFloor+.01)})};
  });
  assert.deepEqual(filter,{all:true,v0:false,right:false,home:false});
  assert.deepEqual(errors,[]);
  console.log('Toned benchmark/fair/collision: aligned columns, physical metrics, environment and cognitive controls: ok');
} finally {await browser.close()}
