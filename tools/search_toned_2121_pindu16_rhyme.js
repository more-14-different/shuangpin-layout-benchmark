#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scorer = require('./score_completion_ckt_v4.js');
const {normalizeRhymeBody, RHYME_ORDER} = require('./audit_pindu_nextgen_image.js');
const {buildTokenInventory} = require('./search_toned_2121_factorizations.js');
const {projectedMotor} = require('./score_toned_2121_ckt_v51.js');
const {buildToned2121Contract} = require('./toned_2121_contract.js');

const CURRENT_FIXED_PARTITION = Object.freeze([0, 1, 2, 3, 2, 4, 5, 4, 6, 3, 1]);

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

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index), ...values.slice(index + 1),
  ]).map(rest => [value, ...rest]));
}

function canonicalize(labels) {
  const remap = new Map();
  let next = 0;
  return labels.map(label => {
    if (!remap.has(label)) remap.set(label, next++);
    return remap.get(label);
  });
}

function rawRhymeInventory(seedInventory) {
  const rhymes = [...new Set(seedInventory.decomposition.map(value => value.rhymeBody))].sort();
  const index = new Map(rhymes.map((value, at) => [value, at]));
  const decomposition = new Map(seedInventory.decomposition.map(value => [value.pinyin, value]));
  return {
    rhymes,
    indexForPinyin(pinyin) {
      const split = decomposition.get(pinyin);
      if (!split) throw new Error(`missing decomposition for ${pinyin}`);
      return index.get(split.rhymeBody);
    },
  };
}

function selectBaseLayouts(layoutInventory, ranking, count) {
  const byId = new Map(layoutInventory.layouts.map(value => [value.id, value]));
  const selected = [];
  const assignments = new Set();
  for (const result of ranking.results) {
    const layout = byId.get(result.id);
    if (!layout || layout.memoryAudit?.traditionalOnsetD !== 11 ||
      assignments.has(layout.assignment)) continue;
    assignments.add(layout.assignment);
    selected.push({...layout, baselineScore: result.score});
    if (selected.length === count) break;
  }
  return selected;
}

function buildTables({tokens, tokenKeys, layout, rhymeCount, indexForPinyin, contract, motor}) {
  const firstByToken = new Map(tokenKeys.map((token, index) => [token, layout.tonedCodes[index][0]]));
  const soundIndex = new Map([...contract.soundKeys].map((key, index) => [key, index]));
  const rows = [contract.soundKeysByRow.upper, contract.soundKeysByRow.home,
    contract.soundKeysByRow.lower];
  const cells = Array.from({length: 63}, () => new Float64Array(rhymeCount));
  const rhymeColumnMotor = Array.from({length: rhymeCount}, () => new Float64Array(7));
  let totalWeight = 0;
  for (const token of tokens) {
    const first = firstByToken.get(token.key);
    const firstIndex = soundIndex.get(first);
    const rhyme = indexForPinyin(token.pinyin);
    const cell = firstIndex * 3 + token.row;
    if (token.weight > cells[cell][rhyme]) cells[cell][rhyme] = token.weight;
    for (let column = 0; column < 7; column++) {
      rhymeColumnMotor[rhyme][column] += token.weight *
        motor(first + rows[token.row][column]).upperMs;
    }
    totalWeight += token.weight;
  }
  return {cells, firstByToken, rhymeColumnMotor, totalWeight};
}

function scoreAssignment(labels, tables) {
  const maximum = new Float64Array(441);
  for (let cell = 0; cell < tables.cells.length; cell++) {
    const weights = tables.cells[cell];
    const offset = cell * 7;
    for (let rhyme = 0; rhyme < labels.length; rhyme++) {
      const bucket = offset + labels[rhyme];
      if (weights[rhyme] > maximum[bucket]) maximum[bucket] = weights[rhyme];
    }
  }
  let occupiedBuckets = 0;
  let topWeight = 0;
  for (const weight of maximum) if (weight > 0) {
    occupiedBuckets++;
    topWeight += weight;
  }
  const tonedSyllableTop1 = topWeight / tables.totalWeight;
  return {occupiedBuckets, tonedSyllableTop1,
    objective: occupiedBuckets + 441 * tonedSyllableTop1};
}

function currentRawAssignment(rawRhymes) {
  const normalizedGroup = new Map(RHYME_ORDER.map((rhyme, index) =>
    [rhyme, CURRENT_FIXED_PARTITION[index]]));
  return rawRhymes.map(rhyme => normalizedGroup.get(normalizeRhymeBody(rhyme)));
}

function localSearch(tables, rawRhymes, starts, seed, retain) {
  const random = mulberry32(seed);
  const results = new Map();
  const startingAssignments = [currentRawAssignment(rawRhymes)];
  for (let start = 1; start < starts; start++) {
    startingAssignments.push(shuffle(Array.from({length: rawRhymes.length},
      (_, index) => index % 7), random));
  }
  for (let start = 0; start < startingAssignments.length; start++) {
    const labels = startingAssignments[start];
    let current = scoreAssignment(labels, tables);
    let pass = 0;
    for (;;) {
      let improved = false;
      for (const rhyme of shuffle([...rawRhymes.keys()], random)) {
        const counts = new Uint8Array(7);
        for (const label of labels) counts[label]++;
        const before = labels[rhyme];
        if (counts[before] <= 1) continue;
        let best = current;
        let bestLabel = before;
        for (let after = 0; after < 7; after++) if (after !== before) {
          labels[rhyme] = after;
          const proposal = scoreAssignment(labels, tables);
          if (proposal.objective > best.objective + 1e-12) {
            best = proposal;
            bestLabel = after;
          }
        }
        labels[rhyme] = bestLabel;
        if (bestLabel !== before) {
          current = best;
          improved = true;
        }
      }
      pass++;
      if (!improved || pass >= 64) break;
    }
    const canonical = canonicalize(labels);
    const signature = canonical.join('');
    const previous = results.get(signature);
    if (!previous || current.objective > previous.objective) {
      results.set(signature, {...current, labels: canonical, start, passes: pass});
    }
  }
  return [...results.values()].sort((left, right) =>
    right.objective - left.objective || right.tonedSyllableTop1 - left.tonedSyllableTop1)
    .slice(0, retain);
}

function groupsFor(labels, rhymes) {
  const groups = Array.from({length: 7}, () => []);
  for (let index = 0; index < labels.length; index++) groups[labels[index]].push(rhymes[index]);
  return groups;
}

function bestColumnOrders(candidate, tables, orders, count) {
  const groupColumnMotor = Array.from({length: 7}, () => new Float64Array(7));
  for (let rhyme = 0; rhyme < candidate.labels.length; rhyme++) for (let column = 0;
    column < 7; column++) {
    groupColumnMotor[candidate.labels[rhyme]][column] += tables.rhymeColumnMotor[rhyme][column];
  }
  return orders.map(order => ({order, motorUpperMs: order.reduce((sum, column, group) =>
    sum + groupColumnMotor[group][column], 0) / tables.totalWeight}))
    .sort((left, right) => left.motorUpperMs - right.motorUpperMs)
    .slice(0, count);
}

function makeLayout({base, candidate, physical, raw, layoutTokens, tables, contract, ordinal}) {
  const rows = [contract.soundKeysByRow.upper, contract.soundKeysByRow.home,
    contract.soundKeysByRow.lower];
  const id = `RHYME16-D11-${base.assignment.replaceAll('>', '').replaceAll(',', '-')}` +
    `-S${String(ordinal).padStart(3, '0')}-C${physical.order.join('')}`;
  return {
    id,
    factorization: 'shengjie-rhyme-body',
    origin: 'pindu16-raw-rhyme-multistart-local-search',
    parentId: base.id,
    assignment: base.assignment,
    rawRhymeGroups: groupsFor(candidate.labels, raw.rhymes),
    rawRhymeAssignment: candidate.labels,
    rhymePartitionSignature: candidate.labels.join(''),
    columnOrder: physical.order,
    searchAudit: {start: candidate.start, passes: candidate.passes},
    physicalSearch: {algorithm: 'exact-motor-order-over-7!', motorUpperMs: physical.motorUpperMs},
    structuralMetrics: {occupiedBuckets: candidate.occupiedBuckets,
      tonedSyllableTop1: candidate.tonedSyllableTop1},
    memoryAudit: {...base.memoryAudit, rawRhymeBodyCount: 16, rhymeBucketCount: 7,
      onsetKeyIncidences: 27, onsetFragmentation: 9,
      rhymeMemoryStatus: 'unrated arbitrary raw-rhyme partition'},
    tonedCodes: layoutTokens.map(token => {
      const match = token.key.match(/^([a-z]+)([1-5])$/);
      const rhyme = raw.indexForPinyin(match[1]);
      return tables.firstByToken.get(token.key) + rows[token.row][physical.order[candidate.labels[rhyme]]];
    }),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const seedsFile = path.resolve(args.seeds || path.join(root,
    'research/config/ckt-v51-toned-2121-seeds.json'));
  const layoutsFile = path.resolve(args.layouts || path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-dmin-column-finalists.json'));
  const rankingFile = path.resolve(args.ranking || path.join(root,
    'research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-dmin-column-full.json'));
  const outputLayouts = path.resolve(args['output-layouts'] || path.join(root,
    'research/config/ckt-v51-toned-2121-pindu16-dmin-rhyme-layouts.json'));
  const outputReport = path.resolve(args['output-report'] || path.join(root,
    'research/notes/2026-11-09-ckt-v51-toned-2121-pindu16-dmin-rhyme-search.json'));
  const baseCount = Number(args.bases || 8);
  const starts = Number(args.starts || 256);
  const retain = Number(args.retain || 64);
  const columnOrders = Number(args.orders || 2);
  const seed = Number(args.seed || 16110721);

  const data = scorer.loadPayload(html);
  const seedInventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const layoutInventory = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const ranking = JSON.parse(fs.readFileSync(rankingFile, 'utf8'));
  const bases = selectBaseLayouts(layoutInventory, ranking, baseCount);
  const auditTokens = buildTokenInventory(data, seedInventory);
  const layoutTokens = buildTokenInventory(data, {...seedInventory,
    auditTokenKeys: seedInventory.layoutTokenKeys});
  const raw = rawRhymeInventory(seedInventory);
  const contract = buildToned2121Contract();
  const motor = projectedMotor(data);
  const orders = permutations([0, 1, 2, 3, 4, 5, 6]);
  const layouts = [];
  const baseReports = [];

  for (let index = 0; index < bases.length; index++) {
    const base = bases[index];
    const tables = buildTables({tokens: auditTokens, tokenKeys: layoutInventory.tokenKeys,
      layout: base, rhymeCount: raw.rhymes.length, indexForPinyin: raw.indexForPinyin,
      contract, motor});
    const candidates = localSearch(tables, raw.rhymes, starts, seed + index * 100003, retain);
    for (let ordinal = 0; ordinal < candidates.length; ordinal++) {
      for (const physical of bestColumnOrders(candidates[ordinal], tables, orders, columnOrders)) {
        layouts.push(makeLayout({base, candidate: candidates[ordinal], physical, raw,
          layoutTokens, tables, contract, ordinal}));
      }
    }
    baseReports.push({id: base.id, assignment: base.assignment, starts,
      uniqueLocalMinimaRetained: candidates.length,
      best: candidates.slice(0, 12).map(value => ({groups: groupsFor(value.labels, raw.rhymes),
        occupiedBuckets: value.occupiedBuckets, tonedSyllableTop1: value.tonedSyllableTop1,
        start: value.start, passes: value.passes}))});
    process.stderr.write(`searched ${base.assignment}: ${starts} starts, ` +
      `${candidates.length} retained\n`);
  }

  const result = {
    version: 'ckt-v5.1-toned-2121-pindu16-dmin-rhyme-layouts-1',
    purpose: 'raw 16-rhyme to seven-bucket multistart search under fixed D11/F9 first codes',
    contract: layoutInventory.contract,
    tokenKeys: seedInventory.layoutTokenKeys,
    layouts,
  };
  const report = {
    version: 'ckt-v5.1-toned-2121-pindu16-dmin-rhyme-search-1',
    rawRhymes: raw.rhymes,
    rawRhymeCount: raw.rhymes.length,
    normalizedRhymeCount: 11,
    normalizationRemoved: {'_': ['_', 'er'], e: ['e', 'o'], en: ['en', 'eng', 'n', 'ng']},
    targetBuckets: 7,
    exactUnlabelledSearchSpace: '3281882604',
    exactLabelledSearchSpace: '16540688324160',
    search: {algorithm: 'deterministic random-restart coordinate ascent', startsPerBase: starts,
      retainedPerBase: retain, exactMotorOrdersRetainedPerCandidate: columnOrders},
    firstConstraint: {traditionalOnsetD: 11, onsetKeyIncidences: 27,
      onsetFragmentation: 9},
    generatedLayouts: layouts.length,
    baseReports,
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({rawRhymes: raw.rhymes, generatedLayouts: layouts.length,
    bases: baseReports}, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {canonicalize, currentRawAssignment, rawRhymeInventory, scoreAssignment};
