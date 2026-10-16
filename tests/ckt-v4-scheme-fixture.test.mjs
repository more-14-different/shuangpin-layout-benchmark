import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildSchemeFixture,
  selectSchemeEntries,
} = require('../tools/ckt_v4_scheme_fixture.js');
const {
  buildNativeSchemeFixture,
} = require('../tools/export_ckt_v4_native_corpus.js');

const payload = {
  pinyin: ['ba', 'a', 'yuan', 'hng'],
  base: [[0, 1], [1, 1], [2, 1]],
  entries: [
    {id: 'first', capacity: [21, 21], tone: 'IVUAO', codeList: ['BA', 'AA', 'YN', null]},
    {id: 'second', capacity: [21, 26], tone: 'IEUAO', codeList: ['BB', 'AB', 'YO', null]},
    {id: 'third', capacity: [21, 28], tone: 'IEUAO', codeList: ['BC', 'AC', 'YP', null]},
  ],
};

test('all-scheme selection preserves HTML order', () => {
  assert.deepEqual(
    selectSchemeEntries(payload, ['all']).map(entry => entry.id),
    ['first', 'second', 'third'],
  );
});

test('explicit scheme selection preserves caller order and rejects unknown ids', () => {
  assert.deepEqual(
    selectSchemeEntries(payload, ['third', 'first']).map(entry => entry.id),
    ['third', 'first'],
  );
  assert.throws(() => selectSchemeEntries(payload, ['missing']), /unknown scheme id.*missing/);
  assert.throws(() => selectSchemeEntries(payload, ['all', 'first']), /all.*alone/);
});

test('standalone and native exporters share identical scheme topology fields', () => {
  const entries = selectSchemeEntries(payload, ['second', 'first']);
  const standalone = buildSchemeFixture(payload, entries, 'html-sha');
  const native = buildNativeSchemeFixture(payload, entries, 'html-sha');
  const comparable = value => ({
    keyAlphabet: value.keyAlphabet,
    sourceHashes: value.sourceHashes,
    heads: value.heads,
    finals: value.finals,
    pinyinMap: value.pinyinMap,
    commonPinyin: value.commonPinyin,
    schemes: value.schemes,
  });

  assert.equal(standalone.version, 'ckt-v4-scheme-state-2');
  assert.deepEqual(standalone.counts, {pinyin: 4, commonPinyin: 3, schemes: 2});
  assert.deepEqual(standalone.pinyinMap[0], [0, 0]);
  assert.deepEqual(standalone.pinyinMap[1], [21, 0]);
  assert.deepEqual(standalone.pinyinMap[2], [26, 32]);
  assert.deepEqual(standalone.pinyinMap[3], [0xff, 0xff]);
  assert.deepEqual(comparable(native), comparable(standalone));
});
