#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function loadPayload(htmlFile) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const at = html.indexOf('<script id="payload"');
  if (at < 0) throw new Error('HTML payload not found');
  const start = html.indexOf('>', at) + 1;
  const end = html.indexOf('</script>', start);
  return JSON.parse(zlib.gunzipSync(Buffer.from(html.slice(start, end), 'base64')));
}

function parseSyllable(token, pinyin) {
  const match = token.match(/^([a-z]+)([1-5])?$/);
  if (!match || !pinyin.has(match[1])) return null;
  return {pinyin: match[1], tone: Number(match[2] || 5)};
}

function parseDictionary(file, payload) {
  const commonPinyinIndices = new Set(payload.base.map(row => row[0]));
  const pinyin = new Set(payload.pinyin.filter((_, index) => commonPinyinIndices.has(index)));
  const shape = payload.shapes.snowshape;
  const unique = new Map();
  let rawRows = 0;
  let malformed = 0;
  let unsupported = 0;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.includes('\t') || line.startsWith('#')) continue;
    const [text, reading, weightText] = line.split('\t');
    if (!text || !reading || reading.startsWith('~')) continue;
    rawRows++;
    const chars = [...text];
    const tokens = reading.trim().split(/\s+/);
    const parsed = tokens.map(token => parseSyllable(token, pinyin));
    const weight = Number(weightText);
    if (chars.length !== tokens.length || parsed.some(value => !value) || !(weight > 0)) {
      malformed++;
      continue;
    }
    if (chars.some(char => !shape[char])) {
      unsupported++;
      continue;
    }
    const key = `${text}\u0000${reading}`;
    const prior = unique.get(key);
    if (!prior || weight > prior.weight) unique.set(key, {text, reading, length: chars.length, weight});
  }
  return {rawRows, malformed, unsupported, rows: [...unique.values()]};
}

function distribution(rows) {
  const sorted = [...rows].sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text, 'zh-Hans-CN'));
  const totalWeight = sorted.reduce((sum, row) => sum + row.weight, 0);
  const thresholds = {};
  let cumulative = 0;
  let next = 0;
  const levels = [0.95, 0.99, 0.995, 0.999];
  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i].weight;
    while (next < levels.length && cumulative / totalWeight >= levels[next]) {
      thresholds[String(levels[next])] = {count: i + 1, minimumWeight: sorted[i].weight};
      next++;
    }
  }
  return {
    count: sorted.length,
    totalWeight,
    minimumWeight: sorted.at(-1)?.weight || null,
    maximumWeight: sorted[0]?.weight || null,
    thresholds,
  };
}

function main() {
  const args = argsOf(process.argv.slice(2));
  const repo = path.resolve(__dirname, '..');
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const html = path.resolve(args.html || path.join(repo, 'a7_CKT_R11.html'));
  const payload = loadPayload(html);
  const files = {
    base: path.join(snow, 'snow_pinyin.base.dict.yaml'),
    ext: path.join(snow, 'snow_pinyin.ext.dict.yaml'),
    tencent: path.join(snow, 'snow_pinyin.tencent.dict.yaml'),
  };
  const sources = {};
  for (const [name, file] of Object.entries(files)) {
    if (!fs.existsSync(file)) throw new Error(`missing dictionary: ${file}`);
    const parsed = parseDictionary(file, payload);
    const lengths = {};
    for (const length of [1, 2, 3, 4]) lengths[`word${length}`] = distribution(parsed.rows.filter(row => row.length === length));
    const distinctWeights = new Set(parsed.rows.map(row => row.weight));
    sources[name] = {
      file: path.relative(snow, file).replaceAll('\\', '/'),
      sha256: sha256(file),
      rawRows: parsed.rawRows,
      eligibleRows: parsed.rows.length,
      malformedRows: parsed.malformed,
      unsupportedShapeRows: parsed.unsupported,
      distinctPositiveWeights: distinctWeights.size,
      constantWeight: distinctWeights.size === 1 ? [...distinctWeights][0] : null,
      lengths,
    };
  }

  const commonCharacters = payload.characters.filter(row => row[4]);
  const positiveCharacters = commonCharacters.filter(row => row[3] > 0);
  const manifest = {
    version: 'ckt-v4-corpus-audit-v1',
    generatedAt: new Date().toISOString(),
    policy: {
      rankingSource: 'snow_pinyin.base.dict.yaml only',
      reason: 'base has graded weights; ext/tencent currently use constant weight 100 and therefore cannot be treated as comparable frequencies',
      characterCohort: 'all 8,095 common payload characters for membership/coverage; the frequency-weighted headline uses the 6,263 rows with positive observed weight, and a separate uniform robustness track covers all 8,095; fixed one-key characters are reported separately',
      word2Cohort: 'all eligible base two-character entries',
      word3And4Core: 'base entries selected by a declared cumulative within-length frequency-mass threshold',
      robustnessCohort: 'ext/tencent are coverage or adversarial robustness sets only, never mixed into the weighted headline score',
    },
    payload: {
      html: path.basename(html),
      sha256: sha256(html),
      entries: payload.entries.length,
      commonPinyinSyllables: payload.base.length,
      commonCharacters: commonCharacters.length,
      positiveWeightCharacters: positiveCharacters.length,
      zeroWeightCharacters: commonCharacters.length - positiveCharacters.length,
      commonCharacterWeight: positiveCharacters.reduce((sum, row) => sum + row[3], 0),
    },
    sources,
  };
  const json = JSON.stringify(manifest, null, 2);
  if (args.output) fs.writeFileSync(path.resolve(args.output), `${json}\n`, 'utf8');
  console.log(json);
}

main();
