#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  loadPayload,
  strokeOptions,
  multiwords,
  buildRows,
} = require('./score_completion_ckt_v4.js');
const {resolveCompetition} = require('./ckt_v4_model.js');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

function summarize(rows) {
  const outcomes = resolveCompetition(rows);
  const byTerminal = new Map();
  for (const outcome of outcomes) {
    const key = `${outcome.pool}\u0000${outcome.code}`;
    if (!byTerminal.has(key)) byTerminal.set(key, []);
    byTerminal.get(key).push(outcome);
  }
  const result = {};
  for (const kind of ['word2', 'word3', 'word4']) {
    const residual = outcomes.filter(value => value.kind === kind && value.rank > 1);
    const bucketKeys = new Set(residual.map(value => `${value.pool}\u0000${value.code}`));
    result[kind] = {
      buckets: bucketKeys.size,
      residualEntries: residual.length,
      crossLengthBuckets: [...bucketKeys].filter(key =>
        new Set(byTerminal.get(key).map(value => value.kind)).size > 1).length,
      maxBucketSize: Math.max(0, ...[...bucketKeys].map(key =>
        Math.max(...byTerminal.get(key).map(value => value.rank)))),
    };
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.html || !args.ids || !args.output) {
    throw new Error('usage: score_terminal_buckets.js --html HTML --ids ID[,ID] --output JSON [--snow DIR]');
  }
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const data = loadPayload(path.resolve(args.html));
  const strokes = strokeOptions(path.join(snow, 'rime-stroke', 'stroke.dict.yaml'));
  const words = multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, Number(args.mass || 0.99));
  const output = {};
  for (const id of String(args.ids).split(',').filter(Boolean)) {
    const entry = data.entries.find(value => value.id === id);
    if (!entry) throw new Error(`unknown scheme ${id}`);
    output[id] = {};
    for (const mode of ['keytao', 'sanpin']) {
      output[id][mode] = summarize(buildRows(entry, data, strokes, words, mode));
    }
  }
  fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}

if (require.main === module) main();
