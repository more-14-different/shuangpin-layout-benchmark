import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url), {chromium} = require('playwright');
const browser = await chromium.launch({executablePath:process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page = await browser.newPage({viewport:{width:1600,height:1200}}), errors=[];
page.on('pageerror',error=>{errors.push(String(error));console.error(error.stack)});
const cases = [
  ['键', [['jian',4]]], ['Jian', [['jian',null]]], ['jiandao', [['jian',null],['dao',null]]],
  ['jian4', [['jian',4]]], ['dao', [['dao',null]]], ['dao4', [['dao',4]]],
  ['jian4dao4', [['jian',4],['dao',4]]], ['键道', [['jian',4],['dao',4]]],
];
const active = ()=>page.locator('#svgbox g[data-active="true"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.key).sort());
try {
  await page.goto(pathToFileURL(resolve('a7_CKT_R11.html')).href,{timeout:120_000});
  await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120_000});
  await page.locator('[data-snow-jiandao-open="SNOW-JIANDAO-TONED"]').click();
  for(const id of ['SNOW-JIANDAO-TONED','CR0-0374','CR1-0004','CR1-0009','CR1-1036']) {
    await page.locator('#nf6SchemeQuery').fill(id);
    await page.locator('#nf6SchemeList').selectOption(id);
    await page.waitForFunction(id=>window.App7.current().id===id,id);
    for(const [q,reading] of cases) {
      await page.locator('#nf5Query').fill(q);
      const expected=await page.evaluate(reading=>{
        const native=snowJiandaoNative();
        return [...new Set(reading.flatMap(([py,tone])=>{
          const codes=native.tonedCodes[D.pinyin.indexOf(py)];return tone==null?codes.filter(Boolean):[codes[tone-1]];
        }).join(''))].sort();
      },reading);
      assert.deepEqual(await active(),expected,id+' / '+q);
      const matched=await page.evaluate(()=>snowJiandaoFilterState().rows.map(row=>[row[0],row[1]]));
      if(q==='键')assert.ok(matched.length&&matched.every(row=>row[0]==='键'));
      if(q==='键道')assert.ok(matched.length&&matched.every(row=>row[0]==='键道'));
      if(q==='Jian')assert.ok(matched.length&&matched.every(row=>/^jian[0-4]$/.test(row[1])));
      if(q==='jian4')assert.ok(matched.length&&matched.every(row=>row[1]==='jian4'));
      if(q==='jian4dao4')assert.ok(matched.length&&matched.every(row=>row[1]==='jian4 dao4'));
    }
    await page.locator('#nf5Query').fill('键');
    for(const mode of ['overall','character','word2','daily']) {
      await page.locator('#snowJiandaoKeyboardMode').selectOption(mode);
      const heat=await page.evaluate(()=>{
        const state=snowJiandaoFilterState(), mainOnly=state.mode==='daily';
        return {rows:state.rows.length,expected:[...new Set(state.rows.flatMap(row=>[...row[mainOnly?2:3]]))].sort()};
      });
      if(heat.rows)assert.deepEqual(await active(),heat.expected,id+' / '+mode);
      assert.ok((await active()).length<10,id+' / '+mode+' cannot light unrelated words');
    }
    await page.locator('#snowJiandaoKeyboardMode').selectOption('semantic');
    await page.locator('#nf5Query').fill('不存在的拼音!');assert.deepEqual(await active(),[]);
    await page.locator('#nf5Reset').click();assert.equal(await page.locator('#svgbox .nf5-dim').count(),0);
  }
  console.log('Five toned schemes: exact characters/words, case-insensitive pinyin, optional tones, heat and reset: ok');
  for(const id of ['S005','BCW-b6d79577771b']) {
    await page.locator('#nf6SchemeQuery').fill(id);
    await page.locator('#nf6SchemeList').selectOption(id);
    await page.waitForFunction(id=>window.App7.current().id===id,id);
    for(const [q,reading] of cases) {
      await page.locator('#nf5Query').fill(q);
      const expected=await page.evaluate(reading=>[...new Set(reading.map(([py])=>current().codeList[D.pinyin.indexOf(py)]).join(''))].sort(),reading);
      assert.deepEqual(await active(),expected,id+' / '+q);
      if(q==='Jian')assert.deepEqual(await page.evaluate(()=>nf5Rows(current()).rows.map(row=>row.syllables)),['jian']);
    }
    await page.locator('#nf5Reset').click();assert.equal(await page.locator('#svgbox .nf5-dim').count(),0);
  }
  for(const [dataset,contract] of [['chars','X2'],['words','X2'],['words','T1']]) {
    await page.locator('#dataset').selectOption(dataset);
    await page.locator('#contract').selectOption(contract);
    await page.locator('#run').click();
    await page.waitForFunction(dataset=>opt().dataset===dataset && document.querySelector('#nf5Query')?.value==='',dataset);
    for(const [q,reading] of cases) {
      await page.locator('#nf5Query').fill(q);
      const expected=await page.evaluate(reading=>[...new Set(reading.map(([py])=>current().codeList[D.pinyin.indexOf(py)]).join(''))].sort(),reading);
      assert.deepEqual(await active(),expected,dataset+' / '+q+' highlights main code only');
      const rows=await page.evaluate(()=>nf5Rows(current()).rows.map(row=>({text:row.text,reading:row.reading})));
      if(q==='键')assert.ok(rows.every(row=>row.text==='键'));
      if(q==='Jian')assert.ok(rows.every(row=>/^jian[0-4]$/.test(row.reading)));
      if(q==='jian4')assert.ok(rows.every(row=>row.reading==='jian4'));
      if(q==='jian4dao4')assert.ok(rows.every(row=>row.reading==='jian4 dao4'));
      if(dataset==='chars'&&q==='键')assert.ok(rows.length,'actual character reading retained');
      if(dataset==='words'&&q==='jian4dao4')assert.ok(rows.length,'actual word reading retained');
    }
    await page.locator('#nf5Query').fill(dataset==='chars'?'键':'键道');
    await page.locator('[data-nf5-kbd="heat"]').click();
    assert.equal(await page.locator('#svgbox svg').count(),1);
    await page.locator('[data-nf5-kbd="semantic"]').click();
  }
  assert.deepEqual(errors,[]);
  console.log('Untoned S005/BCW: complete syllables, concatenated/tone-marked readings, main-code activation in all datasets: ok');
} finally {await browser.close()}
