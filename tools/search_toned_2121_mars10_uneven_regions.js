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
const {
  MARS_RHYME_ORDER,
  lowDFirstKey,
  marsAudit,
  marsFirstGroup,
  marsRhymeIndex,
} = require('./mars_toned_factorization.js');

const PROFILE_GRID = Object.freeze([
  [220, 0], [441, 0], [882, 0],
  [220, 0.25], [441, 0.25], [882, 0.25],
  [220, 1], [441, 1], [882, 1],
]);
const ROWS = Object.freeze(['upper', 'home', 'lower']);
const TONE_REGIONS = Object.freeze({upper: Object.freeze([4]), home: Object.freeze([3, 2]),
  lower: Object.freeze([1, 5])});
const TRADITIONAL_INITIALS = Object.freeze(
  ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's']);

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

function rowForTone(tone) {
  const numeric = Number(tone);
  const row = ROWS.findIndex(value => TONE_REGIONS[value].includes(numeric));
  if (row < 0) throw new Error(`tone ${tone} is not covered`);
  return row;
}

function buildPinduFirstKeys(layouts, requestedId) {
  const layout = layouts.layouts.find(value => value.id === requestedId);
  if (!layout) throw new Error(`Pindu first layout not found: ${requestedId}`);
  const result = new Map();
  for (let index = 0; index < layouts.tokenKeys.length; index++) {
    const pinyin = layouts.tokenKeys[index].replace(/[1-5]$/u, '');
    const key = layout.tonedCodes[index][0];
    const previous = result.get(pinyin);
    if (previous && previous !== key) throw new Error(`${pinyin} flies across Pindu first keys`);
    result.set(pinyin, key);
  }
  return result;
}

function buildDecomposition(seedInventory, {firstMode, rhymeMode, pinduFirstKeys}) {
  const rows = new Map(seedInventory.decomposition.map(value => [value.pinyin, value]));
  const pinduRhymeIndex = new Map(RHYME_ORDER.map((value, index) => [value, index]));
  return pinyin => {
    const row = rows.get(pinyin);
    if (!row) throw new Error(`missing decomposition for ${pinyin}`);
    const marsFirst = firstMode.startsWith('mars-');
    const firstGroup = marsFirst ? marsFirstGroup(pinyin) : row.shengjie;
    const splitGroup = firstMode.match(/^mars-(zh|ch|sh)-e$/u)?.[1];
    const firstKey = marsFirst
      ? (firstGroup === splitGroup ? 'E' : lowDFirstKey(firstGroup))
      : pinduFirstKeys.get(pinyin);
    const rhyme = rhymeMode === 'mars10' ? marsRhymeIndex(row.fullFinal) :
      pinduRhymeIndex.get(normalizeRhymeBody(row.rhymeBody));
    if (firstKey === undefined || rhyme === undefined) {
      throw new Error(`incomplete ${firstMode}/${rhymeMode} decomposition for ${pinyin}`);
    }
    return {
      firstGroup,
      firstKey,
      rhyme,
      initial: row.initial,
      fullFinal: row.fullFinal,
    };
  };
}

function firstDiagnostics(layoutTokens, decomposition) {
  const incidences = new Map(TRADITIONAL_INITIALS.map(initial => [initial, new Set()]));
  const groups = new Map();
  for (const token of layoutTokens) {
    const split = decomposition(token.pinyin);
    const previous = groups.get(split.firstGroup);
    if (previous && previous !== split.firstKey) throw new Error(`${split.firstGroup} flies`);
    groups.set(split.firstGroup, split.firstKey);
    const initial = split.initial[0];
    if (incidences.has(initial)) incidences.get(initial).add(split.firstKey);
  }
  const traditionalOnsetD = [...incidences].filter(([initial, keys]) =>
    [...keys].some(key => key !== imageFirstKey(initial))).length;
  const onsetKeyIncidences = [...incidences.values()].reduce((sum, keys) => sum + keys.size, 0);
  return {traditionalOnsetD, onsetKeyIncidences,
    onsetFragmentation: onsetKeyIncidences - incidences.size,
    firstGroupCount: groups.size,
    firstOccupiedKeyCount: new Set(groups.values()).size};
}

function buildTables({tokens, decomposition, contract, motor}) {
  const soundKeys = [...contract.soundKeys];
  const soundIndex = new Map(soundKeys.map((key, index) => [key, index]));
  const secondKeys = Object.values(contract.soundKeysByRow).join('');
  const secondOffset = [0, contract.soundKeysByRow.upper.length,
    contract.soundKeysByRow.upper.length + contract.soundKeysByRow.home.length];
  const aggregate = new Map();
  let totalWeight = 0;
  for (const token of tokens) {
    const split = decomposition(token.pinyin);
    const first = soundIndex.get(split.firstKey);
    if (first === undefined) throw new Error(`Mars first key ${split.firstKey} is auxiliary`);
    const row = rowForTone(token.tone);
    const signature = `${first}\0${row}\0${split.rhyme}`;
    const previous = aggregate.get(signature);
    if (!previous || token.weight > previous.weight) aggregate.set(signature,
      {first, row, rhyme: split.rhyme, weight: token.weight});
    totalWeight += token.weight;
  }
  const motorTable = Array.from({length: soundKeys.length}, () =>
    new Float64Array(secondKeys.length));
  for (let first = 0; first < soundKeys.length; first++) {
    for (let second = 0; second < secondKeys.length; second++) {
      const value = motor(soundKeys[first] + secondKeys[second]);
      if (!value) throw new Error(`motor projection failed for ${soundKeys[first]}${secondKeys[second]}`);
      motorTable[first][second] = value.upperMs;
    }
  }
  return {records: [...aggregate.values()], totalWeight, soundKeys, secondKeys, secondOffset,
    motorTable};
}

function scoreState(state, tables, profile) {
  const stamp = new Uint8Array(441);
  const maximum = new Float64Array(441);
  let occupiedBuckets = 0;
  let topWeight = 0;
  let motorWeight = 0;
  for (const record of tables.records) {
    const second = tables.secondOffset[record.row] + state.regionMaps[record.row][record.rhyme];
    const bucket = record.first * 21 + second;
    if (!stamp[bucket]) {
      stamp[bucket] = 1;
      maximum[bucket] = record.weight;
      occupiedBuckets++;
      topWeight += record.weight;
    } else if (record.weight > maximum[bucket]) {
      topWeight += record.weight - maximum[bucket];
      maximum[bucket] = record.weight;
    }
    motorWeight += record.weight * tables.motorTable[record.first][second];
  }
  const tonedSyllableTop1 = topWeight / tables.totalWeight;
  const motorUpperMs = motorWeight / tables.totalWeight;
  return {occupiedBuckets, tonedSyllableTop1, motorUpperMs,
    objective: occupiedBuckets + profile.topWeight * tonedSyllableTop1 -
      profile.motorWeight * motorUpperMs};
}

function improveState(state, tables, profile, random, rhymeCount) {
  let current = scoreState(state, tables, profile);
  let passes = 0;
  for (; passes < 48; passes++) {
    let improved = false;
    for (const row of shuffle([0, 1, 2], random)) {
      const map = state.regionMaps[row];
      for (const rhyme of shuffle(Array.from({length: rhymeCount}, (_, index) => index), random)) {
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
      for (let swap = 0; swap < 32; swap++) {
        const left = Math.floor(random() * map.length);
        const right = Math.floor(random() * map.length);
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

function rhymeMapRecord(state, contract, rhymeOrder) {
  return Object.fromEntries(ROWS.map((row, index) => [row,
    Object.fromEntries(rhymeOrder.map((rhyme, rhymeIndex) =>
      [rhyme, contract.soundKeysByRow[row][state.regionMaps[index][rhymeIndex]]]))]));
}

function toneRegionMemoryLower(state, rhymeCount) {
  return state.regionMaps.reduce((sum, map) =>
    sum + rhymeCount - new Set(map).size, 0);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const data = scorer.loadPayload(path.resolve(args.html || path.join(root, 'a7_CKT_R11.html')));
  const seedsFile = path.resolve(args.seeds || path.join(root,
    'research/config/ckt-v51-toned-2121-seeds.json'));
  const outputLayouts = path.resolve(args['output-layouts'] || path.join(root,
    'research/config/ckt-v51-toned-2121-mars10-uneven786-layouts.json'));
  const outputReport = path.resolve(args['output-report'] || path.join(root,
    'research/notes/2026-11-10-ckt-v51-toned-2121-mars10-uneven786-search.json'));
  const starts = Number(args.starts || 256);
  const retain = Number(args.retain || 64);
  const seed = Number(args.seed || 1010786);
  const firstMode = String(args['first-mode'] || 'mars-d0');
  const rhymeMode = String(args['rhyme-mode'] || 'mars10');
  if (!['mars-d0', 'mars-zh-e', 'mars-ch-e', 'mars-sh-e', 'pindu'].includes(firstMode)) {
    throw new Error(`unknown first mode ${firstMode}`);
  }
  if (!['mars10', 'pindu11'].includes(rhymeMode)) throw new Error(`unknown rhyme mode ${rhymeMode}`);
  const seedInventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const inventoryAudit = marsAudit(seedInventory.decomposition);
  if (inventoryAudit.missingFinals.length) {
    throw new Error(`Mars factorization misses ${inventoryAudit.missingFinals.join(', ')}`);
  }
  const pinduFirstLayoutsFile = path.resolve(args['pindu-first-layouts'] || path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-uneven786-finalists.json'));
  const pinduFirstId = String(args['pindu-first-id'] || 'UNEVEN786-pindu11-D8-267');
  const pinduFirstLayouts = firstMode === 'pindu'
    ? JSON.parse(fs.readFileSync(pinduFirstLayoutsFile, 'utf8')) : null;
  const pinduFirstLayout = pinduFirstLayouts?.layouts.find(value => value.id === pinduFirstId);
  const pinduFirstKeys = firstMode === 'pindu'
    ? buildPinduFirstKeys(pinduFirstLayouts, pinduFirstId) : null;
  const pinduFirstLower = firstMode === 'pindu'
    ? pinduFirstLayout.memoryAudit.lowerM - pinduFirstLayout.memoryAudit.normalizedRhymeRules -
      pinduFirstLayout.memoryAudit.toneRegionMergeLower : null;
  const pinduFirstGuard = firstMode === 'pindu'
    ? pinduFirstLayout.memoryAudit.conservativeMGuard -
      pinduFirstLayout.memoryAudit.normalizedRhymeRules -
      pinduFirstLayout.memoryAudit.toneRegionMergeLower : null;
  const rhymeOrder = rhymeMode === 'mars10' ? MARS_RHYME_ORDER : RHYME_ORDER;
  const decomposition = buildDecomposition(seedInventory,
    {firstMode, rhymeMode, pinduFirstKeys});
  const contract = buildVariableToneRegionContract('AVUIO');
  const auditTokens = buildTokenInventory(data, seedInventory);
  const layoutTokens = buildTokenInventory(data, {...seedInventory,
    auditTokenKeys: seedInventory.layoutTokenKeys});
  const diagnostics = firstDiagnostics(layoutTokens, decomposition);
  const tables = buildTables({tokens: auditTokens, decomposition, contract,
    motor: projectedMotor(data)});
  const random = mulberry32(seed);
  const unique = new Map();
  for (let run = 0; run < starts; run++) {
    const state = {regionMaps: Object.values(contract.soundKeysByRow).map(keys =>
      randomSurjection(rhymeOrder.length, keys.length, random))};
    const [topWeight, motorWeight] = PROFILE_GRID[run % PROFILE_GRID.length];
    const profile = {topWeight, motorWeight};
    const metrics = improveState(state, tables, profile, random, rhymeOrder.length);
    const fingerprint = state.regionMaps.map(value => value.join('')).join('/');
    const candidate = {...metrics, state: {regionMaps: state.regionMaps.map(value => [...value])},
      profile, run};
    const previous = unique.get(fingerprint);
    if (!previous || candidate.tonedSyllableTop1 > previous.tonedSyllableTop1) {
      unique.set(fingerprint, candidate);
    }
  }
  const candidates = [...unique.values()].sort((left, right) =>
    right.tonedSyllableTop1 - left.tonedSyllableTop1 ||
    right.occupiedBuckets - left.occupiedBuckets ||
    left.motorUpperMs - right.motorUpperMs).slice(0, retain);
  const layouts = candidates.map((candidate, ordinal) => {
    const secondMap = rhymeMapRecord(candidate.state, contract, rhymeOrder);
    const marsFirst = firstMode.startsWith('mars-');
    // Mars always has the same four remembered special groups: zh, ch, sh,
    // and zero onset. Assigning zh to E replaces zh→Z; it does not add a fifth
    // association, although it raises traditional-onset D/F from 0/0 to 1/1.
    const firstLower = marsFirst ? 4 : pinduFirstLower;
    const firstGuard = marsFirst ? 4 : pinduFirstGuard;
    const rhymeLower = rhymeMode === 'mars10' ? 7 : 3;
    const rhymeGuard = rhymeMode === 'mars10' ? 9 : 3;
    const mergeLower = toneRegionMemoryLower(candidate.state, rhymeOrder.length);
    let firstLabel;
    if (firstMode === 'mars-d0') firstLabel = 'marsfirst';
    else if (marsFirst) firstLabel = `marsfirst-${firstMode.slice(5)}`;
    else firstLabel = `pindufirst${pinduFirstLayout.trialShengjieException ? '-trial' : ''}`;
    const stem = `${firstLabel}-` +
      `${rhymeMode}-D${diagnostics.traditionalOnsetD}`;
    return {
      id: `UNEVEN786-${stem}-${String(ordinal + 1).padStart(3, '0')}`,
      factorization: `${firstMode}-${rhymeMode}-tone-specific-regions`,
      origin: 'macroxue-Mars-factorization-AVUIO-7-8-6-rhyme-search',
      toneRegionRhymeKeys: secondMap,
      searchProfile: candidate.profile,
      structuralMetrics: {
        occupiedBuckets: candidate.occupiedBuckets,
        tonedSyllableTop1: candidate.tonedSyllableTop1,
        motorUpperMs: candidate.motorUpperMs,
      },
      memoryAudit: {
        lowerM: firstLower + rhymeLower + mergeLower,
        conservativeMGuard: firstGuard + rhymeGuard + mergeLower,
        sourceFirstAssociationLinks: marsFirst ? firstLower : null,
        pinduFirstRuleLower: firstMode === 'pindu' ? pinduFirstLower : null,
        headDeletionRules: rhymeMode === 'mars10' ? 1 : null,
        sourceRhymeColumnMergeRules: rhymeMode === 'mars10' ? 6 : null,
        sourceRhymeColumnMergeLinks: rhymeMode === 'mars10' ? 8 : null,
        normalizedRhymeRules: rhymeMode === 'pindu11' ? 3 : null,
        toneRegionMergeLower: mergeLower,
        ...diagnostics,
        comparability: 'provisional Mars rule-count lower/guard; same association-link convention as Pindu11, not QZ M-R2',
      },
      tonedCodes: layoutTokens.map(token => {
        const split = decomposition(token.pinyin);
        const row = ROWS[rowForTone(token.tone)];
        return split.firstKey + secondMap[row][rhymeOrder[split.rhyme]];
      }),
    };
  });
  const result = {
    version: 'ckt-v51-toned-2121-mars10-uneven786-layouts-1',
    purpose: `AVUIO 7/8/6 ${firstMode}/${rhymeMode} factorization comparison`,
    source: {repository: 'https://github.com/macroxue/shuangpin',
      commit: 'cd74b9505c6b4bf905466d6f7ecb6bcf10ab5caf',
      file: 'mars火星/mars.schema.yaml'},
    contract,
    toneProfile: {id: 'primary', regions: TONE_REGIONS},
    factorization: {firstMode, rhymeMode, rhymeOrder, pinduFirstId:
      firstMode === 'pindu' ? pinduFirstId : null},
    search: {algorithm: 'deterministic multi-profile rhyme-only coordinate ascent',
      starts, seed, uniqueLocalOptima: unique.size, retained: layouts.length,
      profiles: PROFILE_GRID},
    tokenKeys: seedInventory.layoutTokenKeys,
    layouts,
  };
  const report = {
    version: 'ckt-v51-toned-2121-mars10-uneven786-search-1',
    source: result.source,
    inventoryAudit,
    firstConstraint: diagnostics,
    search: {algorithm: 'deterministic multi-profile rhyme-only coordinate ascent',
      starts, seed, firstMode, rhymeMode, uniqueLocalOptima: unique.size, retained: layouts.length,
      profiles: PROFILE_GRID},
    memoryAudit: layouts[0]?.memoryAudit,
    candidates: layouts.map(layout => ({id: layout.id,
      toneRegionRhymeKeys: layout.toneRegionRhymeKeys,
      structuralMetrics: layout.structuralMetrics,
      searchProfile: layout.searchProfile})),
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({starts, uniqueLocalOptima: unique.size,
    retained: layouts.length, firstConstraint: diagnostics,
    best: report.candidates.slice(0, 12)}, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {firstDiagnostics, rowForTone, scoreState, toneRegionMemoryLower};
