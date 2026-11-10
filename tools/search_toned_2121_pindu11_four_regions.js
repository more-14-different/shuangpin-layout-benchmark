#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scorer = require('./score_completion_ckt_v4.js');
const {buildTokenInventory} = require('./search_toned_2121_factorizations.js');
const {imageFirstKey, normalizeRhymeBody, RHYME_ORDER} =
  require('./audit_pindu_nextgen_image.js');
const {projectedMotor} = require('./score_toned_2121_ckt_v51.js');
const {buildVariableToneRegionContract} = require('./toned_2121_contract.js');

const FORBIDDEN_SOURCE_KEYS = Object.freeze(['A', 'V', 'U', 'I', 'O']);
const TONES = Object.freeze([1, 2, 3, 4]);
const CORE_KEYS_BY_TONE = Object.freeze({
  1: 'JWHKL',
  2: 'PB',
  3: 'NSMGDF',
  4: 'RTYE',
});
const FREE_KEYS = 'QZXC';
const PROFILE_GRID = Object.freeze([
  [220, 0], [441, 0], [882, 0],
  [220, 0.25], [441, 0.25], [882, 0.25],
  [220, 1], [441, 1], [882, 1],
]);

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

function randomSurjection(items, groups, random) {
  return shuffle(Array.from({length: items}, (_, index) => index % groups), random);
}

function enumerateFreeKeyAssignments() {
  const assignments = [];
  for (let value = 0; value < 4 ** FREE_KEYS.length; value++) {
    let cursor = value;
    const assignment = {};
    for (const key of FREE_KEYS) {
      assignment[key] = TONES[cursor % TONES.length];
      cursor = Math.floor(cursor / TONES.length);
    }
    assignments.push(assignment);
  }
  return assignments;
}

function partitionFromAssignment(assignment) {
  const keysByTone = Object.fromEntries(TONES.map(tone => [tone,
    CORE_KEYS_BY_TONE[tone] + [...FREE_KEYS].filter(key => assignment[key] === tone).join('')]));
  const keys = Object.values(keysByTone).join('');
  if (keys.length !== 21 || new Set(keys).size !== 21) {
    throw new Error(`invalid four-region partition ${JSON.stringify(assignment)}`);
  }
  return {assignment, keysByTone};
}

function clonePartition(partition) {
  return {
    assignment: {...partition.assignment},
    keysByTone: {...partition.keysByTone},
  };
}

function swapRegionKeys(partition, leftTone, leftIndex, rightTone, rightIndex) {
  const left = [...partition.keysByTone[leftTone]];
  const right = [...partition.keysByTone[rightTone]];
  [left[leftIndex], right[rightIndex]] = [right[rightIndex], left[leftIndex]];
  partition.keysByTone[leftTone] = left.join('');
  partition.keysByTone[rightTone] = right.join('');
}

function movedCoreKeyCount(partition) {
  let moved = 0;
  for (const tone of TONES) for (const key of CORE_KEYS_BY_TONE[tone]) {
    if (!partition.keysByTone[tone].includes(key)) moved++;
  }
  return moved;
}

function freeKeyToneAssignment(partition) {
  return Object.fromEntries([...FREE_KEYS].map(key => [key,
    TONES.find(tone => partition.keysByTone[tone].includes(key))]));
}

function buildDecomposition(seedInventory) {
  const rows = new Map(seedInventory.decomposition.map(value => [value.pinyin, value]));
  const rhymeIndex = new Map(RHYME_ORDER.map((value, index) => [value, index]));
  return pinyin => {
    const row = rows.get(pinyin);
    if (!row) throw new Error(`missing decomposition for ${pinyin}`);
    return {
      sourceKey: imageFirstKey(row.shengjie),
      rhyme: rhymeIndex.get(normalizeRhymeBody(row.rhymeBody)),
    };
  };
}

function toneIndex(tone) {
  return Number(tone) === 5 ? 0 : Number(tone) - 1;
}

function buildSearchTables({tokens, decomposition, contract, motor}) {
  const soundKeys = [...contract.soundKeys];
  const soundIndex = new Map(soundKeys.map((key, index) => [key, index]));
  const forbiddenIndex = new Map(FORBIDDEN_SOURCE_KEYS.map((key, index) => [key, index]));
  const aggregate = new Map();
  let totalWeight = 0;
  for (const token of tokens) {
    const split = decomposition(token.pinyin);
    const forbidden = forbiddenIndex.get(split.sourceKey);
    const fixed = forbidden === undefined ? soundIndex.get(split.sourceKey) : -1;
    if (fixed === undefined) throw new Error(`unexpected first source key ${split.sourceKey}`);
    const region = toneIndex(token.tone);
    const signature = `${forbidden ?? -1}\0${fixed}\0${region}\0${split.rhyme}`;
    const previous = aggregate.get(signature);
    if (!previous || token.weight > previous.weight) aggregate.set(signature, {
      forbidden: forbidden ?? -1,
      fixed,
      region,
      rhyme: split.rhyme,
      weight: token.weight,
    });
    totalWeight += token.weight;
  }
  const motorTable = Array.from({length: soundKeys.length}, () =>
    new Float64Array(soundKeys.length));
  for (let first = 0; first < soundKeys.length; first++) {
    for (let second = 0; second < soundKeys.length; second++) {
      const value = motor(soundKeys[first] + soundKeys[second]);
      if (!value) throw new Error(`motor projection failed for ${soundKeys[first]}${soundKeys[second]}`);
      motorTable[first][second] = value.upperMs;
    }
  }
  return {records: [...aggregate.values()], totalWeight, soundKeys, soundIndex, motorTable};
}

function initialState(partition, tables, random, run) {
  const b = tables.soundIndex.get('B');
  const h = tables.soundIndex.get('H');
  const destinations = [run % 2 === 0 ? b : h];
  for (let index = 1; index < FORBIDDEN_SOURCE_KEYS.length; index++) {
    destinations.push(Math.floor(random() * tables.soundKeys.length));
  }
  return {
    destinations,
    regionMaps: TONES.map(tone =>
      randomSurjection(RHYME_ORDER.length, partition.keysByTone[tone].length, random)),
  };
}

function stateFingerprint(state, partition) {
  const regions = TONES.map(tone => partition.keysByTone[tone]).join('.');
  return `${regions}/${state.destinations.join('.')}/${state.regionMaps.map(value => value.join('')).join('/')}`;
}

function scoreState(state, partition, tables, profile) {
  const stamp = new Uint8Array(441);
  const maximum = new Float64Array(441);
  let occupiedBuckets = 0;
  let topWeight = 0;
  let motorWeight = 0;
  for (const record of tables.records) {
    const first = record.forbidden < 0 ? record.fixed : state.destinations[record.forbidden];
    const tone = TONES[record.region];
    const secondKey = partition.keysByTone[tone][state.regionMaps[record.region][record.rhyme]];
    const second = tables.soundIndex.get(secondKey);
    const bucket = first * 21 + second;
    if (!stamp[bucket]) {
      stamp[bucket] = 1;
      maximum[bucket] = record.weight;
      occupiedBuckets++;
      topWeight += record.weight;
    } else if (record.weight > maximum[bucket]) {
      topWeight += record.weight - maximum[bucket];
      maximum[bucket] = record.weight;
    }
    motorWeight += record.weight * tables.motorTable[first][second];
  }
  const tonedSyllableTop1 = topWeight / tables.totalWeight;
  const motorUpperMs = motorWeight / tables.totalWeight;
  return {
    occupiedBuckets,
    tonedSyllableTop1,
    motorUpperMs,
    objective: occupiedBuckets + profile.topWeight * tonedSyllableTop1 -
      profile.motorWeight * motorUpperMs,
  };
}

function improveState(state, partition, tables, profile, random, regionSwaps = 0) {
  let current = scoreState(state, partition, tables, profile);
  for (let pass = 0; pass < 32; pass++) {
    let improved = false;
    for (const source of shuffle([...FORBIDDEN_SOURCE_KEYS.keys()], random)) {
      const before = state.destinations[source];
      const choices = source === 0
        ? [tables.soundIndex.get('B'), tables.soundIndex.get('H')]
        : [...tables.soundKeys.keys()];
      let best = current;
      let bestDestination = before;
      for (const destination of choices) if (destination !== before) {
        state.destinations[source] = destination;
        const proposal = scoreState(state, partition, tables, profile);
        if (proposal.objective > best.objective + 1e-12) {
          best = proposal;
          bestDestination = destination;
        }
      }
      state.destinations[source] = bestDestination;
      if (bestDestination !== before) {
        current = best;
        improved = true;
      }
    }
    for (const region of shuffle([0, 1, 2, 3], random)) {
      const map = state.regionMaps[region];
      const groupCount = partition.keysByTone[TONES[region]].length;
      for (const rhyme of shuffle([...RHYME_ORDER.keys()], random)) {
        const counts = new Uint8Array(groupCount);
        for (const label of map) counts[label]++;
        const before = map[rhyme];
        if (counts[before] <= 1) continue;
        let best = current;
        let bestLabel = before;
        for (let label = 0; label < groupCount; label++) if (label !== before) {
          map[rhyme] = label;
          const proposal = scoreState(state, partition, tables, profile);
          if (proposal.objective > best.objective + 1e-12) {
            best = proposal;
            bestLabel = label;
          }
        }
        map[rhyme] = bestLabel;
        if (bestLabel !== before) {
          current = best;
          improved = true;
        }
      }
      for (let swap = 0; swap < 16; swap++) {
        const left = Math.floor(random() * map.length);
        const right = Math.floor(random() * map.length);
        if (left === right || map[left] === map[right]) continue;
        [map[left], map[right]] = [map[right], map[left]];
        const proposal = scoreState(state, partition, tables, profile);
        if (proposal.objective > current.objective + 1e-12) {
          current = proposal;
          improved = true;
        } else {
          [map[left], map[right]] = [map[right], map[left]];
        }
      }
    }
    for (let attempt = 0; attempt < regionSwaps; attempt++) {
      const leftRegion = Math.floor(random() * TONES.length);
      let rightRegion = Math.floor(random() * TONES.length);
      if (leftRegion === rightRegion) continue;
      const leftTone = TONES[leftRegion];
      const rightTone = TONES[rightRegion];
      const leftIndex = Math.floor(random() * partition.keysByTone[leftTone].length);
      const rightIndex = Math.floor(random() * partition.keysByTone[rightTone].length);
      swapRegionKeys(partition, leftTone, leftIndex, rightTone, rightIndex);
      const proposal = scoreState(state, partition, tables, profile);
      if (proposal.objective > current.objective + 1e-12) {
        current = proposal;
        improved = true;
      } else {
        swapRegionKeys(partition, leftTone, leftIndex, rightTone, rightIndex);
      }
    }
    if (!improved) break;
  }
  return current;
}

function destinationRecord(state, tables) {
  return Object.fromEntries(FORBIDDEN_SOURCE_KEYS.map((source, index) =>
    [source, tables.soundKeys[state.destinations[index]]]));
}

function rhymeMapRecord(state, partition) {
  return Object.fromEntries(TONES.map((tone, region) => [tone,
    Object.fromEntries(RHYME_ORDER.map((rhyme, rhymeIndex) =>
      [rhyme, partition.keysByTone[tone][state.regionMaps[region][rhymeIndex]]]))]));
}

function makeLayout({candidate, layoutTokens, decomposition, tables, ordinal}) {
  const firstProjection = destinationRecord(candidate.state, tables);
  const secondMap = rhymeMapRecord(candidate.state, candidate.partition);
  const movedCoreKeys = movedCoreKeyCount(candidate.partition);
  const idStem = movedCoreKeys ? 'FOURREGION-RELAXED' : 'FOURREGION';
  return {
    id: `${idStem}-pindu11-D8-${String(ordinal + 1).padStart(4, '0')}`,
    factorization: 'shengjie-pindu11-rhyme-four-tone-regions',
    origin: movedCoreKeys
      ? 'AVUIO-relaxed-four-region-boundary-search'
      : 'AVUIO-upstream-core-four-region-search',
    freeKeyToneAssignment: freeKeyToneAssignment(candidate.partition),
    toneRegionKeys: candidate.partition.keysByTone,
    forbiddenSourceProjection: firstProjection,
    toneRhymeKeys: secondMap,
    searchProfile: candidate.profile,
    structuralMetrics: {
      occupiedBuckets: candidate.occupiedBuckets,
      tonedSyllableTop1: candidate.tonedSyllableTop1,
      motorUpperMs: candidate.motorUpperMs,
    },
    memoryAudit: {
      componentRuleLower: 40,
      freeKeyRegionAssignments: 4,
      movedCoreKeys,
      lowerMWithRegion: 44 + movedCoreKeys,
      conservativeMGuard: 49 + movedCoreKeys,
      firstRuleLower: 14,
      normalizedRhymeRules: 3,
      toneRegionMergeLower: 23,
      traditionalOnsetD: 8,
      onsetKeyIncidences: 26,
      onsetFragmentation: 8,
      comparability: 'rule-count lower/guard; not QZ M-R2',
    },
    tonedCodes: layoutTokens.map(token => {
      const split = decomposition(token.pinyin);
      const forbidden = FORBIDDEN_SOURCE_KEYS.indexOf(split.sourceKey);
      const first = forbidden < 0 ? split.sourceKey : firstProjection[split.sourceKey];
      const tone = Number(token.tone) === 5 ? 1 : Number(token.tone);
      return first + secondMap[tone][RHYME_ORDER[split.rhyme]];
    }),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const seedsFile = path.resolve(args.seeds || path.join(root,
    'research/config/ckt-v51-toned-2121-seeds.json'));
  const outputLayouts = path.resolve(args['output-layouts'] || path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-four-region-layouts.json'));
  const outputReport = path.resolve(args['output-report'] || path.join(root,
    'research/notes/2026-11-10-ckt-v51-toned-2121-pindu11-four-region-search.json'));
  const startsPerPartition = Number(args['starts-per-partition'] || 4);
  const retain = Number(args.retain || 1024);
  const seed = Number(args.seed || 41143016);
  const regionSwaps = Number(args['region-swaps'] || 0);

  const data = scorer.loadPayload(html);
  const seedInventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const auditTokens = buildTokenInventory(data, seedInventory);
  const layoutTokens = buildTokenInventory(data, {...seedInventory,
    auditTokenKeys: seedInventory.layoutTokenKeys});
  const decomposition = buildDecomposition(seedInventory);
  const contract = buildVariableToneRegionContract('AVUIO');
  const tables = buildSearchTables({tokens: auditTokens, decomposition, contract,
    motor: projectedMotor(data)});
  const random = mulberry32(seed);
  const partitions = enumerateFreeKeyAssignments().map(partitionFromAssignment);
  const unique = new Map();
  let run = 0;
  for (const partition of partitions) {
    for (let start = 0; start < startsPerPartition; start++, run++) {
      const workingPartition = clonePartition(partition);
      const state = initialState(workingPartition, tables, random, run);
      const [topWeight, motorWeight] = PROFILE_GRID[run % PROFILE_GRID.length];
      const profile = {topWeight, motorWeight};
      const metrics = improveState(state, workingPartition, tables, profile, random, regionSwaps);
      const candidate = {...metrics, profile, partition: workingPartition, state: {
        destinations: [...state.destinations],
        regionMaps: state.regionMaps.map(value => [...value]),
      }};
      const fingerprint = stateFingerprint(state, workingPartition);
      const previous = unique.get(fingerprint);
      if (!previous || candidate.tonedSyllableTop1 > previous.tonedSyllableTop1) {
        unique.set(fingerprint, candidate);
      }
    }
  }
  const candidates = [...unique.values()].sort((left, right) =>
    right.tonedSyllableTop1 - left.tonedSyllableTop1 ||
    right.occupiedBuckets - left.occupiedBuckets ||
    left.motorUpperMs - right.motorUpperMs).slice(0, retain);
  const layouts = candidates.map((candidate, index) => makeLayout({candidate, layoutTokens,
    decomposition, tables, ordinal: index}));
  const result = {
    version: 'ckt-v5.1-toned-2121-pindu11-four-region-layouts-1',
    purpose: 'AVUIO four-tone regions projected from the upstream image, exhaustively assigning Q/Z/X/C',
    contract,
    tokenKeys: seedInventory.layoutTokenKeys,
    layouts,
  };
  const report = {
    version: 'ckt-v5.1-toned-2121-pindu11-four-region-search-1',
    search: {algorithm: '256 exact free-key partitions x deterministic multi-profile coordinate ascent',
      partitionCount: partitions.length, startsPerPartition, starts: run, seed,
      regionSwapsPerPass: regionSwaps, uniqueLocalOptima: unique.size,
      retained: layouts.length, profiles: PROFILE_GRID},
    regionContract: {coreKeysByTone: CORE_KEYS_BY_TONE, freeKeys: FREE_KEYS,
      neutralTonePolicy: 'follow-tone1'},
    memoryAudit: layouts[0]?.memoryAudit,
    candidates: layouts.map(layout => ({id: layout.id,
      freeKeyToneAssignment: layout.freeKeyToneAssignment,
      toneRegionKeys: layout.toneRegionKeys,
      forbiddenSourceProjection: layout.forbiddenSourceProjection,
      toneRhymeKeys: layout.toneRhymeKeys,
      structuralMetrics: layout.structuralMetrics,
      searchProfile: layout.searchProfile})),
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({partitions: partitions.length, starts: run,
    uniqueLocalOptima: unique.size, retained: layouts.length,
    best: report.candidates.slice(0, 12)}, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {CORE_KEYS_BY_TONE, FREE_KEYS, enumerateFreeKeyAssignments,
  freeKeyToneAssignment, movedCoreKeyCount, partitionFromAssignment, swapRegionKeys,
  toneIndex};
