'use strict';
const fs = require('node:fs');
const {loadContext, layoutFactory} = require('./frontier_toned_2126.js');
const {prepare} = require('./fast_toned_2126.js');
const {POLICY} = require('./explore_toned_2126.js');

function main() {
  const [output, ...inputs] = process.argv.slice(2);
  if (!output || !inputs.length) throw new Error('output and shard files required');
  const shards = inputs.map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
  if (shards.some(shard => !shard.complete)) throw new Error('incomplete shard');
  const candidates = shards.flatMap(shard => shard.results);
  if (new Set(candidates.map(row => row.assignmentIndex)).size !== 36 || candidates.length !== 36) throw new Error('expected all 36 assignments');
  const source = shards[0];
  if (shards.some(shard => JSON.stringify(shard.sources) !== JSON.stringify(source.sources))) throw new Error('source mismatch');
  const context = loadContext(source, 'D:/C2D/Documents/rime-snow-pinyin');
  const fast = prepare(source.tokenKeys, context);
  const report = {...source, version: 'toned-2126-joint-tone-full-verification-1',
    contract: {...source.contract, tonesByRow: undefined, toneAssignmentSource: 'layout.toneRowsByTone',
      neutralTonePolicy: 'explicit row in layout.toneRowsByTone[5]'},
    inputs, sampleRowsPerTrack: null, shard: undefined, shards: undefined,
    reference: context.reference.tracks, evaluations: [], results: [], complete: false,
    scope: '36 independently optimized sampled lexical-tone assignments x 3 neutral rows, full corpus; fixed deployed auxiliary policy'};
  const results = [];
  for (const row of candidates) for (let neutralRow = 0; neutralRow < 3; neutralRow++) {
    const toneRowsByTone = {...row.layout.toneRowsByTone, 5: neutralRow};
    const variant = {...source, results: [{layout: {...row.layout, toneRowsByTone}}]};
    const layout = layoutFactory(variant)(row.layout.regionMaps);
    layout.id += '-tones' + [1, 2, 3, 4, 5].map(t => toneRowsByTone[t]).join('');
    const evaluation = fast(layout, POLICY);
    results.push({layout, ...evaluation});
    report.evaluations.push({...evaluation, regionMaps: layout.regionMaps, toneRowsByTone,
      assignmentIndex: row.assignmentIndex, sampleScoreWithNeutralFollowingTone1: row.score});
    if (results.length % 6 === 0) {
      console.log(`full joint verification ${results.length}/108, best ${Math.min(...results.map(row => row.score))}`);
      fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    }
  }
  results.sort((a, b) => a.score - b.score);
  report.evaluations.sort((a, b) => a.score - b.score);
  report.results = results.slice(0, 8);
  report.complete = true;
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(results.slice(0, 8).map(row => ({id: row.id, score: row.score,
    toneRowsByTone: row.layout.toneRowsByTone}))));
}
if (require.main === module) main();
