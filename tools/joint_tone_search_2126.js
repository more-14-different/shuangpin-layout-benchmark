'use strict';
const fs = require('node:fs');
const {loadContext, layoutFactory, neighbors} = require('./frontier_toned_2126.js');
const {assignments} = require('./probe_tone_regions_2126.js');
const {prepare} = require('./fast_toned_2126.js');
const {POLICY, ROWS} = require('./explore_toned_2126.js');

function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  if (!args.from || !args.output) throw new Error('--from and --output required');
  const source = JSON.parse(fs.readFileSync(args.from, 'utf8'));
  const shard = Number(args.shard || 0), shards = Number(args.shards || 1);
  const steps = Number(args.steps || 400), sample = Number(args.sample || 1500);
  const context = loadContext(source, 'D:/C2D/Documents/rime-snow-pinyin', sample);
  const fast = prepare(source.tokenKeys, context);
  const report = {version: 'toned-2126-joint-tone-search-1', sources: source.sources,
    baseline: source.baseline, contract: {...source.contract, tonesByRow: undefined,
      toneAssignmentSource: 'layout.toneRowsByTone', neutralTonePolicy: 'follow-tone1'}, tokenKeys: source.tokenKeys,
    input: args.from, shard, shards, sampleRowsPerTrack: sample, randomStepsPerStart: steps,
    startsPerAssignment: 2, complete: false, results: []};
  const save = () => fs.writeFileSync(args.output, JSON.stringify(report, null, 2) + '\n');
  for (const [index, toneRowsByTone] of assignments().entries()) {
    if (index % shards !== shard) continue;
    let state = 2130 + index;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const seedSource = {...source, results: [{layout: {...source.results[0].layout, toneRowsByTone}}]};
    const build = layoutFactory(seedSource);
    const cache = new Map();
    function evaluate(maps) {
      const signature = JSON.stringify(maps);
      if (!cache.has(signature)) {
        const layout = build(maps);
        layout.id += '-tones' + [1, 2, 3, 4].map(t => toneRowsByTone[t]).join('');
        cache.set(signature, {layout, ...fast(layout, POLICY)});
      }
      return cache.get(signature);
    }
    const startResults = [];
    for (let start = 0; start < 2; start++) {
      const maps = start === 0 ? source.results[0].layout.regionMaps.map(row => [...row]) :
        ROWS.map(keys => {
          const map = Array.from({length: 10}, (_, i) => i % keys.length);
          for (let i = map.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1)); [map[i], map[j]] = [map[j], map[i]];
          }
          return map;
        });
      let current = evaluate(maps);
      for (let step = 0; step < steps; step++) {
        const next = current.layout.regionMaps.map(row => [...row]);
        const r = Math.floor(random() * 3), a = Math.floor(random() * 10), b = Math.floor(random() * 10);
        if (step % 2) [next[r][a], next[r][b]] = [next[r][b], next[r][a]];
        else next[r][a] = Math.floor(random() * ROWS[r].length);
        if (next.some((row, r) => new Set(row).size !== ROWS[r].length)) continue;
        const candidate = evaluate(next);
        if (candidate.score < current.score - 1e-10) current = candidate;
      }
      startResults.push(current);
    }
    let current = startResults.sort((a, b) => a.score - b.score)[0];
    let passes = 0;
    for (;;) {
      let best = current;
      for (const neighbor of neighbors(current.layout.regionMaps)) {
        const candidate = evaluate(neighbor.maps);
        if (candidate.score < best.score - 1e-10) best = candidate;
      }
      if (best === current) break;
      current = best; passes++;
    }
    report.results.push({...current, assignmentIndex: index, toneRowsByTone,
      evaluated: cache.size, exhaustiveDescentPasses: passes,
      localOptimality: 'sample-only single-rhyme reassignment and pair swap; all 26 keys occupied'});
    report.results.sort((a, b) => a.score - b.score);
    console.log(`shard ${shard}: assignment ${index} tones ${[1, 2, 3, 4].map(t => toneRowsByTone[t]).join('')}, score ${current.score}, evaluated ${cache.size}`);
    save();
  }
  report.complete = true; save();
}
if (require.main === module) main();
