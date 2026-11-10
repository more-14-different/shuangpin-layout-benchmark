#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const model = require('./ckt_v4_model.js');
const scorer = require('./score_completion_ckt_v4.js');
const {physicalShape, toneKeysFromShapeKeys} = require('./auxiliary_semantics.js');

const TRACK_WEIGHTS = Object.freeze({character: 1, word2: 3, word3: 1, word4: 1});
const REFERENCE_POLICY = Object.freeze({word2: '12', word3: '213', word4: '24'});

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

function parsePolicy(value) {
  if (!value) return null;
  const [word2, word3, word4, extra] = String(value).split('/');
  if (!word2 || !word3 || !word4 || extra) {
    throw new Error(`invalid policy ${value}; expected word2/word3/word4`);
  }
  return {word2, word3, word4};
}

function sampleCorpus(data, words, count) {
  if (!(count > 0)) return {data, words};
  return {
    data: {
      ...data,
      characters: [...data.characters].filter(row => row[4] && row[3] > 0)
        .sort((left, right) => right[3] - left[3]).slice(0, count),
    },
    words: Object.fromEntries(Object.entries(words).map(([kind, rows]) => [kind,
      [...rows].sort((left, right) => right.weight - left.weight).slice(0, count)])),
  };
}

function orderedPairs(length) {
  const result = [];
  for (let first = 1; first <= length; first++) for (let second = 1; second <= length; second++) {
    if (first !== second) result.push(`${first}${second}`);
  }
  return result;
}

function permutations(values) {
  if (values.length <= 1) return [values.join('')];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index), ...values.slice(index + 1),
  ]).map(rest => `${value}${rest}`));
}

function simpleStage(code) {
  return {length: [...code].length, codes: [code]};
}

function row(id, text, kind, weight, baseLength, stages) {
  return {id, text, kind, weight, baseLength,
    stages: model.makeStages('traditional-21x21', kind, stages.map(simpleStage))};
}

function extendedWord3Row(id, text, weight, codes) {
  const pools = ['word3:three', 'word3:four-b', 'word3:five-bb', 'word3:six-bbb'];
  return {id, text, kind: 'word3', weight, baseLength: 3,
    stages: codes.map((code, index) => ({
      order: [...code].length,
      length: [...code].length,
      pool: pools[index],
      codes: [code],
    }))};
}

function layoutCodeAccessor(layout, layouts, data) {
  const byToken = new Map(layouts.tokenKeys.map((key, index) => [key, layout.tonedCodes[index]]));
  return (pinyinIndex, tone) => byToken.get(`${data.pinyin[pinyinIndex]}${tone}`) || null;
}

function auxiliary(item, chars, position, toneKeysByTone, shape) {
  return physicalShape(shape[chars[position - 1]], toneKeysByTone)[0];
}

function buildCharacterRows(layout, layouts, data, toneKeysByTone) {
  const code = layoutCodeAccessor(layout, layouts, data);
  const common = new Set(data.base.map(([index]) => index));
  const shape = data.shapes.snowshape;
  const rows = [];
  for (const [text, pinyin, tone, weight, isCommon] of data.characters) {
    if (!isCommon || !(weight > 0) || scorer.FIXED_ONE_KEY.has(text) || !common.has(pinyin)) continue;
    const base = code(pinyin, tone);
    const aux = physicalShape(shape[text], toneKeysByTone);
    if (!base || aux.length < 2) continue;
    rows.push(row(`c:${text}:${pinyin}`, text, 'character', weight, 2,
      [base, base + aux[0], base + aux.slice(0, 2)]));
  }
  return rows;
}

function buildWordRows(layout, layouts, data, words, toneKeysByTone, kind, order) {
  const code = layoutCodeAccessor(layout, layouts, data);
  const shape = data.shapes.snowshape;
  const rows = [];
  for (let index = 0; index < words[kind].length; index++) {
    const item = words[kind][index];
    const codes = item.py.map((pinyin, at) => code(pinyin, item.tones[at]));
    if (codes.some(value => !value)) continue;
    const chars = [...item.text];
    const auxiliaries = [...order].map(position =>
      auxiliary(item, chars, Number(position), toneKeysByTone, shape));
    if (auxiliaries.some(value => !value)) continue;
    if (kind === 'word2') {
      const base = codes.join('');
      rows.push(row(`w2:${index}`, item.text, kind, item.weight, 4,
        [base, base + auxiliaries[0], base + auxiliaries.join('')]));
    } else if (kind === 'word4') {
      const stem = codes.map(value => value[0]).join('');
      rows.push(row(`word4:${index}`, item.text, kind, item.weight, 4,
        [stem, stem + auxiliaries[0], stem + auxiliaries.join('')]));
    } else {
      const stem = codes.map(value => value[0]).join('');
      const extended = [stem];
      for (const value of auxiliaries) extended.push(extended[extended.length - 1] + value);
      rows.push(extendedWord3Row(`word3:${index}`, item.text, item.weight, extended));
    }
  }
  return rows;
}

function projectedMotor(data) {
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'ckt_v4_upstream_role_tables.json'), 'utf8'));
  return model.projectedMotor(model.upstreamMotor(snapshot), snapshot.keys,
    data.ckt.calibration.extension_maps);
}

function evaluateLayoutPolicy({layout, layouts, data, words, motor, reference,
  shapeKeysByMeaning, policy}) {
  const toneKeysByTone = toneKeysFromShapeKeys(shapeKeysByMeaning);
  const characterRows = buildCharacterRows(layout, layouts, data, toneKeysByTone);
  const word2Rows = buildWordRows(layout, layouts, data, words, toneKeysByTone,
    'word2', policy.word2);
  const word3Rows = buildWordRows(layout, layouts, data, words, toneKeysByTone,
    'word3', policy.word3);
  const word4Rows = buildWordRows(layout, layouts, data, words, toneKeysByTone,
    'word4', policy.word4);
  const characterOutcomes = model.resolveCompetition(characterRows, {motorCost: motor});
  const pairOutcomes = model.resolveCompetition([...word2Rows, ...word4Rows], {motorCost: motor});
  const word3Outcomes = model.resolveCompetition(word3Rows, {motorCost: motor});
  const outcomes = [...characterOutcomes, ...pairOutcomes, ...word3Outcomes];
  const tracks = Object.fromEntries(Object.keys(TRACK_WEIGHTS).map(kind => [kind,
    reference.summarize(outcomes.filter(value => value.kind === kind))]));
  return {
    score: normalizedScore(tracks, reference.tracks),
    policy,
    shapeKeysByMeaning,
    toneKeysByTone,
    tracks,
    outcomes,
  };
}

function normalizedScore(tracks, reference) {
  let sum = 0;
  let denominator = 0;
  for (const [kind, weight] of Object.entries(TRACK_WEIGHTS)) {
    sum += weight * (tracks[kind].effectiveMs / reference[kind].effectiveMs) ** 4;
    denominator += weight;
  }
  return 10 * (sum / denominator) ** 0.25;
}

function buildReference({data, words, strokes, motor, snow}) {
  const entry = data.entries.find(value => value.id === 'S005');
  if (!entry) throw new Error('S005 reference missing');
  const {buildRowsForOrder} = require(path.join(snow, 'scripts/research/evaluate_ckt_v4_word_aux_order.js'));
  const {buildExtendedWord3Rows, summarize} = require(path.join(snow, 'scripts/research/evaluate_ckt51_aux_order.js'));
  const characters = scorer.buildRows(entry, data, strokes, words, 'keytao')
    .filter(value => value.kind === 'character');
  const word2 = buildRowsForOrder(entry, data, words, 'keytao', entry.tone,
    'word2', REFERENCE_POLICY.word2, model);
  const word4 = buildRowsForOrder(entry, data, words, 'keytao', entry.tone,
    'word4', REFERENCE_POLICY.word4, model);
  const pair = model.resolveCompetition([...word2, ...word4], {motorCost: motor});
  const word3 = buildExtendedWord3Rows(entry, data, words, 'keytao', entry.tone,
    REFERENCE_POLICY.word3);
  return {
    summarize,
    tracks: {
      character: summarize(model.resolveCompetition(characters, {motorCost: motor})),
      word2: summarize(pair.filter(value => value.kind === 'word2')),
      word3: summarize(model.resolveCompetition(word3, {motorCost: motor})),
      word4: summarize(pair.filter(value => value.kind === 'word4')),
    },
  };
}

function scoreLayout({layout, layouts, data, words, motor, reference, shapeKeysByMeaning}) {
  const toneKeysByTone = toneKeysFromShapeKeys(shapeKeysByMeaning);
  const characterRows = buildCharacterRows(layout, layouts, data, toneKeysByTone);
  const character = reference.summarize(model.resolveCompetition(characterRows, {motorCost: motor}));
  const word2Rows = new Map(orderedPairs(2).map(order => [order,
    buildWordRows(layout, layouts, data, words, toneKeysByTone, 'word2', order)]));
  const word3Rows = new Map(permutations(['1', '2', '3']).map(order => [order,
    buildWordRows(layout, layouts, data, words, toneKeysByTone, 'word3', order)]));
  const word4Rows = new Map(orderedPairs(4).map(order => [order,
    buildWordRows(layout, layouts, data, words, toneKeysByTone, 'word4', order)]));
  const word3Tracks = new Map([...word3Rows].map(([order, rows]) => [order,
    reference.summarize(model.resolveCompetition(rows, {motorCost: motor}))]));
  const pairTracks = new Map();
  for (const word2 of word2Rows.keys()) for (const word4 of word4Rows.keys()) {
    const outcomes = model.resolveCompetition([
      ...word2Rows.get(word2), ...word4Rows.get(word4),
    ], {motorCost: motor});
    pairTracks.set(`${word2}/${word4}`, {
      word2: reference.summarize(outcomes.filter(value => value.kind === 'word2')),
      word4: reference.summarize(outcomes.filter(value => value.kind === 'word4')),
    });
  }
  let champion;
  for (const word2 of word2Rows.keys()) for (const word3 of word3Rows.keys()) {
    for (const word4 of word4Rows.keys()) {
      const pair = pairTracks.get(`${word2}/${word4}`);
      const tracks = {character, word2: pair.word2, word3: word3Tracks.get(word3), word4: pair.word4};
      const score = normalizedScore(tracks, reference.tracks);
      if (!champion || score < champion.score) champion = {
        score, policy: {word2, word3, word4}, tracks,
      };
    }
  }
  return {
    id: layout.id,
    factorization: layout.factorization,
    origin: layout.origin,
    declaredMemory: layout.declaredMemory || null,
    shapeKeysByMeaning,
    toneKeysByTone,
    policySpace: {word2: 2, word3: 6, word4: 12, combinations: 144},
    ...champion,
  };
}

function scoreFixedPolicy({layout, layouts, data, words, motor, reference,
  shapeKeysByMeaning, policy}) {
  const result = evaluateLayoutPolicy({layout, layouts, data, words, motor, reference,
    shapeKeysByMeaning, policy});
  return {
    id: layout.id,
    factorization: layout.factorization,
    origin: layout.origin,
    declaredMemory: layout.declaredMemory || null,
    shapeKeysByMeaning: result.shapeKeysByMeaning,
    toneKeysByTone: result.toneKeysByTone,
    policySpace: {word2: 1, word3: 1, word4: 1, combinations: 1},
    score: result.score,
    policy: result.policy,
    tracks: result.tracks,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const layoutsFile = path.resolve(args.layouts || path.join(root, 'research/config/ckt-v51-toned-2121-layouts.json'));
  const output = path.resolve(args.output || path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-ckt-search.json'));
  const forcedShapeKeysByMeaning = args.shape ? String(args.shape).toUpperCase() : null;
  const forcedPolicy = parsePolicy(args.policy);
  const fullData = scorer.loadPayload(html);
  const fullWords = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), fullData, 0.99);
  const sampled = sampleCorpus(fullData, fullWords, Number(args.sample || 0));
  const data = sampled.data;
  const words = sampled.words;
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const motor = projectedMotor(data);
  const layouts = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const reference = buildReference({data, words, strokes, motor, snow});
  const rankedIds = args['rank-from']
    ? JSON.parse(fs.readFileSync(path.resolve(args['rank-from']), 'utf8')).results
      .slice(0, Number(args.top || 64)).map(value => value.id)
    : null;
  const selectedIds = args.ids ? String(args.ids).split(',') : rankedIds;
  const maximumD = args['max-d'] === undefined ? null : Number(args['max-d']);
  const selected = layouts.layouts.filter(value =>
    (!selectedIds || selectedIds.includes(value.id)) &&
    (maximumD === null || Number(value.memoryAudit?.traditionalOnsetD) <= maximumD));
  const results = selected.map(layout => (forcedPolicy ? scoreFixedPolicy : scoreLayout)({
    layout, layouts, data, words, motor, reference,
    shapeKeysByMeaning: forcedShapeKeysByMeaning || layout.recommendedShapeKeysByMeaning || 'QAOPL',
    ...(forcedPolicy ? {policy: forcedPolicy} : {}),
  })).sort((left, right) => left.score - right.score);
  const report = {
    version: 'shape-only-ckt-v5.1-toned-2121-search-1',
    normalization: 'S005 keytao-only; track weights character/word2/word3/word4 = 1/3/1/1',
    screeningMode: forcedPolicy ? {
      kind: 'fixed-policy',
      policy: forcedPolicy,
      shapeKeysByMeaning: forcedShapeKeysByMeaning || 'layout recommendation or QAOPL fallback',
      sampleRowsPerTrack: Number(args.sample || 0) || null,
      maximumTraditionalOnsetD: maximumD,
    } : {kind: 'exhaustive-word-auxiliary-policy', combinationsPerLayout: 144},
    reference: {id: 'S005', policy: REFERENCE_POLICY, tracks: reference.tracks},
    results,
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(results.map(value => ({
    id: value.id, factorization: value.factorization, M: value.declaredMemory?.M,
    score: value.score, policy: value.policy,
  })), null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  buildCharacterRows,
  buildReference,
  buildWordRows,
  evaluateLayoutPolicy,
  normalizedScore,
  projectedMotor,
  scoreFixedPolicy,
  scoreLayout,
  sampleCorpus,
};
