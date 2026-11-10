#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {loadPayload} = require('./score_completion_ckt_v4.js');
const {splitPinyin, HEADS, FINALS} = require('./ckt_v4_scheme_fixture.js');
const {rowForTone} = require('./toned_2121_contract.js');
const {normalizeRhymeBody} = require('./audit_pindu_nextgen_image.js');

const ROW_INDEX = Object.freeze({upper: 0, home: 1, lower: 2});

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

function buildFactorizations(seedInventory) {
  const decomposition = new Map(seedInventory.decomposition.map(row => [row.pinyin, row]));
  return [
    {
      id: 'shengjie-rhyme-body',
      split(pinyin) {
        const row = decomposition.get(pinyin);
        return [row.shengjie, row.rhymeBody];
      },
    },
    {
      id: 'shengjie-pindu11-rhyme',
      split(pinyin) {
        const row = decomposition.get(pinyin);
        return [row.shengjie, normalizeRhymeBody(row.rhymeBody)];
      },
    },
    {
      id: 'restored-onset-full-final',
      split(pinyin) {
        const row = decomposition.get(pinyin);
        return [row.initial === '_' ? 'Ø' : row.initial, row.fullFinal];
      },
    },
    {
      id: 'written-onset-written-final',
      split(pinyin) {
        const [head, final] = splitPinyin(pinyin);
        if (head === 0xff || final === 0xff) throw new Error(`written split failed: ${pinyin}`);
        return [HEADS[head], FINALS[final]];
      },
    },
  ];
}

function buildTokenInventory(data, seedInventory) {
  const common = new Set(data.base.map(([index]) => index));
  const weight = new Map();
  for (const [, pinyinIndex, tone, value, isCommon] of data.characters) {
    if (!isCommon || !common.has(pinyinIndex)) continue;
    const key = `${data.pinyin[pinyinIndex]}\0${tone}`;
    weight.set(key, (weight.get(key) || 0) + Math.max(0, value));
  }
  return (seedInventory.auditTokenKeys || seedInventory.tokenKeys).map(key => {
    const match = key.match(/^([a-z]+)([1-5])$/);
    if (!match) throw new Error(`invalid toned token ${key}`);
    const pinyin = match[1];
    const tone = Number(match[2]);
    return {key, pinyin, tone, row: ROW_INDEX[rowForTone(tone)], weight: weight.get(`${pinyin}\0${tone}`) || 0};
  });
}

function indexedFactorization(definition, pinyin) {
  const pairs = pinyin.map(value => definition.split(value));
  const firstComponents = [...new Set(pairs.map(value => value[0]))].sort();
  const secondComponents = [...new Set(pairs.map(value => value[1]))].sort();
  const firstIndex = new Map(firstComponents.map((value, index) => [value, index]));
  const secondIndex = new Map(secondComponents.map((value, index) => [value, index]));
  return {
    id: definition.id,
    firstComponents,
    secondComponents,
    pairByPinyin: new Map(pinyin.map((value, index) => [value, [
      firstIndex.get(pairs[index][0]),
      secondIndex.get(pairs[index][1]),
    ]])),
  };
}

function strictBounds(tokens, factorization) {
  const rowPinyin = new Set();
  const rowSignature = new Set();
  const rawSignature = new Set();
  for (const token of tokens) {
    const [first, second] = factorization.pairByPinyin.get(token.pinyin);
    rowPinyin.add(`${token.row}\0${token.pinyin}`);
    rowSignature.add(`${token.row}\0${first}\0${second}`);
    rawSignature.add(`${first}\0${second}`);
  }
  const distinct = tokens.length;
  const factorizationCeiling = Math.min(441, rowSignature.size);
  return {
    distinctTonedSyllables: distinct,
    globalCapacityCollisionExcessLowerBound: Math.max(0, distinct - 441),
    toneRowMergeCollisionExcessLowerBound: distinct - rowPinyin.size,
    identicalFactorSignatureCollisionExcessLowerBound: distinct - rowSignature.size,
    combinedStrictCollisionExcessLowerBound: distinct - factorizationCeiling,
    occupiedBucketUpperBound: factorizationCeiling,
    untonedFactorSignatureCount: rawSignature.size,
  };
}

function randomBalanced(count, groups, random) {
  const labels = shuffle(Array.from({length: count}, (_, index) => index % groups), random);
  return Int16Array.from(labels);
}

function searchOne(tokens, factorization, options) {
  const pinyin = [...new Set(tokens.map(token => token.pinyin))];
  const pinyinIndex = new Map(pinyin.map((value, index) => [value, index]));
  const firstByPinyin = new Int16Array(pinyin.length);
  const secondByPinyin = new Int16Array(pinyin.length);
  for (const value of pinyin) {
    const index = pinyinIndex.get(value);
    [firstByPinyin[index], secondByPinyin[index]] = factorization.pairByPinyin.get(value);
  }
  const tokenPinyin = Int16Array.from(tokens.map(token => pinyinIndex.get(token.pinyin)));
  const tokenRows = Uint8Array.from(tokens.map(token => token.row));
  const tokenWeights = Float64Array.from(tokens.map(token => token.weight));
  const totalWeight = tokenWeights.reduce((sum, value) => sum + value, 0);
  const stamp = new Int32Array(441);
  const maximum = new Float64Array(441);
  let generation = 0;

  function score(firstGroups, secondGroups) {
    generation++;
    let occupied = 0;
    let topWeight = 0;
    for (let index = 0; index < tokens.length; index++) {
      const py = tokenPinyin[index];
      const bucket = firstGroups[firstByPinyin[py]] * 21 + tokenRows[index] * 7 +
        secondGroups[secondByPinyin[py]];
      if (stamp[bucket] !== generation) {
        stamp[bucket] = generation;
        maximum[bucket] = tokenWeights[index];
        occupied++;
        topWeight += tokenWeights[index];
      } else if (tokenWeights[index] > maximum[bucket]) {
        topWeight += tokenWeights[index] - maximum[bucket];
        maximum[bucket] = tokenWeights[index];
      }
    }
    const tonedSyllableTop1 = topWeight / totalWeight;
    return {occupied, tonedSyllableTop1, objective: occupied + 441 * tonedSyllableTop1};
  }

  let champion;
  const frontier = [];
  function retain(first, second, result, restart, step) {
    const candidate = {
      ...result,
      restart,
      step,
      first: [...first],
      second: [...second],
    };
    if (!champion || candidate.objective > champion.objective) champion = candidate;
    if (frontier.some(value => value.occupied >= candidate.occupied &&
        value.tonedSyllableTop1 >= candidate.tonedSyllableTop1)) return;
    for (let index = frontier.length - 1; index >= 0; index--) {
      if (candidate.occupied >= frontier[index].occupied &&
          candidate.tonedSyllableTop1 >= frontier[index].tonedSyllableTop1) frontier.splice(index, 1);
    }
    frontier.push(candidate);
  }

  for (let restart = 0; restart < options.restarts; restart++) {
    const random = mulberry32(options.seed + restart * 1009 + factorization.id.length * 65537);
    const first = randomBalanced(factorization.firstComponents.length, 21, random);
    const second = randomBalanced(factorization.secondComponents.length, 7, random);
    let current = score(first, second);
    retain(first, second, current, restart, 0);
    for (let step = 1; step <= options.steps; step++) {
      const mutateFirst = random() < 0.5;
      const assignment = mutateFirst ? first : second;
      const groups = mutateFirst ? 21 : 7;
      const index = Math.floor(random() * assignment.length);
      const before = assignment[index];
      let after = Math.floor(random() * groups);
      if (after === before) after = (after + 1) % groups;
      assignment[index] = after;
      const proposal = score(first, second);
      const temperature = 2.5 * (1 - step / options.steps) + 0.02;
      if (proposal.objective >= current.objective ||
          random() < Math.exp((proposal.objective - current.objective) / temperature)) {
        current = proposal;
        retain(first, second, current, restart, step);
      } else {
        assignment[index] = before;
      }
    }
  }
  const compact = candidate => ({
    occupiedBuckets: candidate.occupied,
    collisionExcess: tokens.length - candidate.occupied,
    tonedSyllableTop1: candidate.tonedSyllableTop1,
    objective: candidate.objective,
    restart: candidate.restart,
    step: candidate.step,
    firstGroups: Object.fromEntries(factorization.firstComponents.map((value, index) => [value, candidate.first[index]])),
    secondGroups: Object.fromEntries(factorization.secondComponents.map((value, index) => [value, candidate.second[index]])),
  });
  return {
    champion: compact(champion),
    pareto: frontier.sort((a, b) => b.occupied - a.occupied || b.tonedSyllableTop1 - a.tonedSyllableTop1)
      .slice(0, 12).map(compact),
  };
}

function evaluateDirectSeed(seed, tokens, layoutTokenKeys) {
  const code = new Map(seed.tonedCodes.map((value, index) => [layoutTokenKeys[index], value]));
  const buckets = new Map();
  let totalWeight = 0;
  for (const token of tokens) {
    const value = code.get(token.key);
    if (!value) continue;
    if (!buckets.has(value)) buckets.set(value, []);
    buckets.get(value).push(token);
    totalWeight += token.weight;
  }
  let topWeight = 0;
  for (const values of buckets.values()) topWeight += Math.max(...values.map(value => value.weight));
  return {
    name: seed.name,
    memory: seed.memory,
    occupiedBuckets: buckets.size,
    collisionExcess: tokens.length - buckets.size,
    tonedSyllableTop1: topWeight / totalWeight,
    reportedMetrics: seed.metrics,
  };
}

function buildReport({html, seeds, steps, restarts, seed}) {
  const data = loadPayload(html);
  const seedInventory = JSON.parse(fs.readFileSync(seeds, 'utf8'));
  const tokens = buildTokenInventory(data, seedInventory);
  const pinyin = seedInventory.decomposition.map(row => row.pinyin);
  const factorizations = buildFactorizations(seedInventory).map(definition =>
    indexedFactorization(definition, pinyin));
  return {
    version: 'ckt-v5.1-toned-2121-factorization-search-2',
    search: {algorithm: 'deterministic-simulated-annealing', steps, restarts, seed,
      objective: 'occupiedBuckets + 441 * tonedSyllableTop1'},
    strictBoundDefinition: 'Maximum occupied buckets is bounded by 441 and by distinct (tone-row, first-component, second-component) signatures. Search results are feasible witnesses, not lower-bound proofs.',
    memoryDefinitionAudit: {
      frozenDefinition: 'M = global migration rules + atomic first-component exceptions + rhyme-family deviations + declared uniform offset rules; physical key/column permutation and the 120 shapeKeysByMeaning orders do not add M.',
      comparability: 'Historical QAOPL seeds carry this fully declared M. Generic partitions below are intentionally M-unrated until expressed as rules plus exceptions; component count or merge-link count must not be relabelled M.',
    },
    inventory: {commonPinyin: pinyin.length, distinctTonedSyllables: tokens.length},
    factorizations: factorizations.map(factorization => ({
      id: factorization.id,
      componentCounts: {
        first: factorization.firstComponents.length,
        second: factorization.secondComponents.length,
      },
      sevenColumnFeasibility: {
        coversCommon399: factorization.pairByPinyin.size === 399,
        requiresFirstComponentGrouping: factorization.firstComponents.length > 21,
        requiresSecondComponentGrouping: factorization.secondComponents.length > 7,
      },
      strictBounds: strictBounds(tokens, factorization),
      heuristicSearch: searchOne(tokens, factorization, {steps, restarts, seed}),
      historicalDirectSeeds: factorization.id === 'shengjie-rhyme-body'
        ? seedInventory.qaoplTonedShengjieSeeds.map(value => evaluateDirectSeed(
          value, tokens, seedInventory.layoutTokenKeys || seedInventory.tokenKeys))
        : [],
    })),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const output = path.resolve(args.output || path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-factorization-search.json'));
  const report = buildReport({
    html: path.resolve(args.html || path.join(root, 'a7_CKT_R11.html')),
    seeds: path.resolve(args.seeds || path.join(root, 'research/config/ckt-v51-toned-2121-seeds.json')),
    steps: Number(args.steps || 30000),
    restarts: Number(args.restarts || 6),
    seed: Number(args.seed || 2121051),
  });
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report.factorizations.map(value => ({
    id: value.id,
    components: value.componentCounts,
    bound: value.strictBounds.combinedStrictCollisionExcessLowerBound,
    occupied: value.heuristicSearch.champion.occupiedBuckets,
    top1: value.heuristicSearch.champion.tonedSyllableTop1,
  })), null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  buildFactorizations,
  buildReport,
  buildTokenInventory,
  indexedFactorization,
  searchOne,
  strictBounds,
};
