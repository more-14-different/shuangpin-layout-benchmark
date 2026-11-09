import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {
  CORE_KEYS_BY_TONE,
  enumerateFreeKeyAssignments,
  movedCoreKeyCount,
  partitionFromAssignment,
  toneIndex,
} = require('../tools/search_toned_2121_pindu11_four_regions.js');

test('upstream-core projection exhausts all 4^4 assignments of Q/Z/X/C', () => {
  const assignments = enumerateFreeKeyAssignments();
  assert.equal(assignments.length, 256);
  assert.equal(new Set(assignments.map(value => JSON.stringify(value))).size, 256);
  for (const assignment of assignments) {
    const partition = partitionFromAssignment(assignment);
    const keys = Object.values(partition.keysByTone).join('');
    assert.equal(keys.length, 21);
    assert.equal(new Set(keys).size, 21);
    for (const tone of [1, 2, 3, 4]) {
      for (const key of CORE_KEYS_BY_TONE[tone]) {
        assert.ok(partition.keysByTone[tone].includes(key));
      }
    }
    assert.equal(movedCoreKeyCount(partition), 0);
  }
});

test('neutral tone shares the tone-one region', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(toneIndex), [0, 1, 2, 3, 0]);
});

test('tracked tone-region champions preserve full CKT scores and memory audits', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const data = JSON.parse(fs.readFileSync(path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-tone-region-variant-champions.json')));
  assert.equal(data.experiments.alternative786.score, 9.71140666004742);
  assert.equal(data.experiments.alternative786.layout.memoryAudit.lowerM, 30);
  assert.equal(data.experiments.upstreamCoreFourRegion.score, 9.725297072515657);
  assert.equal(data.experiments.upstreamCoreFourRegion.layout.memoryAudit.lowerMWithRegion, 44);
  assert.equal(data.experiments.relaxedFourRegion.score, 9.575437766589728);
  assert.equal(data.experiments.relaxedFourRegion.layout.memoryAudit.movedCoreKeys, 13);
  assert.equal(data.experiments.relaxedFourRegion.layout.memoryAudit.lowerMWithRegion, 57);
});
