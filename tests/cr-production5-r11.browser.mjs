import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const expected=JSON.parse(readFileSync('research/config/cr-production5-r11.json','utf8')).expected;
const audits=JSON.parse(readFileSync('research/notes/2026-11-17-cr-production5-r11-columns.json','utf8')).schemes;
const ids=Object.keys(expected);
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||chromium.executablePath(),headless:true});
const page=await browser.newPage({viewport:{width:1650,height:1250}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const policy=p=>['word2','word3','word4'].map(k=>p[k]).join('/');
const read=table=>page.locator(`table[data-ux-table="${table}"]`).evaluate(table=>{
  const headers=[...table.querySelectorAll('th')].map(n=>n.textContent.replace(/[↕↑↓]/g,'').trim());
  return [...table.querySelectorAll('.snow-jiandao-contract-row')].map(row=>({id:row.dataset.dvScheme,
    count:row.cells.length,headers,cells:Object.fromEntries([...row.cells].map((cell,i)=>[headers[i],{
      text:cell.textContent,metric:!!cell.querySelector('[data-toned-metric]'),
      value:cell.hasAttribute('data-ux-value')?JSON.parse(cell.dataset.uxValue):null}]))}));
}).then(rows=>rows.filter(r=>ids.includes(r.id)));
const validate=(rows,count=5)=>{
  assert.equal(rows.length,count);
  for(const row of rows){assert.equal(row.count,row.headers.length,row.id);
    for(const [label,cell] of Object.entries(row.cells)){
      assert.doesNotMatch(cell.text,/待定|不适用|N\/A|NaN|undefined|—/,row.id+'/'+label);
      if(cell.metric)assert.ok(Number.isFinite(cell.value),row.id+'/'+label);
    }
  }
};
try{
  await page.goto(pathToFileURL(resolve('a7_CKT_R11.html')).href,{timeout:120000});
  await page.waitForFunction(()=>window.App7?.ready,null,{timeout:120000});
  const registry=await page.evaluate(()=>snowJiandaoSchemes().map(n=>n.id));
  assert.equal(registry.length,17);assert.equal(new Set(registry).size,17);
  assert.equal(registry.filter(id=>id==='CR-GPU-29ce221cfe').length,1);
  await page.locator('#tabs [data-action="nav:scheme"]').click();
  for(const id of ids){
    const e=expected[id],n=audits[id],selection=n.publication.policySelection;
    assert.ok(Math.abs(n.ckt.v51.score-e.cktV51)<1e-9,id);
    assert.equal(policy(n.ckt.v51.policy),'21/231/14');
    await page.locator('#nf6SchemeQuery').fill(id);await page.locator('#nf6SchemeList').selectOption(id);
    await page.waitForFunction(id=>window.App7.current().id===id,id);
    assert.equal(await page.locator('#kpis [data-toned-kpi="A7E-v5"]').textContent(),n.columns.ensemble.v5.toFixed(4));
    assert.equal(await page.locator('#kpis [data-toned-kpi="声韵记忆项 M"]').textContent(),e.memoryLower+' / '+e.memoryGuard);
    const panel=page.locator('#snowJiandaoPolicyStability');
    assert.equal(await panel.locator('[data-native-word-policy]').textContent(),'21/231/14');
    assert.equal(await panel.locator('[data-stable-ckt]').textContent(),e.cktV51.toFixed(9));
    assert.equal(await panel.locator('[data-policy-runner]').textContent(),policy(selection.runnerPolicy));
    assert.equal(await panel.locator('[data-policy-rank-gap]').textContent(),selection.meanRankGap.toFixed(9));
    assert.equal(await panel.locator('[data-policy-ckt-gap]').textContent(),selection.defaultScoreGap.toFixed(9));
    assert.equal(await panel.locator('tbody tr').count(),4);
    const checked=await page.evaluate(()=>{const n=snowJiandaoNative();return {
      id:n.id,colors:auditTonedKeymapSVG(snowJiandaoKeyboardSVG('semantic',null,n),n),
      policy:n.contract.wordAuxiliaryPolicy,adaptation:n.columns.completion.adaptation.wordAuxiliaryPolicy}});
    assert.equal(checked.id,id);assert.equal(checked.colors.links,2);
    assert.deepEqual(checked.policy,checked.adaptation);
    for(const [query,readings] of [['键',[['jian',4]]],['Jian',[['jian',null]]],['jian4',[['jian',4]]],
      ['dao',[['dao',null]]],['dao4',[['dao',4]]],['jiandao',[['jian',null],['dao',null]]],
      ['jian4dao4',[['jian',4],['dao',4]]],['键道',[['jian',4],['dao',4]]]]){
      await page.locator('#nf5Query').fill(query);
      const keys=await page.evaluate(readings=>[...new Set(readings.flatMap(([py,tone])=>{
        const codes=snowJiandaoNative().tonedCodes[D.pinyin.indexOf(py)];return tone==null?codes.filter(Boolean):[codes[tone-1]];
      }).join(''))].sort(),readings);
      const lit=await page.locator('#svgbox g[data-active="true"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.key).sort());
      assert.deepEqual(lit,keys,id+'/'+query);
    }
    await page.locator('#nf5Reset').click();
    for(const mode of ['overall','character','word2','word3','word4','daily','semantic']){
      await page.locator('#snowJiandaoKeyboardMode').selectOption(mode);
      assert.equal(await page.locator('#svgbox svg').count(),1);
      assert.match(await page.locator('#svgbox svg').getAttribute('aria-label'),new RegExp(id));
    }
    mkdirSync('research/.cache/cr-production5-r11-20261117',{recursive:true});
    await page.locator('#svgbox').screenshot({path:`research/.cache/cr-production5-r11-20261117/${id}-keyboard.png`});
  }
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.locator('#uxQuery').evaluate(n=>{n.value='CR-GPU';n.dispatchEvent(new Event('input',{bubbles:true}))});
  let rows=await read('benchmark');validate(rows);
  for(const id of ids){const n=audits[id],row=rows.find(r=>r.id===id);
    assert.equal(row.cells['CKT v5.1 · 生产辅序'].value,n.ckt.v51.score);
    assert.equal(row.cells['A7E-v5'].value,n.columns.ensemble.v5);
    assert.equal(row.cells['LU-v1r'].value,n.columns.rules.lu.score);
  }
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-visible"]').click()]);
  const csv=readFileSync(await download.path(),'utf8');for(const id of ids)assert.ok(csv.includes(id));
  await page.locator('#dataset').selectOption('words');await page.locator('#contract').selectOption('X2');
  await page.locator('#order').selectOption('native');await page.locator('#run').click();
  await page.waitForFunction(()=>window.App7.UX.applied?.dataset==='words'&&window.App7.UX.applied?.order==='native');
  rows=await read('benchmark');validate(rows);
  for(const id of ids)assert.equal(rows.find(r=>r.id===id).cells['当前 CKT ms/项'].value,audits[id].columns.tracks['WX-Snow-21'].upperMs);
  await page.locator('[data-action="fair"]').click();rows=await read('fair');validate(rows);
  const tau=Number(await page.locator('#uxTau').inputValue())===600?900:600;
  await page.locator('#uxTau').fill(String(tau));await page.locator('#uxTau').dispatchEvent('change');
  rows=await read('fair');validate(rows);
  for(const id of ids){const m=audits[id].columns.completion.independent.v1.keytao.word;
    assert.equal(rows.find(r=>r.id===id).cells['键道·二字词 T(τ) ms'].value,m.completionUpperMs+tau*m.p2);}
  await page.locator('#tabs [data-action="nav:benchmark"]').click();
  await page.locator('[data-action="collision"]').click();rows=await read('four-code-collision');validate(rows,25);
  await page.locator('#uxSubnav [data-r9-bench="macro"]').click();
  await page.locator('#r9MacroCorpus').selectOption('daily');
  await page.locator('#r9MacroVariant').selectOption('native-punctuation');
  rows=await read('r9-macro');validate(rows);
  for(const id of ids){const row=rows.find(r=>r.id===id);
    assert.ok(Math.abs(row.cells[row.headers[2]].value-expected[id].daily)<1e-9,id+' daily article');
    await page.locator(`[data-snow-macro-heat="${id}"]`).click();
    assert.match(await page.locator('#r9MacroSVG svg').getAttribute('aria-label'),new RegExp(id));}
  assert.deepEqual(errors,[]);
  console.log('Five stable-policy publications: KPIs, exact filtering, colors, combined keyboards, all heatmaps, tables, CSV and live controls: ok');
}finally{await browser.close()}
