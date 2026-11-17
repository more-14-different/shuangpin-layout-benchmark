import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url), {chromium} = require('playwright');
const browser = await chromium.launch({executablePath: process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true});
const page = await browser.newPage({viewport: {width: 1700, height: 1300}}), errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.goto(pathToFileURL(resolve('a7_CKT_R11.html')).href, {timeout: 180000});
  await page.waitForFunction(() => window.App7?.ready, null, {timeout: 180000});
  const results = await page.evaluate(() => snowJiandaoSchemes().map(native => {
    const entry = snowKeyboardEntry(native), results = [];
    const modes = (native.contract.capacity || [21, 21])[1] === 26
      ? ['semantic', 'overall', 'daily', 'character', 'word2', 'word3', 'word4'] : ['semantic', 'overall'];
    for (const mode of modes) {
      const source = snowJiandaoKeyboardSVG(mode, null, native);
      if (/undefined|NaN/.test(source)) throw new Error(native.id + '/' + mode + ': invalid SVG');
      auditTonedKeymapSVG(source, native);
      const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
      for (const group of doc.querySelectorAll('g[data-key]')) {
        const key = group.dataset.key, rect = group.querySelector(':scope > rect');
        const tones = [...new Set(Object.values(entry.rhymeTonesByKey[key] || {}).join(''))].sort().join('');
        const shape = !!native.keyboards.shapeByKey[key]?.length;
        const shared = shape && !!(entry.roles[key]?.length || entry.rhymes[key]?.length);
        if (mode === 'semantic' && (tones || shape)) {
          const expected = tones ? snowToneFill(tones, shared) : SNOW_SHAPE_PALETTE.keyFill;
          if (rect.getAttribute('fill') !== expected) throw new Error(native.id + '/' + key + ': wrong semantic fill');
        }
        if (tones || shape) {
          if (!/^#[0-9a-f]{6}$/i.test(rect.getAttribute('fill'))) throw new Error(native.id + '/' + key + ': invalid fill');
        }
      }
      results.push(mode);
    }
    return {id: native.id, modes: results};
  }));
  assert.ok(results.some(result => result.id === 'T2126-POLISHED-8832091'));
  for (const id of ['T2126-POLISHED-8832091', 'SNOW-JIANDAO-TONED']) {
    await page.evaluate(id => {CURRENT = id; snowJiandaoRenderDetail()}, id);
    if (id.startsWith('T2126')) {
      for (const mode of ['semantic', 'overall', 'semantic']) {
        await page.locator('#snowJiandaoKeyboardMode').selectOption(mode);
        for (const query of ['bao1', 'bao', '']) await page.locator('#nf5Query').fill(query);
        assert.notEqual(await page.locator('#svgbox g[data-key="B"] > rect').getAttribute('fill'), 'undefined');
      }
      assert.equal(await page.locator('#svgbox g[data-key="B"] > rect').getAttribute('fill'), '#f5e8bd');
      assert.equal(await page.locator('#svgbox g[data-key="E"] > rect').getAttribute('fill'), '#c2d2c2');
      assert.equal(await page.locator('#svgbox g[data-key="A"] > rect').getAttribute('fill'), '#becdd6');
    }
    mkdirSync('research/.cache/keymap-tone-fix', {recursive: true});
    await page.locator('#svgbox').screenshot({path: `research/.cache/keymap-tone-fix/${id}-after.png`});
  }
  assert.deepEqual(errors, []);
  console.log(`${results.length} toned schemes: semantic colors, heat modes, final SVG link audit, query/redraw and B-key regression passed`);
} finally {
  await browser.close();
}
