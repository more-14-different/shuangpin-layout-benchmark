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
const CURRENT_FIXED_PARTITION = Object.freeze([6, 0, 1, 5, 1, 2, 4, 2, 3, 5, 0]);
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

function initialState(contract, random, run) {
  const soundKeys = [...contract.soundKeys];
  const b = soundKeys.indexOf('B');
  const h = soundKeys.indexOf('H');
  const destinations = [run % 2 === 0 ? b : h];
  for (let index = 1; index < FORBIDDEN_SOURCE_KEYS.length; index++) {
    destinations.push(Math.floor(random() * soundKeys.length));
  }
  const regionMaps = Object.values(contract.soundKeysByRow).map((keys, row) => {
    if (run === 0) {
      const base = [...CURRENT_FIXED_PARTITION];
      if (row === 1) base[10] = 7;
      if (row === 2) base[8] = 4;
      return base.map(value => value % keys.length);
    }
    return randomSurjection(RHYME_ORDER.length, keys.length, random);
  });
  return {destinations, regionMaps};
}

function stateFingerprint(state) {
  return `${state.destinations.join('.')}/${state.regionMaps.map(value => value.join('')).join('/')}`;
}

function toneRegionMemoryLower(state) {
  return state.regionMaps.reduce((sum, map) => sum + RHYME_ORDER.length - new Set(map).size, 0);
}

function buildSearchTables({tokens, decomposition, contract, motor}) {
  const soundKeys = [...contract.soundKeys];
  const soundIndex = new Map(soundKeys.map((key, index) => [key, index]));
  const forbiddenIndex = new Map(FORBIDDEN_SOURCE_KEYS.map((key, index) => [key, index]));
  const secondKeys = Object.values(contract.soundKeysByRow).join('');
  const secondOffset = [0, contract.soundKeysByRow.upper.length,
    contract.soundKeysByRow.upper.length + contract.soundKeysByRow.home.length];
  const aggregate = new Map();
  let totalWeight = 0;
  for (const token of tokens) {
    const split = decomposition(token.pinyin);
    const forbidden = forbiddenIndex.get(split.sourceKey);
    const fixed = forbidden === undefined ? soundIndex.get(split.sourceKey) : -1;
    if (fixed === undefined) throw new Error(`unexpected first source key ${split.sourceKey}`);
    const signature = `${forbidden ?? -1}\0${fixed}\0${token.row}\0${split.rhyme}`;
    const previous = aggregate.get(signature);
    if (!previous || token.weight > previous.weight) aggregate.set(signature, {
      forbidden: forbidden ?? -1,
      fixed,
      row: token.row,
      rhyme: split.rhyme,
      weight: token.weight,
    });
    totalWeight += token.weight;
  }
  const records = [...aggregate.values()];
  const motorTable = Array.from({length: soundKeys.length}, () =>
    new Float64Array(secondKeys.length));
  for (let first = 0; first < soundKeys.length; first++) {
    for (let second = 0; second < secondKeys.length; second++) {
      const value = motor(soundKeys[first] + secondKeys[second]);
      if (!value) throw new Error(`motor projection failed for ${soundKeys[first]}${secondKeys[second]}`);
      motorTable[first][second] = value.upperMs;
    }
  }
  return {records, totalWeight, soundKeys, soundIndex, secondKeys, secondOffset, motorTable};
}

function scoreState(state, tables, profile) {
  const stamp = new Uint8Array(441);
  const maximum = new Float64Array(441);
  let occupiedBuckets = 0;
  let topWeight = 0;
  let motorWeight = 0;
  for (const record of tables.records) {
    const first = record.forbidden < 0 ? record.fixed : state.destinations[record.forbidden];
    const second = tables.secondOffset[record.row] + state.regionMaps[record.row][record.rhyme];
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
  const objective = occupiedBuckets + profile.topWeight * tonedSyllableTop1 -
    profile.motorWeight * motorUpperMs;
  return {occupiedBuckets, tonedSyllableTop1, motorUpperMs, objective};
}

function improveState(state, tables, profile, random) {
  let current = scoreState(state, tables, profile);
  let passes = 0;
  for (; passes < 32; passes++) {
    let improved = false;
    const firstOrder = shuffle([...FORBIDDEN_SOURCE_KEYS.keys()], random);
    for (const source of firstOrder) {
      const before = state.destinations[source];
      const choices = source === 0
        ? [tables.soundIndex.get('B'), tables.soundIndex.get('H')]
        : [...tables.soundKeys.keys()];
      let best = current;
      let bestDestination = before;
      for (const destination of choices) if (destination !== before) {
        state.destinations[source] = destination;
        const proposal = scoreState(state, tables, profile);
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
    for (const row of shuffle([0, 1, 2], random)) {
      const map = state.regionMaps[row];
      for (const rhyme of shuffle([...RHYME_ORDER.keys()], random)) {
        const counts = new Uint8Array(Math.max(...map) + 1);
        for (const label of map) counts[label]++;
        const before = map[rhyme];
        if (counts[before] <= 1) continue;
        let best = current;
        let bestLabel = before;
        for (let label = 0; label < counts.length; label++) if (label !== before) {
          map[rhyme] = label;
          const proposal = scoreState(state, tables, profile);
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
        let right = Math.floor(random() * map.length);
        if (left === right || map[left] === map[right]) continue;
        [map[left], map[right]] = [map[right], map[left]];
        const proposal = scoreState(state, tables, profile);
        if (proposal.objective > current.objective + 1e-12) {
          current = proposal;
          improved = true;
        } else {
          [map[left], map[right]] = [map[right], map[left]];
        }
      }
    }
    if (!improved) break;
  }
  return {...current, passes};
}

function destinationRecord(state, tables) {
  return Object.fromEntries(FORBIDDEN_SOURCE_KEYS.map((source, index) =>
    [source, tables.soundKeys[state.destinations[index]]]));
}

function rhymeMapRecord(state, contract) {
  const rows = ['upper', 'home', 'lower'];
  return Object.fromEntries(rows.map((row, index) => [row,
    Object.fromEntries(RHYME_ORDER.map((rhyme, rhymeIndex) =>
      [rhyme, contract.soundKeysByRow[row][state.regionMaps[index][rhymeIndex]]]))]));
}

function makeLayout({candidate, layoutTokens, decomposition, contract, tables, ordinal}) {
  const firstProjection = destinationRecord(candidate.state, tables);
  const secondMap = rhymeMapRecord(candidate.state, contract);
  return {
    id: `UNEVEN786-pindu11-D8-${String(ordinal + 1).padStart(3, '0')}`,
    factorization: 'shengjie-pindu11-rhyme-tone-specific-regions',
    origin: 'AVUIO-7-8-6-tone-region-multistart-search',
    forbiddenSourceProjection: firstProjection,
    toneRegionRhymeKeys: secondMap,
    searchProfile: candidate.profile,
    structuralMetrics: {
      occupiedBuckets: candidate.occupiedBuckets,
      tonedSyllableTop1: candidate.tonedSyllableTop1,
      motorUpperMs: candidate.motorUpperMs,
    },
    memoryAudit: {
      lowerM: 29,
      conservativeMGuard: 34,
      firstRuleLower: 14,
      normalizedRhymeRules: 3,
      toneRegionMergeLower: toneRegionMemoryLower(candidate.state),
      traditionalOnsetD: 8,
      onsetKeyIncidences: 26,
      onsetFragmentation: 8,
      comparability: 'rule-count lower/guard; not QZ M-R2',
    },
    tonedCodes: layoutTokens.map(token => {
      const split = decomposition(token.pinyin);
      const forbidden = FORBIDDEN_SOURCE_KEYS.indexOf(split.sourceKey);
      const first = forbidden < 0 ? split.sourceKey : firstProjection[split.sourceKey];
      const row = ['upper', 'home', 'lower'][token.row];
      return first + secondMap[row][RHYME_ORDER[split.rhyme]];
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
    'research/config/ckt-v51-toned-2121-pindu11-uneven786-layouts.json'));
  const outputReport = path.resolve(args['output-report'] || path.join(root,
    'research/notes/2026-11-10-ckt-v51-toned-2121-pindu11-uneven786-search.json'));
  const starts = Number(args.starts || 192);
  const retain = Number(args.retain || 192);
  const seed = Number(args.seed || 786110721);

  const data = scorer.loadPayload(html);
  const seedInventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const auditTokens = buildTokenInventory(data, seedInventory);
  const layoutTokens = buildTokenInventory(data, {...seedInventory,
    auditTokenKeys: seedInventory.layoutTokenKeys});
  const decomposition = buildDecomposition(seedInventory);
  const contract = buildVariableToneRegionContract('AVUIO');
  const motor = projectedMotor(data);
  const tables = buildSearchTables({tokens: auditTokens, decomposition, contract, motor});
  const random = mulberry32(seed);
  const unique = new Map();

  for (let run = 0; run < starts; run++) {
    const state = initialState(contract, random, run);
    const [topWeight, motorWeight] = PROFILE_GRID[run % PROFILE_GRID.length];
    const profile = {topWeight, motorWeight};
    const metrics = improveState(state, tables, profile, random);
    const fingerprint = stateFingerprint(state);
    const candidate = {...metrics, state: {
      destinations: [...state.destinations],
      regionMaps: state.regionMaps.map(value => [...value]),
    }, profile, run};
    const previous = unique.get(fingerprint);
    if (!previous || candidate.tonedSyllableTop1 > previous.tonedSyllableTop1) {
      unique.set(fingerprint, candidate);
    }
  }

  const candidates = [...unique.values()].sort((left, right) =>
    right.tonedSyllableTop1 - left.tonedSyllableTop1 ||
    right.occupiedBuckets - left.occupiedBuckets ||
    left.motorUpperMs - right.motorUpperMs).slice(0, retain);
  const layouts = candidates.map((candidate, index) => makeLayout({candidate, layoutTokens,
    decomposition, contract, tables, ordinal: index}));
  const result = {
    version: 'ckt-v5.1-toned-2121-pindu11-uneven786-layouts-1',
    purpose: 'AVUIO 7/8/6 tone-specific Pindu11 rhyme-region candidates under D8/F8 first grammar',
    contract,
    tokenKeys: seedInventory.layoutTokenKeys,
    layouts,
  };
  const report = {
    version: 'ckt-v5.1-toned-2121-pindu11-uneven786-search-1',
    search: {algorithm: 'deterministic multi-profile coordinate ascent', starts, seed,
      uniqueLocalOptima: unique.size, retained: layouts.length, profiles: PROFILE_GRID},
    firstConstraint: {traditionalOnsetD: 8, onsetKeyIncidences: 26,
      onsetFragmentation: 8, forbiddenSourceKeys: FORBIDDEN_SOURCE_KEYS},
    toneRegions: {
      upper: {tones: [4], keys: contract.soundKeysByRow.upper},
      home: {tones: [3, 2], keys: contract.soundKeysByRow.home},
      lower: {tones: [1, 5], keys: contract.soundKeysByRow.lower},
    },
    memoryAudit: {lowerM: 29, conservativeMGuard: 34,
      definition: '4 zero rules + 10 upstream first exceptions + 3 normalized-rhyme rules + (4+3+5) tone-region merge links; five forbidden-bucket projections add 0..5 guard items',
      qzComparability: 'not comparable to QZ M-R2=42'},
    candidates: layouts.map(layout => ({id: layout.id,
      forbiddenSourceProjection: layout.forbiddenSourceProjection,
      toneRegionRhymeKeys: layout.toneRegionRhymeKeys,
      structuralMetrics: layout.structuralMetrics,
      searchProfile: layout.searchProfile})),
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({starts, uniqueLocalOptima: unique.size,
    retained: layouts.length, best: report.candidates.slice(0, 12)}, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {FORBIDDEN_SOURCE_KEYS, scoreState, toneRegionMemoryLower};
