import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { fixtureAdapter, loadMetric } = require('../tools/score_snow_jiandao_toned_benchmark.js');

test('tone-in-main fixture adapter preserves only legal toned syllables', () => {
  const fixture = {
    pinyin: ['a', 'ba'],
    tonedCodes: [
      ['ZA', 'XA', null, null, null],
      ['BA', null, 'BC', null, null],
    ],
    layoutId: 'fixture',
    baselineMemoryLower: 20,
    baselineMemoryGuard: 22,
  };
  const { inventory, layout } = fixtureAdapter(fixture, { pinyin: ['a', 'ba'] });
  assert.deepEqual(inventory.tokenKeys, ['a1', 'a2', 'ba1', 'ba3']);
  assert.deepEqual(layout.tonedCodes, ['ZA', 'XA', 'BA', 'BC']);
  assert.deepEqual(layout.declaredMemory, { M: 21, lower: 21, guard: 23 });
});

test('native load metric normalizes weighted terminal strokes', () => {
  const metric = loadMetric([
    { code: 'AS', weight: 3 },
    { code: 'QP', weight: 1 },
  ]);
  assert.equal(metric.home, 6 / 8);
  assert.equal(metric.leftPinkyQAZ, 4 / 8);
  assert.equal(metric.rightPinky, 1 / 8);
  assert.equal(metric.indexFingerTYB, 0);
  assert.equal(Object.values(metric.load).reduce((sum, value) => sum + value, 0), 1);
});
