#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.layouts || !args.scores || !args.output) {
    throw new Error('usage: select_toned_2121_scored_layouts.js --layouts FILE --scores FILE --output FILE [--top N]');
  }
  const layoutsFile = path.resolve(args.layouts);
  const scoresFile = path.resolve(args.scores);
  const output = path.resolve(args.output);
  const top = Number(args.top || 1);
  const payload = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const scores = JSON.parse(fs.readFileSync(scoresFile, 'utf8'));
  const selectedScores = scores.results.slice(0, top);
  const byId = new Map(payload.layouts.map(value => [value.id, value]));
  const layouts = selectedScores.map(result => {
    const layout = byId.get(result.id);
    if (!layout) throw new Error(`scored layout not found: ${result.id}`);
    return layout;
  });
  const result = {
    ...payload,
    version: `${payload.version}-scored-finalists-1`,
    selection: {
      sourceLayouts: path.basename(layoutsFile),
      sourceScores: path.basename(scoresFile),
      objective: 'CKT v5.1 ascending',
      top,
      scores: selectedScores.map(value => ({id: value.id, score: value.score})),
    },
    layouts,
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result.selection, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {parseArgs};
