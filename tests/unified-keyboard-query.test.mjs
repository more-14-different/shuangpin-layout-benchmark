import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url), query = require('../tools/unified_keyboard_query.js');
const {snowFilteredRows, snowQueryKeys} = require('../tools/snow_jiandao_toned_view.js');
const pinyin = ['jian', 'jiang', 'dao', 'xi', 'an', 'xian'];
const native = {tonedCodes: [['JZ','JF','JF','JQ',null],['JM',null,null,'JW',null],['DC','DH','DH','DT',null],['XX'],['AZ'],['XZ']],
  filterRows: [
    ['键','jian4','JQ','JQAV',1,'character'],
    ['件','jian4','JQ','JQOI',1,'character'],
    ['尖','jian1','JZ','JZU',1,'character'],
    ['江','jiang1','JM','JM',1,'character'],
    ['键道','jian4 dao4','JQDT','JQDTAV',1,'word2'],
    ['键盘','jian4 pan2','JQPF','JQPFUI',1,'word2'],
  ]};
const data = {pinyin, characters: [['键',0,4],['道',2,4]]};
const parse = text => query.parsePinyin(pinyin, text, (py,tone) => native.tonedCodes[py]?.[tone-1]);

test('semantic activation uses only queried readings, never neighbours or auxiliary completion keys', () => {
  for (const [q, expected] of [['键','JQ'],['Jian','JZFQ'],['jian4','JQ'],['dao','DCHT'],['dao4','DT'],['jiandao','JZFQDCHT'],['jian4dao4','JQDT'],['键道','JQDT']]) {
    const rows = snowFilteredRows(native,q,'all',pinyin);
    assert.deepEqual(snowQueryKeys(native,data,q,rows), new Set(expected),q);
  }
  assert.deepEqual(snowFilteredRows(native,'键','all',pinyin).map(row=>row[0]),['键']);
  assert.deepEqual(snowFilteredRows(native,'Jian','all',pinyin).map(row=>row[0]),['键','件','尖']);
  assert.deepEqual(snowFilteredRows(native,'jian4','all',pinyin).map(row=>row[0]),['键','件']);
  assert.deepEqual(snowFilteredRows(native,'jiandao','all',pinyin).map(row=>row[0]),['键道']);
});

test('full syllable boundaries exclude jiang and longer words; tones remain attached to syllables', () => {
  const jian = parse('Jian');
  assert.equal(query.matchesReading(jian,'jian4'),true);
  for (const reading of ['jiang1','jian4 dao4','dao4 jian4']) assert.equal(query.matchesReading(jian,reading),false);
  assert.equal(query.matchesReading(parse('jian4dao4'),'jian4 dao4'),true);
  assert.equal(query.matchesReading(parse('jian4dao4'),'jian1 dao4'),false);
  assert.equal(query.matchesReading(parse('jian4dao'),'jian4 dao1'),true);
});

test('explicit separators constrain segmentation; toneless concatenation prefers the fewest syllables', () => {
  assert.deepEqual(parse('xian').keys,new Set('XZ'));
  assert.deepEqual(parse("xi'an").keys,new Set('XXAZ'));
  assert.equal(query.matchesReading(parse("xi'an"),'xian1'),false);
  assert.equal(query.matchesReading(parse("xi'an"),'xi1 an1'),true);
  assert.equal(query.matchesReading(parse('jian4 dao4'),'jian4 dao4'),true);
  assert.deepEqual(parse('jiandao'.repeat(30)).keys,parse('jiandao').keys);
});

test('untoned mapping supports toned queries while retaining real character/word tone filtering', () => {
  const ordinary = query.parsePinyin(pinyin,'jian4dao4',py=>['JM','JX','DZ'][py]);
  assert.deepEqual(ordinary.keys,new Set('JMDZ'));
  assert.equal(query.matchesReading(ordinary,'jian dao'),true,'bare sound inventory carries no tone');
  assert.equal(query.matchesReading(ordinary,'jian4 dao4'),true);
  assert.equal(query.matchesReading(ordinary,'jian4 dao1'),false);
});

test('unknown words can preview per-character main codes without inventing corpus rows', () => {
  assert.deepEqual(snowFilteredRows(native,'键道键','all',pinyin),[]);
  assert.deepEqual(snowQueryKeys(native,data,'键道键',[]),new Set('JQDT'));
  assert.deepEqual(snowQueryKeys(native,data,'键龘',[]),new Set());
  assert.deepEqual(query.readingTokens('lü4 de0'),[{syllable:'lv',tone:4},{syllable:'de',tone:5}]);
});

test('filter-only callers may derive spellings from corpus order without mistaking them for code-table indices', () => {
  const corpus = {tonedCodes:[['AA',null,null,null,null],[null,null,null,'BD',null]],
    filterRows:[['道','dao4','BD','BD',1,'character'],['尖','jian1','AA','AA',1,'character']]};
  assert.deepEqual(snowFilteredRows(corpus,'dao4').map(row=>row[0]),['道']);
  assert.deepEqual(snowFilteredRows(corpus,'jian1').map(row=>row[0]),['尖']);
});
