import test from 'node:test';
import assert from 'node:assert/strict';
import experiment from '../tools/explore_toned_2126.js';
import semantics from '../tools/auxiliary_semantics.js';
import model from '../tools/ckt_v4_model.js';

test('21x26 tone regions include all second keys and normalize neutral tone', () => {
  assert.equal(new Set(experiment.ROWS.join('')).size, 26);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(experiment.toneRow), [2, 2, 1, 1, 0, 2]);
  assert.throws(() => experiment.toneRow(6), /invalid tone/);
  experiment.validateLayout({tonedCodes: ['BA', 'BQ', 'BZ']}, ['ba2', 'ba4', 'ba5']);
  assert.throws(() => experiment.validateLayout({tonedCodes: ['AA']}, ['a2']), /invalid 21x26/);
  assert.throws(() => experiment.validateLayout({tonedCodes: ['BZ']}, ['ba4']), /wrong tone region/);
});

test('native word adapter preserves tone distinctions, weights and order without mutation', () => {
  const layout = {tonedCodes: ['BQ', 'BA', 'BZ']};
  const tokens = ['ba4', 'ba2', 'ba5'];
  const words = {word2: [{text: '爸爸', py: [0, 0], tones: [4, 0], weight: 27}]};
  const before = JSON.stringify(words);
  const adapted = experiment.adaptWords(layout, tokens, {pinyin: ['ba']}, words);
  assert.deepEqual(adapted.word2[0].py, [0, 2]);
  assert.equal(adapted.word2[0].weight, 27);
  assert.equal(JSON.stringify(words), before);
  assert.throws(() => experiment.adaptWords(layout, [], {pinyin: ['ba']}, words), /uncovered word token/);
});

test('AEUIO shape meanings round-trip through IEUAO tone slots', () => {
  const toneKeysByTone = semantics.toneKeysFromShapeKeys('AEUIO');
  assert.equal(toneKeysByTone, 'IEUAO');
  assert.equal(semantics.shapeKeysFromToneKeys(toneKeysByTone), 'AEUIO');
  assert.equal(semantics.toneDigitsAtShapeKeys(toneKeysByTone), '42310');
  assert.equal(semantics.physicalShape('AEUIO', toneKeysByTone), 'AEUIO');
});

test('21x26 residual three-character words join the two/four-character pools', () => {
  const stages = model.makeStages('four-code-top', 'word3', ['BCD', 'BCDA', 'BCDAE', 'BCDAEU']
    .map(code => ({length: code.length, codes: [code]})));
  assert.deepEqual(stages.map(stage => stage.pool), ['word3:three', 'word:four', 'word:five', 'word:six']);
  const row = (id, kind, weight, stages) => ({id, text: id, kind, weight, baseLength: 4, stages});
  const outcomes = model.resolveCompetition([
    row('early', 'word3', 100, stages), row('residual', 'word3', 10, stages),
    row('pair', 'word2', 50, model.makeStages('four-code-top', 'word2',
      ['BCDA', 'BCDAO', 'BCDAOI'].map(code => ({length: code.length, codes: [code]})))),
  ], {lengthBalance: experiment.BALANCE});
  assert.equal(outcomes.find(row => row.id === 'early').code, 'BCD');
  assert.equal(outcomes.find(row => row.id === 'pair').code, 'BCDA');
  assert.equal(outcomes.find(row => row.id === 'residual').code, 'BCDAE');
});
