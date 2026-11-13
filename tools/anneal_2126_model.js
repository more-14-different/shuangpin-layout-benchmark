'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {ROWS, auxiliaryPolicies} = require('./explore_toned_2126');
const policies = auxiliaryPolicies();
function validate(bundle, route, state) {
  const seed = bundle.seeds[route];
  assert.ok(seed, 'unknown route');
  assert.equal(state.partition.length, bundle.rootNames.length);
  assert.ok(state.partition.every(x => Number.isInteger(x) && x >= 0 && x < 10));
  assert.equal(new Set(state.partition).size, 10, 'empty rhyme group');
  assert.equal(state.maps.length, 3);
  state.maps.forEach((row, r) => {
    assert.equal(row.length, 10);
    assert.ok(row.every(k => Number.isInteger(k) && k >= 0 && k < ROWS[r].length));
    assert.equal(new Set(row).size, seed.rowCounts[r]);
    if (seed.qEmpty && r === 0) assert.ok(!row.includes(0));
  });
  assert.ok(Number.isInteger(state.policy) && state.policy >= 0 && state.policy < policies.length);
}
function layout(bundle, route, state) {
  validate(bundle, route, state);
  const seed = bundle.seeds[route];
  const tonedCodes = bundle.tokens.map(t => t.first + ROWS[seed.toneRowsByTone[t.tone]][state.maps[seed.toneRowsByTone[t.tone]][state.partition[t.root]]]);
  const counts = ROWS.map(keys => new Set(tonedCodes.map(c => c[1]).filter(k => keys.includes(k))).size);
  assert.deepEqual(counts, seed.rowCounts, 'actual legal-token coverage changed');
  const finalGroups = Object.fromEntries(Object.entries(bundle.finalRoots).map(([f,r]) => [f,state.partition[r]]));
  return {id: 'T2126-SA-' + crypto.createHash('sha256').update(JSON.stringify([tonedCodes, state.policy])).digest('hex').slice(0,16),
    tonedCodes, regionMaps: state.maps, finalGroups, shapeKeysByMeaning: 'AEUIO', toneRowsByTone: seed.toneRowsByTone};
}
module.exports = {validate, layout, policies};
