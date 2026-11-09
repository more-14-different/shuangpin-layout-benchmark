import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import written from '../tools/search_toned_2121_written_lowm.js';

const reportUrl = new URL(
  '../research/notes/2026-11-09-ckt-v51-toned-2121-written-lowm-search.json',
  import.meta.url);
const layoutsUrl = new URL(
  '../research/config/ckt-v51-toned-2121-written-lowm-finalists.json',
  import.meta.url);

test('written low-memory base grammar assigns all 35 finals to seven groups', () => {
  assert.equal(Object.keys(written.BASE_FINAL_GROUPS).length, 35);
  assert.deepEqual([...new Set(Object.values(written.BASE_FINAL_GROUPS))].sort(),
    [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(written.BASE_FINAL_RULES.length, 7);
  assert.equal(written.LITERAL_INITIALS.length, 15);
  assert.equal(written.SPECIAL_INITIALS.length, 6);
  assert.equal(written.ZERO_INITIALS.length, 6);
});

test('written split search reports vector memory and both flying levels explicitly', () => {
  const report = JSON.parse(fs.readFileSync(reportUrl, 'utf8'));
  assert.deepEqual(report.componentCounts, {
    first: 27,
    second: 35,
    rawProduct: 945,
    legalCommonPinyin: 399,
  });
  assert.equal(report.memoryDefinition.reporting, 'vector, not a single M');
  assert.equal(report.constraints.atomicWrittenInitialFlyingAllowed, false);
  assert.equal(report.constraints.ordinaryInitialFlyingAllowed, false);
  for (const candidate of report.finalists) {
    assert.deepEqual(candidate.flyingAudit.writtenInitialFlying, []);
    assert.deepEqual(candidate.flyingAudit.tonedWrittenFinalFlying, []);
    assert.equal(candidate.flyingAudit.ordinaryLiteralInitialsFixed, true);
    assert.equal(candidate.memory.rawAssociationEntries.total, 62);
  }
});

test('written finalists preserve explicit auxiliary semantics and fixed policy', () => {
  const bundle = JSON.parse(fs.readFileSync(layoutsUrl, 'utf8'));
  assert.ok(bundle.layouts.length > 0);
  for (const layout of bundle.layouts) {
    assert.equal(layout.recommendedShapeKeysByMeaning, 'QOLAP');
    assert.equal(layout.recommendedToneKeysByTone, 'AOLQP');
    assert.deepEqual(layout.recommendedPolicy, {word2: '21', word3: '213', word4: '23'});
    assert.deepEqual(layout.flyingAudit.writtenInitialFlying, []);
    assert.deepEqual(layout.flyingAudit.tonedWrittenFinalFlying, []);
  }
});
