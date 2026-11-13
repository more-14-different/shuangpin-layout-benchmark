import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url);
const artifact = resolve('a7_CKT_R11.html');
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!existsSync(artifact) || !existsSync(edge)) {
  console.log('Snow keyboard browser test skipped: local R11 HTML or Edge unavailable');
  process.exit(0);
}
const {chromium} = require('playwright');
const browser = await chromium.launch({executablePath: edge, headless: true});
const page = await browser.newPage({viewport: {width: 1600, height: 1200}});
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.goto(pathToFileURL(artifact).href, {timeout: 120_000});
  await page.waitForFunction(() => window.App7?.ready, null, {timeout: 120_000});
  await page.locator('[data-snow-jiandao-open]').click();
  await page.waitForSelector('#snowJiandaoTonedDetail');
  assert.equal(await page.locator('#svgbox svg').count(), 1);
  assert.match(await page.locator('#svgbox g[data-key="R"]').textContent(), /Ø A\/E\/O/);
  const semantics = await page.evaluate(() => {
    const svg = document.querySelector('#svgbox svg'), text = key => svg.querySelector(`g[data-key="${key}"]`);
    const fill = key => text(key).querySelector(':scope > rect').getAttribute('fill');
    return {
      fills: ['Q', 'W', 'S', 'D', 'Z', 'N'].map(fill),
      nRhymes: [...text('N').querySelectorAll('[data-rhyme]')].map(t => t.dataset.rhyme),
      rhymeColors: [...svg.querySelectorAll('[data-rhyme="a-ou"]')].map(t => t.getAttribute('fill')),
      sourceP: [...text('P').querySelectorAll('text')].find(t => t.textContent === 'P').getAttribute('fill'),
      targetP: [...text('K').querySelectorAll('text')].find(t => t.textContent === 'p').getAttribute('fill'),
      shapes: ['A', 'V', 'U', 'I', 'O'].map(key => [...text(key).querySelectorAll('text')].map(t => t.textContent).join(' ')),
      clipped: [...svg.querySelectorAll('[data-rhyme]')].filter(t => {
        const box = t.getBBox(), clip = t.parentElement.parentElement.querySelector('clipPath rect').getBBox();
        return box.x < clip.x || box.y < clip.y || box.x + box.width > clip.x + clip.width || box.y + box.height > clip.y + clip.height;
      }).map(t => t.textContent),
    };
  });
  assert.equal(semantics.fills[0], semantics.fills[1]);
  assert.equal(semantics.fills[2], semantics.fills[3]);
  assert.equal(semantics.fills[4], semantics.fills[5]);
  assert.equal(new Set(semantics.fills).size, 3);
  assert.deepEqual(semantics.nRhymes, ['en-n', 'u', 'o-ong']);
  assert.equal(new Set(semantics.rhymeColors).size, 1);
  assert.equal(semantics.rhymeColors.length, 3);
  assert.equal(semantics.sourceP, semantics.targetP);
  for (const [i, meaning] of ['折', '横', '撇', '竖', '点'].entries()) {
    assert.match(semantics.shapes[i], new RegExp(meaning));
    assert.doesNotMatch(semantics.shapes[i], /阴|阳|上|去|轻/);
  }
  assert.deepEqual(semantics.clipped, []);
  const activeKeys = () => page.locator('#svgbox g[data-active="true"]').evaluateAll(nodes => nodes.map(n => n.dataset.key).sort());
  const input = page.locator('#nf5Query');
  await input.fill('jian4dao1');
  const expected = await page.evaluate(() => {
    const data = window.App7.data, snow = data.tonedContractBenchmark.schemes.snowJiandao;
    return [...new Set(snow.tonedCodes[data.pinyin.indexOf('jian')][3] + snow.tonedCodes[data.pinyin.indexOf('dao')][0])].sort();
  });
  assert.deepEqual(await activeKeys(), expected);
  assert.match(await page.locator('#nf5FilterSummary').textContent(), /主码预览/);
  await input.fill('jiandao');
  const untoned = await activeKeys();
  assert.ok(expected.every(key => untoned.includes(key)));
  assert.ok(untoned.length > expected.length);
  await input.fill('你好');
  assert.match(await page.locator('#snowJiandaoFilteredData').textContent(), /ni3 hao3/);
  const hanzi = await activeKeys();
  assert.ok(hanzi.length > 0);
  await input.fill('ni3hao3');
  const phonetic = await activeKeys();
  assert.ok(hanzi.every(key => phonetic.includes(key)));
  for (const selector of ['#snowJiandaoExportRows', '[data-snow-export="svg"]', '[data-snow-export="bundle"]']) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
    const contents = readFileSync(await download.path(), 'utf8');
    assert.ok(contents.length > 0);
    if (selector.includes('ExportRows')) assert.match(contents, /你好\tni3 hao3/);
    else assert.match(contents, /nf5-dim/);
    if (selector.includes('bundle')) assert.match(contents, /统一筛选：ni3hao3/);
  }
  await input.fill('de0');
  assert.ok((await activeKeys()).length > 0);
  await input.fill('不存在的拼音!');
  assert.deepEqual(await activeKeys(), []);
  assert.match(await page.locator('#nf5FilterSummary').textContent(), /无匹配/);
  await input.fill('你好');
  for (const mode of ['overall', 'daily', 'character', 'word2', 'word3', 'word4', 'semantic']) {
    await page.locator('#snowJiandaoKeyboardMode').selectOption(mode);
    assert.equal(await input.inputValue(), '你好');
    assert.equal(await page.locator('#svgbox svg').count(), 1);
    assert.match(await page.locator('#svgbox svg').getAttribute('aria-label'), /冰雪剑道/);
  }
  await page.locator('#nf5Reset').click();
  await page.locator('#snowJiandaoKeyboardMode').selectOption('overall');
  const consistency = await page.evaluate(() => {
    const native = window.App7.data.tonedContractBenchmark.schemes.snowJiandao;
    return Object.keys(native.ergonomics.tracks).map(kind => {
      const load = snowRowsLoad(snowFilteredRows(native, '', kind));
      return Math.max(...Object.entries(native.ergonomics.tracks[kind].load).map(([key, value]) => Math.abs((load[key] || 0) - value)));
    });
  });
  assert.ok(consistency.every(error => error < 1e-12));
  assert.match(await page.locator('#nf5FilterSummary').textContent(), /1:3:1:1/);
  assert.equal(await page.locator('#svgbox .nf5-dim').count(), 0);
  await page.locator('#snowJiandaoKeyboardMode').selectOption('semantic');
  mkdirSync(resolve('research/.cache'), {recursive: true});
  await page.locator('.snow-jiandao-keyboards').screenshot({path: resolve('research/.cache/snow-jiandao-keyboard.png')});
  await page.setViewportSize({width: 600, height: 1000});
  assert.equal(await input.isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('Snow merged keyboard, colors, tone-aware filters and track heat: ok');
} finally {
  await browser.close();
}
