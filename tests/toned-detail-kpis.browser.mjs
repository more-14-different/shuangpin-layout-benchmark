import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url), {chromium} = require('playwright');
const bundled = chromium.executablePath();
const executablePath = process.env.EDGE_PATH || (existsSync(bundled) ? bundled : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
const browser = await chromium.launch({executablePath,headless:true});
const page = await browser.newPage({viewport:{width:1600,height:1200}}), errors=[];
page.on('pageerror',error=>{errors.push(String(error));console.error(error.stack)});
page.on('console',message=>{if(message.type()==='error')console.error('Browser console:',message.text())});
try {
  await page.goto(pathToFileURL(resolve('a7_CKT_R11.html')).href,{timeout:120_000});
  try {await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120_000})} catch(error) {
    console.error(await page.evaluate(()=>({loading:document.querySelector('#loading')?.textContent,status:document.querySelector('#status')?.textContent,app:typeof window.App7})));
    throw error;
  }
  const frozen = await page.evaluate(()=>snowJiandaoSchemes().map(native=>({id:native.id,capacity:native.contract.capacity || [21,21],
    v5:native.columns.ensemble.v5,v4:native.columns.ensemble.v4,M:native.memory.lower,
    fa:native.columns.rules.fa.score,lu:native.columns.rules.lu.score,
    unique:native.columns.sound.uniqueCodes,syllables:native.columns.sound.syllables})));
  assert.equal(frozen.length,7,'all five 21x21 and two 21x26 toned schemes');
  await page.locator('#tabs [data-action="nav:scheme"]').click();
  const select = async id => {
    await page.locator('#nf6SchemeQuery').fill(id);
    await page.locator('#nf6SchemeList').selectOption(id);
    await page.waitForFunction(id=>window.App7.current().id===id,id);
  };
  await select('BCW-b6d79577771b');
  const ordinary = await page.locator('#kpis').innerText();
  const validate = async expected => {
    assert.equal(await page.locator('#kpis').getAttribute('data-toned-scheme'),expected.id);
    assert.equal(await page.locator('#kpis').isVisible(),true);
    const cards = await page.locator('#kpis [data-toned-kpi]').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>
      [node.dataset.tonedKpi,{raw:JSON.parse(node.dataset.uxValue),text:node.textContent,title:node.title}])));
    assert.equal(Object.keys(cards).length,6);
    for(const [label,key] of [['A7E-v5','v5'],['A7E-v4','v4'],['FA-1 加权','fa'],['LU-v1r','lu'],['裸二键唯一','unique']])
      assert.equal(cards[label].raw,expected[key],expected.id+' / '+label);
    assert.equal(cards['A7E-v5'].text,expected.v5.toFixed(4));
    assert.equal(cards['A7E-v4'].text,expected.v4.toFixed(4));
    assert.equal(cards['FA-1 加权'].text,expected.fa.toFixed(2)+'%');
    assert.equal(cards['LU-v1r'].text,expected.lu.toFixed(2));
    assert.equal(cards['裸二键唯一'].text,expected.unique+'/'+expected.syllables);
    assert.equal(cards['声韵记忆项 M'].raw,expected.M ?? '待定');
    assert.equal(cards['声韵记忆项 M'].text,expected.M == null?'待定':String(expected.M));
    assert.ok(cards['声韵记忆项 M'].title.length);
    assert.doesNotMatch(await page.locator('#kpis').innerText(),/NaN|undefined|360\/399/);
    const aligned = await page.evaluate(()=>[...document.querySelectorAll('#kpis [data-toned-kpi]')].every(node=>
      JSON.stringify(snowJiandaoColumn(node.dataset.tonedKpi,'benchmark',{native:snowJiandaoNative()}).value)===node.dataset.uxValue));
    assert.equal(aligned,true,'KPI and benchmark use the same metric values');
  };
  for(const expected of frozen) {await select(expected.id);await validate(expected);console.log('KPI values verified:',expected.id)}
  // Reverse navigation catches stale values between the two domain sizes,
  // between scored/unknown memory, and on returning to an ordinary scheme.
  await select('BCW-b6d79577771b');
  assert.equal(await page.locator('#kpis').innerText(),ordinary);
  assert.equal(await page.locator('#kpis [data-toned-kpi]').count(),0);
  assert.equal(await page.locator('#kpis').getAttribute('data-toned-scheme'),null);
  await select(frozen[0].id);await validate(frozen[0]);
  await page.locator('#tabs [data-action="nav:selection"]').click();
  assert.equal(await page.locator('#kpis').isVisible(),false);
  await page.locator(`[data-snow-jiandao-open="${frozen.at(-1).id}"]`).click();
  await validate(frozen.at(-1));
  assert.deepEqual(errors,[]);
  console.log('Seven toned schemes: six KPI values match frozen column contracts; domain/memory switches and ordinary navigation: ok');
} finally {await browser.close()}
