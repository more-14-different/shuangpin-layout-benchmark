#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scorer = require('./score_completion_ckt_v4.js');
const {
  buildReference,
  projectedMotor,
  sampleCorpus,
  scoreFixedPolicy,
} = require('./score_toned_2121_ckt_v51.js');
const {buildToned2121Contract} = require('./toned_2121_contract.js');
const {imageFirstKey} = require('./audit_pindu_nextgen_image.js');
const {FORBIDDEN_SOURCE_KEYS, assignmentId} = require('./search_toned_2121_pindu11_lowmd.js');
const {reorderColumns} = require('./optimize_toned_2121_pindu11_lowmd_columns.js');

const FIXED_POLICY = Object.freeze({word2: '12', word3: '213', word4: '24'});
const FIXED_SHAPE_KEYS_BY_MEANING = 'QAOPL';
const DEFAULT_COLUMN_ORDER = Object.freeze([0, 4, 1, 2, 3, 5, 6]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith('--')) continue;
    args[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--')
      ? argv[++index]
      : true;
  }
  return args;
}

function setProjection(layout, sourceKey, destinationKey, tokenSourceKeys) {
  const projection = {...layout.forbiddenSourceProjection, [sourceKey]: destinationKey};
  const destinations = FORBIDDEN_SOURCE_KEYS.map(key => projection[key]);
  return {
    ...layout,
    id: `COORD-pindu11-${assignmentId(destinations)}-C${layout.columnOrder.join('')}`,
    assignment: assignmentId(destinations),
    forbiddenSourceProjection: projection,
    tonedCodes: layout.tonedCodes.map((code, index) =>
      tokenSourceKeys[index] === sourceKey ? destinationKey + code[1] : code),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const layoutsFile = path.resolve(args.layouts || path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-lowmd-layouts.json'));
  const seedsFile = path.resolve(args.seeds || path.join(root,
    'research/config/ckt-v51-toned-2121-seeds.json'));
  const rankingFile = path.resolve(args.ranking || path.join(root,
    'research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-lowmd-sample-ckt.json'));
  const outputLayouts = path.resolve(args['output-layouts'] || path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-lowmd-coordinate-layouts.json'));
  const outputReport = path.resolve(args['output-report'] || path.join(root,
    'research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-lowmd-coordinate-search.json'));
  const starts = Number(args.starts || 32);
  const maxSweeps = Number(args.sweeps || 8);
  const sampleCount = Number(args.sample || 160);
  const columnOrder = String(args.columns || DEFAULT_COLUMN_ORDER.join(''))
    .split('').map(Number);

  const layouts = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const decomposition = new Map(inventory.decomposition.map(value => [value.pinyin, value]));
  const tokenSourceKeys = layouts.tokenKeys.map(token => {
    const match = token.match(/^([a-z]+)[1-5]$/);
    return imageFirstKey(decomposition.get(match[1]).shengjie);
  });
  const byId = new Map(layouts.layouts.map(value => [value.id, value]));
  const ranking = JSON.parse(fs.readFileSync(rankingFile, 'utf8')).results;
  const initial = ranking.slice(0, starts).map(value =>
    reorderColumns(byId.get(value.id), columnOrder, buildToned2121Contract()));

  const fullData = scorer.loadPayload(html);
  const fullWords = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), fullData, 0.99);
  const corpus = sampleCorpus(fullData, fullWords, sampleCount);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const motor = projectedMotor(corpus.data);
  const reference = buildReference({data: corpus.data, words: corpus.words, strokes, motor, snow});
  const contract = buildToned2121Contract();
  const soundKeys = [...contract.soundKeys];
  const cache = new Map();

  function score(layout) {
    const key = layout.tonedCodes.join('|');
    if (!cache.has(key)) cache.set(key, scoreFixedPolicy({
      layout,
      layouts,
      data: corpus.data,
      words: corpus.words,
      motor,
      reference,
      shapeKeysByMeaning: FIXED_SHAPE_KEYS_BY_MEANING,
      policy: FIXED_POLICY,
    }).score);
    return cache.get(key);
  }

  const local = [];
  const audits = [];
  for (let start = 0; start < initial.length; start++) {
    let current = initial[start];
    let currentScore = score(current);
    const steps = [];
    for (let sweep = 0; sweep < maxSweeps; sweep++) {
      let improved = false;
      const order = Array.from({length: 5}, (_, index) => (index + start + sweep) % 5);
      for (const variable of order) {
        const sourceKey = FORBIDDEN_SOURCE_KEYS[variable];
        let best = {layout: current, score: currentScore};
        for (const destination of soundKeys) {
          const proposal = setProjection(current, sourceKey, destination, tokenSourceKeys);
          const proposalScore = score(proposal);
          if (proposalScore < best.score) best = {layout: proposal, score: proposalScore};
        }
        if (best.score + 1e-12 < currentScore) {
          steps.push({sweep, sourceKey, from: current.forbiddenSourceProjection[sourceKey],
            to: best.layout.forbiddenSourceProjection[sourceKey], before: currentScore,
            after: best.score});
          current = best.layout;
          currentScore = best.score;
          improved = true;
        }
      }
      if (!improved) break;
    }
    current.coordinateSampleScore = currentScore;
    local.push(current);
    audits.push({start, initialId: initial[start].parentId || initial[start].id,
      finalId: current.id, score: currentScore, steps});
    process.stderr.write(`coordinate ${start + 1}/${initial.length}: ${currentScore.toFixed(9)} ${current.assignment}\n`);
  }
  const unique = new Map(local.map(value => [value.tonedCodes.join('|'), value]));
  const finalists = [...unique.values()].sort((left, right) =>
    left.coordinateSampleScore - right.coordinateSampleScore);
  const output = {
    ...layouts,
    version: 'ckt-v5.1-toned-2121-pindu11-lowmd-coordinate-layouts-1',
    purpose: 'multi-start exhaustive-coordinate minima under fixed M/D grammar',
    layouts: finalists,
  };
  const report = {
    version: 'ckt-v5.1-toned-2121-pindu11-lowmd-coordinate-search-1',
    starts: initial.length,
    maxSweeps,
    sampleRowsPerTrack: sampleCount,
    columnOrder,
    fixedPolicy: FIXED_POLICY,
    fixedShapeKeysByMeaning: FIXED_SHAPE_KEYS_BY_MEANING,
    evaluatedUniqueLayouts: cache.size,
    distinctLocalMinima: finalists.length,
    audits,
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    evaluatedUniqueLayouts: cache.size,
    distinctLocalMinima: finalists.length,
    best: finalists.slice(0, 20).map(value => ({id: value.id,
      assignment: value.assignment, score: value.coordinateSampleScore})),
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {setProjection};
