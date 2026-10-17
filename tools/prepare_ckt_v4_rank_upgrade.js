#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {DEFAULT_COGNITIVE_PRIOR} = require('./ckt_v4_model.js');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(__dirname, '..');
  const resultsFile = path.resolve(args.results || path.join(repo, 'docs', 'CKT_v4_ALL_SCHEMES_RESULTS.json'));
  const statsFile = path.resolve(args.stats || path.join(repo, 'research', '.cache', 'ckt-v4-rank-stats-parts'));
  const fallbackFile = path.resolve(args.fallback || path.join(repo, 'research', '.cache', 'ckt-v4-rank-fallback.json'));
  const outputFile = path.resolve(args.output || path.join(repo, 'research', '.cache', 'ckt-v4-rank-aware-parts', 'part-000.json'));
  const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  const statFiles = fs.statSync(statsFile).isDirectory()
    ? fs.readdirSync(statsFile).filter(name => /^part-\d+\.json$/.test(name)).sort()
      .map(name => path.join(statsFile, name))
    : [statsFile];
  if (!statFiles.length) throw new Error(`no rank-stat parts in ${statsFile}`);
  const statParts = statFiles.map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
  const stats = {version: 'ckt-v4-rank-stats-1', pageSize: statParts[0].pageSize, schemes: {}, skipped: {}};
  let expectedOffset = 0;
  for (const part of statParts) {
    if (part.version !== stats.version || part.pageSize !== stats.pageSize
        || part.totalSchemes !== statParts[0].totalSchemes || part.offset !== expectedOffset
        || JSON.stringify(part.sourceHashes) !== JSON.stringify(statParts[0].sourceHashes)) {
      throw new Error(`rank-stat part metadata/range mismatch at offset ${part.offset}`);
    }
    expectedOffset += part.limit;
    for (const field of ['schemes', 'skipped']) {
      for (const [id, value] of Object.entries(part[field] || {})) {
        if (stats.schemes[id] || stats.skipped[id]) throw new Error(`duplicate rank-stat scheme ${id}`);
        stats[field][id] = value;
      }
    }
  }
  if (expectedOffset !== statParts[0].totalSchemes) {
    throw new Error(`rank-stat range incomplete: ${expectedOffset}/${statParts[0].totalSchemes}`);
  }
  const fallback = JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
  if (stats.pageSize !== DEFAULT_COGNITIVE_PRIOR.pageSize) {
    throw new Error(`unsupported rank stats ${stats.version}/${stats.pageSize}`);
  }
  const resultIds = Object.keys(results.schemes).sort();
  const statsIds = Object.keys(stats.schemes).sort();
  const skippedIds = Object.keys(stats.skipped || {}).sort();
  const fallbackIds = Object.keys(fallback.schemes || {}).sort();
  if (JSON.stringify([...statsIds, ...skippedIds].sort()) !== JSON.stringify(resultIds)
      || JSON.stringify(fallbackIds) !== JSON.stringify(skippedIds)) {
    throw new Error(`scheme coverage differs: results=${resultIds.length}, native=${statsIds.length}, skipped=${skippedIds.length}, fallback=${fallbackIds.length}`);
  }
  let maximumRankDifference = 0;
  let tracks = 0;
  for (const id of resultIds) {
    for (const mode of ['keytao', 'sanpin']) {
      for (const kind of ['character', 'word2', 'word3', 'word4']) {
        const row = results.schemes[id].modes[mode][kind];
        const rank = stats.schemes[id]?.[mode]?.[kind] || fallback?.schemes?.[id]?.modes?.[mode]?.[kind];
        if (!rank) throw new Error(`${id}/${mode}/${kind}: missing rank statistics`);
        const difference = Math.abs(row.meanTerminalRank - rank.meanTerminalRank);
        maximumRankDifference = Math.max(maximumRankDifference, difference);
        if (difference > 1e-10) throw new Error(`${id}/${mode}/${kind}: native/JS rank differs by ${difference}`);
        row.meanRejectedCandidates = rank.meanRejectedCandidates;
        row.meanPageActions = rank.meanPageActions;
        tracks++;
      }
    }
  }
  const part = {
    version: 'completion-ckt-v4-rank-cognition-2',
    upstream: results.upstream,
    keyDomain: results.keyDomain,
    corpus: results.corpus,
    cognitiveParameters: DEFAULT_COGNITIVE_PRIOR,
    caveats: [
      ...(results.caveats || []).filter(value => !value.includes('cognitive coefficients')),
      'rank-aware cognitive coefficients are declared scenario parameters, not fitted by the upstream motor experiment',
    ],
    schemes: results.schemes,
  };
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  fs.writeFileSync(outputFile, `${JSON.stringify(part)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({schemes: resultIds.length, nativeSchemes: statsIds.length,
    fallbackSchemes: fallbackIds.length, tracks, maximumRankDifference, outputFile})}\n`);
}

if (require.main === module) main();

module.exports = {main};
