'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {marsRhymeIndex, MARS_RHYME_GROUPS} = require('./mars_toned_factorization');
const {loadContext} = require('./frontier_toned_2126');
const {prepare} = require('./fast_toned_2126');
const experiment = require('./explore_toned_2126');

function makeLayout(source, er, v) {
  assert.ok(Number.isInteger(er) && er >= 0 && er < 10);
  assert.ok(Number.isInteger(v) && v >= 0 && v < 10);
  const seed = source.results[0].layout;
  const inventory = JSON.parse(fs.readFileSync('research/config/ckt-v51-toned-2121-seeds.json'));
  const finals = new Map(inventory.decomposition.map(d => [d.pinyin, d.fullFinal]));
  const group = final => final === 'er' ? er : final === 'v' ? v : marsRhymeIndex(final);
  const finalGroups = Object.fromEntries(MARS_RHYME_GROUPS.flatMap(g => g.finals).map(f => [f, group(f)]));
  assert.equal(new Set(Object.values(finalGroups)).size, 10);
  const tonedCodes = source.tokenKeys.map((token, i) => {
    const final = finals.get(token.slice(0, -1));
    const row = seed.toneRowsByTone[Number(token.slice(-1))];
    return seed.tonedCodes[i][0] + experiment.ROWS[row][seed.regionMaps[row][group(final)]];
  });
  const id = 'T2126-RG-' + crypto.createHash('sha256').update(JSON.stringify(tonedCodes)).digest('hex').slice(0, 12);
  return {...seed, id, tonedCodes, finalGroups, regroup: {er, v},
    groupingSource: 'layout.finalGroups; regionMaps columns retain original Mars slot indices'};
}

function verify(source, layout) {
  const seed = source.results[0].layout;
  assert.deepEqual(makeLayout(source, layout.regroup.er, layout.regroup.v).tonedCodes, layout.tonedCodes);
  const expected = experiment.ROWS.map(row => new Set(seed.tonedCodes.map(c => c[1]).filter(k => row.includes(k))).size);
  const actual = experiment.ROWS.map(row => new Set(layout.tonedCodes.map(c => c[1]).filter(k => row.includes(k))).size);
  assert.deepEqual(actual, expected);
  if (!seed.tonedCodes.some(c => c[1] === 'Q')) assert.ok(layout.tonedCodes.every(c => c[1] !== 'Q'));
  layout.tonedCodes.forEach((code, i) => {
    assert.equal(code[0], seed.tonedCodes[i][0]);
    assert.ok(experiment.ROWS[seed.toneRowsByTone[Number(source.tokenKeys[i].slice(-1))]].includes(code[1]));
  });
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('input output required');
  const source = JSON.parse(fs.readFileSync(input));
  const context = loadContext(source, 'D:/C2D/Documents/rime-snow-pinyin');
  const fast = prepare(source.tokenKeys, context);
  const policy = source.results[0].policy;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');
  const report = {version: '2126-er-v-regroup-1', input, inputSha256: hash,
    sources: source.sources, tokenKeys: source.tokenKeys, baseline: source.baseline,
    contract: {...source.contract, policy, regroup: 'er and v each assigned to any of 10 nonempty slots, uniformly across tones',
      fixed: 'first keys, regionMaps, toneRowsByTone, shapeKeysByMeaning, auxiliary policy'},
    anchorScore: source.results[0].score, evaluations: [], results: [], complete: false};
  if (fs.existsSync(output)) {
    const previous = JSON.parse(fs.readFileSync(output));
    assert.equal(previous.inputSha256, hash);
    report.evaluations = previous.evaluations;
  }
  const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  for (let er = 0; er < 10; er++) for (let v = 0; v < 10; v++) {
    if (report.evaluations.some(e => e.er === er && e.v === v)) continue;
    const layout = makeLayout(source, er, v); verify(source, layout);
    const value = fast(layout, policy);
    report.evaluations.push({er, v, ...value});
    save();
    if (report.evaluations.length % 10 === 0) console.log(output, report.evaluations.length, 'best', Math.min(...report.evaluations.map(e => e.score)));
  }
  const unchanged = report.evaluations.find(e => e.er === 7 && e.v === 3);
  assert.ok(Math.abs(unchanged.score - report.anchorScore) < 1e-10);
  report.evaluations.sort((a, b) => a.score - b.score);
  report.results = report.evaluations.slice(0, 8).map(e => ({...e, layout: makeLayout(source, e.er, e.v)}));
  const best = report.results[0];
  const oracle = experiment.evaluate(best.layout, source.tokenKeys, context, policy);
  for (const kind of Object.keys(oracle.tracks)) for (const field of Object.keys(oracle.tracks[kind])) {
    assert.ok(Math.abs(oracle.tracks[kind][field] - best.tracks[kind][field]) < 1e-8);
  }
  report.oracleScoreDifference = best.score - oracle.score;
  assert.ok(Math.abs(report.oracleScoreDifference) < 1e-10);
  report.buckets = Object.fromEntries(['QZ', 'ZQ'].map(code => [code, source.tokenKeys.filter((t, i) => best.layout.tonedCodes[i] === code)]));
  report.complete = true; save();
  console.log(JSON.stringify({output, score: best.score, er: best.er, v: best.v, buckets: report.buckets}));
}
if (require.main === module) main();
module.exports = {makeLayout, verify};
