import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const ids=['CR-GPU-c42359003b','CR-GPU-29ce221cfe','CR-GPU-579ec1d473'];
const anchors=[9.127800871307997,9.121110146688881,9.173113102514876];
const production5=JSON.parse(readFileSync('research/config/cr-production5-r11.json','utf8')).expected;
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||chromium.executablePath(),headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1200}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
const read=key=>page.locator(`table[data-ux-table="${key}"]`).evaluate(table=>{
  const headers=[...table.querySelectorAll('th')].map(node=>node.textContent.replace(/[↕↑↓]/g,'').trim());
  return [...table.querySelectorAll('.snow-jiandao-contract-row')].map(row=>({id:row.dataset.dvScheme,count:row.cells.length,headers,
    cells:Object.fromEntries([...row.cells].map((cell,i)=>[headers[i],{text:cell.textContent,metric:!!cell.querySelector('[data-toned-metric]'),
      raw:cell.hasAttribute('data-ux-value')?JSON.parse(cell.dataset.uxValue):null}]))}));
}).then(rows=>rows.filter(row=>ids.includes(row.id)));
const validate=(rows,count=3)=>{
  assert.equal(rows.length,count);
  for(const row of rows){assert.equal(row.count,row.headers.length,row.id);
    for(const [label,cell] of Object.entries(row.cells)){
      assert.doesNotMatch(cell.text,/待定|不适用|N\/A|NaN|undefined|—/,row.id+' / '+label);
      if(cell.metric)assert.ok(Number.isFinite(cell.raw),row.id+' / '+label);
    }
  }
};
try{
  await page.goto(pathToFileURL(resolve('a7_CKT_R11.html')).href,{timeout:120000});
  await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});
  const frozen=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const n=snowJiandaoNative(id);
    return [id,{id:n.id,memory:n.memory,columns:n.columns,ckt:n.ckt,inventory:n.inventory,publication:n.publication}]})),ids);
  await page.locator('#tabs [data-action="nav:scheme"]').click();
  for(const [index,id] of ids.entries()){
    const n=frozen[id];
    assert.equal(n.id,id);
    if(n.publication.policySelection){
      // The new 29 archive was searched at fixed 21/231/14; the original GPU
      // archive used fixed 12/213/24. Verify the actual publication source.
      const fixed=n.publication.source==='research/config/cr-production5-r11.json'?production5[id].cktV51:anchors[index];
      assert.ok(Math.abs(n.publication.originalFixedPolicyScore-fixed)<1e-9);
      assert.equal(n.ckt.v51.score,n.publication.policySelection.selectedScore);
    }else assert.ok(Math.abs(n.ckt.v51.score-anchors[index])<1e-9);
    assert.equal(n.memory.lower,[22,22,21][index]);assert.equal(n.memory.guard,24);
    assert.equal(n.memory.D,2);assert.equal(n.memory.F,0);
    assert.equal(n.inventory.legalTonedSyllables,1407);
    assert.equal(n.columns.version,'tone-in-main-column-contracts-v3');
    assert.equal(n.publication.annealKey.slice(0,10),id.slice(-10));
    assert.equal(n.publication.validation.anchorsVerified,true);
    await page.locator('#nf6SchemeQuery').fill(id);await page.locator('#nf6SchemeList').selectOption(id);
    await page.waitForFunction(id=>window.App7.current().id===id,id);
    assert.equal(await page.locator('#kpis [data-toned-kpi="A7E-v5"]').textContent(),n.columns.ensemble.v5.toFixed(4));
    assert.equal(await page.locator('#kpis [data-toned-kpi="声韵记忆项 M"]').textContent(),n.memory.lower+' / '+n.memory.guard);
    const audit=await page.evaluate(()=>{const n=snowJiandaoNative();return auditTonedKeymapSVG(snowJiandaoKeyboardSVG('semantic',null,n),n)});
    assert.equal(audit.links,2);
    assert.equal(await page.locator('#svgbox svg').count(),1);
    const cases=[['键',[['jian',4]]],['Jian',[['jian',null]]],['jian4',[['jian',4]]],['dao4',[['dao',4]]],
      ['jiandao',[['jian',null],['dao',null]]],['jian4dao4',[['jian',4],['dao',4]]],['键道',[['jian',4],['dao',4]]]];
    for(const [query,readings] of cases){
      await page.locator('#nf5Query').fill(query);
      const expected=await page.evaluate(readings=>[...new Set(readings.flatMap(([py,tone])=>{
        const codes=snowJiandaoNative().tonedCodes[D.pinyin.indexOf(py)];return tone==null?codes.filter(Boolean):[codes[tone-1]];
      }).join(''))].sort(),readings);
      const actual=await page.locator('#svgbox g[data-active="true"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.key).sort());
      assert.deepEqual(actual,expected,id+' / '+query);
    }
    await page.locator('#nf5Reset').click();
    for(const mode of ['overall','character','word2','word3','word4','daily','semantic']){
      await page.locator('#snowJiandaoKeyboardMode').selectOption(mode);
      assert.match(await page.locator('#svgbox svg').getAttribute('aria-label'),new RegExp(id));
    }
    const rhymes=await page.locator('#svgbox svg').evaluate(svg=>{
      const nodes=[...svg.querySelectorAll('[data-rhyme]')];
      return {colors:Object.fromEntries([...new Set(nodes.map(n=>n.dataset.rhyme))].map(name=>
        [name,[...new Set(nodes.filter(n=>n.dataset.rhyme===name).map(n=>n.getAttribute('fill')))]])),
        clipped:nodes.filter(n=>{const b=n.getBBox(),c=n.parentElement.parentElement.querySelector('clipPath rect').getBBox();
          return b.x<c.x||b.y<c.y||b.x+b.width>c.x+c.width||b.y+b.height>c.y+c.height}).map(n=>n.textContent)};
    });
    assert.equal(Object.keys(rhymes.colors).length,10,id);
    assert.ok(Object.values(rhymes.colors).every(colors=>colors.length===1),id);
    assert.equal(new Set(Object.values(rhymes.colors).flat()).size,10,id);
    assert.deepEqual(rhymes.clipped,[],id+' labels fit inside keycaps');
    mkdirSync('research/.cache/cr-gpu-r11',{recursive:true});
    await page.locator('#svgbox').screenshot({path:`research/.cache/cr-gpu-r11/${id}.png`});
  }
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.locator('#uxQuery').evaluate(input=>{input.value='CR-GPU';input.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.waitForFunction(()=>document.querySelectorAll('table[data-ux-table="benchmark"] .snow-jiandao-contract-row').length>=3);
  let rows=await read('benchmark');validate(rows);
  for(const row of rows){const c=frozen[row.id].columns;
    assert.equal(row.cells['A7E-v5'].raw,c.ensemble.v5);
    assert.equal(row.cells['左小指QAZ 20合同最高'].raw,c.load.leftPinkyMax20);
    assert.equal(row.cells['Top10k 最大桶'].raw,c.collision.cuts['10000'].maxBucket);
  }
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);
  const csv=readFileSync(await download.path(),'utf8');for(const id of ids)assert.ok(csv.includes(id));
  await page.locator('#dataset').selectOption('chars');await page.locator('#contract').selectOption('X2');
  await page.locator('#run').click();await page.waitForFunction(()=>window.App7.UX.applied?.dataset==='chars');
  rows=await read('benchmark');validate(rows);
  for(const row of rows)assert.equal(row.cells['当前 CKT ms/项'].raw,frozen[row.id].columns.tracks['C4-Snow'].upperMs);
  await page.locator('[data-action="fair"]').click();rows=await read('fair');validate(rows);
  for(const row of rows){const c=frozen[row.id].columns;
    assert.equal(row.cells['裸二键唯一'].text,c.sound.uniqueCodes+'/1407');
    assert.equal(row.cells['S2规则补全 CKT ms'].raw,c.sound.upperMs);
  }
  const tau=Number(await page.locator('#uxTau').inputValue())===600?1000:600;
  await page.locator('#uxTau').fill(String(tau));await page.locator('#uxTau').dispatchEvent('change');
  rows=await read('fair');validate(rows);
  for(const row of rows){const m=frozen[row.id].columns.completion.independent.v1.keytao.word;
    assert.equal(row.cells['键道·二字词 T(τ) ms'].raw,m.completionUpperMs+tau*m.p2);
  }
  // Production columns appear only when a compatible ordinary scheme is in
  // the same table. Verify that this mixed view also has all toned values.
  await page.locator('#uxQuery').evaluate(input=>{input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))});
  rows=await read('fair');
  for(const row of rows.filter(row=>ids.includes(row.id))){
    const a=frozen[row.id].ckt.aggregateV51;
    if(row.cells['生产有效 ms']){
      assert.equal(row.cells['生产有效 ms'].raw,a.effectiveMs);
      assert.equal(row.cells['生产认知 ms'].raw,a.effectiveMs-a.motorUpperMs);
      assert.equal(row.cells['生产选重率'].raw,a.selectionRate);
    }
    validate([row],1);
  }
  await page.locator('#uxQuery').evaluate(input=>{input.value='CR-GPU';input.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.locator('[data-action="collision"]').click();validate(await read('four-code-collision'),15);
  await page.locator('#uxSubnav [data-r9-bench="macro"]').click();validate(await read('r9-macro'));
  for(const id of ids){await page.locator(`[data-snow-macro-heat="${id}"]`).click();
    assert.match(await page.locator('#r9MacroSVG svg').getAttribute('aria-label'),new RegExp(id));
  }
  assert.deepEqual(errors,[]);
  console.log('Three CR GPU schemes: full numeric tables, CSV, environment/sliders, KPIs, semantic/heat keyboards and exact unified filters: ok');
}finally{await browser.close()}
