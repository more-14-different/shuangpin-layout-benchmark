#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {parseArgs, hashFile} = require('./export_ckt_v4_binary_fixture.js');
const {loadPayload} = require('./score_completion_ckt_v4.js');
const {ALPHABET} = require('./ckt_v4_scheme_fixture.js');
const {toneKeysFromShapeKeys} = require('./auxiliary_semantics.js');
const {imageFirstKey} = require('./audit_pindu_nextgen_image.js');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const layoutsFile = path.resolve(args.layouts || path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-dmin-column-finalists.json'));
  const scoresFile = path.resolve(args.scores || path.join(root,
    'research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-dmin-column-full.json'));
  const seedsFile = path.resolve(args.seeds || path.join(root,
    'research/config/ckt-v51-toned-2121-seeds.json'));
  const output = path.resolve(args.output || path.join(root,
    'research/.cache/ckt-v51-toned-2121-rust-trial.json'));
  const requestedId = String(args.id || 'LOWMD-pindu11-499309-C0412356');
  const shapeKeysByMeaning = String(args.shape || 'QAOPL').toUpperCase();

  const data = loadPayload(html);
  const layouts = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const scores = JSON.parse(fs.readFileSync(scoresFile, 'utf8'));
  const seeds = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const layout = layouts.layouts.find(value => value.id === requestedId);
  const scored = scores.results.find(value => value.id === requestedId);
  if (!layout) throw new Error(`layout not found: ${requestedId}`);
  if (!scored) throw new Error(`score not found: ${requestedId}`);

  const decomposition = new Map(seeds.decomposition.map(value => [value.pinyin, value]));
  const pinyinIndex = new Map(data.pinyin.map((value, index) => [value, index]));
  const tonedCodes = Array.from({length: data.pinyin.length}, () => Array(5).fill(null));
  for (let index = 0; index < layouts.tokenKeys.length; index++) {
    const match = layouts.tokenKeys[index].match(/^([a-z]+)([1-5])$/u);
    if (!match) throw new Error(`invalid toned token ${layouts.tokenKeys[index]}`);
    const py = pinyinIndex.get(match[1]);
    if (py === undefined) throw new Error(`unknown pinyin ${match[1]}`);
    tonedCodes[py][Number(match[2]) - 1] = layout.tonedCodes[index];
  }

  const atoms = new Map();
  for (let py = 0; py < tonedCodes.length; py++) {
    const active = tonedCodes[py].filter(Boolean);
    if (!active.length) continue;
    const split = decomposition.get(data.pinyin[py]);
    if (!split) throw new Error(`missing decomposition for ${data.pinyin[py]}`);
    const keys = new Set(active.map(code => code[0]));
    if (keys.size !== 1) throw new Error(`${data.pinyin[py]} flies across first keys`);
    const existing = atoms.get(split.shengjie) || {
      name: split.shengjie,
      initial: split.initial,
      baselineKey: [...keys][0],
      pinyin: [],
    };
    if (existing.initial !== split.initial || existing.baselineKey !== [...keys][0]) {
      throw new Error(`non-atomic shengjie ${split.shengjie}`);
    }
    existing.pinyin.push(py);
    atoms.set(split.shengjie, existing);
  }

  const trackNames = ['character', 'word2', 'word3', 'word4'];
  const fixture = {
    version: 'ckt-v51-toned-2121-rust-trial-1',
    layoutId: requestedId,
    keyAlphabet: ALPHABET,
    shapeKeysByMeaning,
    toneKeysByTone: toneKeysFromShapeKeys(shapeKeysByMeaning),
    soundKeys: layouts.contract.soundKeys,
    policy: {word2: '12', word3: '213', word4: '24'},
    baselineMemoryGuard: Number(layout.memoryAudit?.conservativeMGuard ?? 26),
    expected: {
      score: scored.score,
      tracks: Object.fromEntries(trackNames.map(name => [name, scored.tracks[name]])),
      traditionalOnsetD: Number(layout.memoryAudit?.traditionalOnsetD ?? 11),
      onsetFragmentation: Number(layout.memoryAudit?.onsetFragmentation ?? 9),
    },
    referenceEffectiveMs: trackNames.map(name => scores.reference.tracks[name].effectiveMs),
    pinyin: data.pinyin,
    tonedCodes,
    atoms: [...atoms.values()].sort((left, right) => left.name.localeCompare(right.name)),
    canonicalInitialKeys: Object.fromEntries(
      ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's']
        .map(initial => [initial, imageFirstKey(initial)])),
    sourceHashes: {
      html: hashFile(html),
      layouts: hashFile(layoutsFile),
      scores: hashFile(scoresFile),
      seeds: hashFile(seedsFile),
    },
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stderr.write(`wrote ${output}: ${fixture.atoms.length} atoms, ` +
    `${fixture.tonedCodes.flat().filter(Boolean).length} toned codes\n`);

  if (args.candidate) {
    const match = String(args.candidate).match(/^([^:]+):([A-Z])$/u);
    if (!match) throw new Error('--candidate must be SHENGJIE:KEY');
    const [, atom, destination] = match;
    if (![...layouts.contract.soundKeys].includes(destination)) {
      throw new Error(`candidate destination is not a sound key: ${destination}`);
    }
    const candidate = {
      ...layout,
      id: `${requestedId}-${atom}>${destination}`,
      parentId: requestedId,
      trialShengjieException: {atom, destination},
      tonedCodes: layout.tonedCodes.map((code, index) => {
        const token = layouts.tokenKeys[index].match(/^([a-z]+)([1-5])$/u);
        return decomposition.get(token[1]).shengjie === atom ? destination + code[1] : code;
      }),
    };
    const candidateOutput = path.resolve(args['candidate-layouts'] || path.join(root,
      'research/.cache/ckt-v51-toned-rust-trial-candidate-layouts.json'));
    fs.mkdirSync(path.dirname(candidateOutput), {recursive: true});
    fs.writeFileSync(candidateOutput, `${JSON.stringify({...layouts, layouts: [candidate]}, null, 2)}\n`, 'utf8');
    process.stderr.write(`wrote ${candidateOutput}: ${candidate.id}\n`);
  }
}

if (require.main === module) main();
