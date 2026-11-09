#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scorer = require('./score_completion_ckt_v4.js');
const {
  buildReference,
  projectedMotor,
  sampleCorpus,
  scoreFixedPolicy,
} = require('./score_toned_2121_ckt_v51.js');
const {buildToned2121Contract} = require('./toned_2121_contract.js');

const FIXED_POLICY = Object.freeze({word2: '12', word3: '213', word4: '24'});
const FIXED_SHAPE_KEYS_BY_MEANING = 'QAOPL';

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
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index), ...values.slice(index + 1),
  ]).map(rest => [value, ...rest]));
}

function reorderColumns(layout, order, contract) {
  const rows = [contract.soundKeysByRow.upper, contract.soundKeysByRow.home,
    contract.soundKeysByRow.lower];
  const replacement = new Map();
  for (const row of rows) for (let column = 0; column < 7; column++) {
    replacement.set(row[column], row[order[column]]);
  }
  return {
    ...layout,
    id: `${layout.id}-C${order.join('')}`,
    parentId: layout.id,
    columnOrder: order,
    tonedCodes: layout.tonedCodes.map(code => code[0] + replacement.get(code[1])),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const layoutsFile = path.resolve(args.layouts || path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-lowmd-layouts.json'));
  const reports = String(args.reports || [
    'research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-lowmd-full-round1.json',
    'research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-lowmd-full-round2.json',
  ].join(',')).split(',').map(value => path.resolve(value));
  const outputLayouts = path.resolve(args['output-layouts'] || path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-lowmd-column-finalists.json'));
  const outputReport = path.resolve(args['output-report'] || path.join(root,
    'research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-lowmd-column-screen.json'));
  const baseCount = Number(args.bases || 8);
  const retainPerBase = Number(args.retain || 4);
  const sampleCount = Number(args.sample || 120);

  const layouts = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const byId = new Map(layouts.layouts.map(value => [value.id, value]));
  const ranking = reports.flatMap(file => JSON.parse(fs.readFileSync(file, 'utf8')).results)
    .sort((left, right) => left.score - right.score);
  const bases = ranking.slice(0, baseCount).map(value => byId.get(value.id));
  if (bases.some(value => !value)) throw new Error('ranked base layout missing');

  const fullData = scorer.loadPayload(html);
  const fullWords = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), fullData, 0.99);
  const corpus = sampleCorpus(fullData, fullWords, sampleCount);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const motor = projectedMotor(corpus.data);
  const reference = buildReference({data: corpus.data, words: corpus.words, strokes, motor, snow});
  const contract = buildToned2121Contract();
  const orders = permutations([0, 1, 2, 3, 4, 5, 6]);
  const retained = [];
  const baseAudit = [];

  for (const base of bases) {
    const scored = orders.map(order => {
      const layout = reorderColumns(base, order, contract);
      const result = scoreFixedPolicy({
        layout,
        layouts,
        data: corpus.data,
        words: corpus.words,
        motor,
        reference,
        shapeKeysByMeaning: FIXED_SHAPE_KEYS_BY_MEANING,
        policy: FIXED_POLICY,
      });
      return {layout, score: result.score};
    }).sort((left, right) => left.score - right.score);
    retained.push(...scored.slice(0, retainPerBase));
    baseAudit.push({
      id: base.id,
      assignment: base.assignment,
      evaluatedColumnOrders: orders.length,
      best: scored.slice(0, 12).map(value => ({
        id: value.layout.id,
        columnOrder: value.layout.columnOrder,
        sampleScore: value.score,
      })),
    });
    process.stderr.write(`screened ${base.id}: ${scored[0].score.toFixed(9)} C${scored[0].layout.columnOrder.join('')}\n`);
  }
  retained.sort((left, right) => left.score - right.score);
  const output = {
    ...layouts,
    version: 'ckt-v5.1-toned-2121-pindu11-lowmd-column-finalists-1',
    purpose: 'column-order finalists after exact 7! screening per low-MD first projection',
    layouts: retained.map(value => ({...value.layout, columnScreenScore: value.score})),
  };
  const report = {
    version: 'ckt-v5.1-toned-2121-pindu11-lowmd-column-screen-1',
    fixedPolicy: FIXED_POLICY,
    fixedShapeKeysByMeaning: FIXED_SHAPE_KEYS_BY_MEANING,
    sampleRowsPerTrack: sampleCount,
    baseCount,
    columnOrdersPerBase: orders.length,
    evaluatedLayouts: baseCount * orders.length,
    retainedPerBase: retainPerBase,
    baseAudit,
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    evaluatedLayouts: report.evaluatedLayouts,
    retained: output.layouts.length,
    best: retained.slice(0, 20).map(value => ({
      id: value.layout.id,
      assignment: value.layout.assignment,
      columnOrder: value.layout.columnOrder,
      sampleScore: value.score,
    })),
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {permutations, reorderColumns};
