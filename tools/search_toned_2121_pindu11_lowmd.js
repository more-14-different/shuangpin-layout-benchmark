#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {loadPayload} = require('./score_completion_ckt_v4.js');
const {buildTokenInventory} = require('./search_toned_2121_factorizations.js');
const {
  IMAGE_FIRST_EXCEPTIONS,
  imageFirstKey,
  normalizeRhymeBody,
} = require('./audit_pindu_nextgen_image.js');
const {buildToned2121Contract} = require('./toned_2121_contract.js');

const FORBIDDEN_SOURCE_KEYS = Object.freeze(['Q', 'A', 'O', 'P', 'L']);
const PINYU11_COLUMN = Object.freeze({
  a: 0, ou: 0,
  ai: 1, ang: 1,
  ao: 2, ei: 2,
  en: 3,
  e: 4,
  an: 5, ong: 5,
  _: 6,
});

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

function minHeap(limit, compare) {
  const values = [];
  function swap(left, right) {
    [values[left], values[right]] = [values[right], values[left]];
  }
  function up(index) {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (compare(values[parent], values[index]) <= 0) break;
      swap(parent, index);
      index = parent;
    }
  }
  function down(index) {
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < values.length && compare(values[left], values[smallest]) < 0) smallest = left;
      if (right < values.length && compare(values[right], values[smallest]) < 0) smallest = right;
      if (smallest === index) break;
      swap(index, smallest);
      index = smallest;
    }
  }
  return {
    push(value) {
      if (values.length < limit) {
        values.push(value);
        up(values.length - 1);
      } else if (compare(value, values[0]) > 0) {
        values[0] = value;
        down(0);
      }
    },
    sorted() {
      return [...values].sort((left, right) => compare(right, left));
    },
  };
}

function assignmentId(destinations) {
  return FORBIDDEN_SOURCE_KEYS.map((source, index) => `${source}>${destinations[index]}`).join(',');
}

function traditionalOnsetD(destinations) {
  const aDestination = destinations[1];
  return aDestination === 'B' || aDestination === 'H' ? 11 : 12;
}

function enumerateProjection(tokens, decomposition, soundKeys, retain, sampleRetain) {
  const destinationIndex = new Map(soundKeys.map((key, index) => [key, index]));
  const sourceIndex = new Map(FORBIDDEN_SOURCE_KEYS.map((key, index) => [key, index]));
  const byDestination = Array.from({length: soundKeys.length}, () =>
    Array.from({length: 32}, () => new Map()));

  for (const token of tokens) {
    const split = decomposition.get(token.pinyin);
    const sourceKey = imageFirstKey(split.shengjie);
    const column = PINYU11_COLUMN[normalizeRhymeBody(split.rhymeBody)];
    if (column === undefined) throw new Error(`Pindu11 column missing for ${split.rhymeBody}`);
    const signature = token.row * 7 + column;
    if (sourceIndex.has(sourceKey)) {
      const bit = 1 << sourceIndex.get(sourceKey);
      for (let destination = 0; destination < soundKeys.length; destination++) {
        const bucket = byDestination[destination][bit];
        const previous = bucket.get(signature) || 0;
        if (token.weight > previous) bucket.set(signature, token.weight);
      }
    } else {
      const destination = destinationIndex.get(sourceKey);
      if (destination === undefined) throw new Error(`unexpected source first key ${sourceKey}`);
      const bucket = byDestination[destination][0];
      const previous = bucket.get(signature) || 0;
      if (token.weight > previous) bucket.set(signature, token.weight);
    }
  }

  const metrics = Array.from({length: soundKeys.length}, () => Array(32));
  for (let destination = 0; destination < soundKeys.length; destination++) {
    for (let mask = 0; mask < 32; mask++) {
      const merged = new Map(byDestination[destination][0]);
      for (let bit = 0; bit < 5; bit++) if (mask & (1 << bit)) {
        for (const [signature, weight] of byDestination[destination][1 << bit]) {
          if (weight > (merged.get(signature) || 0)) merged.set(signature, weight);
        }
      }
      metrics[destination][mask] = {
        occupied: merged.size,
        topWeight: [...merged.values()].reduce((sum, value) => sum + value, 0),
      };
    }
  }

  const totalWeight = tokens.reduce((sum, token) => sum + token.weight, 0);
  const masks = new Uint8Array(soundKeys.length);
  const touched = new Uint8Array(5);
  const best = minHeap(retain, (left, right) =>
    left.topWeight - right.topWeight || left.occupiedBuckets - right.occupiedBuckets ||
    right.ordinal - left.ordinal);
  const capacityBest = minHeap(retain, (left, right) =>
    left.occupiedBuckets - right.occupiedBuckets || left.topWeight - right.topWeight ||
    right.ordinal - left.ordinal);
  const minimumDWeighted = minHeap(retain, (left, right) =>
    left.topWeight - right.topWeight || left.occupiedBuckets - right.occupiedBuckets ||
    right.ordinal - left.ordinal);
  const minimumDCapacity = minHeap(retain, (left, right) =>
    left.occupiedBuckets - right.occupiedBuckets || left.topWeight - right.topWeight ||
    right.ordinal - left.ordinal);
  const conditionalBest = Array.from({length: 5}, () => Array(soundKeys.length));
  const uniform = [];
  const uniformMinimumD = [];
  const exactSpace = 21 ** 5;
  const uniformStride = Math.max(1, Math.floor(exactSpace / sampleRetain));
  const minimumDSpace = 2 * 21 ** 4;
  const minimumDUniformStride = Math.max(1, Math.floor(minimumDSpace / sampleRetain));
  let minimumDOrdinal = 0;
  let ordinal = 0;
  let maximumOccupied = 0;
  let maximumTopWeight = 0;
  let maximumTop1AtCapacity = 0;
  const occupiedHistogram = new Map();

  for (let q = 0; q < 21; q++) for (let a = 0; a < 21; a++) {
    for (let o = 0; o < 21; o++) for (let p = 0; p < 21; p++) for (let l = 0; l < 21; l++) {
      const destinations = [q, a, o, p, l];
      let touchedCount = 0;
      for (let bit = 0; bit < 5; bit++) {
        const destination = destinations[bit];
        if (masks[destination] === 0) touched[touchedCount++] = destination;
        masks[destination] |= 1 << bit;
      }
      let occupied = 0;
      let topWeight = 0;
      for (let destination = 0; destination < 21; destination++) {
        const metric = metrics[destination][masks[destination]];
        occupied += metric.occupied;
        topWeight += metric.topWeight;
      }
      maximumOccupied = Math.max(maximumOccupied, occupied);
      maximumTopWeight = Math.max(maximumTopWeight, topWeight);
      if (occupied === 441) maximumTop1AtCapacity = Math.max(maximumTop1AtCapacity,
        topWeight / totalWeight);
      occupiedHistogram.set(occupied, (occupiedHistogram.get(occupied) || 0) + 1);
      const candidate = {
        ordinal,
        destinations: destinations.map(value => soundKeys[value]),
        occupiedBuckets: occupied,
        topWeight,
        tonedSyllableTop1: topWeight / totalWeight,
        traditionalOnsetD: traditionalOnsetD(destinations.map(value => soundKeys[value])),
      };
      best.push(candidate);
      capacityBest.push(candidate);
      if (candidate.traditionalOnsetD === 11) {
        minimumDWeighted.push(candidate);
        minimumDCapacity.push(candidate);
        if (uniformMinimumD.length < sampleRetain &&
            minimumDOrdinal % minimumDUniformStride === 0) uniformMinimumD.push(candidate);
        minimumDOrdinal++;
      }
      for (let variable = 0; variable < 5; variable++) {
        const destination = destinations[variable];
        const previous = conditionalBest[variable][destination];
        if (!previous || candidate.topWeight > previous.topWeight ||
            candidate.topWeight === previous.topWeight &&
              candidate.occupiedBuckets > previous.occupiedBuckets) {
          conditionalBest[variable][destination] = candidate;
        }
      }
      if (uniform.length < sampleRetain && ordinal % uniformStride === 0) uniform.push(candidate);
      for (let at = 0; at < touchedCount; at++) masks[touched[at]] = 0;
      ordinal++;
    }
  }
  const candidatePools = {
    topWeighted: best.sorted(),
    topCapacity: capacityBest.sorted(),
    minimumDWeighted: minimumDWeighted.sorted(),
    minimumDCapacity: minimumDCapacity.sorted(),
    conditional: conditionalBest.flat().filter(Boolean),
    uniform,
    uniformMinimumD,
  };
  const unique = new Map();
  for (const [pool, candidates] of Object.entries(candidatePools)) for (const candidate of candidates) {
    const existing = unique.get(candidate.ordinal);
    if (existing) existing.pools.push(pool);
    else unique.set(candidate.ordinal, {...candidate, pools: [pool]});
  }
  const decorate = value => ({...value, assignment: assignmentId(value.destinations)});
  return {
    evaluatedAssignments: ordinal,
    maximumOccupied,
    maximumTop1: maximumTopWeight / totalWeight,
    maximumTop1AtCapacity,
    occupiedHistogram: Object.fromEntries([...occupiedHistogram].sort((left, right) => left[0] - right[0])),
    minimumTraditionalOnsetD: 11,
    minimumDExactSearchSpace: minimumDSpace,
    candidatePoolCounts: Object.fromEntries(Object.entries(candidatePools)
      .map(([key, values]) => [key, values.length])),
    retainedUniqueCandidates: unique.size,
    best: candidatePools.topWeighted.map(decorate),
    candidates: [...unique.values()].map(decorate),
  };
}

function encodeLayout(candidate, inventory, decomposition, contract) {
  const projection = Object.fromEntries(FORBIDDEN_SOURCE_KEYS.map((key, index) =>
    [key, candidate.destinations[index]]));
  const rows = [contract.soundKeysByRow.upper, contract.soundKeysByRow.home,
    contract.soundKeysByRow.lower];
  const tonedCodes = inventory.layoutTokenKeys.map(token => {
    const match = token.match(/^([a-z]+)([1-5])$/);
    const split = decomposition.get(match[1]);
    const tone = Number(match[2]);
    const row = tone === 4 ? 0 : tone === 2 || tone === 3 ? 1 : 2;
    const source = imageFirstKey(split.shengjie);
    const first = projection[source] || source;
    const second = rows[row][PINYU11_COLUMN[normalizeRhymeBody(split.rhymeBody)]];
    return first + second;
  });
  return {
    id: `LOWMD-pindu11-${candidate.ordinal}`,
    factorization: 'shengjie-pindu11-rhyme',
    origin: 'exhaustive-upstream-first-projection',
    assignment: candidate.assignment,
    forbiddenSourceProjection: projection,
    structuralMetrics: {
      occupiedBuckets: candidate.occupiedBuckets,
      tonedSyllableTop1: candidate.tonedSyllableTop1,
    },
    memoryAudit: {
      lowerM: 24,
      conservativeMGuard: 26,
      traditionalOnsetD: candidate.traditionalOnsetD,
      forcedOccupiedKeyFamilyCount: 3,
      sourceExceptionRules: Object.keys(IMAGE_FIRST_EXCEPTIONS).length,
    },
    tonedCodes,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const seedsFile = path.resolve(args.seeds || path.join(root,
    'research/config/ckt-v51-toned-2121-seeds.json'));
  const reportFile = path.resolve(args.report || path.join(root,
    'research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-lowmd-exhaustive.json'));
  const layoutsFile = path.resolve(args.layouts || path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-lowmd-layouts.json'));
  const retain = Number(args.retain || 128);
  const sampleRetain = Number(args['sample-retain'] || 512);
  const data = loadPayload(html);
  const inventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const decomposition = new Map(inventory.decomposition.map(value => [value.pinyin, value]));
  const tokens = buildTokenInventory(data, inventory);
  const contract = buildToned2121Contract();
  const soundKeys = [...contract.soundKeys];
  const enumeration = enumerateProjection(tokens, decomposition, soundKeys, retain, sampleRetain);
  const {candidates: retainedCandidates, ...compactEnumeration} = enumeration;
  const report = {
    version: 'ckt-v5.1-toned-2121-pindu11-lowmd-exhaustive-1',
    factorization: 'shengjie-pindu11-rhyme',
    frozenRhymeColumns: PINYU11_COLUMN,
    firstProjection: {
      sourceBuckets: 26,
      fixedBuckets: soundKeys.length,
      forbiddenSourceKeys: FORBIDDEN_SOURCE_KEYS,
      destinationKeys: soundKeys,
      freedom: 'each of five forbidden source buckets independently merges into one of 21 sound-key buckets',
      exactSearchSpace: 21 ** 5,
    },
    memoryAndDisorderAudit: {
      lowerM: {
        zeroInitialGlobalRules: 4,
        upstreamVisibleFirstExceptions: 10,
        forcedOrdinaryBucketMigrations: 3,
        rhymeNormalizationRules: 3,
        rhymePairMerges: 4,
        total: 24,
        assumption: 'A projection is absorbed by its existing bi/hu exceptions and O projection by the zero-initial rule',
      },
      conservativeMGuard: {
        replacesForcedOrdinaryBucketMigrationsWithAllForbiddenBucketProjections: 5,
        total: 26,
      },
      traditionalOnsetDMinimum: 11,
      minimumDCondition: 'A source bucket projects to B or H; this preserves exactly one of b/h',
      alwaysDisorderedTraditionalOnsets: ['d', 'g', 'j', 'l', 'm', 'n', 'p', 'q', 's', 'z'],
      forcedOccupiedKeyFamilies: ['q', 'p', 'l'],
      forcedOrdinaryShengjieAtoms: ['qi', 'qv', 'p', 'pi', 'pu', 'l', 'lu', 'lv'],
      forcedOrdinaryShengjieAtomCount: 8,
      upstreamExceptionRuleCount: 10,
      totalRuleLevelFirstIrregularity: 13,
      totalAtomicFirstIrregularity: 18,
    },
    enumeration: compactEnumeration,
  };
  const layouts = {
    version: 'ckt-v5.1-toned-2121-pindu11-lowmd-layouts-1',
    purpose: 'top exact structural projections for fixed-policy CKT screening',
    contract: {
      auxiliaryKeySet: contract.auxiliaryKeySet,
      soundKeys: contract.soundKeys,
      soundKeysByRow: contract.soundKeysByRow,
      toneRowAssignment: contract.primaryToneRowAssignment,
    },
    tokenKeys: inventory.layoutTokenKeys,
    layouts: retainedCandidates.map(candidate => encodeLayout(candidate, inventory,
      decomposition, contract)),
  };
  fs.mkdirSync(path.dirname(reportFile), {recursive: true});
  fs.mkdirSync(path.dirname(layoutsFile), {recursive: true});
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(layoutsFile, `${JSON.stringify(layouts, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    report: reportFile,
    layouts: layoutsFile,
    evaluatedAssignments: enumeration.evaluatedAssignments,
    maximumOccupied: enumeration.maximumOccupied,
    maximumTop1: enumeration.maximumTop1,
    maximumTop1AtCapacity: enumeration.maximumTop1AtCapacity,
    best: enumeration.best.slice(0, 12),
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  FORBIDDEN_SOURCE_KEYS,
  PINYU11_COLUMN,
  assignmentId,
  enumerateProjection,
  traditionalOnsetD,
};
