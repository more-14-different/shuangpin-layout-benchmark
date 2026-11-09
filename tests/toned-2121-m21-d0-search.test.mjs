import assert from 'node:assert/strict';
import test from 'node:test';
import search from '../tools/search_toned_2121_m21_d0.js';

test('M21 ordinary-D0 guard spends memory only on special first and rhyme moves', () => {
  assert.deepEqual(search.guard(3, 6), {
    seedM: 12,
    deltaDOrdinary: 0,
    deltaSpecial: 3,
    deltaV: 6,
    MGuard: 21,
    definition: 'MGuard=12+deltaSpecial+deltaV; ordinary shengjie displacement is frozen at zero',
  });
});

test('ordinary-D0 special families are explicit and stable', () => {
  assert.deepEqual(search.SPECIAL_FIRST_FAMILIES, [
    '_', '_i', '_u', '_v', 'ch', 'chu', 'sh', 'shu', 'zh', 'zhu',
  ]);
});

test('beam state registration rejects a duplicate instead of consuming another slot', () => {
  const seen = new Set();
  assert.equal(search.rememberState(seen, 'same-code'), true);
  assert.equal(search.rememberState(seen, 'same-code'), false);
  assert.equal(search.rememberState(seen, 'different-code'), true);
  assert.equal(seen.size, 2);
});
