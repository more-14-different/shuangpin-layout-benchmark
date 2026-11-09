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
const {remapAuxiliaryKeys} = require('../tools/optimize_toned_2121_aux_order.js');
const {
  explicitMemoryAudit,
  guardRecord,
} = require('../tools/search_toned_2121_constrained_ckt.js');

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

test('auxiliary-order refinement renames only the frozen QAOPL auxiliary domain', () => {
  assert.equal(remapAuxiliaryKeys('WZQAOPL', 'QOLAP'), 'WZQOLAP');
  assert.equal(remapAuxiliaryKeys('WSDF', 'QOLAP'), 'WSDF');
});

test('seed-relative MDV guard accumulates without claiming an exact new M', () => {
  const seed = {id: 'M12', declaredMemory: {M: 12}};
  assert.deepEqual(guardRecord(seed, 1, 0), {
    seedM: 12,
    deltaD: 1,
    deltaV: 0,
    MGuard: 13,
    definition: 'conservative seed-relative guard: MGuard = seedM + deltaD + deltaV',
  });
  const child = {id: 'D1', guard: guardRecord(seed, 1, 0)};
  assert.deepEqual(guardRecord(child, 1, 1), {
    seedM: 12,
    deltaD: 2,
    deltaV: 1,
    MGuard: 15,
    definition: 'conservative seed-relative guard: MGuard = seedM + deltaD + deltaV',
  });
});

test('explicit additive memory audit counts two shengjie moves and one rhyme move as M15', () => {
  const base = {inheritedSeedMemory: {
    M: 12,
    globalMigrations: 4,
    shengjieExceptions: 4,
    rhymeFamilyDeviations: 2,
    uniformRules: 2,
  }};
  assert.deepEqual(explicitMemoryAudit(base, [
    {kind: 'first-family', family: 'f'},
    {kind: 'first-family', family: 'gu'},
    {kind: 'second-family-shift', family: 'ou'},
  ]), {
    globalMigrations: 4,
    shengjieExceptions: 6,
    rhymeFamilyDeviations: 3,
    uniformRules: 2,
    status: 'exact count for this explicit additive encoding; not a proof of globally minimal M',
    M: 15,
  });
});

test('constrained champion is selected by CKT while bucket occupancy remains diagnostic', () => {
  const result = JSON.parse(fs.readFileSync(new URL(
    '../research/notes/2026-11-09-ckt-v51-toned-2121-constrained-champion-ckt.json', import.meta.url), 'utf8'));
  const champion = result.results[0];
  assert.equal(champion.id,
    'HIST-qaopl_nasal_minimal-D1-f-K-D1-gu-E-V1-ou-5');
  assert.equal(champion.shapeKeysByMeaning, 'QOLAP');
  assert.equal(champion.toneKeysByTone, 'AOLQP');
  assert.deepEqual(champion.policy, {word2: '21', word3: '213', word4: '24'});
  assert.ok(champion.score < 9.62);
  const search = JSON.parse(fs.readFileSync(new URL(
    '../research/notes/2026-11-09-ckt-v51-toned-2121-constrained-round3-search.json', import.meta.url), 'utf8'));
  assert.equal(search.objective,
    'minimize shape-only CKT v5.1; occupied buckets are audit-only');
  assert.equal(search.finalists[0].occupiedBucketsAuditOnly, 428);
  assert.equal(search.finalists[0].guard.MGuard, 15);
});
