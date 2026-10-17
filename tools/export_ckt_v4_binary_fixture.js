#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_COGNITIVE_PRIOR,
  classifyContract,
  projectedMotor,
  resolveCompetition,
  summarizeOutcomes,
  upstreamMotor,
} = require('./ckt_v4_model.js');
const {loadPayload, strokeOptions, multiwords, buildRows} = require('./score_completion_ckt_v4.js');

const MAGIC = Buffer.from('CKTV4ROW', 'ascii');
const FORMAT_VERSION = 1;
const CASE_END = 0xc4e0ca5e;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./";
const KEY_INDEX = new Map([...ALPHABET].map((key, index) => [key, index]));
const PARAMETERS = DEFAULT_COGNITIVE_PRIOR;
const KIND_IDS = new Map(['character', 'word2', 'word3', 'word4'].map((value, index) => [value, index]));
const POOL_IDS = new Map([
  'char:base', 'char:aux1', 'char:aux2', 'word:four', 'word:five', 'word:six',
  'word3:three', 'word3:four-b', 'word3:five-bb',
].map((value, index) => [value, index]));
const TRACK_FIELDS = [
  'totalWeight', 'motorUpperMs', 'cognitiveMs', 'effectiveMs', 'firstAuxRate',
  'secondAuxRate', 'selectionRate', 'meanTerminalRank', 'meanKeys',
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

function hashFile(file) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (!count) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

class BinaryWriter {
  constructor(file, capacity = 1024 * 1024) {
    this.descriptor = fs.openSync(file, 'w');
    this.buffer = Buffer.allocUnsafe(capacity);
    this.offset = 0;
    this.bytesWritten = 0;
  }

  ensure(bytes) {
    if (bytes > this.buffer.length) throw new RangeError(`single write exceeds buffer: ${bytes}`);
    if (this.offset + bytes > this.buffer.length) this.flush();
  }

  flush() {
    if (!this.offset) return;
    fs.writeSync(this.descriptor, this.buffer, 0, this.offset);
    this.bytesWritten += this.offset;
    this.offset = 0;
  }

  close() {
    this.flush();
    fs.closeSync(this.descriptor);
  }

  bytes(value) {
    if (value.length > this.buffer.length) {
      this.flush();
      fs.writeSync(this.descriptor, value);
      this.bytesWritten += value.length;
      return;
    }
    this.ensure(value.length);
    value.copy(this.buffer, this.offset);
    this.offset += value.length;
  }

  u8(value) { this.ensure(1); this.buffer.writeUInt8(value, this.offset); this.offset += 1; }
  u16(value) { this.ensure(2); this.buffer.writeUInt16LE(value, this.offset); this.offset += 2; }
  u32(value) { this.ensure(4); this.buffer.writeUInt32LE(value, this.offset); this.offset += 4; }
  u64(value) { this.ensure(8); this.buffer.writeBigUInt64LE(value, this.offset); this.offset += 8; }
  f64(value) { this.ensure(8); this.buffer.writeDoubleLE(value, this.offset); this.offset += 8; }

  string16(value) {
    const bytes = Buffer.from(value, 'utf8');
    if (bytes.length > 0xffff) throw new RangeError('string exceeds u16 length');
    this.u16(bytes.length);
    this.bytes(bytes);
  }

  string32(value) {
    const bytes = Buffer.from(value, 'utf8');
    this.u32(bytes.length);
    this.bytes(bytes);
  }
}

function packedCode(code) {
  const keys = [...code];
  if (!keys.length || keys.length > 6) throw new Error(`invalid code length: ${code}`);
  let bits = 0n;
  for (const key of keys) {
    const index = KEY_INDEX.get(key);
    if (index === undefined) throw new Error(`key outside 34-key domain: ${key}`);
    bits = (bits << 6n) | BigInt(index + 1);
  }
  return bits;
}

function writeTrack(writer, track, kind) {
  if (!track) throw new Error(`missing summary track ${kind}`);
  writer.u32(track.count);
  for (const field of TRACK_FIELDS) writer.f64(track[field]);
}

function writeRows(writer, rows) {
  for (const row of rows) {
    writer.string32(row.id);
    writer.u8(KIND_IDS.get(row.kind));
    writer.f64(row.weight);
    writer.u8(row.baseLength);
    writer.u8(row.stages.length);
    for (const stage of row.stages) {
      if (stage.codes.length > 0xffff) throw new RangeError(`too many codes in ${row.id}`);
      writer.u8(stage.order);
      writer.u8(POOL_IDS.get(stage.pool));
      writer.u16(stage.codes.length);
      for (const code of stage.codes) writer.u64(packedCode(code));
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(__dirname, '..');
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const html = path.resolve(args.html || path.join(repo, 'a7_CKT_R11.html'));
  const snapshotFile = path.resolve(args.motor || path.join(__dirname, 'ckt_v4_upstream_role_tables.json'));
  const strokeFile = path.join(snow, 'rime-stroke', 'stroke.dict.yaml');
  const snowBaseFile = path.join(snow, 'snow_pinyin.base.dict.yaml');
  const output = path.resolve(args.output || path.join(repo, 'research', '.cache', 'ckt-v4-real-reference.bin'));
  const ids = String(args.ids || 'S005,L600').split(',').filter(Boolean);
  const mass = Number(args.mass || 0.99);
  const data = loadPayload(html);
  const entries = ids.map(id => data.entries.find(entry => entry.id === id));
  if (entries.some(entry => !entry)) throw new Error(`unknown scheme id in ${ids.join(',')}`);
  const strokes = strokeOptions(strokeFile);
  const words = multiwords(snowBaseFile, data, mass);
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const nativeMotor = upstreamMotor(snapshot);
  const header = {
    version: 'ckt-v4-row-binary-1',
    source: 'tools/export_ckt_v4_binary_fixture.js',
    keyAlphabet: ALPHABET,
    cognitiveParameters: PARAMETERS,
    extensionMaps: data.ckt.calibration.extension_maps,
    corpus: {mass, word2: words.word2.length, word3: words.word3.length, word4: words.word4.length},
    sourceHashes: {
      html: hashFile(html),
      snowBase: hashFile(snowBaseFile),
      stroke: hashFile(strokeFile),
      motorSnapshot: hashFile(snapshotFile),
    },
    caseCount: entries.length * 2,
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
    for (const entry of entries) {
      // Codes are layout-specific. Releasing this cache after each scheme keeps
      // large all-scheme exports bounded instead of retaining dead code strings.
      const motor = projectedMotor(nativeMotor, snapshot.keys, data.ckt.calibration.extension_maps);
      const contract = classifyContract(entry.capacity);
      for (const mode of ['keytao', 'sanpin']) {
        const rows = buildRows(entry, data, strokes, words, mode);
        const outcomes = resolveCompetition(rows, {motorCost: motor});
        const summary = summarizeOutcomes(outcomes, PARAMETERS);
        writer.string16(entry.id);
        writer.u8(entry.capacity[0]);
        writer.u8(entry.capacity[1]);
        writer.u8(contract === 'traditional-21x21' ? 0 : 1);
        writer.u8(mode === 'keytao' ? 0 : 1);
        writer.u32(rows.length);
        for (const kind of ['character', 'word2', 'word3', 'word4']) writeTrack(writer, summary[kind], kind);
        writeRows(writer, rows);
        writer.u32(CASE_END);
        writer.flush();
        process.stderr.write(`exported ${entry.id}/${mode}: ${rows.length} rows\n`);
      }
    }
  } finally {
    writer.close();
  }
  process.stderr.write(`wrote ${output} (${writer.bytesWritten} bytes)\n`);
}

if (require.main === module) main();

module.exports = {
  BinaryWriter,
  hashFile,
  parseArgs,
};
