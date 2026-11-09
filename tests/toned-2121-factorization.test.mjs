import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildFactorizations,
  indexedFactorization,
  strictBounds,
} = require('../tools/search_toned_2121_factorizations.js');

const seeds = JSON.parse(fs.readFileSync(new URL(
  '../research/config/ckt-v51-toned-2121-seeds.json', import.meta.url), 'utf8'));

test('three toned 21x21 factorizations cover Common399 with audited component counts', () => {
  const pinyin = seeds.decomposition.map(row => row.pinyin);
  const factorizations = buildFactorizations(seeds).map(definition =>
    indexedFactorization(definition, pinyin));
  assert.deepEqual(factorizations.map(value => ({
    id: value.id,
    pinyin: value.pairByPinyin.size,
    first: value.firstComponents.length,
    second: value.secondComponents.length,
  })), [
    {id: 'shengjie-rhyme-body', pinyin: 399, first: 55, second: 16},
    {id: 'restored-onset-full-final', pinyin: 399, first: 22, second: 37},
    {id: 'written-onset-written-final', pinyin: 399, first: 27, second: 35},
  ]);
});

test('strict collision bounds distinguish tone-row signatures from the 441 capacity bound', () => {
  const factorization = {
    pairByPinyin: new Map([
      ['a', [0, 0]],
      ['ba', [1, 0]],
    ]),
  };
  const tokens = [
    {pinyin: 'a', row: 0},
    {pinyin: 'a', row: 0},
    {pinyin: 'a', row: 1},
    {pinyin: 'ba', row: 0},
  ];
  const bounds = strictBounds(tokens, factorization);
  assert.equal(bounds.distinctTonedSyllables, 4);
  assert.equal(bounds.toneRowMergeCollisionExcessLowerBound, 1);
  assert.equal(bounds.identicalFactorSignatureCollisionExcessLowerBound, 1);
  assert.equal(bounds.combinedStrictCollisionExcessLowerBound, 1);
  assert.equal(bounds.occupiedBucketUpperBound, 3);
});

test('seed inventory separates Common1237 audit tokens from Common399 CKT code coverage', () => {
  assert.equal(seeds.auditTokenKeys.length, 1237);
  assert.equal(seeds.layoutTokenKeys.length, 1407);
  assert.equal(seeds.qaoplTonedShengjieSeeds.length, 7);
  for (const candidate of seeds.qaoplTonedShengjieSeeds) {
    assert.equal(candidate.tonedCodes.length, seeds.layoutTokenKeys.length);
    assert.ok(candidate.tonedCodes.every(Boolean));
  }
});

test('first structural search reaches the rigorous 441-bucket capacity ceiling for all splits', () => {
  const report = JSON.parse(fs.readFileSync(new URL(
    '../research/notes/2026-11-09-ckt-v51-toned-2121-factorization-search.json', import.meta.url), 'utf8'));
  for (const factorization of report.factorizations) {
    assert.equal(factorization.strictBounds.combinedStrictCollisionExcessLowerBound, 796);
    assert.equal(factorization.strictBounds.occupiedBucketUpperBound, 441);
    assert.equal(factorization.heuristicSearch.champion.occupiedBuckets, 441);
    assert.equal(factorization.heuristicSearch.champion.collisionExcess, 796);
  }
});
