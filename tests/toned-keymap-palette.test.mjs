import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {SNOW_TONE_FILLS, snowToneFill} = require('../tools/snow_jiandao_toned_view.js');

test('single legal tones retain the region color when their partner is absent', () => {
  for (const [region, fill] of Object.entries(SNOW_TONE_FILLS)) {
    assert.equal(snowToneFill(region), fill);
    for (const tone of region) assert.equal(snowToneFill(tone), fill);
  }
  assert.equal(snowToneFill(''), null);
  assert.throws(() => snowToneFill('14'), /Unsupported/);
});

test('shared rhyme/shape keys darken each tone region by the same amount', () => {
  for (const region of Object.keys(SNOW_TONE_FILLS)) {
    const light = snowToneFill(region), dark = snowToneFill(region, true);
    assert.match(dark, /^#[0-9a-f]{6}$/);
    for (let offset = 1; offset < 7; offset += 2) {
      const channel = parseInt(light.slice(offset, offset + 2), 16);
      assert.equal(parseInt(dark.slice(offset, offset + 2), 16), Math.round(channel * .88));
    }
    for (const tone of region) assert.equal(snowToneFill(tone, true), dark);
  }
});
