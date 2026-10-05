import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifact = resolve('a7_CKT_R11.html');
if (!existsSync(artifact) || !existsSync(edge)) {
  console.log('browser UI test skipped: local release HTML or Microsoft Edge is unavailable');
  process.exit(0);
}
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.log('browser UI test skipped: Playwright is unavailable');
  process.exit(0);
}
const url = pathToFileURL(artifact).href;
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));

try {
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.App7?.ready, null, { timeout: 120_000 });
  assert.equal(await page.evaluate(() => window.App7.current().id), 'NF3-21X21-M40-44');

  assert.equal(await page.locator('#nf6SelectionFilters').isVisible(), true);
  assert.equal(await page.locator('#uxFilters').isVisible(), false);
  assert.equal(await page.locator('#uxEnvironment').isVisible(), false);
  assert.equal(await page.locator('#uxMarking').isVisible(), false);
  assert.equal(await page.locator('.nf6-preference-card').isVisible(), true);
  assert.equal(await page.locator('#s005Comparison').count(), 0);
  assert.equal(await page.getByText('FINAL SELECTION / FROZEN DATA', { exact: true }).count(), 0);
  const semanticColors = await page.evaluate(() => {
    const color = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {
      selection: color('#nf6SelectionFilters'),
      benchmarkFilter: color('#uxFilters'),
      selectionMark: color('.nf6-mark-controls'),
      benchmarkMark: color('#uxMarking'),
    };
  });
  assert.equal(semanticColors.selection, semanticColors.benchmarkFilter);
  assert.equal(semanticColors.selectionMark, semanticColors.benchmarkMark);
  const prefLabel = await page.locator('.nf6-pref-line [data-help="balanced"]').boundingBox();
  const prefSelect = await page.locator('#uxPreference').boundingBox();
  assert.ok(Math.abs((prefLabel.y + prefLabel.height / 2) - (prefSelect.y + prefSelect.height / 2)) < 3);
  const ribbonText = await page.locator('.nf6-ribbon-line > span').first().boundingBox();
  const ribbonButton = await page.locator('.nf6-ribbon-line > button').boundingBox();
  assert.ok(Math.abs((ribbonText.y + ribbonText.height / 2) - (ribbonButton.y + ribbonButton.height / 2)) < 3);
  const preferenceStyle = await page.locator('.nf6-preference-card').evaluate(element => getComputedStyle(element).backgroundImage);
  assert.match(preferenceStyle, /rgb\(230, 244, 242\)/);
  const ribbonBorders = await page.locator('.nf6-preference-card > .dv-ribbon').evaluate(element => {
    const style = getComputedStyle(element);
    return [style.borderTopWidth, style.borderBottomWidth];
  });
  assert.deepEqual(ribbonBorders, ['0px', '0px']);

  await page.locator('#nf6SelectionHost').selectOption('21x26');
  await page.locator('#nf6SelectionMemory').fill('36');
  await page.waitForTimeout(250);
  assert.match(await page.locator('#nf6SelectionCount').innerText(), /\d+ \/ 524$/);
  assert.match(await page.locator('.nf6-filter-live').innerText(), /\d+ 个候选/);

  await page.locator('.nf6-preference-card [data-action="nav:benchmark"]').click();
  await page.waitForFunction(() => window.App7.UX.view === 'benchmark');
  assert.equal(await page.locator('#assocOp').inputValue(), 'le');
  assert.equal(await page.locator('#assocValue').inputValue(), '36');
  for (const id of ['uxFilters', 'uxEnvironment', 'uxMarking']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), true, `${id} should be visible in benchmark`);
  }
  await page.waitForSelector('table[data-ux-table="benchmark"]');
  const benchmarkHeaders = (await page.locator('table[data-ux-table="benchmark"] th').allTextContents())
    .map(text => text.replace(/[↕↑↓]/g, '').trim());
  for (const redundant of ['每输出字 ms', '样本数 N', '平均键数', '中央 ms/项', '外推键保护 ms', '长码压力 ms', '含外推键占比', '超四码占比']) {
    assert.equal(benchmarkHeaders.includes(redundant), false, `${redundant} should be compacted in the uniform sound benchmark`);
  }
  for (const collisionHeader of ['五档跨族受影响均值', '五档首选损失均值', 'Top10k 受影响', 'Top10k 首选损失', 'Top10k 最大桶']) {
    assert.equal(benchmarkHeaders.includes(collisionHeader), true, `${collisionHeader} should be present in the benchmark`);
  }
  assert.match(await page.locator('.ux-compact-columns').innerText(), /当前结果全为 0/);
  await page.locator('[data-action="collision"]').click();
  await page.waitForSelector('table[data-ux-table="four-code-collision"]');
  assert.equal(await page.locator('#uxSubnav [data-r9-bench="collision"]').getAttribute('class'), 'active');
  const collisionHeaders = (await page.locator('table[data-ux-table="four-code-collision"] th').allTextContents())
    .map(text => text.replace(/[↕↑↓]/g, '').trim());
  assert.deepEqual(collisionHeaders, ['方案', '宿主键域', '零声母 scope', '词频截点', '跨族受影响', '高频首选损失', '跨族碰撞桶', '全部碰撞桶', '最大桶']);
  const collisionRows = await page.locator('table[data-ux-table="four-code-collision"] tbody tr').count();
  assert.equal(collisionRows, 5, 'the active 21x26/M36 filter should retain one comparable scheme at five cuts');
  await page.locator('#uxSubnav [data-r9-bench="table"]').click();
  await page.waitForSelector('table[data-ux-table="benchmark"]');
  await page.locator('#uxSubnav [data-r9-bench="collision"]').click();
  await page.waitForSelector('table[data-ux-table="four-code-collision"]');
  await page.locator('[data-action="collision-back"]').click();
  await page.waitForSelector('table[data-ux-table="benchmark"]');
  await page.locator('[data-action="fair"]').click();
  await page.waitForSelector('table[data-ux-table="fair"]');
  const fairHeaders = (await page.locator('table[data-ux-table="fair"] th').allTextContents())
    .map(text => text.replace(/[↕↑↓]/g, '').trim());
  assert.equal(fairHeaders.includes('宿主键域'), false, 'the filtered common host domain should be summarized instead of repeated');
  assert.match(await page.locator('.ux-compact-columns').innerText(), /宿主键域（各方案均为 21×26）/);

  await page.locator('#tabs [data-action="nav:scheme"]').click();
  await page.waitForFunction(() => window.App7.UX.view === 'scheme');
  assert.equal(await page.locator('#nf6SchemePicker').isVisible(), true);
  assert.equal(await page.locator('#uxEnvironment').isVisible(), true);
  assert.equal(await page.locator('#uxFilters').isVisible(), false);
  assert.equal(await page.locator('#uxMarking').isVisible(), false);
  assert.equal(await page.locator('#run').innerText(), '更新详情');

  await page.locator('#nf6SchemeQuery').fill('S005');
  await page.locator('#nf6SchemeList').selectOption('S005');
  await page.waitForFunction(() => window.App7.current().id === 'S005');
  assert.match(await page.locator('#view h2').first().innerText(), /S005/);
  await page.locator('#run').click();
  assert.equal(await page.evaluate(() => window.App7.UX.view), 'scheme');

  const shenyunZeroOnsetSvg = await page.evaluate(() => {
    const entry = window.App7.data.entries.find(row => row.id === 'SNOW-SHENYUN-21X28-TONE');
    return window.App7.keyboardSVG(entry);
  });
  assert.match(shenyunZeroOnsetSvg, /Ø A\/E\/O/);
  assert.match(shenyunZeroOnsetSvg, /Ø W/);
  assert.match(shenyunZeroOnsetSvg, /Ø Y\/YU/);
  assert.doesNotMatch(shenyunZeroOnsetSvg, /Ø Ø/);

  const constrainedSeeds = await page.evaluate(() => ({
    removed: window.App7.data.entries.filter(row => row.id.startsWith('S21X26-')).length,
    retained: ['R10-21X26-M38-07', 'R10-21X26-M37-04']
      .every(id => window.App7.data.entries.some(row => row.id === id)),
  }));
  assert.equal(constrainedSeeds.removed, 40);
  assert.equal(constrainedSeeds.retained, true);

  const viewButtonLefts = await page.locator('.nf5-view-group').evaluateAll(groups => groups.map(group =>
    [...group.querySelectorAll('button')].map(button => button.getBoundingClientRect().left)
  ));
  for (const [first, second] of viewButtonLefts) {
    assert.ok(Math.abs(first - second) < 1, `view buttons should be left-aligned: ${first}, ${second}`);
  }

  const soundMatrixSample = await page.locator('.nf5-matrix-cell .nf5-cell-sample').filter({ hasText: /〔/ }).first().innerText();
  assert.match(soundMatrixSample, /[\u3400-\u9fff]/, 'sound matrix samples should retain corresponding characters');
  await page.locator('[data-nf5-data="list"]').click();
  assert.deepEqual(
    (await page.locator('.nf5-list-table th').allTextContents()).map(text => text.replace('↕', '').trim()),
    ['音节', '对应字', '声韵码', '权重值', '筛选内占比', '重码 / 例外'],
  );
  const soundCells = await page.locator('.nf5-list-table tbody tr').first().locator('td').allTextContents();
  assert.match(soundCells[1], /[\u3400-\u9fff]/);
  assert.match(soundCells[3], /^\d[\d,]*$/);
  assert.match(soundCells[4], /^\d+\.\d{3}%$/);
  const rowColors = await page.locator('.nf5-list-table tbody tr').evaluateAll(rows =>
    rows.slice(0, 10).map(row => getComputedStyle(row.cells[0]).backgroundColor)
  );
  assert.ok(new Set(rowColors).size > 2, 'detail rows should use weight-dependent heat colors');

  await page.locator('#dataset').selectOption('chars');
  await page.locator('#run').click();
  const charCells = await page.locator('.nf5-list-table tbody tr').first().locator('td').allTextContents();
  assert.ok(charCells[1].trim().length > 0, 'single-character details should include a syllable');
  assert.match(charCells[4], /^\d+\.\d{3}%$/);

  await page.locator('#dataset').selectOption('words');
  await page.locator('#run').click();
  const wordCells = await page.locator('.nf5-list-table tbody tr').first().locator('td').allTextContents();
  assert.match(wordCells[1], /^\S+ \S+$/, 'two-character details should include both syllables');
  assert.match(wordCells[4], /^\d+\.\d{3}%$/);

  await page.locator('#tabs [data-action="nav:methods"]').click();
  await page.waitForFunction(() => window.App7.UX.method === 'guide');
  assert.equal(await page.locator('#r9Guide').isVisible(), true);
  assert.equal(await page.locator('table[data-ux-table="r9-representatives"] tbody tr').count(), 11);
  assert.match(await page.locator('#r9Guide').innerText(), /R11/);
  await page.locator('#uxSubnav [data-action="sub:visualLegend"]').click();
  await page.waitForFunction(() => window.App7.UX.method === 'visualLegend');
  assert.equal(await page.getByText('VISUAL SEMANTICS / DV1', { exact: true }).count(), 0);
  for (const id of ['uxFilters', 'uxEnvironment', 'uxMarking', 'nf6MatrixControls']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), false, `${id} should be hidden in legend`);
  }

  await page.locator('#uxSubnav [data-action="sub:matrix"]').click();
  await page.waitForFunction(() => window.App7.UX.method === 'matrix');
  assert.equal(await page.locator('#nf6MatrixControls').isVisible(), true);
  assert.equal(await page.locator('#uxEnvironment').isVisible(), false);
  assert.equal(await page.evaluate(() => {
    const subnav = document.querySelector('#uxSubnav');
    const controls = document.querySelector('#nf6MatrixControls');
    return Boolean(subnav.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), true);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#nf6MatrixControls')).backgroundColor), await page.evaluate(() => getComputedStyle(document.querySelector('#uxEnvironment')).backgroundColor));
  await page.locator('#nf6MatrixModel').selectOption('ckt-center');
  assert.equal(await page.locator('#nf6MatrixScenarioWrap').isVisible(), false);
  await page.locator('#nf6MatrixModel').selectOption('scenario');
  assert.equal(await page.locator('#nf6MatrixScenarioWrap').isVisible(), true);

  assert.deepEqual(pageErrors, []);
  console.log('browser UI scopes and interactions: ok');
} finally {
  await browser.close();
}
