'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const frontier = require('./frontier_toned_2126.js');
const experiment = require('./explore_toned_2126.js');
const {prepare} = require('./fast_toned_2126.js');

const input = process.argv[2] || 'research/notes/2026-11-12-toned-2126-round2.json';
const source = JSON.parse(fs.readFileSync(input, 'utf8'));
const sample = Number(process.argv[3] || 500);
const context = frontier.loadContext(source, 'D:/C2D/Documents/rime-snow-pinyin', sample);
const fast = prepare(source.tokenKeys, context);
const layouts = source.results.slice(0, sample ? 1 : 2).map(row => row.layout);
const policies = sample ? experiment.auxiliaryPolicies() : [experiment.POLICY,
  {word2: '21', word3: '32', word4: '41'}];
let count = 0, maximumDifference = 0;
for (const layout of layouts) for (const policy of policies) {
  const expected = experiment.evaluate(layout, source.tokenKeys, context, policy);
  const actual = fast(layout, policy);
  for (const kind of Object.keys(expected.tracks)) for (const field of Object.keys(expected.tracks[kind])) {
    const delta = Math.abs(expected.tracks[kind][field] - actual.tracks[kind][field]);
    assert.ok(delta < 1e-8, `${kind}/${field}: ${delta}`);
    maximumDifference = Math.max(maximumDifference, delta);
  }
  assert.ok(Math.abs(expected.score - actual.score) < 1e-10);
  count++;
}
console.log(JSON.stringify({input, sampleRowsPerTrack: sample || null, layoutPolicyPairs: count,
  maximumTrackDifference: maximumDifference, passed: true}));
