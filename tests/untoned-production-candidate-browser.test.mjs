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
const errors = [], id = 'OC21-bf9bf45a7e60';
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.goto(pathToFileURL(artifact).href, {timeout: 120_000});
  await page.waitForFunction(() => window.App7?.ready, null, {timeout: 120_000});
  const metrics = await page.evaluate(id => {
    const data = window.App7.data, entry = data.entries.find(entry => entry.id === id);
    if (!entry) throw new Error('Missing candidate');
    const maps = ['completionB', 'completionBFixed', 'completionBV2', 'completionBV3', 'completionBV4'];
    if (!maps.every(name => data[name].schemes[id])) throw new Error('Incomplete completion columns');
    if (Object.keys(data.ckt.tracks[id]).length !== 20) throw new Error('Incomplete contract replay');
    if (Object.keys(entry.bPathMetricsNative).length !== 8) throw new Error('Incomplete B paths');
    return entry.readmeBenchmarkMetrics;
  }, id);
  assert.ok(Math.abs(metrics.cktV51 - 9.541757919664565) < 1e-9);
  await page.locator('#nf6SelectionHost').selectOption('21x21');
  await page.locator('#nf6SelectionMemory').fill('42');
  await page.locator('#uxQuery').evaluate((input, id) => {
    input.value = id;
    input.dispatchEvent(new Event('input', {bubbles: true}));
  }, id);
  await page.locator('.nf6-preference-card [data-action="nav:benchmark"]').click();

  const read = async key => {
    const table = page.locator(`table[data-ux-table="${key}"]`);
    await table.locator(`[data-dv-scheme="${id}"]`).waitFor({timeout: 120_000});
    return table.evaluate((table, id) => {
      const headers = [...table.querySelectorAll('th')].map(cell => cell.textContent.replace(/[↕↑↓]/g, '').trim());
      const row = table.querySelector(`[data-dv-scheme="${id}"]`);
      return {length: row.cells.length, count: headers.length,
        cells: Object.fromEntries([...row.cells].map((cell, index) => [headers[index], {
          text: cell.textContent.trim(),
          raw: cell.dataset.uxValue ? JSON.parse(cell.dataset.uxValue) : null,
        }]))};
    }, id);
  };
  const validate = table => {
    assert.equal(table.length, table.count, 'column alignment');
    for (const [label, field] of [['CKT v5 · 生产辅序', 'cktV5'], ['CKT v5.1 · 生产辅序', 'cktV51']]) {
      assert.equal(table.cells[label].raw, metrics[field], label + ' sort/CSV value');
      assert.equal(table.cells[label].text, metrics[field].toFixed(6), label + ' display');
    }
  };
  validate(await read('benchmark'));
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.locator('[data-action="export-visible"]').click(),
  ]);
  assert.match(readFileSync(await download.path(), 'utf8'), /OC21-bf9bf45a7e60/);
  await page.locator('[data-action="fair"]').click();
  const fair = await read('fair');
  validate(fair);
  assert.equal(fair.cells['裸二键唯一'].text, '345/399');
  for (const [label, cell] of Object.entries(fair.cells)) {
    assert.doesNotMatch(cell.text, /NaN|undefined|待审|—/u, label);
  }
  await page.locator('#uxTau').fill('1000');
  await page.locator('#uxTau').dispatchEvent('change');
  validate(await read('fair'));
  assert.deepEqual(errors, []);
  console.log('OC21 production candidate: 20 tracks, B paths, benchmark/fair columns, CSV and fixed-policy scores passed');
} finally {
  await browser.close();
}
