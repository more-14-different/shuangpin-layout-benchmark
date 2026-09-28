import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifact = resolve('a7_CKT_NF3_closure.html');
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

  assert.equal(await page.locator('#nf6SelectionFilters').isVisible(), true);
  assert.equal(await page.locator('#uxFilters').isVisible(), false);
  assert.equal(await page.locator('#uxEnvironment').isVisible(), false);
  assert.equal(await page.locator('#uxMarking').isVisible(), false);
  assert.equal(await page.locator('.nf6-preference-card').isVisible(), true);
  assert.equal(await page.locator('#s005Comparison').count(), 0);
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

  await page.locator('#nf6SelectionMemory').fill('32');
  await page.waitForTimeout(250);
  assert.match(await page.locator('#nf6SelectionCount').innerText(), /\d+ \/ 315 个候选/);
  assert.match(await page.locator('.nf6-filter-live').innerText(), /\d+ 个候选/);

  await page.locator('.nf6-preference-card [data-action="nav:benchmark"]').click();
  await page.waitForFunction(() => window.App7.UX.view === 'benchmark');
  assert.equal(await page.locator('#assocOp').inputValue(), 'le');
  assert.equal(await page.locator('#assocValue').inputValue(), '32');
  for (const id of ['uxFilters', 'uxEnvironment', 'uxMarking']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), true, `${id} should be visible in benchmark`);
  }

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

  await page.locator('#tabs [data-action="nav:methods"]').click();
  await page.waitForFunction(() => window.App7.UX.method === 'guide');
  const guideSpacing = await page.evaluate(() => {
    const exploration = document.querySelector('.pub-exploration-map');
    const report = document.querySelector('#nf3Report');
    const table = exploration.querySelector('.scroll');
    const notes = exploration.querySelector('.pub-exploration-notes');
    const gap = (upper, lower) => lower.getBoundingClientRect().top - upper.getBoundingClientRect().bottom;
    return {
      explorationToReport: gap(exploration, report),
      tableToNotes: gap(table, notes),
      noteCount: notes.children.length,
    };
  });
  assert.ok(guideSpacing.explorationToReport >= 28, `exploration/report gap: ${guideSpacing.explorationToReport}`);
  assert.ok(guideSpacing.tableToNotes >= 18, `table/notes gap: ${guideSpacing.tableToNotes}`);
  assert.equal(guideSpacing.noteCount, 2);
  await page.locator('#uxSubnav [data-action="sub:visualLegend"]').click();
  await page.waitForFunction(() => window.App7.UX.method === 'visualLegend');
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
