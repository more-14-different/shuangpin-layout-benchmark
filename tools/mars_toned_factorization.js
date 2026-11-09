'use strict';

// Transcribed from macroxue/shuangpin mars火星/mars.schema.yaml at
// cd74b9505c6b4bf905466d6f7ecb6bcf10ab5caf. The upstream scheme has ten
// physical rhyme columns. Compound finals discard their i/u/v head first;
// several resulting roots then share a source column.
const MARS_RHYME_GROUPS = Object.freeze([
  Object.freeze({id: 'a-ou', finals: Object.freeze(['a', 'ia', 'ua', 'ou', 'iou'])}),
  Object.freeze({id: 'en-n', finals: Object.freeze(['en', 'in', 'uen', 'vn'])}),
  Object.freeze({id: 'e-ei', finals: Object.freeze(['e', 'ie', 've', 'ei', 'uei'])}),
  Object.freeze({id: 'eng-ai-v', finals: Object.freeze(
    ['eng', 'ing', 'ueng', 'v', 'ai', 'uai'])}),
  Object.freeze({id: 'an', finals: Object.freeze(['an', 'ian', 'uan', 'van'])}),
  Object.freeze({id: 'ang', finals: Object.freeze(['ang', 'iang', 'uang'])}),
  Object.freeze({id: 'u', finals: Object.freeze(['u'])}),
  Object.freeze({id: 'i-er', finals: Object.freeze(['i', 'er'])}),
  Object.freeze({id: 'o-ong', finals: Object.freeze(['o', 'io', 'uo', 'ong', 'iong'])}),
  Object.freeze({id: 'ao', finals: Object.freeze(['ao', 'iao'])}),
]);

const MARS_RHYME_ORDER = Object.freeze(MARS_RHYME_GROUPS.map(value => value.id));
const FINAL_TO_RHYME = new Map(MARS_RHYME_GROUPS.flatMap((group, index) =>
  group.finals.map(value => [value, index])));
const SINGLE_WRITTEN_INITIALS = new Set([...'bpmfdtnlgkhjqxzcsryw']);

function marsRhymeIndex(fullFinal) {
  const index = FINAL_TO_RHYME.get(fullFinal);
  if (index === undefined) throw new Error(`Mars factorization does not cover final ${fullFinal}`);
  return index;
}

function marsWrittenOnset(pinyin) {
  if (pinyin.startsWith('zh')) return 'zh';
  if (pinyin.startsWith('ch')) return 'ch';
  if (pinyin.startsWith('sh')) return 'sh';
  return SINGLE_WRITTEN_INITIALS.has(pinyin[0]) ? pinyin[0] : '_';
}

// Upstream assigns zero-initial a/o/e to R, sharing the source key with r.
function marsFirstGroup(pinyin) {
  const onset = marsWrittenOnset(pinyin);
  return onset === '_' || onset === 'r' ? 'r/_' : onset;
}

// Low-D AVUIO adaptation: keep every traditional initial on its canonical
// letter. zh/ch/sh share Z/C/S; y and w retain their written keys; zero/r use R.
function lowDFirstKey(group) {
  if (group === 'r/_') return 'R';
  return group[0].toUpperCase();
}

function marsAudit(decomposition) {
  const finals = new Set(decomposition.map(value => value.fullFinal));
  const covered = new Set(MARS_RHYME_GROUPS.flatMap(value => value.finals));
  return {
    sourceColumnCount: MARS_RHYME_GROUPS.length,
    inventoryFinalCount: finals.size,
    missingFinals: [...finals].filter(value => !covered.has(value)).sort(),
    unusedDeclaredFinals: [...covered].filter(value => !finals.has(value)).sort(),
    firstGroups: [...new Set(decomposition.map(value => marsFirstGroup(value.pinyin)))].sort(),
  };
}

module.exports = {
  MARS_RHYME_GROUPS,
  MARS_RHYME_ORDER,
  lowDFirstKey,
  marsAudit,
  marsFirstGroup,
  marsRhymeIndex,
  marsWrittenOnset,
};
