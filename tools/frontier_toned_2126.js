#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const model = require('./ckt_v4_model.js');
const scorer = require('./score_completion_ckt_v4.js');
const toned = require('./score_toned_2121_ckt_v51.js');
const experiment = require('./explore_toned_2126.js');
const {marsRhymeIndex} = require('./mars_toned_factorization.js');
const {toneKeysFromShapeKeys} = require('./auxiliary_semantics.js');

function neighbors(maps, requireAll = true) {
  const unique = new Map();
  const original = JSON.stringify(maps);
  const add = (next, move) => {
    const signature = JSON.stringify(next);
    if (signature === original || unique.has(signature)) return;
    if (requireAll && next.some((row, r) => new Set(row).size !== experiment.ROWS[r].length)) return;
    unique.set(signature, {maps: next, move});
  };
  for (let r = 0; r < 3; r++) for (let a = 0; a < 10; a++) {
    for (let b = a + 1; b < 10; b++) {
      const next = maps.map(row => [...row]);
      [next[r][a], next[r][b]] = [next[r][b], next[r][a]];
      add(next, {kind: 'swap', row: r, a, b});
    }
    for (let key = 0; key < experiment.ROWS[r].length; key++) {
      const next = maps.map(row => [...row]);
      next[r][a] = key;
      add(next, {kind: 'reassign', row: r, a, key});
    }
  }
  return [...unique.values()];
}

function loadContext(source, snow, sample = 0) {
  const root = path.resolve(__dirname, '..');
  const html = path.join(root, 'a7_CKT_R11.html');
  const data = scorer.loadPayload(html);
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const [field, file] of Object.entries({htmlSha256: html,
    dictionarySha256: path.join(snow, 'snow_pinyin.base.dict.yaml'),
    mappingSha256: path.join(snow, 'config/shenyun-21x26-mapping.json')})) {
    if (source.sources[field] !== hash(file)) throw new Error(`source drift: ${field}`);
  }
  const sampled = toned.sampleCorpus(data, words, sample);
  const motor = toned.projectedMotor(data);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const {buildRowsForOrder} = require(path.join(snow, 'scripts/research/evaluate_ckt_v4_word_aux_order.js'));
  const reference = toned.buildReference({data: sampled.data, words: sampled.words, strokes, motor, snow});
  return {...sampled, motor, reference, buildRowsForOrder};
}

function layoutFactory(source) {
  const seed = source.results[0].layout;
  const toneRowsByTone = seed.toneRowsByTone || {1: 2, 2: 1, 3: 1, 4: 0, 5: 2};
  const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, '../research/config/ckt-v51-toned-2121-seeds.json')));
  const rhyme = new Map(inventory.decomposition.map(row => [row.pinyin, marsRhymeIndex(row.fullFinal)]));
  const tokens = source.tokenKeys.map((token, i) => ({first: seed.tonedCodes[i][0],
    row: toneRowsByTone[Number(token.slice(-1))], rhyme: rhyme.get(token.slice(0, -1))}));
  return maps => {
    const layout = {id: `T2126-${crypto.createHash('sha256').update(JSON.stringify(maps)).digest('hex').slice(0, 12)}`,
      shapeKeysByMeaning: seed.shapeKeysByMeaning, regionMaps: maps, toneRowsByTone,
      tonedCodes: tokens.map(t => t.first + experiment.ROWS[t.row][maps[t.row][t.rhyme]])};
    if (layout.tonedCodes.some((code, i) => !/^[BCDFGHJKLMNPQRSTVWXYZ][A-Z]$/.test(code) ||
        !experiment.ROWS[tokens[i].row].includes(code[1]))) throw new Error('invalid tone-region layout');
    return layout;
  };
}

// Build each policy's rows once, retaining the exact shared-pool resolver.
function policyEvaluator(layout, tokenKeys, context) {
  const {data, words, motor, reference, buildRowsForOrder} = context;
  const toneKeysByTone = toneKeysFromShapeKeys(layout.shapeKeysByMeaning);
  const characters = toned.buildCharacterRows(layout, {tokenKeys}, data, toneKeysByTone);
  const character = reference.summarize(model.resolveCompetition(characters, {motorCost: motor}));
  const adapted = experiment.adaptWords(layout, tokenKeys, data, words);
  const entry = {capacity: [21, 26], codeList: layout.tonedCodes, tone: toneKeysByTone};
  const cache = new Map();
  return policy => {
    const rows = Object.entries(policy).flatMap(([kind, order]) => {
      const key = `${kind}/${order}`;
      if (!cache.has(key)) cache.set(key, buildRowsForOrder(entry, data, adapted, 'keytao', toneKeysByTone, kind, order, model));
      return cache.get(key);
    });
    const outcomes = model.resolveCompetition(rows, {motorCost: motor, lengthBalance: experiment.BALANCE});
    const tracks = {character, ...Object.fromEntries(['word2', 'word3', 'word4'].map(kind =>
      [kind, reference.summarize(outcomes.filter(row => row.kind === kind))]))};
    return {id: layout.id, policy, score: toned.normalizedScore(tracks, reference.tracks), tracks};
  };
}

function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  if (!args.from || !args.output) throw new Error('--from and --output required');
  const source = JSON.parse(fs.readFileSync(path.resolve(args.from), 'utf8'));
  if (args.index !== undefined) {
    const selected = source.results[Number(args.index)];
    if (!selected) throw new Error('invalid source result index');
    source.results = [selected];
  }
  const output = path.resolve(args.output);
  const mode = args.mode || 'screen';
  if (!['screen', 'full', 'policies', 'probe'].includes(mode)) throw new Error('invalid mode');
  const sample = mode === 'screen' ? Number(args.sample || 3000) : 0;
  const context = loadContext(source, path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin'), sample);
  const makeLayout = layoutFactory(source);
  const policy = args.policy ? Object.fromEntries(['word2', 'word3', 'word4'].map((kind, i) =>
    [kind, args.policy.split('/')[i]])) : source.contract.policy || experiment.POLICY;
  if (!experiment.auxiliaryPolicies().some(value => JSON.stringify(value) === JSON.stringify(policy))) {
    throw new Error('invalid two-auxiliary policy');
  }
  const report = {version: 'toned-2126-neighborhood-1', mode, sampleRowsPerTrack: sample || null,
    requireAll26Keys: args.vacancy !== 'allow',
    sources: source.sources, input: args.from, sourceResultIndex: Number(args.index || 0), contract: {...source.contract, policy}, tokenKeys: source.tokenKeys,
    reference: context.reference.tracks, baseline: source.baseline, history: [], evaluations: [], results: [], complete: false};
  if (source.results[0].layout.toneRowsByTone) {
    report.contract.tonesByRow = [0, 1, 2].map(row => [1, 2, 3, 4, 5]
      .filter(tone => source.results[0].layout.toneRowsByTone[tone] === row).map(tone => tone === 5 ? 0 : tone));
    report.contract.neutralTonePolicy = 'explicit row in layout.toneRowsByTone[5]';
  }
  const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  let current = source.results[0].layout;
  const fast = require('./fast_toned_2126.js').prepare(source.tokenKeys, context, current.shapeKeysByMeaning);
  const oracle = experiment.evaluate(current, source.tokenKeys, context, policy);
  const prepared = fast(current, policy);
  for (const kind of Object.keys(oracle.tracks)) for (const field of Object.keys(oracle.tracks[kind])) {
    if (Math.abs(oracle.tracks[kind][field] - prepared.tracks[kind][field]) > 1e-8) {
      throw new Error(`prepared scorer parity failed: ${kind}/${field}`);
    }
  }
  report.preparedScorerParity = {scoreDifference: prepared.score - oracle.score, trackTolerance: 1e-8};
  if (mode === 'policies') {
    const evaluate = candidatePolicy => fast(current, candidatePolicy);
    const parity = evaluate(policy);
    const ordinary = experiment.evaluate(current, source.tokenKeys, context, policy);
    if (Math.abs(parity.score - ordinary.score) > 1e-10) throw new Error('cached policy scorer parity failed');
    for (const candidatePolicy of experiment.auxiliaryPolicies()) {
      report.evaluations.push(evaluate(candidatePolicy));
      if (report.evaluations.length % 12 === 0) {
        console.log(`full policies ${report.evaluations.length}/144`); save();
      }
    }
    report.evaluations.sort((a, b) => a.score - b.score);
    report.results = [{layout: current, ...report.evaluations[0]}];
    report.contract.policy = report.evaluations[0].policy;
    report.complete = true; save(); return;
  }
  const cache = new Map();
  if (args.resume && fs.existsSync(output)) {
    const previous = JSON.parse(fs.readFileSync(output, 'utf8'));
    if (previous.input !== args.from || previous.mode !== mode ||
        (previous.sourceResultIndex || 0) !== report.sourceResultIndex ||
        previous.sampleRowsPerTrack !== report.sampleRowsPerTrack ||
        (previous.requireAll26Keys ?? true) !== report.requireAll26Keys ||
        JSON.stringify(previous.sources) !== JSON.stringify(source.sources) ||
        JSON.stringify(previous.contract.policy) !== JSON.stringify(policy)) {
      throw new Error('resume contract mismatch');
    }
    for (const row of previous.evaluations) cache.set(JSON.stringify(row.regionMaps), row);
    report.evaluations = previous.evaluations;
  }
  function evaluate(layout, move = null) {
    const key = JSON.stringify(layout.regionMaps);
    if (!cache.has(key)) {
      const value = fast(layout, policy);
      cache.set(key, value);
      report.evaluations.push({...value, regionMaps: layout.regionMaps, move});
      if (cache.size % (sample ? 25 : 10) === 0) {
        console.log(`${mode}: evaluated ${cache.size}, current ${report.history.at(-1)?.score}`); save();
      }
    }
    return cache.get(key);
  }
  let score = evaluate(current);
  report.history.push({id: current.id, score: score.score, regionMaps: current.regionMaps});
  for (;;) {
    const options = neighbors(current.regionMaps, args.vacancy !== 'allow');
    let best = {layout: current, score};
    for (const option of options) {
      const layout = makeLayout(option.maps);
      const candidate = evaluate(layout, option.move);
      if (candidate.score < best.score.score - 1e-10) best = {layout, score: candidate};
    }
    report.lastNeighborhood = {anchor: current.id, neighborCount: options.length,
      improvement: score.score - best.score.score};
    if (best.layout === current || mode === 'probe') break;
    current = best.layout; score = best.score;
    report.history.push({id: current.id, score: score.score, regionMaps: current.regionMaps});
    report.results = [{layout: current, ...score}]; save();
    console.log(`${mode}: improved to ${score.score}, pass ${report.history.length - 1}`);
  }
  const ranked = [...cache.entries()].sort((a, b) => a[1].score - b[1].score);
  report.results = ranked.slice(0, Number(args.top || 8)).map(([key, value]) => ({layout: makeLayout(JSON.parse(key)), ...value}));
  report.complete = true;
  report.localOptimality = mode !== 'probe' ? {scope: 'all within-row single rhyme moves and pair swaps',
    requireAll26Keys: args.vacancy !== 'allow', corpus: sample ? 'sample only' : 'full CKT corpus', policy} : null;
  save();
  console.log(JSON.stringify({mode, evaluated: cache.size, history: report.history.map(row => row.score),
    best: report.results[0].score, lastNeighborhood: report.lastNeighborhood}));
}

if (require.main === module) main();
module.exports = {neighbors, layoutFactory, loadContext, policyEvaluator};
