#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scorer = require('./score_completion_ckt_v4.js');
const {
  buildReference,
  evaluateLayoutPolicy,
  projectedMotor,
} = require('./score_toned_2121_ckt_v51.js');
const {scoreOrder} = require('./optimize_toned_2121_aux_order.js');
const {buildToned2121Contract} = require('./toned_2121_contract.js');

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

function buildPinyinFamilies(seedInventory) {
  return new Map(seedInventory.decomposition.map(row => [row.pinyin, {
    first: row.shengjie,
    second: row.rhymeBody,
  }]));
}

function applyFirstFamilyMove(base, tokenKeys, families, family, key) {
  return base.tonedCodes.map((code, index) => {
    const pinyin = tokenKeys[index].replace(/[1-5]$/, '');
    return families.get(pinyin).first === family ? key + code[1] : code;
  });
}

function applySecondFamilyShift(base, tokenKeys, families, family, delta, contract) {
  const rows = Object.values(contract.soundKeysByRow);
  const location = new Map(rows.flatMap((row, rowIndex) => [...row].map((key, column) =>
    [key, {rowIndex, column}])));
  return base.tonedCodes.map((code, index) => {
    const pinyin = tokenKeys[index].replace(/[1-5]$/, '');
    if (families.get(pinyin).second !== family) return code;
    const current = location.get(code[1]);
    if (!current) throw new Error(`second sound key ${code[1]} is outside the 3x7 domain`);
    const column = (current.column + delta + 7) % 7;
    return code[0] + rows[current.rowIndex][column];
  });
}

function guardRecord(base, deltaD, deltaV) {
  const seedM = Number(base.guard?.seedM ?? base.declaredMemory?.M);
  if (!Number.isFinite(seedM)) throw new Error(`${base.id} has no audited seed M`);
  const inheritedD = Number(base.guard?.deltaD || 0);
  const inheritedV = Number(base.guard?.deltaV || 0);
  return {
    seedM,
    deltaD: inheritedD + deltaD,
    deltaV: inheritedV + deltaV,
    MGuard: seedM + inheritedD + deltaD + inheritedV + deltaV,
    definition: 'conservative seed-relative guard: MGuard = seedM + deltaD + deltaV',
  };
}

function explicitMemoryAudit(base, moveHistory) {
  const seed = base.inheritedSeedMemory || base.declaredMemory;
  if (!seed || !Number.isFinite(Number(seed.M))) return null;
  const firstMoves = moveHistory.filter(value => value.kind === 'first-family').length;
  const secondMoves = moveHistory.filter(value => value.kind === 'second-family-shift').length;
  const audit = {
    globalMigrations: Number(seed.globalMigrations || 0),
    shengjieExceptions: Number(seed.shengjieExceptions || 0) + firstMoves,
    rhymeFamilyDeviations: Number(seed.rhymeFamilyDeviations || 0) + secondMoves,
    uniformRules: Number(seed.uniformRules || 0),
    status: 'exact count for this explicit additive encoding; not a proof of globally minimal M',
  };
  audit.M = audit.globalMigrations + audit.shengjieExceptions +
    audit.rhymeFamilyDeviations + audit.uniformRules;
  return audit;
}

function candidate(base, id, tonedCodes, guard, move) {
  const moveHistory = move.kind === 'base' ? [...(base.moveHistory || [])] : [
    ...(base.moveHistory || (base.move && base.move.kind !== 'base' ? [base.move] : [])),
    move,
  ];
  return {
    ...base,
    id,
    origin: 'seed-relative-MDV-constrained-search',
    parentId: base.id,
    inheritedSeedMemory: base.inheritedSeedMemory || base.declaredMemory,
    declaredMemory: move.kind === 'base' ? base.declaredMemory : null,
    tonedCodes,
    guard,
    move,
    moveHistory,
    explicitMemoryAudit: explicitMemoryAudit(base, moveHistory),
  };
}

function enumerateSingleMoves(base, layouts, seedInventory, contract, guards) {
  const tokenKeys = layouts.tokenKeys;
  const families = buildPinyinFamilies(seedInventory);
  const firstFamilies = [...new Set(seedInventory.decomposition.map(row => row.shengjie))].sort();
  const secondFamilies = [...new Set(seedInventory.decomposition.map(row => row.rhymeBody))].sort();
  const candidates = [candidate(base, `${base.id}-BASE`, [...base.tonedCodes],
    guardRecord(base, 0, 0), {kind: 'base'})];
  const usedFirst = new Set((base.moveHistory || [base.move]).filter(Boolean)
    .filter(value => value.kind === 'first-family').map(value => value.family));
  const usedSecond = new Set((base.moveHistory || [base.move]).filter(Boolean)
    .filter(value => value.kind === 'second-family-shift').map(value => value.family));
  const nextD = Number(base.guard?.deltaD || 0) + 1;
  const nextV = Number(base.guard?.deltaV || 0) + 1;
  if (nextD <= guards.maxDeltaD && guardRecord(base, 1, 0).MGuard <= guards.maxM) {
    for (const family of firstFamilies) for (const key of contract.soundKeys) {
      if (usedFirst.has(family)) continue;
      const tonedCodes = applyFirstFamilyMove(base, tokenKeys, families, family, key);
      if (tonedCodes.every((code, index) => code === base.tonedCodes[index])) continue;
      candidates.push(candidate(base, `${base.id}-D1-${family}-${key}`, tonedCodes,
        guardRecord(base, 1, 0), {kind: 'first-family', family, key}));
    }
  }
  if (nextV <= guards.maxDeltaV && guardRecord(base, 0, 1).MGuard <= guards.maxM) {
    for (const family of secondFamilies) for (let delta = 1; delta < 7; delta++) {
      if (usedSecond.has(family)) continue;
      candidates.push(candidate(base, `${base.id}-V1-${family}-${delta}`,
        applySecondFamilyShift(base, tokenKeys, families, family, delta, contract),
        guardRecord(base, 0, 1), {kind: 'second-family-shift', family, delta}));
    }
  }
  return candidates;
}

function occupiedAudit(candidate, layouts, seedInventory) {
  const audit = new Set(seedInventory.auditTokenKeys);
  return new Set(layouts.tokenKeys.flatMap((key, index) =>
    audit.has(key) ? [candidate.tonedCodes[index]] : [])).size;
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
  const priorFile = path.resolve(args.prior ||
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-ckt-search.json'));
  const outputLayouts = path.resolve(args['output-layouts'] ||
    path.join(root, 'research/config/ckt-v51-toned-2121-constrained-finalists.json'));
  const outputReport = path.resolve(args['output-report'] ||
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-constrained-search.json'));
  const baseId = String(args.id || 'HIST-qaopl_nasal_minimal');
  const sampleCount = Number(args.sample || 400);
  const resampleCount = Number(args.resample || 1500);
  const preselectCount = Number(args.preselect || 48);
  const finalistCount = Number(args.finalists || 6);
  const guards = {
    maxM: Number(args['max-m'] || 15),
    maxDeltaD: Number(args['max-d'] || 2),
    maxDeltaV: Number(args['max-v'] || 2),
  };

  const data = scorer.loadPayload(html);
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const motor = projectedMotor(data);
  const layouts = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const seedInventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const prior = JSON.parse(fs.readFileSync(priorFile, 'utf8'));
  const base = layouts.layouts.find(value => value.id === baseId);
  if (!base) throw new Error(`unknown base layout ${baseId}`);
  if (base.factorization !== 'shengjie-rhyme-body') {
    throw new Error('first constrained search supports the shengjie-rhyme-body family only');
  }
  const explicitPolicy = args.policy ? String(args.policy).split('/') : null;
  const policy = explicitPolicy ? {
    word2: explicitPolicy[0], word3: explicitPolicy[1], word4: explicitPolicy[2],
  } : prior.results.find(value => value.id === baseId)?.policy;
  if (!policy) throw new Error(`prior policy missing for ${baseId}`);
  const reference = buildReference({data, words, strokes, motor, snow});
  const contract = buildToned2121Contract();
  const candidates = enumerateSingleMoves(base, layouts, seedInventory, contract, guards);
  const sampled = sampleCorpus(data, words, sampleCount);
  const sampleReference = {...reference, tracks: reference.tracks};
  const sampleScores = [];
  for (const layout of candidates) {
    const value = evaluateLayoutPolicy({
      layout,
      layouts,
      data: sampled.data,
      words: sampled.words,
      motor,
      reference: sampleReference,
      shapeKeysByMeaning: base.recommendedShapeKeysByMeaning || CANONICAL_SHAPE_KEYS_BY_MEANING,
      policy,
    });
    sampleScores.push({layout, score: value.score});
  }
  sampleScores.sort((left, right) => left.score - right.score);
  const baseCandidate = sampleScores.find(value => value.layout.move.kind === 'base');
  const firstMoves = sampleScores.filter(value => value.layout.move.kind === 'first-family')
    .slice(0, Math.ceil(preselectCount * 2 / 3));
  const secondMoves = sampleScores.filter(value => value.layout.move.kind === 'second-family-shift')
    .slice(0, Math.floor(preselectCount / 3));
  const preselected = [...firstMoves, ...secondMoves];
  if (!preselected.includes(baseCandidate)) preselected.push(baseCandidate);
  const resampled = sampleCorpus(data, words, resampleCount);
  const resampleScores = preselected.map(selected => ({
    layout: selected.layout,
    firstSampleScore: selected.score,
    score: evaluateLayoutPolicy({
      layout: selected.layout,
      layouts,
      data: resampled.data,
      words: resampled.words,
      motor,
      reference: sampleReference,
      shapeKeysByMeaning: base.recommendedShapeKeysByMeaning || CANONICAL_SHAPE_KEYS_BY_MEANING,
      policy,
    }).score,
  })).sort((left, right) => left.score - right.score);
  const resampledBase = resampleScores.find(value => value.layout.move.kind === 'base');
  const shortlist = resampleScores.slice(0, finalistCount);
  if (!shortlist.includes(resampledBase)) shortlist.push(resampledBase);

  const orders = permutations([...CANONICAL_SHAPE_KEYS_BY_MEANING]);
  const finalists = [];
  for (const selected of shortlist) {
    const evaluation = evaluateLayoutPolicy({
      layout: selected.layout,
      layouts,
      data,
      words,
      motor,
      reference,
      shapeKeysByMeaning: CANONICAL_SHAPE_KEYS_BY_MEANING,
      policy,
    });
    const bestOrder = orders.map(order => scoreOrder(evaluation, reference, motor, order))
      .sort((left, right) => left.score - right.score)[0];
    const layout = {
      ...selected.layout,
      recommendedShapeKeysByMeaning: bestOrder.shapeKeysByMeaning,
      recommendedToneKeysByTone: bestOrder.toneKeysByTone,
    };
    finalists.push({
      id: layout.id,
      parentId: layout.parentId,
      move: layout.move,
      guard: layout.guard,
      occupiedBucketsAuditOnly: occupiedAudit(layout, layouts, seedInventory),
      sampleScore: selected.score,
      firstSampleScore: selected.firstSampleScore,
      fixedPolicyCktV51: bestOrder.score,
      policy,
      shapeKeysByMeaning: bestOrder.shapeKeysByMeaning,
      layout,
    });
  }
  finalists.sort((left, right) => left.fixedPolicyCktV51 - right.fixedPolicyCktV51);
  const output = {
    ...layouts,
    version: 'ckt-v5.1-toned-2121-MDV-constrained-finalists-1',
    layouts: finalists.map(value => value.layout),
  };
  const report = {
    version: 'shape-only-ckt-v5.1-toned-2121-MDV-constrained-search-1',
    objective: 'minimize shape-only CKT v5.1; occupied buckets are audit-only',
    baseId,
    policy,
    guards,
    guardSemantics: {
      deltaD: 'number of shengjie first-component families moved relative to the audited base seed',
      deltaV: 'number of rhyme-body families shifted relative to the audited base seed',
      MGuard: 'conservative upper guard seedM + deltaD + deltaV; not a replacement for final rule-level M audit',
    },
    search: {
      neighborhood: 'all legal single first-family reassignments and single rhyme-family cyclic shifts',
      candidates: candidates.length,
      sampleRowsPerTrack: sampleCount,
      preselected: preselected.length,
      resampleRowsPerTrack: resampleCount,
      baseRank: {
        firstSample: sampleScores.indexOf(baseCandidate) + 1,
        resample: resampleScores.indexOf(resampledBase) + 1,
      },
      finalists: finalists.length,
      auxiliaryOrdersPerFinalist: orders.length,
    },
    finalists: finalists.map(({layout, ...value}) => value),
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  applyFirstFamilyMove,
  applySecondFamilyShift,
  buildPinyinFamilies,
  enumerateSingleMoves,
  explicitMemoryAudit,
  guardRecord,
};
