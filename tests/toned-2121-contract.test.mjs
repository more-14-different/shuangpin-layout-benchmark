import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1),
  ]).map(rest => [value, ...rest]));
}

const require = createRequire(import.meta.url);
const {
  PRIMARY_TONE_ROW_ASSIGNMENT,
  SECOND_CODE_FACTORIZATIONS,
  TONED_BUCKET_COUNT,
  TONE_ROWS,
  buildToned2121Contract,
  enumerateRowBalancedAuxiliaryKeySets,
  enumerateToneRowAssignments,
  rowForTone,
} = require('../tools/toned_2121_contract.js');
const {
  characterInventory,
} = require('../tools/audit_toned_2121_inventory.js');

test('21+5 topology keeps sound and shape-auxiliary key domains disjoint', () => {
  const contract = buildToned2121Contract('QAOPL');
  assert.equal(contract.soundKeys.length, 21);
  assert.equal(new Set(contract.soundKeys).size, 21);
  assert.equal(contract.auxiliaryKeySetLabel, 'QAOPL');
  assert.equal(contract.auxiliaryKeySet, 'ALOPQ');
  assert.equal(contract.shapeKeysByMeaning, 'QAOPL');
  assert.equal(contract.toneKeysByTone, 'PAOQL');
  assert.equal(contract.toneDigitsByShapeMeaning, '42310');
  assert.equal([...contract.shapeKeysByMeaning].some(key => contract.soundKeys.includes(key)), false);
  assert.equal(contract.toneAuxiliaryEnabled, false);
  assert.equal(contract.shapeAuxiliaryEnabled, true);
  assert.equal(contract.auxiliarySelectionStatus, 'frozen-from-prior-research');
});

test('all 120 QAOPL meaning orders round-trip through explicit auxiliary semantics', () => {
  const orders = permutations([...'QAOPL']).map(value => value.join(''));
  assert.equal(new Set(orders).size, 120);
  for (const shapeKeysByMeaning of orders) {
    const contract = buildToned2121Contract(shapeKeysByMeaning);
    assert.equal(contract.auxiliaryKeySet, 'ALOPQ');
    assert.equal(contract.shapeKeysByMeaning, shapeKeysByMeaning);
    assert.equal(contract.toneDigitsByShapeMeaning, '42310');
  }
});

test('3x7 second-key topology exposes exactly 441 toned syllable buckets', () => {
  const contract = buildToned2121Contract();
  assert.deepEqual(TONE_ROWS, ['upper', 'home', 'lower']);
  assert.deepEqual(contract.soundKeyCountByRow, {upper: 7, home: 7, lower: 7});
  assert.deepEqual(contract.soundKeysByRow, {
    upper: 'WERTYUI',
    home: 'SDFGHJK',
    lower: 'ZXCVBNM',
  });
  assert.equal(contract.finalColumnsPerRow, 7);
  assert.equal(contract.secondKeyCount, 21);
  assert.equal(TONED_BUCKET_COUNT, 441);
  assert.equal(contract.tonedSyllableBuckets, 441);
});

test('QAOPL is frozen out of the 3/2/0 topology universe and only meaning order is searched', () => {
  const keySets = enumerateRowBalancedAuxiliaryKeySets();
  assert.equal(keySets.length, 4320);
  assert.equal(new Set(keySets).size, 4320);
  assert.ok(keySets.includes('ALOPQ'));
  assert.equal(buildToned2121Contract().rowBalancedAuxiliaryKeySetUniverseCount, 4320);
  assert.equal(buildToned2121Contract().auxiliaryKeySetCandidateCount, 1);
  assert.equal(buildToned2121Contract().auxiliaryLayoutCandidateCount, 120);
  assert.throws(() => buildToned2121Contract('ASUIO'), /freezes auxiliaryKeySet=QAOPL/);
  assert.throws(() => buildToned2121Contract('AVUIO'), /freezes auxiliaryKeySet=QAOPL/);
});

test('four lexical tones have 36 labelled three-row merge assignments', () => {
  const assignments = enumerateToneRowAssignments();
  assert.equal(assignments.length, 36);
  assert.equal(new Set(assignments.map(value => JSON.stringify(value))).size, 36);
  assert.ok(assignments.some(value =>
    JSON.stringify(value) === JSON.stringify({upper: [4], home: [2, 3], lower: [1]})));
});

test('primary tone rows are upper 4, home 3/2, lower 1/neutral', () => {
  assert.deepEqual(PRIMARY_TONE_ROW_ASSIGNMENT, {upper: [4], home: [3, 2], lower: [1]});
  assert.equal(rowForTone(1), 'lower');
  assert.equal(rowForTone(2), 'home');
  assert.equal(rowForTone(3), 'home');
  assert.equal(rowForTone(4), 'upper');
  assert.equal(rowForTone(0), 'lower');
  assert.equal(rowForTone(5), 'lower');
});

test('second-code factorization is unresolved and preserves four explicit research candidates', () => {
  const contract = buildToned2121Contract();
  assert.equal(contract.secondCodeFactorizationSelectionStatus, 'unresolved-for-toned-3x7');
  assert.deepEqual(SECOND_CODE_FACTORIZATIONS.map(value => value.id), [
    'shengjie-rhyme-body',
    'shengjie-pindu11-rhyme',
    'restored-onset-full-final',
    'written-onset-written-final',
  ]);
});

test('inventory audit keeps toned syllables distinct and honors the common cohort', () => {
  const data = {
    pinyin: ['a', 'ba'],
    characters: [
      ['甲', 0, 1, 10, 1],
      ['乙', 0, 2, 5, 1],
      ['丙', 0, 1, 2, 1],
      ['丁', 1, 5, 7, 0],
    ],
  };
  const inventory = characterInventory(data, false);
  assert.equal(inventory.rows, 3);
  assert.equal(inventory.distinctTonedSyllables, 2);
  assert.equal(inventory.byTone[1].distinctSyllables, 1);
  assert.equal(inventory.byTone[1].tokenWeight, 12);
  assert.equal(inventory.byTone[2].tokenWeight, 5);
});
