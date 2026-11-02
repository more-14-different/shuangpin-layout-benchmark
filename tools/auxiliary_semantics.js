'use strict';

// snowshape 语料用这些抽象符号表示“折、横、撇、竖、点”。它们不是
// 任意方案的物理键序；物理键必须通过 toneKeysByTone 的槽位映射得到。
const SHAPE_SYMBOLS_BY_MEANING = 'AEUIO';
const SHAPE_MEANINGS = Object.freeze(['折', '横', '撇', '竖', '点']);
const SNOWSHAPE_SLOT_SYMBOLS = 'IEUAO';
const TONE_DIGITS_BY_SHAPE_MEANING = '42310';
const TONE_MEANINGS = Object.freeze(['一声', '二声', '三声', '四声', '轻声']);

function characters(value) {
  return [...String(value || '')];
}

function assertFiveDistinctKeys(keys, label = 'auxiliary keys') {
  const values = characters(keys);
  if (values.length !== 5 || new Set(values).size !== 5) {
    throw new Error(`${label} must contain exactly five distinct keys: ${JSON.stringify(keys)}`);
  }
  return values;
}

function physicalShape(abstract, toneKeysByTone) {
  return characters(abstract)
    .map(symbol => toneKeysByTone[SNOWSHAPE_SLOT_SYMBOLS.indexOf(symbol)] || '')
    .join('');
}

function shapeSlot(abstract, offset = 0) {
  const symbol = characters(abstract)[offset];
  const slot = SNOWSHAPE_SLOT_SYMBOLS.indexOf(symbol);
  return slot < 0 ? 0xff : slot;
}

function shapeKeysFromToneKeys(toneKeysByTone) {
  assertFiveDistinctKeys(toneKeysByTone, 'toneKeysByTone');
  return physicalShape(SHAPE_SYMBOLS_BY_MEANING, toneKeysByTone);
}

function toneKeysFromShapeKeys(shapeKeysByMeaning) {
  const keys = assertFiveDistinctKeys(shapeKeysByMeaning, 'shapeKeysByMeaning');
  return `${keys[3]}${keys[1]}${keys[2]}${keys[0]}${keys[4]}`;
}

function toneDigitsAtShapeKeys(toneKeysByTone) {
  const tones = assertFiveDistinctKeys(toneKeysByTone, 'toneKeysByTone');
  return characters(shapeKeysFromToneKeys(toneKeysByTone))
    .map(key => {
      const index = tones.indexOf(key);
      return index === 4 ? '0' : String(index + 1);
    })
    .join('');
}

function auxiliaryKeySet(keys) {
  return assertFiveDistinctKeys(keys).sort().join('');
}

function keySetClassFromKeys(keys) {
  const keySet = auxiliaryKeySet(keys);
  if (keySet === 'AEIOU') return 'AEUIO';
  if (keySet === 'AIOUV') return 'AVUIO';
  return 'ANY5';
}

function reservedKeyClassFromEntry(entry) {
  const keys = entry.reservedKeys || entry.topgongReserve || entry.tone;
  return keySetClassFromKeys(keys);
}

function auxiliarySemantics(toneKeysByTone) {
  const shapeKeysByMeaning = shapeKeysFromToneKeys(toneKeysByTone);
  const roundTrip = toneKeysFromShapeKeys(shapeKeysByMeaning);
  if (roundTrip !== toneKeysByTone) {
    throw new Error(`auxiliary semantic round trip failed: ${toneKeysByTone} -> ${shapeKeysByMeaning} -> ${roundTrip}`);
  }
  const toneDigitsByShapeMeaning = toneDigitsAtShapeKeys(toneKeysByTone);
  if (toneDigitsByShapeMeaning !== TONE_DIGITS_BY_SHAPE_MEANING) {
    throw new Error(`auxiliary semantic invariant changed: ${toneDigitsByShapeMeaning}`);
  }
  return {
    toneKeyClass: keySetClassFromKeys(toneKeysByTone),
    toneKeySet: auxiliaryKeySet(toneKeysByTone),
    shapeKeysByMeaning,
    toneKeysByTone,
    toneDigitsByShapeMeaning,
  };
}

module.exports = {
  SHAPE_MEANINGS,
  SHAPE_SYMBOLS_BY_MEANING,
  SNOWSHAPE_SLOT_SYMBOLS,
  TONE_DIGITS_BY_SHAPE_MEANING,
  TONE_MEANINGS,
  assertFiveDistinctKeys,
  auxiliaryKeySet,
  auxiliarySemantics,
  keySetClassFromKeys,
  physicalShape,
  reservedKeyClassFromEntry,
  shapeKeysFromToneKeys,
  shapeSlot,
  toneDigitsAtShapeKeys,
  toneKeysFromShapeKeys,
};
