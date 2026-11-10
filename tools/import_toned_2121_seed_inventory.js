#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {loadPayload} = require('./score_completion_ckt_v4.js');

const QAOPL_NAMES = Object.freeze([
  'qaopl_old_minimal',
  'qaopl_vshift_minimal',
  'qaopl_nasal_minimal',
  'qaopl_vshift_balanced',
  'qaopl_vshift_precision',
  'qaopl_nasal_precision',
  'qaopl_quality_original',
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

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

function readZipJson(zip, member) {
  return JSON.parse(execFileSync('tar', ['-xOf', zip, member], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }));
}

function embeddedConstant(html, name) {
  const source = fs.readFileSync(html, 'utf8');
  const match = source.match(new RegExp(`^const ${name}=(.*);$`, 'm'));
  if (!match) throw new Error(`missing const ${name} in ${html}`);
  return JSON.parse(match[1]);
}

function compactQaoplCandidate(candidate, tokenKeys) {
  return {
    name: candidate.name,
    label: candidate.label,
    type: candidate.type,
    description: candidate.description,
    metrics: candidate.metrics,
    memory: {
      M: candidate.memory_cost_proxy,
      globalMigrations: 4,
      shengjieExceptions: Object.keys(candidate.state_exceptions || {}).length,
      rhymeFamilyDeviations: candidate.mnemonic_deviations,
      uniformRules: candidate.uniform_rule_count,
    },
    mainRows: candidate.main_rows,
    shapeAuxiliaryKeys: candidate.assist_keys.toUpperCase(),
    globalHead: candidate.global_head,
    stateExceptions: candidate.state_exceptions,
    rhymeColumns: candidate.rhyme_cols,
    columnRoots: candidate.column_roots,
    examples: candidate.examples,
    tonedCodes: tokenKeys.map(key => candidate.tone_syllables[key] || null),
  };
}

function buildInventory({history, html}) {
  const qaoplHtml = path.join(history, 'qaopl_nasal_minimal.html');
  const shenyunZip = path.join(history, 'Shenyun_21key_reproducible.zip');
  const nextSeedZip = path.join(history, '21x21_next_seed_repro.zip');
  const nextSeedJson = path.join(history, '21x21_experimental_candidates.json');
  for (const file of [qaoplHtml, shenyunZip, nextSeedZip, nextSeedJson, html]) {
    if (!fs.existsSync(file)) throw new Error(`missing seed source: ${file}`);
  }

  const qaopl = embeddedConstant(qaoplHtml, 'DATA');
  const shenyunInput = readZipJson(shenyunZip, 'shenyun_21key/input.json');
  const shenyunSelected = readZipJson(shenyunZip, 'shenyun_21key/selected.json');
  const experimental = JSON.parse(fs.readFileSync(nextSeedJson, 'utf8'));
  const benchmark = loadPayload(html);
  const common = new Set(benchmark.base.map(([index]) => index));
  const auditTokenKeys = [...new Set(benchmark.characters
    .filter(row => row[4] && common.has(row[1]))
    .map(row => `${benchmark.pinyin[row[1]]}${row[2]}`))].sort();
  const commonPinyin = new Set(benchmark.base.map(([index]) => benchmark.pinyin[index]));
  const layoutTokenKeys = Object.keys(qaopl[QAOPL_NAMES[0]].tone_syllables)
    .filter(key => commonPinyin.has(key.replace(/[1-5]$/, ''))).sort();
  const decompositionByPinyin = new Map(shenyunInput.rows.map(row => [row.syllable, row]));
  const decomposition = benchmark.base.map(([index]) => {
    const pinyin = benchmark.pinyin[index];
    const row = decompositionByPinyin.get(pinyin);
    if (!row) throw new Error(`Shenyun decomposition missing Common399 pinyin ${pinyin}`);
    return {
      pinyin,
      initial: row.initial,
      medial: row.medial,
      rhymeBody: row.base,
      shengjie: row.shengjie,
      fullFinal: row.fullrime,
    };
  });

  return {
    version: 'ckt-v5.1-toned-2121-seed-inventory-1',
    sources: {
      qaoplHtml: {file: path.basename(qaoplHtml), sha256: sha256(qaoplHtml)},
      shenyun21KeyZip: {file: path.basename(shenyunZip), sha256: sha256(shenyunZip)},
      nextSeedZip: {file: path.basename(nextSeedZip), sha256: sha256(nextSeedZip)},
      nextSeedJson: {file: path.basename(nextSeedJson), sha256: sha256(nextSeedJson)},
      benchmarkHtml: {file: path.basename(html), sha256: sha256(html)},
    },
    auditTokenKeys,
    layoutTokenKeys,
    decomposition,
    qaoplTonedShengjieSeeds: QAOPL_NAMES.map(name => compactQaoplCandidate(qaopl[name], layoutTokenKeys)),
    shenyunUntonedStructuralSeeds: shenyunSelected.map(seed => ({
      label: seed.label,
      id: seed.id,
      firstMap: seed.first_map,
      secondMap: seed.second_map,
      metrics: Object.fromEntries([
        'syllable_error', 'collision_mass', 'occupied', 'unique',
        'ambiguous_cells', 'nondefault_count', 'left_load', 'time_stream',
      ].map(key => [key, seed.metrics[key]])),
    })),
    writtenUntonedSeeds: experimental.map(seed => ({
      id: seed.id,
      name: seed.name,
      toneKeysByTone: seed.tone,
      auxiliaryKeySet: seed.auxiliarySet,
      M: seed.memory?.M,
      initialMap: seed.initialMap,
      finalMap: seed.finalMap,
      metrics: {
        occupied: seed.computed?.unique,
        soundMiss: seed.computed?.soundMiss,
        cktV5: seed.computed?.v5,
      },
    })),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.history || !args.output) {
    throw new Error('usage: --history DIR --output JSON [--html a7_CKT_R11.html]');
  }
  const output = path.resolve(args.output);
  const inventory = buildInventory({
    history: path.resolve(args.history),
    html: path.resolve(args.html || path.join(__dirname, '..', 'a7_CKT_R11.html')),
  });
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    output,
    decomposition: inventory.decomposition.length,
    tonedTokens: inventory.auditTokenKeys.length,
    qaoplSeeds: inventory.qaoplTonedShengjieSeeds.length,
  })}\n`);
}

if (require.main === module) main();

module.exports = {buildInventory, embeddedConstant};
