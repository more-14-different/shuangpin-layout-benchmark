import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {
  SHAPE_SYMBOLS_BY_MEANING,
  TONE_DIGITS_BY_SHAPE_MEANING,
  auxiliarySemantics,
  reservedKeyClassFromEntry,
  shapeKeysFromToneKeys,
  toneKeysFromShapeKeys,
} = require('../tools/auxiliary_semantics.js');
const {loadPayload} = require('../tools/score_completion_ckt_v4.js');

const html = new URL('../a7_CKT_R11.html', import.meta.url);

test('standard AEUIO and AVUIO mappings retain the 42310 semantic pairing', () => {
  assert.equal(SHAPE_SYMBOLS_BY_MEANING, 'AEUIO');
  assert.equal(TONE_DIGITS_BY_SHAPE_MEANING, '42310');
  assert.deepEqual(auxiliarySemantics('IEUAO'), {
    toneKeyClass: 'AEUIO',
    toneKeySet: 'AEIOU',
    shapeKeysByMeaning: 'AEUIO',
    toneKeysByTone: 'IEUAO',
    toneDigitsByShapeMeaning: '42310',
  });
  assert.deepEqual(auxiliarySemantics('IVUAO'), {
    toneKeyClass: 'AVUIO',
    toneKeySet: 'AIOUV',
    shapeKeysByMeaning: 'AVUIO',
    toneKeysByTone: 'IVUAO',
    toneDigitsByShapeMeaning: '42310',
  });
});

test('shape and tone mappings are lossless in both directions', () => {
  for (const toneKeys of ['IEUAO', 'AEUIO', 'UOEIA', 'IVUAO', 'AVUIO', 'UAOIV']) {
    const shapeKeys = shapeKeysFromToneKeys(toneKeys);
    assert.equal(toneKeysFromShapeKeys(shapeKeys), toneKeys);
    assert.equal(auxiliarySemantics(toneKeys).toneDigitsByShapeMeaning, '42310');
  }
});

test('auxiliaryClass and scheme-id suffixes are set labels, not ordered mappings', () => {
  const payload = loadPayload(html);
  for (const entry of payload.entries) {
    assert.equal(auxiliarySemantics(entry.tone).toneDigitsByShapeMeaning, '42310', entry.id);
    const expectedClass = reservedKeyClassFromEntry(entry);
    if (expectedClass !== 'ANY5') {
      assert.equal(entry.auxiliaryClass, expectedClass, entry.id);
    }
  }

  const byId = id => payload.entries.find(entry => entry.id === id);
  const production = byId('SNOW-SHENYUN-21X26-PRODUCTION');
  assert.equal(production.auxiliaryClass, 'AEUIO');
  assert.equal(production.tone, 'IEUAO');
  assert.equal(shapeKeysFromToneKeys(production.tone), 'AEUIO');

  const balanced = byId('SNOW-SHENYUN-21X26-D3V1-BALANCED');
  assert.equal(balanced.auxiliaryClass, 'AEUIO');
  assert.equal(balanced.tone, 'IEUAO');
  assert.equal(shapeKeysFromToneKeys(balanced.tone), 'AEUIO');
  assert.equal(balanced.productionCandidateMetrics.replayedCktV51, 9.104619328754065);
  assert.equal(balanced.productionCandidateMetrics.maxFingerAudit.track, 'C2');
  assert.equal(balanced.productionCandidateMetrics.maxFingerAudit.finger, '右食指');
  assert.ok(Math.abs(
    balanced.productionCandidateMetrics.maxFingerAudit.load - 0.34438623462871315,
  ) < 1e-15);
  assert.equal(Object.keys(balanced.bPathMetricsNative).length, 8);
  for (const block of ['completionB', 'completionBFixed', 'completionBV2', 'completionBV3', 'completionBV4']) {
    assert.ok(payload[block].schemes[balanced.id], `${block} missing balanced flagship`);
  }

  const u357 = byId('gen0107-p5-f1h-11_13-d2-f25_26-d3-f4_22-d4-f11_13');
  assert.equal(Object.keys(u357.bPathMetricsNative).length, 8);
  for (const block of ['completionB', 'completionBFixed', 'completionBV2', 'completionBV3', 'completionBV4']) {
    assert.ok(payload[block].schemes[u357.id], `${block} missing U357`);
  }

  const historical = byId('TG6-21X26-AEUIO-M32');
  assert.equal(historical.auxiliaryClass, 'AEUIO');
  assert.equal(historical.tone, 'AEUIO');
  assert.equal(shapeKeysFromToneKeys(historical.tone), 'IEUAO');
});
