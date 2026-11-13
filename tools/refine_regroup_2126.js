'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {makeLayout, verify} = require('./regroup_2126');
const {neighbors, loadContext} = require('./frontier_toned_2126');
const {constrainedNeighbors} = require('./explore_qempty_2126');
const {prepare} = require('./fast_toned_2126');
const experiment = require('./explore_toned_2126');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('input output required');
const source = JSON.parse(fs.readFileSync(input));
assert.equal(source.complete, true);
const best = source.results[0], seed = best.layout;
const context = loadContext(source, 'D:/C2D/Documents/rime-snow-pinyin');
const fast = prepare(source.tokenKeys, context);
const qempty = !seed.tonedCodes.some(c => c[1] === 'Q');
const options = qempty ? constrainedNeighbors(seed.regionMaps) : neighbors(seed.regionMaps);
const report = {version: '2126-regroup-key-neighborhood-1', input, sources: source.sources,
  tokenKeys: source.tokenKeys, baseline: source.baseline, contract: source.contract,
  anchorScore: best.score, neighborCount: options.length, evaluations: [], results: [], complete: false,
  scope: 'one exhaustive full-corpus single-group reassignment and pair-swap pass; grouping and auxiliary policy fixed'};
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
for (const maps of [seed.regionMaps, ...options.map(n => n.maps)]) {
  const variant = {...source, results: [{layout: {...seed, regionMaps: maps}}]};
  const layout = makeLayout(variant, seed.regroup.er, seed.regroup.v);
  verify(variant, layout);
  const value = {...fast(layout, best.policy), regionMaps: maps};
  report.evaluations.push(value);
  if (!report.results.length || value.score < report.results[0].score) report.results = [{...value, layout}];
  if (report.evaluations.length % 20 === 0) {save(); console.log(output, report.evaluations.length, report.results[0].score);}
}
assert.ok(Math.abs(report.evaluations[0].score - best.score) < 1e-10);
const final = report.results[0];
const oracle = experiment.evaluate(final.layout, source.tokenKeys, context, best.policy);
assert.ok(Math.abs(oracle.score - final.score) < 1e-10);
for (const kind of Object.keys(oracle.tracks)) for (const field of Object.keys(oracle.tracks[kind])) {
  assert.ok(Math.abs(oracle.tracks[kind][field] - final.tracks[kind][field]) < 1e-8);
}
report.oracleScoreDifference = final.score - oracle.score;
report.noImprovingNeighbor = final.score >= best.score - 1e-10;
report.buckets = Object.fromEntries(['QZ', 'ZQ'].map(code => [code, source.tokenKeys.filter((t, i) => final.layout.tonedCodes[i] === code)]));
report.complete = true; save();
console.log(JSON.stringify({output, score: final.score, noImprovingNeighbor: report.noImprovingNeighbor}));
