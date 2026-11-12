import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {buckets} = require('../tools/benchmark_toned_representatives.js');
const {shapeKeysFromToneKeys, toneKeysFromShapeKeys} = require('../tools/auxiliary_semantics.js');

test('bucket audit distinguishes QZ and ZQ and counts common inventory separately', () => {
  const tokens = Array.from({length:1407}, (_,i) => `token${i}`);
  const codes = tokens.map(() => 'QQ');
  codes[0] = 'QZ'; codes[1] = 'ZQ';
  const result = buckets(tokens, codes, new Set(tokens.slice(1)));
  assert.equal(result.occupied, 3);
  assert.equal(result.emptyCount, 438);
  assert.equal(result.occupiedCommon1237, 2);
  assert.deepEqual(result.qzSyllables, ['token0']);
  assert.deepEqual(result.zqSyllables, ['token1']);
  assert.equal(result.maxSyllablesPerBucket, 1405);
  assert.throws(() => buckets(tokens.slice(1), codes, new Set()), /inventory mismatch/);
});

test('research and production comparison use the same shape/tone semantic roundtrip', () => {
  assert.equal(toneKeysFromShapeKeys('AVUIO'), 'IVUAO');
  assert.equal(shapeKeysFromToneKeys('IVUAO'), 'AVUIO');
});
