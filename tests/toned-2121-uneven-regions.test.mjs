import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {
  FORBIDDEN_SOURCE_KEYS,
  TONE_PROFILES,
  toneRegionIndex,
  toneRegionMemoryLower,
} = require('../tools/search_toned_2121_pindu11_uneven_regions.js');

test('AVUIO first grammar has exactly five occupied source buckets to project', () => {
  assert.deepEqual(FORBIDDEN_SOURCE_KEYS, ['A', 'V', 'U', 'I', 'O']);
});

test('independent 11-to-7/8/6 rhyme regions spend twelve merge links', () => {
  const state = {
    regionMaps: [
      [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3],
      [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2],
      [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4],
    ],
  };
  assert.equal(toneRegionMemoryLower(state), 12);
});

test('alternative profile maps tone3/neutral, tone1/2, and tone4 to 7/8/6', () => {
  const profile = TONE_PROFILES['upper35-home12-lower4'];
  assert.deepEqual([1, 2, 3, 4, 5].map(tone => toneRegionIndex(tone, profile)),
    [1, 1, 0, 2, 0]);
  assert.equal(profile.neutralToneRule, 1);
});

test('tracked 7/8/6 finalists preserve the full-score champion and audit', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const layouts = JSON.parse(fs.readFileSync(path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-uneven786-finalists.json')));
  const report = JSON.parse(fs.readFileSync(path.join(root,
    'research/notes/2026-11-10-ckt-v51-toned-2121-pindu11-uneven786-full.json')));
  assert.equal(layouts.layouts.length, 8);
  assert.equal(report.results.length, 32);
  const scoredIds = new Set(report.results.map(value => value.id));
  assert.ok(layouts.layouts.every(value => scoredIds.has(value.id)));
  const champion = [...report.results].sort((left, right) => left.score - right.score)[0];
  assert.equal(champion.id, 'UNEVEN786-pindu11-D8-267');
  assert.equal(champion.score, 9.589470270392193);
  assert.deepEqual(layouts.layouts[0].memoryAudit, {
    lowerM: 29,
    conservativeMGuard: 34,
    firstRuleLower: 14,
    normalizedRhymeRules: 3,
    toneRegionMergeLower: 12,
    traditionalOnsetD: 9,
    onsetKeyIncidences: 27,
    onsetFragmentation: 9,
    comparability: 'rule-count lower/guard; not QZ M-R2',
    idAudit: 'legacy D8 id retained; recomputed from emitted codes as D9/F9',
  });
});
