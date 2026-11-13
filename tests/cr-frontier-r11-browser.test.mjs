import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url), {chromium} = require('playwright');
const ids = ['CR0-0374','CR1-0004','CR1-0009','CR1-1036'];
const anchors = [9.177899422550182,9.179866003022596,9.176522934739511,9.17268308356451];
const browser = await chromium.launch({executablePath:process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page = await browser.newPage({viewport:{width:1600,height:1200}}), errors = [];
page.on('pageerror',error=>{errors.push(String(error));console.error(error.stack)});
try {
  await page.goto(pathToFileURL(resolve('a7_CKT_R11.html')).href,{timeout:120_000});
  await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120_000});
  const frozen = await page.evaluate(()=>Object.fromEntries(Object.entries(D.tonedContractBenchmark.schemes.research).map(([id,n])=>
    [id,{ckt:n.ckt,inventory:n.inventory,memory:n.memory,columns:n.columns,publication:n.publication,contract:n.contract}])));
  assert.deepEqual(Object.keys(frozen),ids);
  for(const [index,id] of ids.entries()) {
    const native=frozen[id];
    assert.equal(native.ckt.v51.score,anchors[index]);
    assert.equal(native.inventory.legalTonedSyllables,1407);
    assert.equal(native.memory.D,2);assert.equal(native.memory.F,0);
    assert.equal(native.memory.lower,[22,21,21,22][index]);assert.equal(native.memory.guard,24);
    assert.equal(native.columns.nativeId,id);
    assert.equal(native.publication.validation.anchorsVerified,true);
    assert.equal(native.contract.shapeKeysByMeaning,'AVUIO');
    assert.equal(native.contract.toneKeysByTone,'IVUAO');
  }
  await page.locator('#nf6SelectionHost').selectOption('21x21');
  await page.locator('#nf6SelectionMemory').fill('24');
  await page.waitForFunction(()=>document.querySelectorAll('.snow-jiandao-contract-card [data-snow-jiandao-open]').length===5);
  assert.equal(await page.locator('.snow-jiandao-contract-card [data-snow-jiandao-open]').count(),5);
  await page.locator('#nf6SelectionMemory').fill('21');
  await page.waitForFunction(()=>document.querySelectorAll('.snow-jiandao-contract-card [data-snow-jiandao-open]').length===3);
  const low=await page.locator('.snow-jiandao-contract-card [data-snow-jiandao-open]').evaluateAll(nodes=>nodes.map(node=>node.dataset.snowJiandaoOpen));
  assert.deepEqual(low,['SNOW-JIANDAO-TONED','CR1-0004','CR1-0009']);
  await page.locator('#nf6SelectionMemory').fill('24');
  await page.waitForFunction(()=>document.querySelectorAll('.snow-jiandao-contract-card [data-snow-jiandao-open]').length===5);
  await page.locator('[data-snow-jiandao-open="CR0-0374"]').click();
  for(const id of ids) {
    await page.locator('#nf6SchemeQuery').fill(id);
    await page.locator('#nf6SchemeList').selectOption(id);
    await page.waitForFunction(id=>window.App7.current().id===id,id);
    assert.match(await page.locator('#snowJiandaoTonedDetail h2').innerText(),new RegExp(id));
    const semantics=await page.evaluate(()=>{
      const svg=document.querySelector('#svgbox svg'), native=snowJiandaoNative();
      const rhymes=[...svg.querySelectorAll('[data-rhyme]')];
      return {id:native.id,colors:Object.fromEntries([...new Set(rhymes.map(node=>node.dataset.rhyme))].map(name=>[name,[...new Set(rhymes.filter(node=>node.dataset.rhyme===name).map(node=>node.getAttribute('fill')))]])),
        clipped:rhymes.filter(node=>{const b=node.getBBox(),c=node.parentElement.parentElement.querySelector('clipPath rect').getBBox();return b.x<c.x||b.y<c.y||b.x+b.width>c.x+c.width||b.y+b.height>c.y+c.height}).map(node=>node.textContent)};
    });
    assert.equal(Object.keys(semantics.colors).length,10,id);
    assert.ok(Object.values(semantics.colors).every(colors=>colors.length===1&&/^#[0-9a-f]{6}$/i.test(colors[0])),id);
    assert.equal(new Set(Object.values(semantics.colors).flat()).size,10,id);
    assert.deepEqual(semantics.clipped,[],id+' rhyme labels stay inside keys');
    assert.match(await page.locator('#svgbox g[data-key="R"]').textContent(),/Ø A\/E\/O/);
    await page.locator('#nf5Query').fill('jian4dao1');
    const active=await page.locator('#svgbox [data-active="true"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.key).sort());
    const expected=await page.evaluate(()=>{const n=snowJiandaoNative();return [...new Set(n.tonedCodes[D.pinyin.indexOf('jian')][3]+n.tonedCodes[D.pinyin.indexOf('dao')][0])].sort()});
    assert.deepEqual(active,expected,id);
    await page.locator('#nf5Query').fill('jiandao');
    assert.ok(await page.locator('#svgbox [data-active="true"]').count()>active.length,id);
    await page.locator('#nf5Reset').click();
    for(const mode of ['overall','word2','semantic']) {
      await page.locator('#snowJiandaoKeyboardMode').selectOption(mode);
      assert.match(await page.locator('#svgbox svg').getAttribute('aria-label'),new RegExp(id));
    }
    if(id==='CR1-1036') {
      mkdirSync(resolve('research/.cache'),{recursive:true});
      await page.locator('.snow-jiandao-keyboards').screenshot({path:resolve('research/.cache/cr-frontier-keyboard.png')});
    }
  }
  console.log('Four CR inventories, memory filters, scheme switching and merged keyboard semantics: ok');
  await page.locator('#tabs [data-action="nav:selection"]').click();
  await page.locator('.nf6-preference-card [data-action="nav:benchmark"]').click();
  await page.locator('#uxQuery').evaluate(input=>{input.value='CR';input.dispatchEvent(new Event('input',{bubbles:true}))});
  const read = key=>page.locator(`table[data-ux-table="${key}"]`).evaluate(table=>{
    const headers=[...table.querySelectorAll('th')].map(node=>node.textContent.replace(/[↕↑↓]/g,'').trim());
    return [...table.querySelectorAll('.snow-jiandao-contract-row')].map(row=>({id:row.dataset.dvScheme,length:row.cells.length,headers,
      cells:Object.fromEntries([...row.cells].map((cell,index)=>[headers[index],{text:cell.textContent,raw:cell.hasAttribute('data-ux-value')?JSON.parse(cell.dataset.uxValue):null,metric:!!cell.querySelector('[data-toned-metric]')}]))}));
  });
  const validate=(rows,count=4)=>{
    assert.equal(rows.length,count);
    for(const row of rows){assert.equal(row.length,row.headers.length,row.id);for(const [label,cell] of Object.entries(row.cells)){
      assert.doesNotMatch(cell.text,/不适用|N\/A|NaN|undefined|—/,row.id+' / '+label);
      if(cell.metric)assert.ok(Number.isFinite(cell.raw),row.id+' / '+label);
    }}
  };
  await page.waitForTimeout(350);
  let rows=await read('benchmark');validate(rows);
  for(const row of rows){const c=frozen[row.id].columns;
    assert.equal(row.cells['A7E-v5'].raw,c.ensemble.v5);
    assert.equal(row.cells['当前 CKT ms/项'].raw,c.tracks.S2.upperMs);
    assert.equal(row.cells['左小指QAZ 20合同最高'].raw,c.load.leftPinkyMax20);
    assert.equal(row.cells['Top10k 最大桶'].raw,c.collision.cuts['10000'].maxBucket);
  }
  assert.equal(new Set(rows.map(row=>row.cells['当前 CKT ms/项'].raw)).size,4,'dynamic costs cannot bleed across schemes');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);
  const csv=readFileSync(await download.path(),'utf8');for(const id of ids)assert.ok(csv.includes(id));
  await page.locator('#dataset').selectOption('chars');
  await page.locator('#contract').selectOption('X2');
  await page.locator('#run').click();
  await page.waitForFunction(()=>window.App7.UX.applied?.dataset==='chars');
  rows=await read('benchmark');validate(rows);
  for(const row of rows)assert.equal(row.cells['当前 CKT ms/项'].raw,frozen[row.id].columns.tracks['C4-Snow'].upperMs,row.id);
  await page.locator('[data-action="fair"]').click();
  let fair=await read('fair');validate(fair);
  for(const row of fair){const c=frozen[row.id].columns;
    assert.equal(row.cells['裸二键唯一'].text,c.sound.uniqueCodes+'/1407');
    assert.equal(row.cells['S2规则补全 CKT ms'].raw,c.sound.upperMs);
    assert.equal(row.cells['键道·单字 补全CKT ms'].raw,c.completion.independent.v1.keytao.character.completionUpperMs);
  }
  const tau=Number(await page.locator('#uxTau').inputValue())===600?1000:600;
  await page.locator('#uxTau').fill(String(tau));await page.locator('#uxTau').dispatchEvent('change');
  const after=await read('fair');validate(after);
  for(const row of after){const m=frozen[row.id].columns.completion.independent.v1.keytao.word;
    assert.equal(row.cells['键道·二字词 T(τ) ms'].raw,m.completionUpperMs+tau*m.p2);
    assert.notEqual(row.cells['综合补全 CKT v4 · 联合池 · 上游串击 · ×10'].raw,fair.find(old=>old.id===row.id).cells['综合补全 CKT v4 · 联合池 · 上游串击 · ×10'].raw);
  }
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.locator('[data-action="collision"]').click();
  const collision=await read('four-code-collision');validate(collision,20);
  for(const id of ids)assert.equal(collision.filter(row=>row.id===id).length,5);
  await page.locator('#uxSubnav [data-r9-bench="macro"]').click();
  rows=await read('r9-macro');validate(rows);
  for(const id of ids){await page.locator(`[data-snow-macro-heat="${id}"]`).click();assert.match(await page.locator('#r9MacroSVG svg').getAttribute('aria-label'),new RegExp(id))}
  const report=await page.evaluate(()=>r11TonedContractTable());for(const id of ids)assert.ok(report.includes(id));
  assert.deepEqual(errors,[]);
  console.log('Four CR benchmark/fair/collision/macro rows, raw CSV, environment and sliders: ok');
} finally {await browser.close()}
