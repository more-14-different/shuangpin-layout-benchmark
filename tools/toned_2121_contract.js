'use strict';

const {
  auxiliarySemantics,
  toneKeysFromShapeKeys,
} = require('./auxiliary_semantics.js');

const PHYSICAL_ROWS = Object.freeze({
  upper: 'QWERTYUIOP',
  home: 'ASDFGHJKL',
  lower: 'ZXCVBNM',
});
const KEYBOARD_KEYS = Object.values(PHYSICAL_ROWS).join('');
const TONE_ROWS = Object.freeze(['upper', 'home', 'lower']);
const LEXICAL_TONES = Object.freeze([1, 2, 3, 4]);
const FINAL_COLUMNS_PER_ROW = 7;
const AUXILIARY_KEY_SET_LABEL = 'QAOPL';
const AUXILIARY_KEY_SET = [...AUXILIARY_KEY_SET_LABEL].sort().join('');
const QZ_AUXILIARY_KEY_SET_LABEL = 'AVUIO';
const QZ_AUXILIARY_KEY_SET = [...QZ_AUXILIARY_KEY_SET_LABEL].sort().join('');
const DEFAULT_SHAPE_KEYS_BY_MEANING = AUXILIARY_KEY_SET_LABEL;
const PRIMARY_TONE_ROW_ASSIGNMENT = Object.freeze({
  upper: Object.freeze([4]),
  home: Object.freeze([3, 2]),
  lower: Object.freeze([1]),
});
const SECOND_CODE_FACTORIZATIONS = Object.freeze([
  Object.freeze({
    id: 'shengjie-rhyme-body',
    firstComponent: '声母+介音',
    secondComponent: '剩余韵身（韵腹/韵尾）',
    priorTemplate: 'shengjie',
  }),
  Object.freeze({
    id: 'shengjie-pindu11-rhyme',
    firstComponent: '声母+介音',
    secondComponent: '旧拼读规则归并后的11类韵身',
    priorTemplate: 'pindu11',
  }),
  Object.freeze({
    id: 'restored-onset-full-final',
    firstComponent: '统一还原声类',
    secondComponent: '完整还原韵母',
    priorTemplate: 'restored',
  }),
  Object.freeze({
    id: 'written-onset-written-final',
    firstComponent: '书写声母（含规则零声母分型）',
    secondComponent: '书写韵部',
    priorTemplate: 'writtenZero',
  }),
  Object.freeze({
    id: 'mars-written-onset-headless-final',
    firstComponent: '火星书写声母（卷舌声母可单列）',
    secondComponent: '忽略 i/u/ü 韵头后归并的火星10韵列',
    priorTemplate: 'mars10',
  }),
]);
const TONED_BUCKET_COUNT = 21 * TONE_ROWS.length * FINAL_COLUMNS_PER_ROW;

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1),
  ]).map(rest => [value, ...rest]));
}

function combinations(values, count) {
  if (count === 0) return [[]];
  if (values.length < count) return [];
  return values.flatMap((value, index) => combinations(values.slice(index + 1), count - 1)
    .map(rest => [value, ...rest]));
}

function enumerateRowBalancedAuxiliaryKeySets() {
  const sets = [];
  for (const upper of combinations([...PHYSICAL_ROWS.upper], 3)) {
    for (const home of combinations([...PHYSICAL_ROWS.home], 2)) {
      sets.push([...upper, ...home].sort().join(''));
    }
  }
  return sets;
}

function enumerateToneRowAssignments() {
  const assignments = [];
  for (let left = 0; left < LEXICAL_TONES.length; left++) {
    for (let right = left + 1; right < LEXICAL_TONES.length; right++) {
      const pair = [LEXICAL_TONES[left], LEXICAL_TONES[right]];
      const singles = LEXICAL_TONES.filter(tone => !pair.includes(tone)).map(tone => [tone]);
      for (const groups of permutations([pair, ...singles])) {
        assignments.push(Object.fromEntries(TONE_ROWS.map((row, index) => [row, groups[index]])));
      }
    }
  }
  return assignments;
}

function validateToneRowAssignment(assignment) {
  const groups = TONE_ROWS.map(row => assignment?.[row]);
  if (groups.some(group => !Array.isArray(group) || group.length === 0)) {
    throw new Error('tone row assignment must define non-empty upper, home, and lower groups');
  }
  const tones = groups.flat();
  if (tones.length !== 4 || new Set(tones).size !== 4 ||
      LEXICAL_TONES.some(tone => !tones.includes(tone))) {
    throw new Error('tone row assignment must contain lexical tones 1-4 exactly once');
  }
  if (groups.filter(group => group.length === 2).length !== 1 ||
      groups.filter(group => group.length === 1).length !== 2) {
    throw new Error('tone row assignment must merge exactly one lexical-tone pair');
  }
  return assignment;
}

function rowForTone(tone, assignment = PRIMARY_TONE_ROW_ASSIGNMENT) {
  validateToneRowAssignment(assignment);
  const numericTone = Number(tone);
  const lexicalTone = numericTone === 0 || numericTone === 5 ? 1 : numericTone;
  const row = TONE_ROWS.find(candidate => assignment[candidate].includes(lexicalTone));
  if (!row) throw new Error(`unsupported tone: ${tone}`);
  return row;
}

function buildToned2121Contract(shapeKeysByMeaning = DEFAULT_SHAPE_KEYS_BY_MEANING) {
  const toneKeysByTone = toneKeysFromShapeKeys(shapeKeysByMeaning);
  const semantics = auxiliarySemantics(toneKeysByTone);
  if (semantics.toneKeySet !== AUXILIARY_KEY_SET) {
    throw new Error(`toned 3x7 research freezes auxiliaryKeySet=${AUXILIARY_KEY_SET_LABEL}: ${shapeKeysByMeaning}`);
  }
  const auxiliaryKeySet = new Set(semantics.shapeKeysByMeaning);
  const soundKeysByRow = Object.fromEntries(Object.entries(PHYSICAL_ROWS).map(([row, keys]) => [
    row,
    [...keys].filter(key => !auxiliaryKeySet.has(key)).join(''),
  ]));
  const auxiliaryKeyCountByRow = Object.fromEntries(Object.entries(PHYSICAL_ROWS).map(([row, keys]) => [
    row,
    [...keys].filter(key => auxiliaryKeySet.has(key)).length,
  ]));
  const soundKeyCountByRow = Object.fromEntries(Object.entries(soundKeysByRow).map(([row, keys]) => [row, keys.length]));
  const soundKeys = Object.values(soundKeysByRow).join('');
  if (JSON.stringify(auxiliaryKeyCountByRow) !== JSON.stringify({upper: 3, home: 2, lower: 0})) {
    throw new Error(`3x7 topology requires auxiliary keys distributed 3/2/0 across upper/home/lower rows: ${shapeKeysByMeaning}`);
  }
  if (soundKeys.length !== 21 || semantics.toneKeySet.length !== 5) {
    throw new Error('toned 21x21 contract requires 21 sound keys plus five shape-auxiliary keys');
  }
  return {
    version: 'ckt-v5.1-toned-21x21-shape5-contract-2',
    objective: 'CKT v5.1',
    firstKeyCount: soundKeys.length,
    firstKeySemantics: 'selected by secondCodeFactorization',
    secondKeyCount: TONE_ROWS.length * FINAL_COLUMNS_PER_ROW,
    secondKeySemantics: 'tone row x factorization-specific second component column',
    finalColumnsPerRow: FINAL_COLUMNS_PER_ROW,
    toneRows: [...TONE_ROWS],
    primaryToneRowAssignment: PRIMARY_TONE_ROW_ASSIGNMENT,
    lexicalToneRowAssignmentCount: enumerateToneRowAssignments().length,
    neutralTonePolicy: 'follow-tone1',
    tonedSyllableBuckets: TONED_BUCKET_COUNT,
    physicalRows: PHYSICAL_ROWS,
    soundKeys,
    soundKeysByRow,
    soundKeyCountByRow,
    auxiliaryKeyCountByRow,
    rowBalancedAuxiliaryKeySetUniverseCount: enumerateRowBalancedAuxiliaryKeySets().length,
    auxiliaryKeySetCandidateCount: 1,
    auxiliaryLayoutCandidateCount: 120,
    auxiliarySelectionStatus: 'frozen-from-prior-research',
    auxiliaryKeySetLabel: AUXILIARY_KEY_SET_LABEL,
    auxiliaryKeySet: semantics.toneKeySet,
    shapeKeysByMeaning: semantics.shapeKeysByMeaning,
    toneKeysByTone: semantics.toneKeysByTone,
    toneDigitsByShapeMeaning: semantics.toneDigitsByShapeMeaning,
    shapeAuxiliaryEnabled: true,
    toneAuxiliaryEnabled: false,
    secondCodeFactorizationSelectionStatus: 'unresolved-for-toned-3x7',
    secondCodeFactorizations: SECOND_CODE_FACTORIZATIONS,
  };
}

function buildVariableToneRegionContract(shapeKeysByMeaning = 'AVUIO') {
  const toneKeysByTone = toneKeysFromShapeKeys(shapeKeysByMeaning);
  const semantics = auxiliarySemantics(toneKeysByTone);
  if (semantics.toneKeySet !== QZ_AUXILIARY_KEY_SET) {
    throw new Error(`7/8/6 research freezes auxiliaryKeySet=${QZ_AUXILIARY_KEY_SET_LABEL}: ${shapeKeysByMeaning}`);
  }
  const auxiliaryKeySet = new Set(semantics.shapeKeysByMeaning);
  const soundKeysByRow = Object.fromEntries(Object.entries(PHYSICAL_ROWS).map(([row, keys]) => [
    row,
    [...keys].filter(key => !auxiliaryKeySet.has(key)).join(''),
  ]));
  const auxiliaryKeyCountByRow = Object.fromEntries(Object.entries(PHYSICAL_ROWS).map(([row, keys]) => [
    row,
    [...keys].filter(key => auxiliaryKeySet.has(key)).length,
  ]));
  const soundKeyCountByRow = Object.fromEntries(Object.entries(soundKeysByRow)
    .map(([row, keys]) => [row, keys.length]));
  const soundKeys = Object.values(soundKeysByRow).join('');
  if (soundKeys.length !== 21 || new Set(soundKeys).size !== 21) {
    throw new Error('variable tone-region contract requires 21 distinct sound keys');
  }
  return {
    version: 'ckt-v5.1-toned-21x21-variable-tone-regions-1',
    objective: 'CKT v5.1',
    firstKeyCount: 21,
    firstKeySemantics: 'selected by secondCodeFactorization',
    secondKeyCount: 21,
    secondKeySemantics: 'tone region x tone-specific rhyme partition',
    toneRows: [...TONE_ROWS],
    primaryToneRowAssignment: PRIMARY_TONE_ROW_ASSIGNMENT,
    neutralTonePolicy: 'follow-tone1',
    tonedSyllableBuckets: 21 * 21,
    physicalRows: PHYSICAL_ROWS,
    soundKeys,
    soundKeysByRow,
    soundKeyCountByRow,
    auxiliaryKeyCountByRow,
    auxiliaryKeySetLabel: QZ_AUXILIARY_KEY_SET_LABEL,
    auxiliaryKeySet: semantics.toneKeySet,
    shapeKeysByMeaning: semantics.shapeKeysByMeaning,
    toneKeysByTone: semantics.toneKeysByTone,
    toneDigitsByShapeMeaning: semantics.toneDigitsByShapeMeaning,
    shapeAuxiliaryEnabled: true,
    toneAuxiliaryEnabled: false,
    secondCodeFactorizationSelectionStatus: 'pindu11-tone-specific-region-partitions',
  };
}

module.exports = {
  AUXILIARY_KEY_SET,
  AUXILIARY_KEY_SET_LABEL,
  DEFAULT_SHAPE_KEYS_BY_MEANING,
  FINAL_COLUMNS_PER_ROW,
  KEYBOARD_KEYS,
  LEXICAL_TONES,
  PHYSICAL_ROWS,
  PRIMARY_TONE_ROW_ASSIGNMENT,
  QZ_AUXILIARY_KEY_SET,
  QZ_AUXILIARY_KEY_SET_LABEL,
  SECOND_CODE_FACTORIZATIONS,
  TONED_BUCKET_COUNT,
  TONE_ROWS,
  buildToned2121Contract,
  buildVariableToneRegionContract,
  enumerateRowBalancedAuxiliaryKeySets,
  enumerateToneRowAssignments,
  rowForTone,
  validateToneRowAssignment,
};
