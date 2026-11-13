'use strict';
const {marsFirstAtom, MARS_RHYME_GROUPS} = require('./mars_toned_factorization.js');

// M-T1 is a rule-association lower/guard ledger, not a bound on human learning
// time. Derive every term from codes; W/Y moves and tone-row merges are explicit.
function tonedMemoryAudit(native, pinyin, decomposition) {
  const splits = new Map(decomposition.map(row => [row.pinyin, row]));
  const declaredGroups = native.publication?.rhymeGroups || MARS_RHYME_GROUPS;
  const groupForFinal = new Map(declaredGroups.flatMap((group,index) => group.finals.map(final => [final,index])));
  const atoms = new Map(), roots = new Map(), groups = new Map();
  const rowsByTone = native.publication?.toneRowsByTone || {1:2,2:1,3:1,4:0,5:2};
  for (let py = 0; py < pinyin.length; py++) for (let tone = 1; tone <= 5; tone++) {
    const code = native.tonedCodes[py]?.[tone - 1];if (!code) continue;
    const atom = marsFirstAtom(pinyin[py]);
    if (!atoms.has(atom)) atoms.set(atom, new Set());atoms.get(atom).add(code[0]);
    const split = splits.get(pinyin[py]);if (!split) throw new Error('Missing decomposition: ' + pinyin[py]);
    const root = split.rhymeBody === '_' ? split.fullFinal : split.rhymeBody;
    const group = groupForFinal.get(split.fullFinal);
    if (group == null) throw new Error('Uncovered final: ' + split.fullFinal);
    if (roots.has(root) && roots.get(root) !== group) throw new Error('Root split between groups: ' + root);
    roots.set(root, group);
    if (!groups.has(group)) groups.set(group, {roots:[], regions:Array.from({length:3}, () => new Set())});
    groups.get(group).regions[rowsByTone[tone]].add(code[1]);
  }
  for (const [name, keys] of atoms) if (keys.size !== 1) throw new Error('Non-atomic onset: ' + name);
  for (const [root, group] of roots) groups.get(group).roots.push(root);
  const groupList = [...groups.values()].map(({roots,regions}) => {
    if (regions.some(keys => keys.size !== 1)) throw new Error('Group splits across a tone region: ' + roots.join('/'));
    return {roots:roots.sort(),keys:regions.map(keys => [...keys][0])};
  });
  const ordinaryMoves = [...atoms].filter(([name, keys]) => /^[bpmfdtnlgkhjqxrzcs]$/.test(name) && !keys.has(name.toUpperCase()))
    .map(([name, keys]) => ({name, key:[...keys][0]}));
  const carrierMoves = ['W','Y'].filter(carrier => atoms.has('zero-' + carrier) && !atoms.get('zero-' + carrier).has(carrier))
    .map(carrier => ({name:'zero-' + carrier, key:[...atoms.get('zero-' + carrier)][0]}));
  const zeroCarriers = new Set(['A','E','O'].flatMap(carrier => [...(atoms.get('zero-' + carrier) || [])]));
  const retroflexRules = ['zh','ch','sh'].filter(name => atoms.has(name)).length;
  const regionMerges = [0,1,2].map(row => ({row, groups:groupList.length,
    usedKeys:[...new Set(groupList.map(group => group.keys[row]))],
    links:groupList.length - new Set(groupList.map(group => group.keys[row])).size}));
  const rules = groupList.filter(group => group.roots.length > 1).length;
  const links = groupList.reduce((sum, group) => sum + group.roots.length - 1, 0);
  const common = retroflexRules + zeroCarriers.size + ordinaryMoves.length + carrierMoves.length + 1 +
    regionMerges.reduce((sum, row) => sum + row.links, 0);
  return {definition:'M-T1: onset/zero-carrier associations + one head-deletion rule + multi-root group rules (lower) or links (guard) + tone-region merge links',
    lower:common + rules, guard:common + links, upper:common + links, D:ordinaryMoves.length, F:0,
    audit:{version:'M-T1-derived-v1',retroflexRules,zeroCarrierRules:zeroCarriers.size,ordinaryMoves,carrierMoves,
      headDeletionRules:1,sourceRhymeColumnMergeRules:rules,sourceRhymeColumnMergeLinks:links,
      toneRegionMergeLower:regionMerges.reduce((sum,row)=>sum+row.links,0),regionMerges,groups:groupList,
      scope:'compressed-rule lower / conservative association-link upper within the stated Mars-root model; no independent tone auxiliary; not an empirical learning bound'}};
}
module.exports = {tonedMemoryAudit};
