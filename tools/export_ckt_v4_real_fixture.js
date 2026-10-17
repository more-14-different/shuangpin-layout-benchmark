#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_COGNITIVE_PRIOR,
  resolveCompetition,
  summarizeOutcomes,
  upstreamMotor,
  projectedMotor,
} = require('./ckt_v4_model.js');
const {loadPayload, strokeOptions, multiwords, buildRows} = require('./score_completion_ckt_v4.js');

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./";
const PARAMETERS = DEFAULT_COGNITIVE_PRIOR;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

function serializeRows(rows) {
  return rows.map(row => ({
    id: row.id,
    text: row.text,
    kind: row.kind,
    weight: row.weight,
    baseLength: row.baseLength,
    stages: row.stages.map(stage => ({order: stage.order, pool: stage.pool, codes: stage.codes})),
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(__dirname, '..');
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const html = path.resolve(args.html || path.join(repo, 'a7_CKT_R11.html'));
  const snapshotFile = path.resolve(args.motor || path.join(__dirname, 'ckt_v4_upstream_role_tables.json'));
  const output = path.resolve(args.output || path.join(repo, 'research', '.cache', 'ckt-v4-real-reference.json'));
  const ids = String(args.ids || 'S005,L600').split(',').filter(Boolean);
  const mass = Number(args.mass || 0.99);
  const data = loadPayload(html);
  const entries = ids.map(id => data.entries.find(entry => entry.id === id));
  if (entries.some(entry => !entry)) throw new Error(`unknown scheme id in ${ids.join(',')}`);
  const strokes = strokeOptions(path.join(snow, 'rime-stroke', 'stroke.dict.yaml'));
  const words = multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, mass);
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const native = upstreamMotor(snapshot);
  const extensionMaps = data.ckt.calibration.extension_maps;

  fs.mkdirSync(path.dirname(output), {recursive: true});
  const descriptor = fs.openSync(output, 'w');
  fs.writeSync(descriptor, JSON.stringify({
    version: 'ckt-v4-real-js-reference-1',
    source: 'tools/score_completion_ckt_v4.js',
    keyAlphabet: ALPHABET,
    cognitiveParameters: PARAMETERS,
    extensionMaps,
    corpus: {mass, word2: words.word2.length, word3: words.word3.length, word4: words.word4.length},
  }).replace(/}$/, ',"cases":['));
  let first = true;
  for (const entry of entries) {
    const motor = projectedMotor(native, snapshot.keys, extensionMaps);
    for (const mode of ['keytao', 'sanpin']) {
      const rows = buildRows(entry, data, strokes, words, mode);
      const outcomes = resolveCompetition(rows, {motorCost: motor});
      const item = {
        schemeId: entry.id,
        capacity: entry.capacity,
        mode,
        rows: serializeRows(rows),
        expectedSummary: summarizeOutcomes(outcomes, PARAMETERS),
      };
      fs.writeSync(descriptor, `${first ? '' : ','}${JSON.stringify(item)}`);
      first = false;
      process.stderr.write(`exported ${entry.id}/${mode}: ${rows.length} rows\n`);
    }
  }
  fs.writeSync(descriptor, ']}\n');
  fs.closeSync(descriptor);
  process.stderr.write(`wrote ${output}\n`);
}

main();
