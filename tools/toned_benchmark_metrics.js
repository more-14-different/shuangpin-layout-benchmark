'use strict';

// Shared offline/browser contract adapter. The motor, collision ranking and
// frozen normalization equations remain those of the ordinary atlas engines.
const TONED_BENCHMARK_TRACKS = Object.freeze({
  S2: {dataset: 'sound', contract: 'P'}, C2: {dataset: 'chars', contract: 'P'},
  C3: {dataset: 'chars', contract: 'T'},
  'C4-Snow': {dataset: 'chars', contract: 'X2', shape: 'snowshape'},
  'C4-SBxh': {dataset: 'chars', contract: 'X2', shape: 'sbxh2'},
  'C4-SBzr': {dataset: 'chars', contract: 'X2', shape: 'sbzr2'},
  'C5-TX2': {dataset: 'chars', contract: 'TX2', shape: 'snowshape'},
  'W4-Snow': {dataset: 'words', contract: 'P', lexicon: 'snow'},
  'W4-SBxh': {dataset: 'words', contract: 'P', lexicon: 'sbxh'},
  'W4-SBzr': {dataset: 'words', contract: 'P', lexicon: 'sbzr'},
  'W4-common': {dataset: 'words', contract: 'P', lexicon: 'common'},
  'W4-union': {dataset: 'words', contract: 'P', lexicon: 'union'},
  'W6-Snow': {dataset: 'words', contract: 'T', lexicon: 'snow', order: '12'},
  'W6-21': {dataset: 'words', contract: 'T', lexicon: 'snow', order: '21'},
  'WX-Snow-12': {dataset: 'words', contract: 'X2', lexicon: 'snow', shape: 'snowshape', order: '12'},
  'WX-Snow-21': {dataset: 'words', contract: 'X2', lexicon: 'snow', shape: 'snowshape', order: '21'},
  'WX-SBxh-12': {dataset: 'words', contract: 'X2', lexicon: 'snow', shape: 'sbxh2', order: '12'},
  'WX-SBxh-21': {dataset: 'words', contract: 'X2', lexicon: 'snow', shape: 'sbxh2', order: '21'},
  'WX-SBzr-12': {dataset: 'words', contract: 'X2', lexicon: 'snow', shape: 'sbzr2', order: '12'},
  'WX-SBzr-21': {dataset: 'words', contract: 'X2', lexicon: 'snow', shape: 'sbzr2', order: '21'},
});
const TONED_ROW_CACHE = new WeakMap();

function tonedSoundRows(data, native) {
  const toneMass = new Map();
  for (const [, py, tone, weight, common] of data.characters) {
    if (!common || !(weight > 0) || !native.tonedCodes[py]?.[tone - 1]) continue;
    const mass = toneMass.get(py) || [0, 0, 0, 0, 0];
    mass[tone - 1] += weight;toneMass.set(py, mass);
  }
  const rows = [];
  for (const [py, weight] of data.base) {
    const legal = native.tonedCodes[py].map((code, index) => code ? index : -1).filter(index => index >= 0);
    const mass = toneMass.get(py) || [0, 0, 0, 0, 0], total = mass.reduce((a, b) => a + b, 0);
    for (const slot of legal) rows.push({text: data.pinyin[py] + (slot === 4 ? 0 : slot + 1),
      py, tone: slot + 1, w: weight * (total ? mass[slot] / total : 1 / legal.length),
      code: native.tonedCodes[py][slot], role: 'IR', common: true,
      index: rows.length, bandRank: rows.length + 1, nchars: 1});
  }
  return rows;
}

function tonedRowsFor(data, native, options, shapeMap) {
  let cached = TONED_ROW_CACHE.get(native);
  if (!cached) {cached = new Map();TONED_ROW_CACHE.set(native, cached)}
  const key = JSON.stringify([options.dataset, options.contract, options.shape, options.lexicon, options.order]);
  if (cached.has(key)) return cached.get(key);
  if (options.dataset === 'sound') {
    const rows = tonedSoundRows(data, native);cached.set(key, rows);return rows;
  }
  const words = options.dataset === 'words', contract = options.contract || 'P';
  const needShape = ['T1', 'X2', 'TX2', 'XF'].includes(contract) || (contract === 'SB4' && !words);
  const source = words ? data.words : data.characters;
  const ranks = words ? null : new Map([...data.characters.keys()]
    .sort((a, b) => data.characters[b][3] - data.characters[a][3] || data.characters[a][0].localeCompare(data.characters[b][0], 'en'))
    .map((index, rank) => [index, rank + 1]));
  const rows = [];
  for (let index = 0; index < source.length; index++) {
    const row = source[index], lexicon = options.lexicon || 'snow';
    if (words && ((lexicon === 'snow' && !(row[6] & 1)) || (lexicon === 'sbxh' && !(row[6] & 2)) ||
      (lexicon === 'sbzr' && !(row[6] & 4)) || (lexicon === 'common' && row[6] !== 7))) continue;
    const codes = words ? [native.tonedCodes[row[1]]?.[row[3] - 1], native.tonedCodes[row[2]]?.[row[4] - 1]] : [native.tonedCodes[row[1]]?.[row[2] - 1]];
    const chars = [...row[0]], shapes = chars.map(char => shapeMap[char]);
    let code = null, role = '';
    if (codes.every(Boolean) && (!needShape || shapes.every(Boolean))) {
      const main = codes.join(''), mainRoles = words ? 'IRIR' : 'IR';
      let auxiliary = '';
      if (needShape) {
        if (contract === 'XF') auxiliary = shapes.join('');
        else if (words) {
          const order = options.order === '21' ? [1, 0] : [0, 1];
          auxiliary = order.map(at => shapes[at][0]).join('');
          if (contract === 'T1') auxiliary = shapes.map(shape => shape[0]).join('');
        } else auxiliary = shapes[0].slice(0, contract === 'T1' ? 1 : 2);
      }
      // Tone is already present in each full two-key syllable. T/Ti do not
      // append a second copy. T1 and TX2 retain their requested shape evidence.
      code = main + auxiliary;role = mainRoles + 'X'.repeat(auxiliary.length);
      if (words && contract === 'T1') {code = codes.map((ir, at) => ir + shapes[at][0]).join('');role = 'IRXIRX'}
    }
    rows.push({text: row[0], w: row[words ? 5 : 3], code, role,
      common: !!row[words ? 7 : 4], index, bandRank: words ? index + 1 : ranks.get(index)});
  }
  cached.set(key, rows);return rows;
}

function tonedGeneralizedScore(terms, beta = 4) {
  let sum = 0, total = 0;
  for (const {value, reference, weight} of terms) {
    if (!Number.isFinite(value) || !(reference > 0) || !(weight >= 0)) throw new Error('Invalid benchmark normalization term');
    sum += weight * (value / reference) ** beta;total += weight;
  }
  if (!(total > 0)) throw new Error('Empty benchmark normalization');
  return 10 * (sum / total) ** (1 / beta);
}

function tonedCompletionTime(metric, tau, firstAux = 0, secondAux = 0, cognitive = null) {
  const motor = metric.motorUpperMs ?? metric.completionUpperMs;
  const miss = metric.selectionRate ?? metric.p2;
  let value = motor + tau * miss + firstAux * metric.firstAuxRate + secondAux * metric.secondAuxRate;
  if (cognitive) value += (cognitive.selectionActionMs || 0) * miss +
    (cognitive.scanPerCandidateMs || 0) * (metric.meanRejectedCandidates || 0) +
    (cognitive.pageActionMs || 0) * (metric.meanPageActions || 0);
  return value;
}

if (typeof module !== 'undefined') module.exports = {
  TONED_BENCHMARK_TRACKS, tonedSoundRows, tonedRowsFor, tonedGeneralizedScore, tonedCompletionTime,
};
