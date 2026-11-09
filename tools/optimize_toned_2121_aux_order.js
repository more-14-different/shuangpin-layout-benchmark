#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scorer = require('./score_completion_ckt_v4.js');
const {
  buildReference,
  evaluateLayoutPolicy,
  normalizedScore,
  projectedMotor,
} = require('./score_toned_2121_ckt_v51.js');
const {toneKeysFromShapeKeys} = require('./auxiliary_semantics.js');

const KINDS = Object.freeze(['character', 'word2', 'word3', 'word4']);
const CANONICAL_SHAPE_KEYS_BY_MEANING = 'QAOPL';

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

function permutations(values) {
  if (values.length <= 1) return [values.join('')];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index), ...values.slice(index + 1),
  ]).map(rest => `${value}${rest}`));
}

function remapAuxiliaryKeys(code, shapeKeysByMeaning) {
  const mapping = Object.fromEntries([...CANONICAL_SHAPE_KEYS_BY_MEANING]
    .map((key, index) => [key, shapeKeysByMeaning[index]]));
  return [...code].map(key => mapping[key] || key).join('');
}

function scoreOrder(evaluation, reference, motor, shapeKeysByMeaning) {
  const motorWeighted = Object.fromEntries(KINDS.map(kind => [kind, 0]));
  const totalWeight = Object.fromEntries(KINDS.map(kind => [kind, 0]));
  for (const outcome of evaluation.outcomes) {
    const code = remapAuxiliaryKeys(outcome.code, shapeKeysByMeaning);
    const value = motor(code);
    if (!value) throw new Error(`motor projection failed for ${code}`);
    motorWeighted[outcome.kind] += outcome.weight * value.upperMs;
    totalWeight[outcome.kind] += outcome.weight;
  }
  const tracks = Object.fromEntries(KINDS.map(kind => {
    const original = evaluation.tracks[kind];
    const motorUpperMs = motorWeighted[kind] / totalWeight[kind];
    return [kind, {
      ...original,
      motorUpperMs,
      effectiveMs: original.effectiveMs - original.motorUpperMs + motorUpperMs,
    }];
  }));
  return {
    shapeKeysByMeaning,
    toneKeysByTone: toneKeysFromShapeKeys(shapeKeysByMeaning),
    score: normalizedScore(tracks, reference.tracks),
    tracks,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const layoutsFile = path.resolve(args.layouts ||
    path.join(root, 'research/config/ckt-v51-toned-2121-layouts.json'));
  const priorFile = path.resolve(args.prior ||
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-ckt-search.json'));
  const outputLayouts = path.resolve(args['output-layouts'] ||
    path.join(root, 'research/config/ckt-v51-toned-2121-aux-refined-layouts.json'));
  const outputReport = path.resolve(args['output-report'] ||
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-aux-order-search.json'));

  const data = scorer.loadPayload(html);
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const motor = projectedMotor(data);
  const layouts = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const prior = JSON.parse(fs.readFileSync(priorFile, 'utf8'));
  const policyById = new Map(prior.results.map(value => [value.id, value.policy]));
  const reference = buildReference({data, words, strokes, motor, snow});
  const orders = permutations([...CANONICAL_SHAPE_KEYS_BY_MEANING]);
  const selectedIds = args.ids ? new Set(String(args.ids).split(',')) : null;
  const results = [];

  for (const layout of layouts.layouts) {
    if (selectedIds && !selectedIds.has(layout.id)) continue;
    const policy = policyById.get(layout.id);
    if (!policy) throw new Error(`prior CKT policy missing for ${layout.id}`);
    const evaluation = evaluateLayoutPolicy({
      layout,
      layouts,
      data,
      words,
      motor,
      reference,
      shapeKeysByMeaning: CANONICAL_SHAPE_KEYS_BY_MEANING,
      policy,
    });
    const ranked = orders.map(order => scoreOrder(evaluation, reference, motor, order))
      .sort((left, right) => left.score - right.score);
    const current = ranked.find(value =>
      value.shapeKeysByMeaning === CANONICAL_SHAPE_KEYS_BY_MEANING);
    results.push({
      id: layout.id,
      factorization: layout.factorization,
      declaredMemory: layout.declaredMemory || null,
      policy,
      current: {
        shapeKeysByMeaning: current.shapeKeysByMeaning,
        toneKeysByTone: current.toneKeysByTone,
        score: current.score,
      },
      best: ranked[0],
      improvement: current.score - ranked[0].score,
      top10: ranked.slice(0, 10).map(value => ({
        shapeKeysByMeaning: value.shapeKeysByMeaning,
        toneKeysByTone: value.toneKeysByTone,
        score: value.score,
      })),
    });
  }

  const bestById = new Map(results.map(value => [value.id, value.best]));
  const refined = {
    ...layouts,
    version: 'ckt-v5.1-toned-2121-aux-refined-layouts-1',
    layouts: layouts.layouts.map(layout => bestById.has(layout.id) ? {
      ...layout,
      recommendedShapeKeysByMeaning: bestById.get(layout.id).shapeKeysByMeaning,
      recommendedToneKeysByTone: bestById.get(layout.id).toneKeysByTone,
    } : layout),
  };
  const report = {
    version: 'shape-only-ckt-v5.1-toned-2121-aux-order-search-1',
    objective: 'shape-only CKT v5.1 only; occupied buckets are not an objective',
    invariant: 'Auxiliary meaning orders are bijective renamings, so candidate competition and M/D/V sound-layout guards remain unchanged; only motor time changes.',
    orderCount: orders.length,
    results: results.sort((left, right) => left.best.score - right.best.score),
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(refined, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report.results.map(value => ({
    id: value.id,
    M: value.declaredMemory?.M,
    current: value.current.score,
    best: value.best.score,
    improvement: value.improvement,
    shapeKeysByMeaning: value.best.shapeKeysByMeaning,
  })), null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {remapAuxiliaryKeys, scoreOrder};
