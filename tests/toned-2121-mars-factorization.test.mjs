import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {
  MARS_RHYME_GROUPS,
  MARS_RHYME_ORDER,
  MARS_SEARCHABLE_FIRST_ATOMS,
  marsAudit,
  marsFirstAtom,
  marsFirstMoveMemoryDelta,
  marsFirstGroup,
  marsRhymeIndex,
} = require('../tools/mars_toned_factorization.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

test('Mars transcription covers all 37 full finals in exactly ten source columns', () => {
  const seeds = readJson('research/config/ckt-v51-toned-2121-seeds.json');
  const audit = marsAudit(seeds.decomposition);
  assert.equal(MARS_RHYME_GROUPS.length, 10);
  assert.equal(MARS_RHYME_ORDER.length, 10);
  assert.equal(audit.inventoryFinalCount, 37);
  assert.deepEqual(audit.missingFinals, []);
  assert.deepEqual(audit.unusedDeclaredFinals, []);
  assert.equal(audit.firstGroups.length, 23);
});

test('Mars first search only exposes whole exceptional onset and zero-onset families', () => {
  assert.deepEqual(MARS_SEARCHABLE_FIRST_ATOMS, [
    'zh', 'ch', 'sh', 'zero-Y', 'zero-W', 'zero-A', 'zero-E', 'zero-O',
  ]);
  assert.deepEqual(Object.fromEntries([
    'zhi', 'zhu', 'chi', 'chu', 'shi', 'shu',
    'ya', 'yu', 'wa', 'a', 'e', 'er', 'o', 'bai',
  ].map(pinyin => [pinyin, marsFirstAtom(pinyin)])), {
    zhi: 'zh', zhu: 'zh', chi: 'ch', chu: 'ch', shi: 'sh', shu: 'sh',
    ya: 'zero-Y', yu: 'zero-Y', wa: 'zero-W', a: 'zero-A', e: 'zero-E',
    er: 'zero-E', o: 'zero-O', bai: 'b',
  });
  assert.equal(marsFirstMoveMemoryDelta('zh'), 0);
  assert.equal(marsFirstMoveMemoryDelta('zero-Y'), 1);
  assert.equal(marsFirstMoveMemoryDelta('zero-A'), 1);
});

test('Mars ignores compound-final heads for iu, ui, and un', () => {
  const seeds = readJson('research/config/ckt-v51-toned-2121-seeds.json');
  const byPinyin = new Map(seeds.decomposition.map(value => [value.pinyin, value]));
  assert.equal(MARS_RHYME_ORDER[marsRhymeIndex(byPinyin.get('liu').fullFinal)], 'a-ou');
  assert.equal(MARS_RHYME_ORDER[marsRhymeIndex(byPinyin.get('gui').fullFinal)], 'e-ei');
  assert.equal(MARS_RHYME_ORDER[marsRhymeIndex(byPinyin.get('lun').fullFinal)], 'en-n');
  assert.equal(marsFirstGroup('zhi'), 'zh');
  assert.equal(marsFirstGroup('a'), 'r/_');
});

test('tracked zh-to-E Mars10 frontier is low-M and independently full-scored', () => {
  const layouts = readJson(
    'research/config/ckt-v51-toned-2121-marsfirst-zh-e-mars10-uneven786-finalist.json');
  const scores = readJson(
    'research/notes/2026-11-10-ckt-v51-toned-2121-marsfirst-zh-e-mars10-full3.json');
  const layout = layouts.layouts[0];
  assert.equal(layout.id, 'UNEVEN786-marsfirst-zh-e-mars10-D1-014');
  assert.deepEqual({
    lowerM: layout.memoryAudit.lowerM,
    guard: layout.memoryAudit.conservativeMGuard,
    d: layout.memoryAudit.traditionalOnsetD,
    f: layout.memoryAudit.onsetFragmentation,
    buckets: layout.structuralMetrics.occupiedBuckets,
  }, {lowerM: 20, guard: 22, d: 1, f: 1, buckets: 441});
  assert.equal(scores.results[0].id, layout.id);
  assert.ok(Math.abs(scores.results[0].score - 9.5565304573314) < 1e-12);
});

test('Mars10 finalist examples preserve written onset and tone-region rhyme keys', () => {
  const layouts = readJson(
    'research/config/ckt-v51-toned-2121-marsfirst-zh-e-mars10-uneven786-finalist.json');
  const layout = layouts.layouts[0];
  const codes = new Map(layouts.tokenKeys.map((token, index) => [token, layout.tonedCodes[index]]));
  assert.deepEqual(Object.fromEntries(['liu2', 'gui3', 'lun4', 'lian2', 'juan3',
    'xue4', 'shi4', 'zhi4', 'er2', 'a1'].map(token => [token, codes.get(token)])), {
    liu2: 'LS',
    gui3: 'GD',
    lun4: 'LW',
    lian2: 'LG',
    juan3: 'JG',
    xue4: 'XQ',
    shi4: 'SY',
    zhi4: 'EY',
    er2: 'RL',
    a1: 'RX',
  });
});

test('Mars/Pindu ablation frontiers keep their full-score ordering', () => {
  const routes = [
    ['mars10-uneven786-finalist', 'mars10-uneven786-full8', 9.93953406824846, 20, 0],
    ['marsfirst-pindu11-uneven786-finalist', 'marsfirst-pindu11-full4',
      10.071306033756782, 19, 0],
    ['pindufirst-mars10-uneven786-finalist', 'pindufirst-mars10-full4',
      9.574367278623125, 30, 9],
    ['pindutrialfirst-mars10-uneven786-finalist', 'pindutrialfirst-mars10-full6',
      9.568525570681722, 31, 9],
  ];
  for (const [layoutStem, scoreStem, expectedScore, expectedM, expectedD] of routes) {
    const layouts = readJson(`research/config/ckt-v51-toned-2121-${layoutStem}.json`);
    const scores = readJson(`research/notes/2026-11-10-ckt-v51-toned-2121-${scoreStem}.json`);
    assert.equal(scores.results[0].id, layouts.layouts[0].id);
    assert.ok(Math.abs(scores.results[0].score - expectedScore) < 1e-12);
    assert.equal(layouts.layouts[0].memoryAudit.lowerM, expectedM);
    assert.equal(layouts.layouts[0].memoryAudit.traditionalOnsetD, expectedD);
  }
});
