#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  HISTORICAL_COGNITIVE_PRIOR,
  classifyContract,
  makeStages,
  resolveCompetition,
  summarizeOutcomes,
  compositeScore,
  upstreamMotor,
  projectedMotor,
} = require('./ckt_v4_model.js');

const FIXED_ONE_KEY = new Set([...'的一是在了不有和人中大为上个国我以要他时来用生到作']);
const SHAPE_FROM = 'IEUAO';
const STROKE_SLOT = {s: 0, h: 1, p: 2, z: 3, n: 4};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

function loadPayload(file) {
  const html = fs.readFileSync(file, 'utf8');
  const at = html.indexOf('<script id="payload"');
  if (at < 0) throw new Error('HTML payload not found');
  const start = html.indexOf('>', at) + 1;
  const end = html.indexOf('</script>', start);
  return JSON.parse(zlib.gunzipSync(Buffer.from(html.slice(start, end), 'base64')));
}

function strokeOptions(file) {
  const alternatives = new Map();
  let started = false;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!started) { started = line.trim() === '...'; continue; }
    const [character, spelling] = line.split('\t');
    if (!character || !spelling || /[^hspnz]/.test(spelling)) continue;
    if (!alternatives.has(character)) alternatives.set(character, new Set());
    alternatives.get(character).add(spelling[0]);
  }
  return alternatives;
}

function multiwords(file, data, mass) {
  const commonPinyinIndices = new Set(data.base.map(row => row[0]));
  const pinyin = new Map(data.pinyin.flatMap((value, index) => commonPinyinIndices.has(index) ? [[value, index]] : []));
  const shape = data.shapes.snowshape;
  const unique = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.includes('\t') || line.startsWith('#')) continue;
    const [text, reading, weightText] = line.split('\t');
    const chars = [...(text || '')];
    if (![2, 3, 4].includes(chars.length) || !reading || reading.startsWith('~')) continue;
    const tokens = reading.split(/\s+/);
    if (tokens.length !== chars.length || chars.some(char => !shape[char])) continue;
    const parsed = tokens.map(token => token.match(/^([a-z]+)([1-5])?$/));
    if (parsed.some(match => !match || !pinyin.has(match[1]))) continue;
    const weight = Number(weightText);
    if (!(weight > 0)) continue;
    const row = {
      text,
      reading,
      length: chars.length,
      py: parsed.map(match => pinyin.get(match[1])),
      tones: parsed.map(match => Number(match[2] || 5)),
      weight,
    };
    const key = `${text}\u0000${reading}`;
    if (!unique.has(key) || unique.get(key).weight < weight) unique.set(key, row);
  }
  const result = {};
  for (const length of [2, 3, 4]) {
    const rows = [...unique.values()].filter(row => row.length === length)
      .sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text, 'zh-Hans-CN'));
    const total = rows.reduce((sum, row) => sum + row.weight, 0);
    let cumulative = 0;
    let count = 0;
    while (count < rows.length && cumulative / total < mass) cumulative += rows[count++].weight;
    result[`word${length}`] = length === 2 ? rows : rows.slice(0, count);
  }
  return result;
}

function physicalShape(abstract, toneKeys) {
  return [...(abstract || '')].map(key => toneKeys[SHAPE_FROM.indexOf(key)] || '').join('');
}

function stage(length, code) {
  return {length, codes: code ? [code] : []};
}

function row(id, text, kind, weight, baseLength, contract, codes) {
  return {id, text, kind, weight, baseLength, stages: makeStages(contract, kind, codes.map(code => stage([...code].length, code)))};
}

function auditPhysicalKeyDomain(entries, nativeKeys, extensionMaps, commonPinyinIndices) {
  const supported = new Set([...nativeKeys, ...Object.keys(extensionMaps)]);
  const usage = Object.fromEntries([...supported].sort().map(key => [key, {schemes: 0, first: 0, second: 0, auxiliary: 0}]));
  const invalid = [];
  const incompleteCommonPinyin = [];
  let nullCodes = 0;
  for (const entry of entries) {
    const missing = commonPinyinIndices.filter(index => !entry.codeList?.[index]);
    if (missing.length) incompleteCommonPinyin.push({id: entry.id, missing});
    const seen = new Set();
    for (const code of entry.codeList || []) {
      if (code == null) { nullCodes++; continue; }
      if (typeof code !== 'string') { invalid.push({id: entry.id, key: typeof code, code}); continue; }
      [...code].forEach((key, position) => {
        if (!supported.has(key)) invalid.push({id: entry.id, key, code});
        else {
          seen.add(key);
          if (position === 0) usage[key].first++;
          else usage[key].second++;
        }
      });
    }
    for (const key of entry.tone || '') {
      if (!supported.has(key)) invalid.push({id: entry.id, key, code: 'tone'});
      else { seen.add(key); usage[key].auxiliary++; }
    }
    for (const key of seen) usage[key].schemes++;
  }
  if (invalid.length) throw new Error(`unsupported physical keys: ${JSON.stringify(invalid.slice(0, 20))}`);
  if (incompleteCommonPinyin.length) throw new Error(`incomplete Common399 mappings: ${JSON.stringify(incompleteCommonPinyin.slice(0, 20))}`);
  return {
    nativeKeys,
    extensionKeys: Object.keys(extensionMaps).sort().join(''),
    supportedKeyCount: supported.size,
    schemesAudited: entries.length,
    nullCodes,
    commonPinyinCount: commonPinyinIndices.length,
    commonPinyinComplete: true,
    usage,
  };
}

function crossLengthAudit(rows, jointOutcomes, motorCost) {
  const joint = new Map(jointOutcomes.map(value => [value.id, value]));
  const result = {};
  for (const kind of ['word2', 'word3', 'word4']) {
    const cohort = rows.filter(value => value.kind === kind);
    const isolated = new Map(resolveCompetition(cohort, {motorCost}).map(value => [value.id, value]));
    let total = 0;
    let affected = 0;
    let extraKeys = 0;
    for (const source of cohort) {
      const a = joint.get(source.id);
      const b = isolated.get(source.id);
      total += source.weight;
      const delta = Math.max(0, a.codeLength - b.codeLength);
      const rankAdded = a.codeLength === b.codeLength && a.rank > b.rank;
      if (delta > 0 || rankAdded) affected += source.weight;
      extraKeys += source.weight * delta;
    }
    result[kind] = {affectedRate: affected / total, meanExtraKeys: extraKeys / total};
  }
  return result;
}

function buildRows(entry, data, strokes, words, mode) {
  const contract = classifyContract(entry.capacity);
  const shape = data.shapes.snowshape;
  const toneKeys = entry.tone;
  const codes = entry.codeList;
  const rows = [];
  const commonPinyinIndices = new Set(data.base.map(value => value[0]));

  for (const [text, py, tone, weight, common] of data.characters) {
    if (!common || !(weight > 0) || FIXED_ONE_KEY.has(text) || !commonPinyinIndices.has(py) || !codes[py]) continue;
    const base = codes[py];
    if (mode === 'keytao') {
      const aux = physicalShape(shape[text], toneKeys);
      if (aux.length >= 2) rows.push(row(`c:${text}:${py}`, text, 'character', weight, 2, contract,
        [base, base + aux[0], base + aux.slice(0, 2)]));
    } else {
      const toneKey = toneKeys[tone - 1];
      const possible = [...(strokes.get(text) || [])].map(value => toneKeys[STROKE_SLOT[value]]).filter(Boolean);
      if (toneKey && possible.length) {
        const stages = [stage(2, base), stage(3, base + toneKey), {length: 4, codes: possible.map(key => base + toneKey + key)}];
        rows.push({id: `c:${text}:${py}`, text, kind: 'character', weight, baseLength: 2,
          stages: makeStages(contract, 'character', stages)});
      }
    }
  }

  for (let i = 0; i < words.word2.length; i++) {
    const {text, py, tones, weight} = words.word2[i];
    const [py1, py2] = py;
    const [tone1, tone2] = tones;
    if (!codes[py1] || !codes[py2]) continue;
    const base = codes[py1] + codes[py2];
    const [ch1, ch2] = [...text];
    let first;
    let second;
    if (mode === 'keytao') {
      const x1 = physicalShape(shape[ch1], toneKeys)[0];
      const x2 = physicalShape(shape[ch2], toneKeys)[0];
      [first, second] = contract === 'traditional-21x21' ? [x1, x2] : [x2, x1];
    } else {
      [first, second] = [toneKeys[tone2 - 1], toneKeys[tone1 - 1]];
    }
    if (first && second) rows.push(row(`w2:${i}`, text, 'word2', weight, 4, contract,
      [base, base + first, base + first + second]));
  }

  for (const kind of ['word3', 'word4']) {
    for (let i = 0; i < words[kind].length; i++) {
      const item = words[kind][i];
      if (item.py.some(py => !codes[py])) continue;
      const chars = [...item.text];
      const initials = item.py.map(py => codes[py][0]);
      const stem = kind === 'word3' ? initials.slice(0, 3).join('') : initials.slice(0, 4).join('');
      let first;
      let second;
      if (mode === 'keytao') {
        first = physicalShape(shape[chars[0]], toneKeys)[0];
        second = physicalShape(shape[chars[1]], toneKeys)[0];
      } else if (contract === 'traditional-21x21') {
        const last = kind === 'word3' ? 2 : 3;
        first = toneKeys[item.tones[last] - 1];
        second = toneKeys[item.tones[0] - 1];
      } else {
        first = toneKeys[item.tones[0] - 1];
        second = toneKeys[item.tones[1] - 1];
      }
      if (!first || !second) continue;
      let paths;
      if (kind === 'word3' && contract === 'four-code-top') {
        const routed = stem + codes[item.py[2]][1];
        paths = [stem, routed, routed + first, routed + first + second];
      } else {
        paths = [stem, stem + first, stem + first + second];
      }
      const baseLength = kind === 'word3' && contract === 'four-code-top' ? 4 : stem.length;
      rows.push(row(`${kind}:${i}`, item.text, kind, item.weight, baseLength, contract, paths));
    }
  }
  return rows;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(__dirname, '..');
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const html = path.resolve(args.html || path.join(repo, 'a7_CKT_R11.html'));
  const snapshotFile = path.resolve(args.motor || path.join(__dirname, 'ckt_v4_upstream_role_tables.json'));
  const mass = Number(args.mass || 0.99);
  if (!(mass > 0 && mass <= 1)) throw new Error('--mass must be in (0,1]');
  const ids = String(args.ids || 'S005,L600,SNOW-SHENYUN-21X28-SHAPE,H37').split(',').filter(Boolean);
  const parameters = {
    ...HISTORICAL_COGNITIVE_PRIOR,
    firstAuxMs: Number(args.firstAux || HISTORICAL_COGNITIVE_PRIOR.firstAuxMs),
    secondAuxMs: Number(args.secondAux || HISTORICAL_COGNITIVE_PRIOR.secondAuxMs),
    selectionDecisionMs: Number(args.selection || HISTORICAL_COGNITIVE_PRIOR.selectionDecisionMs),
    scanPerCandidateMs: Number(args.scan || 0),
  };
  const data = loadPayload(html);
  let entries = args.all ? data.entries : ids.map(id => data.entries.find(entry => entry.id === id));
  if (entries.some(entry => !entry)) throw new Error(`unknown scheme id in ${ids.join(',')}`);
  if (args.offset !== undefined || args.limit !== undefined) {
    const offset = Math.max(0, Number(args.offset || 0));
    const limit = args.limit === undefined ? entries.length : Math.max(0, Number(args.limit));
    entries = entries.slice(offset, offset + limit);
  }
  const strokes = strokeOptions(path.join(snow, 'rime-stroke', 'stroke.dict.yaml'));
  const words = multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, mass);
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const keyDomain = auditPhysicalKeyDomain(data.entries, snapshot.keys, data.ckt.calibration.extension_maps,
    data.base.map(value => value[0]));
  const nativeMotor = upstreamMotor(snapshot, {continuationGuardMs: Number(args.guard || 0)});
  const compact = Boolean(args.compact);
  const schemes = {};
  for (const entry of entries) {
    // The projected code cache is deliberately scoped to one scheme. Keeping
    // it across hundreds of distinct layouts retains millions of dead strings.
    const motor = projectedMotor(nativeMotor, snapshot.keys, data.ckt.calibration.extension_maps);
    const modes = {};
    const motorOnlyModes = compact ? null : {};
    const crossLength = {};
    for (const mode of ['keytao', 'sanpin']) {
      const rows = buildRows(entry, data, strokes, words, mode);
      const outcomes = resolveCompetition(rows, {motorCost: motor});
      modes[mode] = summarizeOutcomes(outcomes, parameters);
      if (!compact) {
        motorOnlyModes[mode] = summarizeOutcomes(outcomes, {
          firstAuxMs: 0, secondAuxMs: 0, selectionDecisionMs: 0,
          scanPerCandidateMs: 0, selectionActionMs: 0, pageActionMs: 0,
        });
      }
      crossLength[mode] = args['no-cross-audit'] ? null : crossLengthAudit(rows, outcomes, motor);
    }
    schemes[entry.id] = compact
      ? {capacity: entry.capacity, contract: classifyContract(entry.capacity), modes}
      : {name: entry.name, capacity: entry.capacity, contract: classifyContract(entry.capacity),
        modes, scenarios: {historicalCognitivePrior: modes, motorOnly: motorOnlyModes}, crossLength};
    process.stderr.write(`scored ${entry.id} (${entry.capacity.join('x')})\n`);
  }
  const reference = compact ? null : schemes.S005;
  if (reference) {
    for (const scheme of Object.values(schemes)) {
      scheme.score = compositeScore(scheme.modes, reference.modes);
      scheme.scenarioScores = {
        historicalCognitivePrior: scheme.score,
        motorOnly: compositeScore(scheme.scenarios.motorOnly, reference.scenarios.motorOnly),
      };
    }
  }
  const output = {
    version: 'completion-ckt-v4-prototype-1',
    upstream: {commit: snapshot.commit, artifactVersion: snapshot.artifactVersion, sourceSha256: snapshot.sourceSha256},
    keyDomain,
    corpus: {snowBaseMass: mass, word3: words.word3.length, word4: words.word4.length,
      word2: words.word2.length,
      charactersPositiveBeforeFixedOneKey: data.characters.filter(row => row[4] && row[3] > 0).length},
    cognitiveParameters: parameters,
    caveats: ['2/3/4-key motor costs are native upstream values', '5/6-key motor costs are role-table continuation extrapolations', 'cognitive coefficients are declared scenario parameters, not fitted by the upstream motor experiment'],
    schemes,
  };
  const json = JSON.stringify(output, null, 2);
  if (args.output) fs.writeFileSync(path.resolve(args.output), `${json}\n`, 'utf8');
  if (!args.quiet) console.log(json);
}

if (require.main === module) main();

module.exports = {
  FIXED_ONE_KEY,
  SHAPE_FROM,
  STROKE_SLOT,
  loadPayload,
  strokeOptions,
  multiwords,
  auditPhysicalKeyDomain,
  crossLengthAudit,
  buildRows,
  main,
};
