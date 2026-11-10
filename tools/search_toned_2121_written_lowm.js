#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scorer = require('./score_completion_ckt_v4.js');
const {splitPinyin, HEADS, FINALS} = require('./ckt_v4_scheme_fixture.js');
const {
  buildReference,
  evaluateLayoutPolicy,
  projectedMotor,
} = require('./score_toned_2121_ckt_v51.js');
const {buildExposure} = require('./analyze_toned_2121_weighted_components.js');
const {buildToned2121Contract, rowForTone} = require('./toned_2121_contract.js');

const SHAPE_KEYS_BY_MEANING = 'QOLAP';
const WORD_POLICY = Object.freeze({word2: '21', word3: '213', word4: '23'});
const LITERAL_INITIALS = Object.freeze(['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k',
  'm', 'n', 'r', 's', 't', 'x', 'z']);
const SPECIAL_INITIALS = Object.freeze(['p', 'q', 'l', 'zh', 'ch', 'sh']);
const ZERO_INITIALS = Object.freeze(['A', 'E', 'O', 'W', 'Y', 'YU']);
const BASE_FINAL_GROUPS = Object.freeze({
  a: 0, ai: 1, an: 2, ang: 3, ao: 0,
  e: 4, ei: 4, en: 2, eng: 1, er: 4,
  i: 6, ia: 0, ian: 2, iang: 3, iao: 0, ie: 4, in: 2, ing: 3,
  iong: 5, iu: 5,
  o: 5, ong: 5, ou: 5,
  u: 6, ua: 0, uai: 1, uan: 2, uang: 3, ui: 4, un: 2, uo: 5,
  v: 6, van: 2, ve: 4, vn: 2,
});
const BASE_FINAL_RULES = Object.freeze([
  {group: 1, roots: ['a', 'ao'], finals: ['a', 'ao', 'ia', 'iao', 'ua']},
  {group: 2, roots: ['ai', 'eng'], finals: ['ai', 'eng', 'uai']},
  {group: 3, roots: ['an', 'en', 'n'], finals: ['an', 'en', 'ian', 'in', 'uan', 'un', 'van', 'vn']},
  {group: 4, roots: ['ang', 'ng'], finals: ['ang', 'iang', 'ing', 'uang']},
  {group: 5, roots: ['e', 'ei', 'er'], finals: ['e', 'ei', 'er', 'ie', 'ui', 've']},
  {group: 6, roots: ['o', 'ong', 'ou'], finals: ['iong', 'iu', 'o', 'ong', 'ou', 'uo']},
  {group: 7, roots: ['empty/apical'], finals: ['i', 'u', 'v']},
]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith('--')) continue;
    args[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--')
      ? argv[++index] : true;
  }
  return args;
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

function writtenPair(pinyin) {
  const [head, final] = splitPinyin(pinyin);
  if (head === 0xff || final === 0xff) throw new Error(`written split failed: ${pinyin}`);
  return [HEADS[head], FINALS[final]];
}

function makeInventory(bundle, exposure, contract) {
  const firstComponents = new Set();
  const finalComponents = new Set();
  const rows = [contract.soundKeysByRow.upper, contract.soundKeysByRow.home,
    contract.soundKeysByRow.lower];
  const rowIndex = new Map(contract.toneRows.map((value, index) => [value, index]));
  const raw = bundle.tokenKeys.map((token, index) => {
    const match = token.match(/^([a-z]+)([1-5])$/);
    if (!match) throw new Error(`invalid token: ${token}`);
    const [first, final] = writtenPair(match[1]);
    firstComponents.add(first);
    finalComponents.add(final);
    return {
      index,
      token,
      pinyin: match[1],
      tone: Number(match[2]),
      first,
      final,
      row: rowIndex.get(rowForTone(Number(match[2]))),
      weight: exposure.exposure.get(token)?.total || 0,
    };
  });
  const first = [...firstComponents].sort();
  const finals = [...finalComponents].sort();
  if (first.length !== 27 || finals.length !== 35) {
    throw new Error(`unexpected written inventory ${first.length}x${finals.length}`);
  }
  const firstIndex = new Map(first.map((value, index) => [value, index]));
  const finalIndex = new Map(finals.map((value, index) => [value, index]));
  const records = raw.map(value => ({
    ...value,
    firstAt: firstIndex.get(value.first),
    finalAt: finalIndex.get(value.final),
  }));
  return {first, finals, records, rows};
}

function defaultState(inventory, contract, random, randomFinals = false,
  initialFinalGroups = null) {
  const soundKeys = [...contract.soundKeys];
  const soundIndex = new Map(soundKeys.map((value, index) => [value, index]));
  const firstKeys = new Int8Array(inventory.first.length).fill(-1);
  for (const initial of LITERAL_INITIALS) {
    firstKeys[inventory.first.indexOf(initial)] = soundIndex.get(initial.toUpperCase());
  }
  const occupiedLiteral = new Set(LITERAL_INITIALS.map(value => value.toUpperCase()));
  const remaining = soundKeys.filter(value => !occupiedLiteral.has(value));
  const specialKeys = shuffle(remaining, random);
  SPECIAL_INITIALS.forEach((value, index) => {
    firstKeys[inventory.first.indexOf(value)] = soundIndex.get(specialKeys[index]);
  });
  for (const value of ZERO_INITIALS) {
    firstKeys[inventory.first.indexOf(value)] = Math.floor(random() * soundKeys.length);
  }
  if ([...firstKeys].some(value => value < 0)) throw new Error('incomplete first mapping');
  const finalGroups = Int8Array.from(inventory.finals.map(value => {
    if (initialFinalGroups && Number.isInteger(initialFinalGroups[value])) {
      return initialFinalGroups[value];
    }
    return randomFinals ? Math.floor(random() * 7) : BASE_FINAL_GROUPS[value];
  }));
  if ([...finalGroups].some(value => !Number.isInteger(value))) {
    throw new Error('incomplete base final grouping');
  }
  return {
    firstKeys,
    finalGroups,
    columns: Int8Array.from(shuffle([0, 1, 2, 3, 4, 5, 6], random)),
  };
}

function cloneState(state) {
  return {
    firstKeys: Int8Array.from(state.firstKeys),
    finalGroups: Int8Array.from(state.finalGroups),
    columns: Int8Array.from(state.columns),
  };
}

function finalExceptionCount(state, inventory) {
  let count = 0;
  for (let index = 0; index < inventory.finals.length; index++) {
    if (state.finalGroups[index] !== BASE_FINAL_GROUPS[inventory.finals[index]]) count++;
  }
  return count;
}

function stateKey(state) {
  return `${[...state.firstKeys].join(',')}|${[...state.finalGroups].join(',')}|${[...state.columns].join(',')}`;
}

function buildFastScorer(inventory, contract, motor, exposureUnits, motorWeight) {
  const soundKeys = [...contract.soundKeys];
  const secondKeys = inventory.rows.flatMap(row => [...row]);
  const motorMs = soundKeys.map(first => secondKeys.map(second => {
    const value = motor(first + second);
    if (!value) throw new Error(`motor projection failed for ${first}${second}`);
    return value.upperMs;
  }));
  const stamp = new Int32Array(441);
  const maximum = new Float64Array(441);
  let generation = 0;
  return state => {
    generation++;
    let occupied = 0;
    let top1Weight = 0;
    let weightedMotor = 0;
    for (const record of inventory.records) {
      const first = state.firstKeys[record.firstAt];
      const group = state.finalGroups[record.finalAt];
      const bucket = first * 21 + record.row * 7 + group;
      if (stamp[bucket] !== generation) {
        stamp[bucket] = generation;
        maximum[bucket] = record.weight;
        occupied++;
        top1Weight += record.weight;
      } else if (record.weight > maximum[bucket]) {
        top1Weight += record.weight - maximum[bucket];
        maximum[bucket] = record.weight;
      }
      const second = record.row * 7 + state.columns[group];
      weightedMotor += record.weight * motorMs[first][second];
    }
    const top1 = top1Weight / exposureUnits;
    const meanMotorMs = weightedMotor / exposureUnits;
    const loss = (inventory.records.length - occupied) + 441 * (1 - top1) +
      motorWeight * meanMotorMs;
    return {loss, occupiedBuckets: occupied, collisionExcess: inventory.records.length - occupied,
      weightedTop1: top1, meanMotorMs};
  };
}

function mutate(state, inventory, contract, random, exceptionBudget) {
  const kind = Math.floor(random() * 4);
  if (kind === 0) {
    const positions = SPECIAL_INITIALS.map(value => inventory.first.indexOf(value));
    const left = positions[Math.floor(random() * positions.length)];
    let right = positions[Math.floor(random() * positions.length)];
    if (right === left) right = positions[(positions.indexOf(left) + 1) % positions.length];
    [state.firstKeys[left], state.firstKeys[right]] = [state.firstKeys[right], state.firstKeys[left]];
    return () => [state.firstKeys[left], state.firstKeys[right]] =
      [state.firstKeys[right], state.firstKeys[left]];
  }
  if (kind === 1) {
    const at = inventory.first.indexOf(ZERO_INITIALS[Math.floor(random() * ZERO_INITIALS.length)]);
    const before = state.firstKeys[at];
    let after = Math.floor(random() * contract.soundKeys.length);
    if (after === before) after = (after + 1) % contract.soundKeys.length;
    state.firstKeys[at] = after;
    return () => { state.firstKeys[at] = before; };
  }
  if (kind === 2) {
    const left = Math.floor(random() * 7);
    let right = Math.floor(random() * 7);
    if (right === left) right = (right + 1) % 7;
    [state.columns[left], state.columns[right]] = [state.columns[right], state.columns[left]];
    return () => [state.columns[left], state.columns[right]] =
      [state.columns[right], state.columns[left]];
  }
  const at = Math.floor(random() * inventory.finals.length);
  const before = state.finalGroups[at];
  let after = Math.floor(random() * 7);
  if (after === before) after = (after + 1) % 7;
  const base = BASE_FINAL_GROUPS[inventory.finals[at]];
  const exceptions = finalExceptionCount(state, inventory);
  if (before === base && after !== base && exceptions >= exceptionBudget) return () => {};
  state.finalGroups[at] = after;
  return () => { state.finalGroups[at] = before; };
}

function anneal({inventory, contract, score, exceptionBudget, steps, restarts, seed,
  retainPerBudget, unrestrictedSeedGroups = null}) {
  const retained = new Map();
  function retain(state, metrics) {
    const key = stateKey(state);
    const prior = retained.get(key);
    if (!prior || metrics.loss < prior.metrics.loss) retained.set(key, {
      state: cloneState(state), metrics: {...metrics},
      finalExceptions: finalExceptionCount(state, inventory),
    });
    if (retained.size > retainPerBudget * 8) {
      const best = [...retained].sort((left, right) => left[1].metrics.loss - right[1].metrics.loss)
        .slice(0, retainPerBudget * 4);
      retained.clear();
      for (const [candidateKey, value] of best) retained.set(candidateKey, value);
    }
  }
  for (let restart = 0; restart < restarts; restart++) {
    const random = mulberry32(seed + exceptionBudget * 65537 + restart * 1009);
    const useUnrestrictedSeed = exceptionBudget >= inventory.finals.length &&
      unrestrictedSeedGroups && restart % 2 === 0;
    const state = defaultState(inventory, contract, random,
      exceptionBudget >= inventory.finals.length && !useUnrestrictedSeed,
      useUnrestrictedSeed ? unrestrictedSeedGroups : null);
    let current = score(state);
    retain(state, current);
    for (let step = 1; step <= steps; step++) {
      const undo = mutate(state, inventory, contract, random, exceptionBudget);
      const proposal = score(state);
      const temperature = 8 * (1 - step / steps) + 0.02;
      if (proposal.loss <= current.loss ||
          random() < Math.exp((current.loss - proposal.loss) / temperature)) {
        current = proposal;
        retain(state, current);
      } else undo();
    }
  }
  return [...retained.values()].sort((left, right) => left.metrics.loss - right.metrics.loss)
    .slice(0, retainPerBudget);
}

function stateToLayout(state, inventory, contract, bundle, id, metadata = {}) {
  const soundKeys = [...contract.soundKeys];
  const firstKeyByComponent = Object.fromEntries(inventory.first.map((value, index) =>
    [value, soundKeys[state.firstKeys[index]]]));
  const finalGroupByComponent = Object.fromEntries(inventory.finals.map((value, index) =>
    [value, state.finalGroups[index] + 1]));
  const finalPhysicalKeys = Object.fromEntries(inventory.finals.map((value, index) => {
    const column = state.columns[state.finalGroups[index]];
    return [value, inventory.rows.map(row => row[column]).join('')];
  }));
  const tonedCodes = new Array(bundle.tokenKeys.length);
  for (const record of inventory.records) {
    const column = state.columns[state.finalGroups[record.finalAt]];
    tonedCodes[record.index] = soundKeys[state.firstKeys[record.firstAt]] +
      inventory.rows[record.row][column];
  }
  if (tonedCodes.some(value => !value)) throw new Error('incomplete toned codes');
  return {
    id,
    factorization: 'written-onset-written-final',
    origin: 'written-low-memory-D0-search',
    tonedCodes,
    firstComponentKeys: firstKeyByComponent,
    secondComponentColumns: finalGroupByComponent,
    secondComponentPhysicalKeys: finalPhysicalKeys,
    physicalColumnsByLogicalGroup: [...state.columns].map(value => value + 1),
    ...metadata,
  };
}

function memoryVector(layout, inventory) {
  const firstEntries = Object.entries(layout.firstComponentKeys);
  const nonLiteral = firstEntries.filter(([component, key]) =>
    !contractLiteral(component, key)).map(([component, key]) => `${component}->${key}`);
  const finalExceptions = Object.entries(layout.secondComponentColumns)
    .filter(([final, group]) => group - 1 !== BASE_FINAL_GROUPS[final])
    .map(([final, group]) => ({final, from: BASE_FINAL_GROUPS[final] + 1, to: group}));
  return {
    rawAssociationEntries: {first: inventory.first.length, second: inventory.finals.length,
      total: inventory.first.length + inventory.finals.length},
    nonLiteralFirstAssociationCount: nonLiteral.length,
    nonLiteralFirstAssociations: nonLiteral,
    baseRhymeClassStatementCount: BASE_FINAL_RULES.length,
    fullFinalExceptionCount: finalExceptions.length,
    fullFinalExceptions: finalExceptions,
    toneRowGroupCount: 3,
    caveat: 'Vector audit only: raw entries and compressed rule statements are not added into a single psychometric M.',
  };
}

function contractLiteral(component, key) {
  return component.length === 1 && component.toUpperCase() === key;
}

function noFlyingAudit(layout, inventory) {
  const first = new Map();
  const second = new Map();
  for (const record of inventory.records) {
    const code = layout.tonedCodes[record.index];
    if (!first.has(record.first)) first.set(record.first, new Set());
    first.get(record.first).add(code[0]);
    const finalTone = `${record.final}/${record.tone}`;
    if (!second.has(finalTone)) second.set(finalTone, new Set());
    second.get(finalTone).add(code[1]);
  }
  const flying = source => [...source].filter(([, keys]) => keys.size !== 1)
    .map(([family, keys]) => ({family, keys: [...keys]}));
  return {
    writtenInitialFamilyCount: first.size,
    tonedWrittenFinalFamilyCount: second.size,
    writtenInitialFlying: flying(first),
    tonedWrittenFinalFlying: flying(second),
    ordinaryLiteralInitialsFixed: LITERAL_INITIALS.every(value =>
      layout.firstComponentKeys[value] === value.toUpperCase()),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const layoutsFile = path.resolve(args.layouts ||
    path.join(root, 'research/config/ckt-v51-toned-2121-layouts.json'));
  const outputLayouts = path.resolve(args['output-layouts'] ||
    path.join(root, 'research/config/ckt-v51-toned-2121-written-lowm-finalists.json'));
  const outputReport = path.resolve(args['output-report'] ||
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-written-lowm-search.json'));
  const steps = Number(args.steps || 10000);
  const restarts = Number(args.restarts || 8);
  const retainPerBudget = Number(args.retain || 10);
  const sampleCount = Number(args.sample || 900);
  const finalistsPerBudget = Number(args.finalists || 3);
  const seed = Number(args.seed || 21212735);
  const motorWeight = Number(args['motor-weight'] || 0.3);
  const budgets = String(args.budgets || '0,1,2,3,4,6,8,12,13,14,15,16,18,20,24,35')
    .split(',').map(Number).filter(Number.isFinite);

  const data = scorer.loadPayload(html);
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const motor = projectedMotor(data);
  const bundle = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const contract = buildToned2121Contract();
  const exposure = buildExposure(data, words, bundle);
  const inventory = makeInventory(bundle, exposure, contract);
  const fastScore = buildFastScorer(inventory, contract, motor, exposure.exposureUnits, motorWeight);
  const reference = buildReference({data, words, strokes, motor, snow});
  const sample = sampleCorpus(data, words, sampleCount);

  const priorWritten = bundle.layouts.find(value => value.id === 'SEARCH-written-onset-written-final');
  const unrestrictedSeedGroups = priorWritten ? Object.fromEntries(inventory.finals.map(final =>
    [final, Number(priorWritten.secondComponentColumns[final])])) : null;
  const lanes = budgets.map(budget => ({
    budget,
    candidates: anneal({inventory, contract, score: fastScore, exceptionBudget: budget,
      steps, restarts, seed, retainPerBudget, unrestrictedSeedGroups}),
  }));
  const sampled = lanes.flatMap(lane => lane.candidates.map((candidate, index) => {
    const layout = stateToLayout(candidate.state, inventory, contract, bundle,
      `WRITTEN-D0-E${candidate.finalExceptions}-B${lane.budget}-P${index}`, {
        finalExceptionBudget: lane.budget,
        fastMetrics: candidate.metrics,
      });
    const evaluation = evaluateLayoutPolicy({layout, layouts: bundle,
      data: sample.data, words: sample.words, motor, reference,
      shapeKeysByMeaning: SHAPE_KEYS_BY_MEANING, policy: WORD_POLICY});
    return {lane: lane.budget, layout, sampleScore: evaluation.score};
  }));
  const shortlist = budgets.flatMap(budget => sampled.filter(value => value.lane === budget)
    .sort((left, right) => left.sampleScore - right.sampleScore).slice(0, finalistsPerBudget));
  const full = shortlist.map(value => {
    const {outcomes: _discarded, ...evaluation} = evaluateLayoutPolicy({layout: value.layout,
      layouts: bundle, data, words, motor, reference,
      shapeKeysByMeaning: SHAPE_KEYS_BY_MEANING, policy: WORD_POLICY});
    const memory = memoryVector(value.layout, inventory);
    return {...value, evaluation, memory, flyingAudit: noFlyingAudit(value.layout, inventory)};
  }).sort((left, right) => left.evaluation.score - right.evaluation.score);

  let priorComparison = null;
  if (priorWritten) {
    const {outcomes: _discarded, ...evaluation} = evaluateLayoutPolicy({layout: priorWritten,
      layouts: bundle, data, words, motor, reference,
      shapeKeysByMeaning: SHAPE_KEYS_BY_MEANING, policy: WORD_POLICY});
    priorComparison = {id: priorWritten.id, score: evaluation.score,
      constraint: 'unrestricted arbitrary 27x35 partition; M-unrated'};
  }
  const exactBest = [...new Set(full.map(value => value.memory.fullFinalExceptionCount))]
    .sort((left, right) => left - right).map(exceptions => full
      .filter(value => value.memory.fullFinalExceptionCount === exceptions)
      .sort((left, right) => left.evaluation.score - right.evaluation.score)[0]);
  const cumulativeFrontier = exactBest.map(value => ({
    maximumExceptions: value.memory.fullFinalExceptionCount,
    best: exactBest.filter(candidate => candidate.memory.fullFinalExceptionCount <=
      value.memory.fullFinalExceptionCount)
      .sort((left, right) => left.evaluation.score - right.evaluation.score)[0],
  }));
  const summarizeFrontier = value => ({
    id: value.layout.id,
    fullFinalExceptionCount: value.memory.fullFinalExceptionCount,
    score: value.evaluation.score,
  });
  const report = {
    version: 'ckt-v5.1-toned-2121-written-lowm-D0-search-1',
    objective: 'written onset | written final under literal ordinary-initial D=0; CKT v5.1 primary',
    componentCounts: {first: inventory.first.length, second: inventory.finals.length,
      rawProduct: inventory.first.length * inventory.finals.length, legalCommonPinyin: 399},
    constraints: {
      literalInitialsFixed: LITERAL_INITIALS,
      specialInitialsPermutedOverRemainingKeys: SPECIAL_INITIALS,
      zeroInitialFamiliesSingleKey: ZERO_INITIALS,
      atomicWrittenInitialFlyingAllowed: false,
      ordinaryInitialFlyingAllowed: false,
      toneRows: contract.primaryToneRowAssignment,
      neutralTonePolicy: contract.neutralTonePolicy,
    },
    memoryDefinition: {
      reporting: 'vector, not a single M',
      baseFinalRules: BASE_FINAL_RULES,
      rawAssociationEntries: {first: inventory.first.length, second: inventory.finals.length,
        total: inventory.first.length + inventory.finals.length},
      note: 'A final exception is one complete written-final family moved away from the seven-rule base; physical key and column permutations are not counted as exceptions.',
    },
    fixedEvaluation: {shapeKeysByMeaning: SHAPE_KEYS_BY_MEANING, wordPolicy: WORD_POLICY},
    search: {algorithm: 'deterministic simulated annealing proxy -> sampled CKT rerank -> full CKT',
      steps, restarts, retainPerBudget, sampleRowsPerTrack: sampleCount,
      finalistsPerBudget, seed, motorWeight, exceptionBudgets: budgets,
      globalOptimality: 'not proven; finite stochastic search'},
    priorUnrestrictedComparison: priorComparison,
    bestByExactExceptionCount: exactBest.map(summarizeFrontier),
    cumulativeExceptionFrontier: cumulativeFrontier.map(value => ({
      maximumExceptions: value.maximumExceptions,
      best: summarizeFrontier(value.best),
    })),
    finalists: full.map(value => ({
      id: value.layout.id,
      finalExceptionBudget: value.lane,
      sampleScore: value.sampleScore,
      score: value.evaluation.score,
      fastMetrics: value.layout.fastMetrics,
      memory: value.memory,
      flyingAudit: value.flyingAudit,
      firstComponentKeys: value.layout.firstComponentKeys,
      secondComponentColumns: value.layout.secondComponentColumns,
      secondComponentPhysicalKeys: value.layout.secondComponentPhysicalKeys,
      physicalColumnsByLogicalGroup: value.layout.physicalColumnsByLogicalGroup,
      tracks: value.evaluation.tracks,
    })),
  };
  const output = {
    version: 'ckt-v5.1-toned-2121-written-lowm-finalists-1',
    contract: bundle.contract,
    tokenKeys: bundle.tokenKeys,
    layouts: full.map(value => ({
      ...value.layout,
      recommendedShapeKeysByMeaning: value.evaluation.shapeKeysByMeaning,
      recommendedToneKeysByTone: value.evaluation.toneKeysByTone,
      recommendedPolicy: value.evaluation.policy,
      memoryVector: value.memory,
      flyingAudit: value.flyingAudit,
      fullCktV51: value.evaluation.score,
    })),
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({priorComparison, finalists: report.finalists.map(value => ({
    id: value.id, budget: value.finalExceptionBudget, exceptions: value.memory.fullFinalExceptionCount,
    score: value.score, firstNonLiteral: value.memory.nonLiteralFirstAssociationCount,
  }))}, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  BASE_FINAL_GROUPS,
  BASE_FINAL_RULES,
  LITERAL_INITIALS,
  SPECIAL_INITIALS,
  ZERO_INITIALS,
  contractLiteral,
  writtenPair,
};
