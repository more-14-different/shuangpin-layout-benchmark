#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scorer = require('./score_completion_ckt_v4.js');
const {
  buildReference,
  evaluateLayoutPolicy,
  projectedMotor,
} = require('./score_toned_2121_ckt_v51.js');
const {buildToned2121Contract} = require('./toned_2121_contract.js');

const TRACK_WEIGHTS = Object.freeze({character: 1, word2: 3, word3: 1, word4: 1});
const FIXED_SHAPE_KEYS_BY_MEANING = 'QOLAP';
const FIXED_WORD_POLICY = Object.freeze({word2: '21', word3: '213', word4: '23'});

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith('--')) continue;
    args[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--')
      ? argv[++index] : true;
  }
  return args;
}

function addExposure(target, token, kind, value) {
  if (!target.has(token)) target.set(token, {total: 0, tracks: {}});
  const entry = target.get(token);
  entry.total += value;
  entry.tracks[kind] = (entry.tracks[kind] || 0) + value;
}

function buildExposure(data, words, layoutBundle) {
  const validTokens = new Set(layoutBundle.tokenKeys);
  const common = new Set(data.base.map(([index]) => index));
  const characterRows = data.characters.filter(([text, py, tone, weight, isCommon]) =>
    isCommon && weight > 0 && !scorer.FIXED_ONE_KEY.has(text) && common.has(py) &&
    validTokens.has(`${data.pinyin[py]}${tone}`));
  const tracks = {character: characterRows, ...words};
  const totals = Object.fromEntries(Object.entries(tracks).map(([kind, rows]) =>
    [kind, rows.reduce((sum, row) => sum + (kind === 'character' ? row[3] : row.weight), 0)]));
  const exposure = new Map();
  for (const row of characterRows) {
    addExposure(exposure, `${data.pinyin[row[1]]}${row[2]}`, 'character',
      TRACK_WEIGHTS.character * row[3] / totals.character);
  }
  for (const kind of ['word2', 'word3', 'word4']) for (const row of words[kind]) {
    for (let index = 0; index < row.py.length; index++) {
      const token = `${data.pinyin[row.py[index]]}${row.tones[index]}`;
      if (validTokens.has(token)) addExposure(exposure, token, kind,
        TRACK_WEIGHTS[kind] * row.weight / totals[kind]);
    }
  }
  const exposureUnits = [...exposure.values()].reduce((sum, value) => sum + value.total, 0);
  return {exposure, exposureUnits, totals, rowCounts: Object.fromEntries(
    Object.entries(tracks).map(([kind, rows]) => [kind, rows.length]))};
}

function tokenRecords(layout, bundle, inventory, exposure) {
  const decomposition = new Map(inventory.decomposition.map(value => [value.pinyin, value]));
  return bundle.tokenKeys.map((token, index) => {
    const match = token.match(/^([a-z]+)([1-5])$/);
    const split = decomposition.get(match[1]);
    if (!split) throw new Error(`missing decomposition for ${match[1]}`);
    const weighted = exposure.get(token) || {total: 0, tracks: {}};
    return {
      token,
      pinyin: match[1],
      tone: Number(match[2]),
      code: layout.tonedCodes[index],
      weight: weighted.total,
      tracks: weighted.tracks,
      ...split,
    };
  });
}

function separationPotential(records, property, exposureUnits) {
  const groups = new Map();
  const buckets = new Map();
  for (const record of records) {
    const group = typeof property === 'function' ? property(record) : record[property];
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(record);
    if (!buckets.has(record.code)) buckets.set(record.code, []);
    buckets.get(record.code).push({...record, group});
  }
  const result = [];
  for (const [group, values] of groups) {
    let potential = 0;
    const codes = new Set(values.map(value => value.code));
    for (const code of codes) {
      const bucket = buckets.get(code);
      const own = Math.max(0, ...bucket.filter(value => value.group === group).map(value => value.weight));
      const other = Math.max(0, ...bucket.filter(value => value.group !== group).map(value => value.weight));
      potential += Math.min(own, other);
    }
    const weight = values.reduce((sum, value) => sum + value.weight, 0);
    result.push({
      family: group,
      tonedTypeCount: values.length,
      positiveTypeCount: values.filter(value => value.weight > 0).length,
      exposureShare: weight / exposureUnits,
      idealSeparationGainShare: potential / exposureUnits,
    });
  }
  return result.sort((left, right) =>
    right.idealSeparationGainShare - left.idealSeparationGainShare ||
    right.exposureShare - left.exposureShare || String(left.family).localeCompare(String(right.family)));
}

function flyingAudit(layout, bundle, inventory, contract) {
  const records = tokenRecords(layout, bundle, inventory, new Map());
  const rows = Object.values(contract.soundKeysByRow);
  const location = new Map(rows.flatMap((row, rowIndex) => [...row].map((key, column) =>
    [key, {rowIndex, column}])));
  const firstByShengjie = new Map();
  const secondByTonedFinal = new Map();
  for (const record of records) {
    if (!firstByShengjie.has(record.shengjie)) firstByShengjie.set(record.shengjie, new Set());
    firstByShengjie.get(record.shengjie).add(record.code[0]);
    const key = `${record.fullFinal}${record.tone}`;
    if (!secondByTonedFinal.has(key)) secondByTonedFinal.set(key, new Set());
    secondByTonedFinal.get(key).add(record.code[1]);
    if (!location.has(record.code[1])) throw new Error(`unknown second key ${record.code[1]}`);
  }
  const summarize = source => [...source].filter(([, keys]) => keys.size !== 1)
    .map(([family, keys]) => ({family, keys: [...keys].sort()}));
  return {
    shengjieFamilyCount: firstByShengjie.size,
    tonedFullFinalFamilyCount: secondByTonedFinal.size,
    shengjieFlying: summarize(firstByShengjie),
    tonedFullFinalFlying: summarize(secondByTonedFinal),
  };
}

function soundGrid(contract) {
  const rows = Object.values(contract.soundKeysByRow);
  return {
    rows,
    location: new Map(rows.flatMap((row, rowIndex) => [...row].map((key, column) =>
      [key, {rowIndex, column}]))),
  };
}

function orientationVariant(base, bundle, inventory, contract, nasalMirror, umlautMirror) {
  const decomposition = new Map(inventory.decomposition.map(value => [value.pinyin, value]));
  const {rows, location} = soundGrid(contract);
  const columnsTo = base.physicalPermutation?.columnsTo || [0, 1, 2, 3, 4, 5, 6];
  const physicalToLogical = new Map(columnsTo.map((physical, logical) => [physical, logical]));
  const tonedCodes = base.tonedCodes.map((code, index) => {
    const pinyin = bundle.tokenKeys[index].replace(/[1-5]$/, '');
    const split = decomposition.get(pinyin);
    const current = location.get(code[1]);
    let delta = 0;
    if (nasalMirror && ['an', 'ang'].includes(split.rhymeBody)) {
      if (split.medial === 'i') delta += 2;
      if (split.medial === 'u') delta -= 2;
    }
    if (umlautMirror && split.medial === 'v') delta -= 4;
    if (!delta) return code;
    const logical = physicalToLogical.get(current.column);
    const targetLogical = (logical + delta + 14) % 7;
    return code[0] + rows[current.rowIndex][columnsTo[targetLogical]];
  });
  return {
    ...base,
    id: `${base.id}-IU-${nasalMirror ? 'MIRROR' : 'SEED'}-V-${umlautMirror ? 'MINUS2' : 'PLUS2'}`,
    tonedCodes,
    ruleOrientation: `nasal an/ang ${nasalMirror ? 'i +1, u -1' : 'i -1, u +1'}; umlaut ${umlautMirror ? '-2' : '+2'}`,
  };
}

function offsetRuleCount(iOffset, uOffset, vOffset) {
  let rules = 0;
  if (iOffset || uOffset) {
    rules += iOffset && uOffset && iOffset === -uOffset ? 1
      : Number(Boolean(iOffset)) + Number(Boolean(uOffset));
  }
  if (vOffset) rules++;
  return rules;
}

function offsetVariant(base, bundle, inventory, contract, iOffset, uOffset, vOffset) {
  const decomposition = new Map(inventory.decomposition.map(value => [value.pinyin, value]));
  const {rows, location} = soundGrid(contract);
  const columnsTo = base.physicalPermutation?.columnsTo || [0, 1, 2, 3, 4, 5, 6];
  const tonedCodes = base.tonedCodes.map((code, index) => {
    const pinyin = bundle.tokenKeys[index].replace(/[1-5]$/, '');
    const split = decomposition.get(pinyin);
    const current = location.get(code[1]);
    const rootKey = split.rhymeBody === '_' ? '' : split.rhymeBody;
    const root = Number(base.rhymeColumns[rootKey]) - 1;
    if (!Number.isInteger(root)) throw new Error(`missing rhyme root for ${split.rhymeBody}`);
    let offset = 0;
    if (['an', 'ang'].includes(split.rhymeBody) && split.medial === 'i') offset = iOffset;
    if (['an', 'ang'].includes(split.rhymeBody) && split.medial === 'u') offset = uOffset;
    if (split.medial === 'v') offset = vOffset;
    const logical = (root + offset + 14) % 7;
    return code[0] + rows[current.rowIndex][columnsTo[logical]];
  });
  const uniformRules = offsetRuleCount(iOffset, uOffset, vOffset);
  return {
    ...base,
    id: `${base.id}-OFF-I${iOffset}-U${uOffset}-V${vOffset}`,
    tonedCodes,
    ruleOrientation: `nasal i ${iOffset >= 0 ? '+' : ''}${iOffset}; nasal u ${uOffset >= 0 ? '+' : ''}${uOffset}; umlaut ${vOffset >= 0 ? '+' : ''}${vOffset}`,
    offsetRuleAudit: {
      iOffset,
      uOffset,
      vOffset,
      uniformRules,
      MRuleEstimate: 10 + uniformRules,
      definition: 'M12 seed has 10 non-offset rules plus two uniform offset rules; this is a grammar-relative count, not a global minimum proof',
    },
  };
}

function weightedTop1(records, transform = null) {
  const maximum = new Map();
  for (const record of records) {
    const code = transform ? transform(record) : record.code;
    maximum.set(code, Math.max(maximum.get(code) || 0, record.weight));
  }
  return [...maximum.values()].reduce((sum, value) => sum + value, 0);
}

function relocationRanking(records, property, position, contract, base, exposureUnits) {
  const groups = [...new Set(records.map(record => record[property]))];
  const baseline = weightedTop1(records);
  const {rows, location} = soundGrid(contract);
  const columnsTo = base.physicalPermutation?.columnsTo || [0, 1, 2, 3, 4, 5, 6];
  const destinations = position === 'first' ? [...contract.soundKeys] : [0, 1, 2, 3, 4, 5, 6];
  const result = [];
  for (const family of groups) for (const destination of destinations) {
    const familyRecords = records.filter(record => record[property] === family);
    const current = new Set(familyRecords.map(record => position === 'first'
      ? record.code[0] : columnsTo.indexOf(location.get(record.code[1]).column)));
    if (current.size === 1 && current.has(destination)) continue;
    const top1 = weightedTop1(records, record => {
      if (record[property] !== family) return record.code;
      if (position === 'first') return destination + record.code[1];
      const second = location.get(record.code[1]);
      return record.code[0] + rows[second.rowIndex][columnsTo[destination]];
    });
    result.push({
      family,
      destination: position === 'first' ? destination : destination + 1,
      sourceCount: current.size,
      source: [...current].map(value => position === 'first' ? value : value + 1),
      deltaTop1Share: (top1 - baseline) / exposureUnits,
    });
  }
  return result.sort((left, right) => right.deltaTop1Share - left.deltaTop1Share ||
    String(left.family).localeCompare(String(right.family)));
}

function familyMoveVariant(base, bundle, inventory, contract, move) {
  const decomposition = new Map(inventory.decomposition.map(value => [value.pinyin, value]));
  const {rows, location} = soundGrid(contract);
  const columnsTo = base.physicalPermutation?.columnsTo || [0, 1, 2, 3, 4, 5, 6];
  return {
    ...base,
    id: `${base.id}-${move.property}-${move.family}-${move.destination}`,
    origin: 'weighted-whole-family-single-move-audit',
    tonedCodes: base.tonedCodes.map((code, index) => {
      const pinyin = bundle.tokenKeys[index].replace(/[1-5]$/, '');
      const split = decomposition.get(pinyin);
      if (split[move.property] !== move.family) return code;
      if (move.position === 'first') return move.destination + code[1];
      const current = location.get(code[1]);
      if (move.position === 'second-relative') {
        const logical = columnsTo.indexOf(current.column);
        const target = (logical + move.delta + 7) % 7;
        return code[0] + rows[current.rowIndex][columnsTo[target]];
      }
      if (move.position === 'second-physical-relative') {
        const target = (current.column + move.delta + 7) % 7;
        return code[0] + rows[current.rowIndex][target];
      }
      return code[0] + rows[current.rowIndex][columnsTo[move.destination - 1]];
    }),
    move,
  };
}

function candidateMovesFromProxy(relocationProxy, perClass) {
  const specifications = [
    ['shengjieToFirstKey', 'shengjie', 'first'],
    ['initialToFirstKey', 'initial', 'first'],
    ['fullFinalToSecondColumn', 'fullFinal', 'second'],
    ['rhymeBodyToSecondColumn', 'rhymeBody', 'second'],
  ];
  const moves = specifications.flatMap(([ranking, property, position]) =>
    relocationProxy[ranking].filter(value => value.deltaTop1Share > 0).slice(0, perClass)
      .map(value => ({property, position, family: value.family,
        destination: value.destination, proxyDeltaTop1Share: value.deltaTop1Share})));
  moves.push(
    {property: 'shengjie', position: 'first', family: 'ch', destination: 'K',
      provenance: 'prior full-CKT M13 champion'},
    {property: 'shengjie', position: 'first', family: '_v', destination: 'K',
      provenance: 'prior full-CKT M13 frontier'},
    {property: 'rhymeBody', position: 'second-physical-relative', family: 'o', delta: 3,
      destination: 'physical+3', provenance: 'prior o:+3 full-CKT near champion'},
    {property: 'rhymeBody', position: 'second-physical-relative', family: 'n', delta: 5,
      destination: 'physical+5', provenance: 'prior n:+5 full-CKT frontier'},
  );
  return [...new Map(moves.map(value =>
    [`${value.property}/${value.family}/${value.destination}`, value])).values()];
}

function topTonedSyllables(records, exposureUnits, limit) {
  const buckets = new Map();
  for (const record of records) {
    if (!buckets.has(record.code)) buckets.set(record.code, []);
    buckets.get(record.code).push(record);
  }
  return records.map(record => {
    const other = Math.max(0, ...buckets.get(record.code)
      .filter(value => value.token !== record.token).map(value => value.weight));
    return {
      token: record.token,
      pinyin: record.pinyin,
      tone: record.tone,
      code: record.code,
      shengjie: record.shengjie,
      medial: record.medial || '_',
      rhymeBody: record.rhymeBody,
      fullFinal: record.fullFinal,
      exposureShare: record.weight / exposureUnits,
      idealIndividualSeparationGainShare: Math.min(record.weight, other) / exposureUnits,
      tracks: record.tracks,
    };
  }).filter(value => value.exposureShare > 0)
    .sort((left, right) => right.exposureShare - left.exposureShare)
    .slice(0, limit);
}

function topTonedSyllablesByGain(records, exposureUnits, limit) {
  const buckets = new Map();
  for (const record of records) {
    if (!buckets.has(record.code)) buckets.set(record.code, []);
    buckets.get(record.code).push(record);
  }
  return records.map(record => {
    const other = Math.max(0, ...buckets.get(record.code)
      .filter(value => value.token !== record.token).map(value => value.weight));
    return {
      token: record.token,
      code: record.code,
      shengjie: record.shengjie,
      medial: record.medial || '_',
      rhymeBody: record.rhymeBody,
      fullFinal: record.fullFinal,
      exposureShare: record.weight / exposureUnits,
      idealIndividualSeparationGainShare: Math.min(record.weight, other) / exposureUnits,
    };
  }).filter(value => value.idealIndividualSeparationGainShare > 0)
    .sort((left, right) => right.idealIndividualSeparationGainShare -
      left.idealIndividualSeparationGainShare)
    .slice(0, limit);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const layoutsFile = path.resolve(args.layouts ||
    path.join(root, 'research/config/ckt-v51-toned-2121-M12-D0V0-finalists.json'));
  const seedsFile = path.resolve(args.seeds ||
    path.join(root, 'research/config/ckt-v51-toned-2121-seeds.json'));
  const output = path.resolve(args.output ||
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-weighted-components.json'));
  const data = scorer.loadPayload(html);
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const bundle = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const contract = buildToned2121Contract();
  const base = bundle.layouts[0];
  const weighted = buildExposure(data, words, bundle);
  const records = tokenRecords(base, bundle, inventory, weighted.exposure);
  const motor = projectedMotor(data);
  const reference = buildReference({data, words, strokes, motor, snow});
  const orientations = [];
  for (const nasalMirror of [false, true]) for (const umlautMirror of [false, true]) {
    const layout = orientationVariant(base, bundle, inventory, contract, nasalMirror, umlautMirror);
    const {outcomes: _discardedOutcomes, ...result} = evaluateLayoutPolicy({
      layout,
      layouts: bundle,
      data,
      words,
      motor,
      reference,
      shapeKeysByMeaning: FIXED_SHAPE_KEYS_BY_MEANING,
      policy: FIXED_WORD_POLICY,
    });
    orientations.push({
      id: layout.id,
      ruleOrientation: layout.ruleOrientation,
      score: result.score,
      tracks: result.tracks,
      flyingAudit: flyingAudit(layout, bundle, inventory, contract),
    });
  }
  orientations.sort((left, right) => left.score - right.score);
  const offsetGridScores = [];
  for (const iOffset of [-1, 0, 1]) for (const uOffset of [-1, 0, 1]) {
    for (const vOffset of [-2, 0, 2]) {
      const layout = offsetVariant(base, bundle, inventory, contract,
        iOffset, uOffset, vOffset);
      const {outcomes: _discardedOutcomes, ...result} = evaluateLayoutPolicy({
        layout,
        layouts: bundle,
        data,
        words,
        motor,
        reference,
        shapeKeysByMeaning: FIXED_SHAPE_KEYS_BY_MEANING,
        policy: FIXED_WORD_POLICY,
      });
      offsetGridScores.push({
        ruleOrientation: layout.ruleOrientation,
        offsetRuleAudit: layout.offsetRuleAudit,
        score: result.score,
        tracks: result.tracks,
        flyingAudit: flyingAudit(layout, bundle, inventory, contract),
      });
    }
  }
  offsetGridScores.sort((left, right) => left.score - right.score);
  const report = {
    version: 'ckt-v5.1-toned-2121-weighted-component-audit-1',
    weighting: {
      definition: 'Each CKT track is normalized by its own row weights; occurrences receive track weights character/word2/word3/word4 = 1/3/1/1, then all syllable positions are normalized together.',
      trackWeights: TRACK_WEIGHTS,
      rowCounts: weighted.rowCounts,
      rawTrackWeightTotals: weighted.totals,
      exposureUnits: weighted.exposureUnits,
    },
    fixedEvaluation: {
      shapeKeysByMeaning: FIXED_SHAPE_KEYS_BY_MEANING,
      wordPolicy: FIXED_WORD_POLICY,
    },
    base: {
      id: base.id,
      score: 9.659329215730638,
      ruleOrientation: base.ruleOrientation,
      flyingAudit: flyingAudit(base, bundle, inventory, contract),
    },
    orientationScores: orientations,
    offsetGridScores,
    topTonedSyllables: topTonedSyllables(records, weighted.exposureUnits, 80),
    topTonedSyllablesByIdealSeparationGain:
      topTonedSyllablesByGain(records, weighted.exposureUnits, 80),
    familyRankings: {
      shengjie: separationPotential(records, 'shengjie', weighted.exposureUnits),
      initial: separationPotential(records, 'initial', weighted.exposureUnits),
      medial: separationPotential(records, record => record.medial || '_', weighted.exposureUnits),
      rhymeBody: separationPotential(records, 'rhymeBody', weighted.exposureUnits),
      fullFinal: separationPotential(records, 'fullFinal', weighted.exposureUnits),
      medialRhymeBody: separationPotential(records,
        record => `${record.medial || '_'}+${record.rhymeBody}`, weighted.exposureUnits),
    },
    relocationProxy: {
      definition: 'Exact weighted toned-syllable top-1 change after moving one whole family to the stated destination; no-flying is preserved, but motor and word-code competition are not modeled.',
      shengjieToFirstKey: relocationRanking(records, 'shengjie', 'first', contract,
        base, weighted.exposureUnits),
      initialToFirstKey: relocationRanking(records, 'initial', 'first', contract,
        base, weighted.exposureUnits),
      fullFinalToSecondColumn: relocationRanking(records, 'fullFinal', 'second', contract,
        base, weighted.exposureUnits),
      rhymeBodyToSecondColumn: relocationRanking(records, 'rhymeBody', 'second', contract,
        base, weighted.exposureUnits),
    },
    proxyCaveat: 'idealSeparationGainShare is a collision-only upper proxy: the family is imagined to move without new collisions, while motor cost, word-code competition, and destination feasibility are ignored.',
  };
  const moves = candidateMovesFromProxy(report.relocationProxy, 12);
  report.fullCktSingleMoveAudit = moves.map(move => {
    const layout = familyMoveVariant(base, bundle, inventory, contract, move);
    const {outcomes: _discardedOutcomes, ...result} = evaluateLayoutPolicy({
      layout,
      layouts: bundle,
      data,
      words,
      motor,
      reference,
      shapeKeysByMeaning: FIXED_SHAPE_KEYS_BY_MEANING,
      policy: FIXED_WORD_POLICY,
    });
    const audit = flyingAudit(layout, bundle, inventory, contract);
    if (audit.shengjieFlying.length || audit.tonedFullFinalFlying.length) {
      throw new Error(`family move introduced flying: ${JSON.stringify({move, audit})}`);
    }
    return {
      move,
      score: result.score,
      deltaVsBase: result.score - 9.659329215730638,
      tracks: result.tracks,
      flyingAudit: audit,
    };
  }).sort((left, right) => left.score - right.score);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    output,
    orientationScores: orientations.map(value => ({
      ruleOrientation: value.ruleOrientation,
      score: value.score,
      flying: value.flyingAudit.shengjieFlying.length + value.flyingAudit.tonedFullFinalFlying.length,
    })),
    offsetGridTop: offsetGridScores.slice(0, 12).map(value => ({
      ruleOrientation: value.ruleOrientation,
      score: value.score,
      MRuleEstimate: value.offsetRuleAudit.MRuleEstimate,
      flying: value.flyingAudit.shengjieFlying.length + value.flyingAudit.tonedFullFinalFlying.length,
    })),
    topTonedSyllables: report.topTonedSyllables.slice(0, 20),
    topShengjie: report.familyRankings.shengjie.slice(0, 12),
    topRhymeBodies: report.familyRankings.rhymeBody.slice(0, 12),
    topFullFinals: report.familyRankings.fullFinal.slice(0, 20),
    relocationProxy: {
      shengjie: report.relocationProxy.shengjieToFirstKey.slice(0, 20),
      initial: report.relocationProxy.initialToFirstKey.slice(0, 20),
      fullFinal: report.relocationProxy.fullFinalToSecondColumn.slice(0, 20),
      rhymeBody: report.relocationProxy.rhymeBodyToSecondColumn.slice(0, 20),
    },
    fullCktSingleMoveTop: report.fullCktSingleMoveAudit.slice(0, 30).map(value => ({
      move: value.move,
      score: value.score,
      deltaVsBase: value.deltaVsBase,
    })),
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  buildExposure,
  flyingAudit,
  offsetRuleCount,
  offsetVariant,
  orientationVariant,
  familyMoveVariant,
  relocationRanking,
  separationPotential,
  tokenRecords,
};
