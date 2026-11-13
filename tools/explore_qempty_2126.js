'use strict';
// Fixed Q vacancy: exactly nine top keys, nine home keys, seven bottom keys.
const fs = require('node:fs');
const {neighbors, layoutFactory, loadContext} = require('./frontier_toned_2126.js');
const {prepare} = require('./fast_toned_2126.js');
const experiment = require('./explore_toned_2126.js');

function valid(maps) {
  return maps.length === 3 && maps.every((row, r) => row.length === 10 &&
    row.every(k => Number.isInteger(k) && k >= (r === 0 ? 1 : 0) && k < experiment.ROWS[r].length) &&
    new Set(row).size === [9, 9, 7][r]);
}
function constrainedNeighbors(maps) {
  return neighbors(maps, false).filter(n => valid(n.maps));
}
function seeds(maps) {
  const result = [];
  for (let key = 1; key < 10; key++) {
    const next = maps.map(row => [...row]);
    next[0] = next[0].map(k => k === 0 ? key : k);
    if (valid(next)) result.push(next);
  }
  return [...new Map(result.map(m => [JSON.stringify(m), m])).values()];
}
function main() {
  const [mode, output] = process.argv.slice(2);
  if (!['keep', 'swap'].includes(mode) || !output) throw new Error('usage: keep|swap output.json');
  const paths = ['2026-11-13-toned-2126-alternative-policy-full.json',
    '2026-11-13-toned-2126-policy-full.json', '2026-11-13-toned-2126-vacancy-full.json'];
  const inputs = paths.map(p => JSON.parse(fs.readFileSync('research/notes/' + p)));
  const source = inputs[0];
  const toneRowsByTone = mode === 'keep' ? {1: 2, 2: 0, 3: 0, 4: 1, 5: 2} : {1: 2, 2: 1, 3: 1, 4: 0, 5: 2};
  const make = layoutFactory({...source, results: [{layout: {...source.results[0].layout, toneRowsByTone}}]});
  const report = {version: 'qempty-2126-1', mode, sources: source.sources, inputs: paths,
    baseline: source.baseline, tokenKeys: source.tokenKeys, contract: {...source.contract,
      tonesByRow: [0, 1, 2].map(r => [1, 2, 3, 4, 5].filter(t => toneRowsByTone[t] === r)),
      toneRowsByTone, unusedSecondKeys: 'Q', requiredRowKeyCounts: [9, 9, 7]},
    sampleRowsPerTrack: 1500, sampleStarts: 2, sampleHistory: [], fullHistory: [],
    evaluations: [], policyAudits: [], results: [], complete: false};
  const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  const initial = [...new Map(inputs.flatMap(d => seeds(d.results[0].layout.regionMaps))
    .map(m => [JSON.stringify(m), m])).values()];
  const policy = {word2: '21', word3: '12', word4: '24'};
  const sample = prepare(source.tokenKeys, loadContext(source, 'D:/C2D/Documents/rime-snow-pinyin', 1500));
  const sampled = new Map();
  function scoreSample(maps) {
    const key = JSON.stringify(maps);
    if (!sampled.has(key)) sampled.set(key, {layout: make(maps), ...sample(make(maps), policy)});
    return sampled.get(key);
  }
  function descend(current, evaluate, history, checkpoint) {
    history.push({score: current.score, regionMaps: current.layout.regionMaps, policy: current.policy});
    for (;;) {
      let best = current;
      const options = constrainedNeighbors(current.layout.regionMaps);
      for (const {maps} of options) {
        const candidate = evaluate(maps);
        if (candidate.score < best.score - 1e-10) best = candidate;
      }
      if (best === current) return {current, neighborCount: options.length};
      current = best;
      history.push({score: current.score, regionMaps: current.layout.regionMaps, policy: current.policy});
      console.log(mode, 'improved', current.score);
      checkpoint();
    }
  }
  const starts = initial.map(scoreSample).sort((a, b) => a.score - b.score).slice(0, 2);
  const sampledWinners = starts.map(start => descend(start, scoreSample, report.sampleHistory, save).current);
  report.sampleEvaluations = sampled.size;
  report.initialSeedCount = initial.length;
  console.log(mode, 'sample complete', sampled.size);
  const context = loadContext(source, 'D:/C2D/Documents/rime-snow-pinyin');
  const full = prepare(source.tokenKeys, context);
  let activePolicy = policy;
  const cache = new Map();
  function scoreFull(maps) {
    if (!valid(maps)) throw new Error('Q vacancy or coverage violation');
    const key = JSON.stringify([maps, activePolicy]);
    if (!cache.has(key)) {
      const layout = make(maps), value = full(layout, activePolicy);
      cache.set(key, {layout, ...value});
      report.evaluations.push({...value, regionMaps: maps});
      if (cache.size % 25 === 0) {console.log(mode, 'full evaluated', cache.size); save();}
    }
    return cache.get(key);
  }
  let current = [...initial, ...sampledWinners.map(r => r.layout.regionMaps)].map(scoreFull)
    .sort((a, b) => a.score - b.score)[0];
  const oracle = experiment.evaluate(current.layout, source.tokenKeys, context, activePolicy);
  for (const kind of Object.keys(oracle.tracks)) for (const field of Object.keys(oracle.tracks[kind])) {
    if (Math.abs(oracle.tracks[kind][field] - current.tracks[kind][field]) > 1e-8) throw new Error('oracle mismatch');
  }
  report.oracleParity = {scoreDifference: current.score - oracle.score, trackTolerance: 1e-8};
  for (;;) {
    const descent = descend(current, scoreFull, report.fullHistory, save);
    current = descent.current;
    report.results = [current];
    const policies = experiment.auxiliaryPolicies().map(p => full(current.layout, p)).sort((a, b) => a.score - b.score);
    report.policyAudits.push({regionMaps: current.layout.regionMaps, evaluations: policies});
    save();
    if (policies[0].score >= current.score - 1e-10) {
      report.localOptimality = {neighborCount: descent.neighborCount, corpus: 'full',
        scope: 'single rhyme reassignment and pair swap; Q empty; exact 9/9/7; all 144 auxiliary policies'};
      break;
    }
    activePolicy = policies[0].policy;
    current = scoreFull(current.layout.regionMaps);
  }
  report.contract.policy = current.policy;
  report.buckets = Object.fromEntries(['QZ', 'ZQ'].map(code => [code,
    source.tokenKeys.filter((t, i) => current.layout.tonedCodes[i] === code)]));
  report.complete = true; save();
  console.log(JSON.stringify({mode, score: current.score, policy: current.policy, buckets: report.buckets}));
}
if (require.main === module) main();
module.exports = {valid, constrainedNeighbors, seeds};
