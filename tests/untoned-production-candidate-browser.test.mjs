import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url);
const artifact = resolve(process.env.R11_HTML || 'a7_CKT_R11.html');
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!existsSync(artifact) || !existsSync(edge)) {
  console.log('Production candidate browser test skipped: local artifact or Edge unavailable');
  process.exit(0);
}
const {chromium} = require('playwright');
const browser = await chromium.launch({executablePath: edge, headless: true});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const errors = [], ids = ['OC21-bf9bf45a7e60', 'OC21-e1f155973380'];
page.on('pageerror', error => {errors.push(String(error)); console.error(error.stack)});
try {
  await page.goto(pathToFileURL(artifact).href, {timeout: 120_000});
  await page.waitForFunction(() => window.App7?.ready, null, {timeout: 120_000});
  const metrics = await page.evaluate(ids => Object.fromEntries(ids.map(id => {
    const data = window.App7.data, entry = data.entries.find(entry => entry.id === id);
    if (!entry) throw new Error('Missing candidate');
    const maps = ['completionB', 'completionBFixed', 'completionBV2', 'completionBV3', 'completionBV4'];
    if (!maps.every(name => data[name].schemes[id])) throw new Error('Incomplete completion columns');
    if (Object.keys(data.ckt.tracks[id]).length !== 20) throw new Error('Incomplete contract replay');
    if (Object.keys(entry.bPathMetricsNative).length !== 8) throw new Error('Incomplete B paths');
    if (entry.productionCandidateMetrics.cktV51Policies.candidate.sanpin.word4 !== '21') throw new Error('Wrong robust policy');
    if (Object.keys(entry.productionCandidateMetrics).some(key => key.startsWith('cktV51DefaultPoint'))) throw new Error('Nonproduction point data retained');
    if ('cktV51DefaultPointOptimal' in entry.readmeBenchmarkMetrics) throw new Error('Nonproduction point metric retained');
    return [id, {...entry.readmeBenchmarkMetrics, productionAggregate: entry.productionCandidateMetrics.cktV51Aggregate}];
  })), ids);
  assert.ok(Math.abs(metrics[ids[0]].cktV51 - 9.54170846001124) < 1e-9);
  assert.ok(Math.abs(metrics[ids[1]].cktV51 - 9.538996462957561) < 1e-9);
  await page.locator('#nf6SelectionHost').selectOption('21x21');
  await page.locator('#nf6SelectionMemory').fill('42');
  await page.locator('#uxQuery').evaluate((input, id) => {
    input.value = id;
    input.dispatchEvent(new Event('input', {bubbles: true}));
  }, 'OC21-');
  await page.locator('.nf6-preference-card [data-action="nav:benchmark"]').click();

  const read = async (key, id) => {
    const table = page.locator(`table[data-ux-table="${key}"]`);
    await table.locator(`[data-dv-scheme="${id}"]`).waitFor({timeout: 120_000});
    return table.evaluate((table, id) => {
      const headers = [...table.querySelectorAll('th')].map(cell => cell.textContent.replace(/[↕↑↓]/g, '').trim());
      const row = table.querySelector(`[data-dv-scheme="${id}"]`);
      return {length: row.cells.length, count: headers.length,
        cells: Object.fromEntries([...row.cells].map((cell, index) => [headers[index], {
          text: cell.textContent.trim(),
          scoreText: cell.querySelector('[data-production-ckt]')?.textContent.trim(),
          raw: cell.dataset.uxValue ? JSON.parse(cell.dataset.uxValue) : null,
        }]))};
    }, id);
  };
  const validate = (table, id) => {
    assert.equal(table.length, table.count, 'column alignment');
    assert.ok(!('CKT v5.1 · 默认点最优' in table.cells));
    for (const [label, field] of [['CKT v5 · 历史合同', 'cktV5'], ['CKT v5.1 · 生产辅序', 'cktV51']]) {
      assert.equal(table.cells[label].raw, metrics[id][field], label + ' sort/CSV value');
      assert.equal(table.cells[label].scoreText, metrics[id][field].toFixed(6), label + ' display');
    }
    assert.match(table.cells['CKT v5.1 · 生产辅序'].text, /稳健：形 12\/213\/24；调 12\/213\/21/);
    for (const [label, field] of [['生产首辅率','firstAuxRate'], ['生产次辅率','secondAuxRate'],
      ['生产三辅率','thirdAuxRate'], ['生产选重率','selectionRate'], ['生产平均键数','meanKeys'],
      ['生产运动 ms','motorUpperMs'], ['生产认知 ms','cognitiveMs'], ['生产有效 ms','effectiveMs'],
      ['生产平均扫描候选数','meanRejectedCandidates'], ['生产平均翻页次数','meanPageActions']]) {
      const expected = metrics[id].productionAggregate[field];
      assert.equal(table.cells[label].raw, expected, label);
      assert.equal(metrics[id]['aggregate' + field[0].toUpperCase() + field.slice(1)], expected, 'canonical production field ' + field);
    }
  };
  for (const id of ids) validate(await read('benchmark', id), id);
  const scoreHeader = page.locator('table[data-ux-table="benchmark"] th').filter({hasText: 'CKT v5.1 · 生产辅序'});
  await scoreHeader.locator('.ux-sort').click();
  assert.equal(await scoreHeader.getAttribute('aria-sort'), 'ascending');
  const sortedCandidates = await page.locator('table[data-ux-table="benchmark"] tbody tr').evaluateAll((rows, ids) =>
    rows.map(row => row.dataset.dvScheme).filter(id => ids.includes(id)), ids);
  assert.deepEqual(sortedCandidates, [ids[1], ids[0]], 'ascending CKT order among the two scored candidates');
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.locator('[data-action="export-visible"]').click(),
  ]);
  const csv = readFileSync(await download.path(), 'utf8');
  for (const id of ids) assert.ok(csv.includes(id));
  for (const value of ['9.541708', '9.538996']) assert.ok(csv.includes('"' + value + '"'), 'numeric CSV score ' + value);
  assert.ok(!csv.includes('默认点最优'));
  await page.locator('[data-action="fair"]').click();
  for (const id of ids) {
    const fair = await read('fair', id);
    validate(fair, id);
    assert.equal(fair.cells['裸二键唯一'].text, '345/399');
    for (const [label, cell] of Object.entries(fair.cells)) {
      assert.doesNotMatch(cell.text, /NaN|undefined|待审|—/u, label);
    }
  }
  await page.locator('#uxTau').fill('1000');
  await page.locator('#uxTau').dispatchEvent('change');
  for (const id of ids) validate(await read('fair', id), id);
  assert.deepEqual(errors, []);
  console.log('BF/E1: robust production scores and all 10 aggregate attributes, policy labels, sorting and numeric CSV passed');
} finally {
  await browser.close();
}
