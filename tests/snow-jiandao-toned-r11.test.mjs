import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { fixtureAdapter, keyboardSemantics, loadMetric, ordinaryOnsetDiagnostics, filterRows } = require('../tools/score_snow_jiandao_toned_benchmark.js');
const {snowFilteredRows, snowRowsLoad, snowPinyinPreview, snowKeyboardEntry} = require('../tools/snow_jiandao_toned_view.js');
const {shapeKeysFromToneKeys, toneKeysFromShapeKeys} = require('../tools/auxiliary_semantics.js');

test('ordinary D/F is derived from codes rather than stale declared metadata', () => {
  const fixture = {atoms:[{initial:'p',pinyin:[0,1]},{initial:'ch',pinyin:[2]}],
    tonedCodes:[['KA',null],['KB',null],['SA',null]],
    expected:{declaredDiagnostics:{onsetFragmentation:1}}};
  assert.deepEqual(ordinaryOnsetDiagnostics(fixture), {D:1,F:0});
  fixture.tonedCodes[1][1]='PA';
  assert.deepEqual(ordinaryOnsetDiagnostics(fixture), {D:1,F:1});
});

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
  fixture.publication = {memoryAudit: {memoryLower: 22, memoryGuard: 24}};
  assert.deepEqual(fixtureAdapter(fixture, {pinyin: fixture.pinyin}).layout.declaredMemory,
    {M: 22, lower: 22, guard: 24}, 'CR repartition uses its audited memory instead of the production baseline offset');
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

test('filter export preserves tone 0, actual terminal strokes, and multiword main contracts', () => {
  const fixture = {tonedCodes: [['JQ', null, null, 'JL', 'JZ'], ['DC']]};
  const data = {pinyin: ['jian', 'dao'], characters: [['间', 0, 5, 2]]};
  const words = {word2: [{py: [0, 1], tones: [4, 1]}], word3: [{py: [0, 1, 0], tones: [4, 1, 5]}]};
  const rows = filterRows([
    {id: 'c:间:0', text: '间', kind: 'character', code: 'JZA', weight: 2},
    {id: 'w2:0', text: '剑道', kind: 'word2', code: 'JLDCA', weight: 8},
    {id: 'word3:0', text: '剑道间', kind: 'word3', code: 'JDJV', weight: 3},
  ], fixture, data, words);
  assert.deepEqual(rows, [
    ['间', 'jian0', 'JZ', 'JZA', 2, 'character'],
    ['剑道', 'jian4 dao1', 'JLDC', 'JLDCA', 8, 'word2'],
    ['剑道间', 'jian4 dao1 jian0', 'JDJ', 'JDJV', 3, 'word3'],
  ]);
  const native = {filterRows: rows};
  for (const q of ['剑道', 'jiandao', 'jian4dao1', "jian4 dao1", "jian4'dao1", 'jian4dao']) {
    assert.equal(snowFilteredRows(native, q, 'word2').length, 1, q);
  }
  assert.equal(snowFilteredRows(native, 'jian1dao1').length, 0);
  assert.equal(snowFilteredRows(native, 'ian4dao1').length, 0);
  assert.equal(snowFilteredRows(native, 'jian0', 'character').length, 1);
  assert.equal(snowFilteredRows(native, 'jian5', 'character').length, 1);
  assert.equal(snowFilteredRows(native, '不存在').length, 0);
});

test('overall heat respects 1:3:1:1 tracks without allowing corpus size to change the mix', () => {
  const rows = [['甲', 'a1', 'AA', 'AA', 1000, 'character'], ['甲乙', 'a1 yi1', 'BC', 'BC', 2, 'word2']];
  assert.deepEqual(snowRowsLoad(rows), {A: .25, B: .375, C: .375});
  assert.deepEqual(snowRowsLoad(rows.slice(1)), {B: .5, C: .5});
  assert.deepEqual(snowRowsLoad([]), {});
});

test('pinyin preview unions legal tones of the shortest readings, including neutral 0', () => {
  const native = {tonedCodes: [['JZ', 'JF', 'JF', 'JQ', 'JZ'], ['DC', 'DH', 'DH', 'DT', null]]};
  const pinyin = ['jian', 'dao'];
  const keys = q => new Set(snowPinyinPreview(native, pinyin, q).flatMap(row => row.keys));
  assert.deepEqual(keys('jian4dao1'), new Set('JQDC'));
  assert.deepEqual(keys('jiandao'), new Set('JZFQDCHT'));
  assert.deepEqual(keys('jian0'), new Set('JZ'));
  assert.deepEqual(keys('jian0dao0'), new Set());
  assert.deepEqual(keys('notapinyin'), new Set());
  assert.deepEqual(keys('剑道'), new Set());
  assert.deepEqual(keys('jiandao'.repeat(20)), keys('jiandao'));
});

test('merged semantic adapter retains zero-O and round-trips auxiliary meaning', () => {
  const native = {id: 'snow', name: 'snow', contract: {toneKeysByTone: 'IVUAO'}, keyboards: {
    firstByKey: {R: ['r', 'zero-A', 'zero-E', 'zero-O']},
    secondByKey: {N: ['en-n·一', 'en-n·轻', 'u·一', 'u·轻', 'o-ong·一', 'o-ong·轻']},
  }};
  const entry = snowKeyboardEntry(native);
  assert.deepEqual(entry.roles.R, ['r', 'ØA', 'ØE', 'ØO']);
  assert.deepEqual(entry.rhymes.N, ['en-n', 'u', 'o-ong']);
  assert.deepEqual(entry.rhymeTonesByKey.N, {'en-n': '01', u: '01', 'o-ong': '01'});
  assert.equal(shapeKeysFromToneKeys(entry.tone), 'AVUIO');
  assert.equal(toneKeysFromShapeKeys(shapeKeysFromToneKeys(entry.tone)), entry.tone);
  const fixture = {atoms: [], rhymeAtoms: [], tonedCodes: [], toneKeysByTone: entry.tone, shapeKeysByMeaning: 'AVUIO'};
  const semantics = keyboardSemantics(fixture);
  assert.deepEqual(['A', 'V', 'U', 'I', 'O'].map(key => semantics.shapeByKey[key][0]), ['折', '横', '撇', '竖', '点']);
  assert.throws(() => keyboardSemantics({...fixture, shapeKeysByMeaning: 'IVUAO'}), /round trip mismatch/);
});
