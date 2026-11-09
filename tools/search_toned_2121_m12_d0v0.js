#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const model = require('./ckt_v4_model.js');
const scorer = require('./score_completion_ckt_v4.js');
const {
  buildCharacterRows,
  buildReference,
  buildWordRows,
  evaluateLayoutPolicy,
  normalizedScore,
  projectedMotor,
  scoreLayout,
} = require('./score_toned_2121_ckt_v51.js');
const {remapAuxiliaryKeys, scoreOrder} = require('./optimize_toned_2121_aux_order.js');
const {toneKeysFromShapeKeys} = require('./auxiliary_semantics.js');
const {buildToned2121Contract} = require('./toned_2121_contract.js');

const KINDS = Object.freeze(['character', 'word2', 'word3', 'word4']);
const CANONICAL_SHAPE = 'QAOPL';
const DEFAULT_POLICY = Object.freeze({word2: '12', word3: '213', word4: '24'});

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
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index), ...values.slice(index + 1),
  ]).map(rest => [value, ...rest]));
}

function orderedPairs(length) {
  const result = [];
  for (let first = 1; first <= length; first++) for (let second = 1; second <= length; second++) {
    if (first !== second) result.push(`${first}${second}`);
  }
  return result;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = value + 0x6D2B79F5 | 0;
    let result = Math.imul(value ^ value >>> 15, 1 | value);
    result = result + Math.imul(result ^ result >>> 7, 61 | result) ^ result;
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function sampleCorpus(data, words, count) {
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

function soundLocations(contract) {
  const rows = [contract.soundKeysByRow.upper, contract.soundKeysByRow.home,
    contract.soundKeysByRow.lower];
  return {
    rows,
    location: new Map(rows.flatMap((row, rowIndex) => [...row].map((key, column) =>
      [key, {rowIndex, column}]))),
  };
}

function mirroredNasalLayout(base, layouts, seedInventory, contract) {
  const decomposition = new Map(seedInventory.decomposition.map(value => [value.pinyin, value]));
  const {rows, location} = soundLocations(contract);
  return {
    ...base,
    id: `${base.id}-IU-MIRROR`,
    origin: 'M12-rule-orientation-mirror',
    tonedCodes: base.tonedCodes.map((code, index) => {
      if (!code) return code;
      const pinyin = layouts.tokenKeys[index].replace(/[1-5]$/, '');
      const split = decomposition.get(pinyin);
      if (!split || !['an', 'ang'].includes(split.rhymeBody) || !['i', 'u'].includes(split.medial)) {
        return code;
      }
      const current = location.get(code[1]);
      const delta = split.medial === 'i' ? 2 : -2;
      return code[0] + rows[current.rowIndex][(current.column + delta + 7) % 7];
    }),
    ruleOrientation: 'nasal an/ang: i +1, u -1 (mirror of seed); umlaut +2 unchanged',
  };
}

function remapLayout(base, layouts, firstPermutation, columnPermutation, contract, suffix) {
  const soundKeys = [...contract.soundKeys];
  const firstMap = new Map(soundKeys.map((key, index) => [key, firstPermutation[index]]));
  const {rows, location} = soundLocations(contract);
  return {
    ...base,
    id: `${base.id}-${suffix}`,
    origin: 'M12-D0V0-physical-permutation-search',
    parentId: base.id,
    structuralGuard: {
      M: 12,
      deltaD: 0,
      deltaV: 0,
      semantics: 'component partitions unchanged; whole first-group and whole rhyme-column physical permutations are free',
    },
    physicalPermutation: {
      firstKeysFrom: soundKeys.join(''),
      firstKeysTo: firstPermutation.join(''),
      columnsFrom: [0, 1, 2, 3, 4, 5, 6],
      columnsTo: [...columnPermutation],
    },
    tonedCodes: base.tonedCodes.map(code => {
      if (!code) return code;
      const second = location.get(code[1]);
      return firstMap.get(code[0]) + rows[second.rowIndex][columnPermutation[second.column]];
    }),
  };
}

function transformOutcomeCode(code, kind, firstMap, columnMap, contract, sound = null) {
  const {rows, location} = sound || soundLocations(contract);
  const chars = [...code];
  const firstPositions = kind === 'character' ? [0]
    : kind === 'word2' ? [0, 2]
      : kind === 'word3' ? [0, 1, 2] : [0, 1, 2, 3];
  const secondPositions = kind === 'character' ? [1] : kind === 'word2' ? [1, 3] : [];
  for (const position of firstPositions) if (position < chars.length) {
    chars[position] = firstMap.get(chars[position]);
  }
  for (const position of secondPositions) if (position < chars.length) {
    const current = location.get(chars[position]);
    chars[position] = rows[current.rowIndex][columnMap[current.column]];
  }
  return chars.join('');
}

function physicalScore(evaluation, reference, motor, firstPermutation, columnPermutation, contract) {
  const soundKeys = [...contract.soundKeys];
  const firstMap = new Map(soundKeys.map((key, index) => [key, firstPermutation[index]]));
  const sound = soundLocations(contract);
  const weighted = Object.fromEntries(KINDS.map(kind => [kind, 0]));
  const totals = Object.fromEntries(KINDS.map(kind => [kind, 0]));
  const cache = new Map();
  for (const outcome of evaluation.outcomes) {
    const code = transformOutcomeCode(outcome.code, outcome.kind, firstMap,
      columnPermutation, contract, sound);
    let value = cache.get(code);
    if (value === undefined) {
      value = motor(code)?.upperMs;
      if (!Number.isFinite(value)) throw new Error(`motor projection failed for ${code}`);
      cache.set(code, value);
    }
    weighted[outcome.kind] += outcome.weight * value;
    totals[outcome.kind] += outcome.weight;
  }
  const tracks = Object.fromEntries(KINDS.map(kind => {
    const original = evaluation.tracks[kind];
    const motorUpperMs = weighted[kind] / totals[kind];
    return [kind, {...original, motorUpperMs,
      effectiveMs: original.effectiveMs - original.motorUpperMs + motorUpperMs}];
  }));
  return normalizedScore(tracks, reference.tracks);
}

function searchPhysical({base, layouts, sample, motor, reference, contract, steps, restarts, seed,
  allowFirstPermutation}) {
  const evaluation = evaluateLayoutPolicy({
    layout: base,
    layouts,
    data: sample.data,
    words: sample.words,
    motor,
    reference,
    shapeKeysByMeaning: CANONICAL_SHAPE,
    policy: DEFAULT_POLICY,
  });
  const soundKeys = [...contract.soundKeys];
  const identityColumns = [0, 1, 2, 3, 4, 5, 6];
  const columnScores = permutations(identityColumns).map(columns => ({
    first: [...soundKeys],
    columns,
    score: physicalScore(evaluation, reference, motor, soundKeys, columns, contract),
  })).sort((left, right) => left.score - right.score);
  if (!allowFirstPermutation) {
    return {
      evaluation,
      columnExhaustive: {
        count: columnScores.length,
        bestWithSeedFirstPlacement: columnScores[0],
      },
      candidates: columnScores.slice(0, 32),
    };
  }
  const champions = [];
  for (let restart = 0; restart < restarts; restart++) {
    const random = mulberry32(seed + restart * 1009 + base.id.length * 8191);
    const first = restart === 0 ? [...soundKeys] : shuffle(soundKeys, random);
    const columns = restart < Math.min(8, columnScores.length)
      ? [...columnScores[restart].columns]
      : shuffle(identityColumns, random);
    let current = physicalScore(evaluation, reference, motor, first, columns, contract);
    let best = {score: current, first: [...first], columns: [...columns]};
    for (let step = 1; step <= steps; step++) {
      const values = random() < 0.82 ? first : columns;
      const left = Math.floor(random() * values.length);
      let right = Math.floor(random() * values.length);
      if (right === left) right = (right + 1) % values.length;
      [values[left], values[right]] = [values[right], values[left]];
      const proposal = physicalScore(evaluation, reference, motor, first, columns, contract);
      const temperature = 0.12 * (1 - step / steps) + 0.0002;
      if (proposal <= current || random() < Math.exp((current - proposal) / temperature)) {
        current = proposal;
        if (proposal < best.score) best = {score: proposal, first: [...first], columns: [...columns]};
      } else {
        [values[left], values[right]] = [values[right], values[left]];
      }
    }
    champions.push(best);
  }
  champions.push({score: columnScores[0].score, first: [...soundKeys],
    columns: [...columnScores[0].columns]});
  const unique = new Map(champions.map(value =>
    [`${value.first.join('')}/${value.columns.join('')}`, value]));
  return {
    evaluation,
    columnExhaustive: {
      count: columnScores.length,
      bestWithSeedFirstPlacement: columnScores[0],
    },
    candidates: [...unique.values()].sort((left, right) => left.score - right.score),
  };
}

function remappedTracks(evaluation, reference, motor, shapeKeysByMeaning, kinds, sharedCache = null) {
  const weighted = Object.fromEntries(kinds.map(kind => [kind, 0]));
  const totals = Object.fromEntries(kinds.map(kind => [kind, 0]));
  const cache = sharedCache || new Map();
  const entries = evaluation.codeWeights || evaluation.outcomes.map(outcome =>
    [outcome.code, {[outcome.kind]: outcome.weight}]);
  for (const [canonicalCode, weights] of entries) {
    const code = remapAuxiliaryKeys(canonicalCode, shapeKeysByMeaning);
    let value = cache.get(code);
    if (value === undefined) {
      value = motor(code)?.upperMs;
      if (!Number.isFinite(value)) throw new Error(`motor projection failed for ${code}`);
      cache.set(code, value);
    }
    for (const kind of kinds) {
      const weight = weights[kind] || 0;
      weighted[kind] += weight * value;
      totals[kind] += weight;
    }
  }
  return Object.fromEntries(kinds.map(kind => {
    const original = evaluation.tracks[kind];
    const motorUpperMs = weighted[kind] / totals[kind];
    return [kind, {...original, motorUpperMs,
      effectiveMs: original.effectiveMs - original.motorUpperMs + motorUpperMs}];
  }));
}

function resolveEvaluation(rows, kinds, reference, motor) {
  const outcomes = model.resolveCompetition(rows, {motorCost: motor});
  const tracks = Object.fromEntries(kinds.map(kind => [kind,
    reference.summarize(outcomes.filter(value => value.kind === kind))]));
  const weights = new Map();
  for (const outcome of outcomes) {
    if (!weights.has(outcome.code)) weights.set(outcome.code, {});
    const value = weights.get(outcome.code);
    value[outcome.kind] = (value[outcome.kind] || 0) + outcome.weight;
  }
  return {codeWeights: [...weights], tracks};
}

function exhaustiveAuxPolicy({layout, layouts, data, words, motor, reference, maxPasses = 3}) {
  const auxiliaryOrders = permutations([...CANONICAL_SHAPE]).map(value => value.join(''));
  let shapeKeysByMeaning = CANONICAL_SHAPE;
  let champion;
  const passes = [];
  for (let pass = 0; pass < maxPasses; pass++) {
    const policyBest = scoreLayout({layout, layouts, data, words, motor, reference,
      shapeKeysByMeaning});
    // Re-evaluate the winning policy in the canonical auxiliary labeling. A physical
    // auxiliary permutation is a bijective relabeling, so scoreOrder can then compare
    // all 120 orders without resolving candidate competition again.
    const evaluation = evaluateLayoutPolicy({layout, layouts, data, words, motor, reference,
      shapeKeysByMeaning: CANONICAL_SHAPE, policy: policyBest.policy});
    const auxiliaryBest = auxiliaryOrders.map(order =>
      scoreOrder(evaluation, reference, motor, order))
      .sort((left, right) => left.score - right.score)[0];
    passes.push({
      inputShapeKeysByMeaning: shapeKeysByMeaning,
      policy: policyBest.policy,
      policyStageScore: policyBest.score,
      outputShapeKeysByMeaning: auxiliaryBest.shapeKeysByMeaning,
      score: auxiliaryBest.score,
    });
    champion = {...auxiliaryBest, policy: policyBest.policy};
    const stable = shapeKeysByMeaning === auxiliaryBest.shapeKeysByMeaning;
    shapeKeysByMeaning = auxiliaryBest.shapeKeysByMeaning;
    if (stable) break;
  }
  return {
    ...champion,
    exhaustive: {
      auxiliaryOrders: auxiliaryOrders.length,
      wordPoliciesPerPass: 144,
      coordinatePasses: passes.length,
      passes,
      cartesianCombinationCount: 17280,
      cartesianExhaustive: false,
      status: 'complete 144-policy and 120-order coordinate passes; final winner still needs a separate 17,280 Cartesian certification',
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const layoutsFile = path.resolve(args.layouts ||
    path.join(root, 'research/config/ckt-v51-toned-2121-aux-refined-layouts.json'));
  const seedsFile = path.resolve(args.seeds ||
    path.join(root, 'research/config/ckt-v51-toned-2121-seeds.json'));
  const outputLayouts = path.resolve(args['output-layouts'] ||
    path.join(root, 'research/config/ckt-v51-toned-2121-M12-D0V0-finalists.json'));
  const outputReport = path.resolve(args['output-report'] ||
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-M12-D0V0-search.json'));
  const sampleCount = Number(args.sample || 120);
  const resampleCount = Number(args.resample || 1200);
  const steps = Number(args.steps || 3000);
  const restarts = Number(args.restarts || 12);
  const finalistCount = Number(args.finalists || 2);
  const preselectPerOrientation = Number(args['preselect-per-orientation'] || 12);
  const coordinatePasses = Number(args['coordinate-passes'] || 1);
  const allowFirstPermutation = args['allow-first-permutation'] === true ||
    String(args['allow-first-permutation']).toLowerCase() === 'true';
  const seed = Number(args.seed || 120070);

  const data = scorer.loadPayload(html);
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const motor = projectedMotor(data);
  const layouts = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const seedInventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const reference = buildReference({data, words, strokes, motor, snow});
  const contract = buildToned2121Contract();
  const base = layouts.layouts.find(value => value.id === 'HIST-qaopl_nasal_minimal');
  if (!base) throw new Error('M12 base layout missing');
  const orientations = [
    {...base, ruleOrientation: 'nasal an/ang: i -1, u +1 (seed); umlaut +2'},
    mirroredNasalLayout(base, layouts, seedInventory, contract),
  ];
  const sample = sampleCorpus(data, words, sampleCount);
  const firstPass = orientations.map((orientation, index) => ({
    orientation,
    search: searchPhysical({base: orientation, layouts, sample, motor, reference, contract,
      steps, restarts, seed: seed + index * 1000003, allowFirstPermutation}),
  }));
  const rough = firstPass.flatMap(({orientation, search}, orientationIndex) =>
    search.candidates.slice(0, Math.max(preselectPerOrientation, finalistCount * 2))
      .map((candidate, rank) => ({
      orientation,
      orientationIndex,
      rank,
      ...candidate,
      })));
  const resample = sampleCorpus(data, words, resampleCount);
  const resampled = rough.map((candidate, index) => {
    const layout = remapLayout(candidate.orientation, layouts, candidate.first, candidate.columns,
      contract, `D0V0-C${index}`);
    const evaluation = evaluateLayoutPolicy({layout, layouts, data: resample.data,
      words: resample.words, motor, reference, shapeKeysByMeaning: CANONICAL_SHAPE,
      policy: DEFAULT_POLICY});
    return {...candidate, layout, resampleScore: evaluation.score};
  }).sort((left, right) => left.resampleScore - right.resampleScore);
  const selected = [];
  for (const candidate of resampled) {
    if (selected.length >= finalistCount) break;
    selected.push(candidate);
  }
  const finalists = selected.map(value => ({
    id: value.layout.id,
    orientation: value.orientation.ruleOrientation,
    sampleScore: value.score,
    resampleScore: value.resampleScore,
    physicalPermutation: value.layout.physicalPermutation || null,
    result: exhaustiveAuxPolicy({layout: value.layout, layouts, data, words, motor, reference,
      maxPasses: coordinatePasses}),
    layout: value.layout,
  })).sort((left, right) => left.result.score - right.result.score);
  const report = {
    version: 'ckt-v5.1-toned-2121-M12-D0V0-physical-search-1',
    objective: 'minimize full shape-only CKT v5.1 under fixed M12 component partitions',
    memory: {
      soundRuleM: 12,
      toneMergeM: 0,
      toneMergeConvention: 'shared 5-tone-to-3-row contract; optionally report separately as T=3',
    },
    guard: {
      deltaD: 0,
      deltaV: 0,
      semantics: allowFirstPermutation
        ? 'no component membership changes; whole first-group permutations enabled explicitly'
        : 'M12 first-key placement frozen; rhyme-family membership frozen; whole rhyme-column permutations and the i/u nasal-rule mirror are allowed',
    },
    search: {
      orientations: orientations.map(value => value.ruleOrientation),
      rhymeColumnPermutationsPerOrientation: 5040,
      rhymeColumnCoverage: 'exhaustive with seed first-group placement in phase 1',
      firstGroupPermutationCoverage: allowFirstPermutation
        ? `exploratory deterministic simulated annealing; ${restarts} restarts x ${steps} steps per orientation`
        : 'frozen at the audited M12 placement to enforce deltaD=0',
      sampleRowsPerTrack: sampleCount,
      resampleRowsPerTrack: resampleCount,
      preselectedPerOrientation: preselectPerOrientation,
      fullFinalists: finalists.length,
      coordinatePasses,
      finalCoordinateAudit: 'complete 144-policy and 120-order coordinate passes, alternated to stability or three passes',
      pendingFinalCertification: '17,280 Cartesian auxiliary-order x word-policy combinations for the final winner only',
      globalOptimality: allowFirstPermutation
        ? 'not proven because 21! first-group physical permutations are searched heuristically'
        : 'rhyme columns are exhaustive; i/u orientation is exhaustive over the two admitted rules; final auxiliary/policy Cartesian certification remains pending',
    },
    historicalBaseline: {
      id: base.id,
      score: 9.74594565887161,
      provenance: 'prior complete 144-policy search followed by complete 120-order search',
    },
    phase1: firstPass.map(({orientation, search}) => ({
      orientation: orientation.ruleOrientation,
      columnExhaustive: search.columnExhaustive,
      annealedCandidates: search.candidates.length,
      bestSampleScore: search.candidates[0].score,
    })),
    finalists: finalists.map(({layout, ...value}) => value),
  };
  const output = {
    ...layouts,
    version: 'ckt-v5.1-toned-2121-M12-D0V0-finalists-1',
    layouts: finalists.map(value => ({
      ...value.layout,
      recommendedShapeKeysByMeaning: value.result.shapeKeysByMeaning,
      recommendedToneKeysByTone: value.result.toneKeysByTone,
      recommendedPolicy: value.result.policy,
    })),
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  exhaustiveAuxPolicy,
  mirroredNasalLayout,
  remapLayout,
  transformOutcomeCode,
};
