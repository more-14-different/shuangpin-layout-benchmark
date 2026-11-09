#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {parseArgs, hashFile} = require('./export_ckt_v4_binary_fixture.js');
const {loadPayload} = require('./score_completion_ckt_v4.js');
const {ALPHABET} = require('./ckt_v4_scheme_fixture.js');
const {toneKeysFromShapeKeys} = require('./auxiliary_semantics.js');
const {
  imageFirstKey,
  normalizeRhymeBody,
  RHYME_ORDER,
} = require('./audit_pindu_nextgen_image.js');

const TRADITIONAL_INITIALS = Object.freeze(
  ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's']);

function onsetDiagnostics(atoms, canonicalInitialKeys) {
  const incidences = new Map(TRADITIONAL_INITIALS.map(initial => [initial, new Set()]));
  for (const atom of atoms) {
    const initial = atom.initial[0];
    if (!incidences.has(initial)) continue;
    incidences.get(initial).add(atom.baselineKey);
  }
  const traditionalOnsetD = [...incidences].filter(([initial, keys]) =>
    [...keys].some(key => key !== canonicalInitialKeys[initial])).length;
  const onsetFragmentation = [...incidences.values()]
    .reduce((sum, keys) => sum + keys.size, 0) - incidences.size;
  return {traditionalOnsetD, onsetFragmentation,
    onsetKeyIncidences: onsetFragmentation + incidences.size};
}

function toneRegions(contract) {
  const assignment = contract.primaryToneRowAssignment;
  if (!assignment || !contract.soundKeysByRow) return [];
  return Object.entries(contract.soundKeysByRow).map(([name, keys]) => {
    const tones = [...assignment[name]];
    if (tones.includes(1) && contract.neutralTonePolicy === 'follow-tone1') tones.push(5);
    return {name, keys, tones};
  });
}

function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

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
  const rhymeAtoms = new Map();
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
    const rhymeName = normalizeRhymeBody(split.rhymeBody);
    const rhyme = rhymeAtoms.get(rhymeName) || {name: rhymeName, pinyin: []};
    rhyme.pinyin.push(py);
    rhymeAtoms.set(rhymeName, rhyme);
  }

  const orderedAtoms = [...atoms.values()].sort((left, right) => left.name.localeCompare(right.name));
  const orderedRhymes = RHYME_ORDER.map(name => rhymeAtoms.get(name));
  if (orderedRhymes.some(value => !value)) throw new Error('fixture does not cover all Pindu11 rhymes');
  const regions = toneRegions(layouts.contract);
  for (const rhyme of orderedRhymes) {
    rhyme.baselineKeys = {};
    for (const region of regions) {
      const keys = new Set();
      for (const py of rhyme.pinyin) for (const tone of region.tones) {
        const code = tonedCodes[py][tone - 1];
        if (code) keys.add(code[1]);
      }
      if (keys.size !== 1) {
        throw new Error(`${rhyme.name}/${region.name} has ${keys.size} baseline second keys`);
      }
      rhyme.baselineKeys[region.name] = [...keys][0];
    }
  }
  const computedMergeLower = regions.reduce((total, region) => total +
    orderedRhymes.length - new Set(orderedRhymes.map(rhyme => rhyme.baselineKeys[region.name])).size,
  0);
  const declaredMergeLower = Number(layout.memoryAudit?.toneRegionMergeLower ?? computedMergeLower);
  if (declaredMergeLower !== computedMergeLower) {
    throw new Error(`declared tone-region merge lower ${declaredMergeLower} differs from codes ` +
      `${computedMergeLower}`);
  }

  const canonicalInitialKeys = Object.fromEntries(
    TRADITIONAL_INITIALS.map(initial => [initial, imageFirstKey(initial)]));
  const computedDiagnostics = onsetDiagnostics(orderedAtoms, canonicalInitialKeys);
  const declaredDiagnostics = {
    traditionalOnsetD: Number(layout.memoryAudit?.traditionalOnsetD),
    onsetFragmentation: Number(layout.memoryAudit?.onsetFragmentation),
  };
  const declaredDiagnosticsMismatch =
    (Number.isFinite(declaredDiagnostics.traditionalOnsetD) &&
      declaredDiagnostics.traditionalOnsetD !== computedDiagnostics.traditionalOnsetD) ||
    (Number.isFinite(declaredDiagnostics.onsetFragmentation) &&
      declaredDiagnostics.onsetFragmentation !== computedDiagnostics.onsetFragmentation);
  if (declaredDiagnosticsMismatch) {
    process.stderr.write(`warning: declared D/F ${declaredDiagnostics.traditionalOnsetD}/` +
      `${declaredDiagnostics.onsetFragmentation} differs from codes ` +
      `${computedDiagnostics.traditionalOnsetD}/${computedDiagnostics.onsetFragmentation}\n`);
  }

  const trackNames = ['character', 'word2', 'word3', 'word4'];
  const fixture = {
    version: 'ckt-v51-toned-2121-rust-trial-2',
    layoutId: requestedId,
    keyAlphabet: ALPHABET,
    shapeKeysByMeaning,
    toneKeysByTone: toneKeysFromShapeKeys(shapeKeysByMeaning),
    soundKeys: layouts.contract.soundKeys,
    policy: {word2: '12', word3: '213', word4: '24'},
    baselineMemoryLower: Number(layout.memoryAudit?.lowerM ??
      layout.memoryAudit?.conservativeMGuard ?? 26),
    baselineMemoryGuard: Number(layout.memoryAudit?.conservativeMGuard ?? 26),
    baselineToneRegionMergeLower: computedMergeLower,
    expected: {
      score: scored.score,
      tracks: Object.fromEntries(trackNames.map(name => [name, scored.tracks[name]])),
      traditionalOnsetD: computedDiagnostics.traditionalOnsetD,
      onsetFragmentation: computedDiagnostics.onsetFragmentation,
      declaredDiagnostics,
    },
    referenceEffectiveMs: trackNames.map(name => scores.reference.tracks[name].effectiveMs),
    pinyin: data.pinyin,
    tonedCodes,
    atoms: orderedAtoms,
    rhymeAtoms: orderedRhymes,
    toneRegions: regions,
    canonicalInitialKeys,
    sourceHashes: {
      html: hashFile(html),
      layouts: hashFile(layoutsFile),
      scores: hashFile(scoresFile),
      seeds: hashFile(seedsFile),
      contract: hashJson({
        version: 'ckt-v51-toned-2121-rust-trial-2',
        shapeKeysByMeaning,
        soundKeys: layouts.contract.soundKeys,
        toneRegions: regions,
      }),
    },
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stderr.write(`wrote ${output}: ${fixture.atoms.length} atoms, ` +
    `${fixture.tonedCodes.flat().filter(Boolean).length} toned codes\n`);

  if (args.candidate || args['candidate-rhyme']) {
    let candidateCodes = [...layout.tonedCodes];
    const suffixes = [];
    const trial = {};
    if (args.candidate) {
      const match = String(args.candidate).match(/^([^:]+):([A-Z])$/u);
      if (!match) throw new Error('--candidate must be SHENGJIE:KEY');
      const [, atom, destination] = match;
      if (![...layouts.contract.soundKeys].includes(destination)) {
        throw new Error(`candidate destination is not a sound key: ${destination}`);
      }
      if (!atoms.has(atom)) throw new Error(`unknown shengjie atom: ${atom}`);
      suffixes.push(`${atom}>${destination}`);
      trial.trialShengjieException = {atom, destination};
      candidateCodes = candidateCodes.map((code, index) => {
        const token = layouts.tokenKeys[index].match(/^([a-z]+)([1-5])$/u);
        return decomposition.get(token[1]).shengjie === atom ? destination + code[1] : code;
      });
    }
    if (args['candidate-rhyme']) {
      const match = String(args['candidate-rhyme']).match(/^([^:]+):([^:]+):([A-Z])$/u);
      if (!match) throw new Error('--candidate-rhyme must be REGION:RHYME:KEY');
      const [, regionName, rhymeName, destination] = match;
      const region = regions.find(value => value.name === regionName);
      if (!region) throw new Error(`unknown candidate rhyme region: ${regionName}`);
      if (!region.keys.includes(destination)) {
        throw new Error(`candidate rhyme destination leaves ${regionName}: ${destination}`);
      }
      if (!RHYME_ORDER.includes(rhymeName)) throw new Error(`unknown Pindu11 rhyme: ${rhymeName}`);
      suffixes.push(`${regionName}:${rhymeName}>${destination}`);
      trial.trialRhymeException = {region: regionName, rhyme: rhymeName, destination};
      candidateCodes = candidateCodes.map((code, index) => {
        const token = layouts.tokenKeys[index].match(/^([a-z]+)([1-5])$/u);
        const split = decomposition.get(token[1]);
        return region.tones.includes(Number(token[2])) &&
          normalizeRhymeBody(split.rhymeBody) === rhymeName ? code[0] + destination : code;
      });
    }
    const firstExceptionCount = trial.trialShengjieException ? 1 : 0;
    const candidateAtoms = orderedAtoms.map(value => ({
      ...value,
      baselineKey: value.name === trial.trialShengjieException?.atom ?
        trial.trialShengjieException.destination : value.baselineKey,
    }));
    const candidateDiagnostics = onsetDiagnostics(candidateAtoms, canonicalInitialKeys);
    const candidateMergeLower = regions.reduce((total, region) => {
      const keys = new Set();
      for (const rhyme of orderedRhymes) {
        const rhymeMove = trial.trialRhymeException;
        keys.add(rhymeMove?.region === region.name && rhymeMove.rhyme === rhyme.name ?
          rhymeMove.destination : rhyme.baselineKeys[region.name]);
      }
      return total + orderedRhymes.length - keys.size;
    }, 0);
    const mergeDelta = candidateMergeLower - computedMergeLower;
    const candidate = {
      ...layout,
      ...trial,
      id: `${requestedId}-${suffixes.join('+')}`,
      parentId: requestedId,
      tonedCodes: candidateCodes,
      memoryAudit: {
        ...layout.memoryAudit,
        lowerM: fixture.baselineMemoryLower + firstExceptionCount + mergeDelta,
        conservativeMGuard: fixture.baselineMemoryGuard + firstExceptionCount + mergeDelta,
        toneRegionMergeLower: candidateMergeLower,
        traditionalOnsetD: candidateDiagnostics.traditionalOnsetD,
        onsetKeyIncidences: candidateDiagnostics.onsetKeyIncidences,
        onsetFragmentation: candidateDiagnostics.onsetFragmentation,
      },
    };
    const candidateOutput = path.resolve(args['candidate-layouts'] || path.join(root,
      'research/.cache/ckt-v51-toned-rust-trial-candidate-layouts.json'));
    fs.mkdirSync(path.dirname(candidateOutput), {recursive: true});
    fs.writeFileSync(candidateOutput, `${JSON.stringify({...layouts, layouts: [candidate]}, null, 2)}\n`, 'utf8');
    process.stderr.write(`wrote ${candidateOutput}: ${candidate.id}\n`);
  }
}

if (require.main === module) main();

module.exports = {onsetDiagnostics, toneRegions};
