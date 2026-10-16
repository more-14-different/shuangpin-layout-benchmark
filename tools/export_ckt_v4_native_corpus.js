#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  BinaryWriter,
  hashFile,
  parseArgs,
} = require('./export_ckt_v4_binary_fixture.js');
const {
  FIXED_ONE_KEY,
  SHAPE_FROM,
  STROKE_SLOT,
  loadPayload,
  strokeOptions,
  multiwords,
} = require('./score_completion_ckt_v4.js');
const {
  ALPHABET,
  buildSchemeFixture,
  selectSchemeEntries,
} = require('./ckt_v4_scheme_fixture.js');

const MAGIC = Buffer.from('CKTV4COR', 'ascii');
const FORMAT_VERSION = 1;
const FILE_END = 0xc4c0ca5e;
function shapeSlot(abstract, offset = 0) {
  const key = [...(abstract || '')][offset];
  const slot = SHAPE_FROM.indexOf(key);
  return slot < 0 ? 0xff : slot;
}

function strokeMask(options) {
  let mask = 0;
  for (const value of options || []) {
    const slot = STROKE_SLOT[value];
    if (slot !== undefined) mask |= 1 << slot;
  }
  return mask;
}

function buildTemplates(data, strokes, words) {
  const common = new Set(data.base.map(row => row[0]));
  const shape = data.shapes.snowshape;
  const characters = [];
  for (const [text, py, tone, weight, isCommon] of data.characters) {
    if (!isCommon || !(weight > 0) || FIXED_ONE_KEY.has(text) || !common.has(py)) continue;
    characters.push({
      id: `c:${text}:${py}`,
      py,
      tone,
      weight,
      shape1: shapeSlot(shape[text], 0),
      shape2: shapeSlot(shape[text], 1),
      strokes: strokeMask(strokes.get(text)),
    });
  }

  const result = {characters};
  for (const kind of ['word2', 'word3', 'word4']) {
    result[kind] = words[kind].map((item, index) => {
      const chars = [...item.text];
      return {
        index,
        py: item.py,
        tones: item.tones,
        weight: item.weight,
        shape1: shapeSlot(shape[chars[0]], 0),
        shape2: shapeSlot(shape[chars[1]], 0),
      };
    });
  }
  return result;
}

function writeWord(writer, item) {
  for (const py of item.py) writer.u16(py);
  for (const tone of item.tones) writer.u8(tone);
  writer.f64(item.weight);
  writer.u8(item.shape1);
  writer.u8(item.shape2);
}

function buildNativeSchemeFixture(data, entries, htmlHash) {
  const fixture = buildSchemeFixture(data, entries, htmlHash);
  fixture.version = 'ckt-v4-scheme-state-1';
  delete fixture.source;
  delete fixture.counts;
  return fixture;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(__dirname, '..');
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const html = path.resolve(args.html || path.join(repo, 'a7_CKT_R11.html'));
  const strokeFile = path.join(snow, 'rime-stroke', 'stroke.dict.yaml');
  const snowBaseFile = path.join(snow, 'snow_pinyin.base.dict.yaml');
  const output = path.resolve(args.output || path.join(repo, 'research', '.cache', 'ckt-v4-native-corpus.bin'));
  const schemesOutput = path.resolve(args.schemes || path.join(repo, 'research', '.cache', 'ckt-v4-schemes.json'));
  const ids = String(args.ids || 'S005,L600,S005-NF,SNF4-M36-AE-07,N095,SNOW-SHENYUN-21X28-SHAPE,H37').split(',').filter(Boolean);
  const mass = Number(args.mass || 0.99);
  if (!(mass > 0 && mass <= 1)) throw new Error('--mass must be in (0,1]');

  const data = loadPayload(html);
  const strokes = strokeOptions(strokeFile);
  const words = multiwords(snowBaseFile, data, mass);
  const templates = buildTemplates(data, strokes, words);
  const entries = selectSchemeEntries(data, ids);
  const sourceHashes = {
    html: hashFile(html),
    snowBase: hashFile(snowBaseFile),
    stroke: hashFile(strokeFile),
  };
  const header = {
    version: 'ckt-v4-native-corpus-1',
    source: 'tools/export_ckt_v4_native_corpus.js',
    keyAlphabet: ALPHABET,
    mass,
    pinyinCount: data.pinyin.length,
    extensionMaps: data.ckt.calibration.extension_maps,
    sourceHashes,
    counts: {
      character: templates.characters.length,
      word2: templates.word2.length,
      word3: templates.word3.length,
      word4: templates.word4.length,
    },
  };
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');

  fs.mkdirSync(path.dirname(output), {recursive: true});
  const writer = new BinaryWriter(output);
  try {
    writer.bytes(MAGIC);
    writer.u16(FORMAT_VERSION);
    writer.u16(0);
    writer.u32(headerBytes.length);
    writer.bytes(headerBytes);
    writer.u32(templates.characters.length);
    writer.u32(templates.word2.length);
    writer.u32(templates.word3.length);
    writer.u32(templates.word4.length);
    for (const item of templates.characters) {
      writer.string16(item.id);
      writer.u16(item.py);
      writer.u8(item.tone);
      writer.f64(item.weight);
      writer.u8(item.shape1);
      writer.u8(item.shape2);
      writer.u8(item.strokes);
    }
    for (const kind of ['word2', 'word3', 'word4']) {
      for (const item of templates[kind]) writeWord(writer, item);
    }
    writer.u32(FILE_END);
  } finally {
    writer.close();
  }

  const schemeFixture = buildNativeSchemeFixture(data, entries, sourceHashes.html);
  fs.mkdirSync(path.dirname(schemesOutput), {recursive: true});
  fs.writeFileSync(schemesOutput, `${JSON.stringify(schemeFixture, null, 2)}\n`, 'utf8');
  process.stderr.write(`wrote ${output} (${writer.bytesWritten} bytes)\n`);
  process.stderr.write(`wrote ${schemesOutput}\n`);
}

if (require.main === module) main();

module.exports = {buildNativeSchemeFixture, buildTemplates};
