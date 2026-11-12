#!/usr/bin/env node
'use strict';

// Initial bounded experiment: D3/V1 first keys, Mars rhyme atoms, 10/9/7 tone rows.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const model = require('./ckt_v4_model.js');
const scorer = require('./score_completion_ckt_v4.js');
const toned = require('./score_toned_2121_ckt_v51.js');
const {toneKeysFromShapeKeys, auxiliarySemantics} = require('./auxiliary_semantics.js');
const {marsRhymeIndex, MARS_RHYME_ORDER} = require('./mars_toned_factorization.js');
const {splitPinyin, HEADS, FINALS} = require('./ckt_v4_scheme_fixture.js');

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const POLICY = {word2: '12', word3: '12', word4: '24'};
const BALANCE = {version: 'soft-page-fill-v2', pageSize: 6,
  maximumCandidates: 120, minimumInputLength: 4};
const BASELINE_ID = 'SNOW-SHENYUN-21X26-D3V1-BALANCED';

function toneRow(tone) {
  if (tone === 4) return 0;
  if (tone === 2 || tone === 3) return 1;
  if (tone === 0 || tone === 1 || tone === 5) return 2;
  throw new Error(`invalid tone: ${tone}`);
}

function validateLayout(layout, tokenKeys) {
  if (layout.tonedCodes.length !== tokenKeys.length) throw new Error('token/code length mismatch');
  const firstKeys = new Set('BCDFGHJKLMNPQRSTVWXYZ');
  for (let i = 0; i < tokenKeys.length; i++) {
    const code = layout.tonedCodes[i];
    if (!/^[A-Z]{2}$/.test(code) || !firstKeys.has(code[0])) throw new Error(`invalid 21x26 code ${code}`);
    if (!ROWS[toneRow(Number(tokenKeys[i].slice(-1)))].includes(code[1])) {
      throw new Error(`wrong tone region: ${tokenKeys[i]}=${code}`);
    }
  }
}

// Adapt token-dependent codes at the native word-row boundary. This retains AAA→AAAU
// routing and the shared word:four/five/six pools without modifying 21x21 code.
function adaptWords(layout, tokenKeys, data, words) {
  const indices = new Map(tokenKeys.map((key, index) => [key, index]));
  return Object.fromEntries(Object.entries(words).map(([kind, rows]) => [kind, rows.map(item => ({
    ...item,
    py: item.py.map((py, at) => {
      const tone = item.tones[at] === 0 ? 5 : item.tones[at];
      const key = `${data.pinyin[py]}${tone}`;
      const index = indices.get(key);
      if (index === undefined || !layout.tonedCodes[index]) throw new Error(`uncovered word token ${key}`);
      return index;
    }),
  }))]));
}

function evaluate(layout, tokenKeys, context, policy = POLICY) {
  const {data, words, motor, reference, buildRowsForOrder} = context;
  const toneKeysByTone = toneKeysFromShapeKeys(layout.shapeKeysByMeaning);
  const characters = toned.buildCharacterRows(layout, {tokenKeys}, data, toneKeysByTone);
  const adapted = adaptWords(layout, tokenKeys, data, words);
  const entry = {capacity: [21, 26], codeList: layout.tonedCodes, tone: toneKeysByTone};
  const wordRows = Object.entries(policy).flatMap(([kind, order]) =>
    buildRowsForOrder(entry, data, adapted, 'keytao', toneKeysByTone, kind, order, model));
  const outcomes = model.resolveCompetition(wordRows, {motorCost: motor, lengthBalance: BALANCE});
  const tracks = {character: reference.summarize(model.resolveCompetition(characters, {motorCost: motor})),
    ...Object.fromEntries(['word2', 'word3', 'word4'].map(kind => [kind,
      reference.summarize(outcomes.filter(row => row.kind === kind))]))};
  return {id: layout.id, score: toned.normalizedScore(tracks, reference.tracks), policy, tracks};
}

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  const root = path.resolve(__dirname, '..');
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const output = path.resolve(args.output || path.join(root, 'research/notes/2026-11-12-toned-2126-initial.json'));
  const steps = Number(args.steps || 60), sample = Number(args.sample || 500), seed = Number(args.seed || 2126);
  if (!Number.isInteger(steps) || steps < 0 || !Number.isInteger(sample) || sample < 1) throw new Error('invalid search budget');
  const data = scorer.loadPayload(html);
  const entry = data.entries.find(row => row.id === BASELINE_ID);
  if (!entry) throw new Error(`missing baseline ${BASELINE_ID}`);
  const mappingFile = path.join(snow, 'config/shenyun-21x26-mapping.json');
  const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
  if (mapping.id !== entry.id || mapping.shapeKeysByMeaning !== 'AEUIO' || mapping.shapeAuxiliaryOrder !== '12/12/24') {
    throw new Error('deployed baseline changed; update experiment explicitly');
  }
  for (const [index] of data.base) {
    const [head, final] = splitPinyin(data.pinyin[index]);
    const deployed = mapping.initialMap[HEADS[head]] + mapping.finalMap[FINALS[final]];
    if (deployed !== entry.codeList[index]) throw new Error(`deployed mapping mismatch: ${data.pinyin[index]}`);
  }
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const motor = toned.projectedMotor(data);
  const {buildRowsForOrder} = require(path.join(snow, 'scripts/research/evaluate_ckt_v4_word_aux_order.js'));
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'research/config/ckt-v51-toned-2121-seeds.json'), 'utf8'));
  const decomposition = new Map(inventory.decomposition.map(row => [row.pinyin, row]));
  const tokenKeys = [...new Set([
    ...inventory.layoutTokenKeys,
    ...Object.values(words).flatMap(rows => rows.flatMap(item => item.py.map((py, at) => `${data.pinyin[py]}${item.tones[at]}`))),
  ])].sort();
  const tokenSet = new Set(tokenKeys);
  for (const [, py, tone, weight, common] of data.characters) {
    if (common && weight > 0 && data.base.some(([index]) => index === py) &&
        !tokenSet.has(`${data.pinyin[py]}${tone}`)) throw new Error('uncovered character token');
  }
  const pinyinIndex = new Map(data.pinyin.map((py, index) => [py, index]));
  function makeLayout(regionMaps, id) {
    const layout = {id, shapeKeysByMeaning: 'AEUIO', regionMaps,
      tonedCodes: tokenKeys.map(key => {
        const py = key.slice(0, -1), row = toneRow(Number(key.slice(-1)));
        const split = decomposition.get(py);
        if (!split) throw new Error(`missing decomposition ${py}`);
        const first = entry.codeList[pinyinIndex.get(py)]?.[0];
        if (!first) throw new Error(`missing D3/V1 code ${py}`);
        return first + ROWS[row][regionMaps[row][marsRhymeIndex(split.fullFinal)]];
      })};
    validateLayout(layout, tokenKeys);
    return layout;
  }
  function contextFor(data, words) {
    return {data, words, motor, buildRowsForOrder,
      reference: toned.buildReference({data, words, strokes, motor, snow})};
  }
  const context = contextFor(data, words);
  const baseline = {id: BASELINE_ID, shapeKeysByMeaning: 'AEUIO',
    tonedCodes: tokenKeys.map(key => entry.codeList[pinyinIndex.get(key.slice(0, -1))])};
  const baselineResult = evaluate(baseline, tokenKeys, context);
  const expected = 9.117650560950630;
  if (Math.abs(baselineResult.score - expected) > 1e-8) throw new Error(`baseline parity failed: ${baselineResult.score} vs ${expected}`);
  const sampled = toned.sampleCorpus(data, words, sample);
  const screenContext = contextFor(sampled.data, sampled.words);
  const random = randomGenerator(seed);
  let current = makeLayout(ROWS.map(keys => MARS_RHYME_ORDER.map((_, i) => i % keys.length)), 'T2126-INITIAL');
  let currentResult = evaluate(current, tokenKeys, screenContext);
  const archive = [{layout: current, screening: currentResult}];
  const seen = new Set([JSON.stringify(current.regionMaps)]);
  for (let step = 0; step < steps; step++) {
    const maps = current.regionMaps.map(row => [...row]);
    const row = Math.floor(random() * 3), left = Math.floor(random() * 10);
    if (step % 2) {
      const right = Math.floor(random() * 10);
      [maps[row][left], maps[row][right]] = [maps[row][right], maps[row][left]];
    } else maps[row][left] = Math.floor(random() * ROWS[row].length);
    // Keep all 26 second keys reachable by the rhyme map.
    if (maps.some((map, r) => new Set(map).size !== ROWS[r].length)) continue;
    const signature = JSON.stringify(maps);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const layout = makeLayout(maps, `T2126-S${step + 1}`);
    const result = evaluate(layout, tokenKeys, screenContext);
    archive.push({layout, screening: result});
    if (result.score < currentResult.score) {current = layout; currentResult = result;}
    if (step % 10 === 0) process.stderr.write(`step ${step}/${steps}, best sampled CKT ${currentResult.score.toFixed(6)}\n`);
  }
  archive.sort((a, b) => a.screening.score - b.screening.score);
  const results = archive.slice(0, 3).map(({layout, screening}) => ({layout, screeningScore: screening.score,
    ...evaluate(layout, tokenKeys, context), occupiedBuckets: new Set(layout.tonedCodes).size})).sort((a, b) => a.score - b.score);
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const report = {version: 'toned-2126-initial-1',
    contract: {capacity: [21, 26], maximumBuckets: 546, firstKeys: 'BCDFGHJKLMNPQRSTVWXYZ',
      secondKeysByRow: ROWS, tonesByRow: [[4], [3, 2], [1, 0]], neutralTonePolicy: 'follow-tone1',
      auxiliarySemantics: auxiliarySemantics('IEUAO'), toneAuxiliaryEnabled: false,
      wordRouting: 'four-code-top', lengthBalance: BALANCE, policy: POLICY,
      normalization: 'shape-only S005; character/word2/word3/word4 weights 1/3/1/1'},
    constraints: {firstMapping: BASELINE_ID, rhymeAtoms: MARS_RHYME_ORDER,
      allSecondKeysRequired: true, memoryGate: 'not yet defined; no low-M or optimality claim'},
    sources: {parentCommit: '0ca64c7e196619f6b9e0e9725f55c038f3b1c26d',
      snowCommit: execFileSync('git', ['-C', snow, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
      htmlSha256: hash(html), mappingSha256: hash(mappingFile),
      dictionarySha256: hash(path.join(snow, 'snow_pinyin.base.dict.yaml'))},
    search: {seed, steps, sampleRowsPerTrack: sample, evaluated: archive.length,
      selection: 'sample CKT hill climb; full corpus top 3; fixed deployed auxiliary policy',
      robustPolicySearch: false}, tokenKeys, baseline: baselineResult, results};
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({baseline: baselineResult.score, evaluated: archive.length,
    results: results.map(row => ({id: row.id, score: row.score, delta: row.score - baselineResult.score,
      occupiedBuckets: row.occupiedBuckets}))}, null, 2) + '\n');
}

if (require.main === module) main();
module.exports = {toneRow, validateLayout, adaptWords, evaluate, ROWS, POLICY, BALANCE};
