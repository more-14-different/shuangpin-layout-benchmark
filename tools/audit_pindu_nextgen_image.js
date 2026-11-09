#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const IMAGE_ID = 'we-cut-v4.3.1-v411we43-round1-r16';
const IMAGE_REPORTED_MEMORY = 36.1221;

// Bold upper labels transcribed from the supplied image. Everything else is
// reconstructed by the declared defaults below and must remain marked inferred.
const IMAGE_FIRST_EXCEPTIONS = Object.freeze({
  ni: 'W',
  su: 'W',
  gu: 'E',
  jv: 'E',
  mi: 'E',
  du: 'Y',
  bi: 'A',
  hu: 'A',
  zu: 'F',
  li: 'G',
});

const ZERO_FIRST_DEFAULTS = Object.freeze({
  _: 'O',
  _i: 'I',
  _u: 'U',
  _v: 'V',
});

// The image uses four disjoint tone regions. Neutral tone follows tone 1,
// consistent with the public Pindu description; this is not copied into the
// 3x7 project as a proposed tone layout.
const IMAGE_RHYME_TONE_KEYS = Object.freeze({
  1: Object.freeze({
    _: 'J', a: 'W', ai: 'J', an: 'H', ang: 'K', ao: 'K',
    e: 'L', ei: 'K', en: 'L', ong: 'H', ou: 'H',
  }),
  2: Object.freeze({
    _: 'O', a: 'O', ai: 'V', an: 'P', ang: 'P', ao: 'P',
    e: 'P', ei: 'B', en: 'O', ong: 'P', ou: 'O',
  }),
  3: Object.freeze({
    _: 'N', a: 'A', ai: 'S', an: 'M', ang: 'G', ao: 'D',
    e: 'F', ei: 'D', en: 'S', ong: 'M', ou: 'F',
  }),
  4: Object.freeze({
    _: 'I', a: 'R', ai: 'T', an: 'Y', ang: 'Y', ao: 'U',
    e: 'U', ei: 'E', en: 'I', ong: 'R', ou: 'E',
  }),
});

const OLD_PINDU_IRREGULAR_FIRST = Object.freeze([
  '_', 'zh', 'ch', 'sh', 'di', 'li', 'gu', 'shu', 'zhu', 'chu', 'jv', 'qv',
]);

const OLD_PINDU_RHYME_KEYS = Object.freeze({
  _: ['O', 'L', 'J', 'K'],
  a: ['S', 'S', 'O', 'X'],
  ai: ['C', 'C', 'C', 'P'],
  an: ['I', 'I', 'F', 'D'],
  ang: ['Y', 'W', 'Y', 'H'],
  ao: ['E', 'E', 'E', 'V'],
  e: ['A', 'U', 'R', 'M'],
  ei: ['Q', 'A', 'Q', 'Z'],
  en: ['N', 'G', 'B', 'P'],
  ong: ['H', 'H', 'H', 'W'],
  ou: ['U', 'U', 'A', 'T'],
});

const KEY_ORDER = 'QWERTYUIOPASDFGHJKLZXCVBNM';
const RHYME_ORDER = Object.freeze(['_', 'a', 'ai', 'an', 'ang', 'ao', 'e',
  'ei', 'en', 'ong', 'ou']);

function normalizeRhymeBody(value) {
  if (value === '_' || value === 'er') return '_';
  if (['n', 'en', 'ng', 'eng'].includes(value)) return 'en';
  if (value === 'o') return 'e';
  return value;
}

function defaultFirstKey(shengjie) {
  if (Object.hasOwn(ZERO_FIRST_DEFAULTS, shengjie)) return ZERO_FIRST_DEFAULTS[shengjie];
  if (shengjie.startsWith('zh')) return 'Z';
  if (shengjie.startsWith('ch')) return 'C';
  if (shengjie.startsWith('sh')) return 'S';
  return shengjie[0].toUpperCase();
}

function imageFirstKey(shengjie) {
  return IMAGE_FIRST_EXCEPTIONS[shengjie] || defaultFirstKey(shengjie);
}

function imageSecondKey(rhymeBody, tone) {
  const normalizedTone = Number(tone) === 5 ? 1 : Number(tone);
  const root = normalizeRhymeBody(rhymeBody);
  return IMAGE_RHYME_TONE_KEYS[normalizedTone]?.[root] || null;
}

function groupByKey(values, keyFor) {
  const result = Object.fromEntries([...KEY_ORDER].map(key => [key, []]));
  for (const value of values) result[keyFor(value)].push(value);
  return result;
}

function mapToneKeysByPhysicalKey() {
  const result = Object.fromEntries([...KEY_ORDER].map(key => [key, []]));
  for (const tone of [1, 2, 3, 4]) for (const rhyme of RHYME_ORDER) {
    result[IMAGE_RHYME_TONE_KEYS[tone][rhyme]].push(`${rhyme}${tone}`);
  }
  return result;
}

function auditTokens(tokenKeys, decomposition) {
  const buckets = new Map();
  const missing = [];
  for (const token of tokenKeys) {
    const match = token.match(/^([a-z]+)([1-5])$/);
    if (!match) throw new Error(`invalid token ${token}`);
    const split = decomposition.get(match[1]);
    if (!split) {
      missing.push({token, reason: 'missing decomposition'});
      continue;
    }
    const first = imageFirstKey(split.shengjie);
    const second = imageSecondKey(split.rhymeBody, Number(match[2]));
    if (!first || !second) {
      missing.push({token, shengjie: split.shengjie, rhymeBody: split.rhymeBody,
        first, second});
      continue;
    }
    const code = first + second;
    if (!buckets.has(code)) buckets.set(code, []);
    buckets.get(code).push(token);
  }
  const collisions = [...buckets].filter(([, tokens]) => tokens.length > 1)
    .map(([code, tokens]) => ({code, tokens}))
    .sort((left, right) => right.tokens.length - left.tokens.length ||
      left.code.localeCompare(right.code));
  return {
    tokenCount: tokenKeys.length,
    encodedTokenCount: tokenKeys.length - missing.length,
    occupiedBuckets: buckets.size,
    collisionExcess: tokenKeys.length - missing.length - buckets.size,
    collisionBucketCount: collisions.length,
    missing,
    largestCollisionBuckets: collisions.slice(0, 30),
  };
}

function buildReport(inventory) {
  const decomposition = new Map(inventory.decomposition.map(value => [value.pinyin, value]));
  const shengjie = [...new Set(inventory.decomposition.map(value => value.shengjie))].sort();
  const rhymeBodies = [...new Set(inventory.decomposition.map(value => value.rhymeBody))].sort();
  const rhymeNormalization = Object.fromEntries(RHYME_ORDER.map(root => [root,
    rhymeBodies.filter(value => normalizeRhymeBody(value) === root)]));
  const pairBuckets = new Map();
  for (const value of inventory.decomposition) {
    const signature = `${value.shengjie}|${normalizeRhymeBody(value.rhymeBody)}`;
    if (!pairBuckets.has(signature)) pairBuckets.set(signature, []);
    pairBuckets.get(signature).push(value.pinyin);
  }
  const normalizedPairCollisions = [...pairBuckets]
    .filter(([, pinyin]) => pinyin.length > 1)
    .map(([signature, pinyin]) => ({signature, pinyin}));
  const toneKeyGroups = mapToneKeysByPhysicalKey();
  const occupiedToneKeys = Object.values(toneKeyGroups).filter(values => values.length > 0);
  const toneRegions = Object.fromEntries([1, 2, 3, 4].map(tone => [tone,
    [...new Set(RHYME_ORDER.map(root => IMAGE_RHYME_TONE_KEYS[tone][root]))]]));
  const oldRhymeAssociationCount = Object.values(OLD_PINDU_RHYME_KEYS)
    .reduce((sum, keys) => sum + new Set(keys).size, 0);
  const newLegacyStyleRhymeAssociationCount = RHYME_ORDER.reduce((sum, root) =>
    sum + new Set([1, 2, 3, 4].map(tone => IMAGE_RHYME_TONE_KEYS[tone][root])).size, 0);
  const visibleFirstExceptionCount = Object.keys(IMAGE_FIRST_EXCEPTIONS).length;
  const toneKeyChunkCount = occupiedToneKeys.length;
  return {
    version: 'pindu-nextgen-image-factorization-audit-1',
    source: {
      imageId: IMAGE_ID,
      reportedMemory: IMAGE_REPORTED_MEMORY,
      publicPinduRepository: {
        path: 'D:/C2D/Desktop/Code/Lua/inputMethod/rime-pindu-double-pinyin',
        upstream: 'https://github.com/zhanghaozhecn/rime-pindu-double-pinyin',
        auditedCommit: '25393c170457329861c54537a3592acda5bb3f5d',
        nextGenerationSourceAvailability: 'not present in the sole public upstream branch',
      },
    },
    inferenceBoundary: {
      directFromImage: [
        'ten bold first-component exceptions and their physical keys',
        'all 44 normalized-rhyme x lexical-tone second-key placements',
        'four disjoint tone regions',
      ],
      inferredFromPublicPinduRules: [
        'all non-exception medial variants follow their bare initial',
        'zh/ch/sh merge to z/c/s respectively',
        'zero families _, _i, _u, _v use O, I, U, V',
        'neutral tone follows tone 1',
        'rhyme merges er/empty, n/en/ng/eng, and o/e',
      ],
      unresolved: [
        'the exact formula that turns the displayed grouping into memory 36.1221',
        'whether the unpublished optimizer has additional hidden fixed rules',
      ],
    },
    first: {
      rawShengjieCount: shengjie.length,
      visibleExceptionCount: visibleFirstExceptionCount,
      visibleExceptions: IMAGE_FIRST_EXCEPTIONS,
      defaults: {
        ordinary: 'same bare initial key',
        retroflex: 'zh/ch/sh -> Z/C/S',
        zeroFamilies: ZERO_FIRST_DEFAULTS,
      },
      shengjieToKey: Object.fromEntries(shengjie.map(value => [value, imageFirstKey(value)])),
      keyToShengjie: groupByKey(shengjie, imageFirstKey),
    },
    second: {
      rawRhymeBodyCount: rhymeBodies.length,
      normalizedRhymeCount: RHYME_ORDER.length,
      rhymeNormalization,
      normalizedRhymeToneAssociationCount: RHYME_ORDER.length * 4,
      normalizedRhymeToneKeys: IMAGE_RHYME_TONE_KEYS,
      toneRegions,
      toneRegionsDisjoint: new Set(Object.values(toneRegions).flat()).size ===
        Object.values(toneRegions).flat().length,
      occupiedSecondKeyChunkCount: toneKeyChunkCount,
      keyToRhymeTones: toneKeyGroups,
    },
    factorization: {
      commonPinyinCount: inventory.decomposition.length,
      rawFactorProduct: shengjie.length * rhymeBodies.length,
      normalizedFactorProduct: shengjie.length * RHYME_ORDER.length,
      distinctNormalizedFactorSignatures: pairBuckets.size,
      normalizedFactorCollisionPairCount: normalizedPairCollisions.length,
      normalizedFactorCollisions: normalizedPairCollisions,
    },
    memoryAudit: {
      oldPublicPindu: {
        visibleFirstExceptions: OLD_PINDU_IRREGULAR_FIRST.length,
        perRhymeDistinctToneKeyAssociations: oldRhymeAssociationCount,
        total: OLD_PINDU_IRREGULAR_FIRST.length + oldRhymeAssociationCount,
        matchesPublished45: OLD_PINDU_IRREGULAR_FIRST.length + oldRhymeAssociationCount === 45,
      },
      imageUnderOldCountingRule: {
        visibleFirstExceptions: visibleFirstExceptionCount,
        perRhymeDistinctToneKeyAssociations: newLegacyStyleRhymeAssociationCount,
        total: visibleFirstExceptionCount + newLegacyStyleRhymeAssociationCount,
        conclusion: 'does not reproduce 36.1221; the image uses a different grouped/weighted memory model',
      },
      imageChunkLowerDescription: {
        visibleFirstExceptions: visibleFirstExceptionCount,
        occupiedRhymeToneKeyChunks: toneKeyChunkCount,
        baseChunks: visibleFirstExceptionCount + toneKeyChunkCount,
        residualToReportedMemory: IMAGE_REPORTED_MEMORY -
          visibleFirstExceptionCount - toneKeyChunkCount,
        status: 'algebraic decomposition and strong inference, not the unpublished formula',
      },
    },
    tokenAudits: {
      commonCharacterToned: auditTokens(inventory.auditTokenKeys, decomposition),
      extendedLayoutToned: auditTokens(inventory.layoutTokenKeys, decomposition),
    },
  };
}

function main() {
  const root = path.resolve(__dirname, '..');
  const input = path.resolve(process.argv[2] ||
    path.join(root, 'research/config/ckt-v51-toned-2121-seeds.json'));
  const output = path.resolve(process.argv[3] ||
    path.join(root, 'research/notes/2026-11-09-pindu-nextgen-image-factorization-audit.json'));
  const inventory = JSON.parse(fs.readFileSync(input, 'utf8'));
  const report = buildReport(inventory);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    output,
    first: {
      raw: report.first.rawShengjieCount,
      exceptions: report.first.visibleExceptionCount,
    },
    second: {
      raw: report.second.rawRhymeBodyCount,
      normalized: report.second.normalizedRhymeCount,
      toneAssociations: report.second.normalizedRhymeToneAssociationCount,
      occupiedKeyChunks: report.second.occupiedSecondKeyChunkCount,
    },
    memoryAudit: report.memoryAudit,
    factorization: report.factorization,
    commonTonedAudit: report.tokenAudits.commonCharacterToned,
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  IMAGE_FIRST_EXCEPTIONS,
  IMAGE_RHYME_TONE_KEYS,
  OLD_PINDU_IRREGULAR_FIRST,
  OLD_PINDU_RHYME_KEYS,
  RHYME_ORDER,
  ZERO_FIRST_DEFAULTS,
  buildReport,
  defaultFirstKey,
  imageFirstKey,
  imageSecondKey,
  normalizeRhymeBody,
};
