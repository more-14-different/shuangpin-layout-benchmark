import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import pindu from '../tools/audit_pindu_nextgen_image.js';

const seeds = JSON.parse(fs.readFileSync(new URL(
  '../research/config/ckt-v51-toned-2121-seeds.json', import.meta.url), 'utf8'));
const report = pindu.buildReport(seeds);

test('Pindu image transcription closes all 55 first components under ten exceptions', () => {
  assert.equal(report.first.rawShengjieCount, 55);
  assert.equal(report.first.visibleExceptionCount, 10);
  assert.equal(Object.keys(report.first.shengjieToKey).length, 55);
  assert.deepEqual(report.first.visibleExceptions, {
    ni: 'W', su: 'W', gu: 'E', jv: 'E', mi: 'E',
    du: 'Y', bi: 'A', hu: 'A', zu: 'F', li: 'G',
  });
  assert.equal(report.first.shengjieToKey.zh, 'Z');
  assert.equal(report.first.shengjieToKey.chu, 'C');
  assert.equal(report.first.shengjieToKey.shu, 'S');
  assert.equal(report.first.shengjieToKey._v, 'V');
});

test('public Pindu rhyme merges reduce 16 bodies to the image eleven', () => {
  assert.equal(report.second.rawRhymeBodyCount, 16);
  assert.equal(report.second.normalizedRhymeCount, 11);
  assert.deepEqual(report.second.rhymeNormalization._, ['_', 'er']);
  assert.deepEqual(report.second.rhymeNormalization.en, ['en', 'eng', 'n', 'ng']);
  assert.deepEqual(report.second.rhymeNormalization.e, ['e', 'o']);
  assert.equal(report.second.normalizedRhymeToneAssociationCount, 44);
  assert.equal(report.second.occupiedSecondKeyChunkCount, 22);
  assert.equal(report.second.toneRegionsDisjoint, true);
});

test('image rhyme-tone table assigns every normalized rhyme once per tone', () => {
  for (const tone of [1, 2, 3, 4]) {
    assert.deepEqual(Object.keys(pindu.IMAGE_RHYME_TONE_KEYS[tone]).sort(),
      [...pindu.RHYME_ORDER].sort());
  }
  assert.equal(pindu.imageSecondKey('er', 1), 'J');
  assert.equal(pindu.imageSecondKey('ng', 4), 'I');
  assert.equal(pindu.imageSecondKey('o', 2), 'P');
  assert.equal(pindu.imageSecondKey('a', 5), 'W');
});

test('old 45-element count reproduces but cannot explain image memory 36.1221', () => {
  assert.deepEqual(report.memoryAudit.oldPublicPindu, {
    visibleFirstExceptions: 12,
    perRhymeDistinctToneKeyAssociations: 33,
    total: 45,
    matchesPublished45: true,
  });
  assert.equal(report.memoryAudit.imageUnderOldCountingRule.total, 54);
  assert.equal(report.memoryAudit.imageChunkLowerDescription.baseChunks, 32);
  assert.ok(Math.abs(report.memoryAudit.imageChunkLowerDescription.residualToReportedMemory -
    4.1221) < 1e-10);
});

test('inferred image rules cover all audited toned tokens without missing mappings', () => {
  assert.equal(report.tokenAudits.commonCharacterToned.missing.length, 0);
  assert.equal(report.tokenAudits.extendedLayoutToned.missing.length, 0);
});
