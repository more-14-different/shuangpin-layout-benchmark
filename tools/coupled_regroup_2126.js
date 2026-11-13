'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {makeLayout, verify} = require('./regroup_2126');
const {loadContext} = require('./frontier_toned_2126');
const {prepare} = require('./fast_toned_2126');
const experiment = require('./explore_toned_2126');

function variant(source, swap) {
  const seed = source.results[0].layout;
  const maps = seed.regionMaps.map(row => [...row]);
  const row = seed.toneRowsByTone[2];
  assert.equal(row, seed.toneRowsByTone[3]);
  if (swap) [maps[row][1], maps[row][9]] = [maps[row][9], maps[row][1]];
  return {...source, results: [{layout: {...seed, regionMaps: maps}}]};
}
function main() {
  const [input, output] = process.argv.slice(2);
  const source = JSON.parse(fs.readFileSync(input));
  assert.equal(source.complete, true);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');
  const context = loadContext(source, 'D:/C2D/Documents/rime-snow-pinyin');
  const fast = prepare(source.tokenKeys, context), policy = source.results[0].policy;
  const report = {version: '2126-coupled-en-ao-erv-1', input, inputSha256: hash,
    sources: source.sources, tokenKeys: source.tokenKeys, baseline: source.baseline,
    contract: {...source.contract, policy, scope: 'unchanged keys or en/n vs ao group swap in tone 2/3 row, crossed with 100 uniform er/v assignments'},
    anchorScore: source.results[0].score, evaluations: [], results: [], complete: false};
  if (fs.existsSync(output)) {
    const prior = JSON.parse(fs.readFileSync(output));
    assert.equal(prior.inputSha256, hash); report.evaluations = prior.evaluations;
  }
  const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  for (const swap of [false, true]) for (let er = 0; er < 10; er++) for (let v = 0; v < 10; v++) {
    if (report.evaluations.some(e => e.swap === swap && e.er === er && e.v === v)) continue;
    const layout = makeLayout(variant(source, swap), er, v);
    verify(variant(source, swap), layout);
    report.evaluations.push({swap, er, v, ...fast(layout, policy)});
    save();
    if (report.evaluations.length % 25 === 0) console.log(output, report.evaluations.length, Math.min(...report.evaluations.map(e => e.score)));
  }
  const original = source.results[0].layout.regroup || {er: 7, v: 3};
  const replay = report.evaluations.find(e => !e.swap && e.er === original.er && e.v === original.v);
  assert.ok(Math.abs(replay.score - report.anchorScore) < 1e-10);
  report.evaluations.sort((a, b) => a.score - b.score);
  report.results = report.evaluations.slice(0, 8).map(e => ({...e, layout: makeLayout(variant(source, e.swap), e.er, e.v)}));
  report.branchBest = [false, true].map(swap => report.evaluations.find(e => e.swap === swap));
  for (const e of report.branchBest) {
    const layout = makeLayout(variant(source, e.swap), e.er, e.v);
    const oracle = experiment.evaluate(layout, source.tokenKeys, context, policy);
    assert.ok(Math.abs(oracle.score - e.score) < 1e-10);
    for (const kind of Object.keys(oracle.tracks)) for (const field of Object.keys(oracle.tracks[kind]))
      assert.ok(Math.abs(oracle.tracks[kind][field] - e.tracks[kind][field]) < 1e-8);
  }
  const best = report.results[0];
  report.buckets = Object.fromEntries(['QZ', 'ZQ'].map(code => [code, source.tokenKeys.filter((t, i) => best.layout.tonedCodes[i] === code)]));
  report.complete = true; save();
  console.log(JSON.stringify({output, best: best.score, swap: best.swap, er: best.er, v: best.v}));
}
if (require.main === module) main();
module.exports = {variant};
