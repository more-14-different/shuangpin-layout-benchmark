'use strict';

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./";
const HEADS = ['b','p','m','f','d','t','n','l','g','k','h','j','q','x','zh','ch','sh','r','z','c','s','A','E','O','W','Y','YU'];
const FINALS = ['a','ai','an','ang','ao','e','ei','en','eng','er','i','ia','ian','iang','iao','ie','in','ing','iong','iu','o','ong','ou','u','ua','uai','uan','uang','ui','un','uo','v','van','ve','vn'];
const CONSONANTS = HEADS.slice(0, 21).sort((a, b) => b.length - a.length);
const YU = new Set(['yu', 'yuan', 'yue', 'yun']);

function splitPinyin(py) {
  let head;
  let final;
  if ('aeo'.includes(py[0])) {
    head = py[0].toUpperCase();
    final = py;
  } else if (py.startsWith('y')) {
    head = YU.has(py) ? 'YU' : 'Y';
    final = py.slice(1);
  } else if (py.startsWith('w')) {
    head = 'W';
    final = py.slice(1);
  } else {
    head = CONSONANTS.find(value => py.startsWith(value));
    if (!head) return [0xff, 0xff];
    final = py.slice(head.length);
  }
  if (['j', 'q', 'x', 'Y', 'YU'].includes(head) && final.startsWith('u')) {
    final = `v${final.slice(1)}`;
  }
  // 来源拼写 ue 与规范韵母 ve 都表示 üe，不建立独立韵母槽位。
  if (final === 'ue') final = 've';
  const headIndex = HEADS.indexOf(head);
  const finalIndex = FINALS.indexOf(final);
  if (headIndex < 0 || finalIndex < 0) return [0xff, 0xff];
  return [headIndex, finalIndex];
}

function selectSchemeEntries(data, ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('at least one scheme id is required');
  if (ids.includes('all')) {
    if (ids.length !== 1) throw new Error('all must be selected alone');
    return [...data.entries];
  }
  return ids.map(id => {
    const entry = data.entries.find(candidate => candidate.id === id);
    if (!entry) throw new Error(`unknown scheme id ${id}`);
    return entry;
  });
}

function buildSchemeFixture(data, entries, htmlHash) {
  return {
    version: 'ckt-v4-scheme-state-2',
    source: 'tools/ckt_v4_scheme_fixture.js',
    keyAlphabet: ALPHABET,
    sourceHashes: {html: htmlHash},
    counts: {
      pinyin: data.pinyin.length,
      commonPinyin: data.base.length,
      schemes: entries.length,
    },
    heads: HEADS,
    finals: FINALS,
    pinyinMap: data.pinyin.map(splitPinyin),
    commonPinyin: data.base.map(row => row[0]),
    schemes: entries.map(entry => ({
      id: entry.id,
      capacity: entry.capacity,
      tone: entry.tone,
      codeList: entry.codeList,
    })),
  };
}

module.exports = {
  ALPHABET,
  FINALS,
  HEADS,
  buildSchemeFixture,
  selectSchemeEntries,
  splitPinyin,
};
