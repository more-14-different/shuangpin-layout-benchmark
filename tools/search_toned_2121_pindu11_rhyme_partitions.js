#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scorer = require('./score_completion_ckt_v4.js');
const {RHYME_ORDER, normalizeRhymeBody} = require('./audit_pindu_nextgen_image.js');
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

function setPartitions(elementCount, groupCount, visit) {
  if (!(elementCount >= groupCount && groupCount > 0)) return 0;
  const labels = new Uint8Array(elementCount);
  let count = 0;
  function recurse(at, maximum) {
    if (at === elementCount) {
      if (maximum + 1 === groupCount) {
        visit(labels, count);
        count++;
      }
      return;
    }
    const remaining = elementCount - at - 1;
    const upper = Math.min(maximum + 1, groupCount - 1);
    for (let label = 0; label <= upper; label++) {
      const nextMaximum = Math.max(maximum, label);
      if (nextMaximum + 1 + remaining < groupCount) continue;
      labels[at] = label;
      recurse(at + 1, nextMaximum);
    }
  }
  labels[0] = 0;
  recurse(1, 0);
  return count;
}

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index), ...values.slice(index + 1),
  ]).map(rest => [value, ...rest]));
}

function partitionGroups(labels, rhymes = RHYME_ORDER) {
  const groups = Array.from({length: Math.max(...labels) + 1}, () => []);
  for (let index = 0; index < labels.length; index++) groups[labels[index]].push(rhymes[index]);
  return groups;
}

function partitionSignature(labels, rhymes = RHYME_ORDER) {
  return partitionGroups(labels, rhymes).map(group => group.join('+')).join('|');
}

function blockShape(labels) {
  const sizes = new Uint8Array(Math.max(...labels) + 1);
  for (const label of labels) sizes[label]++;
  return [...sizes].sort((left, right) => right - left).join('+');
}

function topBy(values, count, compare) {
  return [...values].sort(compare).slice(0, count);
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

function buildRhymeIndex(seedInventory) {
  const decomposition = new Map(seedInventory.decomposition.map(value => [value.pinyin, value]));
  const rhymeIndex = new Map(RHYME_ORDER.map((value, index) => [value, index]));
  return pinyin => {
    const split = decomposition.get(pinyin);
    if (!split) throw new Error(`missing decomposition for ${pinyin}`);
    const rhyme = normalizeRhymeBody(split.rhymeBody);
    const index = rhymeIndex.get(rhyme);
    if (index === undefined) throw new Error(`missing normalized rhyme ${rhyme}`);
    return index;
  };
}

function firstKeyByToken(layoutInventory, layout) {
  return new Map(layoutInventory.tokenKeys.map((token, index) => [token, layout.tonedCodes[index][0]]));
}

function buildBaseTables({tokens, firstKey, rhymeForPinyin, contract, motor}) {
  const soundIndex = new Map([...contract.soundKeys].map((key, index) => [key, index]));
  const rows = [contract.soundKeysByRow.upper, contract.soundKeysByRow.home,
    contract.soundKeysByRow.lower];
  const cells = Array.from({length: 63}, () => new Float64Array(RHYME_ORDER.length));
  const rhymeColumnMotor = Array.from({length: RHYME_ORDER.length}, () => new Float64Array(7));
  let totalWeight = 0;
  for (const token of tokens) {
    const first = firstKey.get(token.key);
    const firstIndex = soundIndex.get(first);
    if (firstIndex === undefined) throw new Error(`missing first key for ${token.key}`);
    const rhyme = rhymeForPinyin(token.pinyin);
    const cell = firstIndex * 3 + token.row;
    if (token.weight > cells[cell][rhyme]) cells[cell][rhyme] = token.weight;
    for (let column = 0; column < 7; column++) {
      const projection = motor(first + rows[token.row][column]);
      if (!projection) throw new Error(`motor projection failed for ${first}${rows[token.row][column]}`);
      rhymeColumnMotor[rhyme][column] += token.weight * projection.upperMs;
    }
    totalWeight += token.weight;
  }
  return {cells, rhymeColumnMotor, totalWeight};
}

function structuralMetrics(labels, tables) {
  const maximum = new Float64Array(441);
  for (let cell = 0; cell < tables.cells.length; cell++) {
    const weights = tables.cells[cell];
    const offset = cell * 7;
    for (let rhyme = 0; rhyme < labels.length; rhyme++) {
      const weight = weights[rhyme];
      const bucket = offset + labels[rhyme];
      if (weight > maximum[bucket]) maximum[bucket] = weight;
    }
  }
  let occupiedBuckets = 0;
  let topWeight = 0;
  for (const weight of maximum) if (weight > 0) {
    occupiedBuckets++;
    topWeight += weight;
  }
  const groupColumnMotor = Array.from({length: 7}, () => new Float64Array(7));
  for (let rhyme = 0; rhyme < labels.length; rhyme++) for (let column = 0; column < 7; column++) {
    groupColumnMotor[labels[rhyme]][column] += tables.rhymeColumnMotor[rhyme][column];
  }
  const motorLowerBound = groupColumnMotor.reduce((sum, costs) =>
    sum + Math.min(...costs), 0) / tables.totalWeight;
  return {occupiedBuckets, tonedSyllableTop1: topWeight / tables.totalWeight,
    motorLowerBound, groupColumnMotor};
}

function bestColumnOrders(groupColumnMotor, orders, count, totalWeight) {
  const ranked = orders.map(order => ({
    order,
    motorUpperMs: order.reduce((sum, column, group) =>
      sum + groupColumnMotor[group][column], 0) / totalWeight,
  })).sort((left, right) => left.motorUpperMs - right.motorUpperMs ||
    left.order.join('').localeCompare(right.order.join('')));
  return ranked.slice(0, count);
}

function makeLayout({base, labels, ordinal, metrics, physical, layoutTokens,
  firstKey, rhymeForPinyin, contract}) {
  const rows = [contract.soundKeysByRow.upper, contract.soundKeysByRow.home,
    contract.soundKeysByRow.lower];
  const suffix = String(ordinal).padStart(5, '0');
  const id = `RHYME11-D11-${base.assignment.replaceAll('>', '').replaceAll(',', '-')}` +
    `-P${suffix}-C${physical.order.join('')}`;
  return {
    id,
    factorization: 'shengjie-pindu11-rhyme',
    origin: 'exhaustive-pindu11-to-seven-partition-screen',
    parentId: base.id,
    assignment: base.assignment,
    rhymePartitionOrdinal: ordinal,
    rhymePartition: partitionGroups(labels),
    rhymePartitionSignature: partitionSignature(labels),
    rhymeBlockShape: blockShape(labels),
    columnOrder: physical.order,
    physicalSearch: {
      algorithm: 'exact-motor-order-over-7!',
      motorUpperMs: physical.motorUpperMs,
    },
    structuralMetrics: {
      occupiedBuckets: metrics.occupiedBuckets,
      tonedSyllableTop1: metrics.tonedSyllableTop1,
    },
    memoryAudit: {
      ...base.memoryAudit,
      normalizedRhymeCount: 11,
      rhymeBucketCount: 7,
      rhymeMergeReduction: 4,
      onsetKeyIncidences: 27,
      onsetFragmentation: 9,
    },
    tonedCodes: layoutTokens.map(token => {
      const match = token.key.match(/^([a-z]+)([1-5])$/);
      const rhyme = rhymeForPinyin(match[1]);
      const column = physical.order[labels[rhyme]];
      return firstKey.get(token.key) + rows[token.row][column];
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
    'research/config/ckt-v51-toned-2121-pindu11-dmin-rhyme-partition-layouts.json'));
  const outputReport = path.resolve(args['output-report'] || path.join(root,
    'research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-dmin-rhyme-partitions.json'));
  const baseCount = Number(args.bases || 8);
  const retain = Number(args.retain || 256);
  const uniform = Number(args.uniform || 256);
  const columnOrders = Number(args.orders || 2);

  const data = scorer.loadPayload(html);
  const seedInventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const layoutInventory = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const ranking = JSON.parse(fs.readFileSync(rankingFile, 'utf8'));
  const bases = selectBaseLayouts(layoutInventory, ranking, baseCount);
  if (bases.length !== baseCount) throw new Error(`only found ${bases.length} unique D11 bases`);
  const auditTokens = buildTokenInventory(data, seedInventory);
  const layoutTokens = buildTokenInventory(data, {...seedInventory,
    auditTokenKeys: seedInventory.layoutTokenKeys});
  const rhymeForPinyin = buildRhymeIndex(seedInventory);
  const contract = buildToned2121Contract();
  const motor = projectedMotor(data);
  const orders = permutations([0, 1, 2, 3, 4, 5, 6]);
  const outputs = [];
  const baseReports = [];
  let exactPartitionCount = 0;

  for (const base of bases) {
    const firstKey = firstKeyByToken(layoutInventory, base);
    const tables = buildBaseTables({tokens: auditTokens, firstKey, rhymeForPinyin,
      contract, motor});
    const all = [];
    const byShape = new Map();
    exactPartitionCount = setPartitions(RHYME_ORDER.length, 7, (labels, ordinal) => {
      const copy = [...labels];
      const metrics = structuralMetrics(copy, tables);
      const value = {labels: copy, ordinal, ...metrics, shape: blockShape(copy)};
      all.push(value);
      const previous = byShape.get(value.shape);
      if (!previous || value.tonedSyllableTop1 > previous.tonedSyllableTop1) {
        byShape.set(value.shape, value);
      }
    });

    const chosen = new Map();
    const add = values => values.forEach(value => chosen.set(value.ordinal, value));
    add(topBy(all, retain, (left, right) =>
      right.tonedSyllableTop1 - left.tonedSyllableTop1 ||
      right.occupiedBuckets - left.occupiedBuckets));
    add(topBy(all, retain, (left, right) =>
      right.occupiedBuckets - left.occupiedBuckets ||
      right.tonedSyllableTop1 - left.tonedSyllableTop1));
    add(topBy(all, retain, (left, right) =>
      left.motorLowerBound - right.motorLowerBound ||
      right.tonedSyllableTop1 - left.tonedSyllableTop1));
    const stride = Math.max(1, Math.floor(all.length / uniform));
    add(all.filter((value, index) => index % stride === 0).slice(0, uniform));
    add([...byShape.values()]);
    const current = all.find(value => value.labels.every((label, index) =>
      label === CURRENT_FIXED_PARTITION[index]));
    if (!current) throw new Error('current fixed four-pair partition missing');
    add([current]);

    const selected = [...chosen.values()];
    for (const candidate of selected) {
      for (const physical of bestColumnOrders(candidate.groupColumnMotor, orders,
        columnOrders, tables.totalWeight)) {
        outputs.push(makeLayout({base, labels: candidate.labels, ordinal: candidate.ordinal,
          metrics: candidate, physical, layoutTokens, firstKey, rhymeForPinyin, contract}));
      }
    }
    const bestWeighted = topBy(all, 1, (left, right) =>
      right.tonedSyllableTop1 - left.tonedSyllableTop1)[0];
    const bestCapacity = topBy(all, 1, (left, right) =>
      right.occupiedBuckets - left.occupiedBuckets ||
      right.tonedSyllableTop1 - left.tonedSyllableTop1)[0];
    baseReports.push({
      id: base.id,
      assignment: base.assignment,
      baselineScore: base.baselineScore,
      evaluatedPartitions: all.length,
      retainedPartitions: selected.length,
      generatedLayouts: selected.length * columnOrders,
      blockShapes: [...byShape.keys()].sort(),
      bestWeighted: {
        ordinal: bestWeighted.ordinal,
        partition: partitionGroups(bestWeighted.labels),
        occupiedBuckets: bestWeighted.occupiedBuckets,
        tonedSyllableTop1: bestWeighted.tonedSyllableTop1,
      },
      bestCapacity: {
        ordinal: bestCapacity.ordinal,
        partition: partitionGroups(bestCapacity.labels),
        occupiedBuckets: bestCapacity.occupiedBuckets,
        tonedSyllableTop1: bestCapacity.tonedSyllableTop1,
      },
    });
    process.stderr.write(`enumerated ${base.assignment}: ${all.length} partitions, ` +
      `${selected.length} retained\n`);
  }

  const result = {
    version: 'ckt-v5.1-toned-2121-pindu11-dmin-rhyme-partition-layouts-1',
    purpose: 'exact normalized 11-rhyme to seven nonempty-bucket partition enumeration under D11/F9 first codes',
    contract: layoutInventory.contract,
    tokenKeys: seedInventory.layoutTokenKeys,
    layouts: outputs,
  };
  const report = {
    version: 'ckt-v5.1-toned-2121-pindu11-dmin-rhyme-partitions-1',
    normalizedRhymes: RHYME_ORDER,
    rawRhymeBodyCount: 16,
    normalizedRhymeCount: 11,
    targetBuckets: 7,
    exactUnlabelledPartitionCount: exactPartitionCount,
    labelledSurjectionCount: exactPartitionCount * orders.length,
    baseCount: bases.length,
    exactEvaluatedBasePartitionPairs: exactPartitionCount * bases.length,
    retainedPerMetric: retain,
    uniformRetained: uniform,
    exactMotorOrdersRetainedPerPartition: columnOrders,
    generatedLayouts: outputs.length,
    firstConstraint: {traditionalOnsetD: 11, onsetKeyIncidences: 27,
      onsetFragmentation: 9},
    baseReports,
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    exactPartitionCount,
    labelledSurjectionCount: exactPartitionCount * orders.length,
    exactEvaluatedBasePartitionPairs: exactPartitionCount * bases.length,
    generatedLayouts: outputs.length,
    bases: baseReports,
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  blockShape,
  partitionGroups,
  partitionSignature,
  setPartitions,
};
