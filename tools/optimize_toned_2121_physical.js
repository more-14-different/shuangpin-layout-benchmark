#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const model = require('./ckt_v4_model.js');
const {loadPayload} = require('./score_completion_ckt_v4.js');
const {
  buildFactorizations,
  buildTokenInventory,
  indexedFactorization,
} = require('./search_toned_2121_factorizations.js');
const {buildToned2121Contract} = require('./toned_2121_contract.js');

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

function projectedMotor(data) {
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'ckt_v4_upstream_role_tables.json'), 'utf8'));
  return model.projectedMotor(
    model.upstreamMotor(snapshot), snapshot.keys, data.ckt.calibration.extension_maps);
}

function codeFor(token, firstGroupByComponent, secondGroupByComponent, factorization,
  firstKeys, columnPositions, rows) {
  const [firstComponent, secondComponent] = factorization.pairByPinyin.get(token.pinyin);
  const firstGroup = firstGroupByComponent[firstComponent];
  const secondGroup = secondGroupByComponent[secondComponent];
  return firstKeys[firstGroup] + rows[token.row][columnPositions[secondGroup]];
}

function optimizeLayout({candidate, factorization, tokens, motor, contract, steps, restarts, seed}) {
  const firstGroupByComponent = Int16Array.from(factorization.firstComponents.map(value =>
    candidate.firstGroups[value]));
  const secondGroupByComponent = Int16Array.from(factorization.secondComponents.map(value =>
    candidate.secondGroups[value]));
  const rows = [contract.soundKeysByRow.upper, contract.soundKeysByRow.home, contract.soundKeysByRow.lower];
  const soundKeys = [...contract.soundKeys];
  const totalWeight = tokens.reduce((sum, token) => sum + token.weight, 0);

  function score(firstKeys, columns) {
    let weighted = 0;
    for (const token of tokens) {
      const code = codeFor(token, firstGroupByComponent, secondGroupByComponent,
        factorization, firstKeys, columns, rows);
      const value = motor(code);
      if (!value) throw new Error(`motor projection failed for ${code}`);
      weighted += token.weight * value.upperMs;
    }
    return weighted / totalWeight;
  }

  let champion;
  for (let restart = 0; restart < restarts; restart++) {
    const random = mulberry32(seed + restart * 1009 + factorization.id.length * 8191);
    const firstKeys = shuffle(soundKeys, random);
    const columns = shuffle([0, 1, 2, 3, 4, 5, 6], random);
    let current = score(firstKeys, columns);
    if (!champion || current < champion.motorUpperMs) {
      champion = {motorUpperMs: current, firstKeys: [...firstKeys], columns: [...columns]};
    }
    for (let step = 1; step <= steps; step++) {
      const array = random() < 0.8 ? firstKeys : columns;
      const left = Math.floor(random() * array.length);
      let right = Math.floor(random() * array.length);
      if (right === left) right = (right + 1) % array.length;
      [array[left], array[right]] = [array[right], array[left]];
      const proposal = score(firstKeys, columns);
      const temperature = 20 * (1 - step / steps) + 0.05;
      if (proposal <= current || random() < Math.exp((current - proposal) / temperature)) {
        current = proposal;
        if (current < champion.motorUpperMs) {
          champion = {motorUpperMs: current, firstKeys: [...firstKeys], columns: [...columns]};
        }
      } else {
        [array[left], array[right]] = [array[right], array[left]];
      }
    }
  }
  const tonedCodes = tokens.map(token => codeFor(token, firstGroupByComponent,
    secondGroupByComponent, factorization, champion.firstKeys, champion.columns, rows));
  return {
    id: `SEARCH-${factorization.id}`,
    factorization: factorization.id,
    origin: 'heuristic-factorization-champion',
    structuralMetrics: {
      occupiedBuckets: candidate.occupiedBuckets,
      tonedSyllableTop1: candidate.tonedSyllableTop1,
    },
    physicalSearch: {
      algorithm: 'deterministic-simulated-annealing', steps, restarts, seed,
      objective: 'frequency-weighted two-key upstream motor upper bound',
      motorUpperMs: champion.motorUpperMs,
      firstGroupKeys: champion.firstKeys.join(''),
      secondGroupColumnPositions: champion.columns,
    },
    tonedCodes,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const seedsFile = path.resolve(args.seeds || path.join(root, 'research/config/ckt-v51-toned-2121-seeds.json'));
  const searchFile = path.resolve(args.search || path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-factorization-search.json'));
  const output = path.resolve(args.output || path.join(root, 'research/config/ckt-v51-toned-2121-layouts.json'));
  const steps = Number(args.steps || 10000);
  const restarts = Number(args.restarts || 4);
  const seed = Number(args.seed || 212151);
  const data = loadPayload(html);
  const seedInventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const search = JSON.parse(fs.readFileSync(searchFile, 'utf8'));
  const tokens = buildTokenInventory(data, seedInventory);
  const layoutInventory = {...seedInventory, auditTokenKeys:
    seedInventory.layoutTokenKeys || seedInventory.auditTokenKeys || seedInventory.tokenKeys};
  const layoutTokens = buildTokenInventory(data, layoutInventory);
  const pinyin = seedInventory.decomposition.map(row => row.pinyin);
  const factorization = new Map(buildFactorizations(seedInventory).map(definition => {
    const indexed = indexedFactorization(definition, pinyin);
    return [indexed.id, indexed];
  }));
  const contract = buildToned2121Contract();
  const motor = projectedMotor(data);
  const searched = search.factorizations.map(value => optimizeLayout({
    candidate: value.heuristicSearch.champion,
    factorization: factorization.get(value.id),
    tokens,
    motor,
    contract,
    steps,
    restarts,
    seed,
  })).map((layout, index) => {
    const source = search.factorizations[index].heuristicSearch.champion;
    const indexed = factorization.get(layout.factorization);
    const firstGroupByComponent = Int16Array.from(indexed.firstComponents.map(value => source.firstGroups[value]));
    const secondGroupByComponent = Int16Array.from(indexed.secondComponents.map(value => source.secondGroups[value]));
    const rows = [contract.soundKeysByRow.upper, contract.soundKeysByRow.home, contract.soundKeysByRow.lower];
    const firstKeys = [...layout.physicalSearch.firstGroupKeys];
    const columns = layout.physicalSearch.secondGroupColumnPositions;
    layout.tonedCodes = layoutTokens.map(token => codeFor(token, firstGroupByComponent,
      secondGroupByComponent, indexed, firstKeys, columns, rows));
    layout.firstComponentKeys = Object.fromEntries(indexed.firstComponents.map((value, at) =>
      [value, firstKeys[firstGroupByComponent[at]]]));
    layout.secondComponentColumns = Object.fromEntries(indexed.secondComponents.map((value, at) =>
      [value, columns[secondGroupByComponent[at]]]));
    layout.secondComponentPhysicalKeys = Object.fromEntries(indexed.secondComponents.map((value, at) => {
      const column = columns[secondGroupByComponent[at]];
      return [value, rows.map(row => row[column]).join('')];
    }));
    return layout;
  });
  const qaopl = seedInventory.qaoplTonedShengjieSeeds.map(value => ({
    id: `HIST-${value.name}`,
    factorization: 'shengjie-rhyme-body',
    origin: 'historical-qaopl-html',
    declaredMemory: value.memory,
    reportedMetrics: value.metrics,
    globalHead: value.globalHead,
    stateExceptions: value.stateExceptions,
    rhymeColumns: value.rhymeColumns,
    columnRoots: value.columnRoots,
    tonedCodes: value.tonedCodes.map(code => code?.toUpperCase() || null),
  }));
  const result = {
    version: 'ckt-v5.1-toned-2121-physical-layouts-1',
    contract: {
      auxiliaryKeySet: contract.auxiliaryKeySet,
      soundKeys: contract.soundKeys,
      soundKeysByRow: contract.soundKeysByRow,
      toneRowAssignment: contract.primaryToneRowAssignment,
    },
    tokenKeys: seedInventory.layoutTokenKeys || seedInventory.auditTokenKeys || seedInventory.tokenKeys,
    layouts: [...searched, ...qaopl],
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(searched.map(value => ({
    id: value.id,
    motorUpperMs: value.physicalSearch.motorUpperMs,
    firstGroupKeys: value.physicalSearch.firstGroupKeys,
    columns: value.physicalSearch.secondGroupColumnPositions,
  })), null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {codeFor, optimizeLayout};
