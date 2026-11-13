'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {valid, constrainedNeighbors} = require('./explore_qempty_2126.js');
const {layoutFactory, loadContext} = require('./frontier_toned_2126.js');
const experiment = require('./explore_toned_2126.js');

const input = process.argv[2];
if (!input) throw new Error('input report required');
const d = JSON.parse(fs.readFileSync(input));
assert.equal(d.complete, true);
const best = d.results[0];
const build = layoutFactory(d);
const signature = (maps, policy) => JSON.stringify([maps, policy]);
const cache = new Map(d.evaluations.map(e => [signature(e.regionMaps, e.policy), e]));
for (const e of d.evaluations) assert.ok(valid(e.regionMaps));
assert.deepEqual(build(best.layout.regionMaps).tonedCodes, best.layout.tonedCodes);
assert.ok(best.layout.tonedCodes.every(code => code[1] !== 'Q'));
const options = constrainedNeighbors(best.layout.regionMaps);
assert.equal(options.length, d.localOptimality.neighborCount);
for (const n of options) {
  const e = cache.get(signature(n.maps, best.policy));
  assert.ok(e, 'missing final neighbor');
  assert.ok(e.score >= best.score - 1e-10);
}
const audit = d.policyAudits.at(-1);
assert.deepEqual(audit.regionMaps, best.layout.regionMaps);
assert.equal(new Set(audit.evaluations.map(e => JSON.stringify(e.policy))).size, 144);
assert.ok(audit.evaluations.every(e => e.score >= best.score - 1e-10));
const context = loadContext(d, 'D:/C2D/Documents/rime-snow-pinyin');
const oracle = experiment.evaluate(best.layout, d.tokenKeys, context, best.policy);
assert.ok(Math.abs(oracle.score - best.score) < 1e-10);
for (const kind of Object.keys(oracle.tracks)) for (const field of Object.keys(oracle.tracks[kind])) {
  assert.ok(Math.abs(oracle.tracks[kind][field] - best.tracks[kind][field]) < 1e-8);
}
for (const code of ['QZ', 'ZQ']) assert.deepEqual(d.buckets[code],
  d.tokenKeys.filter((t, i) => best.layout.tonedCodes[i] === code));
console.log(JSON.stringify({input, score: best.score, policy: best.policy, buckets: d.buckets,
  evaluations: d.evaluations.length, finalNeighbors: options.length, fullPolicies: 144,
  oracleScoreDifference: best.score - oracle.score, passed: true}));
